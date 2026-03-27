/**
 * Listicle Asset Fetcher — FlashVoyage Reels
 *
 * Fetches N Pexels video clips (1 per scene) for listicle Reels.
 * - Portrait orientation preferred
 * - Skips first 2 results (most downloaded = least original)
 * - Picks from index 2-5 randomly
 * - Tracks used video IDs to avoid reuse
 * - Handles short clips with looping
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const USED_IDS_PATH = join(DATA_DIR, 'pexels-used.json');

const PEXELS_KEY = process.env.PEXELS_API_KEY || '';

// ── Used video tracking ──────────────────────────────────────────────────────

function loadUsedIds() {
  try {
    if (existsSync(USED_IDS_PATH)) {
      return JSON.parse(readFileSync(USED_IDS_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

function saveUsedIds(ids) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  // Keep only last 500 to avoid file bloat
  const trimmed = ids.slice(-500);
  writeFileSync(USED_IDS_PATH, JSON.stringify(trimmed, null, 2));
}

function markAsUsed(videoId) {
  const ids = loadUsedIds();
  if (!ids.includes(videoId)) {
    ids.push(videoId);
    saveUsedIds(ids);
  }
}

// ── Pexels video search (single query) ───────────────────────────────────────

async function searchPexelsVideos(query, options = {}) {
  const {
    orientation = 'portrait',
    perPage = 8,
    minDuration = 3,
  } = options;

  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&size=medium&per_page=${perPage}`;

  const headers = {};
  if (PEXELS_KEY) {
    headers['Authorization'] = PEXELS_KEY;
  }

  console.log(`[REEL/LISTICLE-ASSET] Searching Pexels: "${query}" (${orientation})`);

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Pexels API ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.videos || data.videos.length === 0) {
      console.warn(`[REEL/LISTICLE-ASSET] No videos found for "${query}"`);
      return [];
    }

    return data.videos;
  } catch (err) {
    console.error(`[REEL/LISTICLE-ASSET] Pexels search failed for "${query}": ${err.message}`);
    return [];
  }
}

/**
 * Pick a video from search results, skipping the first 2 (most popular = least original).
 * Picks randomly from index 2-5. Avoids reused IDs.
 */
function pickOriginalVideo(videos, usedIds) {
  // Skip first 2 results
  const candidates = videos.slice(2, 6);

  // Filter out already used
  const fresh = candidates.filter(v => !usedIds.includes(v.id));

  // If no fresh candidates in 2-5, try the rest
  const fallbackCandidates = fresh.length > 0
    ? fresh
    : videos.filter(v => !usedIds.includes(v.id));

  if (fallbackCandidates.length === 0) {
    // All used, just pick anything from position 2+
    const anyCandidate = videos.slice(2);
    if (anyCandidate.length > 0) {
      return anyCandidate[Math.floor(Math.random() * anyCandidate.length)];
    }
    return videos[0] || null;
  }

  // Random pick from fresh candidates
  return fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
}

/**
 * Get the best video file URL from a Pexels video object.
 * Prefers HD portrait-friendly files.
 */
function getBestVideoFile(video) {
  const files = video.video_files || [];
  // Prefer HD portrait-friendly
  const hd = files.find(f => f.quality === 'hd' && f.width && f.height && f.height >= f.width)
    || files.find(f => f.quality === 'hd')
    || files.find(f => f.quality === 'sd' && f.width && f.height && f.height >= f.width)
    || files[0];

  return hd ? { url: hd.link, width: hd.width, height: hd.height, quality: hd.quality } : null;
}

// ── Download helper ──────────────────────────────────────────────────────────

function downloadVideo(videoUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const file = createWriteStream(outputPath);

    const doRequest = (url) => {
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doRequest(res.headers.location);
        }
        if (res.statusCode >= 400) {
          file.close();
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(outputPath);
        });
      }).on('error', (err) => {
        file.close();
        reject(err);
      });
    };

    doRequest(videoUrl);
  });
}

// ── Main batch fetch ─────────────────────────────────────────────────────────

/**
 * Fetch N Pexels video clips (1 per scene) for a listicle Reel.
 *
 * @param {string[]} queries - Array of search queries (1 per scene)
 * @param {Object} options
 * @param {string} options.outputDir - Where to save downloaded clips
 * @param {number[]} options.durations - Required duration per clip (seconds)
 * @returns {Promise<Array<{ path: string, videoId: number, duration: number, needsLoop: boolean }>>}
 */
export async function fetchPexelsVideoBatch(queries, options = {}) {
  const {
    outputDir = join(__dirname, 'tmp'),
    durations = [],
  } = options;

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const usedIds = loadUsedIds();
  const results = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const neededDuration = durations[i] || 4;

    console.log(`[REEL/LISTICLE-ASSET] Fetching clip ${i + 1}/${queries.length}: "${query}" (need ${neededDuration}s)`);

    let videos = await searchPexelsVideos(query, { orientation: 'portrait', perPage: 8 });

    // Fallback to generic travel query if no results
    if (videos.length === 0) {
      console.warn(`[REEL/LISTICLE-ASSET] No results for "${query}", trying fallback...`);
      videos = await searchPexelsVideos('travel destination landscape', { orientation: 'portrait', perPage: 8 });
    }

    if (videos.length === 0) {
      console.error(`[REEL/LISTICLE-ASSET] No videos available for clip ${i + 1}, trying "ocean beach"...`);
      videos = await searchPexelsVideos('ocean beach', { orientation: 'portrait', perPage: 8 });
    }

    if (videos.length === 0) {
      console.error(`[REEL/LISTICLE-ASSET] Complete failure for clip ${i + 1}`);
      results.push(null);
      continue;
    }

    // Pick original video (skip first 2)
    const picked = pickOriginalVideo(videos, usedIds);
    if (!picked) {
      results.push(null);
      continue;
    }

    const fileInfo = getBestVideoFile(picked);
    if (!fileInfo || !fileInfo.url) {
      results.push(null);
      continue;
    }

    // Download
    const outputPath = join(outputDir, `listicle-clip-${i}-${Date.now()}.mp4`);
    try {
      await downloadVideo(fileInfo.url, outputPath);
      markAsUsed(picked.id);
      usedIds.push(picked.id);

      const clipDuration = picked.duration || 10;
      const needsLoop = clipDuration < neededDuration;

      console.log(`[REEL/LISTICLE-ASSET] Clip ${i + 1}: video ${picked.id} (${fileInfo.width}x${fileInfo.height}, ${clipDuration}s, ${needsLoop ? 'will loop' : 'ok'})`);

      results.push({
        path: outputPath,
        videoId: picked.id,
        duration: clipDuration,
        neededDuration,
        needsLoop,
        width: fileInfo.width,
        height: fileInfo.height,
      });
    } catch (err) {
      console.error(`[REEL/LISTICLE-ASSET] Download failed for clip ${i + 1}: ${err.message}`);
      results.push(null);
    }

    // Small delay between API calls to avoid rate limiting
    if (i < queries.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const successCount = results.filter(Boolean).length;
  console.log(`[REEL/LISTICLE-ASSET] Batch complete: ${successCount}/${queries.length} clips fetched`);

  return results;
}
