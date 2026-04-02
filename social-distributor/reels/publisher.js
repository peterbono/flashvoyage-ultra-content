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

// ── Video upload via FB CDN relay ───────────────────────────────────────────
// Meta's IG API can't reach OVH-hosted WP URLs.
// Solution: WP upload → FB unpublished video → FB CDN URL → IG API

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
  let wpMediaId = null;
  let fbVideoId = null;

  try {
    // 1. Upload video via FB CDN relay
    const upload = await uploadVideoForIG(videoBuffer, `fv-reel-${Date.now()}.mp4`, token);
    wpMediaId = upload.wpMediaId;
    fbVideoId = upload.fbVideoId;

    // 2. Create IG REELS container
    const containerId = await createReelContainer(upload.publicUrl, fullCaption, token);

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

    return { reelId, permalink };
  } finally {
    await cleanupMedia(wpMediaId, fbVideoId, token);
  }
}
