/* ==========================================================================
   PRODUCTION QR GENERATOR CORE JS ENGINE
   ========================================================================== */

// Default state is kept separate so reset and settings import stay in sync.
const DEFAULT_STATE = {
    dataType: 'url', dataValues: {}, size: 2, sizeUnit: 'inch', dpi: 600, ecc: 'H',
    margin: 0.2, marginUnit: 'inch', moduleStyle: 'square', eyeFrameStyle: 'square',
    eyeballStyle: 'square', fgColor: '#000000', bgColor: '#FFFFFF', transparentBg: false,
    useGradient: false, gradientType: 'linear', gradEndColor: '#2563eb', gradAngle: 45,
    frameStyle: 'none', frameBorderWidth: 4, frameColor: '#1e293b', frameTopText: '',
    frameBottomText: '', logoDataUrl: null, logoIsSvg: false, logoSvgRaw: null,
    logoSize: 15, logoPadding: 4, logoBgMask: true, theme: 'light'
};
const state = { ...DEFAULT_STATE, dataValues: {} };
let validationRequested = false;
let batchItems = [];

// Session Identifiers (Mandatory session rules)
let SESSION_ID = Math.floor(1000 + Math.random() * 9000).toString();
const NOW = new Date();
const DD = String(NOW.getDate()).padStart(2, '0');
const MM = String(NOW.getMonth() + 1).padStart(2, '0');
const YY = String(NOW.getFullYear()).slice(-2);
const DATE_STR = `${DD}${MM}${YY}`;

// Regenerate Session ID on Reset
function regenerateSessionId() {
    SESSION_ID = Math.floor(1000 + Math.random() * 9000).toString();
    const sessionDisplay = document.getElementById('session-id-display');
    if (sessionDisplay) {
        sessionDisplay.innerText = SESSION_ID;
    }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function normalizeColor(value, fallback) {
    let color = String(value ?? '').trim();
    if (!color.startsWith('#')) color = `#${color}`;
    if (/^#[\da-f]{3}$/i.test(color)) {
        color = `#${[...color.slice(1)].map(char => char + char).join('')}`;
    }
    return /^#[\da-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
}

function encodeBase64(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
}

// Unit conversions use safe, positive values so malformed imports cannot create negative SVG geometry.
function convertToPixels(val, unit, dpi) {
    const num = Math.max(0, numberOr(val, 0));
    const safeDpi = Math.max(1, numberOr(dpi, DEFAULT_STATE.dpi));
    switch (unit) {
        case 'inch': return num * safeDpi;
        case 'cm': return (num / 2.54) * safeDpi;
        case 'mm': return (num / 25.4) * safeDpi;
        case 'px': return num;
        default: return num * safeDpi;
    }
}

function convertToInches(val, unit) {
    const num = Math.max(0, numberOr(val, 0));
    switch (unit) {
        case 'inch': return num;
        case 'cm': return num / 2.54;
        case 'mm': return num / 25.4;
        case 'px': return num / Math.max(1, state.dpi);
        default: return num;
    }
}

// Format Filename as required: QR_<DataTypeName>_<ddmmyy>_<XXXX>.<ext>
function getExportFilename(ext) {
    const typeStr = state.dataType.toUpperCase();
    return `QR_${typeStr}_${DATE_STR}_${SESSION_ID}.${ext}`;
}

// Dynamic Fields Definition for Data Types
const DATA_TYPE_FIELDS = {
    url: [
        { id: 'url', label: 'Website URL', type: 'url', placeholder: 'https://example.com' }
    ],
    text: [
        { id: 'text', label: 'Plain Text', type: 'textarea', placeholder: 'Enter your message or text content here...' }
    ],
    wifi: [
        { id: 'ssid', label: 'Network Name (SSID)', type: 'text', placeholder: 'MyHomeWiFi' },
        { id: 'password', label: 'Password', type: 'password', placeholder: 'WiFi Password' },
        { id: 'encryption', label: 'Encryption', type: 'select', options: ['WPA', 'WEP', 'nopass'] }
    ],
    vcard: [
        { id: 'fn', label: 'Full Name', type: 'text', placeholder: 'Jane Doe' },
        { id: 'org', label: 'Organization', type: 'text', placeholder: 'Acme Corp' },
        { id: 'title', label: 'Job Title', type: 'text', placeholder: 'Senior Designer' },
        { id: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555 019 2831' },
        { id: 'email', label: 'Email', type: 'email', placeholder: 'jane@example.com' },
        { id: 'url', label: 'Website', type: 'url', placeholder: 'https://example.com' }
    ],
    email: [
        { id: 'email', label: 'Recipient Email', type: 'email', placeholder: 'target@example.com' },
        { id: 'subject', label: 'Subject', type: 'text', placeholder: 'Inquiry regarding services' },
        { id: 'body', label: 'Message Body', type: 'textarea', placeholder: 'Hello...' }
    ],
    phone: [
        { id: 'phone', label: 'Phone Number', type: 'tel', placeholder: '+1 555 019 2831' }
    ],
    sms: [
        { id: 'phone', label: 'Recipient Number', type: 'tel', placeholder: '+1 555 019 2831' },
        { id: 'message', label: 'Message', type: 'textarea', placeholder: 'Text message content...' }
    ],
    whatsapp: [
        { id: 'phone', label: 'WhatsApp Phone (with Country Code)', type: 'tel', placeholder: '15550192831' },
        { id: 'message', label: 'Preset Message (Optional)', type: 'text', placeholder: 'Hello!' }
    ],
    location: [
        { id: 'lat', label: 'Latitude', type: 'text', placeholder: '37.7749' },
        { id: 'lng', label: 'Longitude', type: 'text', placeholder: '-122.4194' }
    ],
    event: [
        { id: 'title', label: 'Event Title', type: 'text', placeholder: 'Annual Tech Summit' },
        { id: 'location', label: 'Event Location', type: 'text', placeholder: 'Convention Center, San Francisco' },
        { id: 'start', label: 'Start Time', type: 'datetime-local' },
        { id: 'end', label: 'End Time', type: 'datetime-local' }
    ],
    crypto: [
        { id: 'coin', label: 'Coin / Token', type: 'select', options: ['bitcoin', 'ethereum', 'solana', 'usdt', 'bnb', 'xrp', 'dogecoin', 'cardano', 'tron', 'staked-ether', 'wrapped-bitcoin', 'chainlink', 'hyperliquid', 'stellar', 'sui', 'bitcoin-cash', 'hedera', 'avalanche-2', 'litecoin', 'leo-token', 'toncoin', 'shiba-inu', 'uniswap', 'polkadot', 'ethena-usde', 'whitebit', 'bitget-token', 'monero', 'pepe', 'aptos', 'near', 'aave', 'dai', 'internet-computer', 'ondo-finance', 'mantle', 'ethereum-classic', 'pi-network', 'official-trump', 'vechain', 'bittensor', 'algorand', 'render-token', 'kaspa', 'cosmos', 'filecoin', 'gatechain-token', 'worldcoin-wld', 'jupiter-exchange-solana', 'sei-network', 'polygon-ecosystem-token', 'arbitrum', 'celestia', 'maker', 'optimism', 'bonk', 'injective-protocol', 'rocket-pool-eth', 'the-graph', 'flare-networks', 'immutable-x', 'fartcoin', 'lido-dao', 'quant-network', 'mantra-dao', 'eos', 'virtual-protocol', 'binance-bridged-usdt-bnb-smart-chain', 'the-open-network', 'cronos', 'pudgy-penguins', 'story-protocol', 'jasmycoin', 'theta-token', 'gala', 'staking', 'flow', 'curve-dao-token', 'kaia', 'pancakeswap-token', 'dogwifcoin', 'ether-fi', 'coredaoorg', 'paypal-usd', 'brett', 'tezos', 'zcash', 'thorchain', 'decentraland', 'sandbox', 'raydium', 'aerodrome-finance', 'helium', 'compound-governance-token', 'eigenlayer', 'spx6900', 'mog-coin', 'beam-2', 'reserve-rights-token', 'pendle', 'axie-infinity'] },
        { id: 'address', label: 'Wallet Address', type: 'text', placeholder: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
        { id: 'amount', label: 'Amount (Optional)', type: 'text', placeholder: '0.05' }
    ],
    social: [
        { id: 'platform', label: 'Platform', type: 'select', options: ['facebook', 'instagram', 'twitter', 'x', 'linkedin', 'youtube', 'tiktok', 'snapchat', 'reddit', 'pinterest', 'tumblr', 'threads', 'discord', 'telegram', 'whatsapp', 'messenger', 'wechat', 'line', 'viber', 'signal', 'kakao-talk', 'qq', 'douyin', 'weibo', 'xiaohongshu', 'vk', 'ok', 'mastodon', 'bluesky', 'truth-social', 'gab', 'parler', 'clubhouse', 'twitch', 'kick', 'rumble', 'odysee', 'bilibili', 'dailymotion', 'vimeo', 'quora', 'medium', 'substack', 'patreon', 'behance', 'dribbble', 'deviantart', 'flickr', 'imgur', 'pixiv', 'vsco', 'bereal', 'yubo', 'meetup', 'nextdoor', 'skype', 'teams', 'slack'] },
        { id: 'handle', label: 'Username or URL', type: 'text', placeholder: 'username' }
    ],
    map: [
        { id: 'mode', label: 'Map Action', type: 'select', options: ['search', 'directions'] },
        { id: 'query', label: 'Place or Address', type: 'text', placeholder: 'Dhaka, Bangladesh' },
        { id: 'travelmode', label: 'Travel Mode', type: 'select', options: ['driving', 'walking', 'bicycling', 'transit'] }
    ],
    payment: [
        { id: 'provider', label: 'Payment Method', type: 'select', options: ['link', 'upi', 'paypal'] },
        { id: 'recipient', label: 'Recipient / Payment ID', type: 'text', placeholder: 'merchant@example or merchant@upi' },
        { id: 'name', label: 'Recipient Name (Optional)', type: 'text', placeholder: 'Example Store' },
        { id: 'amount', label: 'Amount (Optional)', type: 'text', placeholder: '25.00' },
        { id: 'currency', label: 'Currency', type: 'text', placeholder: 'INR' },
        { id: 'note', label: 'Payment Note (Optional)', type: 'text', placeholder: 'Order 1234' },
        { id: 'url', label: 'Payment URL (for Link)', type: 'url', placeholder: 'https://example.com/pay' }
    ],
    app: [
        { id: 'platform', label: 'App Link Type', type: 'select', options: ['universal', 'android', 'ios'] },
        { id: 'url', label: 'App or Download URL', type: 'url', placeholder: 'https://example.com/download' },
        { id: 'label', label: 'App Name (Optional)', type: 'text', placeholder: 'QR Pro Studio' }
    ],
    meeting: [
        { id: 'platform', label: 'Meeting Platform', type: 'select', options: ['google-meet', 'zoom', 'microsoft-teams', 'custom'] },
        { id: 'url', label: 'Meeting URL', type: 'url', placeholder: 'https://meet.google.com/abc-defg-hij' },
        { id: 'title', label: 'Meeting Title (Optional)', type: 'text', placeholder: 'Weekly team meeting' }
    ],
    coupon: [
        { id: 'code', label: 'Coupon Code', type: 'text', placeholder: 'SAVE20' },
        { id: 'title', label: 'Offer Title', type: 'text', placeholder: '20% off your order' },
        { id: 'discount', label: 'Discount (Optional)', type: 'text', placeholder: '20%' },
        { id: 'expires', label: 'Expires (Optional)', type: 'date' },
        { id: 'url', label: 'Redemption URL (Optional)', type: 'url', placeholder: 'https://example.com/redeem' }
    ],
    review: [
        { id: 'platform', label: 'Review Platform', type: 'select', options: ['google', 'facebook', 'yelp', 'tripadvisor', 'custom'] },
        { id: 'url', label: 'Review URL', type: 'url', placeholder: 'https://example.com/review' },
        { id: 'business', label: 'Business Name (Optional)', type: 'text', placeholder: 'Example Store' }
    ],
    raw: [
        { id: 'raw', label: 'Raw Payload String', type: 'textarea', placeholder: 'Raw QR data payload...' }
    ]
};

function getTemplateState(template) {
    const pad = number => String(number).padStart(2, '0');
    const date = new Date();
    const localDateTime = hours => {
        const value = new Date(date.getTime() + hours * 3600000);
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
    };
    const templates = {
        url: { dataType: 'url', dataValues: { url: 'https://example.com' } },
        wifi: { dataType: 'wifi', dataValues: { ssid: 'My WiFi', password: 'change-me', encryption: 'WPA' } },
        vcard: { dataType: 'vcard', dataValues: { fn: 'Jane Doe', org: 'Acme Studio', title: 'Creative Director', phone: '+1 555 010 2026', email: 'jane@example.com', url: 'https://example.com' } },
        event: { dataType: 'event', dataValues: { title: 'Team Event', location: 'Conference Room', start: localDateTime(24), end: localDateTime(26) } },
        email: { dataType: 'email', dataValues: { email: 'support@example.com', subject: 'Support request', body: 'Hello, I need help with...' } },
        social: { dataType: 'social', dataValues: { platform: 'instagram', handle: 'your-brand' } },
        map: { dataType: 'map', dataValues: { mode: 'search', query: 'Dhaka, Bangladesh', travelmode: 'driving' } },
        payment: { dataType: 'payment', dataValues: { provider: 'link', recipient: 'Example Store', url: 'https://example.com/pay' } },
        app: { dataType: 'app', dataValues: { platform: 'universal', url: 'https://example.com/app', label: 'Example App' } },
        meeting: { dataType: 'meeting', dataValues: { platform: 'google-meet', url: 'https://meet.google.com/abc-defg-hij', title: 'Team Meeting' } },
        coupon: { dataType: 'coupon', dataValues: { code: 'SAVE20', title: '20% off your order', discount: '20%', expires: '', url: 'https://example.com/redeem' } },
        review: { dataType: 'review', dataValues: { platform: 'custom', url: 'https://example.com/review', business: 'Example Store' } },
        text: { dataType: 'text', dataValues: { text: 'Replace this sample text with your message.' } }
    };
    return templates[template] || templates.url;
}

function parseCsvText(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const next = text[index + 1];
        if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; }
        else if (character === '"') quoted = !quoted;
        else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
        else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && next === '\n') index += 1;
            row.push(cell); cell = '';
            if (row.some(value => value.trim())) rows.push(row);
            row = [];
        } else cell += character;
    }
    if (cell || row.length) { row.push(cell); if (row.some(value => value.trim())) rows.push(row); }
    if (rows.length < 2) return [];
    const headers = rows.shift().map(header => header.trim());
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function canonicalKey(key) { return String(key).toLowerCase().replace(/[^a-z0-9]/g, ''); }

function normalizeBatchRows(rows) {
    return rows.slice(0, 250).map((row, index) => {
        const source = row && typeof row === 'object' ? row : { value: row };
        const canonical = Object.fromEntries(Object.entries(source).map(([key, value]) => [canonicalKey(key), value]));
        const rawType = asText(canonical.datatype || canonical.type || canonical.kind || 'url').trim().toLowerCase();
        const dataType = DATA_TYPE_FIELDS[rawType] ? rawType : 'raw';
        const values = source.dataValues && typeof source.dataValues === 'object' ? { ...source.dataValues } : {};
        const fields = DATA_TYPE_FIELDS[dataType] || DATA_TYPE_FIELDS.raw;
        fields.forEach(field => {
            const fieldValue = canonical[canonicalKey(field.id)];
            if (fieldValue !== undefined && fieldValue !== '') values[field.id] = fieldValue;
        });
        const directValue = canonical.value ?? canonical.payload ?? canonical.content;
        if (directValue !== undefined && directValue !== '' && !Object.keys(values).length) values[fields[0].id] = directValue;
        if (dataType === 'raw' && directValue !== undefined) values.raw = directValue;
        return { name: asText(canonical.name || canonical.label || `${dataType.toUpperCase()} ${index + 1}`).trim(), dataType, dataValues: values };
    }).filter(item => Object.values(item.dataValues).some(value => asText(value).trim()));
}

function parseBatchText(text, filename = '') {
    const trimmed = String(text).trim();
    if (!trimmed) return [];
    if (/\.json$/i.test(filename) || /^[\[{]/.test(trimmed)) {
        const parsed = JSON.parse(trimmed);
        const rows = Array.isArray(parsed) ? parsed : parsed.items || parsed.records || parsed.data || [parsed];
        return normalizeBatchRows(rows);
    }
    return normalizeBatchRows(parseCsvText(trimmed));
}

function asText(value) { return value == null ? '' : String(value); }
function escapeWifi(value) { return asText(value).replace(/[\\;,:\"]/g, match => `\\${match}`); }
function escapeVCard(value) { return asText(value).replace(/[\\;,]/g, match => `\\${match}`).replace(/\r?\n/g, '\\n'); }
function readThemePreference(fallback = 'light') {
    try { return localStorage.getItem('qr_theme') || fallback; } catch (error) { return fallback; }
}
function writeThemePreference(theme) {
    try { localStorage.setItem('qr_theme', theme); } catch (error) { /* private browsing can disable storage */ }
}
function formatEventDate(value) {
    const digits = asText(value).replace(/\D/g, '');
    return digits.length >= 12 ? `${digits.slice(0, 8)}T${digits.slice(8, 12)}00` : '';
}

// Format the selected data type as a scanner-friendly payload.
function generatePayloadString() {
    const type = state.dataType;
    const vals = state.dataValues || {};
    const value = key => asText(vals[key]);

    switch (type) {
        case 'url': return value('url').trim();
        case 'text': return value('text');
        case 'wifi':
            return value('ssid') ? `WIFI:S:${escapeWifi(value('ssid'))};T:${value('encryption') || 'WPA'};P:${escapeWifi(value('password'))};;` : '';
        case 'vcard':
            return value('fn') ? `BEGIN:VCARD\nVERSION:3.0\nN:${escapeVCard(value('fn'))}\nFN:${escapeVCard(value('fn'))}\nORG:${escapeVCard(value('org'))}\nTITLE:${escapeVCard(value('title'))}\nTEL:${escapeVCard(value('phone'))}\nEMAIL:${escapeVCard(value('email'))}\nURL:${escapeVCard(value('url'))}\nEND:VCARD` : '';
        case 'email':
            return value('email') ? `mailto:${value('email')}?subject=${encodeURIComponent(value('subject'))}&body=${encodeURIComponent(value('body'))}` : '';
        case 'phone': return value('phone') ? `tel:${value('phone').trim()}` : '';
        case 'sms': return value('phone') ? `smsto:${value('phone').trim()}:${value('message')}` : '';
        case 'whatsapp': {
            const phone = value('phone').replace(/\D/g, '');
            return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(value('message'))}` : '';
        }
        case 'location': return value('lat') && value('lng') ? `geo:${value('lat').trim()},${value('lng').trim()}` : '';
        case 'event':
            return value('title') ? `BEGIN:VEVENT\nSUMMARY:${escapeVCard(value('title'))}\nLOCATION:${escapeVCard(value('location'))}\nDTSTART:${formatEventDate(value('start'))}\nDTEND:${formatEventDate(value('end'))}\nEND:VEVENT` : '';
        case 'crypto': {
            if (!value('address')) return '';
            const amount = value('amount') ? `?amount=${encodeURIComponent(value('amount'))}` : '';
            return `${value('coin') || 'bitcoin'}:${value('address')}${amount}`;
        }
        case 'social': {
            const handle = value('handle').trim();
            if (!handle) return '';
            if (/^https?:\/\//i.test(handle)) return handle;
            const platform = value('platform') || 'instagram';
            const paths = {
                facebook: `https://facebook.com/${handle}`, instagram: `https://instagram.com/${handle}`,
                twitter: `https://x.com/${handle}`, x: `https://x.com/${handle}`,
                linkedin: `https://linkedin.com/in/${handle}`, youtube: `https://youtube.com/@${handle}`,
                tiktok: `https://tiktok.com/@${handle}`, snapchat: `https://snapchat.com/add/${handle}`,
                reddit: `https://reddit.com/user/${handle}`, telegram: `https://t.me/${handle}`,
                whatsapp: `https://wa.me/${handle.replace(/\D/g, '')}`,
                threads: `https://threads.net/@${handle}`, pinterest: `https://pinterest.com/${handle}`
            };
            return paths[platform] || `https://${platform}.com/${handle}`;
        }
        case 'map': {
            const query = value('query').trim();
            if (!query) return '';
            const params = new URLSearchParams({ api: '1' });
            if (value('mode') === 'directions') {
                params.set('destination', query);
                params.set('travelmode', value('travelmode') || 'driving');
                return `https://www.google.com/maps/dir/?${params.toString()}`;
            }
            params.set('query', query);
            return `https://www.google.com/maps/search/?${params.toString()}`;
        }
        case 'payment': {
            const provider = value('provider') || 'link';
            if (provider === 'link') return value('url').trim();
            if (!value('recipient').trim()) return '';
            if (provider === 'upi') {
                const params = new URLSearchParams({ pa: value('recipient').trim(), pn: value('name').trim() || value('recipient').trim(), cu: value('currency').trim().toUpperCase() || 'INR' });
                if (value('amount')) params.set('am', value('amount').trim());
                if (value('note')) params.set('tn', value('note').trim());
                return `upi://pay?${params.toString()}`;
            }
            return `https://paypal.me/${encodeURIComponent(value('recipient').trim())}${value('amount') ? `/${encodeURIComponent(value('amount').trim())}` : ''}`;
        }
        case 'app':
        case 'meeting':
        case 'review':
            return value('url').trim();
        case 'coupon': {
            const lines = [
                'COUPON',
                `CODE:${value('code')}`,
                `TITLE:${value('title')}`,
                value('discount') ? `DISCOUNT:${value('discount')}` : '',
                value('expires') ? `EXPIRES:${value('expires')}` : '',
                value('url') ? `URL:${value('url')}` : ''
            ].filter(Boolean);
            return value('code') ? lines.join('\n') : '';
        }
        case 'raw': return value('raw');
        default: return '';
    }
}

function validatePayload() {
    const values = state.dataValues || {};
    const value = key => asText(values[key]).trim();
    const hasInput = Object.values(values).some(item => asText(item).trim());
    const errors = {};
    const required = (key, label) => { if (!value(key)) errors[key] = `${label} is required.`; };
    const validEmail = input => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
    const validUrl = input => {
        try { return ['http:', 'https:'].includes(new URL(input).protocol); } catch (error) { return false; }
    };
    const validPhone = input => input.replace(/\D/g, '').length >= 7;

    switch (state.dataType) {
        case 'url':
            if (value('url') && !validUrl(value('url'))) errors.url = 'Enter a valid http or https URL.';
            break;
        case 'text':
            if (hasInput || validationRequested) required('text', 'Text');
            break;
        case 'wifi':
            if (hasInput) required('ssid', 'Network name');
            if (value('encryption') && !['WPA', 'WEP', 'nopass'].includes(value('encryption'))) errors.encryption = 'Choose a valid encryption type.';
            break;
        case 'vcard':
            if (hasInput) required('fn', 'Full name');
            if (value('email') && !validEmail(value('email'))) errors.email = 'Enter a valid email address.';
            if (value('url') && !validUrl(value('url'))) errors.url = 'Enter a valid http or https URL.';
            break;
        case 'email':
            if (hasInput) required('email', 'Recipient email');
            if (value('email') && !validEmail(value('email'))) errors.email = 'Enter a valid email address.';
            break;
        case 'phone':
            if (hasInput) required('phone', 'Phone number');
            if (value('phone') && !validPhone(value('phone'))) errors.phone = 'Enter at least 7 digits.';
            break;
        case 'sms':
            if (hasInput) required('phone', 'Recipient number');
            if (value('phone') && !validPhone(value('phone'))) errors.phone = 'Enter at least 7 digits.';
            break;
        case 'whatsapp':
            if (hasInput) required('phone', 'WhatsApp phone');
            if (value('phone') && value('phone').replace(/\D/g, '').length < 7) errors.phone = 'Enter a country code and phone number.';
            break;
        case 'location': {
            if (hasInput) { required('lat', 'Latitude'); required('lng', 'Longitude'); }
            const lat = Number(value('lat')); const lng = Number(value('lng'));
            if (value('lat') && (!Number.isFinite(lat) || lat < -90 || lat > 90)) errors.lat = 'Latitude must be between -90 and 90.';
            if (value('lng') && (!Number.isFinite(lng) || lng < -180 || lng > 180)) errors.lng = 'Longitude must be between -180 and 180.';
            break;
        }
        case 'event': {
            if (hasInput) { required('title', 'Event title'); required('start', 'Start time'); required('end', 'End time'); }
            if (value('start') && value('end') && new Date(value('end')) <= new Date(value('start'))) errors.end = 'End time must be after start time.';
            break;
        }
        case 'crypto':
            if (hasInput) required('address', 'Wallet address');
            if (value('amount') && (!Number.isFinite(Number(value('amount'))) || Number(value('amount')) < 0)) errors.amount = 'Amount must be a positive number.';
            break;
        case 'social':
            if (hasInput) required('handle', 'Username or URL');
            if (value('handle') && !/^https?:\/\//i.test(value('handle')) && !/^[\w.@-]+$/.test(value('handle'))) errors.handle = 'Use a username or a valid URL.';
            break;
        case 'map':
            if (hasInput) required('query', 'Place or address');
            if (value('mode') && !['search', 'directions'].includes(value('mode'))) errors.mode = 'Choose a valid map action.';
            break;
        case 'payment': {
            const provider = value('provider') || 'link';
            if (provider === 'link') {
                if (hasInput) required('url', 'Payment URL');
                if (value('url') && !validUrl(value('url'))) errors.url = 'Enter a valid payment URL.';
            } else {
                if (hasInput) required('recipient', 'Recipient or payment ID');
                if (provider === 'upi' && value('recipient') && !value('recipient').includes('@')) errors.recipient = 'Enter a valid UPI ID, such as name@bank.';
            }
            if (value('amount') && (!Number.isFinite(Number(value('amount'))) || Number(value('amount')) < 0)) errors.amount = 'Amount must be zero or greater.';
            if (value('currency') && !/^[A-Za-z]{3}$/.test(value('currency'))) errors.currency = 'Use a three-letter currency code.';
            break;
        }
        case 'app':
        case 'meeting':
        case 'review':
            if (hasInput) required('url', 'URL');
            if (value('url') && !validUrl(value('url'))) errors.url = 'Enter a valid http or https URL.';
            break;
        case 'coupon':
            if (hasInput) required('code', 'Coupon code');
            if (value('url') && !validUrl(value('url'))) errors.url = 'Enter a valid redemption URL.';
            break;
        case 'raw':
            if (hasInput || validationRequested) required('raw', 'Payload');
            break;
    }

    return { payload: generatePayloadString(), errors, hasInput, hasErrors: Object.keys(errors).length > 0, showErrors: validationRequested || hasInput };
}

function relativeLuminance(color) {
    const channels = color.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
    const light = Math.max(relativeLuminance(first), relativeLuminance(second));
    const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
    return (light + 0.05) / (dark + 0.05);
}

function getSafetyReport(validation = validatePayload()) {
    if (validation.hasErrors) {
        return { status: 'danger', label: 'Fix input errors', score: 0, issues: Object.values(validation.errors).slice(0, 3).map(message => ({ level: 'danger', message })), contrast: null, quietZone: null, matrix: null };
    }
    if (!validation.payload) return { status: 'neutral', label: 'Waiting for data', score: null, issues: [], contrast: null, quietZone: null, matrix: null };

    const qr = buildQrEngine(validation.payload);
    if (!qr) return { status: 'danger', label: 'QR engine unavailable', score: 0, issues: [{ level: 'danger', message: 'The QR engine could not encode this payload.' }], contrast: null, quietZone: null, matrix: null };
    const matrix = qr.getModuleCount();
    const totalPx = Math.max(1, convertToPixels(state.size, state.sizeUnit, state.dpi));
    const marginPx = convertToPixels(state.margin, state.marginUnit, state.dpi);
    const framePadding = state.frameStyle === 'none' ? 0 : 40;
    const marginUnits = Math.min(marginPx * (1000 / totalPx), (1000 - framePadding * 2) * 0.45);
    const cellSize = Math.max(1, (1000 - marginUnits * 2 - framePadding * 2) / matrix);
    const quietZone = marginUnits / cellSize;
    const colors = state.useGradient ? [state.fgColor, state.gradEndColor] : [state.fgColor];
    const contrast = state.transparentBg ? null : Math.min(...colors.map(color => contrastRatio(color, state.bgColor)));
    const issues = [];
    let severity = 0;
    const addIssue = (level, message) => { severity = Math.max(severity, level === 'danger' ? 2 : 1); issues.push({ level, message }); };

    if (state.transparentBg) addIssue('warning', 'Transparent backgrounds depend on the final surface color.');
    if (contrast !== null && contrast < 3) addIssue('danger', 'Foreground/background contrast is too low for reliable scanning.');
    else if (contrast !== null && contrast < 4.5) addIssue('warning', 'Increase contrast for better scanning across devices and prints.');
    if (quietZone < 3) addIssue('danger', `Quiet zone is ${quietZone.toFixed(1)} modules; add more margin before printing.`);
    else if (quietZone < 4) addIssue('warning', `Quiet zone is ${quietZone.toFixed(1)} modules; use at least 4 for print reliability.`);
    else if (quietZone < 4.5) addIssue('warning', 'Quiet zone is close to the minimum; add a little more margin for print.');
    if (state.logoDataUrl && state.logoSize > 30) addIssue('danger', 'Logo coverage is greater than 30%; reduce the logo size.');
    else if (state.logoDataUrl && state.logoSize > 20) addIssue('warning', 'Large logos can reduce scan reliability.');
    if (state.logoDataUrl && state.ecc !== 'H') addIssue('warning', 'Use ECC H when a logo is embedded.');
    if (state.useGradient) addIssue('warning', 'Gradients may scan less reliably than a solid foreground color.');
    if (state.moduleStyle === 'classy') addIssue('warning', 'Diamond modules are decorative; test the printed result carefully.');
    else if (state.moduleStyle !== 'square') addIssue('warning', 'Decorative modules should be tested at the final print size.');
    if (matrix >= 121) addIssue('danger', 'This is a very dense QR matrix; shorten the payload or increase the print size.');
    else if (matrix >= 89) addIssue('warning', 'Dense QR matrix detected; verify the final print remains readable.');

    return { status: severity === 2 ? 'danger' : severity === 1 ? 'warning' : 'safe', label: severity === 2 ? 'Scan risk detected' : severity === 1 ? 'Test before printing' : 'Scan safe', score: Math.max(0, 100 - severity * 25 - issues.length * 5), issues, contrast, quietZone, matrix };
}

function updateValidationUI(validation) {
    const show = validation.showErrors;
    document.querySelectorAll('[data-validation-for]').forEach(message => {
        const key = message.dataset.validationFor;
        const text = validation.errors[key] || '';
        const visible = show && Boolean(text);
        message.textContent = text;
        message.classList.toggle('hidden', !visible);
        const field = document.querySelector(`[data-field-id="${key}"]`);
        if (field) {
            field.classList.toggle('border-rose-500', visible);
            field.classList.toggle('border-slate-200', !visible);
            field.setAttribute('aria-invalid', visible ? 'true' : 'false');
        }
    });
}

function updateSafetyUI(report) {
    const badge = document.getElementById('safety-badge');
    const score = document.getElementById('safety-score');
    const messages = document.getElementById('safety-messages');
    if (!badge || !score || !messages) return;
    const styles = {
        neutral: ['bg-slate-100', 'text-slate-600', 'dark:bg-slate-800', 'dark:text-slate-400', 'border-slate-200', 'dark:border-slate-700'],
        safe: ['bg-emerald-100', 'text-emerald-700', 'dark:bg-emerald-950/60', 'dark:text-emerald-400', 'border-emerald-200', 'dark:border-emerald-900'],
        warning: ['bg-amber-100', 'text-amber-700', 'dark:bg-amber-950/60', 'dark:text-amber-400', 'border-amber-200', 'dark:border-amber-900'],
        danger: ['bg-rose-100', 'text-rose-700', 'dark:bg-rose-950/60', 'dark:text-rose-400', 'border-rose-200', 'dark:border-rose-900']
    };
    badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1 ' + styles[report.status].join(' ');
    badge.querySelector('span').textContent = report.label;
    score.textContent = report.score === null ? 'Waiting for data' : `${report.label} · ${report.score}/100`;
    document.getElementById('safety-contrast').textContent = report.contrast === null ? '—' : `${report.contrast.toFixed(1)}:1`;
    document.getElementById('safety-quiet-zone').textContent = report.quietZone === null ? '—' : `${report.quietZone.toFixed(1)} mod.`;
    document.getElementById('safety-logo').textContent = state.logoDataUrl ? `${state.logoSize}%` : 'None';
    document.getElementById('safety-density').textContent = report.matrix ? `${report.matrix} × ${report.matrix}` : '—';
    messages.innerHTML = report.issues.length ? report.issues.map(issue => `<li class="flex gap-1.5"><span class="${issue.level === 'danger' ? 'text-rose-500' : 'text-amber-500'}">●</span><span>${escapeHtml(issue.message)}</span></li>`).join('') : '<li class="text-emerald-600 dark:text-emerald-400">Good contrast, quiet zone, and density for a standard scan.</li>';
}

function renderBatchItem(item) {
    const original = { ...state, dataValues: { ...(state.dataValues || {}) } };
    const previousValidation = validationRequested;
    Object.assign(state, normalizeState({ ...original, dataType: item.dataType, dataValues: item.dataValues }));
    validationRequested = true;
    const validation = validatePayload();
    const svg = validation.hasErrors || !validation.payload ? placeholderSvg(Math.max(1, convertToPixels(state.size, state.sizeUnit, state.dpi)), 'Invalid batch item') : generateQRCodeSVG();
    Object.assign(state, original);
    validationRequested = previousValidation;
    return { item, validation, svg };
}

function embedSvg(svg, x, y, width, height) {
    return svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" `);
}

function buildBatchSvgDocuments(items, config) {
    const capacity = Math.max(1, config.columns * config.rows);
    const pages = [];
    for (let index = 0; index < items.length; index += capacity) pages.push(buildBatchSvgDocument(items.slice(index, index + capacity), config));
    return pages;
}

function buildBatchSvgDocument(items, config) {
    const page = config.page;
    const cellWidth = (page.width - config.margin * 2 - config.gap * (config.columns - 1)) / config.columns;
    const cellHeight = (page.height - config.margin * 2 - config.gap * (config.rows - 1)) / config.rows;
    const cells = items.map((item, index) => {
        const result = renderBatchItem(item);
        const column = index % config.columns;
        const row = Math.floor(index / config.columns);
        const x = config.margin + column * (cellWidth + config.gap);
        const y = config.margin + row * (cellHeight + config.gap);
        const labelHeight = config.showPayload ? 18 : config.label ? 10 : 4;
        const qrSize = Math.max(8, Math.min(cellWidth - 4, cellHeight - labelHeight));
        const qrX = x + (cellWidth - qrSize) / 2;
        const qrY = y + 2;
        const label = config.label || item.name;
        const payload = result.validation.payload;
        let output = `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="2" fill="#fff" stroke="#e2e8f0" stroke-width="0.3"/>`;
        output += embedSvg(result.svg, qrX, qrY, qrSize, qrSize);
        output += `<text x="${x + cellWidth / 2}" y="${y + cellHeight - (config.showPayload ? 12 : 4)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${config.showPayload ? 7 : 9}" font-weight="600" fill="#0f172a">${escapeHtml(label)}</text>`;
        if (config.showPayload) output += `<text x="${x + cellWidth / 2}" y="${y + cellHeight - 4}" text-anchor="middle" font-family="monospace" font-size="5" fill="#475569">${escapeHtml(payload)}</text>`;
        return output;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.width} ${page.height}" width="${page.width}mm" height="${page.height}mm"><rect width="100%" height="100%" fill="#fff"/>${cells}</svg>`;
}

function normalizeState(candidate = {}) {
    const next = { ...DEFAULT_STATE, ...candidate };
    const oneOf = (value, options, fallback) => options.includes(value) ? value : fallback;
    next.dataType = DATA_TYPE_FIELDS[next.dataType] ? next.dataType : DEFAULT_STATE.dataType;
    next.dataValues = candidate.dataValues && typeof candidate.dataValues === 'object' && !Array.isArray(candidate.dataValues)
        ? { ...candidate.dataValues } : {};
    next.sizeUnit = oneOf(next.sizeUnit, ['inch', 'cm', 'mm', 'px'], DEFAULT_STATE.sizeUnit);
    next.marginUnit = oneOf(next.marginUnit, ['inch', 'cm', 'mm', 'px'], DEFAULT_STATE.marginUnit);
    next.ecc = oneOf(next.ecc, ['L', 'M', 'Q', 'H'], DEFAULT_STATE.ecc);
    next.dpi = oneOf(Number(next.dpi), [72, 150, 300, 600, 1200], DEFAULT_STATE.dpi);
    next.gradientType = oneOf(next.gradientType, ['linear', 'radial'], DEFAULT_STATE.gradientType);
    next.moduleStyle = oneOf(next.moduleStyle, ['square', 'dots', 'rounded', 'extra-rounded', 'classy'], DEFAULT_STATE.moduleStyle);
    next.eyeFrameStyle = oneOf(next.eyeFrameStyle, ['square', 'circle', 'extra-rounded'], DEFAULT_STATE.eyeFrameStyle);
    next.eyeballStyle = oneOf(next.eyeballStyle, ['square', 'circle', 'dot', 'diamond'], DEFAULT_STATE.eyeballStyle);
    next.frameStyle = oneOf(next.frameStyle, ['none', 'simple', 'rounded', 'badge', 'scan-me', 'coupon', 'poster'], DEFAULT_STATE.frameStyle);
    next.size = Math.max(0.1, numberOr(next.size, DEFAULT_STATE.size));
    next.dpi = Math.max(1, numberOr(next.dpi, DEFAULT_STATE.dpi));
    next.margin = Math.max(0, numberOr(next.margin, DEFAULT_STATE.margin));
    next.gradAngle = clamp(numberOr(next.gradAngle, DEFAULT_STATE.gradAngle), 0, 360);
    next.frameBorderWidth = clamp(numberOr(next.frameBorderWidth, DEFAULT_STATE.frameBorderWidth), 1, 20);
    next.logoSize = clamp(numberOr(next.logoSize, DEFAULT_STATE.logoSize), 5, 35);
    next.logoPadding = clamp(numberOr(next.logoPadding, DEFAULT_STATE.logoPadding), 0, 15);
    next.fgColor = normalizeColor(next.fgColor, DEFAULT_STATE.fgColor);
    next.bgColor = normalizeColor(next.bgColor, DEFAULT_STATE.bgColor);
    next.gradEndColor = normalizeColor(next.gradEndColor, DEFAULT_STATE.gradEndColor);
    next.frameColor = normalizeColor(next.frameColor, DEFAULT_STATE.frameColor);
    next.logoDataUrl = typeof next.logoDataUrl === 'string' && next.logoDataUrl.startsWith('data:image/') ? next.logoDataUrl : null;
    next.logoSvgRaw = typeof next.logoSvgRaw === 'string' ? next.logoSvgRaw : null;
    next.logoIsSvg = Boolean(next.logoIsSvg && next.logoDataUrl && next.logoSvgRaw);
    next.theme = next.theme === 'dark' ? 'dark' : 'light';
    return next;
}

function buildQrEngine(payload) {
    if (!payload || typeof qrcode !== 'function') return null;
    try {
        const engine = qrcode(0, state.ecc);
        engine.addData(payload);
        engine.make();
        return engine;
    } catch (error) {
        try {
            const fallback = qrcode(0, 'L');
            fallback.addData(payload);
            fallback.make();
            return fallback;
        } catch (fallbackError) {
            return null;
        }
    }
}

function placeholderSvg(totalPx, message = 'Enter QR Payload Data') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="${totalPx}" height="${totalPx}">
        <rect width="100%" height="100%" fill="${state.transparentBg ? 'none' : state.bgColor}"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Inter, sans-serif" font-size="28" fill="#94a3b8">${escapeHtml(message)}</text>
    </svg>`;
}

// SVG Vector Generation Engine
function generateQRCodeSVG() {
    const validation = validatePayload();
    const payload = validation.payload;
    const totalPx = Math.max(1, convertToPixels(state.size, state.sizeUnit, state.dpi));
    const marginPx = convertToPixels(state.margin, state.marginUnit, state.dpi);
    const viewBoxSize = 1000;

    if (validation.hasErrors) return placeholderSvg(totalPx, 'Fix input errors');
    if (!payload) return placeholderSvg(totalPx);
    const qrEngine = buildQrEngine(payload);
    if (!qrEngine) return placeholderSvg(totalPx, 'QR engine unavailable');
    const moduleCount = qrEngine.getModuleCount();
    
    const framePadding = state.frameStyle === 'none' ? 0 : 40;
    const marginUnits = Math.min(marginPx * (viewBoxSize / totalPx), (viewBoxSize - framePadding * 2) * 0.45);
    const qrAreaSize = Math.max(20, viewBoxSize - marginUnits * 2 - framePadding * 2);
    const cellSize = qrAreaSize / moduleCount;
    const qrOffsetX = (viewBoxSize - (moduleCount * cellSize)) / 2;
    const qrOffsetY = qrOffsetX;

    // Build SVG Elements Buffer
    let svgContent = '';

    // Defs & Gradient definitions
    let defsStr = '';
    let fgStyle = state.fgColor;

    if (state.useGradient) {
        const gradId = `qr-grad-${SESSION_ID}`;
        fgStyle = `url(#${gradId})`;
        if (state.gradientType === 'radial') {
            defsStr += `<radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="${state.fgColor}" />
                <stop offset="100%" stop-color="${state.gradEndColor}" />
            </radialGradient>`;
        } else {
            const angleRad = (state.gradAngle || 45) * (Math.PI / 180);
            const x1 = Math.round(50 + Math.sin(angleRad) * 50);
            const y1 = Math.round(50 - Math.cos(angleRad) * 50);
            const x2 = Math.round(50 - Math.sin(angleRad) * 50);
            const y2 = Math.round(50 + Math.cos(angleRad) * 50);
            defsStr += `<linearGradient id="${gradId}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
                <stop offset="0%" stop-color="${state.fgColor}" />
                <stop offset="100%" stop-color="${state.gradEndColor}" />
            </linearGradient>`;
        }
    }

    if (defsStr) {
        svgContent += `<defs>${defsStr}</defs>`;
    }

    // 1. Render Outer Frame Background & Border (if enabled)
    if (!state.transparentBg) {
        svgContent += `<rect width="100%" height="100%" fill="${state.bgColor}"/>`;
    }

    if (state.frameStyle !== 'none') {
        const bWidth = state.frameBorderWidth * (viewBoxSize / 500);
        const fColor = state.frameColor;

        if (state.frameStyle === 'simple') {
            svgContent += `<rect x="${bWidth/2}" y="${bWidth/2}" width="${viewBoxSize - bWidth}" height="${viewBoxSize - bWidth}" fill="none" stroke="${fColor}" stroke-width="${bWidth}"/>`;
        } else if (state.frameStyle === 'rounded') {
            svgContent += `<rect x="${bWidth/2}" y="${bWidth/2}" width="${viewBoxSize - bWidth}" height="${viewBoxSize - bWidth}" rx="40" fill="none" stroke="${fColor}" stroke-width="${bWidth}"/>`;
        } else if (state.frameStyle === 'badge') {
            svgContent += `<rect x="${bWidth/2}" y="${bWidth/2}" width="${viewBoxSize - bWidth}" height="${viewBoxSize - bWidth}" rx="80" fill="none" stroke="${fColor}" stroke-width="${bWidth}"/>`;
        } else if (state.frameStyle === 'coupon') {
            svgContent += `<rect x="${bWidth/2}" y="${bWidth/2}" width="${viewBoxSize - bWidth}" height="${viewBoxSize - bWidth}" fill="none" stroke="${fColor}" stroke-width="${bWidth}" stroke-dasharray="16,12"/>`;
        } else if (state.frameStyle === 'scan-me' || state.frameStyle === 'poster') {
            svgContent += `<rect x="${bWidth/2}" y="${bWidth/2}" width="${viewBoxSize - bWidth}" height="${viewBoxSize - bWidth}" rx="30" fill="none" stroke="${fColor}" stroke-width="${bWidth}"/>`;
        }

        // Top Frame Text
        if (state.frameTopText) {
            svgContent += `<text x="50%" y="${qrOffsetY - 15}" dominant-baseline="bottom" text-anchor="middle" font-family="Inter, sans-serif" font-weight="bold" font-size="28" fill="${fColor}">${escapeHtml(state.frameTopText)}</text>`;
        }
        // Bottom Frame Text
        if (state.frameBottomText) {
            svgContent += `<text x="50%" y="${qrOffsetY + (moduleCount * cellSize) + 35}" dominant-baseline="hanging" text-anchor="middle" font-family="Inter, sans-serif" font-weight="bold" font-size="28" fill="${fColor}">${escapeHtml(state.frameBottomText)}</text>`;
        }
    }

    // Helper to check if row/col belongs to finder patterns
    const isFinderPattern = (r, c) => {
        if (r < 7 && c < 7) return true; // Top Left
        if (r < 7 && c >= moduleCount - 7) return true; // Top Right
        if (r >= moduleCount - 7 && c < 7) return true; // Bottom Left
        return false;
    };

    // Calculate Central Logo Mask Bounds
    let logoSizePx = 0;
    let logoBounds = null;
    if (state.logoDataUrl) {
        logoSizePx = (moduleCount * cellSize) * (state.logoSize / 100);
        
        // MANDATORY CENTERING Math Logic:
        // centerX = (qrSize - logoSize) / 2
        // centerY = (qrSize - logoSize) / 2
        const logoX = qrOffsetX + ((moduleCount * cellSize) - logoSizePx) / 2;
        const logoY = qrOffsetY + ((moduleCount * cellSize) - logoSizePx) / 2;

        logoBounds = {
            x: logoX,
            y: logoY,
            size: logoSizePx,
            padding: state.logoPadding * (viewBoxSize / 500)
        };
    }

    // Module Path Generator
    let modulesPathStr = '';

    for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
            if (qrEngine.isDark(r, c)) {
                if (isFinderPattern(r, c)) continue; // Handled separately with custom eyes

                const x = qrOffsetX + c * cellSize;
                const y = qrOffsetY + r * cellSize;

                // Check if module is obscured by logo background mask
                if (logoBounds && state.logoBgMask) {
                    const pad = logoBounds.padding;
                    if (x + cellSize >= logoBounds.x - pad &&
                        x <= logoBounds.x + logoBounds.size + pad &&
                        y + cellSize >= logoBounds.y - pad &&
                        y <= logoBounds.y + logoBounds.size + pad) {
                        continue; // Skip module under logo
                    }
                }

                // Render custom data module shapes
                if (state.moduleStyle === 'dots') {
                    const cx = x + cellSize / 2;
                    const cy = y + cellSize / 2;
                    modulesPathStr += `M ${cx} ${cy} m -${cellSize*0.4}, 0 a ${cellSize*0.4},${cellSize*0.4} 0 1,0 ${cellSize*0.8},0 a ${cellSize*0.4},${cellSize*0.4} 0 1,0 -${cellSize*0.8},0 `;
                } else if (state.moduleStyle === 'rounded') {
                    const rad = cellSize * 0.3;
                    modulesPathStr += `M ${x+rad} ${y} h ${cellSize-2*rad} a ${rad} ${rad} 0 0 1 ${rad} ${rad} v ${cellSize-2*rad} a ${rad} ${rad} 0 0 1 -${rad} ${rad} h -${cellSize-2*rad} a ${rad} ${rad} 0 0 1 -${rad} -${rad} v -${cellSize-2*rad} a ${rad} ${rad} 0 0 1 ${rad} -${rad} `;
                } else if (state.moduleStyle === 'extra-rounded') {
                    const rad = cellSize * 0.48;
                    modulesPathStr += `M ${x+rad} ${y} h ${cellSize-2*rad} a ${rad} ${rad} 0 0 1 ${rad} ${rad} v ${cellSize-2*rad} a ${rad} ${rad} 0 0 1 -${rad} ${rad} h -${cellSize-2*rad} a ${rad} ${rad} 0 0 1 -${rad} -${rad} v -${cellSize-2*rad} a ${rad} ${rad} 0 0 1 ${rad} -${rad} `;
                } else if (state.moduleStyle === 'classy') {
                    modulesPathStr += `M ${x+cellSize/2} ${y} L ${x+cellSize} ${y+cellSize/2} L ${x+cellSize/2} ${y+cellSize} L ${x} ${y+cellSize/2} Z `;
                } else {
                    // Standard Square
                    modulesPathStr += `M ${x} ${y} h ${cellSize} v ${cellSize} h -${cellSize} Z `;
                }
            }
        }
    }

    svgContent += `<path d="${modulesPathStr}" fill="${fgStyle}"/>`;

    // Helper to draw corner eye frames & eyeballs
    const drawEye = (x, y) => {
        const eyeSize = 7 * cellSize;
        let eyeSvg = '';

        // Outer Eye Frame
        if (state.eyeFrameStyle === 'circle') {
            const cx = x + eyeSize / 2;
            const cy = y + eyeSize / 2;
            const rOuter = eyeSize / 2;
            const rInner = (5 * cellSize) / 2;
            eyeSvg += `<path d="M ${cx} ${cy} m -${rOuter}, 0 a ${rOuter},${rOuter} 0 1,0 ${rOuter*2},0 a ${rOuter},${rOuter} 0 1,0 -${rOuter*2},0 M ${cx} ${cy} m -${rInner}, 0 a ${rInner},${rInner} 0 1,0 ${rInner*2},0 a ${rInner},${rInner} 0 1,0 -${rInner*2},0" fill="${fgStyle}" fill-rule="evenodd"/>`;
        } else if (state.eyeFrameStyle === 'extra-rounded') {
            const r = cellSize * 2;
            eyeSvg += `<path d="M ${x+r} ${y} h ${eyeSize-2*r} a ${r} ${r} 0 0 1 ${r} ${r} v ${eyeSize-2*r} a ${r} ${r} 0 0 1 -${r} ${r} h -${eyeSize-2*r} a ${r} ${r} 0 0 1 -${r} -${r} v -${eyeSize-2*r} a ${r} ${r} 0 0 1 ${r} -${r} M ${x+cellSize+r/2} ${y+cellSize} h ${eyeSize-2*cellSize-r} a ${r/2} ${r/2} 0 0 1 ${r/2} ${r/2} v ${eyeSize-2*cellSize-r} a ${r/2} ${r/2} 0 0 1 -${r/2} ${r/2} h -${eyeSize-2*cellSize-r} a ${r/2} ${r/2} 0 0 1 -${r/2} -${r/2} v -${eyeSize-2*cellSize-r} a ${r/2} ${r/2} 0 0 1 ${r/2} -${r/2}" fill="${fgStyle}" fill-rule="evenodd"/>`;
        } else {
            // Square Frame
            eyeSvg += `<path d="M ${x} ${y} h ${eyeSize} v ${eyeSize} h -${eyeSize} Z M ${x+cellSize} ${y+cellSize} v ${5*cellSize} h ${5*cellSize} v -${5*cellSize} Z" fill="${fgStyle}" fill-rule="evenodd"/>`;
        }

        // Inner Eyeball
        const eX = x + 2 * cellSize;
        const eY = y + 2 * cellSize;
        const eSize = 3 * cellSize;

        if (state.eyeballStyle === 'circle' || state.eyeballStyle === 'dot') {
            const cx = eX + eSize / 2;
            const cy = eY + eSize / 2;
            const r = eSize / 2;
            eyeSvg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fgStyle}"/>`;
        } else if (state.eyeballStyle === 'diamond') {
            eyeSvg += `<path d="M ${eX + eSize/2} ${eY} L ${eX + eSize} ${eY + eSize/2} L ${eX + eSize/2} ${eY + eSize} L ${eX} ${eY + eSize/2} Z" fill="${fgStyle}"/>`;
        } else {
            // Square eyeball
            eyeSvg += `<rect x="${eX}" y="${eY}" width="${eSize}" height="${eSize}" fill="${fgStyle}"/>`;
        }

        return eyeSvg;
    };

    // Draw Top-Left Eye
    svgContent += drawEye(qrOffsetX, qrOffsetY);
    // Draw Top-Right Eye
    svgContent += drawEye(qrOffsetX + (moduleCount - 7) * cellSize, qrOffsetY);
    // Draw Bottom-Left Eye
    svgContent += drawEye(qrOffsetX, qrOffsetY + (moduleCount - 7) * cellSize);

    // Embed Central Logo (Strict Vector Safe Embed Rules)
    if (logoBounds) {
        // Render logo mask if enabled
        if (state.logoBgMask) {
            const p = logoBounds.padding;
            const maskColor = state.transparentBg ? 'none' : state.bgColor;
            svgContent += `<rect x="${logoBounds.x - p}" y="${logoBounds.y - p}" width="${logoBounds.size + p*2}" height="${logoBounds.size + p*2}" rx="8" fill="${maskColor}"/>`;
        }

        // A base64 SVG image remains vector-safe and avoids invalid nested SVG markup.
        if (state.logoDataUrl) {
            svgContent += `<image href="${state.logoDataUrl}" xlink:href="${state.logoDataUrl}" x="${logoBounds.x}" y="${logoBounds.y}" width="${logoBounds.size}" height="${logoBounds.size}" preserveAspectRatio="xMidYMid meet"/>`;
        }
    }

    // Assemble Full Valid Self-Contained SVG
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${totalPx}" height="${totalPx}">
        ${svgContent}
    </svg>`;
}

// Render Live Preview
function updatePreview() {
    const validation = validatePayload();
    const svgStr = generateQRCodeSVG();
    const previewWrapper = document.getElementById('preview-svg-wrapper');
    previewWrapper.innerHTML = svgStr;

    const pxSize = Math.round(convertToPixels(state.size, state.sizeUnit, state.dpi));
    document.getElementById('meta-resolution').innerText = `${pxSize} x ${pxSize} px`;
    const qr = validation.hasErrors ? null : buildQrEngine(validation.payload);
    const count = qr ? qr.getModuleCount() : 21;
    document.getElementById('meta-matrix').innerText = `${count} x ${count}`;
    const inSize = convertToInches(state.size, state.sizeUnit).toFixed(2);
    document.getElementById('meta-physical').innerText = `${inSize}" x ${inSize}"`;
    document.getElementById('data-length-badge').innerText = `${validation.payload.length} chars`;
    document.getElementById('label-export-png').textContent = `Download PNG (${state.dpi} DPI)`;
    document.getElementById('label-export-jpg').textContent = `Download JPG (${state.dpi} DPI)`;
    document.getElementById('label-export-webp').textContent = `Download WebP (${state.dpi} DPI)`;
    document.getElementById('label-export-pdf').textContent = `Download PDF (${inSize} in)`;

    const warnBox = document.getElementById('logo-warning');
    warnBox.classList.toggle('hidden', !(state.logoDataUrl && state.logoSize > 30));
    updateValidationUI(validation);
    updateSafetyUI(getSafetyReport(validation));
}

// Render Dynamic Fields
function renderDynamicFields() {
    const container = document.getElementById('dynamic-fields-container');
    container.innerHTML = '';

    const fields = DATA_TYPE_FIELDS[state.dataType] || [];

    fields.forEach(field => {
        const div = document.createElement('div');
        const label = document.createElement('label');
        label.className = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1';
        label.innerText = field.label;
        label.htmlFor = `field-${state.dataType}-${field.id}`;
        div.appendChild(label);

        let input;
        if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
            input.className = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
        } else if (field.type === 'select') {
            input = document.createElement('select');
            input.className = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
            field.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.innerText = opt.toUpperCase();
                input.appendChild(option);
            });
        } else {
            input = document.createElement('input');
            input.type = field.type;
            input.className = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
        }

        input.id = `field-${state.dataType}-${field.id}`;
        input.dataset.fieldId = field.id;
        input.placeholder = field.placeholder || '';
        const storedValue = state.dataValues[field.id];
        input.value = field.type === 'select'
            ? (field.options.includes(storedValue) ? storedValue : field.options[0])
            : (storedValue || '');
        input.setAttribute('aria-invalid', 'false');

        const updateValue = event => {
            state.dataValues[field.id] = event.target.value;
            updatePreview();
        };
        input.addEventListener('input', updateValue);
        if (field.type === 'select') input.addEventListener('change', updateValue);

        const error = document.createElement('p');
        error.className = 'validation-error hidden mt-1 text-[11px] text-rose-600 dark:text-rose-400';
        error.dataset.validationFor = field.id;
        error.id = `error-${state.dataType}-${field.id}`;
        input.setAttribute('aria-describedby', error.id);
        div.appendChild(input);
        div.appendChild(error);
        container.appendChild(div);
    });

    updatePreview();
}

function prepareExport() {
    validationRequested = true;
    const validation = validatePayload();
    updatePreview();
    return !validation.hasErrors && Boolean(validation.payload);
}

// Download Handlers
function downloadSVG() {
    if (!prepareExport()) return;
    const svgStr = generateQRCodeSVG();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getExportFilename('svg');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadRaster(format) {
    if (!prepareExport()) return;
    const svgStr = generateQRCodeSVG();
    const pxSize = Math.round(convertToPixels(state.size, state.sizeUnit, state.dpi));

    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        const canvas = document.getElementById('export-canvas');
        canvas.width = pxSize;
        canvas.height = pxSize;
        const ctx = canvas.getContext('2d');

        if (format === 'jpeg' || !state.transparentBg) {
            ctx.fillStyle = state.bgColor;
            ctx.fillRect(0, 0, pxSize, pxSize);
        } else {
            ctx.clearRect(0, 0, pxSize, pxSize);
        }

        ctx.drawImage(img, 0, 0, pxSize, pxSize);
        URL.revokeObjectURL(url);

        const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
        const extension = format === 'jpeg' ? 'jpg' : format;
        const dataUrl = canvas.toDataURL(mime, 0.95);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = getExportFilename(extension);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
}

function printCurrentDocument() {
    const printArea = document.getElementById('print-area');
    const cleanup = () => {
        printArea.classList.add('hidden');
        printArea.classList.remove('print-sheet-area');
        printArea.innerHTML = '';
    };
    printArea.classList.remove('print-sheet-area');
    printArea.innerHTML = generateQRCodeSVG();
    printArea.classList.remove('hidden');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
}

function downloadPDF() {
    if (!prepareExport()) return;
    const svgStr = generateQRCodeSVG();
    const pxSize = Math.round(convertToPixels(state.size, state.sizeUnit, state.dpi));
    const physicalSize = Math.max(0.1, convertToInches(state.size, state.sizeUnit));
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
        const canvas = document.getElementById('export-canvas');
        canvas.width = pxSize;
        canvas.height = pxSize;
        const context = canvas.getContext('2d');
        if (state.transparentBg) context.clearRect(0, 0, pxSize, pxSize);
        else { context.fillStyle = state.bgColor; context.fillRect(0, 0, pxSize, pxSize); }
        context.drawImage(img, 0, 0, pxSize, pxSize);
        URL.revokeObjectURL(url);
        const pdfConstructor = window.jspdf?.jsPDF || window.jsPDF;
        if (!pdfConstructor) { printCurrentDocument(); return; }
        const pdf = new pdfConstructor({ orientation: 'portrait', unit: 'in', format: [physicalSize, physicalSize] });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, physicalSize, physicalSize);
        pdf.save(getExportFilename('pdf'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); printCurrentDocument(); };
    img.src = url;
}

// Camera Scan Test
let videoStream = null;
let cameraRequestId = 0;
const cameraCanvas = document.createElement('canvas');
const cameraContext = cameraCanvas.getContext('2d', { willReadFrequently: true });

async function openCameraModal() {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video');
    const resultBox = document.getElementById('camera-scan-result');
    const requestId = ++cameraRequestId;
    modal.classList.remove('hidden');
    resultBox.textContent = 'Requesting camera access...';

    if (!navigator.mediaDevices?.getUserMedia) {
        resultBox.textContent = 'Camera access is unavailable in this browser or context.';
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (requestId !== cameraRequestId || modal.classList.contains('hidden')) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        videoStream = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        await video.play();
        requestAnimationFrame(scanCameraFrame);
    } catch (error) {
        resultBox.textContent = 'Camera access denied or unavailable.';
    }
}

function scanCameraFrame() {
    const video = document.getElementById('camera-video');
    const resultBox = document.getElementById('camera-scan-result');

    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth && video.videoHeight) {
        cameraCanvas.width = video.videoWidth;
        cameraCanvas.height = video.videoHeight;
        cameraContext.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
        const imageData = cameraContext.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
        if (typeof jsQR === 'function') {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
                resultBox.innerHTML = `<span class="text-emerald-500 font-bold">✓ SCANNED SUCCESSFULLY:</span><br>${escapeHtml(code.data)}`;
            }
        } else {
            resultBox.textContent = 'Scanner library unavailable.';
        }
    }

    if (videoStream && !document.getElementById('camera-modal').classList.contains('hidden')) {
        requestAnimationFrame(scanCameraFrame);
    }
}

function closeCameraModal() {
    cameraRequestId++;
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    const video = document.getElementById('camera-video');
    video.pause();
    video.srcObject = null;
    document.getElementById('camera-modal').classList.add('hidden');
}

// Utility escape helper
function escapeHtml(value) {
    return asText(value).replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[match]);
}

// DOM Initialization & Event Bindings
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const root = document.documentElement;
    const typeBtns = [...document.querySelectorAll('.type-btn')];
    const removeLogoBtn = $('btn-remove-logo');
    const fileInput = $('logo-file-input');
    const dropzone = $('logo-dropzone');
    const activeClasses = ['active', 'border-blue-600', 'bg-blue-50', 'dark:bg-blue-950/50', 'text-blue-600', 'dark:text-blue-400'];
    const inactiveClasses = ['border-slate-200', 'dark:border-slate-800', 'text-slate-600', 'dark:text-slate-400'];
    const on = (id, event, handler) => $(id).addEventListener(event, handler);


    function snapshotState() {
        return JSON.parse(JSON.stringify(state));
    }

    function applyLoadedState(loaded) {
        Object.assign(state, normalizeState(loaded));
        validationRequested = false;
        applyTheme(state.theme, false);
        syncControls();
        renderDynamicFields();
    }

    function setActiveTypeButton(type) {
        typeBtns.forEach(button => {
            const active = button.dataset.type === type;
            activeClasses.forEach(className => button.classList.toggle(className, active));
            inactiveClasses.forEach(className => button.classList.toggle(className, !active));
        });
    }

    function applyTheme(theme, persist = true) {
        state.theme = theme === 'dark' ? 'dark' : 'light';
        root.classList.toggle('dark', state.theme === 'dark');
        root.classList.toggle('light', state.theme !== 'dark');
        if (persist) writeThemePreference(state.theme);
        }

    function syncControls() {
        const values = {
            'input-qr-size': state.size, 'select-size-unit': state.sizeUnit, 'select-dpi': state.dpi,
            'select-ecc': state.ecc, 'input-margin': state.margin, 'select-margin-unit': state.marginUnit,
            'select-module-style': state.moduleStyle, 'select-eye-frame-style': state.eyeFrameStyle,
            'select-eyeball-style': state.eyeballStyle, 'select-gradient-type': state.gradientType,
            'input-grad-angle': state.gradAngle, 'select-frame-style': state.frameStyle,
            'input-frame-border-width': state.frameBorderWidth, 'input-frame-top-text': state.frameTopText,
            'input-frame-bottom-text': state.frameBottomText, 'range-logo-size': state.logoSize,
            'range-logo-padding': state.logoPadding
        };
        Object.entries(values).forEach(([id, value]) => { $(id).value = value; });
        $('picker-fg-color').value = state.fgColor;
        $('text-fg-color').value = state.fgColor;
        $('picker-bg-color').value = state.bgColor;
        $('text-bg-color').value = state.bgColor;
        $('picker-grad-end-color').value = state.gradEndColor;
        $('text-grad-end-color').value = state.gradEndColor;
        $('picker-frame-color').value = state.frameColor;
        $('text-frame-color').value = state.frameColor;
        $('chk-transparent-bg').checked = state.transparentBg;
        $('chk-use-gradient').checked = state.useGradient;
        $('chk-logo-bg-mask').checked = state.logoBgMask;
        $('gradient-options').classList.toggle('hidden', !state.useGradient);
        $('logo-size-val').textContent = `${state.logoSize}%`;
        $('logo-padding-val').textContent = `${state.logoPadding}px`;
        removeLogoBtn.classList.toggle('hidden', !state.logoDataUrl);
        setActiveTypeButton(state.dataType);
    }

    function bindColor(pickerId, textId, key) {
        const picker = $(pickerId);
        const text = $(textId);
        picker.addEventListener('input', () => {
            state[key] = normalizeColor(picker.value, state[key]);
            text.value = state[key];
            updatePreview();
        });
        text.addEventListener('input', () => {
            const color = normalizeColor(text.value, null);
            if (!color) return;
            state[key] = color;
            picker.value = color;
            updatePreview();
        });
        text.addEventListener('change', () => { text.value = state[key]; });
    }


    document.querySelector('#session-id-display').textContent = SESSION_ID;
    applyTheme(readThemePreference(state.theme), false);
    on('theme-toggle', 'click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));

    typeBtns.forEach(button => button.addEventListener('click', () => {
        state.dataType = button.dataset.type;
        state.dataValues = {};
        setActiveTypeButton(state.dataType);
        renderDynamicFields();
    }));

    on('input-qr-size', 'input', event => { state.size = Math.max(0.1, numberOr(event.target.value, DEFAULT_STATE.size)); updatePreview(); });
    on('select-size-unit', 'change', event => { state.sizeUnit = event.target.value; updatePreview(); });
    on('select-dpi', 'change', event => { state.dpi = Math.max(1, numberOr(event.target.value, DEFAULT_STATE.dpi)); updatePreview(); });
    on('select-ecc', 'change', event => { state.ecc = event.target.value; updatePreview(); });
    on('input-margin', 'input', event => { state.margin = Math.max(0, numberOr(event.target.value, 0)); updatePreview(); });
    on('select-margin-unit', 'change', event => { state.marginUnit = event.target.value; updatePreview(); });
    on('select-module-style', 'change', event => { state.moduleStyle = event.target.value; updatePreview(); });
    on('select-eye-frame-style', 'change', event => { state.eyeFrameStyle = event.target.value; updatePreview(); });
    on('select-eyeball-style', 'change', event => { state.eyeballStyle = event.target.value; updatePreview(); });


    function batchResults() { return batchItems.map(renderBatchItem); }

    function renderBatchList() {
        const list = $('batch-list');
        const results = batchResults();
        list.innerHTML = '';
        list.classList.toggle('hidden', !batchItems.length);
        results.slice(0, 50).forEach(result => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-2 px-3 py-2 text-xs';
            const name = document.createElement('span');
            name.className = 'truncate text-slate-700 dark:text-slate-300';
            name.textContent = `${result.item.name} · ${result.item.dataType.toUpperCase()}`;
            const status = document.createElement('span');
            status.className = result.validation.hasErrors ? 'shrink-0 text-rose-600 dark:text-rose-400' : 'shrink-0 text-emerald-600 dark:text-emerald-400';
            status.textContent = result.validation.hasErrors ? Object.values(result.validation.errors)[0] : 'Ready';
            row.append(name, status);
            list.appendChild(row);
        });
        const valid = results.filter(result => !result.validation.hasErrors && result.validation.payload).length;
        $('batch-status').textContent = batchItems.length ? `${valid}/${batchItems.length} items ready` : 'No batch loaded';
        const canExport = batchItems.length > 0 && valid === batchItems.length;
        ['btn-batch-export-svg', 'btn-batch-print'].forEach(id => { $(id).disabled = !canExport; });
        $('btn-batch-export-json').disabled = !batchItems.length;
    }

    function downloadTextFile(filename, text, type = 'application/json') {
        const blob = new Blob([text], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    on('btn-apply-template', 'click', () => {
        const template = getTemplateState($('select-template').value);
        applyLoadedState({ ...snapshotState(), ...template });
    });
    on('btn-import-batch', 'click', () => $('batch-file-input').click());
    $('batch-file-input').addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = loadEvent => {
            try {
                batchItems = parseBatchText(loadEvent.target.result, file.name);
                if (!batchItems.length) throw new Error('No batch records found');
                renderBatchList();
            } catch (error) {
                batchItems = [];
                renderBatchList();
                $('batch-status').textContent = `Import failed: ${error.message}`;
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    });
    on('btn-clear-batch', 'click', () => { batchItems = []; renderBatchList(); });
    on('btn-batch-export-json', 'click', () => {
        if (!batchItems.length) return;
        downloadTextFile(`QR_Batch_${DATE_STR}_${SESSION_ID}.json`, JSON.stringify(batchItems, null, 2));
    });
    on('btn-batch-export-svg', 'click', () => {
        const results = batchResults();
        if (!batchItems.length || results.some(result => result.validation.hasErrors)) return;
        const pages = buildBatchSvgDocuments(batchItems, getSheetConfig());
        const config = getSheetConfig();
        const combined = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${config.page.width} ${config.page.height * pages.length}" width="${config.page.width}mm" height="${config.page.height * pages.length}mm">${pages.map((page, index) => embedSvg(page, 0, index * config.page.height, config.page.width, config.page.height)).join('')}</svg>`;
        downloadTextFile(`QR_Batch_${DATE_STR}_${SESSION_ID}.svg`, combined, 'image/svg+xml;charset=utf-8');
    });
    on('btn-batch-print', 'click', () => {
        const results = batchResults();
        if (!batchItems.length || results.some(result => result.validation.hasErrors)) return;
        const config = getSheetConfig();
        const pages = buildBatchSvgDocuments(batchItems, config);
        const printArea = $('print-area');
        printArea.innerHTML = pages.map(page => `<div class="print-sheet-page" style="width:${config.page.width}mm;height:${config.page.height}mm;">${page}</div>`).join('');
        printArea.classList.add('print-sheet-area');
        printArea.classList.remove('hidden');
        const cleanup = () => { printArea.classList.add('hidden'); printArea.classList.remove('print-sheet-area'); printArea.innerHTML = ''; };
        window.addEventListener('afterprint', cleanup, { once: true });
        window.print();
    });
    renderBatchList();

    bindColor('picker-fg-color', 'text-fg-color', 'fgColor');
    bindColor('picker-bg-color', 'text-bg-color', 'bgColor');
    bindColor('picker-grad-end-color', 'text-grad-end-color', 'gradEndColor');
    bindColor('picker-frame-color', 'text-frame-color', 'frameColor');
    on('chk-transparent-bg', 'change', event => { state.transparentBg = event.target.checked; updatePreview(); });
    on('chk-use-gradient', 'change', event => {
        state.useGradient = event.target.checked;
        $('gradient-options').classList.toggle('hidden', !state.useGradient);
        updatePreview();
    });
    on('select-gradient-type', 'change', event => { state.gradientType = event.target.value; updatePreview(); });
    on('input-grad-angle', 'input', event => { state.gradAngle = clamp(numberOr(event.target.value, 0), 0, 360); updatePreview(); });
    on('select-frame-style', 'change', event => { state.frameStyle = event.target.value; updatePreview(); });
    on('input-frame-border-width', 'input', event => { state.frameBorderWidth = clamp(numberOr(event.target.value, 1), 1, 20); updatePreview(); });
    on('input-frame-top-text', 'input', event => { state.frameTopText = event.target.value; updatePreview(); });
    on('input-frame-bottom-text', 'input', event => { state.frameBottomText = event.target.value; updatePreview(); });

    dropzone.addEventListener('click', event => { if (event.target !== fileInput) fileInput.click(); });
    ['dragover', 'drop'].forEach(eventName => dropzone.addEventListener(eventName, event => event.preventDefault()));
    ['dragover'].forEach(eventName => dropzone.addEventListener(eventName, () => dropzone.classList.add('drop-zone--over')));
    ['dragleave', 'dragend', 'drop'].forEach(eventName => dropzone.addEventListener(eventName, () => dropzone.classList.remove('drop-zone--over')));
    dropzone.addEventListener('drop', event => { if (event.dataTransfer.files.length) handleLogoFile(event.dataTransfer.files[0]); });
    fileInput.addEventListener('change', event => { if (event.target.files.length) handleLogoFile(event.target.files[0]); });

    function handleLogoFile(file) {
        const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
        if (!isSvg && !['image/png', 'image/jpeg'].includes(file.type)) return;
        state.ecc = 'H';
        $('select-ecc').value = 'H';
        const reader = new FileReader();
        reader.onerror = () => { removeLogoBtn.classList.add('hidden'); };
        reader.onload = event => {
            if (isSvg) {
                state.logoIsSvg = true;
                state.logoSvgRaw = asText(event.target.result);
                state.logoDataUrl = `data:image/svg+xml;base64,${encodeBase64(state.logoSvgRaw)}`;
            } else {
                state.logoIsSvg = false;
                state.logoSvgRaw = null;
                state.logoDataUrl = asText(event.target.result);
            }
            removeLogoBtn.classList.remove('hidden');
            updatePreview();
        };
        isSvg ? reader.readAsText(file) : reader.readAsDataURL(file);
    }

    on('btn-remove-logo', 'click', () => {
        state.logoDataUrl = null;
        state.logoIsSvg = false;
        state.logoSvgRaw = null;
        fileInput.value = '';
        removeLogoBtn.classList.add('hidden');
        updatePreview();
    });
    on('range-logo-size', 'input', event => { state.logoSize = clamp(numberOr(event.target.value, 15), 5, 35); $('logo-size-val').textContent = `${state.logoSize}%`; updatePreview(); });
    on('range-logo-padding', 'input', event => { state.logoPadding = clamp(numberOr(event.target.value, 4), 0, 15); $('logo-padding-val').textContent = `${state.logoPadding}px`; updatePreview(); });
    on('chk-logo-bg-mask', 'change', event => { state.logoBgMask = event.target.checked; updatePreview(); });

    on('btn-export-svg', 'click', downloadSVG);
    on('btn-export-png', 'click', () => downloadRaster('png'));
    on('btn-export-jpg', 'click', () => downloadRaster('jpeg'));
    on('btn-export-webp', 'click', () => downloadRaster('webp'));
    on('btn-export-pdf', 'click', downloadPDF);
    on('btn-copy-base64', 'click', async () => {
        if (!prepareExport()) return;
        const b64 = `data:image/svg+xml;base64,${encodeBase64(generateQRCodeSVG())}`;
        let copied = false;
        try {
            if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(b64); copied = true; }
        } catch (error) { /* use the fallback below */ }
        if (!copied && document.execCommand) {
            const textarea = document.createElement('textarea');
            textarea.value = b64;
            document.body.appendChild(textarea);
            textarea.select();
            copied = document.execCommand('copy');
            textarea.remove();
        }
        const button = $('btn-copy-base64');
        const original = button.innerHTML;
        button.innerHTML = copied ? '<i class="fa-solid fa-check text-emerald-500"></i> Copied!' : 'Copy failed';
        setTimeout(() => { button.innerHTML = original; }, 2000);
    });

    on('btn-open-camera', 'click', openCameraModal);
    on('btn-close-camera', 'click', closeCameraModal);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeCameraModal();
            closePrintSheet();
        }
    });
    const sheetPages = {
        a4: { name: 'A4', width: 210, height: 297 },
        letter: { name: 'Letter', width: 215.9, height: 279.4 }
    };

    function getSheetConfig() {
        const [columns, rows] = $('select-sheet-layout').value.split('x').map(Number);
        return {
            page: sheetPages[$('select-sheet-page').value] || sheetPages.a4,
            columns, rows,
            margin: clamp(numberOr($('input-sheet-margin').value, 10), 0, 40),
            gap: clamp(numberOr($('input-sheet-gap').value, 4), 0, 20),
            label: $('input-sheet-label').value.trim(),
            showPayload: $('chk-sheet-show-payload').checked
        };
    }

    function updateSheetSummary() {
        const config = getSheetConfig();
        const count = config.columns * config.rows;
        $('sheet-layout-summary').textContent = `${config.columns} × ${config.rows} (${count}) QR codes on ${config.page.name} with ${config.margin} mm margins and ${config.gap} mm gaps.`;
    }

    function closePrintSheet() {
        $('print-sheet-modal').classList.add('hidden');
    }

    function printSheet() {
        if (!prepareExport()) return;
        const config = getSheetConfig();
        const printArea = $('print-area');
        const payload = validatePayload().payload;
        const svg = generateQRCodeSVG();
        const label = config.label ? `<span style="font:600 9pt Arial,sans-serif;margin-top:2mm;">${escapeHtml(config.label)}</span>` : '';
        const payloadMarkup = config.showPayload ? `<span style="font:6pt monospace;max-width:100%;overflow-wrap:anywhere;margin-top:1mm;">${escapeHtml(payload)}</span>` : '';
        const cells = Array.from({ length: config.columns * config.rows }, () => `<div class="print-sheet-cell" style="padding:2mm;border:0.2mm solid #e2e8f0;"><div style="width:100%;min-height:0;flex:1 1 auto;display:flex;align-items:center;justify-content:center;">${svg}</div>${label}${payloadMarkup}</div>`).join('');
        printArea.innerHTML = `<div class="print-sheet-page" style="width:${config.page.width}mm;height:${config.page.height}mm;padding:${config.margin}mm;display:grid;grid-template-columns:repeat(${config.columns},minmax(0,1fr));grid-template-rows:repeat(${config.rows},minmax(0,1fr));gap:${config.gap}mm;">${cells}</div>`;
        closePrintSheet();
        printArea.classList.add('print-sheet-area');
        printArea.classList.remove('hidden');
        const cleanup = () => {
            printArea.classList.add('hidden');
            printArea.classList.remove('print-sheet-area');
            printArea.innerHTML = '';
        };
        window.addEventListener('afterprint', cleanup, { once: true });
        window.print();
    }

    on('btn-open-print-sheet', 'click', () => { updateSheetSummary(); $('print-sheet-modal').classList.remove('hidden'); });
    on('btn-close-print-sheet', 'click', closePrintSheet);
    on('btn-cancel-print-sheet', 'click', closePrintSheet);
    on('btn-print-sheet', 'click', printSheet);
    ['select-sheet-page', 'select-sheet-layout', 'input-sheet-margin', 'input-sheet-gap', 'input-sheet-label', 'chk-sheet-show-payload'].forEach(id => {
        on(id, $(id).type === 'checkbox' ? 'change' : $(id).tagName === 'SELECT' ? 'change' : 'input', updateSheetSummary);
    });

    on('btn-trigger-print', 'click', () => {
        if (prepareExport()) printCurrentDocument();
    });

    on('btn-export-json', 'click', () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `QR_Settings_${SESSION_ID}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    });

    const jsonInput = $('json-input');
    on('btn-import-json', 'click', () => jsonInput.click());
    jsonInput.addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = loadEvent => {
            try {
                const loaded = JSON.parse(loadEvent.target.result);
                if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) throw new Error('Settings file must be an object');
                applyLoadedState(loaded);
            } catch (error) {
                console.error('Invalid JSON settings file', error);
            } finally {
                jsonInput.value = '';
            }
        };
        reader.readAsText(file);
    });

    on('btn-reset-engine', 'click', () => {
        regenerateSessionId();
        const theme = state.theme;
        Object.assign(state, normalizeState(DEFAULT_STATE));
        state.theme = theme;
        state.dataValues = {};
        validationRequested = false;
        fileInput.value = '';
        applyTheme(theme, false);
        syncControls();
        renderDynamicFields();
    });

    let deferredInstallPrompt = null;
    if (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true) $('btn-install-pwa').classList.add('hidden');
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        $('btn-install-pwa').classList.remove('hidden');
    });
    on('btn-install-pwa', 'click', async () => {
        if (!deferredInstallPrompt) {
            const status = $('network-status');
            status.innerHTML = '<i class="fa-solid fa-circle-info"></i> Use your browser menu to install';
            status.className = 'hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300';
            window.setTimeout(updateNetworkStatus, 3500);
            return;
        }
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
    });
    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        $('btn-install-pwa').classList.add('hidden');
    });
    function updateNetworkStatus() {
        const online = navigator.onLine;
        const status = $('network-status');
        status.className = `hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold ${online ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'}`;
        status.innerHTML = `<i class="fa-solid ${online ? 'fa-wifi' : 'fa-cloud-arrow-down'}"></i> ${online ? 'Online' : 'Offline'}`;
    }
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(error => console.warn('Offline mode unavailable', error));

    syncControls();
    renderDynamicFields();
});
