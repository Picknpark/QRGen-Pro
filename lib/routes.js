'use strict';

const { parseJsonBody, queryParam, run, sendJson, sendText } = require('./http');
const db = require('./db');

async function requireApiKey(req, res) {
    if (await db.authorized(req)) return true;
    sendJson(res, 401, { error: 'Valid API key required.' });
    return false;
}

async function handleHealth(req, res) {
    if (req.method !== 'GET') return sendText(res, 405, 'Method not allowed');
    return sendJson(res, 200, { ok: true, service: 'qr-pro-studio', time: new Date().toISOString() });
}

async function handlePublicApi(req, res) {
    if (req.method !== 'GET') return sendText(res, 405, 'Method not allowed');
    return sendJson(res, 200, db.apiDocumentation(req));
}

async function handleDashboard(req, res) {
    if (req.method !== 'GET') return sendText(res, 405, 'Method not allowed');
    const [summary, apiKey] = await Promise.all([db.dashboardSummary(req), db.getApiKey()]);
    return sendJson(res, 200, { ...summary, apiKey, api: db.apiDocumentation(req) });
}

async function handleSummary(req, res) {
    if (req.method !== 'GET') return sendText(res, 405, 'Method not allowed');
    return sendJson(res, 200, await db.dashboardSummary(req));
}

async function handleCollection(req, res, protectedRoute = false) {
    if (protectedRoute && !(await requireApiKey(req, res))) return;
    if (req.method === 'GET') {
        const codes = await db.listCodes();
        return sendJson(res, 200, { codes: codes.map(code => db.publicCode(code, req)) });
    }
    if (req.method === 'POST') {
        try {
            const code = await db.createCode(await parseJsonBody(req));
            return sendJson(res, 201, { code: db.publicCode(code, req) });
        } catch (error) {
            return sendJson(res, 400, { error: error.message });
        }
    }
    return sendText(res, 405, 'Method not allowed');
}

async function handleItem(req, res, id, protectedRoute = false) {
    if (protectedRoute && !(await requireApiKey(req, res))) return;
    const code = await db.findCode(id);
    if (!code) return sendJson(res, 404, { error: 'Dynamic QR not found.' });
    if (req.method === 'PATCH') {
        try {
            const updated = await db.updateCode(code, await parseJsonBody(req));
            return sendJson(res, 200, { code: db.publicCode(updated, req) });
        } catch (error) {
            return sendJson(res, 400, { error: error.message });
        }
    }
    if (req.method === 'DELETE') {
        await db.deleteCode(code);
        return sendJson(res, 200, { ok: true });
    }
    return sendText(res, 405, 'Method not allowed');
}

async function handleAnalytics(req, res, id, protectedRoute = false) {
    if (protectedRoute && !(await requireApiKey(req, res))) return;
    if (req.method !== 'GET') return sendText(res, 405, 'Method not allowed');
    const code = await db.findCode(id);
    if (!code) return sendJson(res, 404, { error: 'Dynamic QR not found.' });
    return sendJson(res, 200, await db.analyticsForCode(code, req));
}

async function handleRedirect(req, res) {
    if (!['GET', 'HEAD'].includes(req.method)) return sendText(res, 405, 'Method not allowed');
    const slug = queryParam(req, 'slug');
    const code = await db.findCode(slug);
    if (!code) return sendText(res, 404, 'Dynamic QR not found');
    if (!code.active) return sendText(res, 410, 'Dynamic QR is inactive');
    await db.recordScan(code, req);
    res.statusCode = 302;
    res.setHeader('Location', code.destination);
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
}

module.exports = {
    handleAnalytics,
    handleCollection,
    handleDashboard,
    handleHealth,
    handleItem,
    handlePublicApi,
    handleRedirect,
    handleSummary,
    run
};
