/**
 * Performance Scorer — FlashVoyage Analytics
 *
 * Combines IG reel stats + GA4 article data to score content performance.
 * Generates actionable recommendations and writes performance-weights.json
 * that the reel format router reads to adjust format/destination priorities.
 *
 * Scoring formula (reel):
 *   (saves x 3) + (shares x 2) + (comments x 1.5) + (likes x 0.5) + (plays / 100)
 *
 * Format ranking: average score per format over N days
 * Destination ranking: combined IG engagement + GA4 traffic
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { fetchRecentReelStats, fetchRecentMedia } from './ig-stats-fetcher.js';
import { fetchTopArticles, fetchDestinationTraffic } from './ga4-fetcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REELS_DATA_DIR = join(__dirname, '..', 'reels', 'data');
const WEIGHTS_PATH = join(REELS_DATA_DIR, 'performance-weights.json');

// Known formats from reels/config.js — must mirror smart-scheduler.js VALID_FORMATS
// otherwise nightly refresh silently drops formats we actually publish.
const KNOWN_FORMATS = [
  'poll', 'pick', 'humor', 'humor-tweet', 'budget', 'versus', 'avantapres',
  'month', 'cost-vs', 'leaderboard', 'best-time',
];

// Hardcoded killed formats — preserved in the weights file so the scheduler's
// loadKilledFormats() always finds them even after an automated refresh.
// Mirrors KILLED_FORMATS_HARDCODED in smart-scheduler.js.
const KILLED_FORMATS_OUT = ['poll', 'versus'];

// Known SE Asia destinations for cross-referencing
const KNOWN_DESTINATIONS = [
  'bali', 'thailande', 'vietnam', 'cambodge', 'philippines',
  'myanmar', 'laos', 'malaisie', 'singapour', 'indonesie',
  'chiang mai', 'bangkok', 'krabi', 'phuket', 'koh samui',
  'hanoi', 'ho chi minh', 'da nang', 'hoi an', 'siem reap',
  'luang prabang', 'el nido', 'siargao', 'lombok', 'ubud',
  'koh phi phi', 'koh lanta', 'langkawi', 'nha trang', 'ha long',
  'yogyakarta', 'bagan', 'chiang rai', 'koh tao', 'pai',
];

function log(msg) {
  console.log(`[ANALYTICS/SCORE] ${msg}`);
}

function logError(msg) {
  console.error(`[ANALYTICS/SCORE] ERROR: ${msg}`);
}

// ── Reel Scoring ────────────────────────────────────────────────────────────

/**
 * Score a single reel's performance.
 * Higher weight on saves/shares (stronger engagement signals for algorithm).
 *
 * Formula: (saves x 3) + (shares x 2) + (comments x 1.5) + (likes x 0.5) + (plays / 100)
 *
 * @param {{ plays?: number, reach?: number, saved?: number, shares?: number, comments?: number, likes?: number }} stats
 * @returns {number} Engagement score (0+)
 */
export function scoreReel(stats) {
  if (!stats) return 0;

  const score =
    (stats.saved ?? 0) * 3 +
    (stats.shares ?? 0) * 2 +
    (stats.comments ?? 0) * 1.5 +
    (stats.likes ?? 0) * 0.5 +
    (stats.plays ?? 0) / 100;

  return Math.round(score * 10) / 10; // 1 decimal place
}

/**
 * Compute engagement rate for a reel: (likes + comments + saves + shares) / reach.
 *
 * @param {{ reach?: number, saved?: number, shares?: number, comments?: number, likes?: number }} stats
 * @returns {number} Engagement rate as a percentage (0-100)
 */
export function engagementRate(stats) {
  if (!stats || !stats.reach || stats.reach === 0) return 0;

  const interactions = (stats.likes ?? 0) + (stats.comments ?? 0) + (stats.saved ?? 0) + (stats.shares ?? 0);
  return Math.round((interactions / stats.reach) * 10000) / 100; // 2 decimal places
}

// ── Format Ranking ──────────────────────────────────────────────────────────

/**
 * Rank reel formats by average performance score over the last N days.
 * Returns sorted array from best to worst, with recommendation.
 *
 * @param {number} days - Lookback window (default 14)
 * @returns {Promise<Array<{ format: string, avgScore: number, count: number, totalPlays: number, recommendation: 'increase' | 'maintain' | 'decrease' }>>}
 */
export async function rankFormats(days = 14) {
  log(`Ranking formats over the last ${days} days...`);

  const reelStats = await fetchRecentReelStats(days);

  if (reelStats.length === 0) {
    log('No reel stats available for ranking');
    return KNOWN_FORMATS.map(f => ({
      format: f,
      avgScore: 0,
      count: 0,
      totalPlays: 0,
      recommendation: 'maintain',
    }));
  }

  // Group by format
  const byFormat = {};
  for (const reel of reelStats) {
    const fmt = reel.format?.toLowerCase() || 'unknown';
    if (!byFormat[fmt]) byFormat[fmt] = [];
    if (reel.stats) {
      byFormat[fmt].push({
        score: scoreReel(reel.stats),
        plays: reel.stats.plays ?? 0,
        er: engagementRate(reel.stats),
      });
    }
  }

  // Compute averages
  const rankings = [];
  for (const format of KNOWN_FORMATS) {
    const entries = byFormat[format] || [];
    const count = entries.length;
    const avgScore = count > 0 ? entries.reduce((s, e) => s + e.score, 0) / count : 0;
    const totalPlays = entries.reduce((s, e) => s + e.plays, 0);
    const avgER = count > 0 ? entries.reduce((s, e) => s + e.er, 0) / count : 0;

    rankings.push({
      format,
      avgScore: Math.round(avgScore * 10) / 10,
      count,
      totalPlays,
      avgEngagementRate: Math.round(avgER * 100) / 100,
    });
  }

  // Sort by avgScore desc
  rankings.sort((a, b) => b.avgScore - a.avgScore);

  // Assign recommendations based on relative position
  const maxScore = rankings[0]?.avgScore || 1;
  for (const r of rankings) {
    if (r.count === 0) {
      r.recommendation = 'maintain'; // Not enough data
    } else if (r.avgScore >= maxScore * 0.8) {
      r.recommendation = 'increase';
    } else if (r.avgScore >= maxScore * 0.5) {
      r.recommendation = 'maintain';
    } else {
      r.recommendation = 'decrease';
    }
  }

  log(`Format rankings: ${rankings.map(r => `${r.format}=${r.avgScore}`).join(', ')}`);
  return rankings;
}

// ── Destination Ranking ─────────────────────────────────────────────────────

/**
 * Rank destinations by combined IG engagement + GA4 traffic.
 * Cross-references reel captions/types with GA4 article pageviews.
 *
 * @param {number} days - Lookback window (default 30)
 * @returns {Promise<Array<{ destination: string, igScore: number, ga4Pageviews: number, combinedScore: number }>>}
 */
export async function rankDestinations(days = 30) {
  log(`Ranking destinations over the last ${days} days...`);

  // Fetch both data sources in parallel
  const [reelStats, ga4Traffic] = await Promise.all([
    fetchRecentReelStats(days).catch(err => {
      logError(`IG stats failed: ${err.message}`);
      return [];
    }),
    fetchDestinationTraffic(KNOWN_DESTINATIONS, days).catch(err => {
      logError(`GA4 traffic failed: ${err.message}`);
      return {};
    }),
  ]);

  // IG: extract destination mentions from captions
  const igByDest = {};
  for (const reel of reelStats) {
    if (!reel.stats) continue;
    const caption = reel.stats.caption?.toLowerCase() || '';
    const score = scoreReel(reel.stats);

    for (const dest of KNOWN_DESTINATIONS) {
      if (caption.includes(dest)) {
        if (!igByDest[dest]) igByDest[dest] = { totalScore: 0, count: 0 };
        igByDest[dest].totalScore += score;
        igByDest[dest].count += 1;
      }
    }
  }

  // Combine IG + GA4 into a single score
  // Normalize: IG score 0-10, GA4 pageviews 0-10, then average
  const maxIGScore = Math.max(...Object.values(igByDest).map(d => d.totalScore), 1);
  const maxGA4PV = Math.max(...Object.values(ga4Traffic).map(d => d.pageviews), 1);

  const rankings = [];
  const allDests = new Set([...Object.keys(igByDest), ...Object.keys(ga4Traffic)]);

  for (const dest of allDests) {
    const ig = igByDest[dest] || { totalScore: 0, count: 0 };
    const ga4 = ga4Traffic[dest] || { pageviews: 0, sessions: 0, articles: 0 };

    const igNorm = (ig.totalScore / maxIGScore) * 10;
    const ga4Norm = (ga4.pageviews / maxGA4PV) * 10;
    // Weight: 60% IG (direct engagement), 40% GA4 (traffic potential)
    const combined = igNorm * 0.6 + ga4Norm * 0.4;

    rankings.push({
      destination: dest,
      igScore: Math.round(igNorm * 10) / 10,
      igReelCount: ig.count,
      ga4Pageviews: ga4.pageviews,
      ga4Articles: ga4.articles,
      combinedScore: Math.round(combined * 10) / 10,
    });
  }

  rankings.sort((a, b) => b.combinedScore - a.combinedScore);

  log(`Top destinations: ${rankings.slice(0, 5).map(r => `${r.destination}=${r.combinedScore}`).join(', ')}`);
  return rankings;
}

// ── Weekly Report ───────────────────────────────────────────────────────────

/**
 * Generate a comprehensive weekly optimization report.
 *
 * Returns:
 * - Top 3 performing formats with recommendations
 * - Top 5 performing destinations
 * - Content gaps: high GA4 traffic articles with no matching reel
 * - Specific recommendations for next week's reel calendar
 *
 * @returns {Promise<object>} Full report object
 */
export async function generateWeeklyReport() {
  log('Generating weekly optimization report...');

  const [formatRanking, destRanking, topArticles] = await Promise.all([
    rankFormats(14),
    rankDestinations(30),
    fetchTopArticles(7, 50).catch(err => {
      logError(`GA4 top articles failed: ${err.message}`);
      return [];
    }),
  ]);

  // Find content gaps: high-traffic articles with no reel coverage
  const reelStats = await fetchRecentReelStats(30).catch(() => []);
  const reelCaptions = reelStats
    .filter(r => r.stats?.caption)
    .map(r => r.stats.caption.toLowerCase());

  const contentGaps = topArticles
    .filter(article => {
      // Check if any reel caption mentions this article's slug
      const slug = article.pagePath.replace(/\//g, '').toLowerCase();
      if (!slug || slug.length < 3) return false;
      return !reelCaptions.some(c => c.includes(slug));
    })
    .slice(0, 10)
    .map(a => ({
      pagePath: a.pagePath,
      pageTitle: a.pageTitle,
      pageviews: a.pageviews,
      suggestion: `Create a reel for "${a.pageTitle}" (${a.pageviews} views/week)`,
    }));

  // Build recommendations
  const recommendations = [];

  // Format recommendations
  const topFormats = formatRanking.filter(f => f.count > 0).slice(0, 3);
  const bottomFormats = formatRanking.filter(f => f.count > 0 && f.recommendation === 'decrease');

  if (topFormats.length > 0) {
    recommendations.push(
      `Top format: ${topFormats[0].format} (avg score ${topFormats[0].avgScore}) — increase frequency`
    );
  }
  for (const bf of bottomFormats) {
    recommendations.push(
      `${bf.format} underperforming (avg ${bf.avgScore}) — consider rotating or refreshing`
    );
  }

  // Destination recommendations
  const topDests = destRanking.filter(d => d.combinedScore > 0).slice(0, 3);
  for (const d of topDests) {
    recommendations.push(
      `${d.destination} trending (combined score ${d.combinedScore}) — prioritize in next week's reels`
    );
  }

  // Content gap recommendations
  if (contentGaps.length > 0) {
    recommendations.push(
      `${contentGaps.length} high-traffic articles have no matching reel — create reels to capture IG audience`
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    period: {
      formatAnalysis: '14 days',
      destinationAnalysis: '30 days',
      trafficAnalysis: '7 days',
    },
    topFormats: topFormats.map(f => ({
      format: f.format,
      avgScore: f.avgScore,
      count: f.count,
      totalPlays: f.totalPlays,
      recommendation: f.recommendation,
    })),
    topDestinations: destRanking.filter(d => d.combinedScore > 0).slice(0, 5),
    contentGaps,
    recommendations,
    summary: {
      totalReelsAnalyzed: reelStats.length,
      formatsWithData: formatRanking.filter(f => f.count > 0).length,
      destinationsTracked: destRanking.filter(d => d.combinedScore > 0).length,
      contentGapsFound: contentGaps.length,
    },
  };

  log(`Report generated: ${report.summary.totalReelsAnalyzed} reels, ${report.summary.formatsWithData} formats, ${report.summary.contentGapsFound} gaps`);
  return report;
}

// ── Performance Weights Writer ──────────────────────────────────────────────

/**
 * Write performance-weights.json that the reel format router reads.
 * Converts ranking data into a simple weight map the pipeline can consume.
 *
 * Output file: social-distributor/reels/data/performance-weights.json
 *
 * @returns {Promise<void>}
 */
export async function updatePerformanceWeights() {
  log('Updating performance weights...');

  const [formatRanking, destRanking] = await Promise.all([
    rankFormats(14),
    rankDestinations(30),
  ]);

  // Convert format rankings to score map
  const formatScores = {};
  for (const f of formatRanking) {
    formatScores[f.format] = f.avgScore;
  }

  // Convert destination rankings to score map (top 20)
  const destinationScores = {};
  for (const d of destRanking.filter(d => d.combinedScore > 0).slice(0, 20)) {
    destinationScores[d.destination] = d.combinedScore;
  }

  // Build recommendation strings
  const recommendations = [];

  const sorted = [...formatRanking].sort((a, b) => b.avgScore - a.avgScore);
  if (sorted[0]?.count > 0) {
    recommendations.push(`Increase ${sorted[0].format} frequency (top performer, avg ${sorted[0].avgScore})`);
  }

  const worst = sorted.filter(f => f.count > 0 && f.recommendation === 'decrease');
  for (const w of worst) {
    recommendations.push(`Reduce ${w.format} (underperforming, avg ${w.avgScore})`);
  }

  const topDest = destRanking.filter(d => d.combinedScore > 0).slice(0, 3);
  for (const d of topDest) {
    recommendations.push(`${d.destination} content trending — prioritize`);
  }

  // If no data available yet, add a note
  if (formatRanking.every(f => f.count === 0)) {
    recommendations.push('No reel data yet — weights are placeholder, will update after first reels are published');
  }

  const weights = {
    lastUpdated: new Date().toISOString().slice(0, 10),
    formatScores,
    killedFormats: KILLED_FORMATS_OUT,
    destinationScores,
    recommendations,
  };

  // Ensure directory exists
  if (!existsSync(REELS_DATA_DIR)) {
    mkdirSync(REELS_DATA_DIR, { recursive: true });
  }

  writeFileSync(WEIGHTS_PATH, JSON.stringify(weights, null, 2), 'utf-8');
  log(`Performance weights written to ${WEIGHTS_PATH}`);

  return weights;
}

// ── CLI mode ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('performance-scorer')) {
  // Normalize: strip leading `--` so `--update`, `update`, `--weights`, `weights`
  // all hit the same case. Keeps backwards compat with the original positional
  // commands (`report`, `formats`, etc.) while also supporting the flag-style
  // invocation the daily-analytics workflow uses (`--update`).
  const rawCommand = process.argv[2] || 'report';
  const command = rawCommand.replace(/^--/, '');

  log(`CLI invoked with command: "${rawCommand}" (normalized: "${command}")`);

  (async () => {
    try {
      switch (command) {
        case 'report': {
          const report = await generateWeeklyReport();
          console.log(JSON.stringify(report, null, 2));
          break;
        }
        case 'formats': {
          const days = parseInt(process.argv[3] || '14', 10);
          const ranking = await rankFormats(days);
          console.log(JSON.stringify(ranking, null, 2));
          break;
        }
        case 'destinations': {
          const days = parseInt(process.argv[3] || '30', 10);
          const ranking = await rankDestinations(days);
          console.log(JSON.stringify(ranking, null, 2));
          break;
        }
        case 'weights':
        case 'update': {
          log('Updating performance weights...');
          const weights = await updatePerformanceWeights();
          console.log(JSON.stringify(weights, null, 2));
          break;
        }
        case 'score': {
          // Quick test: score a manual stats object
          const stats = { plays: 5000, reach: 3000, saved: 50, shares: 30, comments: 20, likes: 200 };
          console.log(`Test score: ${scoreReel(stats)}`);
          console.log(`Test ER: ${engagementRate(stats)}%`);
          break;
        }
        default:
          console.log(`Usage: node performance-scorer.js [report|formats|destinations|weights|update|score] [days]`);
          console.log(`Unknown command: "${rawCommand}"`);
      }
    } catch (err) {
      logError(err.message);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}
