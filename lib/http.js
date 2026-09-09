'use strict';

const MAX_BODY = 1024 * 1024;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
};

function setCors(res) {
    Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
}

function sendJson(res, status, payload) {
    if (!res.headersSent) {
        setCors(res);
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
    }
    res.end(JSON.stringify(payload));
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
    if (!res.headersSent) {
        setCors(res);
        res.statusCode = status;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-store');
    }
    res.end(body);
}

function queryParam(req, name) {
    const value = req.query && req.query[name];
    if (Array.isArray(value)) return value[0];
    return value === undefined ? '' : String(value);
}

function parseJsonBody(req) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    if (Buffer.isBuffer(req.body)) req.body = req.body.toString('utf8');
    if (typeof req.body === 'string') {
        try { return Promise.resolve(req.body.trim() ? JSON.parse(req.body) : {}); } catch (error) { return Promise.reject(new Error('Request body must be valid JSON.')); }
    }
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

async function run(req, res, handler) {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }
    try {
        return await handler();
    } catch (error) {
        console.error(error);
        return sendJson(res, 500, { error: 'Internal server error.' });
    }
}

module.exports = {
    parseJsonBody,
    queryParam,
    run,
    sendJson,
    sendText
};
