# QR Pro Studio

Compact client-side QR generator with dynamic QR redirects, scan analytics, batch generation, printable sheets, shareable presets, PDF/WebP export, and PWA support.

## Local development

```bash
npm install
npm start
```

Open `http://localhost:4173`.

Local `server.js` uses `data/db.json` as a development fallback. That file is intentionally ignored by Git. The Vercel deployment uses the serverless functions in `api/` and Neon Postgres instead.

## Deploy with Vercel and Neon

1. Create a Neon project and copy its pooled connection string.
2. Push this project to GitHub.
3. Import the repository into Vercel.
4. Add the following Vercel environment variables for the Production, Preview, and Development environments as needed:

   ```text
   DATABASE_URL=your Neon pooled connection string
   QR_API_KEY=optional-long-random-api-key
   PUBLIC_BASE_URL=https://your-production-domain.example
   ```

   `QR_API_KEY` is optional. If omitted, the first serverless request generates one and persists it in Neon. Supplying one through Vercel is preferred when the key must be managed outside the database.

5. Deploy. The first database-backed request creates the required tables automatically. The equivalent SQL is also available at `db/schema.sql` if you prefer to run the migration manually in Neon.

`vercel.json` rewrites public short links from `/r/:slug` to the redirect function at `/api/redirect`, so printed QR codes continue to resolve without an API key.

## Public API

Open **Dashboard → Public API** to view the current API key and endpoint documentation.

The API supports:

- `GET /api/v1/dynamic-codes`
- `POST /api/v1/dynamic-codes`
- `PATCH /api/v1/dynamic-codes/:id`
- `DELETE /api/v1/dynamic-codes/:id`
- `GET /api/v1/dynamic-codes/:id/analytics`
- `GET /r/:slug` for public redirects and scan tracking

Authenticate API requests with either:

```text
X-API-Key: YOUR_API_KEY
```

or:

```text
Authorization: Bearer YOUR_API_KEY
```

Scan events store the timestamp, device category, referrer, and language. Raw IP addresses are not stored.

## Production notes

The dashboard currently uses the API key as its management credential, as requested. Before a public launch, consider adding owner authentication, API-key rotation, rate limiting, abuse protection, monitoring, and database backups.
