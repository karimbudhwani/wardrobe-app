# 👗 Wardrobe: AI closet and context-aware outfit suggestions

Inspired by [this post](https://x.com/cdngdev/status/2076812846793650485). Import photos of your clothes and each piece is detected, cut out and tagged. Then browse your closet, get the **top 3 outfits** for the weather and the occasion (Diwali, Eid, a sangeet, church, black-tie, Oktoberfest, Lunar New Year and more), and render yourself wearing them.

See [PLAN.md](PLAN.md) for the stack, data model and model choices.

## Features
- **Accounts:** email and password (bcrypt hashing), a stateless signed (JWT) httpOnly session cookie, and rate-limited auth.
- **Private photo storage:** photos live in a private Supabase Storage bucket under `<userId>/<random>` and are only served to their owner, streamed through authenticated routes.
- **Closet import:** upload several photos at once. With an `OPENAI_API_KEY`, `gpt-4o-mini` vision finds *every* garment, with a bounding box for the cutout and tags for type, category, color, pattern, fabric, seasons, formality, cultural style, modesty and waterproofing. Without a key, demo mode turns each photo into one item tagged from the filename or hint. All tags can be edited.
- **Wardrobe grid:** a responsive grid with search and filters for type, season, formality, cultural style and color.
- **Outfit builder:** builds outfits only from items you own, adds an outerwear layer when the weather needs one, and suggests optional items to buy for gaps (for example, rain jacket, waterproof boots, or a festive kurta).
- **Context-aware top 3:** combines the forecast (Open-Meteo, no key needed, from browser geolocation or a typed city, up to 16 days ahead, with a seasonal estimate otherwise), 35+ occasions across Indian, Islamic, Sikh, Christian/Western, European, East Asian, Jewish and African traditions (colors to favor or avoid, modesty, traditional vs fusion, formality), and your closet. Each outfit has a short reason and a **fallback** if its key piece is missing.
- **Try-on:** upload a photo of yourself, then render. With a key, it uses `gpt-image-1` image edits (your photo plus garment photos). In demo mode it makes a composite preview card.
- **Saved outfits**, plus a sample closet of 29 items (Western, South Asian and European pieces) and a demo account: `demo@wardrobe.app` / `demo1234`.

## Architecture
- **Vercel** runs the whole Express app as one serverless function (`api/index.js`); `vercel.json` rewrites every path to it, and it also serves `public/`.
- **Supabase Postgres** holds users, photos (metadata), items and outfits (`supabase/schema.sql`). **Supabase Storage** holds the photo bytes in a private bucket.
- The server talks to Supabase **only over HTTPS** with `@supabase/supabase-js` and the service-role key (never sent to the browser). There is no direct Postgres connection.
- **Sessions** are stateless: a JWT signed with `SESSION_SECRET` in an httpOnly, `SameSite=Lax` cookie named `wsid` (14 days), so any function instance can verify it.

## 1. Set up Supabase (free tier, no card)
1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste and run `supabase/schema.sql`. It creates the tables, turns on RLS (no policies, so the public anon key can't touch them) and creates the private `wardrobe` bucket.
3. From **Project Settings → API**, copy the **Project URL** (`SUPABASE_URL`) and the **service_role** key (`SUPABASE_SERVICE_KEY`).
4. Seed the demo account and its sample closet:
   ```bash
   npm install
   cp .env.example .env    # fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET
   npm run seed
   ```
   `npm run seed` (`scripts/seed-supabase.js`) can be re-run safely. It makes sure the bucket exists, creates `demo@wardrobe.app` / `demo1234` (or resets its password), and adds only the sample items that are missing. New users who register get their own copy of the 29-item sample closet automatically.

## 2. Run locally
```bash
npm start              # http://localhost:3000 (reads env vars; export them or use `node --env-file=.env server.js`)
npm test               # API and engine tests (Vitest + Supertest), in-memory, no credentials needed
npx playwright install chromium && npm run screenshots   # with the server running
```
You need Node 20. `npm test` runs the full API suite against an in-memory copy of the data layer (`tests/memory-db.js`). The live test, `tests/supabase.live.test.js`, only runs when `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set (run `npm run seed` first).

## 3. Deploy to Vercel (free Hobby plan)
1. Push the repo to GitHub, then on [vercel.com](https://vercel.com) choose **Add New → Project** and import it. Framework preset: **Other**. Leave the build command empty.
2. Add the environment variables below (Production, and Preview if you want it), with `COOKIE_SECURE=1`.
3. Deploy. Every path goes to `api/index.js`. Check `https://<your-app>.vercel.app/healthz`, then sign in with the demo account.

Or from the CLI: `npx vercel link`, then `npx vercel env add SUPABASE_URL` (and the rest), then `npx vercel --prod`.

## Environment variables
| Var | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | **yes** | Supabase project URL, `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | **yes** | Service-role key. Server-side only, and it bypasses RLS, so keep it secret. |
| `SUPABASE_BUCKET` | no (`wardrobe`) | Private Storage bucket for photos |
| `SESSION_SECRET` | **yes in prod** | Signs session JWTs. Required on Vercel/production (the app refuses to start without it); locally a random per-process secret is used, with a warning. |
| `COOKIE_SECURE` | no | Set to `1` behind HTTPS (always on Vercel) |
| `OPENAI_API_KEY` | no | Turns on AI detection, tagging and photoreal try-on. Without it the app runs in demo mode. |
| `OPENAI_VISION_MODEL` / `OPENAI_IMAGE_MODEL` | no | Override `gpt-4o-mini` / `gpt-image-1` |
| `PORT` | no (3000) | Local `npm start` only |

Weather uses [Open-Meteo](https://open-meteo.com), which needs no key.

### Other hosts
- **Docker:** `docker build -t wardrobe . && docker run -p 3000:3000 --env-file .env wardrobe`
- Any Node 20 host works with `npm start` and the same env vars. No disk is needed.

## API (all JSON; session cookie required except auth and events)
`POST /api/auth/register|login|logout`, `GET /api/me`, `GET /api/items?category&season&formality&style&color&q`, `POST /api/items/import` (multipart `photos[]`, `hint`), `POST /api/items/seed`, `PATCH|DELETE /api/items/:id`, `GET /api/items/:id/image`, `GET /api/events`, `GET /api/weather?q|lat&lon&date`, `POST /api/suggest {event,q|lat,lon,date,useWeather}`, `GET|POST /api/outfits`, `POST /api/selfie` (multipart `photo`), `POST /api/tryon {itemIds,outfitId?}`.

## Known limitations
- In demo mode, detection is one item per photo with keyword tagging, and try-on is a composite rather than a generated image.
- The "cutout" is a bounding-box crop, not a pixel-perfect segmentation mask. Adding SAM or rembg is the next step.
- Outfit ranking is rule-based (deterministic and explainable). It doesn't learn from your feedback yet.
- Vercel caps request bodies at about 4.5 MB, so large or multi-photo imports may need to be split into several uploads (the app still accepts up to 12 MB per file when self-hosted). Long AI calls are limited by the function's `maxDuration` (60 s in `vercel.json`).
- The auth rate limiter is in memory, per function instance. Use a shared store (for example Upstash) for strict limits.
- Logout clears the cookie, but a stolen JWT stays valid until it expires (14 days). Rotate `SESSION_SECRET` to invalidate every session.
- iOS HEIC uploads are accepted, but they only preview in browsers that support HEIC.
