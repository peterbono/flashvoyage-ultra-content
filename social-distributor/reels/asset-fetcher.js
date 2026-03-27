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

    // Pick the first video, find HD quality file
    for (const video of data.videos) {
      const files = video.video_files || [];
      // Prefer HD portrait-friendly files
      const hd = files.find(f => f.quality === 'hd' && f.width && f.height && f.height >= f.width)
        || files.find(f => f.quality === 'hd')
        || files.find(f => f.quality === 'sd' && f.width && f.height && f.height >= f.width)
        || files[0];

      if (hd && hd.link) {
        console.log(`[REEL/ASSET] Found Pexels video: ${video.id} (${hd.width}x${hd.height}, ${hd.quality})`);
        return hd.link;
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

// Mood-to-filename mapping for the local audio pool
const MOOD_MAP = {
  chill: ['chill', 'lofi', 'relax', 'ambient', 'soft'],
  upbeat: ['upbeat', 'happy', 'energy', 'fun', 'travel'],
  dramatic: ['dramatic', 'epic', 'cinematic', 'intense'],
  tropical: ['tropical', 'beach', 'summer', 'island'],
};

/**
 * Pick a royalty-free music track from the local audio pool.
 *
 * @param {string} mood - Desired mood: 'chill', 'upbeat', 'dramatic', 'tropical'
 * @returns {string|null} Path to audio file or null if none available
 */
export function pickMusicTrack(mood = 'chill') {
  if (!existsSync(AUDIO_DIR)) {
    console.warn(`[REEL/ASSET] Audio directory not found: ${AUDIO_DIR}`);
    return null;
  }

  const files = readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.m4a'));

  if (files.length === 0) {
    console.warn(`[REEL/ASSET] No audio files found in ${AUDIO_DIR}`);
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
