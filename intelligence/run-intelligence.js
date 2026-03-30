#!/usr/bin/env node

/**
 * run-intelligence.js — Content Intelligence Engine Orchestrator
 *
 * Runs all intelligence modules in sequence:
 *   1. article-scorer.js       → Score all articles (data/article-scores.json)
 *   2. content-gap-detector.js → Detect content gaps (data/content-gaps.json)
 *   3. article-reel-linker.js  → Link articles to reels (data/article-reel-map.json)
 *   4. article-prioritizer.js  → Build priority queue (data/next-articles-queue.json)
 *   5. article-recommender.js  → Generate actionable recommendations (data/article-recommendations.json)
 *
 * Order matters: each module reads the output of previous modules.
 *
 * Usage:
 *   node intelligence/run-intelligence.js              # Run all
 *   node intelligence/run-intelligence.js --score      # Score only
 *   node intelligence/run-intelligence.js --gaps       # Gaps only
 *   node intelligence/run-intelligence.js --link       # Linker only
 *   node intelligence/run-intelligence.js --queue      # Prioritizer only
 *   node intelligence/run-intelligence.js --recommend  # Recommender only
 *
 * Cron: daily at 3h00 UTC (via .github/workflows/content-intelligence.yml)
 */

import { scoreAllArticles } from './article-scorer.js';
import { detectContentGaps } from './content-gap-detector.js';
import { linkArticlesAndReels } from './article-reel-linker.js';
import { prioritizeNextArticles } from './article-prioritizer.js';
import { generateFullReport } from './article-recommender.js';

function log(msg) {
  console.log(`[INTELLIGENCE] ${msg}`);
}

function logError(msg) {
  console.error(`[INTELLIGENCE] ERROR: ${msg}`);
}

async function run() {
  const args = process.argv.slice(2);
  const runAll = args.length === 0;
  const runScore = runAll || args.includes('--score');
  const runGaps = runAll || args.includes('--gaps');
  const runLink = runAll || args.includes('--link');
  const runQueue = runAll || args.includes('--queue');
  const runRecommend = runAll || args.includes('--recommend');

  log('='.repeat(60));
  log('Content Intelligence Engine — Starting');
  log('='.repeat(60));
  const startTime = Date.now();

  // ── Step 1: Score all articles ──
  if (runScore) {
    log('\n--- Step 1/4: Article Scoring ---');
    try {
      const result = await scoreAllArticles();
      log(`Scored ${result.articleCount} articles (avg ${result.summary.avgScore}/100)`);
    } catch (err) {
      logError(`Article scoring failed: ${err.message}`);
      // Continue — downstream modules use stale data if available
    }
  }

  // ── Step 2: Detect content gaps ──
  if (runGaps) {
    log('\n--- Step 2/4: Content Gap Detection ---');
    try {
      const result = await detectContentGaps();
      log(`Detected ${result.gapCount} content gaps`);
    } catch (err) {
      logError(`Gap detection failed: ${err.message}`);
    }
  }

  // ── Step 3: Link articles to reels ──
  if (runLink) {
    log('\n--- Step 3/4: Article-Reel Linking ---');
    try {
      const result = await linkArticlesAndReels();
      log(`Linked ${result.stats.articlesWithReels} articles, ${result.stats.viralReels} viral alerts`);
    } catch (err) {
      logError(`Article-reel linking failed: ${err.message}`);
    }
  }

  // ── Step 4: Prioritize next articles ──
  if (runQueue) {
    log('\n--- Step 4/5: Content Prioritization ---');
    try {
      const result = await prioritizeNextArticles({ count: 15 });
      log(`Priority queue: ${result.queueSize} items`);
      log(`  P1 update=${result.summary.update} enrich=${result.summary.enrich}, P2 write_new=${result.summary.write_new}, P3 standard=${result.summary.standard}, P4 review=${result.summary.review}`);
    } catch (err) {
      logError(`Prioritization failed: ${err.message}`);
    }
  }

  // ── Step 5: Generate article improvement recommendations ──
  if (runRecommend) {
    log('\n--- Step 5/5: Article Recommendations ---');
    try {
      const result = await generateFullReport();
      log(`Recommendations: ${result.summary.totalRecommendations} total (P0=${result.summary.byPriority.P0}, P1=${result.summary.byPriority.P1}, P2=${result.summary.byPriority.P2})`);
      log(`Articles with actions: ${result.summary.articlesWithRecommendations}/${result.summary.totalArticles}`);
    } catch (err) {
      logError(`Recommendations failed: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('\n' + '='.repeat(60));
  log(`Content Intelligence Engine — Complete (${elapsed}s)`);
  log('='.repeat(60));
}

run().catch(err => {
  logError(`FATAL: ${err.message}`);
  process.exit(1);
});
