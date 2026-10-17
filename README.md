# 👗 Wardrobe: AI closet and context-aware outfit suggestions

Inspired by [this post](https://x.com/cdngdev/status/2076812846793650485). Import photos of your clothes and each piece is detected, cut out and tagged. Then browse your closet, get the **top 3 outfits** for the weather and the occasion (Diwali, Eid, a sangeet, church, black-tie, Oktoberfest, Lunar New Year and more), and render yourself wearing them.

See [PLAN.md](PLAN.md) for the stack, data model and model choices.

## Features
- **Accounts:** email and password (bcrypt hashing), an httpOnly session cookie, and rate-limited auth.
- **Private photo storage:** files live outside the web root under random names and are only served to their owner through authenticated routes.
- **Closet import:** upload several photos at once. With an `OPENAI_API_KEY`, `gpt-4o-mini` vision finds *every* garment, with a bounding box for the cutout and tags for type, category, color, pattern, fabric, seasons, formality, cultural style, modesty and waterproofing. Without a key, demo mode turns each photo into one item tagged from the filename or hint. All tags can be edited.
- **Wardrobe grid:** a responsive grid with search and filters for type, season, formality, cultural style and color.
- **Outfit builder:** builds outfits only from items you own, adds an outerwear layer when the weather needs one, and suggests optional items to buy for gaps (for example, rain jacket, waterproof boots, or a festive kurta).
- **Context-aware top 3:** combines the forecast (Open-Meteo, no key needed, from browser geolocation or a typed city, up to 16 days ahead, with a seasonal estimate otherwise), 35+ occasions across Indian, Islamic, Sikh, Christian/Western, European, East Asian, Jewish and African traditions (colors to favor or avoid, modesty, traditional vs fusion, formality), and your closet. Each outfit has a short reason and a **fallback** if its key piece is missing.
- **Try-on:** upload a photo of yourself, then render. With a key, it uses `gpt-image-1` image edits (your photo plus garment photos). In demo mode it makes a composite preview card.
- **Saved outfits**, plus a sample closet of 29 items (Western, South Asian and European pieces) and a demo account: `demo@wardrobe.app` / `demo1234`.

## Run locally
```bash
npm install
cp .env.example .env   # optional; export the variables or use your process manager
npm start              # http://localhost:3000
npm test               # 16 API and engine tests (Vitest + Supertest)
npx playwright install chromium && npm run screenshots   # with the server running
```
You need Node 18 or later. There are no native dependencies (SQLite runs through sql.js/WASM and is saved to `DATA_DIR/wardrobe.db`).

## Environment variables
| Var | Required | Purpose |
|---|---|---|
| `PORT` | no (3000) | HTTP port |
| `SESSION_SECRET` | **yes in prod** | Signs session cookies. If unset, a random secret is used per boot, so users get logged out on restart. |
| `COOKIE_SECURE` | no | `1` behind HTTPS |
| `DATA_DIR` | no (`./data`) | DB and private uploads. Mount persistent storage here. |
| `OPENAI_API_KEY` | no | Turns on AI detection, tagging and photoreal try-on. Without it the app runs in demo mode. |
| `OPENAI_VISION_MODEL` / `OPENAI_IMAGE_MODEL` | no | Override `gpt-4o-mini` / `gpt-image-1` |

Weather uses [Open-Meteo](https://open-meteo.com), which needs no key.

## Deploy
- **Docker:** `docker build -t wardrobe . && docker run -p 3000:3000 -v wardrobe:/data -e SESSION_SECRET=... wardrobe`
- **Render / Railway / Fly:** start command `npm start`. Attach a persistent disk at `DATA_DIR`.

## API (all JSON; session cookie required except auth and events)
`POST /api/auth/register|login|logout`, `GET /api/me`, `GET /api/items?category&season&formality&style&color&q`, `POST /api/items/import` (multipart `photos[]`, `hint`), `POST /api/items/seed`, `PATCH|DELETE /api/items/:id`, `GET /api/items/:id/image`, `GET /api/events`, `GET /api/weather?q|lat&lon&date`, `POST /api/suggest {event,q|lat,lon,date,useWeather}`, `GET|POST /api/outfits`, `POST /api/selfie` (multipart `photo`), `POST /api/tryon {itemIds,outfitId?}`.

## Known limitations
- In demo mode, detection is one item per photo with keyword tagging, and try-on is a composite rather than a generated image.
- The "cutout" is a bounding-box crop, not a pixel-perfect segmentation mask. Adding SAM or rembg is the next step.
- Outfit ranking is rule-based (deterministic and explainable). It doesn't learn from your feedback yet.
- SQLite runs in memory and is written to disk after each write. That's fine for personal or small use; switch to Postgres to scale.
- iOS HEIC uploads are accepted, but they only preview in browsers that support HEIC.
