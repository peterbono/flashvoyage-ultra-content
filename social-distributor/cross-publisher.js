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

import { publishStory as publishIGStory, addComment as addIGComment } from './platforms/instagram.js';
import { publishPhoto, addComment } from './platforms/facebook.js';
import { publishPost as publishThreadsPost } from './platforms/threads.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
 * This is distinct from regular FB photo/video posts.
 *
 * @param {Object} params
 * @param {string} params.videoUrl - Public URL of the video file
 * @param {string} params.description - Reel caption
 * @param {string} params.pageToken - Facebook Page access token
 * @returns {Promise<{ reelId: string }>}
 */
async function publishFBReel({ videoUrl, description, pageToken }) {
  const url = `${GRAPH_API}/${PAGE_ID}/video_reels`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_url: videoUrl,
      description,
      access_token: pageToken,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`FB video_reels failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[CROSS-PUB] FB Reel published: ${data.id}`);
  return { reelId: data.id };
}

// ── Helper: safe execution wrapper ──────────────────────────────────────────

/**
 * Execute a platform action safely. Returns a structured result whether it
 * succeeds or fails, so one platform crash never blocks the others.
 *
 * @param {string} platform - Platform name for logging
 * @param {Function} fn - Async function to execute
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function safeExec(platform, fn) {
  try {
    const data = await fn();
    console.log(`[CROSS-PUB] ${platform}: SUCCESS`);
    return { success: true, data };
  } catch (err) {
    console.error(`[CROSS-PUB] ${platform}: FAILED — ${err.message}`);
    return { success: false, error: err.message };
  }
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
 * 1. Auto-Story on IG with clickable link sticker to the article
 * 2. Cross-post as a Facebook Reel (video_reels endpoint)
 * 3. Post caption + thumbnail to Threads
 *
 * @param {Object} params
 * @param {string} params.caption - The reel caption (used for FB + Threads)
 * @param {string} params.videoPublicUrl - Public URL of the video (from WP upload)
 * @param {string} [params.articleUrl] - flashvoyage.com article URL (for Story link sticker)
 * @param {Buffer} [params.thumbnailBuffer] - A frame from the reel for Story (PNG 1080x1920)
 * @param {string} [params.thumbnailPublicUrl] - Public URL of the thumbnail (if already uploaded)
 * @param {string} [params.reelId] - Reel identifier for UTM campaign tracking
 * @param {string} [params.pageToken] - FB page token (falls back to tokens.json)
 * @param {string} [params.threadsToken] - Threads token (falls back to tokens.json)
 * @returns {Promise<{ story: Object, facebook: Object, threads: Object }>}
 */
export async function crossPublishReel(params) {
  const {
    caption,
    videoPublicUrl,
    articleUrl = null,
    thumbnailBuffer = null,
    thumbnailPublicUrl = null,
    reelId = null,
    pageToken: pageTokenOverride,
    threadsToken: threadsTokenOverride,
  } = params;

  // Build UTM-tagged article URLs per platform
  const campaignId = reelId || `reel_${Date.now()}`;
  const storyArticleUrl = articleUrl ? addUTM(articleUrl, { source: 'instagram', medium: 'story', campaign: campaignId }) : null;
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
  console.log(`[CROSS-PUB]   article: ${articleUrl || '(none)'}`);

  // We may need to upload the thumbnail to WP for IG Story + Threads
  // Track any temp WP media IDs for cleanup
  let storyWpMediaId = null;
  let threadsImageUrl = thumbnailPublicUrl || null;

  // If we have a thumbnail buffer but no public URL, upload it to WP once
  // and reuse the URL for both Story and Threads
  if (thumbnailBuffer && !thumbnailPublicUrl) {
    try {
      const wp = await uploadImageToWP(thumbnailBuffer, `fv-cross-thumb-${Date.now()}.jpg`);
      storyWpMediaId = wp.wpMediaId;
      threadsImageUrl = wp.publicUrl;
      console.log(`[CROSS-PUB] Thumbnail uploaded to WP for reuse: ${wp.publicUrl}`);
    } catch (err) {
      console.warn(`[CROSS-PUB] Thumbnail upload failed, Story + Threads image will be skipped: ${err.message}`);
    }
  }

  // Run all three platforms in parallel
  const [storyResult, fbResult, threadsResult] = await Promise.all([
    // 1. IG Story with link sticker (UTM: instagram/story)
    (thumbnailBuffer || threadsImageUrl)
      ? safeExec('IG Story', async () => {
          if (!threadsImageUrl) throw new Error('No thumbnail available for Story');
          return publishIGStory({
            imageBuffer: thumbnailBuffer,
            pageToken,
            link: storyArticleUrl,
          });
        })
      : safeExec('IG Story', async () => {
          throw new Error('No thumbnail provided — Story skipped');
        }),

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

    // 3. Threads post (caption + thumbnail image, UTM: threads/post)
    safeExec('Threads', async () => {
      // Append UTM-tagged article link to Threads text
      const baseText = truncate(caption, threadsArticleUrl ? 450 : 500);
      const threadsText = threadsArticleUrl
        ? `${baseText}\n\n${threadsArticleUrl}`
        : baseText;
      return publishThreadsPost({
        text: threadsText,
        imageUrl: threadsImageUrl || undefined,
        threadsToken,
      });
    }),
  ]);

  // Cleanup: delete temp WP thumbnail if we uploaded one
  // (Note: the IG Story's publishStory also does its own WP upload/cleanup internally)
  if (storyWpMediaId) {
    await deleteFromWP(storyWpMediaId);
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
    safeExec('Threads', async () => {
      // Append UTM-tagged article link to Threads text
      const baseText = truncate(caption, threadsArticleUrl ? 450 : 500);
      const threadsText = threadsArticleUrl
        ? `${baseText}\n\n${threadsArticleUrl}`
        : baseText;
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
