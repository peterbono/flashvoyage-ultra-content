#!/usr/bin/env node

/**
 * Queue Manager - FlashVoyage Social Distributor
 * Manages publishing queue with per-platform rate limiting
 *
 * Rate limits (Meta API):
 *   Facebook:  200 posts/hour  (generous)
 *   Instagram:  25 posts/day   (strict! IG is the bottleneck)
 *   Threads:   250 posts/day
 *
 * Data files:
 *   data/queue.json          - Pending publish queue
 *   data/post-history.jsonl  - Append-only log of published posts
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { publishPhotoWithLink, publishStory as publishFBStory } from './platforms/facebook.js';
import { publishPost as publishInstagram, publishStory as publishIGStory } from './platforms/instagram.js';
import { publishPost as publishThreads } from './platforms/threads.js';
import { savePostMapping } from './webhooks/post-article-map.js';

// WP media upload for getting public URLs (needed by FB and Stories)
const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const WP_AUTH = 'Basic ' + Buffer.from('admin7817:GjLl 9W0k lKwf LSOT PXur RYGR').toString('base64');

async function uploadToWP(imageBuffer, filename = 'social-temp.jpg') {
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
  return { wpMediaId: data.id, publicUrl: data.source_url };
}

async function deleteFromWP(wpMediaId) {
  try {
    await fetch(`${WP_API}/media/${wpMediaId}?force=true`, {
      method: 'DELETE',
      headers: { 'Authorization': WP_AUTH },
    });
  } catch (err) {
    console.warn(`[QUEUE/WP] Failed to clean up temp media ${wpMediaId}: ${err.message}`);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const QUEUE_PATH = join(DATA_DIR, 'queue.json');
const HISTORY_PATH = join(DATA_DIR, 'post-history.jsonl');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// --- Rate Limits ---

const RATE_LIMITS = {
  facebook:  { maxPerHour: 200, maxPerDay: null },
  instagram: { maxPerHour: null, maxPerDay: 25 },
  threads:   { maxPerHour: null, maxPerDay: 250 },
};

/**
 * Count how many posts were published for a platform in a given time window
 * Reads from post-history.jsonl (append-only log)
 * @param {string} platform
 * @param {number} windowMs - Time window in milliseconds
 * @returns {number}
 */
function countRecent(platform, windowMs) {
  if (!existsSync(HISTORY_PATH)) return 0;

  const cutoff = Date.now() - windowMs;
  const lines = readFileSync(HISTORY_PATH, 'utf-8').trim().split('\n').filter(Boolean);
  let count = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.platform === platform && new Date(entry.publishedAt).getTime() >= cutoff) {
        count++;
      }
    } catch {
      // Skip malformed lines
    }
  }

  return count;
}

/**
 * Check if we can publish to a platform right now
 * @param {string} platform
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkRateLimit(platform) {
  const limits = RATE_LIMITS[platform];
  if (!limits) return { allowed: true };

  // Check hourly limit
  if (limits.maxPerHour) {
    const hourCount = countRecent(platform, 60 * 60 * 1000);
    if (hourCount >= limits.maxPerHour) {
      return { allowed: false, reason: `${platform}: hourly limit reached (${hourCount}/${limits.maxPerHour})` };
    }
  }

  // Check daily limit
  if (limits.maxPerDay) {
    const dayCount = countRecent(platform, 24 * 60 * 60 * 1000);
    if (dayCount >= limits.maxPerDay) {
      return { allowed: false, reason: `${platform}: daily limit reached (${dayCount}/${limits.maxPerDay})` };
    }
  }

  return { allowed: true };
}

/**
 * Log a successful publish to post-history.jsonl
 * @param {Object} entry
 */
function logPublish(entry) {
  const line = JSON.stringify({
    ...entry,
    publishedAt: new Date().toISOString(),
  });
  appendFileSync(HISTORY_PATH, line + '\n', 'utf-8');
}

// --- Queue Operations ---

/**
 * Load the queue from disk
 * @returns {Array}
 */
function loadQueue() {
  if (!existsSync(QUEUE_PATH)) return [];
  try {
    return JSON.parse(readFileSync(QUEUE_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Save the queue to disk
 * @param {Array} queue
 */
function saveQueue(queue) {
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf-8');
}

/**
 * Add posts to the publishing queue
 * Each post should specify: platform, content, and optional scheduledTime
 *
 * @param {Array<Object>} posts
 * @param {string} posts[].platform - 'facebook' | 'instagram' | 'threads'
 * @param {string} [posts[].imageUrl] - Public image URL (FB, Threads)
 * @param {Buffer} [posts[].imageBuffer] - Raw image data (IG)
 * @param {string} posts[].message - Post text / caption
 * @param {string} [posts[].linkComment] - Link for FB first comment
 * @param {string} [posts[].scheduledTime] - ISO timestamp for scheduled publishing
 * @param {Object} [posts[].meta] - Arbitrary metadata (article slug, etc.)
 * @returns {number} Number of posts added
 */
export async function addToQueue(posts) {
  const queue = loadQueue();

  for (const post of posts) {
    queue.push({
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      platform: post.platform,
      action: post.action || 'post', // 'post' or 'story'
      imageUrl: post.imageUrl || null,
      imageBuffer: post.imageBuffer ? post.imageBuffer.toString('base64') : null,
      message: post.message || '',
      linkComment: post.linkComment || null,
      scheduledTime: post.scheduledTime || null,
      meta: post.meta || {},
      status: 'pending',
      addedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    });
  }

  saveQueue(queue);
  console.log(`[QUEUE] Added ${posts.length} post(s), queue size: ${queue.length}`);
  return posts.length;
}

/**
 * Process the next eligible items in the queue
 * Respects rate limits and scheduled times
 *
 * @param {Object} tokens - { facebook: string, instagram: string, threads: string }
 * @returns {Promise<{ published: Array, failed: Array, remaining: Array }>}
 */
export async function processQueue(tokens) {
  const queue = loadQueue();
  const now = new Date();

  const published = [];
  const failed = [];
  const remaining = [];

  for (const item of queue) {
    // Skip already processed
    if (item.status === 'published' || item.status === 'failed_permanent') {
      continue;
    }

    // Skip if scheduled for the future
    if (item.scheduledTime && new Date(item.scheduledTime) > now) {
      remaining.push(item);
      continue;
    }

    // Check rate limit
    const rateCheck = checkRateLimit(item.platform);
    if (!rateCheck.allowed) {
      console.log(`[QUEUE] Skipping ${item.id}: ${rateCheck.reason}`);
      remaining.push(item);
      continue;
    }

    // Check token availability
    const token = tokens[item.platform];
    if (!token) {
      console.warn(`[QUEUE] No token for ${item.platform}, skipping ${item.id}`);
      remaining.push(item);
      continue;
    }

    // Attempt to publish
    try {
      let result;
      const action = item.action || 'post';

      // Reconstruct imageBuffer from base64 if stored
      const imageBuffer = item.imageBuffer
        ? Buffer.from(item.imageBuffer, 'base64')
        : null;

      switch (item.platform) {
        case 'facebook': {
          // FB needs a public imageUrl — upload to WP if we only have a buffer
          let fbImageUrl = item.imageUrl;
          let fbWpMediaId = null;

          if (!fbImageUrl && imageBuffer) {
            const wp = await uploadToWP(imageBuffer, `fv-fb-${Date.now()}.jpg`);
            fbImageUrl = wp.publicUrl;
            fbWpMediaId = wp.wpMediaId;
            console.log(`[QUEUE] Uploaded FB image to WP: ${fbImageUrl}`);
          }

          if (!fbImageUrl) {
            throw new Error('Facebook requires an image (imageUrl or imageBuffer)');
          }

          if (action === 'story') {
            result = await publishFBStory({
              imageUrl: fbImageUrl,
              pageToken: token,
            });
          } else {
            result = await publishPhotoWithLink({
              imageUrl: fbImageUrl,
              message: item.message,
              linkComment: item.linkComment || '',
              pageToken: token,
            });
          }

          // Clean up temp WP media if we uploaded one
          if (fbWpMediaId) {
            await deleteFromWP(fbWpMediaId);
          }
          break;
        }

        case 'instagram': {
          if (!imageBuffer) {
            throw new Error('Instagram requires imageBuffer (not imageUrl)');
          }

          if (action === 'story') {
            result = await publishIGStory({
              imageBuffer,
              pageToken: token,
            });
          } else {
            result = await publishInstagram({
              imageBuffer,
              caption: item.message,
              pageToken: token,
            });
          }
          break;
        }

        case 'threads':
          result = await publishThreads({
            text: item.message,
            imageUrl: item.imageUrl || undefined,
            threadsToken: token,
          });
          break;

        default:
          throw new Error(`Unknown platform: ${item.platform}`);
      }

      // Success
      item.status = 'published';
      item.publishedAt = new Date().toISOString();
      item.result = result;

      logPublish({
        platform: item.platform,
        queueId: item.id,
        result,
        meta: item.meta,
      });

      // Save post-article mapping for IG posts (for "Commente INFO" webhook)
      if (item.platform === 'instagram' && (item.action || 'post') === 'post' && result?.mediaId) {
        const articleUrl = item.meta?.slug || '';
        const title = item.meta?.title || '';
        if (articleUrl) {
          try {
            savePostMapping(result.mediaId, articleUrl, title);
          } catch (mapErr) {
            console.warn(`[QUEUE] Failed to save post mapping: ${mapErr.message}`);
          }
        }
      }

      published.push(item);
      console.log(`[QUEUE] Published ${item.id} to ${item.platform}`);

    } catch (err) {
      item.attempts++;
      item.lastError = err.message;

      // Permanent failure after 3 attempts
      if (item.attempts >= 3) {
        item.status = 'failed_permanent';
        failed.push(item);
        console.error(`[QUEUE] Permanently failed ${item.id}: ${err.message}`);
      } else {
        item.status = 'pending';
        remaining.push(item);
        console.warn(`[QUEUE] Retry ${item.attempts}/3 for ${item.id}: ${err.message}`);
      }
    }

    // Small delay between publishes to be respectful
    await delay(1000);
  }

  // Save updated queue (only keep remaining + failed for review)
  saveQueue([...remaining, ...failed.filter(f => f.status === 'failed_permanent')]);

  console.log(`[QUEUE] Processed: ${published.length} published, ${failed.length} failed, ${remaining.length} remaining`);
  return { published, failed, remaining };
}

/**
 * Get publishing statistics
 * @returns {{ today: { facebook: number, instagram: number, threads: number }, total: number, lastPublished: string|null }}
 */
export function getStats() {
  const dayMs = 24 * 60 * 60 * 1000;
  const queue = loadQueue();

  const today = {
    facebook: countRecent('facebook', dayMs),
    instagram: countRecent('instagram', dayMs),
    threads: countRecent('threads', dayMs),
  };

  // Total from history
  let total = 0;
  let lastPublished = null;

  if (existsSync(HISTORY_PATH)) {
    const lines = readFileSync(HISTORY_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    total = lines.length;

    // Last entry
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        lastPublished = last.publishedAt;
      } catch {
        // Ignore
      }
    }
  }

  const pending = queue.filter(q => q.status === 'pending').length;

  return {
    today,
    limits: {
      facebook: `${today.facebook}/${RATE_LIMITS.facebook.maxPerHour || '-'}/h`,
      instagram: `${today.instagram}/${RATE_LIMITS.instagram.maxPerDay}/day`,
      threads: `${today.threads}/${RATE_LIMITS.threads.maxPerDay}/day`,
    },
    total,
    pending,
    lastPublished,
  };
}

/**
 * Clear completed or failed items from the queue
 * @param {string} [status] - 'failed_permanent' to clear only failed, omit to clear all non-pending
 * @returns {number} Number of items removed
 */
export function clearQueue(status) {
  const queue = loadQueue();
  const before = queue.length;

  const filtered = status
    ? queue.filter(q => q.status !== status)
    : queue.filter(q => q.status === 'pending');

  saveQueue(filtered);
  const removed = before - filtered.length;
  console.log(`[QUEUE] Cleared ${removed} item(s)`);
  return removed;
}

// --- Helpers ---

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
