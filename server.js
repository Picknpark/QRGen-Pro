'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_BODY = 1024 * 1024;

function createEmptyDb() {
    return {
        apiKey: crypto.randomBytes(24).toString('hex'),
        codes: [],
        events: []
    };
}

function loadDb() {
    try {
        const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const fresh = createEmptyDb();
        return {
            ...fresh,
            ...loaded,
            apiKey: loaded.apiKey || fresh.apiKey,
            codes: Array.isArray(loaded.codes) ? loaded.codes : [],
            events: Array.isArray(loaded.events) ? loaded.events : []
        };
    } catch (error) {
        return createEmptyDb();
    }
}

let db = loadDb();
fs.mkdirSync(DATA_DIR, { recursive: true });

function saveDb() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

if (!fs.existsSync(DB_FILE)) saveDb();

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
};

function getBaseUrl(req) {
    const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProtocol || (req.socket.encrypted ? 'https' : 'http');
    return `${protocol}://${req.headers.host || `localhost:${PORT}`}`;
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
    res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': contentType });
    res.end(body);
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > MAX_BODY) {
                reject(new Error('Request body is too large.'));
                req.destroy();
            }
        });
        req.on('end', () => {
            if (!body.trim()) return resolve({});
            try { resolve(JSON.parse(body)); } catch (error) { reject(new Error('Request body must be valid JSON.')); }
        });
        req.on('error', reject);
    });
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
    const base = String(value || 'qr').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return base || 'qr';
}

function makeUniqueSlug(requested, ignoreId = '') {
    const base = slugify(requested);
    let slug = base;
    let suffix = 2;
    while (db.codes.some(code => code.slug === slug && code.id !== ignoreId)) slug = `${base}-${suffix++}`;
    return slug;
}

function publicCode(code, req) {
    return {
        id: code.id,
        name: code.name,
        slug: code.slug,
        shortUrl: `${getBaseUrl(req)}/r/${code.slug}`,
        destination: code.destination,
        active: code.active,
        scans: code.scans || 0,
        createdAt: code.createdAt,
        updatedAt: code.updatedAt,
        lastScanAt: code.lastScanAt || null
    };
}

function createCode(input, req) {
    const destination = validateDestination(input.destination);
    if (!destination) throw new Error('Destination must be a valid http or https URL.');
    const now = new Date().toISOString();
    const code = {
        id: crypto.randomUUID(),
        name: cleanName(input.name) || 'Untitled QR',
        slug: makeUniqueSlug(input.slug || input.name || 'qr'),
        destination,
        active: input.active !== false,
        scans: 0,
        createdAt: now,
        updatedAt: now,
        lastScanAt: null
    };
    db.codes.push(code);
    saveDb();
    return publicCode(code, req);
}

function findCode(idOrSlug) {
    return db.codes.find(code => code.id === idOrSlug || code.slug === idOrSlug);
}

function updateCode(code, input, req) {
    if (input.name !== undefined) code.name = cleanName(input.name) || code.name;
    if (input.destination !== undefined) {
        const destination = validateDestination(input.destination);
        if (!destination) throw new Error('Destination must be a valid http or https URL.');
        code.destination = destination;
    }
    if (input.slug !== undefined) code.slug = makeUniqueSlug(input.slug, code.id);
    if (input.active !== undefined) code.active = Boolean(input.active);
    code.updatedAt = new Date().toISOString();
    saveDb();
    return publicCode(code, req);
}

function deviceType(userAgent) {
    if (/tablet|ipad/i.test(userAgent)) return 'tablet';
    if (/mobile|android|iphone/i.test(userAgent)) return 'mobile';
    return 'desktop';
}

function addScan(code, req) {
    const now = new Date().toISOString();
    const userAgent = String(req.headers['user-agent'] || 'unknown').slice(0, 300);
    db.events.push({
        id: crypto.randomUUID(),
        codeId: code.id,
        at: now,
        device: deviceType(userAgent),
        referrer: String(req.headers.referer || '').slice(0, 300),
        language: String(req.headers['accept-language'] || '').split(',')[0].slice(0, 20)
    });
    code.scans = (code.scans || 0) + 1;
    code.lastScanAt = now;
    if (db.events.length > 10000) db.events.splice(0, db.events.length - 10000);
    saveDb();
}

function dateKey(date) {
    return new Date(date).toISOString().slice(0, 10);
}

function dailyCounts(events, days = 14) {
    const output = [];
    const now = new Date();
    for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - index));
        const key = date.toISOString().slice(0, 10);
        output.push({ date: key, scans: events.filter(event => dateKey(event.at) === key).length });
    }
    return output;
}

function analyticsForCode(code, req) {
    const events = db.events.filter(event => event.codeId === code.id).sort((a, b) => b.at.localeCompare(a.at));
    return {
        code: publicCode(code, req),
        totalScans: events.length,
        daily: dailyCounts(events, 30),
        recent: events.slice(0, 20)
    };
}

function dashboardSummary(req) {
    const events = db.events.slice().sort((a, b) => b.at.localeCompare(a.at));
    const topCodes = db.codes.slice().sort((a, b) => (b.scans || 0) - (a.scans || 0)).slice(0, 5).map(code => publicCode(code, req));
    return {
        totalCodes: db.codes.length,
        activeCodes: db.codes.filter(code => code.active).length,
        totalScans: events.length,
        daily: dailyCounts(events, 14),
        topCodes,
        recent: events.slice(0, 20).map(event => ({
            ...event,
            codeName: db.codes.find(code => code.id === event.codeId)?.name || 'Deleted QR'
        }))
    };
}

function authorized(req) {
    const headerKey = String(req.headers['x-api-key'] || '');
    const authorization = String(req.headers.authorization || '');
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    return headerKey === db.apiKey || bearer === db.apiKey;
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

function contentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
    }[extension] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
    let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let filePath;
    try { filePath = path.resolve(ROOT, decodeURIComponent(relative)); } catch (error) { return sendText(res, 400, 'Bad path'); }
    if (!filePath.startsWith(ROOT)) return sendText(res, 403, 'Forbidden');
    fs.stat(filePath, (statError, stat) => {
        if (statError || !stat.isFile()) return sendText(res, 404, 'Not found');
        res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': pathname === '/' ? 'no-cache' : 'public, max-age=3600' });
        fs.createReadStream(filePath).pipe(res);
    });
}

async function handleRequest(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = requestUrl.pathname;
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); return res.end(); }

    if (pathname.startsWith('/r/')) {
        const code = findCode(pathname.slice(3));
        if (!code) return sendText(res, 404, 'Dynamic QR not found');
        if (!code.active) return sendText(res, 410, 'Dynamic QR is inactive');
        addScan(code, req);
        res.writeHead(302, { Location: code.destination, 'Cache-Control': 'no-store' });
        return res.end();
    }

    if (pathname === '/api/health') return sendJson(res, 200, { ok: true, service: 'qr-pro-studio', time: new Date().toISOString() });
    if (pathname === '/api/public-api' || pathname === '/api/v1') return sendJson(res, 200, apiDocumentation(req));
    if (pathname === '/api/dashboard' && req.method === 'GET') {
        return sendJson(res, 200, { ...dashboardSummary(req), codes: db.codes.map(code => publicCode(code, req)), apiKey: db.apiKey, api: apiDocumentation(req) });
    }
    if (pathname === '/api/analytics/summary' && req.method === 'GET') return sendJson(res, 200, dashboardSummary(req));

    const versioned = pathname.startsWith('/api/v1/');
    if (versioned && !authorized(req)) return sendJson(res, 401, { error: 'Valid API key required.' });
    if (pathname.startsWith('/api/')) {
        const match = pathname.match(/^\/api\/(?:v1\/)?dynamic-codes(?:\/([^/]+))?(?:\/analytics)?$/);
        if (match) {
            const identifier = match[1];
            const analytics = pathname.endsWith('/analytics');
            if (!identifier && req.method === 'GET') return sendJson(res, 200, { codes: db.codes.map(code => publicCode(code, req)) });
            if (!identifier && req.method === 'POST') {
                try { return sendJson(res, 201, { code: createCode(await parseJsonBody(req), req) }); } catch (error) { return sendJson(res, 400, { error: error.message }); }
            }
            const code = findCode(identifier);
            if (!code) return sendJson(res, 404, { error: 'Dynamic QR not found.' });
            if (analytics && req.method === 'GET') return sendJson(res, 200, analyticsForCode(code, req));
            if (req.method === 'PATCH') {
                try { return sendJson(res, 200, { code: updateCode(code, await parseJsonBody(req), req) }); } catch (error) { return sendJson(res, 400, { error: error.message }); }
            }
            if (req.method === 'DELETE') {
                db.codes = db.codes.filter(item => item.id !== code.id);
                db.events = db.events.filter(event => event.codeId !== code.id);
                saveDb();
                return sendJson(res, 200, { ok: true });
            }
        }
        return sendJson(res, 404, { error: 'API endpoint not found.' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
    return serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(error => {
        console.error(error);
        if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error.' });
        else res.end();
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`QR Pro Studio running on http://0.0.0.0:${PORT}`);
});
