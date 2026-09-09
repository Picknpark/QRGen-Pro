const CACHE_NAME = 'qr-pro-studio-v2';
const APP_SHELL = [
    './',
    './index.html',
    './sw.js',
    './manifest.webmanifest',
    './assets/js/app.js',
    './assets/js/tailwind.config.js',
    './assets/icon-192.png',
    './assets/icon-512.png'
];
const EXTERNAL_ASSETS = [
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all([
                ...APP_SHELL.map(url => cache.add(url).catch(() => null)),
                ...EXTERNAL_ASSETS.map(url => fetch(url, { mode: 'no-cors' }).then(response => cache.put(url, response)).catch(() => null))
            ]))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const request = event.request;
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/r/')) return;
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
                if (response.ok || response.type === 'opaque') {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
                }
                return response;
            }).catch(() => request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
        })
    );
});
