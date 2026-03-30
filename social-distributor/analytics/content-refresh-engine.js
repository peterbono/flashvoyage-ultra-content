#!/usr/bin/env node

/**
 * Content Refresh Engine — FlashVoyage Content Intelligence
 *
 * Automated detection and execution of content refreshes based on
 * multi-signal intelligence from the Article Scorer + GSC + GA4.
 *
 * Three refresh categories:
 *
 *   1. DECLINING TRAFFIC REFRESH
 *      - Articles where GSC impressions dropped 30%+ (last 90 days, first half vs second half)
 *      - Or GA4 pageviews dropped 30%+ month-over-month
 *      - Action: Add fresh content, update dates, improve title/meta
 *
 *   2. PRACTICAL INFO REFRESH
 *      - Visa rules, prices, safety alerts that change frequently
 *      - Detection: date patterns in content ("2025", "en janvier"), price figures, visa types
 *      - Action: Re-fetch live data, update the fv-live-data block, bump dateModified
 *
 *   3. MISSING WIDGET REFRESH
 *      - Articles with traffic but no Travelpayouts widgets
 *      - Or articles with outdated widget shortcode format
 *      - Action: Inject contextual affiliate widgets via contextual-widget-placer-v2.js
 *
 * Integration with existing content-refresher.js:
 *   This engine EXTENDS the existing ContentRefresher (which handles live data blocks).
 *   It adds intelligence about WHEN and WHAT to refresh based on analytics signals.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const REFRESH_QUEUE_PATH = join(DATA_DIR, 'refresh-queue.json');

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[REFRESH-ENGINE] ${msg}`);
}

function logError(msg) {
  console.error(`[REFRESH-ENGINE] ERROR: ${msg}`);
}

// ── Refresh Signal Detection ────────────────────────────────────────────────

/**
 * Detect articles that need refreshing based on declining traffic signals.
 *
 * Uses GSC data (impressions trend) and GA4 data (pageview trend).
 *
 * @param {Object} options
 * @param {Array} options.gscDeclining - From search-console-fetcher.findDecliningQueries()
 * @param {Array} options.articleScores - From article-scorer.scoreAllArticles()
 * @returns {Array<RefreshCandidate>}
 */
export function detectDecliningArticles(options = {}) {
  const { gscDeclining = [], articleScores = [] } = options;

  log(`Analyzing ${gscDeclining.length} declining queries and ${articleScores.length} article scores...`);

  const candidates = [];

  // From GSC declining queries
  const seenPages = new Set();
  for (const dq of gscDeclining) {
    if (seenPages.has(dq.page)) continue;
    seenPages.add(dq.page);

    candidates.push({
      type: 'declining_traffic',
      url: dq.page,
      slug: dq.page.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, ''),
      signal: `Impressions declined ${dq.declinePercent}% (${dq.firstHalfImpressions} → ${dq.secondHalfImpressions})`,
      severity: dq.declinePercent >= 50 ? 'critical' : dq.declinePercent >= 30 ? 'warning' : 'info',
      declinePercent: dq.declinePercent,
      query: dq.query,
      currentPosition: dq.position,
      actions: [
        'UPDATE_CONTENT: Add 200-400 words of fresh, expert content',
        'REFRESH_TITLE: A/B test a new title tag with current-year date',
        'BUILD_LINKS: Add 2-3 internal links from high-traffic articles',
        'BUMP_DATE: Update dateModified in schema and add "Mis a jour" badge',
      ],
    });
  }

  // From article scores — bottom 25% with some existing traffic
  const lowScoreArticles = articleScores
    .filter(a => a.percentile < 25 && a.raw.impressions > 50)
    .slice(0, 20);

  for (const article of lowScoreArticles) {
    if (seenPages.has(article.url)) continue;
    seenPages.add(article.url);

    candidates.push({
      type: 'low_performance',
      url: article.url,
      slug: article.slug,
      signal: `Bottom ${article.percentile}th percentile (score ${article.totalScore}) with ${article.raw.impressions} impressions`,
      severity: article.percentile < 10 ? 'critical' : 'warning',
      totalScore: article.totalScore,
      actions: article.actions,
    });
  }

  candidates.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    return (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2);
  });

  log(`Detected ${candidates.length} articles needing refresh (${candidates.filter(c => c.severity === 'critical').length} critical)`);
  return candidates;
}

/**
 * Detect articles with outdated practical information.
 *
 * Scans article content for:
 *   - Year references (e.g., "2024", "2025") that should be updated to current year
 *   - Price figures that may have changed
 *   - Visa/entry requirements that change frequently
 *   - Articles older than 6 months that haven't been refreshed
 *
 * @param {Array} wpArticles - WordPress articles with content and modified date
 * @returns {Array<RefreshCandidate>}
 */
export function detectOutdatedPracticalInfo(wpArticles) {
  const currentYear = new Date().getFullYear();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const candidates = [];

  for (const article of wpArticles) {
    const content = article.content?.rendered || article.content || '';
    const title = article.title?.rendered || article.title || '';
    const modified = new Date(article.modified);
    const ageMonths = Math.floor((Date.now() - modified.getTime()) / (30 * 24 * 60 * 60 * 1000));

    const issues = [];

    // Check for outdated year references
    const yearPattern = /\b(202[0-4])\b/g;
    const outdatedYears = [...content.matchAll(yearPattern)].map(m => m[1]);
    const uniqueYears = [...new Set(outdatedYears)];
    if (uniqueYears.length > 0) {
      issues.push(`Contains outdated year references: ${uniqueYears.join(', ')} (current: ${currentYear})`);
    }

    // Check for price-sensitive content
    const hasPrices = /\d+\s*[€$]\s|[€$]\s*\d+|\d+\s*(euros?|dollars?|bahts?|dongs?|rupiah)/i.test(content);
    const isPractical = /visa|formalit|budget|co[uû]t|prix|assurance|transport|vol|h[oô]tel/i.test(title);

    if (hasPrices && modified < sixMonthsAgo) {
      issues.push(`Contains prices and hasn't been updated in ${ageMonths} months`);
    }

    if (isPractical && modified < sixMonthsAgo) {
      issues.push(`Practical content (${title.slice(0, 50)}) last updated ${ageMonths} months ago`);
    }

    // Check for missing live data block
    const hasLiveData = content.includes('fv-live-data');
    if (!hasLiveData && isPractical) {
      issues.push('Missing fv-live-data block — should have real-time practical info');
    }

    // Check for outdated "mis a jour" badge
    const badgeMatch = content.match(/Mis à jour le (\d+ \w+ \d{4})/);
    if (badgeMatch) {
      // Parse the French date
      const badgeDate = parseFrenchDate(badgeMatch[1]);
      if (badgeDate && badgeDate < sixMonthsAgo) {
        issues.push(`"Mis a jour" badge shows ${badgeMatch[1]} — over 6 months old`);
      }
    }

    if (issues.length > 0) {
      candidates.push({
        type: 'outdated_info',
        url: `https://flashvoyage.com/${article.slug || ''}/`,
        slug: article.slug || '',
        wpId: article.id,
        title: title.slice(0, 80),
        signal: issues.join('; '),
        severity: issues.length >= 3 ? 'critical' : issues.length >= 2 ? 'warning' : 'info',
        ageMonths,
        lastModified: article.modified,
        issues,
        actions: [
          issues.some(i => i.includes('year')) ? 'UPDATE_YEARS: Replace outdated year references' : null,
          issues.some(i => i.includes('prices')) ? 'REFRESH_PRICES: Re-fetch live price data' : null,
          issues.some(i => i.includes('fv-live-data')) ? 'ADD_LIVE_DATA: Inject fv-live-data block with real-time info' : null,
          'BUMP_DATE: Update dateModified and "Mis a jour" badge',
        ].filter(Boolean),
      });
    }
  }

  candidates.sort((a, b) => b.ageMonths - a.ageMonths);

  log(`Detected ${candidates.length} articles with outdated practical info`);
  return candidates;
}

/**
 * Parse a French date string like "15 mars 2025" into a Date.
 */
function parseFrenchDate(str) {
  const months = {
    janvier: 0, fevrier: 1, 'février': 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, 'août': 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, 'décembre': 11, decembre: 11,
  };

  const parts = str.trim().split(/\s+/);
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0]);
  const month = months[parts[1].toLowerCase()];
  const year = parseInt(parts[2]);

  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day);
}

/**
 * Detect articles with missing or outdated Travelpayouts widgets.
 *
 * Checks:
 *   - Articles with >100 monthly pageviews but no widget shortcodes
 *   - Articles with old widget format ({{TRAVELPAYOUTS_*}}) instead of data-tp
 *   - Articles about destinations with no flight/hotel widgets
 *
 * @param {Array} wpArticles - WordPress articles with content
 * @param {Array} articleScores - From article-scorer
 * @returns {Array<RefreshCandidate>}
 */
export function detectMissingWidgets(wpArticles, articleScores = []) {
  const candidates = [];

  // Build a score lookup
  const scoreBySlug = {};
  for (const score of articleScores) {
    scoreBySlug[score.slug] = score;
  }

  for (const article of wpArticles) {
    const content = article.content?.rendered || article.content || '';
    const slug = article.slug || '';
    const score = scoreBySlug[slug];
    const pageviews = score?.raw?.pageviews || 0;

    // Only check articles with meaningful traffic
    if (pageviews < 50) continue;

    const issues = [];

    // Check for any Travelpayouts widget presence
    const hasWidget = content.includes('data-tp') ||
                      content.includes('travelpayouts') ||
                      content.includes('tp-widget') ||
                      content.includes('TRAVELPAYOUTS');

    if (!hasWidget) {
      issues.push(`No Travelpayouts widget found (${pageviews} monthly pageviews)`);
    }

    // Check for old widget format
    const hasOldFormat = /\{\{TRAVELPAYOUTS_\w+_WIDGET\}\}/.test(content);
    if (hasOldFormat) {
      issues.push('Contains unreplaced widget placeholders (old format)');
    }

    // Check for destination articles missing specific widgets
    const isDestination = /bali|thailand|vietnam|japon|philippines|cambodge|laos|malaisie/i.test(
      article.title?.rendered || article.title || ''
    );
    if (isDestination && !content.includes('flights') && !content.includes('vol')) {
      issues.push('Destination article missing flight widget');
    }

    if (issues.length > 0) {
      candidates.push({
        type: 'missing_widgets',
        url: `https://flashvoyage.com/${slug}/`,
        slug,
        wpId: article.id,
        title: (article.title?.rendered || article.title || '').slice(0, 80),
        signal: issues.join('; '),
        severity: pageviews > 500 ? 'critical' : pageviews > 200 ? 'warning' : 'info',
        pageviews,
        issues,
        actions: [
          'ADD_WIDGETS: Run contextual-widget-placer-v2.js on this article',
          'ADD_CTA_LINKS: Generate affiliate CTA links via travelpayouts-api-client.js',
          score?.raw?.affiliateClicks === 0
            ? 'OPTIMIZE_PLACEMENT: Add widgets in high-visibility positions (after first H2, before conclusion)'
            : null,
        ].filter(Boolean),
      });
    }
  }

  candidates.sort((a, b) => b.pageviews - a.pageviews);

  log(`Detected ${candidates.length} articles with missing/outdated widgets`);
  return candidates;
}

// ── Unified Refresh Queue ───────────────────────────────────────────────────

/**
 * Build the unified refresh queue combining all signal sources.
 * Deduplicates by URL and prioritizes.
 *
 * @param {Object} data
 * @param {Array} data.gscDeclining
 * @param {Array} data.articleScores
 * @param {Array} data.wpArticles
 * @returns {Array<RefreshCandidate>}
 */
export function buildRefreshQueue(data = {}) {
  const { gscDeclining = [], articleScores = [], wpArticles = [] } = data;

  log('Building unified refresh queue...');

  const declining = detectDecliningArticles({ gscDeclining, articleScores });
  const outdated = detectOutdatedPracticalInfo(wpArticles);
  const missingWidgets = detectMissingWidgets(wpArticles, articleScores);

  // Merge and deduplicate by URL
  const seen = new Map();

  for (const candidate of [...declining, ...outdated, ...missingWidgets]) {
    const key = candidate.url || candidate.slug;
    if (seen.has(key)) {
      // Merge issues and actions
      const existing = seen.get(key);
      existing.issues = [...new Set([...(existing.issues || []), ...(candidate.issues || [])])];
      existing.actions = [...new Set([...(existing.actions || []), ...(candidate.actions || [])])];
      existing.types = [...new Set([...(existing.types || [existing.type]), candidate.type])];
      // Upgrade severity
      const sevOrder = { critical: 0, warning: 1, info: 2 };
      if ((sevOrder[candidate.severity] || 2) < (sevOrder[existing.severity] || 2)) {
        existing.severity = candidate.severity;
      }
    } else {
      seen.set(key, { ...candidate, types: [candidate.type] });
    }
  }

  const queue = [...seen.values()];

  // Sort: critical first, then by number of issues
  const sevOrder = { critical: 0, warning: 1, info: 2 };
  queue.sort((a, b) => {
    const sevDiff = (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2);
    if (sevDiff !== 0) return sevDiff;
    return (b.issues?.length || 0) - (a.issues?.length || 0);
  });

  log(`Refresh queue: ${queue.length} articles (${queue.filter(q => q.severity === 'critical').length} critical, ${queue.filter(q => q.severity === 'warning').length} warning)`);

  return queue;
}

/**
 * Build and persist the refresh queue.
 */
export async function buildAndPersistRefreshQueue(data = {}) {
  const queue = buildRefreshQueue(data);

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const output = {
    generatedAt: new Date().toISOString(),
    totalCandidates: queue.length,
    bySeverity: {
      critical: queue.filter(q => q.severity === 'critical').length,
      warning: queue.filter(q => q.severity === 'warning').length,
      info: queue.filter(q => q.severity === 'info').length,
    },
    byType: {
      declining_traffic: queue.filter(q => q.types?.includes('declining_traffic')).length,
      outdated_info: queue.filter(q => q.types?.includes('outdated_info')).length,
      missing_widgets: queue.filter(q => q.types?.includes('missing_widgets')).length,
      low_performance: queue.filter(q => q.types?.includes('low_performance')).length,
    },
    queue,
  };

  writeFileSync(REFRESH_QUEUE_PATH, JSON.stringify(output, null, 2), 'utf-8');
  log(`Refresh queue written to ${REFRESH_QUEUE_PATH}`);

  return queue;
}

// ── CLI Mode ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('content-refresh-engine')) {
  const command = process.argv[2] || 'help';

  (async () => {
    try {
      switch (command) {
        case 'detect': {
          // Detect outdated articles (WP data only, no external APIs needed)
          const resp = await fetch(
            'https://flashvoyage.com/wp-json/wp/v2/posts?per_page=100&_fields=id,title,slug,content,modified',
            { signal: AbortSignal.timeout(15000) }
          );
          const articles = await resp.json();
          log(`Fetched ${articles.length} articles from WP`);

          const outdated = detectOutdatedPracticalInfo(articles);
          console.log(`\n=== OUTDATED PRACTICAL INFO (${outdated.length} articles) ===\n`);
          for (const c of outdated.slice(0, 20)) {
            console.log(`[${c.severity.toUpperCase()}] ${c.title} (${c.ageMonths} months old)`);
            for (const issue of c.issues) {
              console.log(`   - ${issue}`);
            }
            console.log();
          }
          break;
        }
        case 'widgets': {
          const resp = await fetch(
            'https://flashvoyage.com/wp-json/wp/v2/posts?per_page=100&_fields=id,title,slug,content',
            { signal: AbortSignal.timeout(15000) }
          );
          const articles = await resp.json();
          const missing = detectMissingWidgets(articles);
          console.log(`\n=== MISSING WIDGETS (${missing.length} articles) ===\n`);
          for (const c of missing.slice(0, 20)) {
            console.log(`[${c.severity.toUpperCase()}] ${c.title} (${c.pageviews || '?'} PV/mo)`);
            for (const issue of c.issues) {
              console.log(`   - ${issue}`);
            }
            console.log();
          }
          break;
        }
        default:
          console.log(`
Content Refresh Engine — FlashVoyage

Usage:
  node content-refresh-engine.js detect   Detect articles with outdated practical info
  node content-refresh-engine.js widgets  Detect articles missing affiliate widgets

Full analysis (with GSC + GA4 data) via orchestrator:
  node content-intelligence-engine.js full
`);
      }
    } catch (err) {
      logError(err.message);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}
