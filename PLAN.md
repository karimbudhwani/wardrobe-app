# Wardrobe — Plan

Inspired by https://x.com/cdngdev/status/2076812846793650485: an AI went through a camera roll, pulled out every clothing item into a visual wardrobe, suggested new outfits, and rendered them on the user with an image model.

## Stack
- **Backend:** Node 20 + Express. Pure JS/WASM dependencies only, so there's no native build step: `sql.js` (SQLite compiled to WASM, saved to `data/wardrobe.db`), `bcryptjs`, `express-session`, `multer`, `helmet`, `express-rate-limit`.
- **Frontend:** a single-page app with no build step, using vanilla JS and CSS. It's mobile-first and responsive.
- **Tests:** Vitest + Supertest for the API flows. Screenshots come from headless Playwright.
- **Deploy:** any Node host (Render, Fly, Railway, a VPS). The demo runs on the box behind a Cloudflare quick tunnel, which needs no account.

## Data model (SQLite)
- `users(id, email UNIQUE, password_hash, name, created_at)`
- `photos(id, user_id, kind['closet'|'selfie'|'render'], file, mime, created_at)`: the original uploads, kept private.
- `items(id, user_id, photo_id NULL, svg NULL, bbox JSON NULL, name, type, category[top|bottom|onepiece|outerwear|shoes|accessory], color, color_hex, pattern, fabric, seasons JSON, formality 1-5, cultural_style, modest 0/1, waterproof 0/1, created_at)`. The cutout is the photo plus a normalized bbox (cropped with CSS), or the seed SVG.
- `outfits(id, user_id, item_ids JSON, context JSON, reason, render_photo_id NULL, created_at)`

## AI models (all optional, used when `OPENAI_API_KEY` is set)
- **Detection and tagging:** `gpt-4o-mini` vision with a JSON schema. It returns every garment with a bbox and tags (type, color, pattern, fabric, season, formality, cultural style).
- **Outfit reasoning:** a deterministic scoring engine (weather, event norms, closet) that is fast, testable, and free. The LLM isn't needed.
- **Try-on:** `gpt-image-1` image edit, given the user photo, the garment photos, and a prompt.
- **Demo mode (no key):** each upload becomes one item, tagged by keyword heuristics plus the user's own edits. Try-on returns a composited preview card.

## Weather
- **Open-Meteo** (no key): its geocoding API plus its daily forecast (up to 16 days). Location comes from browser geolocation or typed text. If the network is unreachable, it falls back to a seasonal estimate.

## Events
- A curated catalog of 35+ occasions across Indian, Western, European, East Asian, Middle Eastern, African, and Jewish traditions. Each one has a formality range, colors to favor or avoid, a modesty flag, and whether traditional or fusion dress is preferred. Free text is matched to the catalog by keywords.
