/**
 * Reel Publisher — FlashVoyage Reels Module
 *
 * Publishes a composed Reel to Instagram via the Graph API.
 * Flow:
 * 1. Upload video to WordPress media (to get a public URL)
 * 2. POST /{IG_ID}/media with media_type=REELS
 * 3. Poll container status until FINISHED
 * 4. POST /{IG_ID}/media_publish
 * 5. Clean up WP media
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const IG_ID = '17841442283434789';
const PAGE_ID = '1068729919650308';
const GRAPH_API = 'https://graph.facebook.com/v21.0';
const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const WP_AUTH = 'Basic ' + Buffer.from('admin7817:GjLl 9W0k lKwf LSOT PXur RYGR').toString('base64');

// ── WP video upload (public URL for cross-publishing) ──────────────────────
// Used by cross-publisher.js after a successful IG publish to get a public
// URL that FB Graph's /video_reels endpoint can fetch. FB (unlike IG API)
// CAN reach OVH-hosted WP URLs, so no CDN relay is needed for this path.

export async function uploadVideoToWP(videoBuffer, filename) {
  const res = await fetch(`${WP_API}/media`, {
    method: 'POST',
    headers: {
      'Authorization': WP_AUTH,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'video/mp4',
    },
    body: videoBuffer,
  });
  const data = await res.json();
  if (data.code || !data.id) {
    throw new Error(`WP upload failed: ${data.message || JSON.stringify(data)}`);
  }
  return { wpMediaId: data.id, publicUrl: data.source_url };
}

export async function deleteWpVideo(wpMediaId) {
  if (!wpMediaId) return;
  const res = await fetch(`${WP_API}/media/${wpMediaId}?force=true`, {
    method: 'DELETE',
    headers: { 'Authorization': WP_AUTH },
  });
  if (!res.ok) {
    throw new Error(`WP delete failed: HTTP ${res.status}`);
  }
}

// ── Video upload via FB CDN relay (legacy, kept for fallback paths) ─────────
// Meta's IG API can't reach OVH-hosted WP URLs.
// Solution: WP upload → FB unpublished video → FB CDN URL → IG API
// NOTE: The current publishReel() uses resumable upload instead and does not
// call uploadVideoForIG. Kept here for reference / manual fallback.

async function uploadVideoForIG(videoBuffer, filename, pageToken) {
  // Step 1: Upload to WP to get a public URL
  const wpRes = await fetch(`${WP_API}/media`, {
    method: 'POST',
    headers: {
      'Authorization': WP_AUTH,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'video/mp4',
    },
    body: videoBuffer,
  });
  const wpData = await wpRes.json();
  if (wpData.code || !wpData.id) throw new Error(`WP upload failed: ${wpData.message || JSON.stringify(wpData)}`);
  console.log(`[REEL/PUB] WP upload: id=${wpData.id}, url=${wpData.source_url}`);

  // Step 2: Upload as unpublished FB video to get CDN URL
  const fbRes = await fetch(`${GRAPH_API}/${PAGE_ID}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_url: wpData.source_url,
      published: false,
      access_token: pageToken,
    }),
  });
  const fbData = await fbRes.json();

  if (fbData.error || !fbData.id) {
    console.warn(`[REEL/PUB] FB video relay failed: ${fbData.error?.message || 'unknown'}, falling back to WP URL`);
    return { wpMediaId: wpData.id, fbVideoId: null, publicUrl: wpData.source_url };
  }

  // Step 3: Get FB CDN URL from the video
  // Wait for FB to process the video
  await delay(5000);
  const videoRes = await fetch(`${GRAPH_API}/${fbData.id}?fields=source&access_token=${pageToken}`);
  const videoData = await videoRes.json();
  const cdnUrl = videoData.source;

  if (!cdnUrl) {
    console.warn(`[REEL/PUB] No CDN URL for FB video, falling back to WP URL`);
    return { wpMediaId: wpData.id, fbVideoId: fbData.id, publicUrl: wpData.source_url };
  }

  console.log(`[REEL/PUB] FB CDN relay OK: ${cdnUrl.slice(0, 80)}...`);
  return { wpMediaId: wpData.id, fbVideoId: fbData.id, publicUrl: cdnUrl };
}

async function cleanupMedia(wpMediaId, fbVideoId, pageToken) {
  if (wpMediaId) {
    try {
      await fetch(`${WP_API}/media/${wpMediaId}?force=true`, { method: 'DELETE', headers: { 'Authorization': WP_AUTH } });
      console.log(`[REEL/PUB] Cleaned up WP media: ${wpMediaId}`);
    } catch (err) { console.warn(`[REEL/PUB] WP cleanup failed: ${err.message}`); }
  }
  if (fbVideoId && pageToken) {
    try {
      await fetch(`${GRAPH_API}/${fbVideoId}?access_token=${pageToken}`, { method: 'DELETE' });
      console.log(`[REEL/PUB] Cleaned up FB video: ${fbVideoId}`);
    } catch (err) { console.warn(`[REEL/PUB] FB cleanup failed: ${err.message}`); }
  }
}

// ── IG Reel container ────────────────────────────────────────────────────────

async function createReelContainer(videoUrl, caption, pageToken) {
  const url = `${GRAPH_API}/${IG_ID}/media`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_url: videoUrl,
      caption,
      media_type: 'REELS',
      share_to_feed: true,
      access_token: pageToken,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`IG createReelContainer failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[REEL/PUB] Reel container created: ${data.id}`);
  return data.id;
}

async function checkContainerStatus(containerId, pageToken) {
  const url = `${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${pageToken}`;
  const response = await fetch(url);
  const data = await response.json();
  return { status: data.status, statusCode: data.status_code };
}

async function publishContainer(containerId, pageToken) {
  const url = `${GRAPH_API}/${IG_ID}/media_publish`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: pageToken,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`IG publishReel failed: ${data.error.message} (code ${data.error.code})`);
  }

  return data.id;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getPageToken() {
  try {
    const tokensPath = join(__dirname, '..', 'data', 'tokens.json');
    const tokens = JSON.parse(readFileSync(tokensPath, 'utf-8'));
    // IG uses the Facebook page token
    return tokens.facebook?.token || null;
  } catch {
    return null;
  }
}

// ── Main publish function ────────────────────────────────────────────────────

/**
 * Publish a Reel to Instagram.
 *
 * @param {Buffer} videoBuffer - The composed video file as a Buffer
 * @param {string} caption - Post caption
 * @param {string[]} hashtags - Array of hashtags
 * @param {string} [pageToken] - Override page token (optional)
 * @returns {Promise<{ reelId: string, permalink: string|null }>}
 */
export async function publishReel(videoBuffer, caption, hashtags, pageToken) {
  const token = pageToken || getPageToken();
  if (!token) {
    throw new Error('No IG page token available. Check data/tokens.json');
  }

  const fullCaption = `${caption}\n\n${hashtags.join(' ')}`.slice(0, 2200);
  try {
    // 1. Create IG REELS container with resumable upload (no URL needed)
    console.log(`[REEL/PUB] Starting resumable upload (${videoBuffer.length} bytes)...`);

    // Step 1a: Initialize upload session
    const initRes = await fetch(`${GRAPH_API}/${IG_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'REELS',
        upload_type: 'resumable',
        caption: fullCaption,
        share_to_feed: true,
        access_token: token,
      }),
    });
    const initData = await initRes.json();
    if (initData.error) throw new Error(`IG init failed: ${initData.error.message}`);
    const containerId = initData.id;
    const uploadUri = initData.uri;
    console.log(`[REEL/PUB] Container: ${containerId}`);

    // Step 1b: Upload video bytes directly to IG
    const uploadRes = await fetch(uploadUri, {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${token}`,
        'offset': '0',
        'file_size': String(videoBuffer.length),
        'Content-Type': 'video/mp4',
      },
      body: videoBuffer,
    });
    const uploadData = await uploadRes.json();
    console.log(`[REEL/PUB] Upload complete:`, uploadData.success ? 'OK' : JSON.stringify(uploadData));

    // 3. Wait for IG to process the video (longer for video than images)
    console.log(`[REEL/PUB] Waiting for IG to process video...`);
    await delay(15_000);

    // 4. Poll container status — up to 2 minutes (IG can be slow)
    let attempts = 0;
    const maxAttempts = 20;
    let containerReady = false;
    while (attempts < maxAttempts) {
      const status = await checkContainerStatus(containerId, token);
      console.log(`[REEL/PUB] Container status: ${status.statusCode} (attempt ${attempts + 1}/${maxAttempts})`);

      if (status.statusCode === 'FINISHED') { containerReady = true; break; }
      if (status.statusCode === 'ERROR') {
        throw new Error(`IG reel processing failed: ${status.status}`);
      }

      attempts++;
      await delay(6_000);
    }

    if (!containerReady) {
      console.warn(`[REEL/PUB] Container still processing after ${maxAttempts} attempts. Retrying one last time after 30s...`);
      await delay(30_000);
      const finalStatus = await checkContainerStatus(containerId, token);
      if (finalStatus.statusCode !== 'FINISHED') {
        throw new Error(`IG reel processing timed out after ${maxAttempts} attempts + 30s retry (status: ${finalStatus.statusCode})`);
      }
    }

    // 5. Publish
    const reelId = await publishContainer(containerId, token);
    console.log(`[REEL/PUB] Reel published! ID: ${reelId}`);

    // Try to get permalink
    let permalink = null;
    try {
      const mediaRes = await fetch(`${GRAPH_API}/${reelId}?fields=permalink&access_token=${token}`);
      const mediaData = await mediaRes.json();
      permalink = mediaData.permalink || null;
    } catch { /* non-fatal */ }

    // 6. Send to Telegram for manual TikTok repost
    await sendToTelegram(videoBuffer, fullCaption, permalink).catch(err =>
      console.warn(`[REEL/PUB] Telegram send failed (non-fatal): ${err.message}`)
    );

    return { reelId, permalink };
  } catch (err) {
    throw err;
  }
}

/**
 * Send reel video + caption to Telegram bot for manual TikTok repost.
 */
async function sendToTelegram(videoBuffer, caption, permalink) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const tgCaption = `${caption}\n\n${permalink ? '📱 IG: ' + permalink : ''}`.slice(0, 1024);

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('video', new Blob([videoBuffer], { type: 'video/mp4' }), 'reel.mp4');
  form.append('caption', tgCaption);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, { method: 'POST', body: form });
  const data = await res.json();
  if (data.ok) console.log(`[REEL/PUB] Telegram: video sent to chat ${chatId}`);
  else throw new Error(data.description || 'Telegram API error');
}
