# FlashVoyage Proactive Data Flywheel Architecture

**Status**: Architecture spec, ready for implementation
**Author**: Growth Hacker Agent
**Date**: 2026-03-29
**Estimated growth multiplier**: 3-5x organic traffic in 6 months

---

## 1. THE CONTENT FLYWHEEL

### Current State (Reactive)
```
Trend spike detected → produce content → publish → hope for traffic
```

### Target State (Proactive Compounding Flywheel)
```
                    ┌──────────────────────────────────────────────────┐
                    │                                                  │
                    ▼                                                  │
          ┌─────────────────┐                                         │
          │  PUBLISH ARTICLE │ ◄─── intelligence-report.json          │
          │  (pipeline-runner)│      (article-scorer weights,          │
          └────────┬────────┘       content-gaps, trends)             │
                   │                                                   │
                   ▼                                                   │
     ┌──────────────────────────┐                                     │
     │  COLLECT SIGNALS (24-48h) │                                    │
     │  ├── GA4: pageviews, dur  │                                    │
     │  ├── GSC: impr, pos, CTR  │                                    │
     │  ├── IG: reel engagement  │                                    │
     │  ├── TP: affiliate clicks │                                    │
     │  └── Trends: rising dest  │                                    │
     └────────────┬──────────────┘                                    │
                  │                                                    │
                  ▼                                                    │
     ┌──────────────────────────────┐                                 │
     │  SCORE & LEARN (article-scorer)│                               │
     │  ├── Which TOPICS perform?    │                                │
     │  ├── Which FORMATS win?       │                                │
     │  ├── Which WIDGETS convert?   │                                │
     │  ├── Which TITLES get clicks? │                                │
     │  └── Which TIMES get reach?   │                                │
     └────────────┬─────────────────┘                                 │
                  │                                                    │
                  ▼                                                    │
     ┌───────────────────────────────────┐                            │
     │  OPTIMIZE EXISTING (auto-actions)  │                           │
     │  ├── A/B test titles on low-CTR    │ ─── improves rankings ──►│
     │  ├── Add widgets to high-traffic   │ ─── boosts revenue ─────►│
     │  ├── Create reels for un-amped     │ ─── social traffic ─────►│
     │  ├── Refresh declining articles    │ ─── recovers traffic ───►│
     │  └── Internal-link new articles    │ ─── authority flow ─────►│
     └────────────┬──────────────────────┘                            │
                  │                                                    │
                  ▼                                                    │
     ┌───────────────────────────────────┐                            │
     │  DECIDE NEXT CONTENT (editorial)   │                           │
     │  ├── Content gaps from GSC queries │                           │
     │  ├── Winning format patterns       │                           │
     │  ├── Velocity score (trend age)    │                           │
     │  └── Cluster rotation (seasonal)   │                           │
     └────────────┬──────────────────────┘                            │
                  │                                                    │
                  └────────────────────────────────────────────────────┘
                           COMPOUNDING: each cycle is smarter
```

### Flywheel Data Contracts

Each piece of content generates these data files that feed the next cycle:

| Generated After | Data File | Consumed By |
|---|---|---|
| 24h post-publish | `article-scores.json` | editorial-calendar, content-refresher, reel-scheduler |
| 48h post-publish | `intelligence-report.json` | pipeline-runner (topic selection) |
| Weekly | `performance-weights.json` | smart-scheduler (format weights) |
| Weekly | `content-gaps.json` | editorial-calendar (next topics) |
| Weekly | `refresh-queue.json` | content-refresher (which to update) |
| Continuous | `reel-history.jsonl` | smart-scheduler (dedup, timing) |

### Implementation: Flywheel Orchestrator

Create `social-distributor/analytics/flywheel-orchestrator.js`:

```javascript
/**
 * Flywheel Orchestrator — runs the compounding loop.
 *
 * Cron: Every 6 hours (4x/day)
 *   0 */6 * * *
 *
 * Each run:
 * 1. Score all articles (uses cached GA4/GSC data from daily run)
 * 2. Detect auto-actions (title A/B tests, widget adds, reel gaps)
 * 3. Execute auto-actions up to a daily budget (max 5 title changes, 3 widget adds)
 * 4. Update intelligence-report.json
 * 5. Feed results back into next content decision
 */

const DAILY_BUDGET = {
  titleChanges: 5,      // Max title A/B swaps per day
  widgetAdds: 3,         // Max widget injections per day
  reelCreations: 3,      // Max auto-generated reels per day
  internalLinks: 10,     // Max internal link insertions per day
  refreshes: 2,          // Max full content refreshes per day
};
```

**Expected growth multiplier**: 1.5x (compounding effect over 3 months). Each article generates data that makes the next one rank faster and convert better.

---

## 2. AUTOMATED A/B TESTING AT SCALE

### Current State
Manual humor format testing. No systematic testing infrastructure.

### Target: Full Testing Pipeline

#### 2a. Article Title A/B Testing (via Rank Math)

**Mechanism**: Rank Math has a separate "SEO Title" field from the WordPress post title. We can set the SEO title to variant B and measure CTR change in GSC.

```
┌──────────────────────────────────────────────────────┐
│  TITLE A/B TEST ENGINE                               │
│                                                      │
│  1. SELECT: articles where CTR < expectedCTR(pos)    │
│     (from search-console-fetcher.findLowHangingFruit)│
│                                                      │
│  2. GENERATE: variant title using LLM                │
│     Input: original title + top query + position     │
│     Prompt: "Write a title that increases CTR for    │
│     this search query, keeping SEO keywords intact"  │
│                                                      │
│  3. DEPLOY: Update via WP REST API                   │
│     POST /wp-json/wp/v2/posts/{id}                   │
│     { meta: { rank_math_title: variantB } }          │
│                                                      │
│  4. MEASURE: After 14 days, compare CTR              │
│     GSC query+page data: before vs after period      │
│     Minimum 200 impressions for statistical sig.     │
│                                                      │
│  5. DECIDE:                                          │
│     CTR improved > 10% → keep variant B              │
│     CTR unchanged → revert, try new variant          │
│     CTR decreased → revert immediately (7-day check) │
│                                                      │
│  6. LEARN: Feed winning patterns into title generator │
│     Store: { pattern: "number + emotion", lift: +15%}│
└──────────────────────────────────────────────────────┘
```

**Data file**: `data/ab-tests.json`
```json
{
  "activeTests": [
    {
      "id": "test-001",
      "articleId": 4132,
      "slug": "budget-bali-2-semaines",
      "query": "budget bali 2 semaines",
      "originalTitle": "Budget Bali 2 Semaines : Guide Complet",
      "variantTitle": "Budget Bali 2 Semaines : Combien Ca Coute Vraiment en 2026",
      "startDate": "2026-03-29",
      "baselineCTR": 3.2,
      "baselineImpressions": 450,
      "status": "running",
      "checkDates": ["2026-04-05", "2026-04-12"]
    }
  ],
  "completedTests": [],
  "winningPatterns": [
    { "pattern": "year_in_title", "avgLift": 12, "sampleSize": 5 },
    { "pattern": "question_format", "avgLift": 8, "sampleSize": 3 }
  ]
}
```

#### 2b. Meta Description Testing

Same mechanism as titles but via `rank_math_description` meta field. Measured by CTR at the same position.

#### 2c. Widget Placement Testing

**Mechanism**: Track affiliate clicks by article + position via sub_id format already in place (`{articleId}-{widgetType}-{position}`).

```
Test positions:
  A: after_first_h2     (current default)
  B: after_intro         (before first H2)
  C: mid_article         (after 50% of content)
  D: before_conclusion   (last H2)
  E: sidebar_sticky      (if theme supports)

Measurement:
  - GA4 custom event: affiliate_click with event_label = position
  - Travelpayouts sub_id includes position: "4132-flights-after_first_h2"
  - Compare click rate per 1000 pageviews by position
  - 30-day test period per position variant
```

**Implementation**: Extend `contextual-widget-placer-v2.js` with a `placement_variant` parameter that rotates across articles.

#### 2d. Reel Posting Time Testing

**Mechanism**: The smart-scheduler already uses 3 time slots (05h, 10h, 16h UTC). Add 2 more test slots.

```
Test matrix (per format):
  Slot A: 05h UTC (12h Bangkok — current morning)
  Slot B: 08h UTC (15h Bangkok — afternoon)
  Slot C: 10h UTC (17h Bangkok — current midday)
  Slot D: 13h UTC (20h Bangkok — evening)
  Slot E: 16h UTC (23h Bangkok — current evening)

Measurement:
  - IG Insights: plays + reach + engagement rate
  - 2-week rotation per slot
  - performance-scorer.js already handles format ranking by score
  - Extend to rank by time_slot: { format: "humor", slot: "13h", avgScore: 45.2 }
```

**Implementation**: Add `timeSlot` dimension to `performance-weights.json`:
```json
{
  "formatScores": { "humor": 8.5, "pick": 7.2 },
  "timeSlotScores": {
    "humor": { "05": 6.0, "10": 8.5, "16": 9.2 },
    "pick": { "05": 7.8, "10": 7.0, "16": 5.5 }
  }
}
```

#### 2e. Audio Type Testing (Music vs ASMR)

**Mechanism**: Tag each reel with `audioType` in `reel-history.jsonl`. Compare engagement by audio type.

```json
// reel-history.jsonl entry
{ "id": "reel-xxx", "format": "pick", "audioType": "music_upbeat", "destination": "bali", ... }
{ "id": "reel-yyy", "format": "pick", "audioType": "asmr_nature", "destination": "bali", ... }
```

Score by `audioType` dimension the same way `performance-scorer.js` scores by format.

#### 2f. Caption CTA Testing

**Mechanism**: Rotate CTA variants in `caption-builder.js`. Tag variant in `reel-history.jsonl`.

```
CTA variants:
  A: "Lien en bio" (current)
  B: "Sauvegarde pour ton prochain voyage"
  C: "Envoie a quelqu'un qui en a besoin"
  D: "Commente ta destination de reve"
  E: "Dis-moi si tu es d'accord"

Measurement: saves (A,B), shares (C), comments (D,E), link clicks (A)
Track best CTA per format (humor needs comments, budget needs saves)
```

### Testing Infrastructure Summary

Create `social-distributor/analytics/ab-test-engine.js`:

```javascript
/**
 * Centralized A/B Test Engine
 *
 * Manages all active tests, checks statistical significance,
 * and auto-promotes winners.
 *
 * Runs daily at 05h UTC (after analytics data is fresh).
 *
 * Minimum sample sizes:
 *   - Title/meta CTR: 200 impressions per variant
 *   - Widget clicks: 500 pageviews per variant
 *   - Reel engagement: 5 reels per variant
 *   - Caption CTA: 5 reels per variant
 */
```

**Expected growth multiplier**: 1.3-1.8x. Title optimization alone can double CTR on position 5-10 articles. Widget placement optimization can increase affiliate revenue 30-50%.

---

## 3. COHORT ANALYSIS: First Touch to Affiliate Click

### GA4 Events Needed

The current GA4 setup tracks pageviews and sessions. To build a full cohort funnel, add these custom events:

```javascript
// ═══ REQUIRED GA4 EVENTS (inject via WPCode Lite) ═══

// Event 1: Content engagement depth
// Fires when user scrolls past 25%, 50%, 75%, 100% of article
gtag('event', 'scroll_depth', {
  percent: 50,           // 25, 50, 75, 100
  page_path: '/budget-bali/',
  content_group: 'guide'  // guide, budget, comparison, news
});

// Event 2: Affiliate widget visibility
// Fires when a Travelpayouts widget enters the viewport
gtag('event', 'widget_visible', {
  widget_type: 'flights',       // flights, tours, esim, hotels
  widget_position: 'after_h2_1', // where in the article
  page_path: '/budget-bali/'
});

// Event 3: Affiliate click (ALREADY DOCUMENTED in revenue-tracker.js)
gtag('event', 'affiliate_click', {
  event_category: 'monetization',
  event_label: 'flights',
  page_path: '/budget-bali/'
});

// Event 4: Internal link click (for authority flow tracking)
gtag('event', 'internal_link_click', {
  link_text: 'guide temples angkor',
  destination_path: '/temples-angkor-guide/',
  source_path: '/budget-cambodge/',
  link_position: 'inline'  // inline, sidebar, footer, related
});

// Event 5: Social referral landing
// Auto-detected by UTM params from reels/posts
// utm_source=instagram&utm_medium=reel&utm_campaign=pick-bali

// Event 6: Return visit marker
gtag('event', 'return_visit', {
  visit_number: sessionStorage.getItem('fv_visits') || 1,
  first_visit_date: localStorage.getItem('fv_first_visit'),
  days_since_first: daysSince(localStorage.getItem('fv_first_visit'))
});
```

### Cohort Funnel in GA4

```
COHORT STAGES (GA4 Explorations → Funnel):

Stage 1: DISCOVERY
  └── Events: session_start (with source/medium)
  └── Dimensions: sessionSource, sessionMedium, landingPage
  └── Key question: Where do users first find FlashVoyage?

Stage 2: ENGAGEMENT
  └── Events: scroll_depth (>=50%), page_view (2+ pages)
  └── Dimension: content_group
  └── Key question: Which content types create engaged readers?

Stage 3: WIDGET VISIBILITY
  └── Events: widget_visible
  └── Dimension: widget_type, widget_position
  └── Key question: Do users actually SEE the affiliate widgets?

Stage 4: AFFILIATE CLICK
  └── Events: affiliate_click
  └── Dimension: event_label (widget type)
  └── Key question: What % of engaged users click an affiliate link?

Stage 5: RETURN VISIT
  └── Events: return_visit (visit_number >= 2)
  └── Dimension: days_since_first
  └── Key question: Do users come back? How long until they convert?
```

### Cohort Report Query (GA4 Data API)

Add to `ga4-fetcher.js`:

```javascript
/**
 * Fetch cohort conversion funnel.
 * Tracks: first_visit → engagement → widget_visible → affiliate_click
 * Segmented by traffic source.
 */
export async function fetchCohortFunnel(days = 30) {
  const client = createClient();

  // Funnel step 1: Sessions by source
  const [sessions, engaged, widgetViews, affiliateClicks] = await Promise.all([
    client.runReport({
      property: `properties/${GA4_PROPERTY}`,
      dateRanges: [{ startDate: daysAgoStr(days), endDate: 'today' }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    }),
    client.runReport({
      property: `properties/${GA4_PROPERTY}`,
      dateRanges: [{ startDate: daysAgoStr(days), endDate: 'today' }],
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'engagedSessions' }],
    }),
    // ... widget_visible and affiliate_click event counts by source
  ]);

  // Build funnel: source → sessions → engaged → widget_visible → click
  // Calculate drop-off rates between each stage
}
```

### Implementation Cost

| Item | Tool | Cost |
|---|---|---|
| GA4 events | WPCode Lite (free) | $0 |
| Scroll tracking | Custom JS (50 lines) | $0 |
| Widget visibility | IntersectionObserver (20 lines) | $0 |
| Cohort queries | GA4 Data API (already connected) | $0 |
| Dashboard | intelligence-report.json + existing CLI | $0 |

**Expected growth multiplier**: 1.2x (through optimization of the funnel). Understanding where users drop off lets you fix the specific bottleneck.

---

## 4. CONTENT VELOCITY SCORING

### The Problem
A trending topic about "Thailand visa changes" has a half-life of ~2 days. Publishing it on day 4 captures only ~12.5% of the available traffic. The current pipeline takes ~7 minutes per article but has no urgency signal.

### Velocity Score Formula

```
velocity_score = trend_intensity * time_decay * competition_gap * monetization_potential

Where:
  trend_intensity    = Google Trends score (0-100) normalized to 0-1
  time_decay         = 2^(-hours_since_spike / half_life_hours)
                       half_life_hours varies by topic type:
                         breaking_news = 12h
                         seasonal_shift = 168h (1 week)
                         evergreen_trend = 720h (1 month)
  competition_gap    = 1 - (number of FR articles on page 1 / 10)
                       No FR coverage = 1.0, full coverage = 0.0
  monetization_pot.  = hasAffiliateAngle ? 1.5 : 1.0
```

### Velocity Engine Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  VELOCITY ENGINE (runs every 2 hours)                       │
│                                                             │
│  INPUTS:                                                    │
│  ├── Google Trends API (trending queries, FR, travel)       │
│  ├── RSS feeds (breaking travel news)                       │
│  ├── GSC rising queries (our own search data)               │
│  └── Reddit r/travel signals (already in pipeline)          │
│                                                             │
│  PROCESS:                                                   │
│  1. Collect all trending signals                            │
│  2. Compute velocity_score for each                         │
│  3. Filter: velocity_score >= 0.4                           │
│  4. Check: do we already have this article? (slug match)    │
│  5. Check: is this in our editorial calendar? (gap check)   │
│  6. CLASSIFY topic type → set half_life                     │
│                                                             │
│  OUTPUT: velocity-queue.json                                │
│  [                                                          │
│    {                                                        │
│      "topic": "nouveau visa thailande 2026",                │
│      "velocityScore": 0.87,                                 │
│      "hoursRemaining": 18,  // before 50% decay             │
│      "topicType": "breaking_news",                          │
│      "competitionGap": 0.8,                                 │
│      "action": "PUBLISH_NOW",                               │
│      "estimatedTrafficIfPublishedNow": 2500,                │
│      "estimatedTrafficIfPublishedIn24h": 625                │
│    }                                                        │
│  ]                                                          │
│                                                             │
│  ACTIONS:                                                   │
│  velocityScore >= 0.8 → PUBLISH_NOW (trigger pipeline)      │
│  velocityScore 0.6-0.8 → QUEUE_PRIORITY (next in calendar) │
│  velocityScore 0.4-0.6 → QUEUE_NORMAL                      │
│  velocityScore < 0.4 → SKIP                                │
└─────────────────────────────────────────────────────────────┘
```

### Integration with Pipeline Runner

Add to `pipeline-runner.js`:

```javascript
// Before normal editorial calendar, check velocity queue
const velocityQueue = loadVelocityQueue();
const urgent = velocityQueue.filter(v => v.action === 'PUBLISH_NOW');

if (urgent.length > 0) {
  // Override editorial calendar with highest velocity topic
  const topic = urgent[0];
  log(`VELOCITY OVERRIDE: Publishing "${topic.topic}" (score ${topic.velocityScore}, ${topic.hoursRemaining}h remaining)`);
  // Generate article from velocity topic instead of Reddit thread
}
```

### Cron Schedule

```yaml
# velocity-engine.yml
on:
  schedule:
    - cron: '0 */2 * * *'  # Every 2 hours
```

**Expected growth multiplier**: 2-3x for news/trending content. Being first in FR for a trending travel topic can capture 50-70% of the available search traffic.

---

## 5. CANNIBALIZATION RESOLVER

### Current State
`search-console-fetcher.js` already detects cannibalization with `detectCannibalization()`. But it only reports -- it doesn't act.

### Auto-Merge/Redirect Pipeline

```
┌───────────────────────────────────────────────────────────────────┐
│  CANNIBALIZATION RESOLVER (weekly cron)                           │
│                                                                   │
│  INPUT: detectCannibalization() output                            │
│                                                                   │
│  STEP 1: CLASSIFY each cannibalized query                        │
│  ├── MERGE candidate: pages overlap >60% in content + same intent│
│  ├── DIFFERENTIATE candidate: different sub-intents              │
│  └── CANONICAL candidate: one page clearly stronger              │
│                                                                   │
│  STEP 2: For MERGE candidates                                    │
│  ├── a. Determine "winner" (higher position, more links)         │
│  ├── b. Extract unique content from "loser" page                 │
│  │      (paragraphs, tips, data not in winner)                   │
│  ├── c. Append unique content to winner via WP REST API          │
│  ├── d. Add 301 redirect: loser → winner (via WPCode or .htaccess)│
│  └── e. Log in cannibalization-resolutions.json                  │
│                                                                   │
│  STEP 3: For DIFFERENTIATE candidates                            │
│  ├── a. Analyze sub-intent of each page (LLM classification)    │
│  ├── b. Rewrite the weaker page's title/H1 to target sub-intent │
│  ├── c. Add canonical tag on weaker page → stronger page         │
│  │      (if content overlap remains high)                        │
│  └── d. Add cross-link between the two pages                    │
│                                                                   │
│  STEP 4: For CANONICAL candidates                                │
│  ├── a. Add <link rel="canonical"> on weaker page               │
│  └── b. Update internal links to point to canonical URL          │
│                                                                   │
│  SAFETY:                                                          │
│  - Never auto-merge pages with >1000 total monthly impressions   │
│    (require manual review for high-traffic pages)                │
│  - Max 3 redirects per weekly run                                │
│  - Always log before-state for rollback                          │
│  - 30-day monitoring after each merge: if traffic drops >20%,    │
│    alert and consider rollback                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Implementation File: `social-distributor/analytics/cannibalization-resolver.js`

```javascript
/**
 * Cannibalization Resolver — auto-merges/redirects competing pages.
 *
 * Safety limits:
 *   MAX_AUTO_REDIRECTS_PER_RUN = 3
 *   MIN_IMPRESSIONS_FOR_MANUAL_REVIEW = 1000
 *   MONITORING_PERIOD_DAYS = 30
 *   ROLLBACK_THRESHOLD = -20% traffic
 */

const RESOLUTION_TYPES = {
  MERGE: 'merge',           // Combine content + 301 redirect
  DIFFERENTIATE: 'differentiate', // Rewrite weaker page for sub-intent
  CANONICAL: 'canonical',   // Add canonical tag only
  MANUAL: 'manual',         // Too high-traffic for auto-action
};
```

### Redirect Implementation (WordPress)

```javascript
// Via WP REST API + WPCode Lite
async function add301Redirect(fromPath, toPath) {
  // Option A: WPCode snippet (preferred — no plugin needed)
  const snippetCode = `
    if (\$_SERVER['REQUEST_URI'] === '${fromPath}') {
      wp_redirect('${toPath}', 301);
      exit;
    }
  `;

  // Option B: Rank Math redirect module (if available)
  // POST /wp-json/rankmath/v1/redirections

  // Option C: .htaccess via FTP
  // Already have SFTP credentials: ftp.cluster127.hosting.ovh.net
}
```

### Data: `data/cannibalization-resolutions.json`

```json
{
  "resolutions": [
    {
      "date": "2026-03-29",
      "query": "budget thailande",
      "winner": "/budget-thailande-complet/",
      "loser": "/combien-coute-voyage-thailande/",
      "type": "merge",
      "contentTransferred": ["2 paragraphs on visa costs", "comparison table"],
      "redirectCreated": true,
      "preMetrics": { "winnerImpr": 300, "loserImpr": 150 },
      "postMetrics": null,
      "status": "monitoring"
    }
  ]
}
```

**Expected growth multiplier**: 1.2-1.4x on affected queries. Consolidating link equity and removing confusion typically improves position by 2-5 spots for the winning page.

---

## 6. EVERGREEN CONTENT REFRESH CYCLE

### Current State
`content-refresher.js` exists and can update live data blocks. `content-refresh-engine.js` detects outdated articles. But there is no automated execution cron.

### Refresh Priority Matrix

```
┌──────────────────────────────────────────────────────────────┐
│  REFRESH PRIORITY MATRIX                                     │
│                                                              │
│  P0 — IMMEDIATE (within 24h)                                 │
│  ├── Article mentions a year < current year AND              │
│  │   position <= 10 AND impressions > 200                    │
│  └── Practical info changed (visa, airline, price shock)     │
│                                                              │
│  P1 — WEEKLY                                                 │
│  ├── Impressions declined >30% (90-day trend)                │
│  ├── Position dropped >5 spots (28-day vs 90-day avg)        │
│  └── CTR < 50% of expected CTR for position                  │
│                                                              │
│  P2 — MONTHLY                                                │
│  ├── Articles >6 months since last update                    │
│  ├── Articles with prices and no fv-live-data block          │
│  └── Articles with missing Travelpayouts widgets             │
│                                                              │
│  P3 — QUARTERLY                                              │
│  ├── All pillar articles (seasonal data refresh)             │
│  ├── Internal link audit (add links to new articles)         │
│  └── Schema.org markup validation                            │
└──────────────────────────────────────────────────────────────┘
```

### Automated Refresh Cron Architecture

```yaml
# refresh-articles.yml (extend existing)
name: Content Refresh Engine

on:
  schedule:
    # P0 checks: every 6 hours
    - cron: '30 */6 * * *'
    # P1 batch: Mondays at 02h UTC
    - cron: '0 2 * * 1'
    # P2 batch: 1st of each month at 02h UTC
    - cron: '0 2 1 * *'
    # P3 batch: 1st of Jan/Apr/Jul/Oct at 02h UTC
    - cron: '0 2 1 1,4,7,10 *'
```

### Refresh Actions by Priority

```javascript
const REFRESH_ACTIONS = {
  P0: [
    'updateYearReferences',      // Replace "2025" → "2026" in text
    'bumpDateModified',          // Update schema dateModified
    'updateMisAJourBadge',       // Visual "Mis a jour le X" badge
    'refreshLiveDataBlock',      // Re-fetch visa/price/safety data
  ],
  P1: [
    ...P0_ACTIONS,
    'addContentDepth',           // LLM generates 200-400 words of new expert content
    'optimizeTitleMeta',         // A/B test a new title
    'buildInternalLinks',        // Add 2-3 links to/from related articles
    'refreshImages',             // Replace stock images with newer Pexels images
  ],
  P2: [
    ...P0_ACTIONS,
    'injectAffiliateWidgets',    // Add Travelpayouts widgets if missing
    'addFvLiveDataBlock',        // Add real-time data block if missing
    'refreshExternalLinks',      // Check/fix broken outbound links
  ],
  P3: [
    'fullSeasonalRefresh',       // Complete content review + seasonal angle update
    'auditInternalLinks',        // Full link graph analysis
    'validateSchemaMarkup',      // Structured data validation
    'updateCompetitorAnalysis',  // Check what competitors added
  ],
};
```

### Daily Refresh Budget

To avoid overwhelming WordPress and triggering Google's "massive change" penalty:

```
Max refreshes per day:
  P0: unlimited (these are critical fixes)
  P1: 3 articles/day
  P2: 2 articles/day
  P3: 1 article/day

Total: ~5-6 refreshes/day = ~35-42/week = all 118 articles refreshed every ~3 weeks
```

**Expected growth multiplier**: 1.3-1.5x. Google explicitly rewards freshness. Updated dateModified + genuinely new content can recover 20-40% of lost traffic on declining pages.

---

## 7. SOCIAL-TO-SEO LOOP

### The Mechanism

```
┌─────────────────────────────────────────────────────────────────┐
│  SOCIAL → SEO AMPLIFICATION LOOP                                │
│                                                                 │
│  Step 1: Reel published on IG/FB/Threads                        │
│          ├── CTA: "Lien en bio" or swipe-up to article          │
│          └── UTM: ?utm_source=instagram&utm_medium=reel&        │
│                    utm_campaign={format}-{destination}           │
│                                                                 │
│  Step 2: Social traffic spike on article                        │
│          ├── GA4 sees: burst of sessions from instagram/reel    │
│          ├── Users browse: avg 2.3 pages (travel readers explore)│
│          └── Engagement signals: scroll depth, time on page     │
│                                                                 │
│  Step 3: Google observes behavioral signals                     │
│          ├── Chrome Usage Statistics (CrUX) sees engagement     │
│          ├── Search console sees: higher CTR (users who saw     │
│          │   the reel recognize the brand and click in SERP)    │
│          └── More return visits = positive quality signal       │
│                                                                 │
│  Step 4: Organic ranking improves                               │
│          ├── Position moves up 1-3 spots (small but compounds)  │
│          └── More organic traffic → more data → smarter reels   │
│                                                                 │
│  AMPLIFIER: The reel itself can rank in Google Video results    │
│  → Double presence: article in main results + reel in video tab │
└─────────────────────────────────────────────────────────────────┘
```

### Maximizing the Loop

#### 7a. UTM Discipline (Mandatory for Attribution)

Every social link must carry UTMs. Update `cross-publisher.js`:

```javascript
function buildArticleLink(slug, platform, format) {
  const base = `https://flashvoyage.com/${slug}/`;
  const params = new URLSearchParams({
    utm_source: platform,       // instagram, facebook, threads
    utm_medium: 'reel',         // reel, post, story, carousel
    utm_campaign: `${format}-${slug.split('-').slice(0, 2).join('-')}`,
    utm_content: new Date().toISOString().slice(0, 10), // date for cohort
  });
  return `${base}?${params}`;
}
```

#### 7b. Reel-to-Article Timing Strategy

```
OPTIMAL REEL TIMING (based on Google's crawl patterns):

1. Publish reel at peak engagement time (from performance-weights.json)
2. Social traffic spike hits the article within 2-6 hours
3. Googlebot sees the engagement signals on next crawl (usually within 24h)
4. Position change visible in GSC within 3-7 days

STRATEGY:
  - When publishing a reel for article X, ensure article X was
    recently refreshed (within 7 days) so Google sees fresh content
    + fresh engagement = double quality signal
  - Batch reels for articles where we're position 5-15 (highest
    potential for ranking improvement)
  - Track: for each reel, measure the article's GSC position
    before and 7 days after the reel
```

#### 7c. Reel-SEO Attribution Tracker

Add to `article-reel-router.js`:

```javascript
/**
 * Track the SEO impact of each reel on its linked article.
 *
 * Before reel: record article's GSC position + impressions
 * After 7 days: measure again
 * Compute: position_delta, impression_delta, CTR_delta
 *
 * This tells us: "Does posting a reel actually improve SEO?"
 * And: "Which reel formats have the biggest SEO impact?"
 */
export async function measureReelSEOImpact(articleSlug, reelId) {
  const before = await fetchArticleGSCMetrics(articleSlug); // position, impr, ctr

  // Schedule a check in 7 days
  await scheduleDelayedCheck({
    type: 'reel_seo_impact',
    reelId,
    articleSlug,
    baselinePosition: before.position,
    baselineImpressions: before.impressions,
    baselineCTR: before.ctr,
    checkDate: addDays(new Date(), 7),
  });
}
```

#### 7d. Cross-Platform Sync for Maximum Signal

```
When publishing a reel for article X:
  1. IG Reel → link in bio (Linktree or direct)
  2. FB Page → reel + article link in FIRST COMMENT (not post body!)
  3. Threads → reel + article link in reply
  4. Pinterest → pin with article link (drives long-tail SEO traffic)
  5. YouTube Shorts → link in description (future)

Each platform sends traffic with different UTM → GA4 sees
multi-source engagement → stronger quality signal to Google
```

**Expected growth multiplier**: 1.5-2x for articles that receive reel amplification. The compound effect over 118 articles with 3 reels/day = significant cumulative impact.

---

## 8. NEWSLETTER/EMAIL CAPTURE

### When to Add It: Data-Driven Decision Framework

DO NOT add email capture until these conditions are met:

```
LAUNCH CONDITIONS (ALL must be true):

Condition 1: TRAFFIC THRESHOLD
  ├── Monthly unique visitors > 10,000 (GA4 totalUsers, 30d)
  ├── Current: check via fetchSiteSummary(30)
  └── Rationale: below 10K, focus on traffic growth, not capture

Condition 2: RETURN VISITOR RATE
  ├── Return visitors > 15% of total (GA4 newVsReturning)
  ├── Indicates: content is good enough that people come back
  └── If < 15%: content needs improvement first

Condition 3: ENGAGED SESSION RATE
  ├── Engaged sessions > 50% (GA4 engagedSessions/sessions)
  ├── Indicates: visitors actually read, not just bounce
  └── If < 50%: fix content quality before adding email friction

Condition 4: MONETIZATION BASELINE
  ├── Affiliate clicks > 50/month (from revenue-tracker.js)
  ├── Indicates: some users are already deep enough to click widgets
  └── Email subscribers from these users = highest value

Condition 5: CONTENT DEPTH
  ├── At least 3 pillar articles with position < 5
  ├── Indicates: enough authority to promise valuable email content
  └── If no pillar authority: newsletters will have high unsub rate
```

### Email Capture Strategy (When Ready)

```
┌─────────────────────────────────────────────────────────────────┐
│  EMAIL CAPTURE ARCHITECTURE                                     │
│                                                                 │
│  Tool: Brevo (free up to 300 emails/day, GDPR compliant)        │
│  Integration: WP plugin or JS embed                             │
│                                                                 │
│  CAPTURE POINTS (in order of conversion rate):                  │
│                                                                 │
│  1. EXIT INTENT POPUP (desktop only)                            │
│     Trigger: mouse moves toward close/back button               │
│     Offer: "Recevez notre checklist voyage Asie (PDF)"          │
│     Expected: 2-4% conversion rate                              │
│                                                                 │
│  2. CONTENT UPGRADE (inline in article)                         │
│     After the most valuable section of each pillar article:     │
│     "Telechargez la version complete avec les prix a jour"      │
│     Expected: 5-8% conversion rate (highest quality leads)      │
│                                                                 │
│  3. STICKY FOOTER BAR (mobile)                                  │
│     Small bar: "Newsletter voyage: bons plans + alertes prix"   │
│     Expected: 0.5-1% conversion rate                            │
│                                                                 │
│  4. POST-REEL LANDING PAGE                                      │
│     Dedicated page linked from IG bio:                          │
│     flashvoyage.com/newsletter/                                 │
│     "Les meilleurs deals voyage, chaque mercredi"               │
│     Expected: 10-15% of reel-to-site visitors                   │
│                                                                 │
│  CONTENT STRATEGY:                                              │
│  ├── Weekly "Bon Plan" email (best flight deals from TP API)    │
│  ├── Monthly "Destination du Mois" (content-gap driven)         │
│  ├── Alert: breaking news (reuse breaking-news.js scores)       │
│  └── Evergreen: "5 erreurs en Thailande" drip sequence          │
│                                                                 │
│  MEASUREMENT:                                                   │
│  ├── GA4 event: newsletter_signup (custom event)                │
│  ├── Brevo: open rate, click rate per email                     │
│  ├── Attribution: email → site visit → affiliate click          │
│  └── Target: 500 subscribers in first 3 months                  │
└─────────────────────────────────────────────────────────────────┘
```

### Automated Email Content Pipeline

```javascript
/**
 * Weekly "Bon Plan" email generator.
 *
 * Sources:
 * 1. Travelpayouts API: cheapest flights from Paris to SEA destinations
 * 2. article-scorer.js: top 3 articles this week
 * 3. velocity-queue.json: any trending topic
 * 4. reel stats: best-performing reel this week (embed link)
 *
 * Template: Brevo transactional template (pre-designed)
 * Send: Every Wednesday 09h00 Paris time
 */
```

**Expected growth multiplier**: 1.4-1.6x once active. Email subscribers have 3-5x higher affiliate conversion rates than organic visitors because they are pre-qualified, engaged, repeat visitors.

---

## IMPLEMENTATION ROADMAP

### Phase 1: Foundation (Week 1-2) — Immediate

| Task | File | Priority | Effort |
|---|---|---|---|
| Add GA4 custom events (scroll, widget_visible, affiliate_click, return_visit) | WPCode snippet | P0 | 2h |
| Enforce UTM params on all social links | `cross-publisher.js` | P0 | 1h |
| Create `ab-tests.json` data structure | `data/ab-tests.json` | P1 | 1h |
| Add `timeSlot` dimension to performance-weights | `performance-scorer.js` | P1 | 2h |
| Create velocity-queue.json + velocity engine | `analytics/velocity-engine.js` | P1 | 4h |

### Phase 2: Testing Infrastructure (Week 3-4)

| Task | File | Priority | Effort |
|---|---|---|---|
| Build title A/B test engine | `analytics/ab-test-engine.js` | P1 | 6h |
| Build widget placement rotation | `contextual-widget-placer-v2.js` | P2 | 3h |
| Add audioType + ctaVariant to reel history | `reels/index.js`, `caption-builder.js` | P2 | 2h |
| Build cannibalization resolver | `analytics/cannibalization-resolver.js` | P2 | 6h |

### Phase 3: Automation (Week 5-6)

| Task | File | Priority | Effort |
|---|---|---|---|
| Flywheel orchestrator (6h cron) | `analytics/flywheel-orchestrator.js` | P1 | 4h |
| Automated refresh execution (not just detection) | `content-refresher.js` (extend) | P1 | 6h |
| Reel-SEO impact tracker | `analytics/article-reel-router.js` | P2 | 3h |
| Cohort funnel dashboard | `analytics/ga4-fetcher.js` (extend) | P2 | 4h |

### Phase 4: Email + Polish (Week 7-8, only if traffic threshold met)

| Task | File | Priority | Effort |
|---|---|---|---|
| Install Brevo + capture forms | WordPress config | P3 | 3h |
| Build email content generator | `email/weekly-digest.js` | P3 | 6h |
| Newsletter signup tracking in GA4 | WPCode snippet | P3 | 1h |

---

## EXPECTED CUMULATIVE GROWTH

```
Baseline (current):      1.0x
+ Content Flywheel:      1.0x × 1.5 = 1.5x
+ A/B Testing:           1.5x × 1.5 = 2.25x
+ Cohort Optimization:   2.25x × 1.2 = 2.7x
+ Velocity Engine:       2.7x × 1.3 = 3.5x  (news content only)
+ Cannibalization Fix:   3.5x × 1.3 = 4.6x
+ Refresh Cycle:         4.6x × 1.4 = 6.4x
+ Social-SEO Loop:       6.4x × 1.5 = 9.6x
+ Email (later):         9.6x × 1.4 = 13.4x

Conservative estimate (not all multipliers stack perfectly):
  6-month target: 3-5x organic traffic
  12-month target: 8-12x with email channel
```

---

## MONITORING: DAILY DASHBOARD ADDITIONS

Add to `content-intelligence-engine.js` Phase 4 output:

```javascript
flywheel: {
  activeABTests: abTests.activeTests.length,
  testsCompletedThisWeek: abTests.completedTests.filter(t => isThisWeek(t.endDate)).length,
  avgTitleLift: computeAvgLift(abTests.completedTests),
  velocityQueueSize: velocityQueue.length,
  urgentTopics: velocityQueue.filter(v => v.action === 'PUBLISH_NOW').length,
  cannibalizationResolved: resolutions.filter(r => r.status === 'resolved').length,
  articlesRefreshedThisWeek: refreshLog.filter(r => isThisWeek(r.date)).length,
  reelSEOImpact: {
    avgPositionDelta: computeAvgPositionDelta(reelImpact),
    reelsWithPositiveImpact: reelImpact.filter(r => r.positionDelta < 0).length,
  },
  emailMetrics: {
    subscribers: emailStats.total,
    weeklyGrowthRate: emailStats.growthRate,
    avgOpenRate: emailStats.avgOpenRate,
    affiliateClicksFromEmail: emailStats.affiliateClicks,
  }
}
```
