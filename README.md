# QR Pro Studio

A browser-based QR code generator for creating, validating, customizing, exporting, and printing QR codes.

## Deploy

This is a static project. Upload the folder to GitHub and import the repository into Vercel. No server, database, environment variables, or build command is required.

`vercel.json` enables clean URLs: `.html` extensions are removed and trailing slashes are avoided. Vercel can serve `index.html` directly. All QR generation, validation, settings export/import, camera scanning, batch generation, and printable sheets run in the browser.

## Run locally

Open `index.html` in a browser, or use any static file server from the project folder:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Content types

The generator supports URL, text, Wi-Fi, vCard, email, phone, SMS, WhatsApp, geographic coordinates, calendar events, crypto wallets, social profiles, maps, payments, app downloads, meeting links, coupons, reviews, and raw payloads.

Map links use Google Maps search or directions URLs. Payment mode supports payment links, UPI URIs, and PayPal.Me links. Coupon mode creates a structured text payload; add a redemption URL when the offer should open a website.

## Privacy

QR generation remains in the browser. The project does not include saved presets, a backend, database, public API, redirect service, or scan-tracking system.
