# Authority Amplifier

Reusable module that runs automatically on every article publish to surface
amplification opportunities on platforms where Florian already has authority.
**The module queues actions only — it never executes them.** Florian (or a
future dashboard) approves and executes.

## Why

Florian's Quora FR profile (`Florian-Gouloubi`) consistently pulls
11k-25k views/week with 4+ "Sélection Quora" editorial features on Asie du
Sud-Est topics. Instead of manually asking "can we leverage my Quora reach?"
on every publish, this module answers the question automatically and writes
a reviewable queue.

## Architecture

```
article publish
      │
      ▼
article-finalizer  ──Phase 8c──▶  resolveAffiliatePlaceholders
      │
      ▼
WP PUT (publishToWordPress)
      │
      ▼                     ┌────────────────────────┐
Phase 9: authorityAmplify  ─┤ intelligence/          │
 (non-blocking)             │   authority-amplifier  │
                            │     ├─ Quora (v1)      │
                            │     ├─ Reddit (stub)   │
                            │     └─ …               │
                            └────────────┬───────────┘
                                         │
                                         ▼
                      data/amplifier-queue/<slug>.json
```

### Files

| Path | Role |
| --- | --- |
| `intelligence/authority-amplifier.js` | public API + scoring + platform dispatch |
| `intelligence/quora-profile-scraper.js` | Playwright scraper (Bright Data proxy optional) + cache |
| `data/live-cache/quora-profile-<handle>.json` | cached profile snapshot (≤ 7d) |
| `data/amplifier-queue/<slug>.json` | per-article queue (see shape below) |
| `scripts/backfill-amplifier-queue.mjs` | retroactive runner |
| `scripts/test-authority-amplifier.mjs` | smoke test |

## Public API

```js
import {
  amplifyArticle,
  getQueueForSlug,
  markActionExecuted,
} from './intelligence/authority-amplifier.js';

await amplifyArticle({
  slug: 'esim-philippines-globe-smart-comparatif-2026',
  title: 'ESIM Philippines : Globe vs Smart en 2026',
  url: 'https://flashvoyage.com/esim-philippines-…/',
  primaryKeyword: 'esim philippines',
  topicTokens: ['esim', 'philippines', 'globe', 'smart'],
});
// → { queued: 5, byPlatform: { quora: {...}, reddit: {...} }, queueFile: '…' }
```

## Queue file shape

```jsonc
{
  "slug": "esim-philippines-globe-smart-comparatif-2026",
  "title": "…",
  "url": "https://flashvoyage.com/…",
  "primaryKeyword": "esim philippines",
  "topicTokens": ["esim", "philippines"],
  "generatedAt": "2026-04-24T02:15:00.000Z",
  "generator": "authority-amplifier@v1",
  "degraded": false,
  "notes": [],
  "actions": [
    {
      "id": "amp_quora_9c2f1a7e4d",
      "platform": "quora",
      "type": "edit-existing-answer",
      "status": "pending",
      "accountHandle": "Florian-Gouloubi",
      "targetUrl": "https://fr.quora.com/…/answer/Florian-Gouloubi",
      "targetTitle": "Quelle eSIM choisir pour les Philippines ?",
      "targetQuestionUrl": "https://fr.quora.com/Quelle-eSIM-…",
      "reach": { "views": 18400, "upvotes": 47 },
      "score": 52,
      "rationale": "shared_tokens=6 (+18), same_destination (+5), views≥10k (×2)",
      "insertText": "Si tu creuses le sujet Globe vs Smart…",
      "sourceSnippet": "…",
      "createdAt": "2026-04-24T02:15:00.000Z"
    }
  ]
}
```

`status` progresses `pending → executed | skipped`. `markActionExecuted(id, result)`
mutates the file in place, adding `executedAt` and `result`.

## Scoring

For every cached Quora answer we compute:

| Signal | Points |
| --- | --- |
| Shared token with slug/keyword/topic tokens | +3 each |
| Same destination (PH article ↔ PH answer) | +5 |
| Adjacent destination (both in same geo cluster, e.g. SEA) | +2 |
| Baseline views ≥ 10 000 | × 2 |
| Baseline views ≥ 5 000 | × 1.5 |

Top `AMPLIFIER_TOP_N` (default 5) answers per platform are kept.

## Caching & coordination

1. Load `data/live-cache/quora-profile-<handle>.json`.
2. If missing or `scrapedAt` older than `AMPLIFIER_CACHE_DAYS` (default 7):
   - If a fresh (< 60 s) sibling snapshot exists at
     `/tmp/quora_profile_florian.json`, use it.
   - Else, launch `scrapeQuoraProfile(handle)` which uses Playwright +
     optional Bright Data residential proxy. If the login wall is
     detected we gracefully degrade to public-view data (no view counts).
3. On any scrape failure, write a degraded queue (`degraded: true`,
   `actions: []`) — the publish pipeline **never** fails because of this
   module.

## How Florian reviews + approves

Two paths:

- **Dashboard (recommended, WIP by sibling agent).** Lists pending actions
  across slugs, shows rationale + generated `insertText`, one-click
  "Execute on Quora" button → calls an executor that drives the existing
  `scripts/linkbuilding/quora-local.js` Chrome session. On success,
  calls `markActionExecuted(id, { status: 'executed', newUrl, … })`.
- **Manual.** Open `data/amplifier-queue/<slug>.json`, cherry-pick
  actions, paste the `insertText` + link into Quora by hand, then
  `markActionExecuted` via a small CLI.

## Extending to a new platform (Reddit, Routard, LinkedIn, Twitter…)

The dispatcher in `amplifyArticle` is platform-agnostic. To add a new
platform, implement these three concerns:

1. **Profile snapshot** — an async function that returns
   `{ scrapedAt, answers: [...] }` from cache, re-scraping if stale.
   Same shape as the Quora snapshot (objects with `targetUrl`, `targetTitle`,
   `snippet`, `views`, `upvotes`, optional `topics`).
2. **Scoring** — `scoreAnswer(snapshot, fingerprint)` already works on any
   object with `questionTitle` + `snippet` fields. Rename/alias as needed.
3. **Insertion generator** — reuse `generateInsertionText` with a
   platform-specific system prompt (e.g. for Reddit: "ajoute une ligne en
   français cool, sans sonner influenceur, qui cite le lien comme source
   personnelle").

Then add a new `buildXxxActions({ snapshot, fingerprint, article, slug, … })`
function, push its `actions[]` into `allActions` inside `amplifyArticle`,
and expose the platform stats under `byPlatform.<name>`. Nothing else
needs to change — the queue file shape and the `markActionExecuted` API
are already platform-agnostic.

### Known gaps / TODO

- `scripts/linkbuilding/quora-local.js` can publish **new** answers but
  cannot yet edit **existing** answers. Queue type `edit-existing-answer`
  is currently review-only; a companion executor must be built before
  any auto-execution.
- Bright Data creds (`BRIGHTDATA_HOST/PORT/USERNAME/PASSWORD`) are
  optional — the scraper works without them, but residential IPs are
  strongly recommended before any meaningful scale.
- `min-traffic` in the backfill script is a placeholder proxy
  (featured-image + excerpt length). Swap in GSC impressions once the
  intelligence layer exposes per-slug traffic.
