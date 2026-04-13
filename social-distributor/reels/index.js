#!/usr/bin/env node

/**
 * FlashVoyage Reels — Orchestrator + CLI
 *
 * CLI modes:
 *   --test              Generate 1 reel from article, save to /tmp, don't publish
 *   --recycle <postId>  Generate + publish reel from existing article
 *   --batch <count>     Generate + publish N reels from random articles
 *   --news              Generate reels from today's RSS news
 *
 * Programmatic API:
 *   import { generateReel } from './social-distributor/reels/index.js';
 *   const result = await generateReel(articleData, { publish: false });
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { generateReelScript, detectReelType } from './script-generator.js';
import { fetchPexelsVideo, downloadVideo, pickMusicTrack } from './asset-fetcher.js';
import { composeReel } from './ffmpeg-composer.js';
import { publishReel } from './publisher.js';

// Listicle imports
import { generateListicleScript } from './listicle-script-generator.js';
import { fetchPexelsVideoBatch } from './listicle-asset-fetcher.js';
import { composeListicleReel } from './listicle-composer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PARENT_DIR = join(__dirname, '..');
const TMP_DIR = join(__dirname, 'tmp');
const TEST_OUTPUT = '/tmp/test-flashvoyage-reel.mp4';
const LISTICLE_TEST_OUTPUT = '/tmp/test-listicle-reel.mp4';

// Rate limit: max reels per day
const MAX_REELS_PER_DAY = 5;
const REEL_LOG_PATH = join(__dirname, '..', 'data', 'reel-history.jsonl');

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [REEL] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[${ts}] [REEL] ERROR: ${msg}`);
}

// ── Music pragma sidecar ─────────────────────────────────────────────────────
// Records the last-picked music path so the Telegram publisher can surface
// the filename in its preview caption (founder-visible repetition signal).
// Telegram-only — never flows to IG/TikTok captions. Consumed by
// publisher.js::resolveMusicFilename() via the `meta` object or this file.
function writeLastReelMusicPragma(musicPath) {
  if (!musicPath) return;
  try {
    writeFileSync(
      '/tmp/last-reel-music.json',
      JSON.stringify({ musicPath, pickedAt: Date.now() }),
    );
  } catch {
    // Non-fatal: the publisher also receives musicPath via meta.
  }
}

// ── Rate limiting ────────────────────────────────────────────────────────────

function getReelsPublishedToday() {
  if (!existsSync(REEL_LOG_PATH)) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const lines = readFileSync(REEL_LOG_PATH, 'utf-8').split('\n').filter(Boolean);
  return lines.filter(l => {
    try {
      const entry = JSON.parse(l);
      return entry.date?.startsWith(today);
    } catch { return false; }
  }).length;
}

function logReelPublished(reelId, postId, type) {
  const entry = {
    date: new Date().toISOString(),
    reelId,
    postId,
    type,
  };
  const dir = dirname(REEL_LOG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(REEL_LOG_PATH, JSON.stringify(entry) + '\n');
}

// ── Core: Generate a single reel ─────────────────────────────────────────────

/**
 * Generate a reel from article data.
 *
 * @param {Object} article - Extracted article data { title, hook, keyStats, category, imageUrl, ... }
 * @param {Object} options
 * @param {boolean} options.publish - Whether to publish to IG (default: false)
 * @param {string} options.outputPath - Where to save the video (default: tmp)
 * @returns {Promise<{ videoPath: string, script: Object, reelId?: string, permalink?: string }>}
 */
export async function generateReel(article, options = {}) {
  const { publish = false, outputPath, forceType } = options;
  const finalOutput = outputPath || join(TMP_DIR, `reel-${Date.now()}.mp4`);

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  // Detect reel type (or use forced type)
  const detectedType = forceType || detectReelType(article);
  log(`Detected reel type: ${detectedType}`);

  // ── LISTICLE BRANCH ─────────────────────────────────────────────────────
  if (detectedType === 'listicle') {
    return generateListicleReelFlow(article, { publish, outputPath: finalOutput });
  }

  // ── STANDARD BRANCH ─────────────────────────────────────────────────────
  // Step 1: Generate script with Haiku
  log(`Step 1/4: Generating script...`);
  const script = await generateReelScript(article);
  log(`Script: ${script.scenes.length} scenes, type=${script.type}`);

  // Step 2: Fetch stock video from Pexels
  log(`Step 2/4: Fetching stock video (query: "${script.videoQuery}")...`);
  let videoPath = null;

  const videoUrl = await fetchPexelsVideo(script.videoQuery, 'portrait');
  if (videoUrl) {
    const dlPath = join(TMP_DIR, `stock-${Date.now()}.mp4`);
    videoPath = await downloadVideo(videoUrl, dlPath);
    log(`Stock video downloaded: ${videoPath}`);
  }

  // Fallback: try generic travel query
  if (!videoPath) {
    log(`Trying fallback video query: "travel aerial landscape"...`);
    const fallbackUrl = await fetchPexelsVideo('travel aerial landscape', 'portrait');
    if (fallbackUrl) {
      const dlPath = join(TMP_DIR, `stock-fallback-${Date.now()}.mp4`);
      videoPath = await downloadVideo(fallbackUrl, dlPath);
    }
  }

  // Last resort: try "ocean beach"
  if (!videoPath) {
    log(`Trying last resort video query: "ocean beach"...`);
    const lastUrl = await fetchPexelsVideo('ocean beach', 'portrait');
    if (lastUrl) {
      const dlPath = join(TMP_DIR, `stock-last-${Date.now()}.mp4`);
      videoPath = await downloadVideo(lastUrl, dlPath);
    }
  }

  if (!videoPath) {
    throw new Error('Could not fetch any stock video from Pexels');
  }

  // Step 3: Pick background music
  // FV-FIX 2026-04-13: ASMR-first for default pipeline. Slow-paced informational
  // reels (most of FlashVoyage's output) benefit more from immersive ambient
  // sound than generic upbeat tracks. Fallback: asmr → chill.
  log(`Step 3/4: Picking music...`);
  const audioPath = pickMusicTrack('asmr') || pickMusicTrack('chill');
  if (audioPath) {
    log(`Music: ${audioPath}`);
    writeLastReelMusicPragma(audioPath);
  } else {
    log(`No music available, will use silent audio`);
  }

  // Step 4: Compose the reel with ffmpeg
  log(`Step 4/4: Composing video...`);
  await composeReel({
    videoPath,
    scenes: script.scenes,
    audioPath,
    outputPath: finalOutput,
  });

  log(`Reel composed: ${finalOutput}`);

  // Optionally publish
  let reelId = null;
  let permalink = null;

  if (publish) {
    const reelsToday = getReelsPublishedToday();
    if (reelsToday >= MAX_REELS_PER_DAY) {
      log(`Rate limit reached (${reelsToday}/${MAX_REELS_PER_DAY} reels today). Skipping publish.`);
    } else {
      log(`Publishing reel to Instagram...`);
      const videoBuffer = readFileSync(finalOutput);
      const result = await publishReel(
        videoBuffer,
        script.hook || article.title,
        script.hashtags || ['#FlashVoyage'],
        undefined,
        // musicPath is Telegram-only — publisher appends `🎵 <basename>`
        // to the TG preview caption, never to IG/TikTok.
        { musicPath: audioPath || null },
      );
      reelId = result.reelId;
      permalink = result.permalink;
      logReelPublished(reelId, article.postId, script.type);
      log(`Published! reelId=${reelId}, permalink=${permalink}`);
    }
  }

  return { videoPath: finalOutput, script, reelId, permalink };
}

// ── Listicle Reel Flow ───────────────────────────────────────────────────────

/**
 * Full listicle reel generation flow:
 * script -> validate hooks -> fetch video batch -> compose -> (publish)
 */
async function generateListicleReelFlow(article, options = {}) {
  const { publish = false, outputPath } = options;
  const finalOutput = outputPath || join(TMP_DIR, `listicle-reel-${Date.now()}.mp4`);

  // Step 1: Generate listicle script (includes hook validation)
  log(`Step 1/4: Generating listicle script...`);
  const script = await generateListicleScript(article);
  log(`Listicle script: series="${script.series}", ${script.items.length} items, mood="${script.mood}"`);
  log(`Hook: "${script.hook.text}"`);
  script.items.forEach(item => log(`  #${item.number}: "${item.text}" — ${item.subtitle || '(no subtitle)'}`));
  log(`CTA: "${script.cta.text}"`);

  // Step 2: Fetch video clips (1 per scene: hook + items)
  log(`Step 2/4: Fetching ${script.items.length + 1} video clips from Pexels...`);
  const queries = [
    script.hook.searchQuery || 'travel aerial landscape',
    ...script.items.map(item => item.searchQuery || 'travel destination'),
  ];
  const durations = [
    script.hook.duration || 2.5,
    ...script.items.map(item => item.duration || 4),
  ];

  const clips = await fetchPexelsVideoBatch(queries, {
    outputDir: TMP_DIR,
    durations,
  });

  const validClips = clips.filter(Boolean);
  if (validClips.length === 0) {
    throw new Error('Could not fetch any video clips from Pexels for listicle');
  }

  log(`Fetched ${validClips.length}/${queries.length} video clips`);

  // Step 3: Pick background music
  log(`Step 3/4: Picking music (mood: ${script.mood})...`);
  const audioPath = pickMusicTrack(script.mood || 'upbeat');
  if (audioPath) {
    log(`Music: ${audioPath}`);
    writeLastReelMusicPragma(audioPath);
  } else {
    log(`No music available, will use silent audio`);
  }

  // Step 4: Compose the listicle reel
  log(`Step 4/4: Composing listicle reel...`);
  await composeListicleReel(script, clips, audioPath, { outputPath: finalOutput });

  log(`Listicle reel composed: ${finalOutput}`);

  // Optionally publish
  let reelId = null;
  let permalink = null;

  if (publish) {
    const reelsToday = getReelsPublishedToday();
    if (reelsToday >= MAX_REELS_PER_DAY) {
      log(`Rate limit reached (${reelsToday}/${MAX_REELS_PER_DAY} reels today). Skipping publish.`);
    } else {
      log(`Publishing listicle reel to Instagram...`);
      const videoBuffer = readFileSync(finalOutput);
      const result = await publishReel(
        videoBuffer,
        script.caption || script.hook.text || article.title,
        script.hashtags || ['#FlashVoyage'],
        undefined,
        // musicPath is Telegram-only — publisher appends `🎵 <basename>`
        // to the TG preview caption, never to IG/TikTok.
        { musicPath: audioPath || null },
      );
      reelId = result.reelId;
      permalink = result.permalink;
      logReelPublished(reelId, article.postId, 'listicle');
      log(`Published! reelId=${reelId}, permalink=${permalink}`);
    }
  }

  return { videoPath: finalOutput, script, reelId, permalink };
}

// ── CLI Modes ────────────────────────────────────────────────────────────────

async function modeTest(forceType = null, forcePostId = null) {
  log('--- TEST MODE: generating 1 test reel ---');
  if (forceType) log(`Forced type: ${forceType}`);

  // Import extractor from parent
  const { fetchAllPosts, extractFromId } = await import(join(PARENT_DIR, 'extractor.js'));

  let postId;
  if (forcePostId) {
    postId = parseInt(forcePostId, 10);
    log(`Using forced article #${postId}`);
  } else {
    // Grab first article
    const posts = await fetchAllPosts();
    if (posts.length === 0) {
      throw new Error('No articles found in WordPress');
    }
    postId = posts[0].id;
    log(`Using article #${postId}: ${(posts[0].title?.rendered || '').slice(0, 60)}`);
  }

  const article = await extractFromId(postId);

  // Choose output path based on type
  const isListicle = forceType === 'listicle' || (!forceType && detectReelType(article) === 'listicle');
  const output = isListicle ? LISTICLE_TEST_OUTPUT : TEST_OUTPUT;

  const result = await generateReel(article, {
    publish: false,
    outputPath: output,
    forceType,
  });

  log(`Test reel saved to: ${result.videoPath}`);
  log(`Script type: ${result.script.type || result.script.series || 'unknown'}`);

  // Log scenes/items depending on type
  if (result.script.items) {
    // Listicle format
    log(`Hook: "${result.script.hook.text}"`);
    log(`Items: ${result.script.items.map(item => `#${item.number} "${item.text.slice(0, 30)}..." (${item.duration}s)`).join(' → ')}`);
    log(`CTA: "${result.script.cta.text}"`);
  } else if (result.script.scenes) {
    // Standard format
    log(`Scenes: ${result.script.scenes.map(s => `"${s.text.slice(0, 30)}..." (${s.duration}s)`).join(' → ')}`);
  }

  log(`Hashtags: ${(result.script.hashtags || []).join(' ')}`);

  // Verify file exists and has reasonable size
  if (existsSync(result.videoPath)) {
    const stats = readFileSync(result.videoPath);
    log(`Output file: ${result.videoPath} (${(stats.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  return result;
}

async function modeRecycle(postId) {
  log(`--- RECYCLE MODE: generating reel for post #${postId} ---`);

  const { extractFromId } = await import(join(PARENT_DIR, 'extractor.js'));
  const article = await extractFromId(postId);

  const result = await generateReel(article, { publish: true });

  log(`Reel generated and published for post #${postId}`);
  return result;
}

async function modeBatch(count) {
  log(`--- BATCH MODE: generating ${count} reels ---`);

  const { fetchAllPosts, extractFromId } = await import(join(PARENT_DIR, 'extractor.js'));
  const posts = await fetchAllPosts();

  // Shuffle and pick
  const shuffled = posts.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, MAX_REELS_PER_DAY));

  const results = [];
  for (const post of selected) {
    try {
      log(`Processing post #${post.id}...`);
      const article = await extractFromId(post.id);
      const result = await generateReel(article, { publish: true });
      results.push(result);
    } catch (err) {
      logError(`Failed for post #${post.id}: ${err.message}`);
    }
  }

  log(`Batch complete: ${results.length}/${selected.length} reels generated`);
  return results;
}

async function modeNews() {
  log('--- NEWS MODE: generating reels from today\'s RSS news ---');

  const { getNewsForToday } = await import(join(PARENT_DIR, 'sources', 'rss-scraper.js'));

  const newsItems = await getNewsForToday(3); // max 3 news reels
  log(`Got ${newsItems.length} news items`);

  const results = [];
  for (const item of newsItems) {
    try {
      // Convert news item to article-like format
      const article = {
        title: item.headline1 || item.originalTitle || 'Actu Voyage',
        hook: item.headline2 || '',
        keyStats: item.subtext ? [item.subtext] : [],
        category: item.region || 'Voyage',
        postId: null,
      };

      const result = await generateReel(article, { publish: true });
      results.push(result);
    } catch (err) {
      logError(`Failed for news "${(item.headline1 || '').slice(0, 40)}": ${err.message}`);
    }
  }

  log(`News reels complete: ${results.length}/${newsItems.length} generated`);
  return results;
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const hasFlag = (name) => args.includes(`--${name}`);
  const getFlagValue = (name) => {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return null;
    const next = args[idx + 1];
    return (next && !next.startsWith('--')) ? next : null;
  };

  // Determine mode (first -- flag that isn't --type or --listicle or --post)
  const mode = args.find(a => a.startsWith('--') && !['--type', '--listicle', '--post'].includes(a))?.replace('--', '');

  // Parse --type and --listicle flags
  let forceType = getFlagValue('type');
  if (hasFlag('listicle')) forceType = 'listicle';

  // Parse --post flag for specifying article ID
  const forcePostId = getFlagValue('post');

  log(`FlashVoyage Reels — mode: ${mode || 'none'}${forceType ? `, type: ${forceType}` : ''}`);
  log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET'}`);
  log(`PEXELS_API_KEY: ${process.env.PEXELS_API_KEY ? 'set' : 'not set (will try without)'}`);

  try {
    switch (mode) {
      case 'test':
        await modeTest(forceType, forcePostId);
        break;

      case 'recycle': {
        const idx = args.indexOf('--recycle');
        const postId = args[idx + 1] && !args[idx + 1].startsWith('--')
          ? parseInt(args[idx + 1], 10)
          : null;
        if (!postId) {
          console.error('Usage: --recycle <postId>');
          process.exit(1);
        }
        await modeRecycle(postId);
        break;
      }

      case 'batch': {
        const idx = args.indexOf('--batch');
        const count = parseInt(args[idx + 1], 10) || 3;
        await modeBatch(count);
        break;
      }

      case 'news':
        await modeNews();
        break;

      default:
        console.log(`
FlashVoyage Reels Generator

Usage:
  node social-distributor/reels/index.js --test                        Test: generate 1 reel, save to /tmp/
  node social-distributor/reels/index.js --test --type listicle        Test: generate listicle reel
  node social-distributor/reels/index.js --test --listicle             Same as above (shorthand)
  node social-distributor/reels/index.js --test --listicle --post 4254 Test: listicle from specific article
  node social-distributor/reels/index.js --recycle <postId>            Generate + publish from article
  node social-distributor/reels/index.js --batch <count>               Generate + publish N reels
  node social-distributor/reels/index.js --news                        Generate reels from RSS news

Environment:
  ANTHROPIC_API_KEY    Required (script generation via Haiku)
  PEXELS_API_KEY       Optional (stock video search)
`);
        process.exit(0);
    }
  } catch (err) {
    logError(`Fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run CLI only when executed directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/reels/index.js') ||
  process.argv[1].endsWith('\\reels\\index.js')
);

if (isDirectRun) {
  main().catch(err => {
    logError(`Unhandled: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}
