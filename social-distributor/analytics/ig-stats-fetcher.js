/**
 * Instagram Stats Fetcher — FlashVoyage Analytics
 *
 * Fetches performance metrics for published reels/posts via IG Graph API.
 * Called 24h and 48h after each publish to collect engagement stats.
 *
 * Endpoints:
 *   GET /{media_id}/insights?metric=ig_reels_aggregated_all_plays_count,reach,saved,shares,comments,likes
 *   GET /{media_id}?fields=timestamp,caption,media_type,like_count,comments_count
 *
 * Requires: Facebook Page Token (also used for IG API)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getToken } from '../token-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const IG_ID = '17841442283434789';
const GRAPH_API = 'https://graph.facebook.com/v21.0';

// reel-history.jsonl lives in social-distributor/data/
const REEL_HISTORY_PATH = join(__dirname, '..', 'data', 'reel-history.jsonl');

function log(msg) {
  console.log(`[ANALYTICS/IG] ${msg}`);
}

function logError(msg) {
  console.error(`[ANALYTICS/IG] ERROR: ${msg}`);
}

/**
 * Fetch basic media fields (like_count, comments_count, timestamp, caption).
 * Works for all media types.
 *
 * @param {string} mediaId - IG media ID
 * @param {string} token   - Page access token
 * @returns {Promise<{ likeCount: number, commentsCount: number, timestamp: string, caption: string, mediaType: string }>}
 */
async function fetchMediaFields(mediaId, token) {
  const url = `${GRAPH_API}/${mediaId}?fields=like_count,comments_count,timestamp,caption,media_type&access_token=${token}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`IG media fields error: ${data.error.message} (code ${data.error.code})`);
  }

  return {
    likeCount: data.like_count ?? 0,
    commentsCount: data.comments_count ?? 0,
    timestamp: data.timestamp ?? null,
    caption: data.caption ?? '',
    mediaType: data.media_type ?? 'UNKNOWN',
  };
}

/**
 * Fetch insights (plays, reach, saved, shares) for a single reel.
 * Uses the IG Insights API which requires the media to be > ~1 hour old.
 *
 * @param {string} mediaId  - IG media ID
 * @param {string} token    - Page access token
 * @returns {Promise<{ plays: number, reach: number, saved: number, shares: number }>}
 */
async function fetchInsightsMetrics(mediaId, token) {
  // For REELS: use ig_reels_aggregated_all_plays_count instead of impressions
  const metrics = [
    'ig_reels_aggregated_all_plays_count',
    'reach',
    'saved',
    'shares',
  ].join(',');

  const url = `${GRAPH_API}/${mediaId}/insights?metric=${metrics}&access_token=${token}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    // Common: insights not yet available for very recent posts
    if (data.error.code === 100 || data.error.error_subcode === 2108006) {
      log(`Insights not yet available for ${mediaId} (too recent?)`);
      return { plays: 0, reach: 0, saved: 0, shares: 0 };
    }
    throw new Error(`IG insights error for ${mediaId}: ${data.error.message} (code ${data.error.code})`);
  }

  const result = { plays: 0, reach: 0, saved: 0, shares: 0 };

  for (const item of data.data ?? []) {
    const value = item.values?.[0]?.value ?? 0;
    switch (item.name) {
      case 'ig_reels_aggregated_all_plays_count':
        result.plays = value;
        break;
      case 'reach':
        result.reach = value;
        break;
      case 'saved':
        result.saved = value;
        break;
      case 'shares':
        result.shares = value;
        break;
    }
  }

  return result;
}

/**
 * Fetch combined insights + basic fields for a single reel/post.
 *
 * @param {string} mediaId   - IG media ID
 * @param {string} [pageToken] - Override page token (optional)
 * @returns {Promise<{ plays: number, reach: number, saved: number, shares: number, comments: number, likes: number, timestamp: string, caption: string, mediaType: string }>}
 */
export async function fetchReelInsights(mediaId, pageToken) {
  const token = pageToken || getToken('instagram');
  if (!token) {
    throw new Error('No IG page token available. Check data/tokens.json');
  }

  log(`Fetching insights for media ${mediaId}`);

  // Fetch basic fields and insights in parallel
  const [fields, insights] = await Promise.all([
    fetchMediaFields(mediaId, token),
    fetchInsightsMetrics(mediaId, token).catch(err => {
      logError(`Insights fetch failed for ${mediaId}: ${err.message}`);
      return { plays: 0, reach: 0, saved: 0, shares: 0 };
    }),
  ]);

  return {
    plays: insights.plays,
    reach: insights.reach,
    saved: insights.saved,
    shares: insights.shares,
    comments: fields.commentsCount,
    likes: fields.likeCount,
    timestamp: fields.timestamp,
    caption: fields.caption,
    mediaType: fields.mediaType,
  };
}

/**
 * Parse reel-history.jsonl file.
 * Each line is JSON: { date, reelId, postId, type }
 *
 * @returns {Array<{ date: string, reelId: string, postId: string|number, type: string }>}
 */
function readReelHistory() {
  if (!existsSync(REEL_HISTORY_PATH)) {
    log(`No reel history found at ${REEL_HISTORY_PATH}`);
    return [];
  }

  const lines = readFileSync(REEL_HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
  const entries = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      logError(`Skipping malformed reel-history line: ${line.slice(0, 80)}`);
    }
  }

  return entries;
}

/**
 * Fetch insights for ALL reels published in the last N days.
 * Reads reel-history.jsonl, filters by date, fetches stats for each.
 *
 * @param {number} days - How many days back to look (default 7)
 * @param {string} [pageToken] - Override page token (optional)
 * @returns {Promise<Array<{ reelId: string, postId: string|number, format: string, date: string, stats: object }>>}
 */
export async function fetchRecentReelStats(days = 7, pageToken) {
  const token = pageToken || getToken('instagram');
  if (!token) {
    throw new Error('No IG page token available. Check data/tokens.json');
  }

  const history = readReelHistory();
  if (history.length === 0) {
    log('No reel history entries found');
    return [];
  }

  // Filter to entries within the last N days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString();

  const recent = history.filter(entry => {
    return entry.date && entry.date >= cutoffISO;
  });

  log(`Found ${recent.length} reels in the last ${days} days (of ${history.length} total)`);

  if (recent.length === 0) return [];

  // Fetch insights for each, with a small delay to respect rate limits
  // IG Graph API rate limit: ~200 calls per hour per token
  const results = [];

  for (const entry of recent) {
    if (!entry.reelId) {
      logError(`Skipping entry without reelId: ${JSON.stringify(entry)}`);
      continue;
    }

    try {
      const stats = await fetchReelInsights(entry.reelId, token);
      results.push({
        reelId: entry.reelId,
        postId: entry.postId ?? null,
        format: entry.type ?? 'unknown',
        date: entry.date,
        stats,
      });
    } catch (err) {
      logError(`Failed to fetch insights for reel ${entry.reelId}: ${err.message}`);
      results.push({
        reelId: entry.reelId,
        postId: entry.postId ?? null,
        format: entry.type ?? 'unknown',
        date: entry.date,
        stats: null,
        error: err.message,
      });
    }

    // Small delay between API calls (300ms) to stay well under rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  log(`Fetched stats for ${results.filter(r => r.stats).length}/${results.length} reels`);
  return results;
}

/**
 * Fetch the latest media IDs from the IG account (alternative to reel-history).
 * Useful for backfilling stats when reel-history.jsonl is empty.
 *
 * @param {number} limit - Max media to fetch (default 25, max 100)
 * @param {string} [pageToken] - Override page token (optional)
 * @returns {Promise<Array<{ id: string, timestamp: string, mediaType: string, caption: string }>>}
 */
export async function fetchRecentMedia(limit = 25, pageToken) {
  const token = pageToken || getToken('instagram');
  if (!token) {
    throw new Error('No IG page token available. Check data/tokens.json');
  }

  const url = `${GRAPH_API}/${IG_ID}/media?fields=id,timestamp,media_type,caption&limit=${Math.min(limit, 100)}&access_token=${token}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`IG media list error: ${data.error.message} (code ${data.error.code})`);
  }

  const media = (data.data ?? []).map(m => ({
    id: m.id,
    timestamp: m.timestamp,
    mediaType: m.media_type,
    caption: m.caption ?? '',
  }));

  log(`Fetched ${media.length} recent media items from IG`);
  return media;
}

// ── CLI mode ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('ig-stats-fetcher')) {
  const days = parseInt(process.argv[2] || '7', 10);

  log(`Fetching IG reel stats for the last ${days} days...`);

  fetchRecentReelStats(days)
    .then(results => {
      console.log(JSON.stringify(results, null, 2));
      log(`Done. ${results.length} reels processed.`);
    })
    .catch(err => {
      logError(err.message);
      process.exit(1);
    });
}
