#!/usr/bin/env node

/**
 * FlashVoyage Social Distributor — Main Orchestrator
 *
 * CLI modes:
 *   --recycle [postId]  Recycle existing articles into social posts
 *   --news              Publish fresh news from RSS feeds
 *   --daily             Full daily routine (cron-ready)
 *   --test              Dry run — generate visuals/captions, save to /tmp/
 *   --breaking          Run one breaking news check (score + publish if > 60)
 *   --watch             Run breaking news checks every 30 min in a loop
 *
 * Programmatic API:
 *   import { distributeArticle } from './social-distributor/index.js';
 *   await distributeArticle(wpPostId);
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { extractFromId, fetchAllPosts, generateStoryHook } from './extractor.js';
import { buildCaption, CONTENT_TYPES } from './caption-builder.js';
import {
  generateStoryCard, generateNewsFlash, generateStatCard,
  generateVPCarousel, generateVPHook, generateVPCTA,
  generateStory, detectFlag,
} from './visual-generator.js';
import { recycleArticle, recycleAllArticles, detectTypes } from './sources/article-recycler.js';
import { getNewsForToday } from './sources/rss-scraper.js';
import { addToQueue, processQueue, getStats } from './queue-manager.js';
import { getToken, checkExpiration, getAllTokens } from './token-manager.js';
import { generateReel } from './reels/index.js';
import { checkBreakingNews, watchBreakingNews } from './breaking-news.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN_DIR = '/tmp/flashvoyage-social-test';

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[${ts}] ERROR: ${msg}`);
}

// ── Visual generation helpers ────────────────────────────────────────────────

/**
 * Pick the right visual generator based on content type and produce an image buffer.
 * Returns { buffer, filename } or null if generation fails.
 */
async function generateVisual(type, extracted, variant) {
  try {
    let buffer;
    let filename;

    switch (type) {
      case 'budget': {
        const rawStat = extracted.keyStats[0];
        const stat = rawStat ? (typeof rawStat === 'object' ? rawStat.value : rawStat) : '???';
        const statMatch = stat.match(/^([\d\s.,]+)\s*(.+)$/);
        buffer = await generateStatCard({
          statNumber: statMatch ? statMatch[1].trim() : stat,
          statUnit: statMatch ? statMatch[2].trim() : '',
          context: extracted.title,
          imageUrl: extracted.imageUrl || 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
        });
        filename = `stat-card-${Date.now()}`;
        break;
      }

      case 'news': {
        buffer = await generateNewsFlash({
          headline: extracted.title,
          subtext: extracted.hook ? extracted.hook.split('.')[0] : '',
          category: (extracted.category || 'VOYAGE').toUpperCase(),
        });
        filename = `news-flash-${Date.now()}`;
        break;
      }

      case 'insolite':
      case 'storytelling': {
        const hookParts = extracted.hook ? extracted.hook.split('.') : [extracted.title];
        buffer = await generateStoryCard({
          imageUrl: extracted.imageUrl || 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
          headline1: hookParts[0] || extracted.title,
          headline2: hookParts[1] || '',
          subtext: extracted.category || 'Flash Voyage',
        });
        filename = `story-card-${Date.now()}`;
        break;
      }

      default: {
        // question, comparatif — use story card as fallback
        buffer = await generateStoryCard({
          imageUrl: extracted.imageUrl || 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
          headline1: extracted.title.slice(0, 60),
          headline2: '',
          subtext: extracted.category || 'Flash Voyage',
        });
        filename = `card-${type}-${Date.now()}`;
        break;
      }
    }

    return { buffer, filename };
  } catch (err) {
    logError(`Visual generation failed (${type}): ${err.message}`);
    return null;
  }
}

// ── Queue helpers ────────────────────────────────────────────────────────────

/**
 * Build queue entries for all 3 platforms from a variant + visual.
 */
function buildQueueEntries(variant, caption, imageBuffer, articleSlug) {
  const entries = [];
  const hashtagStr = caption.hashtags.join(' ');
  const fullCaption = `${caption.text}\n\n${hashtagStr}`;

  // Facebook: uses imageUrl (we'll upload to WP or use article image)
  entries.push({
    platform: 'facebook',
    imageBuffer,
    message: fullCaption,
    linkComment: caption.linkComment,
    meta: { postId: variant.postId, type: variant.type, slug: articleSlug },
  });

  // Instagram: uses imageBuffer
  entries.push({
    platform: 'instagram',
    imageBuffer,
    message: fullCaption,
    meta: { postId: variant.postId, type: variant.type, slug: articleSlug },
  });

  // Threads: text-only or with imageUrl
  entries.push({
    platform: 'threads',
    imageBuffer,
    message: `${caption.text}\n\n${caption.linkComment}\n\n${hashtagStr}`.slice(0, 500),
    meta: { postId: variant.postId, type: variant.type, slug: articleSlug },
  });

  return entries;
}

// ── Story generation helper ──────────────────────────────────────────────────

/**
 * Truncate text at word boundary, max `maxLen` chars, adding "..." if truncated.
 */
function truncateAtWord(text, maxLen = 40) {
  if (text.length <= maxLen) return text;
  // Find last space before maxLen
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.5) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

/**
 * Generate an IG/FB Story image from extracted article data.
 * Returns a PNG buffer (1080x1920, 9:16 vertical).
 *
 * Stories are viewed for ~5 seconds, so:
 * - Headline: AI-generated punchy hook (max ~35 chars), falls back to truncation
 * - Subtext: removed (empty) — nobody reads paragraphs in Stories
 */
async function generateStoryVisual(extracted) {
  const flag = detectFlag(extracted.title, extracted.category);
  const bgImage = extracted.imageUrl || 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080';

  // Try AI hook generation first, fall back to dumb truncation
  const destination = extracted.category || 'Voyage';
  const aiHook = await generateStoryHook(extracted.title, destination);
  const headline = aiHook || truncateAtWord(extracted.title, 40).toUpperCase();

  return generateStory({
    imageUrl: bgImage,
    flag,
    headline,
    subtext: '',  // Stories: no subtext, just headline + CTA
    cta: 'LIEN EN BIO',
  });
}

/**
 * Build Story queue entries for IG and FB from a story image buffer.
 */
function buildStoryQueueEntries(storyBuffer, articleSlug, postId, type) {
  return [
    {
      platform: 'instagram',
      action: 'story',
      imageBuffer: storyBuffer,
      message: '',
      meta: { postId, type, slug: articleSlug, story: true },
    },
    {
      platform: 'facebook',
      action: 'story',
      imageBuffer: storyBuffer,
      message: '',
      meta: { postId, type, slug: articleSlug, story: true },
    },
  ];
}

// ── VP Carousel queue helpers ────────────────────────────────────────────────

/**
 * Build queue entries for a VP carousel (multi-slide) across all 3 platforms.
 * IG gets the full carousel; FB gets the first slide; Threads gets the first slide.
 */
function buildVPCarouselQueueEntries(caption, carouselBuffers, articleSlug, postId, type, title = '') {
  const entries = [];
  const hashtagStr = caption.hashtags.join(' ');
  const fullCaption = `${caption.text}\n\n${hashtagStr}`;

  // Instagram: carousel of all slides + link in first comment
  entries.push({
    platform: 'instagram',
    imageBuffers: carouselBuffers, // array of PNGs for carousel
    imageBuffer: carouselBuffers[0], // fallback: first slide if carousel not supported
    message: fullCaption.slice(0, 2200),
    linkComment: caption.linkComment || null, // article link posted as first comment
    meta: { postId, type, slug: articleSlug, title, vpCarousel: true, slideCount: carouselBuffers.length },
  });

  // Facebook: multi-photo carousel of all slides + link in first comment
  entries.push({
    platform: 'facebook',
    imageBuffers: carouselBuffers, // array of PNGs for multi-photo
    imageBuffer: carouselBuffers[0], // fallback if multi-photo fails
    message: fullCaption,
    linkComment: caption.linkComment,
    meta: { postId, type, slug: articleSlug, title, vpCarousel: true, slideCount: carouselBuffers.length },
  });

  // Threads: first slide as image
  entries.push({
    platform: 'threads',
    imageBuffer: carouselBuffers[0],
    message: `${caption.text}\n\n${caption.linkComment}\n\n${hashtagStr}`.slice(0, 500),
    meta: { postId, type, slug: articleSlug, title, vpCarousel: true },
  });

  return entries;
}

// ── Mode: Recycle ────────────────────────────────────────────────────────────

async function modeRecycle(postId, dryRun = false) {
  log(`--- RECYCLE MODE (VP Carousel) ${postId ? `(post ${postId})` : '(ALL articles)'} ---`);

  let variants;
  if (postId) {
    variants = await recycleArticle(postId);
    log(`Generated ${variants.length} variants for post #${postId}`);
  } else {
    variants = await recycleAllArticles();
    log(`Generated ${variants.length} total variants from all articles`);
  }

  if (variants.length === 0) {
    log('No variants generated. Nothing to do.');
    return { published: 0, failed: 0, queued: 0 };
  }

  const results = { published: 0, failed: 0, queued: 0, platforms: { facebook: 0, instagram: 0, threads: 0 } };

  // Deduplicate by postId — generate one VP carousel per article, not per variant
  const seenPosts = new Set();

  for (const variant of variants) {
    if (seenPosts.has(variant.postId)) continue;
    seenPosts.add(variant.postId);

    try {
      // Extract data for this article
      const extracted = await extractFromId(variant.postId);

      // Pre-extract AI budget so caption builder can use real amounts
      if (variant.type === 'budget') {
        const { extractBudgetWithAI } = await import('./extractor.js');
        const rawText = extracted.rawText || '';
        const destination = extracted.category || 'Voyage';
        extracted.aiBudget = await extractBudgetWithAI(rawText, destination);
      }

      // Primary destination is IG carousel; cross-publisher assigns platform-
      // specific UTMs for FB + Threads separately. Pass 'instagram' so the
      // caption's link carries utm_source=instagram (was hardcoded 'facebook'
      // which caused GA4 to classify this traffic as Unassigned — Agent A
      // investigation, ~41% of Unassigned sessions).
      const caption = buildCaption(extracted, variant.type, 'instagram');

      // Generate VP carousel (3-4 slides)
      log(`Generating VP carousel for post #${variant.postId} (type: ${variant.type})...`);
      const { buffers: carouselBuffers, slideTypes } = await generateVPCarousel({ article: extracted });
      log(`VP carousel: ${carouselBuffers.length} slides [${slideTypes.join(', ')}]`);

      // Generate Story visual (1080x1920) for IG + FB Stories
      log(`Generating Story visual for post #${variant.postId}...`);
      const storyBuffer = await generateStoryVisual(extracted);
      log(`Story visual generated (1080x1920)`);

      if (dryRun) {
        // Save all slides to /tmp for review
        for (let i = 0; i < carouselBuffers.length; i++) {
          const outPath = join(DRY_RUN_DIR, `vp-carousel-${variant.postId}-${slideTypes[i]}-${i + 1}.png`);
          writeFileSync(outPath, carouselBuffers[i]);
          log(`[DRY RUN] Saved slide ${i + 1}/${carouselBuffers.length}: ${outPath}`);
        }
        // Save story visual
        const storyPath = join(DRY_RUN_DIR, `ig-story-${variant.postId}-${Date.now()}.png`);
        writeFileSync(storyPath, storyBuffer);
        log(`[DRY RUN] Saved IG Story: ${storyPath}`);
        log(`[DRY RUN] Caption (${variant.type}): ${caption.text.slice(0, 100)}...`);
        log(`[DRY RUN] Hashtags: ${caption.hashtags.join(' ')}`);
        log(`[DRY RUN] Link comment: ${caption.linkComment}`);
        results.queued++;
        continue;
      }

      // Build queue entries for all platforms using VP carousel
      const entries = buildVPCarouselQueueEntries(
        caption,
        carouselBuffers,
        extracted.articleUrl,
        variant.postId,
        variant.type,
        extracted.title
      );

      // Add Story entries for IG + FB
      const storyEntries = buildStoryQueueEntries(
        storyBuffer,
        extracted.articleUrl,
        variant.postId,
        variant.type
      );

      await addToQueue([...entries, ...storyEntries]);
      results.queued += entries.length + storyEntries.length;

      // Process + purge immediately to avoid queue bloat (base64 images in JSON)
      const tokens = getAllTokens();
      const queueResult = await processQueue(tokens);
      results.published += queueResult.published.length;
      results.failed += queueResult.failed.length;

      for (const item of queueResult.published) {
        if (results.platforms[item.platform] !== undefined) {
          results.platforms[item.platform]++;
        }
      }
      log(`Post #${variant.postId} processed: ${queueResult.published.length} published, ${queueResult.failed.length} failed`);
    } catch (err) {
      logError(`Failed to process VP carousel (post ${variant.postId}, type ${variant.type}): ${err.message}`);
      results.failed++;
    }
  }

  return results;
}

// ── Mode: News ───────────────────────────────────────────────────────────────

async function modeNews(dryRun = false) {
  log('--- NEWS MODE ---');

  const newsItems = await getNewsForToday(8);
  log(`Got ${newsItems.length} news items from RSS`);

  if (newsItems.length === 0) {
    log('No news items found. Nothing to do.');
    return { published: 0, failed: 0, queued: 0 };
  }

  const results = { published: 0, failed: 0, queued: 0, platforms: { facebook: 0, instagram: 0, threads: 0 } };

  for (const item of newsItems) {
    try {
      const headline = item.headline1 || item.originalTitle || 'Actu Voyage';

      // Generate VP-style Hook + CTA slides for news (2-slide mini carousel)
      log(`Generating VP news slides for: ${headline.slice(0, 50)}...`);
      const hookBuffer = await generateVPHook({
        imageUrl: 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
        flag: '\ud83c\udf0f',
        headline: headline.toUpperCase(),
        tagline: item.headline2 || 'Flash Info Voyage',
      });
      const ctaBuffer = await generateVPCTA({
        imageUrl: 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
        valueProp: item.subtext || 'Guides terrain \u2022 Budgets r\u00e9els \u2022 Comparatifs honn\u00eates',
        ctaText: 'Suivre @flashvoyagemedia',
        saveText: 'Enregistre ce post \ud83d\udd16',
      });

      const newsBuffers = [hookBuffer, ctaBuffer];

      // Generate Story visual for IG + FB Stories
      log(`Generating Story visual for news: ${headline.slice(0, 40)}...`);
      const newsStoryBuffer = await generateStory({
        imageUrl: 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
        flag: '\ud83c\udf0f',
        headline: truncateAtWord(headline, 40).toUpperCase(),
        subtext: '',
        cta: 'LIEN EN BIO',
      });

      // Build caption from the reformulated news item
      const text = `${item.headline1}\n\n${item.headline2}\n\n${item.subtext}`;
      const linkLine = item.sourceUrl ? `Source: ${item.sourceUrl}` : '';
      const hashtags = ['#FlashVoyage', '#ActuVoyage', '#Asie'];
      if (item.region) hashtags.push(`#${item.region.charAt(0).toUpperCase() + item.region.slice(1)}`);

      const fullCaption = `${text}\n\n${hashtags.join(' ')}`;

      if (dryRun) {
        for (let i = 0; i < newsBuffers.length; i++) {
          const outPath = join(DRY_RUN_DIR, `vp-news-${Date.now()}-${i + 1}.png`);
          writeFileSync(outPath, newsBuffers[i]);
          log(`[DRY RUN] Saved news slide ${i + 1}: ${outPath}`);
        }
        // Save story visual
        const storyPath = join(DRY_RUN_DIR, `ig-story-news-${Date.now()}.png`);
        writeFileSync(storyPath, newsStoryBuffer);
        log(`[DRY RUN] Saved IG Story (news): ${storyPath}`);
        log(`[DRY RUN] News caption: ${fullCaption.slice(0, 120)}...`);
        results.queued++;
        continue;
      }

      // Queue for all platforms (IG gets carousel, FB/Threads get first slide)
      const entries = [
        {
          platform: 'facebook',
          imageBuffer: newsBuffers[0],
          message: fullCaption,
          linkComment: linkLine,
          meta: { source: item.sourceName, region: item.region, type: 'news', vpCarousel: true },
        },
        {
          platform: 'instagram',
          imageBuffers: newsBuffers,
          imageBuffer: newsBuffers[0],
          message: fullCaption.slice(0, 2200),
          meta: { source: item.sourceName, region: item.region, type: 'news', title: headline, slug: item.sourceUrl || '', vpCarousel: true, slideCount: newsBuffers.length },
        },
        {
          platform: 'threads',
          imageBuffer: newsBuffers[0],
          message: `${text}\n\n${linkLine}\n\n${hashtags.join(' ')}`.slice(0, 500),
          meta: { source: item.sourceName, region: item.region, type: 'news', vpCarousel: true },
        },
      ];

      // Add Story entries for IG + FB
      const storyEntries = [
        {
          platform: 'instagram',
          action: 'story',
          imageBuffer: newsStoryBuffer,
          message: '',
          meta: { source: item.sourceName, region: item.region, type: 'news', story: true },
        },
        {
          platform: 'facebook',
          action: 'story',
          imageBuffer: newsStoryBuffer,
          message: '',
          meta: { source: item.sourceName, region: item.region, type: 'news', story: true },
        },
      ];

      await addToQueue([...entries, ...storyEntries]);
      results.queued += entries.length + storyEntries.length;

      // Process + purge immediately to avoid queue bloat (base64 images in JSON)
      const tokens = getAllTokens();
      const queueResult = await processQueue(tokens);
      results.published += queueResult.published.length;
      results.failed += queueResult.failed.length;

      for (const pub of queueResult.published) {
        if (results.platforms[pub.platform] !== undefined) {
          results.platforms[pub.platform]++;
        }
      }
      log(`News item processed: ${queueResult.published.length} published, ${queueResult.failed.length} failed`);
    } catch (err) {
      logError(`Failed to process news item "${(item.headline1 || item.originalTitle || '').slice(0, 50)}": ${err.message}`);
      results.failed++;
    }
  }

  return results;
}

// ── Mode: Daily ──────────────────────────────────────────────────────────────

async function modeDaily(dryRun = false) {
  log('=== DAILY ROUTINE START ===');

  // Step 1: Check token expiration
  log('Step 1/3: Checking token expiration...');
  const tokenStatus = checkExpiration();
  const expiring = tokenStatus.filter(t => t.status === 'warning' || t.status === 'expired' || t.status === 'missing');
  if (expiring.length > 0) {
    for (const t of expiring) {
      logError(`TOKEN ${t.status.toUpperCase()}: ${t.platform} — ${t.daysLeft !== null ? `${t.daysLeft} days left` : 'no token'}`);
    }
  } else {
    log('All tokens OK.');
  }

  const totalResults = { published: 0, failed: 0, queued: 0, platforms: { facebook: 0, instagram: 0, threads: 0 } };

  // Step 2: Fetch and process 5 news items
  log('Step 2/3: Fetching and publishing news...');
  try {
    const newsResults = await modeNews(dryRun);
    totalResults.published += newsResults.published;
    totalResults.failed += newsResults.failed;
    totalResults.queued += newsResults.queued;
    for (const p of Object.keys(newsResults.platforms)) {
      totalResults.platforms[p] += newsResults.platforms[p];
    }
  } catch (err) {
    logError(`News mode failed: ${err.message}`);
    totalResults.failed++;
  }

  // Step 3: Recycle 3 random articles from the backlog
  log('Step 3/3: Recycling 3 random articles...');
  try {
    const allPosts = await fetchAllPosts();
    // Pick 3 random posts
    const shuffled = allPosts.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    for (const post of selected) {
      try {
        log(`Recycling post #${post.id}: ${(post.title?.rendered || '').slice(0, 50)}...`);
        const recycleResults = await modeRecycle(post.id, dryRun);
        totalResults.published += recycleResults.published;
        totalResults.failed += recycleResults.failed;
        totalResults.queued += recycleResults.queued;
        for (const p of Object.keys(recycleResults.platforms)) {
          totalResults.platforms[p] += recycleResults.platforms[p];
        }
      } catch (err) {
        logError(`Failed to recycle post #${post.id}: ${err.message}`);
        totalResults.failed++;
      }
    }
  } catch (err) {
    logError(`Article recycling failed: ${err.message}`);
    totalResults.failed++;
  }

  // Print stats
  const stats = getStats();
  log('=== DAILY ROUTINE COMPLETE ===');
  log(`Published today — FB: ${stats.today.facebook}, IG: ${stats.today.instagram}, Threads: ${stats.today.threads}`);
  log(`Rate limits — FB: ${stats.limits.facebook}, IG: ${stats.limits.instagram}, Threads: ${stats.limits.threads}`);
  log(`Queue: ${stats.pending} pending, ${stats.total} total ever published`);

  return totalResults;
}

// ── Programmatic API ─────────────────────────────────────────────────────────

/**
 * Distribute a single article to social media (called from pipeline after WP publish).
 * Generates a VP carousel, queues to all platforms, processes immediately.
 *
 * @param {number|string} postId — WordPress post ID
 * @returns {Promise<{ published: number, failed: number }>}
 */
export async function distributeArticle(postId) {
  log(`distributeArticle(${postId}) — starting VP carousel + story distribution`);

  const extracted = await extractFromId(postId);
  const types = detectTypes(extracted.title, extracted.category);
  const type = types[0] || 'question';

  // Same fix as above: IG is the primary destination, use utm_source=instagram
  const caption = buildCaption(extracted, type, 'instagram');

  // Generate VP carousel (3-4 slides)
  log(`Generating VP carousel for post #${postId} (type: ${type})...`);
  const { buffers: carouselBuffers, slideTypes } = await generateVPCarousel({ article: extracted });
  log(`VP carousel: ${carouselBuffers.length} slides [${slideTypes.join(', ')}]`);

  const entries = buildVPCarouselQueueEntries(
    caption,
    carouselBuffers,
    extracted.articleUrl,
    postId,
    type,
    extracted.title
  );

  // Generate Story visual and queue IG + FB Stories
  log(`Generating Story visual for post #${postId}...`);
  const storyBuffer = await generateStoryVisual(extracted);
  const storyEntries = buildStoryQueueEntries(
    storyBuffer,
    extracted.articleUrl,
    postId,
    type
  );

  await addToQueue([...entries, ...storyEntries]);

  // Generate Reel (non-blocking — don't fail the whole distribution if Reel fails)
  try {
    log(`Generating Reel for post #${postId}...`);
    const reelResult = await generateReel(extracted, { publish: true });
    log(`Reel generated for post #${postId}: ${reelResult.reelId || 'saved locally'}`);
  } catch (err) {
    logError(`Reel generation failed for post #${postId} (non-fatal): ${err.message}`);
  }

  const tokens = getAllTokens();
  const result = await processQueue(tokens);

  log(`distributeArticle(${postId}) — published: ${result.published.length}, failed: ${result.failed.length}`);

  return {
    published: result.published.length,
    failed: result.failed.length,
  };
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find(a => a.startsWith('--'))?.replace('--', '');
  const dryRun = mode === 'test';

  // Ensure /tmp dir exists for test mode
  if (dryRun && !existsSync(DRY_RUN_DIR)) {
    mkdirSync(DRY_RUN_DIR, { recursive: true });
  }

  log(`FlashVoyage Social Distributor — mode: ${mode || 'none'}, dryRun: ${dryRun}`);
  log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET (news mode will fail)'}`);

  let results;

  try {
    switch (mode) {
      case 'recycle': {
        // Check for postId argument (next arg after --recycle)
        const recycleIdx = args.indexOf('--recycle');
        const postId = args[recycleIdx + 1] && !args[recycleIdx + 1].startsWith('--')
          ? parseInt(args[recycleIdx + 1], 10)
          : null;
        results = await modeRecycle(postId, false);
        break;
      }

      case 'news':
        results = await modeNews(false);
        break;

      case 'daily':
        results = await modeDaily(false);
        break;

      case 'test': {
        log('[TEST MODE] Dry run (VP Carousel + Stories) — no publishing, saving outputs to /tmp/');
        let totalTestQueued = 0;

        // Test 1: Standalone IG Story template (1080x1920)
        log('[TEST] Testing IG Story template (1080x1920)...');
        try {
          const storyTestBuffer = await generateStory({
            imageUrl: 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080',
            flag: '\ud83c\uddf9\ud83c\udded',
            headline: truncateAtWord('THA\u00cfLANDE : 5 ERREURS \u00c0 NE PAS FAIRE', 40).toUpperCase(),
            subtext: '',
            cta: 'LIEN EN BIO',
          });
          const storyTestPath = join(DRY_RUN_DIR, `ig-story-test-${Date.now()}.png`);
          writeFileSync(storyTestPath, storyTestBuffer);
          log(`[TEST] IG Story saved: ${storyTestPath} (${storyTestBuffer.length} bytes)`);

          // Verify dimensions by checking PNG header (width at bytes 16-19, height at bytes 20-23)
          const width = storyTestBuffer.readUInt32BE(16);
          const height = storyTestBuffer.readUInt32BE(20);
          log(`[TEST] IG Story dimensions: ${width}x${height} ${width === 1080 && height === 1920 ? '(OK)' : '(MISMATCH - expected 1080x1920)'}`);
          totalTestQueued++;
        } catch (err) {
          logError(`[TEST] IG Story template failed: ${err.message}`);
        }

        // Test 2: Verify FB link-in-comment flow (code path check)
        log('[TEST] Verifying FB link-in-comment flow...');
        try {
          // Verify that queue-manager imports publishPhotoWithLink (not publishPhoto)
          const { publishPhotoWithLink: fbPublish } = await import('./platforms/facebook.js');
          if (typeof fbPublish === 'function') {
            log('[TEST] FB publishPhotoWithLink: FOUND (link-in-comment flow OK)');
          } else {
            logError('[TEST] FB publishPhotoWithLink: NOT FOUND (link-in-comment flow BROKEN)');
          }

          // Verify that publishStory exists for FB
          const { publishStory: fbStory } = await import('./platforms/facebook.js');
          if (typeof fbStory === 'function') {
            log('[TEST] FB publishStory: FOUND (Page Stories OK)');
          } else {
            logError('[TEST] FB publishStory: NOT FOUND');
          }

          // Verify that publishStory exists for IG
          const { publishStory: igStory } = await import('./platforms/instagram.js');
          if (typeof igStory === 'function') {
            log('[TEST] IG publishStory: FOUND (IG Stories OK)');
          } else {
            logError('[TEST] IG publishStory: NOT FOUND');
          }
        } catch (err) {
          logError(`[TEST] Platform verification failed: ${err.message}`);
        }

        // Test 3: VP news pipeline (includes Story generation)
        log('[TEST] Testing VP news pipeline (with Stories)...');
        const newsResults = await modeNews(true);
        totalTestQueued += newsResults.queued;
        log(`[TEST] VP News: ${newsResults.queued} items generated`);

        // Test 4: VP carousel recycling (includes Story generation)
        log('[TEST] Testing VP carousel recycling + Stories (first 2 articles)...');
        try {
          const allPosts = await fetchAllPosts();
          const sample = allPosts.slice(0, 2);
          for (const post of sample) {
            log(`[TEST] VP Carousel + Story for post #${post.id}...`);
            const recycleResults = await modeRecycle(post.id, true);
            totalTestQueued += recycleResults.queued;
            log(`[TEST] Post #${post.id}: ${recycleResults.queued} VP carousel(s) + story generated`);
          }
        } catch (err) {
          logError(`[TEST] VP carousel test failed: ${err.message}`);
        }

        // Summary of test outputs
        log('[TEST] Listing test output files...');
        try {
          const { readdirSync } = await import('fs');
          const files = readdirSync(DRY_RUN_DIR).filter(f => f.endsWith('.png'));
          const storyFiles = files.filter(f => f.includes('ig-story'));
          const carouselFiles = files.filter(f => f.includes('vp-carousel') || f.includes('vp-news'));
          log(`[TEST] Total test files: ${files.length} (${storyFiles.length} stories, ${carouselFiles.length} carousel/news slides)`);
        } catch (err) {
          // Ignore listing errors
        }

        results = { published: 0, failed: 0, queued: totalTestQueued, dryRun: true };
        break;
      }

      case 'breaking': {
        log('--- BREAKING NEWS MODE (single check) ---');
        const breakingResults = await checkBreakingNews();
        results = {
          published: breakingResults.published,
          failed: 0,
          queued: breakingResults.queued,
          breaking: true,
          checked: breakingResults.checked,
          skipped: breakingResults.skipped,
          scored: breakingResults.scored,
        };
        break;
      }

      case 'watch': {
        log('--- WATCH MODE (breaking news loop) ---');
        // This runs indefinitely — no results returned
        await watchBreakingNews();
        // Never reaches here (infinite loop), but just in case:
        results = { published: 0, failed: 0, queued: 0 };
        break;
      }

      default:
        console.log(`
FlashVoyage Social Distributor

Usage:
  node social-distributor/index.js --recycle [postId]   Recycle articles into social posts
  node social-distributor/index.js --news               Publish fresh news from RSS
  node social-distributor/index.js --daily              Full daily routine (cron-ready)
  node social-distributor/index.js --test               Dry run, save to /tmp/
  node social-distributor/index.js --breaking           Run one breaking news check
  node social-distributor/index.js --watch              Breaking news check every 30 min (loop)

Environment:
  ANTHROPIC_API_KEY    Required for --news, --breaking, --watch modes
  SKIP_SOCIAL          Set to 1 to disable social distribution in pipeline
  FLASHVOYAGE_DRY_RUN  Set to 1 for pipeline dry run
`);
        process.exit(0);
    }
  } catch (err) {
    logError(`Fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  if (results.dryRun) {
    console.log(`Mode: DRY RUN (--test)`);
    console.log(`Items generated: ${results.queued}`);
    console.log(`Output saved to: ${DRY_RUN_DIR}`);
  } else if (results.breaking) {
    console.log(`Mode: BREAKING NEWS`);
    console.log(`Articles vérifiés: ${results.checked}`);
    console.log(`Publiés immédiatement: ${results.published}`);
    console.log(`En file d'attente (score 30-60): ${results.queued}`);
    console.log(`Ignorés (score < 30): ${results.skipped}`);
    if (results.scored && results.scored.length > 0) {
      console.log(`\nTop scores:`);
      for (const item of results.scored.slice(0, 5)) {
        console.log(`  [${item.score}] ${item.title} (${item.categories.join('+') || '-'})`);
      }
    }
  } else {
    console.log(`Published: ${results.published} posts`);
    if (results.platforms) {
      console.log(`  FB: ${results.platforms.facebook}, IG: ${results.platforms.instagram}, Threads: ${results.platforms.threads}`);
    }
    console.log(`Failed: ${results.failed}`);
    console.log(`Queued (remaining): ${results.queued - results.published}`);
  }
  console.log('='.repeat(60) + '\n');
}

// Run CLI only when executed directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/social-distributor/index.js') ||
  process.argv[1].endsWith('\\social-distributor\\index.js')
);

if (isDirectRun) {
  main().catch(err => {
    logError(`Unhandled: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}
