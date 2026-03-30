/**
 * Asset Fetcher — FlashVoyage Reels Module
 *
 * Fetches stock video from Pexels and picks royalty-free music
 * from the local audio pool.
 */

import { existsSync, readdirSync, createWriteStream, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, 'audio');

// Pexels API key from env (optional — works without for low usage)
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';

// ── Pexels Video Search ──────────────────────────────────────────────────────

/**
 * Fetch a stock video URL from Pexels.
 *
 * @param {string} query - Search query (in English)
 * @param {string} orientation - 'portrait' (default) or 'landscape'
 * @returns {Promise<string|null>} Video file URL (HD) or null
 */
export async function fetchPexelsVideo(query, orientation = 'portrait') {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&size=medium&per_page=5`;

  const headers = {};
  if (PEXELS_KEY) {
    headers['Authorization'] = PEXELS_KEY;
  }

  console.log(`[REEL/ASSET] Searching Pexels videos: "${query}" (${orientation})`);

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Pexels API ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.videos || data.videos.length === 0) {
      console.warn(`[REEL/ASSET] No Pexels videos found for "${query}"`);
      return null;
    }

    // Pick the best video — minimum 720p height, prefer portrait HD
    for (const video of data.videos) {
      const files = video.video_files || [];
      // Filter: min 720p and prefer portrait (height >= width)
      const hdPortrait = files.find(f => f.quality === 'hd' && f.height >= 720 && f.height >= f.width);
      const hdAny = files.find(f => f.quality === 'hd' && f.height >= 720);
      const sdPortrait = files.find(f => f.height >= 720 && f.height >= f.width);
      const hd = hdPortrait || hdAny || sdPortrait;

      if (hd && hd.link) {
        console.log(`[REEL/ASSET] Found Pexels video: ${video.id} (${hd.width}x${hd.height}, ${hd.quality})`);
        return hd.link;
      }
    }

    // Second pass: accept lower res if nothing >= 720p found
    for (const video of data.videos) {
      const files = video.video_files || [];
      const best = files.find(f => f.quality === 'hd') || files.find(f => f.height >= f.width) || files[0];
      if (best && best.link) {
        console.warn(`[REEL/ASSET] Low-res fallback: ${video.id} (${best.width}x${best.height})`);
        return best.link;
      }
    }

    console.warn(`[REEL/ASSET] No suitable video files found in Pexels results`);
    return null;
  } catch (err) {
    console.error(`[REEL/ASSET] Pexels fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Download a video from URL to a local file.
 *
 * @param {string} videoUrl - Remote video URL
 * @param {string} outputPath - Local file path
 * @returns {Promise<string>} The output path
 */
export function downloadVideo(videoUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const file = createWriteStream(outputPath);

    const doRequest = (url) => {
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, (res) => {
        // Follow redirects
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
          console.log(`[REEL/ASSET] Downloaded video to: ${outputPath}`);
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

// ── Music Pool ───────────────────────────────────────────────────────────────

const MUSIC_DIR = join(__dirname, 'music');

// Mood → music/ subdirectory mapping
const MOOD_TO_GENRE = {
  chill: 'chill',
  ambient: 'chill',
  tropical: 'upbeat',
  upbeat: 'upbeat',
  cinematic: 'cinematic',
  dramatic: 'cinematic',
  lofi: 'lofi',
};

// Legacy mood-to-filename keywords for audio/ dir fallback
const MOOD_MAP = {
  chill: ['chill', 'lofi', 'relax', 'ambient', 'soft'],
  upbeat: ['upbeat', 'happy', 'energy', 'fun', 'travel'],
  dramatic: ['dramatic', 'epic', 'cinematic', 'intense'],
  tropical: ['tropical', 'beach', 'summer', 'island'],
};

// Track recently used music to avoid repeats
const _recentlyUsed = [];
const MAX_RECENT = 8; // Don't repeat within last 8 picks

/**
 * Pick a royalty-free music track with dedup.
 * Avoids repeating the same track within the last 8 picks.
 * First checks music/{genre}/ directory, then falls back to audio/.
 *
 * @param {string} mood - Desired mood: 'chill', 'upbeat', 'tropical', 'cinematic', 'lofi', 'asmr'
 * @returns {string|null} Path to audio file or null if none available
 */
export function pickMusicTrack(mood = 'chill') {
  // ── Try music/{genre}/ first ──
  const genre = MOOD_TO_GENRE[mood] || mood; // 'asmr' passes through as-is
  const genreDir = join(MUSIC_DIR, genre);

  if (existsSync(genreDir)) {
    const genreFiles = readdirSync(genreDir).filter(f => f.endsWith('.mp3'));
    if (genreFiles.length > 0) {
      // Filter out recently used tracks
      const available = genreFiles.filter(f => !_recentlyUsed.includes(f));
      // If all have been used recently, reset and use all
      const pool = available.length > 0 ? available : genreFiles;
      const pick = pool[Math.floor(Math.random() * pool.length)];

      // Track usage
      _recentlyUsed.push(pick);
      if (_recentlyUsed.length > MAX_RECENT) _recentlyUsed.shift();

      console.log(`[REEL/ASSET] Picked music (${mood}→${genre}): ${pick} [${_recentlyUsed.length} in history]`);
      return join(genreDir, pick);
    }
  }

  // ── Fallback to audio/ dir (legacy 3 tracks) ──
  if (!existsSync(AUDIO_DIR)) {
    console.warn(`[REEL/ASSET] No audio directories found`);
    return null;
  }

  const files = readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.m4a'));

  if (files.length === 0) {
    console.warn(`[REEL/ASSET] No audio files found`);
    return null;
  }

  // Try to match mood keywords in filename
  const keywords = MOOD_MAP[mood] || MOOD_MAP.chill;
  const matched = files.filter(f => keywords.some(k => f.toLowerCase().includes(k)));

  if (matched.length > 0) {
    const pick = matched[Math.floor(Math.random() * matched.length)];
    console.log(`[REEL/ASSET] Picked music (${mood}): ${pick}`);
    return join(AUDIO_DIR, pick);
  }

  // Fallback: random track
  const pick = files[Math.floor(Math.random() * files.length)];
  console.log(`[REEL/ASSET] Picked music (random fallback): ${pick}`);
  return join(AUDIO_DIR, pick);
}

// ── Fallback: Generate silent audio ──────────────────────────────────────────

/**
 * Generate a silent audio track using ffmpeg (fallback when no music available).
 *
 * @param {number} duration - Duration in seconds
 * @param {string} outputPath - Output file path
 * @returns {Promise<string>} Output path
 */
export async function generateSilentAudio(duration, outputPath) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  await execFileAsync('ffmpeg', [
    '-f', 'lavfi',
    '-i', `anullsrc=r=44100:cl=stereo`,
    '-t', String(duration),
    '-c:a', 'aac',
    '-b:a', '128k',
    '-y',
    outputPath,
  ]);

  console.log(`[REEL/ASSET] Generated silent audio: ${outputPath} (${duration}s)`);
  return outputPath;
}
