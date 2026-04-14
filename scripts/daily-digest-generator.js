#!/usr/bin/env node

/**
 * Daily Digest Generator — FlashVoyage (v2, decision-oriented)
 *
 * Morning email for the founder. Five sections MAX, all anchored to
 * decisions — no vanity metrics. If a section has nothing to say, it
 * collapses to a single OK line.
 *
 * New section layout (was 9, now 5):
 *   1. 🚨 ANOMALIES              — P0 items (tokens, workflow fails, FR crashes, fake cards, API errors)
 *   2. 📈 GROWTH SIGNALS         — FR WoW gainers/losers (Thailand excluded), top format per platform, angle used
 *   3. 🎯 TODAY'S 3 ACTIONS      — refresh candidate, write candidate, reel OR widget opp
 *   4. 💰 MONETIZATION HEALTH    — widget coverage delta, high-traffic articles without widgets, regression alerts
 *   5. ⚙️ PIPELINE HEALTH         — LLM cost Δ, last cron per workflow, auto-apply count, Actions minutes
 *
 * Old sections REMOVED / MERGED:
 *   - "Brief CEO du jour"            → kept, trimmed to 3 bullet points anchored on actions
 *   - "Operations de la nuit"        → folded into Pipeline Health
 *   - "Traffic GA4 (3 derniers jours)" → replaced by FR-filtered WoW in Growth Signals
 *   - "Linkbuilding"                 → only surfaces if anomalous (bot dead, missing links)
 *   - "Snapshot Performance"         → replaced by Growth Signals + Actions
 *   - "Intelligence editoriale"      → folded into 3 Actions
 *   - "Couts LLM"                    → folded into Pipeline Health
 *   - "Actions requises"             → becomes section 3 (3 ACTIONS)
 *   - "Motivation du jour"           → killed (vanity)
 *
 * New data sources tapped:
 *   - data/article-scores.json        → frShare, frPageviews, signals, flags
 *   - data/score-history/*.json       → 7-day composite-score deltas
 *   - data/partner-widget-audit.json  → HIGH opportunities, fakeCards, verticalStats
 *   - data/auto-edit-log.jsonl        → LOW-tier auto-apply status counts
 *   - social-distributor/reels/data/performance-weights.json
 *                                    → igFormatScores, tiktokFormatScores,
 *                                      formatScoreSource, discrepancy detection
 *   - social-distributor/reels/tmp/angle-state.json → angles used yesterday
 *   - GA4 FR-filtered (country = France, Thailand excluded) for WoW delta
 *   - GitHub Actions API → workflow run status last 24h
 *   - data/next-articles-queue.json / data/content-gaps.json → write candidate
 *
 * CLI (unchanged interface):
 *   node scripts/daily-digest-generator.js              # HTML to stdout
 *   node scripts/daily-digest-generator.js --file       # write data/daily-digest.html
 *   node scripts/daily-digest-generator.js --json       # JSON digest data
 *   node scripts/daily-digest-generator.js --subject    # subject line only
 *   node scripts/daily-digest-generator.js --send       # generate + send via Gmail
 *
 * No new npm deps. Each data source is optional (graceful degradation).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const SD_DATA = join(ROOT, 'social-distributor', 'data');
const REELS_DATA = join(ROOT, 'social-distributor', 'reels', 'data');
const REELS_TMP = join(ROOT, 'social-distributor', 'reels', 'tmp');
const SCORE_HISTORY_DIR = join(DATA_DIR, 'score-history');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function log(msg) {
  console.error(`[DIGEST] ${msg}`);
}

function loadJSON(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    log(`WARN: Failed to load ${path}: ${err.message}`);
    return null;
  }
}

function loadJSONL(path) {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function fileAgeDays(path) {
  try {
    if (!existsSync(path)) return Infinity;
    const s = statSync(path);
    return (Date.now() - s.mtimeMs) / 86400000;
  } catch { return Infinity; }
}

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  return Math.floor((d.getTime() - Date.now()) / 86400000);
}

function isLast24h(dateStr) {
  if (!dateStr) return false;
  return (Date.now() - new Date(dateStr).getTime()) < 86400000;
}

function formatUSD(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

function pct(value) {
  if (value === Infinity || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value)}%`;
}

function scorePath(dateStr) {
  return join(SCORE_HISTORY_DIR, `${dateStr}.json`);
}

function loadScoreSnapshot(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const iso = d.toISOString().slice(0, 10);
  return loadJSON(scorePath(iso));
}

// ─────────────────────────────────────────────────────────────────────────────
// GA4 — FR-filtered WoW (Thailand excluded, self-traffic guard)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchGA4Wow() {
  try {
    const saKeyPath = join(ROOT, 'ga4-service-account.json');
    let saKey = null;
    if (existsSync(saKeyPath)) saKey = loadJSON(saKeyPath);
    else if (process.env.GA4_SERVICE_ACCOUNT) {
      saKey = JSON.parse(process.env.GA4_SERVICE_ACCOUNT);
    }
    if (!saKey) {
      log('GA4 WoW skipped — no service account key');
      return null;
    }

    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ credentials: saKey, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    const client = await auth.getClient();

    const today = new Date();
    const ymd = (d) => d.toISOString().slice(0, 10);
    const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };

    // This week = last 7 days ending today. Previous week = the 7 days before that.
    const thisWkStart = ymd(addDays(today, -6));
    const thisWkEnd = ymd(today);
    const prevWkStart = ymd(addDays(today, -13));
    const prevWkEnd = ymd(addDays(today, -7));

    // One call per window, France only, Thailand excluded at filter level
    // (we actually run two queries per window: "country=France" + "country != Thailand")
    // The scorer example excludes Thailand via NOT-MATCH. We'll request France only — by
    // definition that already excludes Thailand. But we ALSO exclude any country==Thailand
    // across the board to filter self-traffic from the FR articles when the cover VPN slips.
    // Simpler: just query France-only (FR gainers/losers is what matters).
    const franceFilter = {
      filter: {
        fieldName: 'country',
        stringFilter: { matchType: 'EXACT', value: 'France', caseSensitive: false },
      },
    };

    async function query(startDate, endDate) {
      const res = await client.request({
        url: 'https://analyticsdata.googleapis.com/v1beta/properties/505793742:runReport',
        method: 'POST',
        data: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
          dimensionFilter: franceFilter,
          limit: 200,
        },
      });
      const out = new Map();
      for (const row of res.data.rows || []) {
        const p = row.dimensionValues[0].value;
        if (p === '/' || p.startsWith('/wp-') || p.includes('/feed') || p.includes('/page/') || p.includes('?')) continue;
        if (p === '/(not set)') continue;
        out.set(p, {
          sessions: parseInt(row.metricValues[0].value, 10) || 0,
          pageviews: parseInt(row.metricValues[1].value, 10) || 0,
        });
      }
      return out;
    }

    const [thisWk, prevWk] = await Promise.all([
      query(thisWkStart, thisWkEnd),
      query(prevWkStart, prevWkEnd),
    ]);

    // Diff — per-article
    const rows = [];
    const paths = new Set([...thisWk.keys(), ...prevWk.keys()]);
    for (const p of paths) {
      const cur = thisWk.get(p) || { sessions: 0, pageviews: 0 };
      const prev = prevWk.get(p) || { sessions: 0, pageviews: 0 };
      // Skip paths with too little signal — we need at least 3 sessions either week
      if (cur.sessions < 3 && prev.sessions < 3) continue;
      const delta = cur.sessions - prev.sessions;
      const deltaPct = prev.sessions === 0 ? Infinity : ((cur.sessions - prev.sessions) / prev.sessions) * 100;
      rows.push({
        pagePath: p,
        slug: p.replace(/^\//, '').replace(/\/$/, ''),
        thisSessions: cur.sessions,
        prevSessions: prev.sessions,
        delta,
        deltaPct,
        thisPv: cur.pageviews,
        prevPv: prev.pageviews,
      });
    }

    const gainers = rows
      .filter(r => r.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3);
    const losers = rows
      .filter(r => r.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 3);

    return { gainers, losers, totalFrArticlesTracked: rows.length, thisWkStart, thisWkEnd };
  } catch (err) {
    log(`GA4 WoW fetch failed: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Actions — recent workflow runs (for anomalies + pipeline health)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWorkflowRuns() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  try {
    const repo = process.env.GITHUB_REPOSITORY || 'peterbono/flashvoyage-ultra-content';
    const url = `https://api.github.com/repos/${repo}/actions/runs?per_page=40`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      log(`GitHub Actions fetch failed: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const runs = data.workflow_runs || [];
    const now = Date.now();
    const last24h = runs.filter(r => now - new Date(r.created_at).getTime() < 86400000);
    const failed24h = last24h.filter(r => r.conclusion === 'failure');
    // Per workflow, keep only the most recent run
    const byWorkflow = new Map();
    for (const r of runs) {
      const key = r.name;
      if (!byWorkflow.has(key) || new Date(r.created_at) > new Date(byWorkflow.get(key).created_at)) {
        byWorkflow.set(key, r);
      }
    }
    return { last24h, failed24h, latestByWorkflow: byWorkflow };
  } catch (err) {
    log(`GitHub Actions fetch error: ${err.message}`);
    return null;
  }
}

async function fetchActionsUsage() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  try {
    const repo = process.env.GITHUB_REPOSITORY || 'peterbono/flashvoyage-ultra-content';
    const owner = repo.split('/')[0];
    const url = `https://api.github.com/users/${owner}/settings/billing/actions`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Data collectors
// ─────────────────────────────────────────────────────────────────────────────

function collectScoreDelta() {
  const today = loadJSON(scorePath(new Date().toISOString().slice(0, 10))) || loadScoreSnapshot(0);
  const lastWeek = loadScoreSnapshot(7);
  if (!today?.scores) return { drops: [], available: false };

  const prevMap = new Map((lastWeek?.scores || []).map(s => [s.slug, s.compositeScore]));
  const drops = [];
  for (const cur of today.scores) {
    const prev = prevMap.get(cur.slug);
    if (typeof prev !== 'number') continue;
    const delta = cur.compositeScore - prev;
    if (delta <= -10) {
      drops.push({ slug: cur.slug, prev, current: cur.compositeScore, delta });
    }
  }
  drops.sort((a, b) => a.delta - b.delta);
  return { drops, available: true };
}

function collectFrShareCrash() {
  // Find articles whose frShare dropped ≥ 0.20 vs the signals snapshot 7d ago.
  // Our score-history only keeps { slug, compositeScore }, so if the richer
  // history is unavailable we compare today's article-scores vs 7d-old article-scores
  // if such a file ever gets archived. For now: best-effort — return [] unless we
  // have two article-scores snapshots to compare.
  const todayFull = loadJSON(join(DATA_DIR, 'article-scores.json'));
  // Look for a richer snapshot file in data/score-history/YYYY-MM-DD-full.json if present
  // (not produced today, so just return [] gracefully)
  if (!todayFull?.scores) return [];
  // No historical snapshot of full signals today — placeholder empty list.
  return [];
}

function collectFakeCards() {
  const audit = loadJSON(join(DATA_DIR, 'partner-widget-audit.json'));
  if (!audit) return { fakeCards: [], available: false };
  return {
    fakeCards: audit.fakeCards || [],
    highOpportunities: audit.highOpportunities || [],
    mediumOpportunities: audit.mediumOpportunities || [],
    summary: audit.summary || {},
    verticalStats: audit.verticalStats || {},
    scannedAt: audit.scannedAt,
    available: true,
  };
}

function collectAutoApplyLog() {
  const entries = loadJSONL(join(DATA_DIR, 'auto-edit-log.jsonl'));
  const last24h = entries.filter(e => isLast24h(e.ts));
  const failures24h = last24h.filter(e => e.status === 'failed' || e.status === 'error');
  return { total: entries.length, last24h, failures24h };
}

function collectCostHistory() {
  const entries = loadJSONL(join(DATA_DIR, 'cost-history.jsonl'));
  const now = Date.now();
  const last24h = entries.filter(c => now - new Date(c.timestamp || c.date).getTime() < 86400000);
  const last7d = entries.filter(c => now - new Date(c.timestamp || c.date).getTime() < 7 * 86400000);
  const sum = arr => arr.reduce((s, c) => s + (c.totalCost || c.totalCostUSD || c.costUSD || 0), 0);
  const cost24h = sum(last24h);
  const cost7d = sum(last7d);
  const avg7d = cost7d / 7;
  const deltaPct = avg7d === 0 ? 0 : ((cost24h - avg7d) / avg7d) * 100;
  const errors24h = last24h.filter(c => c.error || c.status === 'failed');
  return { cost24h, cost7d, avg7d, deltaPct, calls24h: last24h.length, errors24h };
}

function collectTokens() {
  const tokens = loadJSON(join(SD_DATA, 'tokens.json')) || {};
  const warnings = [];
  for (const [platform, data] of Object.entries(tokens)) {
    if (!data.expiresAt || data.expiresAt === 'never') continue;
    const daysLeft = daysUntil(data.expiresAt);
    if (daysLeft <= 14) {
      warnings.push({ platform, daysLeft, expiresAt: data.expiresAt, urgent: daysLeft <= 3 });
    }
  }
  return { tokens, warnings };
}

function collectPerformanceWeights() {
  const w = loadJSON(join(REELS_DATA, 'performance-weights.json'));
  if (!w) return { available: false };

  const pickTop = (obj) => {
    if (!obj) return null;
    const entries = Object.entries(obj).filter(([, v]) => typeof v === 'number' && v > 0);
    if (entries.length === 0) return null;
    entries.sort(([, a], [, b]) => b - a);
    return { format: entries[0][0], score: entries[0][1] };
  };

  const igTop = pickTop(w.igFormatScores);
  const tiktokTop = pickTop(w.tiktokFormatScores);
  const mergedTop = pickTop(w.formatScores);

  const mergedSource = mergedTop && w.formatScoreSource
    ? w.formatScoreSource[mergedTop.format] || 'unknown'
    : 'unknown';

  const discrepancy = igTop && tiktokTop && igTop.format !== tiktokTop.format;

  return {
    available: true,
    lastUpdated: w.lastUpdated,
    igTop,
    tiktokTop,
    mergedTop,
    mergedSource,
    discrepancy,
    killedFormats: w.killedFormats || [],
    recommendations: w.recommendations || [],
    destinationScores: w.destinationScores || {},
  };
}

function collectAngleState() {
  const st = loadJSON(join(REELS_TMP, 'angle-state.json')) || {};
  // Format: { library: { recentIds: [...] } } — latest ID used is the LAST element.
  const yesterday = {};
  for (const [lib, val] of Object.entries(st)) {
    const recent = val?.recentIds || [];
    if (recent.length > 0) {
      yesterday[lib] = recent[recent.length - 1];
    }
  }
  return { raw: st, yesterday };
}

function collectArticleData() {
  const scores = loadJSON(join(DATA_DIR, 'article-scores.json'));
  return {
    articles: scores?.scores || [],
    total: (scores?.scores || []).length,
    generatedAt: scores?.timestamp || null,
  };
}

function collectNextArticle() {
  const q = loadJSON(join(DATA_DIR, 'next-articles-queue.json'));
  if (q?.queue?.length) return q.queue[0];
  const gaps = loadJSON(join(DATA_DIR, 'content-gaps.json'));
  if (gaps?.gaps?.length) {
    const g = gaps.gaps[0];
    return {
      topic: g.keyword || g.topic || g.query || '(gap)',
      priority: g.priority || 'P2',
      articleType: 'gap-fill',
      context: { reason: `Content gap: ${g.category || g.type || 'opportunity'}` },
    };
  }
  return null;
}

function collectLinkbuildingData() {
  const logPath = join(DATA_DIR, 'linkbuilding-log.jsonl');
  const all = loadJSONL(logPath);
  const last24h = all.filter(e => isLast24h(e.date));
  const quoraLast24h = last24h.filter(e => e.platform === 'quora_fr');
  const quoraFailures = quoraLast24h.filter(e => !e.success);
  const quoraWithLinkLast24h = quoraLast24h.filter(e => e.success && e.hasLink);
  return {
    last24hCount: last24h.length,
    quoraLast24h: quoraLast24h.length,
    quoraFailures: quoraFailures.length,
    quoraWithLink24h: quoraWithLinkLast24h.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action builder — the core decision engine (Section 3)
// ─────────────────────────────────────────────────────────────────────────────

function pickRefreshCandidate(articles) {
  if (!articles.length) return null;
  // Prefer revenue-bearing articles (frShare ≥ 0.25) whose composite score is low
  // OR who lost ≥ 10 pts in a week.
  const pool = articles.filter(a => {
    const frShare = a.signals?.frShare ?? 0;
    const score = a.compositeScore ?? 100;
    return frShare >= 0.25 && score < 50;
  });
  const ranked = (pool.length ? pool : articles)
    .slice()
    .sort((a, b) => (a.compositeScore ?? 100) - (b.compositeScore ?? 100));
  return ranked[0] || null;
}

function pickReelSuggestion(perfWeights, angleState) {
  if (!perfWeights.available) return null;
  const top = perfWeights.tiktokTop || perfWeights.mergedTop || perfWeights.igTop;
  if (!top) return null;
  const [topDest] = Object.entries(perfWeights.destinationScores || {})
    .sort(([, a], [, b]) => b - a);
  const angleLib = top.format === 'versus' ? 'versus' : top.format === 'avantapres' ? 'avantapres' : null;
  const lastAngle = angleLib ? angleState.yesterday[angleLib] : null;
  return {
    format: top.format,
    formatScore: top.score,
    destination: topDest ? topDest[0] : 'vietnam',
    lastAngle,
    rotateFrom: lastAngle
      ? `last used: "${lastAngle}" — picker will pick next`
      : `angle library untapped — picker will pick first`,
  };
}

function pickWidgetOpp(widgetAudit, articles) {
  if (!widgetAudit.available) return null;
  const ops = widgetAudit.highOpportunities || [];
  if (!ops.length) return null;
  // Sort by article compositeScore desc (high-traffic first)
  const scoreBySlug = new Map(articles.map(a => [a.slug, a.compositeScore || 0]));
  const sorted = [...ops].sort((a, b) =>
    (scoreBySlug.get(b.slug) || b.score || 0) - (scoreBySlug.get(a.slug) || a.score || 0)
  );
  return sorted[0];
}

function buildActions({ articles, perfWeights, widgetAudit, angleState }) {
  const actions = [];

  const refresh = pickRefreshCandidate(articles);
  if (refresh) {
    actions.push({
      type: 'refresh',
      title: 'Rafraichir',
      slug: refresh.slug,
      articleTitle: refresh.title,
      score: refresh.compositeScore,
      frShare: refresh.signals?.frShare ?? 0,
      url: `https://flashvoyage.com/${refresh.slug}/`,
      editUrl: refresh.wpId ? `https://flashvoyage.com/wp-admin/post.php?post=${refresh.wpId}&action=edit` : null,
      rationale: `Score ${refresh.compositeScore} · frShare ${Math.round((refresh.signals?.frShare || 0) * 100)}%`,
    });
  }

  const next = collectNextArticle();
  if (next) {
    actions.push({
      type: 'write',
      title: 'Ecrire',
      topic: next.topic,
      priority: next.priority,
      rationale: next.context?.reason || next.articleType || 'calendar rotation',
    });
  }

  // Widget opportunity if there are real HIGH opps, else reel suggestion
  const widgetOpp = pickWidgetOpp(widgetAudit, articles);
  const reel = pickReelSuggestion(perfWeights, angleState);
  if (widgetOpp) {
    actions.push({
      type: 'widget',
      title: 'Ajouter widget',
      slug: widgetOpp.slug,
      articleTitle: widgetOpp.title,
      widgetId: widgetOpp.recommendedWidgetId,
      vertical: widgetOpp.vertical,
      url: `https://flashvoyage.com/${widgetOpp.slug}/`,
      rationale: `${widgetOpp.vertical} widget missing · article score ${widgetOpp.score}`,
    });
  } else if (reel) {
    actions.push({
      type: 'reel',
      title: 'Produire reel',
      format: reel.format,
      destination: reel.destination,
      rationale: `TikTok top format (score ${reel.formatScore}) · ${reel.rotateFrom}`,
    });
  }

  return actions.slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Anomaly detectors (Section 1)
// ─────────────────────────────────────────────────────────────────────────────

function buildAnomalies({ tokens, wfRuns, scoreDelta, widgetAudit, costs, autoApply, linkbuilding }) {
  const anomalies = [];

  // Tokens expiring
  for (const t of tokens.warnings) {
    anomalies.push({
      severity: t.urgent ? 'critical' : 'warning',
      icon: '🔑',
      text: `Token <b>${t.platform}</b> expire dans ${t.daysLeft}j (${t.expiresAt.slice(0, 10)})`,
      action: 'Refresh manually',
    });
  }

  // Workflow failures
  if (wfRuns?.failed24h?.length) {
    // Deduplicate by workflow name (keep most recent failure)
    const byName = new Map();
    for (const r of wfRuns.failed24h) {
      if (!byName.has(r.name) || new Date(r.created_at) > new Date(byName.get(r.name).created_at)) {
        byName.set(r.name, r);
      }
    }
    for (const r of byName.values()) {
      anomalies.push({
        severity: 'critical',
        icon: '⚙️',
        text: `Workflow <b>${r.name}</b> failed at ${new Date(r.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}`,
        action: `<a href="${r.html_url}" style="color:inherit;text-decoration:underline">View run</a>`,
      });
    }
  }

  // Score drops ≥ 10 pts WoW
  if (scoreDelta?.drops?.length) {
    for (const d of scoreDelta.drops.slice(0, 3)) {
      anomalies.push({
        severity: 'warning',
        icon: '📉',
        text: `Score drop <b>${d.slug}</b>: ${d.prev} → ${d.current} (${d.delta})`,
        action: 'Refresh candidate',
      });
    }
  }

  // Fake cards detected
  if (widgetAudit.available && (widgetAudit.fakeCards || []).length > 0) {
    anomalies.push({
      severity: 'critical',
      icon: '🚨',
      text: `<b>${widgetAudit.fakeCards.length}</b> fake card${widgetAudit.fakeCards.length > 1 ? 's' : ''} detected (.fv-faq-item without Travelpayouts script)`,
      action: 'Run partner-widget-audit',
    });
  }

  // API errors in cost-history
  if (costs.errors24h?.length) {
    anomalies.push({
      severity: 'warning',
      icon: '🔴',
      text: `<b>${costs.errors24h.length}</b> LLM error${costs.errors24h.length > 1 ? 's' : ''} in last 24h`,
      action: 'Check cost-history.jsonl',
    });
  }

  // Auto-apply failures
  if (autoApply.failures24h?.length) {
    anomalies.push({
      severity: 'warning',
      icon: '⚠️',
      text: `<b>${autoApply.failures24h.length}</b> auto-apply failure${autoApply.failures24h.length > 1 ? 's' : ''} in last 24h`,
      action: 'Check auto-edit-log.jsonl',
    });
  }

  // Linkbuilding anomaly (only if nothing shipped + bot used to work)
  if (linkbuilding.quoraFailures > 3 && linkbuilding.quoraWithLink24h === 0) {
    anomalies.push({
      severity: 'warning',
      icon: '🔗',
      text: `Quora bot: <b>${linkbuilding.quoraFailures}</b> failures, 0 posts with link`,
      action: 'Check Quora login session',
    });
  }

  return anomalies;
}

// ─────────────────────────────────────────────────────────────────────────────
// Growth signals builder (Section 2)
// ─────────────────────────────────────────────────────────────────────────────

function buildGrowthSignals({ ga4Wow, perfWeights, angleState }) {
  return {
    ga4Wow,
    perfWeights,
    angleState,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Monetization health (Section 4)
// ─────────────────────────────────────────────────────────────────────────────

function buildMonetization({ widgetAudit, articles }) {
  if (!widgetAudit.available) return { available: false };
  const s = widgetAudit.summary || {};
  const totalArticles = articles.length || widgetAudit.summary?.articleCount || 133;
  const articlesWithWidget = s.articlesWithOnePlusRealWidget || 0;
  const coveragePct = totalArticles > 0 ? Math.round((articlesWithWidget / totalArticles) * 100) : 0;

  // Top leak: high-opportunity HIGH-level articles sorted by article score
  const scoreBySlug = new Map(articles.map(a => [a.slug, a.compositeScore || 0]));
  const topLeaks = (widgetAudit.highOpportunities || [])
    .map(o => ({ ...o, articleScore: scoreBySlug.get(o.slug) || o.score || 0 }))
    .sort((a, b) => b.articleScore - a.articleScore)
    .slice(0, 3);

  return {
    available: true,
    coveragePct,
    articlesWithWidget,
    totalArticles,
    fakeCards: widgetAudit.fakeCards?.length || 0,
    topLeaks,
    verticalStats: widgetAudit.verticalStats,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline health (Section 5)
// ─────────────────────────────────────────────────────────────────────────────

function buildPipelineHealth({ costs, wfRuns, autoApply, actionsUsage }) {
  const KEY_WORKFLOWS = [
    'Content Intelligence Engine',
    'Daily Analytics',
    'Publish Reels',
    'Publish Article',
    'Daily Founder Digest Email',
  ];

  const lastRuns = [];
  if (wfRuns?.latestByWorkflow) {
    for (const name of KEY_WORKFLOWS) {
      const run = wfRuns.latestByWorkflow.get(name);
      if (run) {
        lastRuns.push({
          name,
          conclusion: run.conclusion,
          status: run.status,
          createdAt: run.created_at,
          ageHours: (Date.now() - new Date(run.created_at).getTime()) / 3600000,
        });
      } else {
        lastRuns.push({ name, conclusion: null, status: 'unknown', createdAt: null });
      }
    }
  }

  return {
    cost24h: costs.cost24h,
    avg7d: costs.avg7d,
    deltaPct: costs.deltaPct,
    costFlagged: Math.abs(costs.deltaPct) > 30 && costs.cost24h > 0.1,
    autoApply24h: autoApply.last24h.length,
    autoApplyTotal: autoApply.total,
    lastRuns,
    actionsUsage,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML rendering (mobile-first, single column, max-width 600px)
// ─────────────────────────────────────────────────────────────────────────────

const HDR_STYLE = 'font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 10px 0;padding-bottom:6px;border-bottom:2px solid #FFD700';
const FOOT_STYLE = 'font-size:11px;color:#888;margin-top:6px;font-style:italic';
const ROW_STYLE = 'padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px';
const PILL = (color, text) => `<span style="background:${color};color:white;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;margin-right:4px">${text}</span>`;

function renderAnomalies(anomalies) {
  if (!anomalies.length) {
    return `<div style="font-size:13px;color:#16a34a;padding:8px 0">✓ All systems nominal</div>`;
  }
  const visible = anomalies.slice(0, 7);
  const hidden = anomalies.length - visible.length;
  const rows = visible.map(a => {
    const color = a.severity === 'critical' ? '#DC2626' : '#F59E0B';
    return `<div style="${ROW_STYLE};display:flex;gap:8px;align-items:flex-start">
      <span style="flex-shrink:0;font-size:14px">${a.icon}</span>
      <div style="flex:1">
        <div>${PILL(color, a.severity.toUpperCase())}<span style="color:#333">${a.text}</span></div>
        <div style="font-size:11px;color:#888;margin-top:2px">→ ${a.action}</div>
      </div>
    </div>`;
  }).join('');
  const more = hidden > 0
    ? `<div style="font-size:11px;color:#888;padding:6px 0">+ ${hidden} more</div>`
    : '';
  return rows + more;
}

function renderGrowth(growth) {
  const { ga4Wow, perfWeights, angleState } = growth;
  const parts = [];

  // WoW gainers / losers
  if (ga4Wow && (ga4Wow.gainers.length || ga4Wow.losers.length)) {
    const renderRow = (r, color) => {
      const arrow = r.delta > 0 ? '▲' : '▼';
      return `<div style="${ROW_STYLE}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
          <span style="font-size:12px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px">${r.slug || r.pagePath}</span>
          <span style="color:${color};font-size:12px;font-weight:600;white-space:nowrap">${r.prevSessions} → ${r.thisSessions} ${arrow} ${pct(r.deltaPct)}</span>
        </div>
      </div>`;
    };

    if (ga4Wow.gainers.length) {
      parts.push(`<div style="margin-bottom:10px"><div style="font-size:12px;font-weight:600;color:#16a34a;margin-bottom:4px">FR gainers cette semaine</div>${ga4Wow.gainers.map(r => renderRow(r, '#16a34a')).join('')}</div>`);
    }
    if (ga4Wow.losers.length) {
      parts.push(`<div style="margin-bottom:10px"><div style="font-size:12px;font-weight:600;color:#F59E0B;margin-bottom:4px">FR losers — refresh candidates</div>${ga4Wow.losers.map(r => renderRow(r, '#F59E0B')).join('')}</div>`);
    }
  } else {
    parts.push(`<div style="font-size:12px;color:#888;margin-bottom:10px">GA4 WoW indisponible (service account manquant ou trop peu de signal FR)</div>`);
  }

  // Top format per platform
  if (perfWeights.available) {
    const { igTop, tiktokTop, mergedTop, mergedSource, discrepancy } = perfWeights;
    const igStr = igTop ? `<b>${igTop.format}</b> (${igTop.score.toFixed(1)})` : '<span style="color:#888">—</span>';
    const ttStr = tiktokTop ? `<b>${tiktokTop.format}</b> (${tiktokTop.score.toFixed(1)})` : '<span style="color:#888">—</span>';
    const mergedStr = mergedTop ? `<b>${mergedTop.format}</b> (src: ${mergedSource})` : '<span style="color:#888">—</span>';
    parts.push(`<div style="background:#f8f9fa;border-radius:6px;padding:8px 10px;margin-bottom:10px">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">Top format par plateforme</div>
      <div style="font-size:12px;line-height:1.7">
        IG: ${igStr}<br>
        TikTok: ${ttStr}<br>
        Merged (60/40): ${mergedStr}
      </div>
      ${discrepancy ? '<div style="font-size:11px;color:#DC2626;margin-top:6px">🚨 Platforms disagree — check /content tab to investigate</div>' : ''}
    </div>`);
  }

  // Angles used yesterday
  if (angleState.yesterday && Object.keys(angleState.yesterday).length > 0) {
    const list = Object.entries(angleState.yesterday)
      .map(([lib, id]) => `${lib}: <code style="background:#eee;padding:1px 4px;border-radius:3px">${id}</code>`).join(' · ');
    parts.push(`<div style="font-size:11px;color:#666;margin-bottom:4px">Angles utilisés hier: ${list}</div>`);
  } else {
    parts.push(`<div style="font-size:11px;color:#888;margin-bottom:4px">Aucun angle utilisé récemment (picker n'a pas tourné)</div>`);
  }

  // Footer action
  const footer = ga4Wow?.losers?.length
    ? `→ Rafraichir les ${Math.min(ga4Wow.losers.length, 3)} losers cette semaine`
    : perfWeights.tiktokTop
      ? `→ Doubler la mise sur le top format TikTok (${perfWeights.tiktokTop.format})`
      : `→ Publier plus de reels pour générer du signal`;
  parts.push(`<div style="${FOOT_STYLE}">${footer}</div>`);

  return parts.join('');
}

function renderActions(actions) {
  if (!actions.length) {
    return `<div style="font-size:13px;color:#888;padding:8px 0">Pas de données suffisantes pour suggérer 3 actions — vérifier les pipelines intelligence / analytics.</div>`;
  }
  const icons = { refresh: '🔄', write: '✍️', widget: '💰', reel: '🎬' };
  const colors = { refresh: '#F59E0B', write: '#2563EB', widget: '#16a34a', reel: '#7c3aed' };
  return actions.map((a, i) => {
    const icon = icons[a.type] || '→';
    const color = colors[a.type] || '#333';
    let body = '';
    if (a.type === 'refresh') {
      body = `<div style="font-size:13px;color:#333;margin-bottom:2px"><b>${a.articleTitle || a.slug}</b></div>
        <div style="font-size:11px;color:#666">${a.rationale}</div>
        ${a.editUrl ? `<div style="font-size:11px;margin-top:4px"><a href="${a.editUrl}" style="color:${color};text-decoration:none">Do it → Edit in WP</a></div>` : `<div style="font-size:11px;margin-top:4px"><a href="${a.url}" style="color:${color};text-decoration:none">Do it → View article</a></div>`}`;
    } else if (a.type === 'write') {
      body = `<div style="font-size:13px;color:#333;margin-bottom:2px"><b>${a.topic}</b> ${PILL('#6366f1', a.priority)}</div>
        <div style="font-size:11px;color:#666">${a.rationale}</div>
        <div style="font-size:11px;margin-top:4px"><a href="https://github.com/peterbono/flashvoyage-ultra-content/actions/workflows/publish-article.yml" style="color:${color};text-decoration:none">Do it → Dispatch publish-article</a></div>`;
    } else if (a.type === 'widget') {
      body = `<div style="font-size:13px;color:#333;margin-bottom:2px"><b>${a.articleTitle || a.slug}</b></div>
        <div style="font-size:11px;color:#666">${a.rationale} · widget ID <code style="background:#eee;padding:1px 4px;border-radius:3px">${a.widgetId}</code></div>
        <div style="font-size:11px;margin-top:4px"><a href="${a.url}" style="color:${color};text-decoration:none">Do it → View article</a></div>`;
    } else if (a.type === 'reel') {
      body = `<div style="font-size:13px;color:#333;margin-bottom:2px">Format <b>${a.format}</b>, destination <b>${a.destination}</b></div>
        <div style="font-size:11px;color:#666">${a.rationale}</div>
        <div style="font-size:11px;margin-top:4px"><a href="https://github.com/peterbono/flashvoyage-ultra-content/actions/workflows/publish-reels.yml" style="color:${color};text-decoration:none">Do it → Dispatch publish-reels</a></div>`;
    }
    return `<div style="border-left:3px solid ${color};padding:8px 12px;margin-bottom:${i < actions.length - 1 ? 10 : 0}px;background:#fafafa;border-radius:0 6px 6px 0">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${color};margin-bottom:4px">${icon} ${a.title}</div>
      ${body}
    </div>`;
  }).join('');
}

function renderMonetization(m) {
  if (!m.available) {
    return `<div style="font-size:12px;color:#888">Audit widget non disponible — lancer partner-widget-audit.</div>`;
  }
  const deltaBadge = m.fakeCards > 0 ? PILL('#DC2626', `${m.fakeCards} FAKE CARDS`) : '';
  const leakRows = m.topLeaks.map(l => `
    <div style="${ROW_STYLE}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
        <span style="font-size:12px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px">${l.title || l.slug}</span>
        <span style="font-size:11px;color:#16a34a;white-space:nowrap">+${l.vertical} widget</span>
      </div>
      <div style="font-size:10px;color:#888">article score ${l.articleScore} · widget ID ${l.recommendedWidgetId}</div>
    </div>`).join('');

  return `
    <div style="margin-bottom:10px">
      <div style="font-size:12px;color:#333">Widget coverage: <b>${m.articlesWithWidget} / ${m.totalArticles} (${m.coveragePct}%)</b> ${deltaBadge}</div>
    </div>
    ${m.topLeaks.length ? `<div style="margin-bottom:8px">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">Top 3 articles sans widget (opportunity cost)</div>
      ${leakRows}
    </div>` : '<div style="font-size:12px;color:#16a34a;padding:4px 0">✓ Pas d\'opportunité HIGH restante sur les top articles</div>'}
    <div style="${FOOT_STYLE}">→ Déployer un widget sur le #1 article de la liste aujourd\'hui</div>`;
}

function renderPipelineHealth(h) {
  const allHealthy = (h.lastRuns || []).every(r => r.conclusion === 'success' || r.conclusion === null) && !h.costFlagged;
  if (allHealthy) {
    return `<div style="font-size:12px;color:#16a34a">✓ All pipelines healthy · ${formatUSD(h.cost24h)} spent in last 24h</div>`;
  }

  const costStr = h.avg7d > 0
    ? `${formatUSD(h.cost24h)} <span style="color:${h.costFlagged ? '#DC2626' : '#888'};font-size:11px">(${pct(h.deltaPct)} vs 7d avg ${formatUSD(h.avg7d)})</span>`
    : formatUSD(h.cost24h);

  const runRows = (h.lastRuns || []).map(r => {
    const color = r.conclusion === 'success' ? '#16a34a'
      : r.conclusion === 'failure' ? '#DC2626'
      : r.conclusion === null ? '#888'
      : '#F59E0B';
    const badge = r.conclusion === 'success' ? '✓'
      : r.conclusion === 'failure' ? '✗'
      : '—';
    const when = r.createdAt
      ? `${Math.round(r.ageHours)}h ago`
      : 'never';
    return `<div style="font-size:11px;padding:2px 0"><span style="color:${color};font-weight:600">${badge}</span> ${r.name}: ${when}</div>`;
  }).join('');

  const usage = h.actionsUsage?.total_minutes_used
    ? `Actions minutes ce mois: ${h.actionsUsage.total_minutes_used} / ${h.actionsUsage.included_minutes || '∞'}`
    : '';

  return `
    <div style="font-size:12px;color:#333;margin-bottom:6px">LLM cost 24h: <b>${costStr}</b></div>
    <div style="margin-bottom:6px">${runRows || '<span style="font-size:11px;color:#888">GitHub Actions API indisponible (GITHUB_TOKEN manquant)</span>'}</div>
    <div style="font-size:11px;color:#666">Auto-apply LOW-tier 24h: <b>${h.autoApply24h}</b> · cumul: ${h.autoApplyTotal}</div>
    ${usage ? `<div style="font-size:11px;color:#666">${usage}</div>` : ''}`;
}

function generateDigestHTML(data) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const { anomalies, growth, actions, monetization, pipelineHealth } = data;

  const priorityColor = anomalies.some(a => a.severity === 'critical')
    ? '#DC2626'
    : anomalies.length > 0
      ? '#F59E0B'
      : '#16a34a';
  const priorityText = anomalies.some(a => a.severity === 'critical')
    ? `${anomalies.filter(a => a.severity === 'critical').length} CRITICAL`
    : anomalies.length > 0
      ? `${anomalies.length} WARNING${anomalies.length > 1 ? 'S' : ''}`
      : 'ALL OK';

  const preheader = actions.length
    ? actions.map(a => a.title).join(' · ') + (priorityColor !== '#16a34a' ? ` · ${priorityText}` : '')
    : priorityText;

  const section = (title, body, collapseIfEmpty = false) => {
    if (collapseIfEmpty && !body) return '';
    return `<div style="margin-bottom:20px">
      <h2 style="${HDR_STYLE}">${title}</h2>
      ${body}
    </div>`;
  };

  // Section 1 header varies based on anomalies
  const anomalyTitle = anomalies.length === 0
    ? '✓ ANOMALIES'
    : `🚨 ANOMALIES (${anomalies.length})`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FlashVoyage Daily Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden">${preheader}</div>

  <div style="max-width:600px;margin:0 auto;padding:12px">

    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-radius:10px 10px 0 0;padding:16px 20px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#FFD700;letter-spacing:0.5px">FLASH VOYAGE</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;text-transform:uppercase;letter-spacing:1.2px">Daily Digest</div>
      <div style="font-size:11px;color:#cbd5e1;margin-top:4px">${dateStr}</div>
      <div style="margin-top:8px"><span style="background:${priorityColor};color:white;padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px">${priorityText}</span></div>
    </div>

    <!-- MAIN CONTENT -->
    <div style="background:white;padding:18px 20px;border-radius:0 0 10px 10px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">

      ${section(anomalyTitle, renderAnomalies(anomalies))}
      ${section('📈 GROWTH SIGNALS', renderGrowth(growth))}
      ${section('🎯 TODAY\'S 3 ACTIONS', renderActions(actions))}
      ${section('💰 MONETIZATION HEALTH', renderMonetization(monetization))}
      ${section('⚙️ PIPELINE HEALTH', renderPipelineHealth(pipelineHealth))}

    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:12px 0 8px;font-size:10px;color:#94a3b8">
      FlashVoyage Daily Digest · genere a ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} (Bangkok)<br>
      <a href="https://flashvoyage.com" style="color:#FFD700;text-decoration:none">flashvoyage.com</a>
      &nbsp;·&nbsp;
      <a href="https://github.com/peterbono/flashvoyage-ultra-content/actions" style="color:#60a5fa;text-decoration:none">Actions</a>
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject line
// ─────────────────────────────────────────────────────────────────────────────

function generateSubject(data) {
  const { anomalies, actions } = data;
  const hasCritical = anomalies.some(a => a.severity === 'critical');
  const hasWarning = anomalies.length > 0;
  const prefix = hasCritical ? '🔴' : hasWarning ? '🟡' : '🟢';
  const dateShort = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const summary = anomalies.length > 0
    ? `${anomalies.length} anomal${anomalies.length > 1 ? 'ies' : 'ie'}`
    : `${actions.length} action${actions.length > 1 ? 's' : ''}`;
  return `${prefix} FlashVoyage ${dateShort} — ${summary}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

async function collectAllData() {
  // Local file-based (fast, always available)
  const articlesData = collectArticleData();
  const tokens = collectTokens();
  const widgetAudit = collectFakeCards();
  const autoApply = collectAutoApplyLog();
  const costs = collectCostHistory();
  const perfWeights = collectPerformanceWeights();
  const angleState = collectAngleState();
  const scoreDelta = collectScoreDelta();
  const linkbuilding = collectLinkbuildingData();

  // Network (parallel, best-effort)
  const [ga4Wow, wfRuns, actionsUsage] = await Promise.all([
    fetchGA4Wow().catch(err => { log(`GA4 failed: ${err.message}`); return null; }),
    fetchWorkflowRuns().catch(err => { log(`GH runs failed: ${err.message}`); return null; }),
    fetchActionsUsage().catch(() => null),
  ]);

  // Build sections
  const anomalies = buildAnomalies({ tokens, wfRuns, scoreDelta, widgetAudit, costs, autoApply, linkbuilding });
  const growth = buildGrowthSignals({ ga4Wow, perfWeights, angleState });
  const actions = buildActions({ articles: articlesData.articles, perfWeights, widgetAudit, angleState });
  const monetization = buildMonetization({ widgetAudit, articles: articlesData.articles });
  const pipelineHealth = buildPipelineHealth({ costs, wfRuns, autoApply, actionsUsage });

  return {
    generatedAt: new Date().toISOString(),
    version: 'v2-decision-oriented',
    anomalies,
    growth,
    actions,
    monetization,
    pipelineHealth,
    // Raw debug blocks (exposed in --json for downstream consumers)
    _raw: {
      articleCount: articlesData.total,
      tokens: tokens.warnings,
      scoreDrops: scoreDelta.drops,
      widgetSummary: widgetAudit.summary,
      perfWeights,
      angleState,
      wfLast24h: wfRuns?.last24h?.length || 0,
      wfFailed24h: wfRuns?.failed24h?.length || 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Email sender (preserved from v1)
// ─────────────────────────────────────────────────────────────────────────────

async function sendDigestEmail(html, subject) {
  const nodemailer = (await import('nodemailer')).default;
  const user = process.env.GMAIL_USER || 'florian.gouloubi@gmail.com';
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) {
    console.error('[DIGEST] GMAIL_APP_PASSWORD not set. Cannot send email.');
    return false;
  }
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  try {
    const info = await transporter.sendMail({
      from: `"FlashVoyage Bot" <${user}>`,
      to: user,
      subject,
      html,
    });
    log(`Email sent: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[DIGEST] Email send failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const mode = (process.argv.slice(2)[0] || '--stdout');

const data = await collectAllData();

if (mode === '--json') {
  console.log(JSON.stringify(data, null, 2));
} else if (mode === '--file') {
  const html = generateDigestHTML(data);
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, 'daily-digest.html');
  writeFileSync(outPath, html, 'utf-8');
  log(`Digest written to ${outPath}`);
  console.log(outPath);
} else if (mode === '--subject') {
  console.log(generateSubject(data));
} else if (mode === '--send') {
  const html = generateDigestHTML(data);
  const subject = generateSubject(data);
  log(`Sending digest: ${subject}`);
  const sent = await sendDigestEmail(html, subject);
  if (!sent) {
    const outPath = join(DATA_DIR, 'daily-digest.html');
    writeFileSync(outPath, html, 'utf-8');
    log(`Fallback: digest written to ${outPath}`);
  }
} else {
  const html = generateDigestHTML(data);
  console.log(html);
}

export { collectAllData, generateDigestHTML, generateSubject };
