#!/usr/bin/env node

/**
 * Instagram Publisher - FlashVoyage Social Distributor
 * Publishes posts to Instagram Business via Graph API v21.0
 *
 * CRITICAL: Instagram requires a PUBLIC image URL. Flow:
 * 1. Upload image buffer to WordPress media library (temp)
 * 2. Get the public URL from WP
 * 3. Create IG media container with that URL
 * 4. Wait for IG processing
 * 5. Publish the container
 * 6. Delete the temp WP media to keep library clean
 */

const IG_ID = '17841442283434789';
const GRAPH_API = 'https://graph.facebook.com/v21.0';
const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const WP_AUTH = 'Basic ' + Buffer.from('admin7817:GjLl 9W0k lKwf LSOT PXur RYGR').toString('base64');

/**
 * Upload an image buffer to WordPress media library
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} filename - Filename for the upload
 * @returns {Promise<{wpMediaId: number, publicUrl: string}>}
 */
async function uploadToWordPress(imageBuffer, filename = 'social-temp.jpg') {
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

  console.log(`[IG/WP] Uploaded temp media: id=${data.id}, url=${data.source_url}`);
  return { wpMediaId: data.id, publicUrl: data.source_url };
}

/**
 * Delete a temporary media from WordPress
 * @param {number} wpMediaId - WordPress media ID to delete
 */
async function deleteFromWordPress(wpMediaId) {
  try {
    await fetch(`${WP_API}/media/${wpMediaId}?force=true`, {
      method: 'DELETE',
      headers: { 'Authorization': WP_AUTH },
    });
    console.log(`[IG/WP] Cleaned up temp media: id=${wpMediaId}`);
  } catch (err) {
    // Non-fatal: just log, don't block the publish flow
    console.warn(`[IG/WP] Failed to clean up temp media ${wpMediaId}: ${err.message}`);
  }
}

/**
 * Create an Instagram media container
 * @param {string} imageUrl - Public URL of the image
 * @param {string} caption - Post caption
 * @param {string} pageToken - Facebook Page access token (used for IG API)
 * @returns {Promise<string>} creation_id
 */
async function createMediaContainer(imageUrl, caption, pageToken) {
  const url = `${GRAPH_API}/${IG_ID}/media`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: pageToken,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`IG createMedia failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[IG] Media container created: ${data.id}`);
  return data.id;
}

/**
 * Publish a media container to Instagram
 * @param {string} creationId - Container ID from createMediaContainer
 * @param {string} pageToken - Facebook Page access token
 * @returns {Promise<string>} media_id of the published post
 */
async function publishMediaContainer(creationId, pageToken) {
  const url = `${GRAPH_API}/${IG_ID}/media_publish`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: pageToken,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`IG publishMedia failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[IG] Post published: ${data.id}`);
  return data.id;
}

/**
 * Check the status of a media container (for polling if needed)
 * @param {string} creationId - Container ID
 * @param {string} pageToken - Access token
 * @returns {Promise<{status: string, statusCode: string}>}
 */
async function checkContainerStatus(creationId, pageToken) {
  const url = `${GRAPH_API}/${creationId}?fields=status_code&access_token=${pageToken}`;
  const response = await fetch(url);
  const data = await response.json();
  return { status: data.status, statusCode: data.status_code };
}

/**
 * Full Instagram publish flow
 * Handles: WP upload -> IG container -> wait -> publish -> WP cleanup
 *
 * @param {Object} params
 * @param {Buffer} params.imageBuffer - Raw image data
 * @param {string} params.caption - Post caption (max 2200 chars, 30 hashtags)
 * @param {string} params.pageToken - Facebook Page access token
 * @returns {Promise<{mediaId: string}>}
 */
export async function publishPost({ imageBuffer, caption, pageToken }) {
  let wpMediaId = null;

  try {
    // 1. Upload image to WP to get a public URL
    const wp = await uploadToWordPress(imageBuffer, `fv-social-${Date.now()}.jpg`);
    wpMediaId = wp.wpMediaId;

    // 2. Create IG media container
    const creationId = await createMediaContainer(wp.publicUrl, caption, pageToken);

    // 3. Wait for IG to process the image (5 seconds baseline)
    await delay(5000);

    // 4. Poll container status - retry up to 3 times if still processing
    let attempts = 0;
    while (attempts < 3) {
      const status = await checkContainerStatus(creationId, pageToken);
      if (status.statusCode === 'FINISHED') break;
      if (status.statusCode === 'ERROR') {
        throw new Error(`IG container processing failed: ${status.status}`);
      }
      attempts++;
      console.log(`[IG] Container still processing (${status.statusCode}), waiting...`);
      await delay(3000);
    }

    // 5. Publish
    const mediaId = await publishMediaContainer(creationId, pageToken);

    console.log(`[IG] Complete: mediaId=${mediaId}`);
    return { mediaId };
  } finally {
    // 6. Always clean up the temp WP media
    if (wpMediaId) {
      await deleteFromWordPress(wpMediaId);
    }
  }
}

/**
 * Create an Instagram STORY media container (media_type=STORIES)
 * @param {string} imageUrl - Public URL of the image (1080x1920)
 * @param {string} pageToken - Facebook Page access token (used for IG API)
 * @param {string|null} [link=null] - Optional clickable link sticker URL
 * @returns {Promise<string>} creation_id
 */
async function createStoryContainer(imageUrl, pageToken, link = null) {
  const url = `${GRAPH_API}/${IG_ID}/media`;

  const body = {
    image_url: imageUrl,
    media_type: 'STORIES',
    access_token: pageToken,
  };
  if (link) body.link = link;  // Clickable link sticker

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`IG createStoryContainer failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[IG] Story container created: ${data.id}${link ? ` (link: ${link})` : ''}`);
  return data.id;
}

/**
 * Full Instagram Story publish flow
 * Handles: WP upload -> IG story container -> wait -> publish -> WP cleanup
 *
 * @param {Object} params
 * @param {Buffer} params.imageBuffer - Raw image data (1080x1920 PNG)
 * @param {string} params.pageToken - Facebook Page access token
 * @param {string} [params.link] - Optional clickable link sticker URL (e.g. article URL)
 * @returns {Promise<{mediaId: string}>}
 */
export async function publishStory({ imageBuffer, pageToken, link = null }) {
  let wpMediaId = null;

  try {
    // 1. Upload image to WP to get a public URL
    const wp = await uploadToWordPress(imageBuffer, `fv-story-${Date.now()}.jpg`);
    wpMediaId = wp.wpMediaId;

    // 2. Create IG story container with media_type=STORIES (+ optional link sticker)
    const creationId = await createStoryContainer(wp.publicUrl, pageToken, link);

    // 3. Wait for IG to process the image (5 seconds baseline)
    await delay(5000);

    // 4. Poll container status - retry up to 3 times if still processing
    let attempts = 0;
    while (attempts < 3) {
      const status = await checkContainerStatus(creationId, pageToken);
      if (status.statusCode === 'FINISHED') break;
      if (status.statusCode === 'ERROR') {
        throw new Error(`IG story container processing failed: ${status.status}`);
      }
      attempts++;
      console.log(`[IG] Story container still processing (${status.statusCode}), waiting...`);
      await delay(3000);
    }

    // 5. Publish
    const mediaId = await publishMediaContainer(creationId, pageToken);

    console.log(`[IG] Story published: mediaId=${mediaId}`);
    return { mediaId };
  } finally {
    // 6. Always clean up the temp WP media
    if (wpMediaId) {
      await deleteFromWordPress(wpMediaId);
    }
  }
}

// --- Helpers ---

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
