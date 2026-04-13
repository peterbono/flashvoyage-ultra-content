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
  asmr: 'asmr', // FV-FIX 2026-04-13: ASMR is now a first-class mood for informational
                // reels (best-time, cost-vs, budget-jour, etc.). Previously passed through
                // via fallback — made explicit for self-documentation + to signal it's
                // the preferred default for slow-paced formats.
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

// ── Destination → canonical slug aliases (FV-FIX 2026-04-13) ───────────────
// Used by ASMR mood to pick a geo-matched track when the composer knows which
// destination the article is about. Keys are lower-cased, accent-preserving,
// and accent-stripped variants of common FR/EN forms. Values are canonical
// slugs that key into DESTINATION_PREFIXES below.
const DESTINATION_ALIASES = {
  // Thailand → Bangkok track
  'thailande': 'bangkok', 'thaïlande': 'bangkok', 'thailand': 'bangkok',
  'bangkok': 'bangkok', 'phuket': 'bangkok', 'chiang mai': 'bangkok',
  'koh samui': 'bangkok', 'krabi': 'bangkok', 'pattaya': 'bangkok',
  // Indonesia / Bali
  'bali': 'bali', 'indonesie': 'bali', 'indonésie': 'bali', 'indonesia': 'bali',
  'ubud': 'bali', 'canggu': 'bali', 'seminyak': 'bali', 'jakarta': 'bali',
  // Vietnam (has both motorbikes + sapa tracks)
  'vietnam': 'vietnam', 'saigon': 'vietnam', 'hanoi': 'vietnam',
  'ho chi minh': 'vietnam', 'ho chi minh ville': 'vietnam',
  'da nang': 'vietnam', 'hoi an': 'vietnam', 'nha trang': 'vietnam',
  'sapa': 'sapa', // explicit Sapa → dedicated cascade track
  // Japan / Tokyo
  'japon': 'tokyo', 'japan': 'tokyo', 'tokyo': 'tokyo',
  'kyoto': 'tokyo', 'osaka': 'tokyo',
  // Cambodia → Angkor Wat
  'cambodge': 'angkor-wat', 'cambodia': 'angkor-wat',
  'angkor': 'angkor-wat', 'angkor wat': 'angkor-wat',
  'siem reap': 'angkor-wat', 'phnom penh': 'angkor-wat',
  // Philippines
  'philippines': 'philippines', 'manila': 'philippines', 'manille': 'philippines',
  'cebu': 'philippines', 'palawan': 'philippines', 'boracay': 'philippines',
  'el nido': 'philippines',
  // Laos
  'laos': 'laos', 'vientiane': 'laos', 'luang prabang': 'laos',
  // Korea → Seoul
  'coree': 'seoul', 'corée': 'seoul', 'coree du sud': 'seoul',
  'corée du sud': 'seoul', 'korea': 'seoul', 'south korea': 'seoul',
  'seoul': 'seoul', 'séoul': 'seoul', 'busan': 'seoul',
};

// canonical slug → list of filename prefixes to match (all start with `asmr-`)
const DESTINATION_PREFIXES = {
  'bangkok': ['asmr-bangkok-'],
  'bali': ['asmr-bali-'],
  'vietnam': ['asmr-vietnam-', 'asmr-sapa-'], // Sapa falls under Vietnam
  'tokyo': ['asmr-tokyo-', 'asmr-japan-'],    // either Japan track
  'angkor-wat': ['asmr-angkor-wat-'],
  'philippines': ['asmr-philippines-'],
  'laos': ['asmr-laos-'],
  'seoul': ['asmr-seoul-'],
  'sapa': ['asmr-sapa-'],
};

function normalizeDestination(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // Lowercase + strip surrounding punctuation/whitespace, normalize multiple
  // spaces. Keep accents — they're handled by the alias table.
  const cleaned = raw
    .toLowerCase()
    .replace(/[()\[\]{},.!?;:"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  // Try direct hit first
  if (DESTINATION_ALIASES[cleaned]) return DESTINATION_ALIASES[cleaned];

  // Try splitting on common connector words (e.g. "Bali (Indonésie)" → "bali indonésie")
  // and match any token / bigram against the alias table.
  const tokens = cleaned.split(' ');
  for (let n = Math.min(3, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n).join(' ');
      if (DESTINATION_ALIASES[gram]) return DESTINATION_ALIASES[gram];
    }
  }
  return null;
}

/**
 * Pick a royalty-free music track with dedup.
 * Avoids repeating the same track within the last 8 picks.
 * First checks music/{genre}/ directory, then falls back to audio/.
 *
 * When `opts.destination` is provided AND mood === 'asmr', prefer a geo-matched
 * track (e.g. 'Bali' → asmr-bali-rice-fields.mp3). Falls back to the full ASMR
 * pool if no match or if the geo-filtered pool is empty.
 *
 * @param {string} mood - Desired mood: 'chill', 'upbeat', 'tropical', 'cinematic', 'lofi', 'asmr'
 * @param {Object} [opts]
 * @param {string} [opts.destination] - Optional article destination (FR or EN, any form)
 * @returns {string|null} Path to audio file or null if none available
 */
export function pickMusicTrack(mood = 'chill', opts = {}) {
  const { destination = null } = opts || {};

  // ── Try music/{genre}/ first ──
  const genre = MOOD_TO_GENRE[mood] || mood; // 'asmr' passes through as-is
  const genreDir = join(MUSIC_DIR, genre);

  if (existsSync(genreDir)) {
    const genreFiles = readdirSync(genreDir).filter(f => f.endsWith('.mp3'));
    if (genreFiles.length > 0) {
      // Destination-aware filtering (ASMR only) ─────────────────────────────
      let pool = genreFiles;
      let geoInfo = '';
      if (mood === 'asmr' && destination) {
        const slug = normalizeDestination(destination);
        if (slug && DESTINATION_PREFIXES[slug]) {
          const prefixes = DESTINATION_PREFIXES[slug];
          const matched = genreFiles.filter(f => prefixes.some(p => f.startsWith(p)));
          if (matched.length > 0) {
            pool = matched;
            geoInfo = ` dest='${destination}' → slug=${slug} → ${matched.length} matched`;
          } else {
            geoInfo = ` dest='${destination}' → slug=${slug} → 0 matched (fallback to full pool)`;
          }
        } else if (slug) {
          geoInfo = ` dest='${destination}' → slug=${slug} (no prefix map, fallback)`;
        } else {
          console.warn(`[REEL/ASSET] Unknown destination "${destination}" for ASMR — consider adding alias`);
          geoInfo = ` dest='${destination}' → unknown slug (fallback to full pool)`;
        }
      }

      // Filter out recently used tracks (from the resolved pool)
      const available = pool.filter(f => !_recentlyUsed.includes(f));
      // If all have been used recently, reset and use all
      const finalPool = available.length > 0 ? available : pool;
      const pick = finalPool[Math.floor(Math.random() * finalPool.length)];

      // Track usage
      _recentlyUsed.push(pick);
      if (_recentlyUsed.length > MAX_RECENT) _recentlyUsed.shift();

      console.log(`[REEL/ASSET] Picked music (${mood}→${genre})${geoInfo}: ${pick} [${_recentlyUsed.length} in history]`);
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
