'use strict';

const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let schemaPromise;
let cachedApiKey = String(process.env.QR_API_KEY || '').trim() || null;

function database() {
    if (!sql) throw new Error('DATABASE_URL is not configured. Add your Neon connection string to the deployment environment.');
    return sql;
}

async function ensureSchema() {
    if (schemaPromise) return schemaPromise;
    const query = database();
    schemaPromise = (async () => {
        await query`
            CREATE TABLE IF NOT EXISTS dynamic_codes (
                id TEXT PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                slug VARCHAR(80) NOT NULL UNIQUE,
                destination TEXT NOT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                scans INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_scan_at TIMESTAMPTZ
            )
        `;
        await query`
            CREATE TABLE IF NOT EXISTS scan_events (
                id TEXT PRIMARY KEY,
                code_id TEXT NOT NULL REFERENCES dynamic_codes(id) ON DELETE CASCADE,
                scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                device VARCHAR(20) NOT NULL,
                referrer VARCHAR(300) NOT NULL DEFAULT '',
                language VARCHAR(20) NOT NULL DEFAULT ''
            )
        `;
        await query`
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                key_value TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        await query`CREATE INDEX IF NOT EXISTS scan_events_code_id_idx ON scan_events (code_id)`;
        await query`CREATE INDEX IF NOT EXISTS scan_events_scanned_at_idx ON scan_events (scanned_at DESC)`;
    })().catch(error => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
}

function cleanName(value) {
    return String(value || '').trim().slice(0, 120);
}

function validateDestination(value) {
    try {
        const parsed = new URL(String(value || '').trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        return parsed.toString();
    } catch (error) {
        return null;
    }
}

function slugify(value) {
    const base = String(value || 'qr')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    return base || 'qr';
}

function forwardedValue(req, name) {
    return String(req.headers[name] || '').split(',')[0].trim();
}

function getBaseUrl(req) {
    const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    if (configured) return configured;
    const protocol = forwardedValue(req, 'x-forwarded-proto') || (req.socket && req.socket.encrypted ? 'https' : 'http');
    const host = forwardedValue(req, 'x-forwarded-host') || req.headers.host || 'localhost:3000';
    return `${protocol}://${host}`;
}

function iso(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function publicCode(code, req) {
    return {
        id: code.id,
        name: code.name,
        slug: code.slug,
        shortUrl: `${getBaseUrl(req)}/r/${code.slug}`,
        destination: code.destination,
        active: Boolean(code.active),
        scans: Number(code.scans || 0),
        createdAt: iso(code.created_at || code.createdAt),
        updatedAt: iso(code.updated_at || code.updatedAt),
        lastScanAt: iso(code.last_scan_at || code.lastScanAt)
    };
}

function publicEvent(event, codeName) {
    return {
        id: event.id,
        codeId: event.code_id || event.codeId,
        at: iso(event.scanned_at || event.at),
        device: event.device,
        referrer: event.referrer || '',
        language: event.language || '',
        ...(codeName ? { codeName } : {})
    };
}

function dateKey(value) {
    return iso(value).slice(0, 10);
}

function dailyCounts(events, days = 14) {
    const buckets = new Map();
    const now = new Date();
    for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - index));
        buckets.set(date.toISOString().slice(0, 10), 0);
    }
    events.forEach(event => {
        const key = dateKey(event.scanned_at || event.at);
        if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
    });
    return [...buckets.entries()].map(([date, scans]) => ({ date, scans }));
}

async function getApiKey() {
    await ensureSchema();
    if (cachedApiKey) return cachedApiKey;
    const query = database();
    const generated = crypto.randomBytes(24).toString('hex');
    await query`
        INSERT INTO api_keys (id, key_value)
        VALUES (1, ${generated})
        ON CONFLICT (id) DO NOTHING
    `;
    const rows = await query`SELECT key_value FROM api_keys WHERE id = 1 LIMIT 1`;
    cachedApiKey = rows[0] && rows[0].key_value ? rows[0].key_value : generated;
    return cachedApiKey;
}

function safeEqual(left, right) {
    if (!left || !right) return false;
    const a = Buffer.from(String(left));
    const b = Buffer.from(String(right));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function authorized(req) {
    const key = await getApiKey();
    const headerKey = String(req.headers['x-api-key'] || '');
    const authorization = String(req.headers.authorization || '');
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    return safeEqual(headerKey, key) || safeEqual(bearer, key);
}

async function listCodes() {
    await ensureSchema();
    return database()`
        SELECT id, name, slug, destination, active, scans, created_at, updated_at, last_scan_at
        FROM dynamic_codes
        ORDER BY created_at DESC
    `;
}

async function findCode(idOrSlug) {
    await ensureSchema();
    const rows = await database()`
        SELECT id, name, slug, destination, active, scans, created_at, updated_at, last_scan_at
        FROM dynamic_codes
        WHERE id = ${String(idOrSlug)} OR slug = ${String(idOrSlug)}
        LIMIT 1
    `;
    return rows[0] || null;
}

async function createCode(input = {}) {
    await ensureSchema();
    const destination = validateDestination(input.destination);
    if (!destination) throw new Error('Destination must be a valid http or https URL.');
    const name = cleanName(input.name) || 'Untitled QR';
    const baseSlug = slugify(input.slug || input.name || 'qr');
    const now = new Date().toISOString();
    const query = database();

    for (let suffix = 1; suffix <= 100; suffix += 1) {
        const slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
        const id = crypto.randomUUID();
        try {
            const rows = await query`
                INSERT INTO dynamic_codes (id, name, slug, destination, active, scans, created_at, updated_at)
                VALUES (${id}, ${name}, ${slug}, ${destination}, ${input.active !== false}, 0, ${now}, ${now})
                RETURNING id, name, slug, destination, active, scans, created_at, updated_at, last_scan_at
            `;
            return rows[0];
        } catch (error) {
            if (error && error.code === '23505') continue;
            throw error;
        }
    }
    throw new Error('Could not create a unique short URL.');
}

async function updateCode(code, input = {}) {
    await ensureSchema();
    const name = input.name === undefined ? code.name : (cleanName(input.name) || code.name);
    const destination = input.destination === undefined ? code.destination : validateDestination(input.destination);
    if (!destination) throw new Error('Destination must be a valid http or https URL.');
    const slug = input.slug === undefined ? code.slug : slugify(input.slug);
    const active = input.active === undefined ? Boolean(code.active) : Boolean(input.active);
    const now = new Date().toISOString();
    try {
        const rows = await database()`
            UPDATE dynamic_codes
            SET name = ${name}, destination = ${destination}, slug = ${slug}, active = ${active}, updated_at = ${now}
            WHERE id = ${code.id}
            RETURNING id, name, slug, destination, active, scans, created_at, updated_at, last_scan_at
        `;
        return rows[0] || null;
    } catch (error) {
        if (error && error.code === '23505') throw new Error('That short URL is already in use.');
        throw error;
    }
}

async function deleteCode(code) {
    await ensureSchema();
    await database()`DELETE FROM dynamic_codes WHERE id = ${code.id}`;
}

function deviceType(userAgent) {
    if (/tablet|ipad/i.test(userAgent)) return 'tablet';
    if (/mobile|android|iphone/i.test(userAgent)) return 'mobile';
    return 'desktop';
}

async function recordScan(code, req) {
    await ensureSchema();
    const now = new Date().toISOString();
    const userAgent = String(req.headers['user-agent'] || 'unknown').slice(0, 300);
    const referrer = String(req.headers.referer || '').slice(0, 300);
    const language = String(req.headers['accept-language'] || '').split(',')[0].slice(0, 20);
    const query = database();
    await query`
        INSERT INTO scan_events (id, code_id, scanned_at, device, referrer, language)
        VALUES (${crypto.randomUUID()}, ${code.id}, ${now}, ${deviceType(userAgent)}, ${referrer}, ${language})
    `;
    await query`
        UPDATE dynamic_codes
        SET scans = scans + 1, last_scan_at = ${now}, updated_at = updated_at
        WHERE id = ${code.id}
    `;
}

async function eventsSince(codeId, days) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return database()`
        SELECT id, code_id, scanned_at, device, referrer, language
        FROM scan_events
        WHERE code_id = ${codeId} AND scanned_at >= ${since}
        ORDER BY scanned_at DESC
    `;
}

async function analyticsForCode(code, req) {
    await ensureSchema();
    const events = await eventsSince(code.id, 30);
    return {
        code: publicCode(code, req),
        totalScans: Number(code.scans || 0),
        daily: dailyCounts(events, 30),
        recent: events.slice(0, 20).map(event => publicEvent(event))
    };
}

async function dashboardSummary(req) {
    await ensureSchema();
    const query = database();
    const [codes, recent, totals, dailyEvents] = await Promise.all([
        listCodes(),
        query`
            SELECT se.id, se.code_id, se.scanned_at, se.device, se.referrer, se.language, dc.name AS code_name
            FROM scan_events se
            LEFT JOIN dynamic_codes dc ON dc.id = se.code_id
            ORDER BY se.scanned_at DESC
            LIMIT 20
        `,
        query`SELECT COUNT(*)::int AS count FROM scan_events`,
        query`
            SELECT id, code_id, scanned_at, device, referrer, language
            FROM scan_events
            WHERE scanned_at >= ${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()}
        `
    ]);
    const topCodes = codes
        .slice()
        .sort((a, b) => Number(b.scans || 0) - Number(a.scans || 0))
        .slice(0, 5)
        .map(code => publicCode(code, req));
    return {
        totalCodes: codes.length,
        activeCodes: codes.filter(code => code.active).length,
        totalScans: Number(totals[0] && totals[0].count ? totals[0].count : 0),
        daily: dailyCounts(dailyEvents, 14),
        topCodes,
        recent: recent.map(event => publicEvent(event, event.code_name || 'Deleted QR')),
        codes: codes.map(code => publicCode(code, req))
    };
}

function apiDocumentation(req) {
    const baseUrl = getBaseUrl(req);
    return {
        baseUrl,
        authentication: 'Send the API key using X-API-Key or Authorization: Bearer <key>.',
        endpoints: [
            { method: 'GET', path: '/api/v1/dynamic-codes', description: 'List dynamic QR codes.' },
            { method: 'POST', path: '/api/v1/dynamic-codes', description: 'Create a dynamic QR code with name and destination.' },
            { method: 'PATCH', path: '/api/v1/dynamic-codes/:id', description: 'Update a QR name, destination, slug, or active state.' },
            { method: 'DELETE', path: '/api/v1/dynamic-codes/:id', description: 'Delete a dynamic QR code.' },
            { method: 'GET', path: '/api/v1/dynamic-codes/:id/analytics', description: 'Read daily and recent scan analytics.' },
            { method: 'GET', path: '/r/:slug', description: 'Public redirect endpoint; each visit is counted.' }
        ],
        example: `curl -X POST ${baseUrl}/api/v1/dynamic-codes -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -d '{"name":"Menu","destination":"https://example.com/menu"}'`
    };
}

module.exports = {
    analyticsForCode,
    apiDocumentation,
    authorized,
    createCode,
    dashboardSummary,
    deleteCode,
    ensureSchema,
    findCode,
    getApiKey,
    getBaseUrl,
    listCodes,
    publicCode,
    recordScan,
    updateCode
};
