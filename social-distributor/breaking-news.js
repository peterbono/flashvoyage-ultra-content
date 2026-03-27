/**
 * FlashVoyage Breaking News — Auto-Detection & Immediate Publish
 *
 * Fetches RSS feeds, scores each item for virality (0-100),
 * and triggers immediate publication for high-score items (>60).
 *
 * Scoring:
 *   +30 visa/entry requirements change
 *   +30 flight prices (deal, new route, airline change)
 *   +25 safety/disaster (volcano, flood, earthquake, tsunami)
 *   +20 scam/fraud warning
 *   +15 new regulation (alcohol, cannabis, tourism tax)
 *   +10 trending destination
 *   x1.5 if < 6h old, x1.0 if 6-24h, x0.5 if > 24h
 *
 * Thresholds:
 *   > 60  → immediate publish
 *   30-60 → queued for next scheduled slot
 *   < 30  → skip
 *
 * Rate limit: max 3 breaking news per day.
 * Deduplication: stores published URLs in data/breaking-news-history.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { fetchLatestNews, reformulateAsHook } from './sources/rss-scraper.js';
import {
  generateVPHook, generateVPCTA, generateNewsFlash,
  generateStory, detectFlag,
} from './visual-generator.js';
import { generateReel } from './reels/index.js';
import { addToQueue, processQueue } from './queue-manager.js';
import { getAllTokens } from './token-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const HISTORY_PATH = join(DATA_DIR, 'breaking-news-history.json');

// ── Configuration ────────────────────────────────────────────────────────────

const MAX_BREAKING_PER_DAY = 3;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const SCORE_THRESHOLD_IMMEDIATE = 60;
const SCORE_THRESHOLD_QUEUE = 30;

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [BREAKING] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[${ts}] [BREAKING] ERROR: ${msg}`);
}

// ── History / Deduplication ──────────────────────────────────────────────────

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return { published: [] };
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    return { published: [] };
  }
}

function saveHistory(history) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function isAlreadyPublished(url) {
  const history = loadHistory();
  return history.published.some(entry => entry.url === url);
}

function markAsPublished(url, headline, score) {
  const history = loadHistory();
  history.published.push({
    url,
    headline,
    score,
    publishedAt: new Date().toISOString(),
  });
  // Keep only the last 500 entries to avoid unbounded growth
  if (history.published.length > 500) {
    history.published = history.published.slice(-500);
  }
  saveHistory(history);
}

function getBreakingPublishedToday() {
  const history = loadHistory();
  const today = new Date().toISOString().slice(0, 10);
  return history.published.filter(entry =>
    entry.publishedAt?.startsWith(today)
  ).length;
}

// ── Virality Scoring ─────────────────────────────────────────────────────────

/**
 * Score a news item for virality (0-100+).
 * Categories are cumulative: an item about visa + flight gets both bonuses.
 */
function scoreNewsItem(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  let score = 0;
  const matchedCategories = [];

  // +30: Visa / entry requirements change
  const visaKeywords = [
    'visa', 'visa-free', 'visa free', 'e-visa', 'evisa',
    'entry requirement', 'passport', 'border', 'immigration',
    'visa on arrival', 'visa exemption', 'entry ban', 'travel ban',
    'reopening', 'reopen border',
  ];
  if (visaKeywords.some(kw => text.includes(kw))) {
    score += 30;
    matchedCategories.push('visa');
  }

  // +30: Flight prices / deals / routes / airline changes
  const flightKeywords = [
    'flight', 'airline', 'airfare', 'air fare', 'cheap flight',
    'new route', 'direct flight', 'low cost', 'budget airline',
    'fare', 'ticket price', 'plane ticket',
    'airport', 'new airport', 'airport closed',
    'airasia', 'thai airways', 'vietnam airlines', 'cebu pacific',
    'scoot', 'jetstar', 'bamboo airways', 'batik air',
  ];
  if (flightKeywords.some(kw => text.includes(kw))) {
    score += 30;
    matchedCategories.push('transport');
  }

  // +25: Safety / disaster
  const safetyKeywords = [
    'volcano', 'eruption', 'earthquake', 'tsunami', 'flood',
    'typhoon', 'cyclone', 'storm', 'landslide', 'evacuation',
    'warning', 'advisory', 'danger', 'emergency',
    'travel warning', 'safety alert', 'do not travel',
  ];
  if (safetyKeywords.some(kw => text.includes(kw))) {
    score += 25;
    matchedCategories.push('sécurité');
  }

  // +20: Scam / fraud warning
  const scamKeywords = [
    'scam', 'fraud', 'swindle', 'rip off', 'ripoff', 'con artist',
    'tourist trap', 'overcharg', 'taxi scam', 'tuk tuk scam',
    'fake', 'counterfeit', 'pickpocket', 'theft',
  ];
  if (scamKeywords.some(kw => text.includes(kw))) {
    score += 20;
    matchedCategories.push('arnaque');
  }

  // +15: New regulation
  const regulationKeywords = [
    'regulation', 'new law', 'new rule', 'ban', 'prohibition',
    'alcohol', 'cannabis', 'marijuana', 'weed',
    'tourism tax', 'tourist tax', 'entry fee', 'departure tax',
    'permit', 'license', 'fine', 'penalty', 'crackdown',
    'overstay', 'deportation',
  ];
  if (regulationKeywords.some(kw => text.includes(kw))) {
    score += 15;
    matchedCategories.push('réglementation');
  }

  // +10: Trending destination
  const trendKeywords = [
    'trending', 'boom', 'record', 'surge', 'soar',
    'best destination', 'top destination', 'most visited',
    'hidden gem', 'must visit', 'bucket list',
    'digital nomad', 'remote work',
  ];
  if (trendKeywords.some(kw => text.includes(kw))) {
    score += 10;
    matchedCategories.push('destination');
  }

  // Time multiplier
  let timeMultiplier = 0.5; // > 24h
  if (item.pubDate) {
    const hoursOld = (Date.now() - item.pubDate.getTime()) / (1000 * 60 * 60);
    if (hoursOld < 6) {
      timeMultiplier = 1.5;
    } else if (hoursOld <= 24) {
      timeMultiplier = 1.0;
    }
  } else {
    // No date: assume recent (within 24h)
    timeMultiplier = 1.0;
  }

  const finalScore = Math.round(score * timeMultiplier);

  return {
    score: finalScore,
    rawScore: score,
    timeMultiplier,
    categories: matchedCategories,
  };
}

// ── Publish Pipeline ─────────────────────────────────────────────────────────

/**
 * Publish a single breaking news item across all platforms.
 *
 * a. Call Haiku to reformulate headline in French as viral hook
 * b. Generate a VP-style story card image (via generateVPHook)
 * c. Generate a 15s Reel (stock footage + breaking news text overlay)
 * d. Publish immediately on FB (photo + link comment) + IG (post + story) + Threads (text + image)
 */
async function publishBreakingNews(newsItem, scoring) {
  log(`Publication immédiate: "${newsItem.title.slice(0, 60)}..." (score: ${scoring.score})`);

  // a. Reformulate with Haiku
  log(`  → Reformulation Haiku...`);
  const hook = await reformulateAsHook(newsItem);
  if (!hook) {
    throw new Error('Reformulation Haiku échouée');
  }

  const headline = hook.headline1 || newsItem.title;
  const flag = detectFlag(newsItem.title, newsItem.region);

  // b. Generate VP-style Hook slide (1080x1350)
  log(`  → Génération visuel VP Hook...`);
  const hookBuffer = await generateVPHook({
    imageUrl: 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
    flag,
    headline: headline.toUpperCase(),
    tagline: hook.headline2 || 'FLASH INFO VOYAGE',
  });

  // Generate CTA slide
  const ctaBuffer = await generateVPCTA({
    imageUrl: 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
    valueProp: hook.subtext || 'Guides terrain • Budgets réels • Comparatifs honnêtes',
    ctaText: 'Suivre @flashvoyagemedia',
    saveText: 'Enregistre ce post 🔖',
  });

  const imageBuffers = [hookBuffer, ctaBuffer];

  // Generate Story visual (1080x1920)
  log(`  → Génération Story...`);
  const storyBuffer = await generateStory({
    imageUrl: 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
    flag,
    headline: headline.toUpperCase().slice(0, 45),
    subtext: '',
    cta: '🔴 BREAKING NEWS',
  });

  // Build caption
  const text = `🔴 BREAKING NEWS\n\n${hook.headline1}\n\n${hook.headline2}\n\n${hook.subtext}`;
  const linkLine = newsItem.link ? `Source: ${newsItem.link}` : '';
  const hashtags = ['#FlashVoyage', '#BreakingNews', '#ActuVoyage', '#Asie'];
  if (newsItem.region) {
    hashtags.push(`#${newsItem.region.charAt(0).toUpperCase() + newsItem.region.slice(1)}`);
  }
  if (scoring.categories.includes('visa')) hashtags.push('#Visa');
  if (scoring.categories.includes('sécurité')) hashtags.push('#Sécurité');
  if (scoring.categories.includes('transport')) hashtags.push('#Vols');

  const fullCaption = `${text}\n\n${hashtags.join(' ')}`;

  // d. Queue for all platforms
  log(`  → Mise en file d'attente multi-plateforme...`);
  const entries = [
    // Facebook: photo + link in comment
    {
      platform: 'facebook',
      imageBuffer: imageBuffers[0],
      message: fullCaption,
      linkComment: linkLine,
      meta: {
        source: newsItem.source,
        region: newsItem.region,
        type: 'breaking-news',
        score: scoring.score,
        categories: scoring.categories,
        vpCarousel: true,
      },
    },
    // Instagram: carousel (hook + CTA) + Story
    {
      platform: 'instagram',
      imageBuffers,
      imageBuffer: imageBuffers[0],
      message: fullCaption.slice(0, 2200),
      meta: {
        source: newsItem.source,
        region: newsItem.region,
        type: 'breaking-news',
        title: headline,
        slug: newsItem.link || '',
        vpCarousel: true,
        slideCount: imageBuffers.length,
        score: scoring.score,
      },
    },
    // Threads: text + image
    {
      platform: 'threads',
      imageBuffer: imageBuffers[0],
      message: `${text}\n\n${linkLine}\n\n${hashtags.join(' ')}`.slice(0, 500),
      meta: {
        source: newsItem.source,
        region: newsItem.region,
        type: 'breaking-news',
        score: scoring.score,
        vpCarousel: true,
      },
    },
  ];

  // IG + FB Stories
  const storyEntries = [
    {
      platform: 'instagram',
      action: 'story',
      imageBuffer: storyBuffer,
      message: '',
      meta: { source: newsItem.source, region: newsItem.region, type: 'breaking-news', story: true },
    },
    {
      platform: 'facebook',
      action: 'story',
      imageBuffer: storyBuffer,
      message: '',
      meta: { source: newsItem.source, region: newsItem.region, type: 'breaking-news', story: true },
    },
  ];

  await addToQueue([...entries, ...storyEntries]);

  // Process queue immediately
  const tokens = getAllTokens();
  const result = await processQueue(tokens);

  log(`  → Publié: ${result.published.length} posts, ${result.failed.length} échecs`);

  // c. Generate Reel (non-blocking, best-effort)
  try {
    log(`  → Génération Reel (15s)...`);
    const reelArticle = {
      title: headline,
      hook: hook.headline2 || '',
      keyStats: hook.subtext ? [hook.subtext] : [],
      category: newsItem.region || 'Voyage',
      postId: null,
    };
    const reelResult = await generateReel(reelArticle, { publish: true });
    log(`  → Reel publié: ${reelResult.reelId || 'sauvegardé localement'}`);
  } catch (err) {
    logError(`Reel échoué (non-fatal): ${err.message}`);
  }

  // Mark as published in history
  markAsPublished(newsItem.link, headline, scoring.score);

  return {
    headline,
    score: scoring.score,
    categories: scoring.categories,
    published: result.published.length,
    failed: result.failed.length,
  };
}

// ── Main: One Check Cycle ────────────────────────────────────────────────────

/**
 * Run one breaking news check cycle.
 *
 * 1. Fetch RSS (all 10 sources, last 24h)
 * 2. Score each item
 * 3. Filter already-published URLs
 * 4. Publish high-score items immediately (max 3/day)
 * 5. Return results summary
 *
 * @returns {Promise<Object>} { checked, scored, published, queued, skipped }
 */
export async function checkBreakingNews() {
  log('═══════════════════════════════════════════════════════════');
  log('Vérification Breaking News en cours...');
  log('═══════════════════════════════════════════════════════════');

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    logError('ANTHROPIC_API_KEY non définie — reformulation impossible');
    return { checked: 0, scored: [], published: 0, queued: 0, skipped: 0, error: 'missing API key' };
  }

  const results = {
    checked: 0,
    scored: [],
    published: 0,
    queued: 0,
    skipped: 0,
  };

  // Step 1: Fetch RSS (fast — target < 15s)
  const startFetch = Date.now();
  const newsItems = await fetchLatestNews(24);
  const fetchDuration = ((Date.now() - startFetch) / 1000).toFixed(1);
  log(`Flux RSS récupérés: ${newsItems.length} articles en ${fetchDuration}s`);
  results.checked = newsItems.length;

  if (newsItems.length === 0) {
    log('Aucun article trouvé. Fin du cycle.');
    return results;
  }

  // Step 2: Score each item (instant — no API calls)
  const scoredItems = newsItems.map(item => ({
    ...item,
    scoring: scoreNewsItem(item),
  }));

  // Sort by score descending
  scoredItems.sort((a, b) => b.scoring.score - a.scoring.score);

  // Log top 10 scores for visibility
  log('Top 10 scores:');
  for (const item of scoredItems.slice(0, 10)) {
    const age = item.pubDate
      ? `${((Date.now() - item.pubDate.getTime()) / (1000 * 60 * 60)).toFixed(1)}h`
      : '?h';
    log(`  [${item.scoring.score}] ${item.title.slice(0, 70)} (${age}, ${item.scoring.categories.join('+') || 'aucune catégorie'})`);
  }

  results.scored = scoredItems.map(i => ({
    title: i.title.slice(0, 80),
    score: i.scoring.score,
    categories: i.scoring.categories,
    source: i.source,
  }));

  // Step 3: Check rate limit
  const publishedToday = getBreakingPublishedToday();
  const remainingSlots = MAX_BREAKING_PER_DAY - publishedToday;
  log(`Déjà publié aujourd'hui: ${publishedToday}/${MAX_BREAKING_PER_DAY} (${remainingSlots} restants)`);

  if (remainingSlots <= 0) {
    log('Limite quotidienne atteinte. Aucune publication.');
    results.skipped = scoredItems.filter(i => i.scoring.score > SCORE_THRESHOLD_IMMEDIATE).length;
    return results;
  }

  // Step 4: Process items by score tier
  let publishCount = 0;

  for (const item of scoredItems) {
    // Skip already published
    if (isAlreadyPublished(item.link)) {
      continue;
    }

    if (item.scoring.score > SCORE_THRESHOLD_IMMEDIATE && publishCount < remainingSlots) {
      // IMMEDIATE PUBLISH (score > 60)
      try {
        const pubResult = await publishBreakingNews(item, item.scoring);
        results.published++;
        publishCount++;
        log(`✓ Breaking publié: "${pubResult.headline.slice(0, 50)}..." (score: ${pubResult.score})`);
      } catch (err) {
        logError(`Échec publication: "${item.title.slice(0, 50)}..." — ${err.message}`);
      }
    } else if (item.scoring.score >= SCORE_THRESHOLD_QUEUE && item.scoring.score <= SCORE_THRESHOLD_IMMEDIATE) {
      // QUEUE for next scheduled slot (score 30-60)
      results.queued++;
      log(`⏳ En file d'attente (score ${item.scoring.score}): "${item.title.slice(0, 60)}..."`);
    } else if (item.scoring.score < SCORE_THRESHOLD_QUEUE) {
      // SKIP (score < 30)
      results.skipped++;
    }
  }

  // Summary
  log('───────────────────────────────────────────────────────────');
  log(`Résumé: ${results.checked} vérifiés, ${results.published} publiés, ${results.queued} en file, ${results.skipped} ignorés`);
  log('═══════════════════════════════════════════════════════════');

  return results;
}

// ── Watch Mode (Loop) ────────────────────────────────────────────────────────

/**
 * Run breaking news check in a loop every `intervalMs` milliseconds.
 * Designed for `--watch` mode. Runs indefinitely until process is killed.
 *
 * @param {number} intervalMs - Check interval (default: 30 minutes)
 */
export async function watchBreakingNews(intervalMs = CHECK_INTERVAL_MS) {
  const intervalMin = Math.round(intervalMs / 60000);
  log(`Mode surveillance activé — vérification toutes les ${intervalMin} minutes`);
  log(`Seuils: immédiat > ${SCORE_THRESHOLD_IMMEDIATE}, file > ${SCORE_THRESHOLD_QUEUE}, max ${MAX_BREAKING_PER_DAY}/jour`);
  log(`Appuyez sur Ctrl+C pour arrêter.\n`);

  let cycleCount = 0;

  // Run first check immediately
  while (true) {
    cycleCount++;
    log(`\n──── Cycle #${cycleCount} ────`);

    try {
      const results = await checkBreakingNews();
      log(`Cycle #${cycleCount} terminé: ${results.published} publiés, ${results.queued} en file`);
    } catch (err) {
      logError(`Cycle #${cycleCount} échoué: ${err.message}`);
    }

    // Wait for next cycle
    log(`Prochain cycle dans ${intervalMin} minutes...`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export { scoreNewsItem, SCORE_THRESHOLD_IMMEDIATE, SCORE_THRESHOLD_QUEUE, MAX_BREAKING_PER_DAY };
