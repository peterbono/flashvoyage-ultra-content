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
const PAGE_ID = '1068729919650308';
const GRAPH_API = 'https://graph.facebook.com/v21.0';
const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const WP_AUTH = 'Basic ' + Buffer.from('admin7817:GjLl 9W0k lKwf LSOT PXur RYGR').toString('base64');

/**
 * Upload an image buffer and get a public URL accessible by Meta's IG servers.
 *
 * Strategy: WP upload → FB unpublished photo → FB CDN URL.
 * Meta's IG API can't always reach OVH-hosted WP URLs directly,
 * but FB CDN URLs (fbcdn.net) are always reachable by IG servers.
 *
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} filename - Filename for the WP upload
 * @param {string} pageToken - Facebook Page access token (needed for FB CDN relay)
 * @returns {Promise<{wpMediaId: number, fbPhotoId: string, publicUrl: string}>}
 */
async function uploadForIG(imageBuffer, filename = 'social-temp.jpg', pageToken) {
  // Step 1: Upload to WP to get a public URL (needed as source for FB)
  const wpRes = await fetch(`${WP_API}/media`, {
    method: 'POST',
    headers: {
      'Authorization': WP_AUTH,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'image/jpeg',
    },
    body: imageBuffer,
  });
  const wpData = await wpRes.json();
  if (wpData.code || !wpData.id) {
    throw new Error(`WP upload failed: ${wpData.message || JSON.stringify(wpData)}`);
  }
  console.log(`[IG/WP] Uploaded temp media: id=${wpData.id}, url=${wpData.source_url}`);

  // Step 2: Upload as unpublished FB photo to get FB CDN URL
  const fbRes = await fetch(`${GRAPH_API}/${PAGE_ID}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: wpData.source_url, published: false, access_token: pageToken }),
  });
  const fbData = await fbRes.json();
  if (fbData.error || !fbData.id) {
    // Fallback: return WP URL directly (might work in some cases)
    console.warn(`[IG/FB-CDN] FB relay failed, falling back to WP URL: ${fbData.error?.message || 'unknown'}`);
    return { wpMediaId: wpData.id, fbPhotoId: null, publicUrl: wpData.source_url };
  }

  // Step 3: Get FB CDN URL from the photo object
  const photoRes = await fetch(`${GRAPH_API}/${fbData.id}?fields=images&access_token=${pageToken}`);
  const photoData = await photoRes.json();
  const cdnUrl = photoData.images?.[0]?.source;

  if (!cdnUrl) {
    console.warn(`[IG/FB-CDN] No CDN URL returned, falling back to WP URL`);
    return { wpMediaId: wpData.id, fbPhotoId: fbData.id, publicUrl: wpData.source_url };
  }

  console.log(`[IG/FB-CDN] Relay OK: ${cdnUrl.slice(0, 80)}...`);
  return { wpMediaId: wpData.id, fbPhotoId: fbData.id, publicUrl: cdnUrl };
}

/**
 * Clean up temporary media (WP + optional FB unpublished photo)
 * @param {number|null} wpMediaId - WordPress media ID to delete
 * @param {string|null} fbPhotoId - FB unpublished photo ID to delete
 * @param {string} [pageToken] - FB page token (needed to delete FB photo)
 */
async function cleanupTempMedia(wpMediaId, fbPhotoId, pageToken) {
  if (wpMediaId) {
    try {
      await fetch(`${WP_API}/media/${wpMediaId}?force=true`, {
        method: 'DELETE',
        headers: { 'Authorization': WP_AUTH },
      });
      console.log(`[IG/WP] Cleaned up temp media: id=${wpMediaId}`);
    } catch (err) {
      console.warn(`[IG/WP] Failed to clean up temp media ${wpMediaId}: ${err.message}`);
    }
  }
  if (fbPhotoId && pageToken) {
    try {
      await fetch(`${GRAPH_API}/${fbPhotoId}?access_token=${pageToken}`, { method: 'DELETE' });
      console.log(`[IG/FB-CDN] Cleaned up temp photo: ${fbPhotoId}`);
    } catch (err) {
      console.warn(`[IG/FB-CDN] Failed to clean up temp photo ${fbPhotoId}: ${err.message}`);
    }
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
  let fbPhotoId = null;

  try {
    // 1. Upload image via FB CDN relay
    const upload = await uploadForIG(imageBuffer, `fv-social-${Date.now()}.jpg`, pageToken);
    wpMediaId = upload.wpMediaId;
    fbPhotoId = upload.fbPhotoId;

    // 2. Create IG media container
    const creationId = await createMediaContainer(upload.publicUrl, caption, pageToken);

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
    await cleanupTempMedia(wpMediaId, fbPhotoId, pageToken);
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

  const params = new URLSearchParams({
    image_url: imageUrl,
    media_type: 'STORIES',
    access_token: pageToken,
  });
  if (link) params.set('link', link);  // Clickable link sticker

  const response = await fetch(url, {
    method: 'POST',
    body: params,
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
  let fbPhotoId = null;

  try {
    // 1. Upload image via FB CDN relay
    const upload = await uploadForIG(imageBuffer, `fv-story-${Date.now()}.jpg`, pageToken);
    wpMediaId = upload.wpMediaId;
    fbPhotoId = upload.fbPhotoId;

    // 2. Create IG story container with media_type=STORIES (+ optional link sticker)
    const creationId = await createStoryContainer(upload.publicUrl, pageToken, link);

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
    await cleanupTempMedia(wpMediaId, fbPhotoId, pageToken);
  }
}

/**
 * Publish an Instagram CAROUSEL (multi-image) post.
 *
 * IG Graph API carousel flow:
 * 1. Upload each image to WP for public URLs
 * 2. Create individual item containers (is_carousel_item=true)
 * 3. Create a carousel container with children IDs
 * 4. Wait for processing
 * 5. Publish the carousel container
 * 6. Clean up WP temp media
 *
 * @param {Object} params
 * @param {Buffer[]} params.imageBuffers - Array of raw image data (2-20 items)
 * @param {string} params.caption - Post caption (max 2200 chars)
 * @param {string} params.pageToken - Facebook Page access token
 * @returns {Promise<{mediaId: string}>}
 */
export async function publishCarousel({ imageBuffers, caption, pageToken }) {
  if (!imageBuffers || imageBuffers.length < 2) {
    throw new Error(`IG carousel requires at least 2 images, got ${imageBuffers?.length || 0}`);
  }
  if (imageBuffers.length > 20) {
    throw new Error(`IG carousel max 20 images, got ${imageBuffers.length}`);
  }

  const uploads = []; // { wpMediaId, fbPhotoId }

  try {
    // 1. Upload all images via FB CDN relay
    console.log(`[IG] Uploading ${imageBuffers.length} carousel slides via FB CDN relay...`);
    const cdnUrls = [];
    for (let i = 0; i < imageBuffers.length; i++) {
      const upload = await uploadForIG(imageBuffers[i], `fv-carousel-${Date.now()}-${i}.jpg`, pageToken);
      uploads.push({ wpMediaId: upload.wpMediaId, fbPhotoId: upload.fbPhotoId });
      cdnUrls.push(upload.publicUrl);
    }

    // 2. Create individual carousel item containers (with retry per item)
    console.log(`[IG] Creating ${cdnUrls.length} carousel item containers...`);
    const childIds = [];
    for (const cdnUrl of cdnUrls) {
      if (childIds.length > 0) await delay(3000);

      let itemData;
      for (let attempt = 0; attempt < 3; attempt++) {
        const url = `${GRAPH_API}/${IG_ID}/media`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: cdnUrl,
            is_carousel_item: true,
            access_token: pageToken,
          }),
        });
        itemData = await response.json();
        if (!itemData.error) break;
        if (itemData.error.code === 2 && attempt < 2) {
          console.warn(`[IG] Carousel item transient error, retry ${attempt + 1}/3 in 5s...`);
          await delay(5000);
        }
      }
      if (itemData.error) {
        throw new Error(`IG carousel item failed: ${itemData.error.message} (code ${itemData.error.code})`);
      }
      childIds.push(itemData.id);
      console.log(`[IG] Carousel item created: ${itemData.id}`);
    }

    // 3. Create the carousel container with all children
    console.log(`[IG] Creating carousel container with ${childIds.length} children...`);
    const carouselUrl = `${GRAPH_API}/${IG_ID}/media`;
    const carouselResponse = await fetch(carouselUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'CAROUSEL',
        caption,
        children: childIds.join(','),
        access_token: pageToken,
      }),
    });
    const carouselData = await carouselResponse.json();
    if (carouselData.error) {
      throw new Error(`IG carousel container failed: ${carouselData.error.message} (code ${carouselData.error.code})`);
    }
    const carouselId = carouselData.id;
    console.log(`[IG] Carousel container created: ${carouselId}`);

    // 4. Wait for IG to process
    await delay(5000);

    let attempts = 0;
    while (attempts < 5) {
      const status = await checkContainerStatus(carouselId, pageToken);
      if (status.statusCode === 'FINISHED') break;
      if (status.statusCode === 'ERROR') {
        throw new Error(`IG carousel processing failed: ${status.status}`);
      }
      attempts++;
      console.log(`[IG] Carousel still processing (${status.statusCode}), waiting...`);
      await delay(3000);
    }

    // 5. Publish
    const mediaId = await publishMediaContainer(carouselId, pageToken);
    console.log(`[IG] Carousel published: mediaId=${mediaId} (${childIds.length} slides)`);
    return { mediaId };

  } finally {
    // 6. Clean up all temp media (WP + FB)
    for (const u of uploads) {
      await cleanupTempMedia(u.wpMediaId, u.fbPhotoId, pageToken);
    }
  }
}

/**
 * Add a comment to an existing IG media (used for link-in-first-comment)
 * @param {Object} params
 * @param {string} params.mediaId - Instagram media ID
 * @param {string} params.message - Comment text (typically the article URL)
 * @param {string} params.pageToken - Facebook Page access token (used for IG API)
 * @returns {Promise<{commentId: string}>}
 */
export async function addComment({ mediaId, message, pageToken }) {
  const url = `${GRAPH_API}/${mediaId}/comments`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      access_token: pageToken,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`IG addComment failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[IG] Comment added: ${data.id}`);
  return { commentId: data.id };
}

// --- Helpers ---

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
