#!/usr/bin/env node

/**
 * FlashVoyage Reels v2 — CLI + Orchestrator
 *
 * NEW v2 formats:
 *   --format poll        Generate Engagement Poll reel
 *   --format pick        Generate Trip Pick reel
 *   --format humor       Generate Humor/Situation reel (Month 2)
 *   --format budget      Generate Budget Jour reel (Month 2)
 *   --format avantapres  Generate Avant/Apres reel (Month 3)
 *   --format month       Generate Ou Partir En reel (Month 3)
 *
 * Options:
 *   --test               Don't publish, save to /tmp/
 *   --post <id>          Use specific WordPress article ID
 *   --publish            Publish to Instagram
 *
 * Legacy modes (still supported):
 *   --test --type listicle    Old listicle pipeline
 *   --recycle <postId>        Old recycle mode
 *   --batch <count>           Old batch mode
 *   --news                    Old news mode
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FORMATS, FORMAT_NAMES } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PARENT_DIR = join(__dirname, '..');
const TMP_DIR = join(__dirname, 'tmp');
const REEL_LOG_PATH = join(__dirname, '..', 'data', 'reel-history.jsonl');

// Rate limit: max reels per day
const MAX_REELS_PER_DAY = 5;

// v2 format names — only these route through the new pipeline
const V2_FORMATS = new Set(FORMAT_NAMES);

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [REEL-v2] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[${ts}] [REEL-v2] ERROR: ${msg}`);
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

function logReelPublished(reelId, postId, format) {
  const entry = {
    date: new Date().toISOString(),
    reelId,
    postId,
    format,
    version: 'v2',
  };
  const dir = dirname(REEL_LOG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(REEL_LOG_PATH, JSON.stringify(entry) + '\n');
}

// ── Article fetching ─────────────────────────────────────────────────────────

async function fetchArticle(postId = null) {
  const { fetchAllPosts, extractFromId } = await import(join(PARENT_DIR, 'extractor.js'));

  if (postId) {
    log(`Fetching article #${postId}...`);
    return extractFromId(parseInt(postId, 10));
  }

  // Default: grab the most recent article
  const posts = await fetchAllPosts();
  if (posts.length === 0) {
    throw new Error('No articles found in WordPress');
  }
  const firstPost = posts[0];
  log(`Using latest article #${firstPost.id}: ${(firstPost.title?.rendered || '').slice(0, 60)}`);
  return extractFromId(firstPost.id);
}

// ── v2 Format Router ─────────────────────────────────────────────────────────

/**
 * Route a format name to its composer module and call the appropriate function.
 *
 * @param {string} format - One of FORMAT_NAMES (poll, pick, humor, etc.)
 * @param {Object} article - Extracted article data from WP
 * @param {Object} opts - { outputPath }
 * @returns {Promise<{ videoPath: string, script: Object }>}
 */
async function routeToComposer(format, article, opts = {}) {
  switch (format) {
    case 'poll': {
      const { generatePollReelFromArticle } = await import('./composers/engagement-poll-composer.js');
      return generatePollReelFromArticle(article, opts);
    }

    case 'pick': {
      const { generateTripPickReelFromArticle } = await import('./composers/trip-pick-composer.js');
      return generateTripPickReelFromArticle(article, opts);
    }

    case 'humor': {
      const { generateHumorReelFromArticle } = await import('./composers/humor-composer.js');
      return generateHumorReelFromArticle(article, opts);
    }

    case 'humor-tweet': {
      const { generateTweetHumorReelFromArticle } = await import('./composers/humor-tweet-composer.js');
      return generateTweetHumorReelFromArticle(article, opts);
    }

    case 'budget': {
      const { generateBudgetJourReelFromArticle } = await import('./composers/budget-jour-composer.js');
      return generateBudgetJourReelFromArticle(article, opts);
    }

    case 'versus': {
      const { generateVersusReelFromArticle } = await import('./composers/versus-composer.js');
      return generateVersusReelFromArticle(article, opts);
    }

    case 'avantapres': {
      const { generateAvantApresReelFromArticle } = await import('./composers/avantapres-composer.js');
      return generateAvantApresReelFromArticle(article, opts);
    }

    case 'month': {
      const { generateMonthReelFromArticle } = await import('./composers/month-composer.js');
      return generateMonthReelFromArticle(article, opts);
    }

    default:
      throw new Error(
        `Unknown format "${format}". Available: ${FORMAT_NAMES.join(', ')}`
      );
  }
}

// ── Publishing ───────────────────────────────────────────────────────────────

async function publishIfRequested(result, article, format, shouldPublish) {
  if (!shouldPublish) return result;

  const reelsToday = getReelsPublishedToday();
  if (reelsToday >= MAX_REELS_PER_DAY) {
    log(`Rate limit reached (${reelsToday}/${MAX_REELS_PER_DAY} reels today). Skipping publish.`);
    return result;
  }

  log(`Publishing reel to Instagram...`);
  const { publishReel } = await import('./publisher.js');
  const videoBuffer = readFileSync(result.videoPath);

  const caption = result.script?.caption
    || result.script?.hook?.text
    || article.title
    || 'Flash Voyage';
  const hashtags = result.script?.hashtags || ['#FlashVoyage'];

  const pubResult = await publishReel(videoBuffer, caption, hashtags);
  const reelId = pubResult.reelId;
  const permalink = pubResult.permalink;

  logReelPublished(reelId, article.postId, format);
  log(`Published! reelId=${reelId}, permalink=${permalink}`);

  return { ...result, reelId, permalink };
}

// ── v2 Mode: Format Test ─────────────────────────────────────────────────────

async function modeFormatTest(format, postId = null) {
  log(`--- v2 TEST: format=${format} ---`);

  const article = await fetchArticle(postId);
  const outputPath = `/tmp/test-fv-${format}.mp4`;

  const result = await routeToComposer(format, article, { outputPath });

  // Log results
  log(`Reel saved: ${result.videoPath}`);
  if (existsSync(result.videoPath)) {
    const size = readFileSync(result.videoPath).length;
    log(`Size: ${(size / 1024 / 1024).toFixed(1)} MB`);
  }

  // Log script details
  if (result.script) {
    const s = result.script;
    if (s.question) log(`Question: "${s.question}"`);
    if (s.hook?.text) log(`Hook: "${s.hook.text}"`);
    if (s.options) log(`Options: ${s.options.map(o => o.text || o).join(' | ')}`);
    if (s.items) {
      log(`Items: ${s.items.length}`);
      s.items.forEach((item, i) => log(`  ${i + 1}. ${(item.text || item.title || '').slice(0, 50)}`));
    }
    if (s.caption) log(`Caption: "${s.caption.slice(0, 80)}..."`);
    if (s.hashtags) log(`Hashtags: ${s.hashtags.join(' ')}`);
  }

  return result;
}

// ── v2 Mode: Format Publish ──────────────────────────────────────────────────

async function modeFormatPublish(format, postId = null) {
  log(`--- v2 PUBLISH: format=${format} ---`);

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const article = await fetchArticle(postId);
  const outputPath = join(TMP_DIR, `reel-${format}-${Date.now()}.mp4`);

  const result = await routeToComposer(format, article, { outputPath });

  log(`Reel composed: ${result.videoPath}`);
  if (existsSync(result.videoPath)) {
    const size = readFileSync(result.videoPath).length;
    log(`Size: ${(size / 1024 / 1024).toFixed(1)} MB`);
  }

  return publishIfRequested(result, article, format, true);
}

// ── Legacy Delegation ────────────────────────────────────────────────────────

/**
 * Delegate to the old index.js pipeline for legacy modes.
 * Dynamically imports the original generateReel and mode functions.
 */
async function delegateToLegacy(args) {
  log(`Delegating to legacy pipeline (index.js)...`);

  const legacy = await import('./index.js');
  const { generateReel } = legacy;

  // Re-parse legacy-style args
  const hasFlag = (name) => args.includes(`--${name}`);
  const getFlagValue = (name) => {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return null;
    const next = args[idx + 1];
    return (next && !next.startsWith('--')) ? next : null;
  };

  let forceType = getFlagValue('type');
  if (hasFlag('listicle')) forceType = 'listicle';
  const forcePostId = getFlagValue('post');

  if (hasFlag('test')) {
    // Legacy test mode
    log(`Legacy test mode${forceType ? ` (type: ${forceType})` : ''}`);
    const { fetchAllPosts, extractFromId } = await import(join(PARENT_DIR, 'extractor.js'));
    const { detectReelType } = await import('./script-generator.js');

    let postId;
    if (forcePostId) {
      postId = parseInt(forcePostId, 10);
    } else {
      const posts = await fetchAllPosts();
      if (posts.length === 0) throw new Error('No articles found in WordPress');
      postId = posts[0].id;
    }

    const article = await extractFromId(postId);
    const isListicle = forceType === 'listicle' || (!forceType && detectReelType(article) === 'listicle');
    const output = isListicle ? '/tmp/test-listicle-reel.mp4' : '/tmp/test-flashvoyage-reel.mp4';

    const result = await generateReel(article, {
      publish: false,
      outputPath: output,
      forceType,
    });

    log(`Legacy test reel saved: ${result.videoPath}`);
    return result;
  }

  if (hasFlag('recycle')) {
    const postId = getFlagValue('recycle');
    if (!postId) {
      console.error('Usage: --recycle <postId>');
      process.exit(1);
    }
    const { extractFromId } = await import(join(PARENT_DIR, 'extractor.js'));
    const article = await extractFromId(parseInt(postId, 10));
    return generateReel(article, { publish: true });
  }

  if (hasFlag('batch')) {
    const count = parseInt(getFlagValue('batch'), 10) || 3;
    const { fetchAllPosts, extractFromId } = await import(join(PARENT_DIR, 'extractor.js'));
    const posts = await fetchAllPosts();
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

  if (hasFlag('news')) {
    const { getNewsForToday } = await import(join(PARENT_DIR, 'sources', 'rss-scraper.js'));
    const newsItems = await getNewsForToday(3);
    log(`Got ${newsItems.length} news items`);
    const results = [];
    for (const item of newsItems) {
      try {
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

  // If we got here, no recognized legacy mode
  return null;
}

// ── Help ─────────────────────────────────────────────────────────────────────

function showHelp() {
  const formatList = FORMAT_NAMES.map(f => {
    const meta = FORMATS[f];
    const implemented = (f === 'poll' || f === 'pick') ? '' : ' (coming soon)';
    return `    ${f.padEnd(12)} ${meta.name}${implemented}`;
  }).join('\n');

  console.log(`
FlashVoyage Reels v2

v2 Formats:
  node reels/index-v2.js --format poll --test              Engagement Poll (test)
  node reels/index-v2.js --format pick --test              Trip Pick (test)
  node reels/index-v2.js --format pick --test --post 4254  From specific article
  node reels/index-v2.js --format poll --publish           Generate + publish

Available formats:
${formatList}

Legacy (backward compatible):
  node reels/index-v2.js --test --type listicle        Old listicle pipeline
  node reels/index-v2.js --test --listicle             Same (shorthand)
  node reels/index-v2.js --recycle <postId>            Old recycle mode
  node reels/index-v2.js --batch <count>               Old batch mode
  node reels/index-v2.js --news                        Old news mode

Options:
  --format <name>    v2 format to generate (poll, pick, humor, budget, avantapres, month)
  --test             Save to /tmp/, don't publish
  --publish          Generate and publish to Instagram
  --post <id>        Use a specific WordPress article ID
  --type <name>      Legacy: force reel type (listicle, stock_deal, etc.)
  --listicle         Legacy: shorthand for --type listicle

Environment:
  ANTHROPIC_API_KEY    Required (script generation via Haiku)
  PEXELS_API_KEY       Optional (stock video search)
`);
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

  if (hasFlag('help') || hasFlag('h') || args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const format = getFlagValue('format');
  const postId = getFlagValue('post');
  const isTest = hasFlag('test');
  const isPublish = hasFlag('publish');

  // ── v2 format mode ────────────────────────────────────────────────────────
  const allV2 = new Set([...FORMAT_NAMES, 'humor-tweet', 'versus']);
  if (format && allV2.has(format)) {
    log(`FlashVoyage Reels v2 — format: ${format}, test: ${isTest}, publish: ${isPublish}`);
    log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET'}`);
    log(`PEXELS_API_KEY: ${process.env.PEXELS_API_KEY ? 'set' : 'not set'}`);

    if (isTest) {
      await modeFormatTest(format, postId);
    } else if (isPublish) {
      await modeFormatPublish(format, postId);
    } else {
      // Default: generate without publishing, save to tmp
      log(`No --test or --publish flag. Generating to tmp/ without publishing.`);
      if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
      const article = await fetchArticle(postId);
      const outputPath = join(TMP_DIR, `reel-${format}-${Date.now()}.mp4`);
      const result = await routeToComposer(format, article, { outputPath });
      log(`Reel saved: ${result.videoPath}`);
    }

    return;
  }

  // ── Unknown --format value ────────────────────────────────────────────────
  const allFormats = new Set([...FORMAT_NAMES, 'humor-tweet', 'versus']);
  if (format && !allFormats.has(format)) {
    logError(`Unknown format: "${format}". Available: ${[...allFormats].join(', ')}`);
    process.exit(1);
  }

  // ── Legacy mode delegation ────────────────────────────────────────────────
  const legacyFlags = ['test', 'recycle', 'batch', 'news'];
  const isLegacyMode = legacyFlags.some(f => hasFlag(f));

  if (isLegacyMode && !format) {
    log(`FlashVoyage Reels v2 — legacy mode`);
    log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET'}`);
    log(`PEXELS_API_KEY: ${process.env.PEXELS_API_KEY ? 'set' : 'not set'}`);

    const result = await delegateToLegacy(args);
    if (result === null) {
      showHelp();
      process.exit(1);
    }
    return;
  }

  // ── Nothing matched ───────────────────────────────────────────────────────
  showHelp();
  process.exit(0);
}

// Run CLI only when executed directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/reels/index-v2.js') ||
  process.argv[1].endsWith('\\reels\\index-v2.js')
);

if (isDirectRun) {
  main().catch(err => {
    logError(`Fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}

// ── Programmatic API ─────────────────────────────────────────────────────────

export { routeToComposer, fetchArticle, publishIfRequested, modeFormatTest, modeFormatPublish };
