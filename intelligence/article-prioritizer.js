/**
 * article-prioritizer.js — Content Intelligence Engine
 *
 * The BRAIN of the content pipeline. Reads all intelligence data and decides:
 *   1. What NEW articles to write (from content gaps)
 *   2. What EXISTING articles to update (stale + trending)
 *   3. What articles to ENRICH (high traffic, missing widgets)
 *   4. What articles to FLAG for review (low traffic, old)
 *
 * Decision hierarchy (highest priority first):
 *   P1: WRITE NEW — Trending topic + content gap + high monetization
 *   P2: UPDATE    — Existing article + traffic growing + stale content
 *   P3: ENRICH    — High-traffic article + missing Travelpayouts widgets
 *   P4: STANDARD  — Fill editorial calendar cluster rotation
 *   P5: REVIEW    — Low-traffic article + 6+ months old → consider merging/deleting
 *
 * Data sources consumed:
 *   - data/article-scores.json (from article-scorer.js)
 *   - data/content-gaps.json (from content-gap-detector.js)
 *   - data/editorial-calendar.json (from editorial-calendar.js)
 *   - data/article-reel-map.json (from article-reel-linker.js)
 *
 * Writes: data/next-articles-queue.json
 *
 * The editorial-calendar.js reads this queue to override its standard
 * cluster-based rotation when high-priority intelligence items exist.
 *
 * Cron: daily at 3h10 UTC (after content-gap-detector)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const QUEUE_PATH = join(DATA_DIR, 'next-articles-queue.json');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');
const GAPS_PATH = join(DATA_DIR, 'content-gaps.json');
const CALENDAR_PATH = join(DATA_DIR, 'editorial-calendar.json');
const REEL_MAP_PATH = join(DATA_DIR, 'article-reel-map.json');

// ── Thresholds ─────────────────────────────────────────────────────────────

const THRESHOLDS = {
  // For P1 WRITE NEW: minimum gap score to consider writing a new article
  minGapScoreForNew: 40,

  // For P2 UPDATE: articles scoring below this freshness are candidates for update
  staleFreshnessThreshold: 0.3, // ~6 months old

  // For P2 UPDATE: must have at least this much traffic to justify updating
  minTrafficForUpdate: 0.1,

  // For P3 ENRICH: minimum traffic signal to justify widget enrichment
  minTrafficForEnrich: 0.15,

  // For P5 REVIEW: articles below this composite score get flagged
  reviewScoreThreshold: 15,

  // Max items per priority level in the queue
  maxPerPriority: {
    write_new: 5,
    update: 3,
    enrich: 5,
    standard: 3,
    review: 10,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[INTELLIGENCE/PRIORITIZER] ${msg}`);
}

function logError(msg) {
  console.error(`[INTELLIGENCE/PRIORITIZER] ERROR: ${msg}`);
}

/**
 * Load a JSON data file. Returns null if not found.
 * @param {string} filePath
 * @returns {Promise<any|null>}
 */
async function loadJsonSafe(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    logError(`Failed to load ${filePath}: ${err.message}`);
    return null;
  }
}

// ── Main Prioritization ────────────────────────────────────────────────────

/**
 * Decide what content to produce next, ranked by priority.
 *
 * @param {Object} options
 * @param {number} options.count - Total queue items to return (default 15)
 * @returns {Promise<{
 *   timestamp: string,
 *   queueSize: number,
 *   queue: Array<{
 *     rank: number,
 *     action: 'write_new' | 'update' | 'enrich' | 'standard' | 'review',
 *     priority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5',
 *     priorityScore: number,
 *     topic: string,
 *     articleType: 'pillar' | 'support' | 'news',
 *     context: {
 *       gapScore?: number,
 *       compositeScore?: number,
 *       freshness?: number,
 *       traffic?: number,
 *       destination?: string,
 *       category?: string,
 *       suggestedTitle?: string,
 *       suggestedReelAngle?: string,
 *       wpId?: number,
 *       slug?: string,
 *       reason: string
 *     }
 *   }>,
 *   summary: {
 *     write_new: number,
 *     update: number,
 *     enrich: number,
 *     standard: number,
 *     review: number
 *   }
 * }>}
 */
export async function prioritizeNextArticles({ count = 15 } = {}) {
  log('Starting content prioritization...');
  const startTime = Date.now();

  // ── Load all intelligence data ──
  const scores = await loadJsonSafe(SCORES_PATH);
  const gaps = await loadJsonSafe(GAPS_PATH);
  const calendar = await loadJsonSafe(CALENDAR_PATH);
  const reelMap = await loadJsonSafe(REEL_MAP_PATH);

  const articleScores = scores?.scores || [];
  const contentGaps = gaps?.gaps || [];
  const calendarHistory = calendar?.history || [];

  const queue = [];

  // ── P1: WRITE NEW — Trending topic + content gap ──
  {
    const candidates = contentGaps
      .filter(g => g.gapScore >= THRESHOLDS.minGapScoreForNew)
      .slice(0, THRESHOLDS.maxPerPriority.write_new);

    for (const gap of candidates) {
      queue.push({
        rank: 0, // assigned later
        action: 'write_new',
        priority: 'P1',
        priorityScore: 100 + gap.gapScore, // P1 base = 100
        topic: gap.topic,
        articleType: gap.articleType || 'support',
        context: {
          gapScore: gap.gapScore,
          destination: gap.destination,
          category: gap.category,
          suggestedTitle: gap.suggestedTitle,
          suggestedReelAngle: gap.suggestedReelAngle,
          reason: `Content gap: "${gap.topic}" (score ${gap.gapScore}, source: ${gap.source})`,
        },
      });
    }
    log(`P1 WRITE NEW: ${candidates.length} items`);
  }

  // ── P2: UPDATE — Existing article + traffic + stale ──
  {
    const candidates = articleScores
      .filter(a =>
        a.signals.freshness <= THRESHOLDS.staleFreshnessThreshold &&
        a.signals.traffic >= THRESHOLDS.minTrafficForUpdate
      )
      .sort((a, b) => {
        // Prioritize articles that are trending AND stale
        const aUrgency = (a.signals.trendAlignment * 2 + a.signals.traffic) * (1 - a.signals.freshness);
        const bUrgency = (b.signals.trendAlignment * 2 + b.signals.traffic) * (1 - b.signals.freshness);
        return bUrgency - aUrgency;
      })
      .slice(0, THRESHOLDS.maxPerPriority.update);

    for (const article of candidates) {
      queue.push({
        rank: 0,
        action: 'update',
        priority: 'P2',
        priorityScore: 80 + article.compositeScore, // P2 base = 80
        topic: article.title,
        articleType: 'support', // updates are always support-level
        context: {
          wpId: article.wpId,
          slug: article.slug,
          compositeScore: article.compositeScore,
          freshness: article.signals.freshness,
          traffic: article.signals.traffic,
          trendAlignment: article.signals.trendAlignment,
          reason: `Stale article with traffic: freshness=${article.signals.freshness}, traffic=${article.signals.traffic}, trend=${article.signals.trendAlignment}`,
        },
      });
    }
    log(`P2 UPDATE: ${candidates.length} items`);
  }

  // ── P3: ENRICH — High-traffic articles missing widgets ──
  {
    const candidates = articleScores
      .filter(a =>
        a.signals.traffic >= THRESHOLDS.minTrafficForEnrich &&
        a.signals.monetization === 0 &&
        a.flags.includes('missing_widgets')
      )
      .sort((a, b) => b.signals.traffic - a.signals.traffic)
      .slice(0, THRESHOLDS.maxPerPriority.enrich);

    for (const article of candidates) {
      queue.push({
        rank: 0,
        action: 'enrich',
        priority: 'P3',
        priorityScore: 60 + Math.round(article.signals.traffic * 40), // P3 base = 60
        topic: article.title,
        articleType: 'support',
        context: {
          wpId: article.wpId,
          slug: article.slug,
          compositeScore: article.compositeScore,
          traffic: article.signals.traffic,
          reason: `High-traffic article missing widgets: ${article.slug} (traffic=${article.signals.traffic})`,
        },
      });
    }
    log(`P3 ENRICH: ${candidates.length} items`);
  }

  // ── P4: STANDARD — Editorial calendar cluster rotation ──
  // Only fill if P1-P3 didn't produce enough items
  {
    const existingCount = queue.length;
    const standardNeeded = Math.max(0, Math.min(
      THRESHOLDS.maxPerPriority.standard,
      count - existingCount
    ));

    if (standardNeeded > 0) {
      // Use the editorial calendar's standard cluster rotation
      // We don't call getNextDirective() here because that has side effects.
      // Instead, we predict what the calendar would produce.
      const totalPublished = calendar?.totalPublished || 0;
      const cycleTypes = ['pillar', 'support', 'support', 'support', 'news'];

      for (let i = 0; i < standardNeeded; i++) {
        const pos = (totalPublished + i) % cycleTypes.length;
        queue.push({
          rank: 0,
          action: 'standard',
          priority: 'P4',
          priorityScore: 40 - i, // P4 base = 40, decreasing
          topic: `[Calendar rotation: ${cycleTypes[pos]} article]`,
          articleType: cycleTypes[pos],
          context: {
            cyclePosition: pos,
            reason: `Standard editorial calendar rotation (position ${pos + 1}/5)`,
          },
        });
      }
    }
    log(`P4 STANDARD: ${standardNeeded} items`);
  }

  // ── P5: REVIEW — Low-score articles to flag ──
  {
    const candidates = articleScores
      .filter(a => a.compositeScore <= THRESHOLDS.reviewScoreThreshold)
      .sort((a, b) => a.compositeScore - b.compositeScore)
      .slice(0, THRESHOLDS.maxPerPriority.review);

    for (const article of candidates) {
      queue.push({
        rank: 0,
        action: 'review',
        priority: 'P5',
        priorityScore: 10 - article.compositeScore, // lower score = more urgent review
        topic: article.title,
        articleType: 'support',
        context: {
          wpId: article.wpId,
          slug: article.slug,
          compositeScore: article.compositeScore,
          freshness: article.signals.freshness,
          traffic: article.signals.traffic,
          reason: `Low-performing article: score=${article.compositeScore}, consider merge/update/delete`,
        },
      });
    }
    log(`P5 REVIEW: ${candidates.length} items`);
  }

  // ── Sort by priority score descending, assign ranks ──
  queue.sort((a, b) => b.priorityScore - a.priorityScore);
  queue.forEach((item, i) => { item.rank = i + 1; });

  // Trim to requested count
  const finalQueue = queue.slice(0, count);

  // ── Build summary ──
  const summary = {
    write_new: finalQueue.filter(q => q.action === 'write_new').length,
    update: finalQueue.filter(q => q.action === 'update').length,
    enrich: finalQueue.filter(q => q.action === 'enrich').length,
    standard: finalQueue.filter(q => q.action === 'standard').length,
    review: finalQueue.filter(q => q.action === 'review').length,
  };

  const result = {
    timestamp: new Date().toISOString(),
    queueSize: finalQueue.length,
    queue: finalQueue,
    summary,
    thresholds: THRESHOLDS,
  };

  // ── Write output ──
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(QUEUE_PATH, JSON.stringify(result, null, 2));
  log(`Priority queue: ${result.queueSize} items. Written to ${QUEUE_PATH}`);
  log(`  P1 write_new=${summary.write_new}, P2 update=${summary.update}, P3 enrich=${summary.enrich}, P4 standard=${summary.standard}, P5 review=${summary.review}`);
  log(`Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return result;
}

// ── CLI entry point ────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));
if (isMain) {
  const count = parseInt(process.argv[2] || '15', 10);
  prioritizeNextArticles({ count })
    .then(result => {
      console.log(`\nContent Priority Queue (${result.queueSize} items):`);
      for (const item of result.queue) {
        console.log(`  #${item.rank} [${item.priority}] ${item.action.toUpperCase()}: ${item.topic.slice(0, 60)}`);
      }
      console.log(`\nSummary:`, result.summary);
    })
    .catch(err => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
