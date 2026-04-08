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

// ── City-level variety (30% of reels) ────────────────────────────────────────

/**
 * Call Haiku to extract the most interesting city from an article.
 * Returns the city name (e.g. "Bangkok", "Ubud") or null if none found.
 *
 * @param {string} rawText - Article plain text (truncated to 3000 chars)
 * @param {string} title - Article title
 * @returns {Promise<string|null>}
 */
async function extractCityFocus(rawText, title) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log('ANTHROPIC_API_KEY not set — skipping city extraction');
    return null;
  }

  const text = (rawText || '').slice(0, 3000);
  if (text.length < 200) return null; // too short to extract anything meaningful

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        messages: [{
          role: 'user',
          content: `From this travel article, extract the single most interesting/specific CITY or TOWN mentioned (not the country).
Return ONLY the city name in French (with accents), nothing else. If no specific city is mentioned, return "NONE".

TITLE: ${title}
TEXT: ${text}`,
        }],
      }),
    });

    if (!response.ok) {
      log(`City extraction API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const city = (data.content?.[0]?.text || '').trim();

    if (!city || city === 'NONE' || city.length > 40) return null;

    log(`City focus extracted: "${city}" (from: "${(title || '').slice(0, 50)}")`);
    return city;
  } catch (err) {
    log(`City extraction failed: ${err.message}`);
    return null;
  }
}

/**
 * Optionally enrich an article with a city focus (30% probability).
 * When triggered, calls Haiku to extract a city and sets article.cityFocus.
 * Also prepends a city hint to the title so downstream generators pick it up.
 */
async function maybeAddCityFocus(article) {
  // 30% chance of city-level reel
  if (Math.random() > 0.30) {
    log('City focus: skipped (country-level reel)');
    return article;
  }

  const city = await extractCityFocus(article.rawText, article.title);
  if (!city) return article;

  article.cityFocus = city;
  // Prepend city hint so generators (which read article.title) focus on it
  article.originalTitle = article.title;
  article.title = `${city} — ${article.title}`;
  log(`Article enriched with city focus: "${city}"`);
  return article;
}

// ── Article fetching ─────────────────────────────────────────────────────────

async function fetchArticle(postId = null) {
  const { fetchAllPosts, extractFromId } = await import(join(PARENT_DIR, 'extractor.js'));

  if (postId) {
    log(`Fetching article #${postId}...`);
    const article = await extractFromId(parseInt(postId, 10));
    return maybeAddCityFocus(article);
  }

  // Pick a random article (diversify destinations instead of always using latest)
  const posts = await fetchAllPosts();
  if (posts.length === 0) {
    throw new Error('No articles found in WordPress');
  }

  // Check reel history to avoid repeating same article within 7 days
  let recentArticleIds = new Set();
  try {
    const historyPath = join(__dirname, 'data', 'reel-history.jsonl');
    const { readFileSync, existsSync } = await import('fs');
    if (existsSync(historyPath)) {
      const sevenDaysAgo = Date.now() - 7 * 86400000;
      readFileSync(historyPath, 'utf-8').split('\n').filter(Boolean).forEach(line => {
        try {
          const entry = JSON.parse(line);
          if (new Date(entry.date).getTime() > sevenDaysAgo && entry.postId) {
            recentArticleIds.add(entry.postId);
          }
        } catch {}
      });
    }
  } catch {}

  // Filter out recently used articles, then pick random
  const available = posts.filter(p => !recentArticleIds.has(p.id));
  const pool = available.length > 0 ? available : posts;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  log(`Random article #${picked.id}: ${(picked.title?.rendered || '').slice(0, 60)} (pool: ${pool.length}/${posts.length})`);
  const article = await extractFromId(picked.id);
  return maybeAddCityFocus(article);
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

    case 'cost-vs': {
      const { generateCostVsReelFromArticle } = await import('./composers/cost-vs-composer.js');
      return generateCostVsReelFromArticle(article, opts);
    }

    case 'leaderboard': {
      const { generateLeaderboardReelFromArticle } = await import('./composers/leaderboard-composer.js');
      return generateLeaderboardReelFromArticle(article, opts);
    }

    case 'best-time': {
      const { generateBestTimeReelFromArticle } = await import('./composers/best-time-composer.js');
      return generateBestTimeReelFromArticle(article, opts);
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

  const subtopic = result.script?.subtopic || null;
  const pubResult = await publishReel(videoBuffer, caption, hashtags, undefined, { format, subtopic });
  const reelId = pubResult.reelId;
  const permalink = pubResult.permalink;

  logReelPublished(reelId, article.postId, format);
  log(`Published! reelId=${reelId}, permalink=${permalink}`);

  // Record publication in smart scheduler (destination tracking for dedup)
  try {
    const { recordPublication } = await import('./smart-scheduler.js');
    const destination = result.script?.country || result.script?.destination || null;
    const subtopic = result.script?.subtopic || null;
    recordPublication({ format, articleId: article.postId, destination });
    if (destination) log(`Recorded destination: ${destination}${subtopic ? ` (${subtopic})` : ''}`);
  } catch (e) {
    log(`WARN: Failed to record publication: ${e.message}`);
  }

  // Cross-publish to FB Reel + Threads + IG Story (best-effort, non-fatal).
  // The IG Reel is already live at this point — any failure here only affects
  // cross-distribution, never the primary publish.
  //
  // IG Story uses a frame extracted from the reel mp4 itself (not a random
  // article photo), and its link sticker points to the reel permalink (not
  // the article) — this is the "share your reel to your own story" growth
  // pattern that boosts the reel's initial watch signals.
  let crossResults = null;
  try {
    log('Cross-publishing to FB Reel + Threads + IG Story (reel frame + reel link)...');
    const { crossPublishReel } = await import('../cross-publisher.js');
    const { uploadVideoToWP, deleteWpVideo } = await import('./publisher.js');

    const wpVideo = await uploadVideoToWP(
      videoBuffer,
      `reel-crosspub-${format}-${Date.now()}.mp4`
    );
    log(`Video uploaded to WP for cross-pub: id=${wpVideo.wpMediaId}`);

    const fullCaption = `${caption}\n\n${hashtags.join(' ')}`.slice(0, 2200);
    crossResults = await crossPublishReel({
      caption: fullCaption,
      videoPublicUrl: wpVideo.publicUrl,
      // New: frame is extracted from the local reel mp4 inside cross-publisher
      reelVideoPath: result.videoPath,
      // New: Story link sticker points to the reel itself, not the article
      reelPermalink: permalink,
      // Still passed for FB Reel + Threads caption attribution
      articleUrl: article.articleUrl,
      reelId,
    });

    const fb = crossResults.facebook;
    const th = crossResults.threads;
    const st = crossResults.story;
    log(`Cross-pub FB Reel: ${fb.success ? 'OK id=' + fb.data?.reelId : 'FAIL — ' + fb.error}`);
    log(`Cross-pub Threads: ${th.success ? 'OK' : 'FAIL — ' + th.error}`);
    log(`Cross-pub IG Story: ${st.success ? 'OK' : 'FAIL — ' + st.error}`);

    // Clean up the WP video (whether FB Reel succeeded or not — FB already
    // fetched it if it was going to). Non-fatal.
    try {
      await deleteWpVideo(wpVideo.wpMediaId);
      log(`Cleaned up WP video ${wpVideo.wpMediaId}`);
    } catch (e) {
      log(`WARN: WP video cleanup failed: ${e.message}`);
    }
  } catch (crossErr) {
    log(`WARN: Cross-publish failed (non-fatal): ${crossErr.message}`);
  }

  return { ...result, reelId, permalink, crossResults };
}

// ── v2 Mode: Format Test ─────────────────────────────────────────────────────

/**
 * Build a short human-readable Telegram caption describing the test reel
 * so Florian can eyeball what was generated without opening the logs.
 * Returns at most 1024 chars (Telegram caption limit).
 */
function buildTelegramTestCaption(format, article, script) {
  const lines = [
    `🧪 TEST REEL (test_only=true, NOT published)`,
    `Format: ${format}`,
    `Article: #${article?.postId || '?'} — ${(article?.title || '').slice(0, 80)}`,
  ];

  if (!script) {
    return lines.join('\n').slice(0, 1024);
  }

  // Format-specific summaries
  if (script.type === 'cost-vs' && script.totals) {
    lines.push('');
    lines.push(`💰 ${script.destination.displayName} ${script.destination.flag} vs France 🇫🇷`);
    lines.push(`Total/mois: ${script.totals.destFormatted} vs ${script.totals.franceFormatted}`);
    const diff = script.totals.france - script.totals.dest;
    const sign = diff >= 0 ? '-' : '+';
    lines.push(`Écart: ${sign}${Math.abs(diff).toLocaleString('fr-FR')} €`);
  } else if (script.type === 'leaderboard' && Array.isArray(script.items)) {
    lines.push('');
    lines.push(`📊 ${script.configId}`);
    lines.push(script.title.replace('\n', ' '));
    script.items.slice(0, 5).forEach((it) => {
      lines.push(`  #${it.rank} ${it.flag} ${it.displayName} — ${it.display}`);
    });
    if (script.items.length > 5) lines.push(`  … +${script.items.length - 5} more`);
  } else if (script.type === 'best-time' && Array.isArray(script.items)) {
    lines.push('');
    lines.push(`📅 Region: ${script.regionId}`);
    lines.push(script.title.replace('\n', ' '));
    script.items.forEach((it) => {
      const avoid = it.avoid_period ? ` | ⚠${it.avoid_period}` : '';
      lines.push(`  ${it.flag} ${it.displayName}: ${it.best_period}${avoid}`);
    });
  } else if (script.type === 'versus' && script.destA && script.destB) {
    lines.push('');
    lines.push(`⚔️ ${script.destA.name} ${script.destA.flag} vs ${script.destB.flag} ${script.destB.name}`);
    if (script.rows) script.rows.forEach((r) => lines.push(`  ${r.label}: ${r.left} | ${r.right}`));
  } else {
    // Generic fallback (poll, pick, humor, budget, avantapres, month, ...)
    if (script.question) lines.push(`Question: ${script.question}`);
    if (script.hook?.text) lines.push(`Hook: ${script.hook.text}`);
    if (script.caption) lines.push(`Caption: ${script.caption.slice(0, 100)}`);
  }

  return lines.join('\n').slice(0, 1024);
}

/**
 * Send a composed test reel to Telegram for visual preview.
 * Non-fatal: logs warning and returns if tokens missing or send fails.
 */
async function sendTestReelToTelegram(videoPath, caption) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    log('Telegram: tokens not set, skipping preview send');
    return;
  }
  if (!existsSync(videoPath)) {
    log(`Telegram: video file not found at ${videoPath}, skipping`);
    return;
  }

  try {
    const buffer = readFileSync(videoPath);
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('video', new Blob([buffer], { type: 'video/mp4' }), 'test-reel.mp4');
    form.append('caption', caption);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    if (data.ok) {
      log(`Telegram: test reel sent to chat ${chatId} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      log(`Telegram: send failed — ${data.description || 'unknown error'}`);
    }
  } catch (err) {
    log(`Telegram: send error — ${err.message}`);
  }
}

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

  // Send the test reel to Telegram for visual preview (non-fatal)
  try {
    const tgCaption = buildTelegramTestCaption(format, article, result.script);
    await sendTestReelToTelegram(result.videoPath, tgCaption);
  } catch (err) {
    log(`Telegram preview failed (non-fatal): ${err.message}`);
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

export { routeToComposer, fetchArticle, publishIfRequested, modeFormatTest, modeFormatPublish, extractCityFocus };
