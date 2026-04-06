#!/usr/bin/env node

/**
 * Cross-Platform Publisher — FlashVoyage Social Distributor
 *
 * Orchestrates ALL post-publish distribution actions across platforms.
 *
 * After a Reel is published on IG, this module:
 * 1. Publishes an auto-Story on IG with clickable link to the article
 * 2. Cross-posts the Reel to Facebook Page as a FB Reel (video_reels endpoint)
 * 3. Posts the caption to Threads (text + image)
 *
 * After an IG Post (carousel/image) is published:
 * 1. Publishes an auto-Story on IG with clickable link
 * 2. Cross-posts image to Facebook Page (photo + link in first comment)
 * 3. Posts caption to Threads (text + image)
 *
 * Design principles:
 * - One platform failing NEVER blocks the others (parallel with independent error handling)
 * - Every action returns a structured result: { success, data?, error? }
 * - All logs use the [CROSS-PUB] prefix for easy filtering
 */

import {
  publishStory as publishIGStory,
  addComment as addIGComment,
  uploadForIG,
  cleanupTempMedia as cleanupIGTempMedia,
} from './platforms/instagram.js';
import { publishPhoto, addComment } from './platforms/facebook.js';
import { publishPost as publishThreadsPost } from './platforms/threads.js';
import { ffmpeg } from './reels/core/ffmpeg.js';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Reel frame extraction (for Story promotion) ─────────────────────────────

/**
 * Extract a single PNG frame from a reel video at the given timestamp,
 * read it as a Buffer, and clean up the temp file.
 *
 * Used to create an IG Story that promotes a freshly-published reel:
 * instead of a random article photo, the Story shows an actual frame
 * from the reel itself. Timestamp defaults to ~3s, which is past any
 * intro hook and into the data-heavy body of our static reel formats
 * (cost-vs table, leaderboard top-10, best-time calendar).
 *
 * @param {string} videoPath - Absolute path to the reel mp4
 * @param {number} [timestampSec=3] - Seconds into the video
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function extractReelFrame(videoPath, timestampSec = 3) {
  const framePath = join('/tmp', `cross-pub-reel-frame-${Date.now()}.png`);
  try {
    await ffmpeg([
      '-ss', String(timestampSec),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      framePath,
    ]);
    if (!existsSync(framePath)) {
      throw new Error(`ffmpeg produced no output at ${framePath}`);
    }
    const buffer = readFileSync(framePath);
    try { unlinkSync(framePath); } catch {}
    console.log(`[CROSS-PUB] Extracted reel frame @ ${timestampSec}s (${(buffer.length / 1024).toFixed(0)} KB)`);
    return buffer;
  } catch (err) {
    try { if (existsSync(framePath)) unlinkSync(framePath); } catch {}
    throw err;
  }
}

const PAGE_ID = '1068729919650308';
const GRAPH_API = 'https://graph.facebook.com/v21.0';
const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const WP_AUTH = 'Basic ' + Buffer.from('admin7817:GjLl 9W0k lKwf LSOT PXur RYGR').toString('base64');

// ── UTM Helper ─────────────────────────────────────────────────────────────

/**
 * Add UTM tracking parameters to a URL for full-funnel GA4 attribution.
 * Only modifies flashvoyage.com URLs; returns other URLs unchanged.
 *
 * @param {string} url - The target URL
 * @param {Object} params - UTM parameters
 * @param {string} params.source - utm_source (e.g. 'instagram', 'facebook', 'threads')
 * @param {string} params.medium - utm_medium (e.g. 'story', 'post', 'reel')
 * @param {string} params.campaign - utm_campaign (e.g. 'reel_12345', 'article_678')
 * @param {string} [params.content] - utm_content (optional, for A/B testing)
 * @returns {string} URL with UTM parameters appended
 */
function addUTM(url, { source, medium, campaign, content }) {
  if (!url) return url;
  try {
    const u = new URL(url);
    // Only add UTM to flashvoyage.com URLs
    if (!u.hostname.includes('flashvoyage.com')) return url;
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', campaign);
    if (content) u.searchParams.set('utm_content', content);
    return u.toString();
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}

// ── Token helpers ───────────────────────────────────────────────────────────

/**
 * Load tokens from data/tokens.json
 * @returns {{ facebook: { token: string }, threads: { token: string } }}
 */
function loadTokens() {
  const tokensPath = join(__dirname, 'data', 'tokens.json');
  return JSON.parse(readFileSync(tokensPath, 'utf-8'));
}

// ── WordPress media helpers (for Story thumbnails) ──────────────────────────

/**
 * Upload an image buffer to WordPress for a public URL (used for Story thumbnails)
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} filename - Filename
 * @returns {Promise<{ wpMediaId: number, publicUrl: string }>}
 */
async function uploadImageToWP(imageBuffer, filename = 'cross-pub-temp.jpg') {
  const response = await fetch(`${WP_API}/media`, {
    method: 'POST',
    headers: {
      'Authorization': WP_AUTH,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'image/jpeg',
    },
    body: imageBuffer,
  });

  const data = await response.json();

  if (data.code || !data.id) {
    throw new Error(`WP upload failed: ${data.message || JSON.stringify(data)}`);
  }

  console.log(`[CROSS-PUB] Uploaded temp image to WP: id=${data.id}`);
  return { wpMediaId: data.id, publicUrl: data.source_url };
}

/**
 * Delete a temporary media from WordPress
 * @param {number} wpMediaId
 */
async function deleteFromWP(wpMediaId) {
  try {
    await fetch(`${WP_API}/media/${wpMediaId}?force=true`, {
      method: 'DELETE',
      headers: { 'Authorization': WP_AUTH },
    });
    console.log(`[CROSS-PUB] Cleaned up WP temp media: id=${wpMediaId}`);
  } catch (err) {
    console.warn(`[CROSS-PUB] Failed to clean up WP media ${wpMediaId}: ${err.message}`);
  }
}

// ── Facebook Reel publisher ─────────────────────────────────────────────────

/**
 * Publish a video as a Facebook Reel via the /{PAGE_ID}/video_reels endpoint.
 * Uses Meta's 3-phase upload flow (start → transfer → finish).
 *
 * @param {Object} params
 * @param {string} params.videoUrl - Public URL of the video file (Meta fetches it)
 * @param {string} params.description - Reel caption
 * @param {string} params.pageToken - Facebook Page access token
 * @returns {Promise<{ reelId: string }>}
 */
async function publishFBReel({ videoUrl, description, pageToken }) {
  const base = `${GRAPH_API}/${PAGE_ID}/video_reels`;

  // Phase 1: start — get upload session + video_id
  const startRes = await fetch(`${base}?upload_phase=start&access_token=${pageToken}`, {
    method: 'POST',
  });
  const startData = await startRes.json();
  if (startData.error || !startData.video_id) {
    throw new Error(`FB video_reels start failed: ${startData.error?.message || 'no video_id'} (code ${startData.error?.code || 'n/a'})`);
  }
  const videoId = startData.video_id;
  const uploadUrl = startData.upload_url;
  console.log(`[CROSS-PUB] FB Reel start: video_id=${videoId}`);

  // Phase 2: transfer — tell Meta to fetch the hosted video via file_url header
  const transferRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `OAuth ${pageToken}`,
      'file_url': videoUrl,
    },
  });
  const transferData = await transferRes.json();
  if (transferData.error || transferData.success === false) {
    throw new Error(`FB video_reels transfer failed: ${transferData.error?.message || JSON.stringify(transferData)}`);
  }
  console.log(`[CROSS-PUB] FB Reel transfer OK`);

  // Phase 3: finish — publish
  const finishParams = new URLSearchParams({
    upload_phase: 'finish',
    video_id: videoId,
    video_state: 'PUBLISHED',
    description: description || '',
    access_token: pageToken,
  });
  const finishRes = await fetch(`${base}?${finishParams}`, { method: 'POST' });
  const finishData = await finishRes.json();
  if (finishData.error || finishData.success === false) {
    throw new Error(`FB video_reels finish failed: ${finishData.error?.message || JSON.stringify(finishData)} (code ${finishData.error?.code || 'n/a'})`);
  }

  console.log(`[CROSS-PUB] FB Reel published: ${videoId}`);
  return { reelId: videoId };
}

// ── Helper: safe execution wrapper ──────────────────────────────────────────

/**
 * Detect the well-known Meta transient "code 2" unexpected-error that
 * intermittently hits createContainer/createStoryContainer calls. A brief
 * retry usually clears it.
 */
function isTransientMetaError(err) {
  const msg = err?.message || '';
  return /\(code 2\)/.test(msg) || /unexpected error has occurred/i.test(msg);
}

/**
 * Execute a platform action safely. Returns a structured result whether it
 * succeeds or fails, so one platform crash never blocks the others.
 *
 * Retries up to `retries` extra times ONLY on transient Meta errors
 * (code 2 "unexpected error"). Non-transient errors fail immediately.
 *
 * @param {string} platform - Platform name for logging
 * @param {Function} fn - Async function to execute
 * @param {number} [retries=2] - Extra attempts on transient errors (total = retries + 1)
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function safeExec(platform, fn, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await fn();
      if (attempt > 0) {
        console.log(`[CROSS-PUB] ${platform}: SUCCESS (after ${attempt} retr${attempt > 1 ? 'ies' : 'y'})`);
      } else {
        console.log(`[CROSS-PUB] ${platform}: SUCCESS`);
      }
      return { success: true, data };
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isTransientMetaError(err)) {
        const backoffMs = 3000 * (attempt + 1); // 3s, 6s
        console.warn(`[CROSS-PUB] ${platform}: transient error, retrying in ${backoffMs}ms — ${err.message}`);
        await delay(backoffMs);
        continue;
      }
      break;
    }
  }
  console.error(`[CROSS-PUB] ${platform}: FAILED — ${lastErr.message}`);
  return { success: false, error: lastErr.message };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncate text to a max length, breaking at the last space before the limit.
 * Appends ellipsis if truncated.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function truncate(text, max = 500) {
  if (!text || text.length <= max) return text || '';
  const cut = text.lastIndexOf(' ', max - 1);
  return text.slice(0, cut > 0 ? cut : max - 1) + '\u2026';
}

// ── Main cross-publish functions ────────────────────────────────────────────

/**
 * Cross-publish after a Reel is published on Instagram.
 *
 * Runs all three distribution actions in parallel:
 * 1. Auto-Story on IG promoting the reel (frame of the reel + link sticker
 *    pointing to the reel permalink itself — drives initial watch signals
 *    to the IG algorithm, boosts reel reach)
 * 2. Cross-post as a Facebook Reel (video_reels endpoint)
 * 3. Post caption + reel thumbnail to Threads
 *
 * IMPORTANT: when `reelVideoPath` is provided, the Story uses a frame
 * extracted from the reel mp4 itself (and the link sticker points to
 * `reelPermalink`, not the article). This is the "share your reel to
 * your own story" growth pattern. The old thumbnailBuffer/articleUrl
 * path is kept as a fallback for legacy callers.
 *
 * @param {Object} params
 * @param {string} params.caption - The reel caption (used for FB + Threads)
 * @param {string} params.videoPublicUrl - Public URL of the video (from WP upload)
 * @param {string} [params.reelVideoPath] - Local path to the reel mp4 (for frame extraction — enables the "share to story" behavior)
 * @param {string} [params.reelPermalink] - IG permalink of the freshly-published reel (used as Story link sticker target)
 * @param {string} [params.articleUrl] - flashvoyage.com article URL (used in FB Reel + Threads captions)
 * @param {Buffer} [params.thumbnailBuffer] - LEGACY fallback: pre-extracted thumbnail (used if reelVideoPath is absent)
 * @param {string} [params.thumbnailPublicUrl] - LEGACY fallback: already-uploaded thumbnail URL
 * @param {string} [params.reelId] - Reel identifier for UTM campaign tracking on FB/Threads captions
 * @param {string} [params.pageToken] - FB page token (falls back to tokens.json)
 * @param {string} [params.threadsToken] - Threads token (falls back to tokens.json)
 * @returns {Promise<{ story: Object, facebook: Object, threads: Object }>}
 */
export async function crossPublishReel(params) {
  const {
    caption,
    videoPublicUrl,
    reelVideoPath = null,
    reelPermalink = null,
    articleUrl = null,
    thumbnailBuffer: legacyThumbnailBuffer = null,
    thumbnailPublicUrl = null,
    reelId = null,
    pageToken: pageTokenOverride,
    threadsToken: threadsTokenOverride,
  } = params;

  // Build UTM-tagged article URLs per platform (FB + Threads captions link
  // to the article for attribution tracking; the Story links to the reel
  // itself since its purpose is to boost the reel's reach, not article GA4)
  const campaignId = reelId || `reel_${Date.now()}`;
  const fbArticleUrl = articleUrl ? addUTM(articleUrl, { source: 'facebook', medium: 'reel', campaign: campaignId }) : null;
  const threadsArticleUrl = articleUrl ? addUTM(articleUrl, { source: 'threads', medium: 'post', campaign: campaignId }) : null;

  // Load tokens (allow overrides for testing)
  const tokens = loadTokens();
  const pageToken = pageTokenOverride || tokens.facebook?.token;
  const threadsToken = threadsTokenOverride || tokens.threads?.token;

  if (!pageToken) {
    throw new Error('[CROSS-PUB] No Facebook page token available. Check data/tokens.json');
  }
  if (!threadsToken) {
    throw new Error('[CROSS-PUB] No Threads token available. Check data/tokens.json');
  }

  console.log(`[CROSS-PUB] Starting cross-publish for Reel`);
  console.log(`[CROSS-PUB]   video: ${videoPublicUrl}`);
  console.log(`[CROSS-PUB]   reel permalink: ${reelPermalink || '(none)'}`);
  console.log(`[CROSS-PUB]   article: ${articleUrl || '(none)'}`);

  // Determine the Story thumbnail source.
  //   1. If reelVideoPath is given: extract a frame from the reel mp4 itself
  //      (new "share to story" behavior — Story shows the actual reel content)
  //   2. Else if legacyThumbnailBuffer given: use it (backward compat)
  //   3. Else: Story gets skipped
  let thumbnailBuffer = null;
  let thumbnailSource = 'none';
  if (reelVideoPath) {
    try {
      thumbnailBuffer = await extractReelFrame(reelVideoPath, 3);
      thumbnailSource = 'reel-frame';
    } catch (err) {
      console.warn(`[CROSS-PUB] Reel frame extraction failed: ${err.message}`);
      if (legacyThumbnailBuffer) {
        thumbnailBuffer = legacyThumbnailBuffer;
        thumbnailSource = 'legacy-buffer';
      }
    }
  } else if (legacyThumbnailBuffer) {
    thumbnailBuffer = legacyThumbnailBuffer;
    thumbnailSource = 'legacy-buffer';
  }
  console.log(`[CROSS-PUB] Story thumbnail source: ${thumbnailSource}`);

  // Upload the thumbnail via the FB CDN relay (WP → FB unpublished photo →
  // fbcdn.net URL). Meta blocks direct fetch of OVH-hosted WP URLs from its
  // image fetchers (Threads, IG feed), so we MUST relay through fbcdn.net.
  // Track both WP and FB photo IDs for cleanup.
  let storyWpMediaId = null;
  let storyFbPhotoId = null;
  let threadsImageUrl = thumbnailPublicUrl || null;

  if (thumbnailBuffer && !thumbnailPublicUrl) {
    try {
      const upload = await uploadForIG(thumbnailBuffer, `fv-cross-thumb-${Date.now()}.jpg`, pageToken);
      storyWpMediaId = upload.wpMediaId;
      storyFbPhotoId = upload.fbPhotoId;
      threadsImageUrl = upload.publicUrl; // fbcdn.net (or WP URL as fallback)
      console.log(`[CROSS-PUB] Thumbnail ready for reuse: ${threadsImageUrl.slice(0, 80)}...`);
    } catch (err) {
      console.warn(`[CROSS-PUB] Thumbnail upload failed, Story + Threads image will be skipped: ${err.message}`);
    }
  }

  // The Story's link sticker target: prefer the reel permalink (drives
  // reach to the reel), fall back to the article URL with UTM tagging.
  const storyLink = reelPermalink
    || (articleUrl ? addUTM(articleUrl, { source: 'instagram', medium: 'story', campaign: campaignId }) : null);

  // Run all three platforms in parallel
  const [storyResult, fbResult, threadsResult] = await Promise.all([
    // 1. IG Story — DISABLED (API Graph only supports image stories, not video;
    //    result was a static frame which looks weird vs native "share to story"
    //    which shows the reel video. Founder will share reels to story manually
    //    from the IG mobile app each morning — 3 taps, 5 seconds, much better UX).
    safeExec('IG Story', async () => {
      throw new Error('disabled: manual share-to-story preferred over API image story');
    }, 0),

    // 2. Facebook Reel (caption includes UTM link if article URL provided)
    safeExec('FB Reel', async () => {
      // Append UTM-tagged article link to description for FB Reel
      const fbDescription = fbArticleUrl
        ? `${caption}\n\n${fbArticleUrl}`
        : caption;
      return publishFBReel({
        videoUrl: videoPublicUrl,
        description: fbDescription,
        pageToken,
      });
    }),

    // 3. Threads post (gated: DISABLE_THREADS env var skips this entirely)
    // Growth Hacker reco: publishing Threads without insights scope =
    // publishing blind, burns content for zero learning signal. Re-enable
    // by clearing DISABLE_THREADS once a new Threads token with
    // threads_manage_insights scope is generated.
    process.env.DISABLE_THREADS === '1'
      ? safeExec('Threads', async () => {
          throw new Error('disabled: DISABLE_THREADS=1 (missing insights scope)');
        }, 0)
      : safeExec('Threads', async () => {
          const THREADS_MAX = 500;
          const urlSuffix = threadsArticleUrl ? `\n\n${threadsArticleUrl}` : '';
          const baseBudget = Math.max(100, THREADS_MAX - urlSuffix.length);
          const baseText = truncate(caption, baseBudget);
          const threadsText = `${baseText}${urlSuffix}`.slice(0, THREADS_MAX);
          return publishThreadsPost({
            text: threadsText,
            imageUrl: threadsImageUrl || undefined,
            threadsToken,
          });
        }),
  ]);

  // Cleanup: delete the temp thumbnail from both WP and FB (unpublished photo)
  if (storyWpMediaId || storyFbPhotoId) {
    await cleanupIGTempMedia(storyWpMediaId, storyFbPhotoId, pageToken);
  }

  const results = {
    story: storyResult,
    facebook: fbResult,
    threads: threadsResult,
  };

  // Summary log
  const successCount = [storyResult, fbResult, threadsResult].filter(r => r.success).length;
  console.log(`[CROSS-PUB] Reel cross-publish complete: ${successCount}/3 platforms succeeded`);

  return results;
}

/**
 * Cross-publish after an IG Post (carousel/image) is published.
 *
 * Runs all three distribution actions in parallel:
 * 1. Auto-Story on IG with clickable link sticker
 * 2. Cross-post image to Facebook Page (photo + link in first comment)
 * 3. Post caption + image to Threads
 *
 * @param {Object} params
 * @param {string} params.caption - The post caption
 * @param {string} params.imagePublicUrl - Public URL of the image (already on WP or CDN)
 * @param {string} [params.articleUrl] - flashvoyage.com article URL
 * @param {Buffer} [params.storyImageBuffer] - Custom image for Story (1080x1920). If null, skips Story.
 * @param {string} [params.articleId] - Article identifier for UTM campaign tracking
 * @param {string} [params.pageToken] - FB page token (falls back to tokens.json)
 * @param {string} [params.threadsToken] - Threads token (falls back to tokens.json)
 * @returns {Promise<{ story: Object, facebook: Object, threads: Object }>}
 */
export async function crossPublishPost(params) {
  const {
    caption,
    imagePublicUrl,
    articleUrl = null,
    storyImageBuffer = null,
    articleId = null,
    pageToken: pageTokenOverride,
    threadsToken: threadsTokenOverride,
  } = params;

  // Build UTM-tagged article URLs per platform
  const campaignId = articleId || `article_${Date.now()}`;
  const storyArticleUrl = articleUrl ? addUTM(articleUrl, { source: 'instagram', medium: 'story', campaign: campaignId }) : null;
  const fbArticleUrl = articleUrl ? addUTM(articleUrl, { source: 'facebook', medium: 'post', campaign: campaignId }) : null;
  const threadsArticleUrl = articleUrl ? addUTM(articleUrl, { source: 'threads', medium: 'post', campaign: campaignId }) : null;

  // Load tokens (allow overrides for testing)
  const tokens = loadTokens();
  const pageToken = pageTokenOverride || tokens.facebook?.token;
  const threadsToken = threadsTokenOverride || tokens.threads?.token;

  if (!pageToken) {
    throw new Error('[CROSS-PUB] No Facebook page token available. Check data/tokens.json');
  }
  if (!threadsToken) {
    throw new Error('[CROSS-PUB] No Threads token available. Check data/tokens.json');
  }

  console.log(`[CROSS-PUB] Starting cross-publish for Post`);
  console.log(`[CROSS-PUB]   image: ${imagePublicUrl}`);
  console.log(`[CROSS-PUB]   article: ${articleUrl || '(none)'}`);

  // Run all three platforms in parallel
  const [storyResult, fbResult, threadsResult] = await Promise.all([
    // 1. IG Story with link sticker (UTM: instagram/story)
    storyImageBuffer
      ? safeExec('IG Story', async () => {
          return publishIGStory({
            imageBuffer: storyImageBuffer,
            pageToken,
            link: storyArticleUrl,
          });
        })
      : safeExec('IG Story', async () => {
          throw new Error('No Story image buffer provided — Story skipped');
        }),

    // 2. Facebook Photo + UTM-tagged link in first comment
    safeExec('FB Photo', async () => {
      // Publish the photo without the link (link kills organic reach)
      const { postId } = await publishPhoto({
        imageUrl: imagePublicUrl,
        message: caption,
        pageToken,
      });

      // Add the UTM-tagged article link as first comment (if we have one)
      let commentId = null;
      if (fbArticleUrl) {
        await delay(2000); // Wait for FB to process the post
        const commentResult = await addComment({
          postId,
          message: fbArticleUrl,
          pageToken,
        });
        commentId = commentResult.commentId;
      }

      return { postId, commentId };
    }),

    // 3. Threads post (caption + image, UTM: threads/post)
    // Reserve dynamic space for the UTM URL (see crossPublishReel comment).
    safeExec('Threads', async () => {
      const THREADS_MAX = 500;
      const urlSuffix = threadsArticleUrl ? `\n\n${threadsArticleUrl}` : '';
      const baseBudget = Math.max(100, THREADS_MAX - urlSuffix.length);
      const baseText = truncate(caption, baseBudget);
      const threadsText = `${baseText}${urlSuffix}`.slice(0, THREADS_MAX);
      return publishThreadsPost({
        text: threadsText,
        imageUrl: imagePublicUrl,
        threadsToken,
      });
    }),
  ]);

  const results = {
    story: storyResult,
    facebook: fbResult,
    threads: threadsResult,
  };

  // Summary log
  const successCount = [storyResult, fbResult, threadsResult].filter(r => r.success).length;
  console.log(`[CROSS-PUB] Post cross-publish complete: ${successCount}/3 platforms succeeded`);

  return results;
}

/**
 * Convenience: cross-publish with automatic token loading and minimal params.
 * Determines whether to call crossPublishReel or crossPublishPost based on
 * the presence of videoPublicUrl.
 *
 * @param {Object} params
 * @param {'reel'|'post'} params.type - Content type
 * @param {string} params.caption - Caption text
 * @param {string} [params.videoPublicUrl] - Video URL (for reels)
 * @param {string} [params.imagePublicUrl] - Image URL (for posts)
 * @param {string} [params.articleUrl] - Article URL for link sticker
 * @param {Buffer} [params.thumbnailBuffer] - Thumbnail for Story (1080x1920)
 * @param {Buffer} [params.storyImageBuffer] - Story image for posts (1080x1920)
 * @returns {Promise<{ story: Object, facebook: Object, threads: Object }>}
 */
export { addUTM };

export async function crossPublish(params) {
  const { type, ...rest } = params;

  if (type === 'reel') {
    if (!rest.videoPublicUrl) {
      throw new Error('[CROSS-PUB] crossPublish(type=reel) requires videoPublicUrl');
    }
    return crossPublishReel(rest);
  }

  if (type === 'post') {
    if (!rest.imagePublicUrl) {
      throw new Error('[CROSS-PUB] crossPublish(type=post) requires imagePublicUrl');
    }
    return crossPublishPost(rest);
  }

  throw new Error(`[CROSS-PUB] Unknown content type: "${type}". Use "reel" or "post".`);
}
