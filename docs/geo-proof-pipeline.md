# Geo-proof image substitution pipeline

> Status: MVP shipped 2026-05-03. Owner: Florian (founder, in-country photographer).

## Why
FlashVoyage articles read more credibly when they include a first-person photo
shot by Florian in the country being covered. Stock Pexels/Flickr images are a
fallback — but a real "Photo prise par Florian à Bangkok le 02/05/2026" beats
any library shot for E-E-A-T and reader trust.

Goal: 100% automation. Florian shoots a photo on his phone, it lands on
Cloudinary tagged with the country, and the next time the AI pipeline writes
about that country it embeds the photo automatically — no manual editing.

## Architecture (3 layers)

```
[1. INPUT]                 [2. STORAGE]                  [3. SUBSTITUTION]
phone photo  ─►  Cloudinary upload  ─►  article generator detects [GEO_PROOF]
+ country tag    + tags + context        ─►  resolveGeoProof(country)
                                          ─►  inject <figure> in HTML
                                          ─►  guardrail-safe before WP publish
```

## 1. Input layer — how Florian's photo gets to Cloudinary

Options evaluated, ranked by simplicity for a solo founder on the road:

| Rank | Option | Tax per photo | Reliability | Setup cost |
|------|--------|---------------|-------------|------------|
| **1** | **iOS Shortcut → Cloudinary upload API with country auto-tagged from current locale/Shortcut prompt** | ~5 sec (one tap) | High | 15 min one-time |
| 2 | Cloudinary mobile app (manual tag per upload) | ~15 sec | High | 0 |
| 3 | iOS Shortcut → EXIF GPS → reverse geocode → tag | ~3 sec | Medium (EXIF stripped on share, reverse-geocode quota) | 1h |
| 4 | Telegram bot ingest | ~10 sec | Medium (extra service to maintain) | 2h |
| 5 | Dropbox folder + cron sync | passive | Low (delay, no tagging) | 1h |

### Recommended: Option 1 — iOS Shortcut with country prompt

Single shortcut on the iPhone home screen:
1. Pick photo from camera roll (or take new one)
2. Prompt "Quel pays ?" → menu with 14 Asia countries (`thailande`, `vietnam`,
   `indonesie`, `japon`, `philippines`, `cambodge`, `laos`, `malaisie`,
   `singapour`, `birmanie`, `taiwan`, `coree`, `inde`, `nepal`, `sri-lanka`)
3. Optional prompt "Ville ?" (free text, becomes Cloudinary `context.city`)
4. POST `https://api.cloudinary.com/v1_1/<cloud>/image/upload` with:
   - `upload_preset=geo_proof_signed`
   - `folder=flashvoyage-geo-proof/<country>`
   - `tags=geo-proof,<country>,<YYYY-MM>`
   - `context=country=<country>|city=<city>|taken_at=<ISO>`

Why this wins: 1 tap from the home screen, no third-party service, no GPS
quota, country is always correct because Florian picks it. EXIF date is
preserved for the caption.

Fallback if Shortcut breaks: open the Cloudinary mobile app, upload to folder
`flashvoyage-geo-proof/<country>` and add tag `geo-proof,<country>`.

## 2. Tagging convention

The resolver searches by **tag**, not folder, so tagging is the contract.

Required tags on every geo-proof asset (all lowercase, no accents):
- `geo-proof` — distinguishes first-person shots from stock/Pexels assets
- `<country>` — one of the 14 country slugs above (no accent: `thailande` not `thaïlande`)

Author attribution is handled at the WP layer (post.author byline). No need to
encode photographer identity in the photo tag — photos are pooled across the
6 WP authors (flash-voyage, claire-nomade, claire-moreau, marc-delacroix,
sophie-leclerc, thomas-renard), and any author can use any country shot.

Optional but recommended:
- `<YYYY-MM>` — month bucket, lets us prefer recent photos
- `context.city=<city>` — used for caption ("à Bangkok")
- `context.caption=<override>` — manual caption override if Florian wants
  something specific (rare, but supported)

Folder convention (cosmetic, for browsing in Cloudinary UI):
`flashvoyage-geo-proof/<country>/`

## 3. Substitution layer

### Placeholder format
The Anthropic-generated HTML contains `[GEO_PROOF]` exactly once, somewhere in
the introduction. Country is **not** in the marker — it's derived from
`article.final_destination` at injection time. This keeps the LLM prompt
simple and prevents the model from inventing country slugs.

### Resolver
`intelligence/geo-proof-resolver.js` exports two functions:

- `resolveGeoProof(country, options) → {url, caption, taken_at, public_id} | null`
  - Searches Cloudinary by tag: `tags=geo-proof AND tags=<country>`
  - Picks the most recent (newest `created_at`)
  - Caches per-country for the duration of the process
  - Returns `null` if no match (signals fallback)

- `injectGeoProof(htmlContent, country, options) → htmlContent`
  - Finds `[GEO_PROOF]` markers (case-sensitive)
  - For each, calls `resolveGeoProof(country)`
  - On hit: replaces with `<figure class="fv-geo-proof">…</figure>`
  - On miss: **strips the marker** (does NOT leave it in HTML — guardrails
    would flag it next to `[VERIFY]`)

### Caption auto-generation
Pulled from Cloudinary `context.city`, `context.caption`, and `created_at`:

```
Photo prise par Florian à <city> le DD/MM/YYYY
```

If `context.city` missing, fall back to the country display name.
If `context.caption` is set, use that verbatim (escape HTML).

### Hook point in publish flow
`enhanced-ultra-generator.js → publishToWordPress(article)`. Right BEFORE
`assertContentSafeToPublish` is called (~line 2950), call:

```js
const country = article.final_destination || article.destination || article.meta?.destination;
article.content = await injectGeoProof(article.content, country, { logger: console });
wordpressData.content = article.content;
```

This guarantees:
1. Substitution runs after every other content pass (no later step can re-introduce the marker)
2. Guardrails fire AFTER substitution, so a leaked `[GEO_PROOF]` would block the publish (defensive)
3. If resolver returns null, the marker is stripped — no `[VERIFY]`-style leak

## 4. Fallback behavior

Priority cascade when `[GEO_PROOF]` placeholder is encountered:

1. Cloudinary tag match for `<country>` → use it
2. No country match → Cloudinary tag match for any `geo-proof` photo of an
   Asia country (degraded but still founder-shot) — **disabled by default**,
   opt-in via `options.allowAnyGeoProof = true`
3. No geo-proof asset at all → strip marker (article still publishes,
   existing Pexels inline images unaffected)

We do NOT fall back to Pexels for a `[GEO_PROOF]` placeholder. The whole
point is "real founder photo or no photo at all."

## 5. Environment / credentials

Required env vars (added to `.env`, NOT to `env.example` git-tracked file
unless the user wants):

```
CLOUDINARY_CLOUD_NAME=<account>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>      # required for Admin API search
```

API used: Admin Search API
`POST https://api.cloudinary.com/v1_1/<cloud>/resources/search`
Auth: HTTP Basic with API key + secret.

If env vars are missing, `resolveGeoProof` returns `null` (graceful degrade)
and logs a one-line warning. It does not throw.

## 6. Seed photos required

As of 2026-05-03 the Cloudinary account has 0 assets tagged `geo-proof`.
Florian needs to upload at least 1 photo per country he plans to write about
in the next 7 days. Recommended seed (based on travel calendar):

- `thailande` — 2-3 photos (Bangkok / Chiang Mai / island)
- `vietnam` — 2-3 photos (Hanoi / Hoi An / Saigon)
- `indonesie` — 2 photos (Bali, ideally Ubud + Canggu)
- `philippines` — 1-2 photos (Manille or Palawan)

Each upload via the Shortcut takes ~5 seconds. 30 seconds total to seed the
next month of articles.

## 7. Open questions / future iteration

- Should we de-dupe photos across articles? (cf. `used-images.json` pattern
  in `image-source-manager.js`). MVP says no — same photo can appear in
  multiple articles. Iterate if/when readers complain.
- Do we want the resolver to weight by Cloudinary `quality_score` or face
  count? Probably yes for the "money pages" pipeline. MVP: just newest wins.
- Caption translation: photos shot in non-French-speaking cities — caption
  is always in French ("Photo prise par Florian à Bangkok"). Good for now.
- Multiple `[GEO_PROOF]` markers per article? MVP supports it (loop), but
  the prompt instructs LLM to use it ONCE per article.
