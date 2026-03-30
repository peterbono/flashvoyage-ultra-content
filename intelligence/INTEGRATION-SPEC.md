# Content Intelligence Engine — Integration Specification

## Editorial Calendar Integration (editorial-calendar.js)

The existing `EditorialCalendar` class uses static cluster rotation. The following
changes integrate intelligence data without breaking the existing flow.

### Changes to `editorial-calendar.js`

#### 1. Add intelligence queue reader in constructor

```javascript
// After STATE_PATH definition, add:
const QUEUE_PATH = path.join(__dirname, 'data', 'next-articles-queue.json');

// In constructor, add:
this.intelligenceQueue = this._loadIntelligenceQueue();
```

#### 2. Add `_loadIntelligenceQueue()` method

```javascript
_loadIntelligenceQueue() {
  try {
    if (fs.existsSync(QUEUE_PATH)) {
      const data = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
      // Only use queue if fresh (less than 48h old)
      const age = Date.now() - new Date(data.timestamp).getTime();
      if (age < 48 * 60 * 60 * 1000) {
        return data.queue || [];
      }
    }
  } catch (e) {
    console.warn(`CALENDAR: Intelligence queue unavailable: ${e.message}`);
  }
  return [];
}
```

#### 3. Modify `getNextDirective()` to check intelligence queue first

Before the existing cluster rotation logic, add:

```javascript
getNextDirective() {
  // NEW: Check intelligence queue for P1-P3 overrides
  const override = this._getIntelligenceOverride();
  if (override) return override;

  // EXISTING: Standard cluster rotation (unchanged)
  const cyclePos = this.state.totalPublished % ARTICLE_TYPES.length;
  // ... rest of existing code ...
}
```

#### 4. Add `_getIntelligenceOverride()` method

```javascript
_getIntelligenceOverride() {
  // Only override for high-priority items (P1 update/enrich, P2 write_new)
  const actionable = this.intelligenceQueue.filter(item =>
    ['write_new', 'update', 'enrich'].includes(item.action) &&
    !this._wasRecentlyUsed(item.topic)
  );

  if (actionable.length === 0) return null;

  const item = actionable[0]; // Highest priority
  const cyclePos = this.state.totalPublished % ARTICLE_TYPES.length;

  return {
    articleType: item.articleType || 'support',
    cluster: this._findClusterForTopic(item),
    searchHints: this._buildSearchHints(item),
    cyclePosition: cyclePos,
    totalPublished: this.state.totalPublished,
    useRss: false,
    // NEW fields for intelligence-driven articles
    intelligenceSource: item.action,
    intelligencePriority: item.priority,
    intelligenceContext: item.context,
  };
}
```

#### 5. Add helper methods

```javascript
_wasRecentlyUsed(topic) {
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const recent = this.state.history.slice(-10).map(h => normalize(h.title));
  return recent.some(t => t.includes(normalize(topic).slice(0, 20)));
}

_findClusterForTopic(item) {
  const dest = item.context?.destination?.toLowerCase() || '';
  const matched = CLUSTERS.find(c =>
    c.destinations.some(d => d.toLowerCase().includes(dest))
  );
  return matched
    ? { id: matched.id, label: matched.label, destinations: matched.destinations }
    : CLUSTERS[0]; // fallback to first cluster
}

_buildSearchHints(item) {
  const hints = [];
  if (item.context?.suggestedTitle) hints.push(item.context.suggestedTitle);
  if (item.context?.destination) hints.push(item.context.destination);
  if (item.topic) hints.push(item.topic);
  return hints.slice(0, 5);
}
```

### Changes to `enhanced-ultra-generator.js`

The generator receives the directive from `editorial-calendar.js`. When the directive
contains `intelligenceSource`, the generator should:

1. Log the intelligence source for tracking
2. Pass `intelligenceContext.suggestedTitle` as a strong hint to the LLM prompt
3. For `update` actions, fetch the existing article from WP and pass it as context
4. For `enrich` actions, only add widgets (skip full regeneration)

```javascript
// In the article generation flow, after getting directive:
if (directive.intelligenceSource) {
  log(`Intelligence-driven article: ${directive.intelligenceSource} (${directive.intelligencePriority})`);
  // Use suggestedTitle as primary topic hint
  if (directive.intelligenceContext?.suggestedTitle) {
    topicOverride = directive.intelligenceContext.suggestedTitle;
  }
}
```

---

## Data Flow Diagram

```
                    ┌─────────────────────────┐
                    │     CRON 3h00 UTC        │
                    │  content-intelligence.yml│
                    └──────────┬──────────────┘
                               │
        ┌──────────────────────┼───────────────────────┐
        │                      │                        │
        ▼                      ▼                        ▼
┌───────────────┐   ┌─────────────────┐   ┌──────────────────┐
│  WP REST API  │   │   GA4 API       │   │  Google Trends   │
│  118 articles │   │  Traffic data   │   │  Rising queries  │
└───────┬───────┘   └────────┬────────┘   └────────┬─────────┘
        │                    │                      │
        │    ┌───────────────┼──────────────────────┤
        │    │               │                      │
        ▼    ▼               ▼                      │
   ┌────────────────────────────────┐               │
   │   article-scorer.js           │               │
   │   → data/article-scores.json  │               │
   └──────────────┬─────────────────┘               │
                  │                                  │
                  │    ┌─────────────────────────────┤
                  │    │                             │
                  ▼    ▼                             ▼
        ┌──────────────────────────────────────────────┐
        │   content-gap-detector.js                    │
        │   + Search Console API (if available)        │
        │   → data/content-gaps.json                   │
        └──────────────────┬───────────────────────────┘
                           │
        ┌──────────────────┤
        │                  │
        ▼                  │
┌───────────────────┐      │
│ IG Stats API      │      │
│ Reel performance  │      │
└───────┬───────────┘      │
        │                  │
        ▼                  │
┌──────────────────────┐   │
│ article-reel-linker  │   │
│ → data/article-reel- │   │
│   map.json           │   │
└──────────┬───────────┘   │
           │               │
           ▼               ▼
  ┌─────────────────────────────────┐
  │   article-prioritizer.js       │
  │   → data/next-articles-queue   │
  └──────────────┬──────────────────┘
                 │
                 │   CRON 4h00 UTC (daily-analytics.yml)
                 │   already runs trends + IG + GA4 + performance-scorer
                 │
                 ▼
  ┌─────────────────────────────────┐
  │   editorial-calendar.js        │
  │   reads next-articles-queue    │
  │   overrides cluster rotation   │
  │   for P1-P3 items              │
  └──────────────┬──────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────┐
  │   enhanced-ultra-generator.js  │
  │   generates article            │
  └──────────────┬──────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────┐
  │   article-finalizer.js         │
  │   publishes to WordPress       │
  └─────────────────────────────────┘
```

## File Architecture

```
flashvoyage-content/
├── intelligence/                          # NEW — Content Intelligence Engine
│   ├── article-scorer.js                  # Scores all 118+ articles (0-100)
│   ├── content-gap-detector.js            # Finds missing content topics
│   ├── article-prioritizer.js             # Decides what to write/update next
│   ├── article-reel-linker.js             # Bidirectional article ↔ reel map
│   ├── run-intelligence.js                # Orchestrator (CLI entry point)
│   └── INTEGRATION-SPEC.md               # This file
│
├── data/                                  # Shared data directory
│   ├── article-scores.json                # NEW — Output of article-scorer
│   ├── content-gaps.json                  # NEW — Output of gap-detector
│   ├── next-articles-queue.json           # NEW — Output of prioritizer
│   ├── article-reel-map.json              # NEW — Output of reel-linker
│   ├── editorial-calendar.json            # EXISTING — Calendar state
│   ├── rss-processed.json                 # EXISTING — RSS feed state
│   └── ...
│
├── .github/workflows/
│   ├── content-intelligence.yml           # NEW — Daily cron at 3h UTC
│   ├── daily-analytics.yml                # EXISTING — Cron at 4h UTC
│   ├── publish-article.yml                # EXISTING — Article publication
│   └── ...
│
├── social-distributor/analytics/          # EXISTING — Data source modules
│   ├── ga4-fetcher.js                     # GA4 traffic data
│   ├── ig-stats-fetcher.js                # IG reel performance
│   └── performance-scorer.js              # Reel scoring formulas
│
├── social-distributor/sources/            # EXISTING — Data source modules
│   └── trends-scanner.js                  # Google Trends scanner
│
├── editorial-calendar.js                  # EXISTING — TO BE UPDATED
├── enhanced-ultra-generator.js            # EXISTING — TO BE UPDATED
└── config.js                              # EXISTING — Env vars
```

## Data Schemas

### data/article-scores.json
```json
{
  "timestamp": "2026-03-29T03:00:00.000Z",
  "scoringWeights": { "traffic": 0.30, "sessionQuality": 0.10, ... },
  "articleCount": 118,
  "scores": [
    {
      "wpId": 3264,
      "slug": "bali-guide-complet",
      "title": "Bali : Guide Complet 2026",
      "compositeScore": 78,
      "signals": {
        "traffic": 0.85,
        "sessionQuality": 0.72,
        "trendAlignment": 0.60,
        "reelAmplification": 0.45,
        "freshness": 0.90,
        "monetization": 1.0
      },
      "flags": ["top_performer", "trending"],
      "date": "2026-03-01T10:00:00.000Z",
      "wordCount": 3200
    }
  ],
  "summary": {
    "avgScore": 42,
    "topPerformers": 8,
    "staleArticles": 23,
    "missingWidgets": 15,
    "zeroTraffic": 31,
    "trending": 12
  }
}
```

### data/content-gaps.json
```json
{
  "timestamp": "2026-03-29T03:05:00.000Z",
  "gapCount": 12,
  "gaps": [
    {
      "topic": "visa bali 2026",
      "source": "combined",
      "gapScore": 78,
      "signals": {
        "searchVolume": 0.82,
        "trendGrowth": 0.75,
        "monetization": 0.90,
        "competition": 0.40
      },
      "destination": "bali",
      "category": "visa",
      "suggestedTitle": "Bali : Guide Complet Visa 2026 (Formalites, Delais, Astuces)",
      "suggestedReelAngle": "Reel \"Savais-tu ?\" sur les conditions de visa pour Bali",
      "articleType": "pillar",
      "priority": "critical"
    }
  ],
  "summary": {
    "byPriority": { "critical": 2, "high": 4, "medium": 6 },
    "byCategory": { "visa": 3, "budget": 4, "itineraire": 5 },
    "topDestinationGaps": ["bali", "vietnam", "japon"]
  }
}
```

### data/next-articles-queue.json
```json
{
  "timestamp": "2026-03-29T03:10:00.000Z",
  "queueSize": 15,
  "queue": [
    {
      "rank": 1,
      "action": "write_new",
      "priority": "P1",
      "priorityScore": 178,
      "topic": "visa bali 2026",
      "articleType": "pillar",
      "context": {
        "gapScore": 78,
        "destination": "bali",
        "category": "visa",
        "suggestedTitle": "Bali : Guide Complet Visa 2026",
        "reason": "Content gap: \"visa bali 2026\" (score 78, source: combined)"
      }
    },
    {
      "rank": 2,
      "action": "update",
      "priority": "P2",
      "priorityScore": 125,
      "topic": "Vietnam 3 semaines : itineraire complet",
      "articleType": "support",
      "context": {
        "wpId": 3100,
        "slug": "vietnam-3-semaines-itineraire",
        "freshness": 0.15,
        "traffic": 0.45,
        "reason": "Stale article with traffic"
      }
    }
  ]
}
```

### data/article-reel-map.json
```json
{
  "timestamp": "2026-03-29T03:15:00.000Z",
  "articleMap": {
    "bali-guide-complet": {
      "wpId": 3264,
      "title": "Bali : Guide Complet 2026",
      "reels": [
        {
          "reelId": "17849582304...",
          "format": "pick",
          "score": 45.2,
          "engagementRate": 3.8,
          "publishedAt": "2026-03-25T07:00:00.000Z",
          "isViral": false
        }
      ],
      "suggestedFormats": ["pick", "month", "avantapres"],
      "category": "destination",
      "igReferralTraffic": null
    }
  },
  "viralAlerts": [],
  "orphanReels": [],
  "stats": {
    "totalArticles": 118,
    "articlesWithReels": 12,
    "articlesWithoutReels": 106,
    "totalReels": 18,
    "viralReels": 0,
    "orphanReels": 3
  }
}
```

## npm scripts to add to package.json

```json
{
  "scripts": {
    "intelligence": "node intelligence/run-intelligence.js",
    "intelligence:score": "node intelligence/run-intelligence.js --score",
    "intelligence:gaps": "node intelligence/run-intelligence.js --gaps",
    "intelligence:link": "node intelligence/run-intelligence.js --link",
    "intelligence:queue": "node intelligence/run-intelligence.js --queue"
  }
}
```

## Dependencies

No new npm dependencies required. The engine uses:
- `@google-analytics/data` (already installed) for GA4
- `google-trends-api` (already installed) via trends-scanner.js
- `googleapis` (optional, for Search Console — install with `npm install googleapis`)
- WP REST API via native `fetch()`
- IG Graph API via ig-stats-fetcher.js

## Execution Order (Daily)

| Time (UTC) | Workflow                    | What it does                          |
|------------|-----------------------------|-----------------------------------------|
| 3:00       | content-intelligence.yml    | Score articles, detect gaps, link reels, build queue |
| 4:00       | daily-analytics.yml         | Fetch GA4, IG stats, trends, update performance weights |
| 5:00       | publish-reels.yml           | Publish reels using fresh weights      |
| 9:00       | publish-article.yml (if on) | Publish article using intelligence queue |

The intelligence engine runs FIRST so that all downstream consumers
(analytics, reels, article generator) have fresh data.
