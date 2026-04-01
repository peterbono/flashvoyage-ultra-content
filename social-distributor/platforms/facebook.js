#!/usr/bin/env node

/**
 * Facebook Page Publisher - FlashVoyage Social Distributor
 * Publishes photos to Facebook Page via Graph API v21.0
 *
 * Strategy: Post image first, then add article link as first comment
 * (avoids Facebook's link preview which kills organic reach)
 */

const PAGE_ID = '1068729919650308';
const GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * Publish a photo to the Facebook Page
 * @param {Object} params
 * @param {string} params.imageUrl - Public URL of the image
 * @param {string} params.message - Post caption
 * @param {string} params.pageToken - Facebook Page access token
 * @returns {Promise<{postId: string}>}
 */
export async function publishPhoto({ imageUrl, message, pageToken }) {
  const url = `${GRAPH_API}/${PAGE_ID}/photos`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imageUrl,
      message,
      access_token: pageToken,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Facebook publishPhoto failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[FB] Photo published: ${data.id}`);
  return { postId: data.id };
}

/**
 * Add a comment to an existing post (used for link-in-first-comment)
 * @param {Object} params
 * @param {string} params.postId - Facebook post ID
 * @param {string} params.message - Comment text (typically the article URL)
 * @param {string} params.pageToken - Facebook Page access token
 * @returns {Promise<{commentId: string}>}
 */
export async function addComment({ postId, message, pageToken }) {
  const url = `${GRAPH_API}/${postId}/comments`;

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
    throw new Error(`Facebook addComment failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[FB] Comment added: ${data.id}`);
  return { commentId: data.id };
}

/**
 * Publish a photo then add the article link as the first comment
 * This is the preferred publishing flow for maximum organic reach
 * @param {Object} params
 * @param {string} params.imageUrl - Public URL of the image
 * @param {string} params.message - Post caption
 * @param {string} params.linkComment - Link text for the first comment
 * @param {string} params.pageToken - Facebook Page access token
 * @returns {Promise<{postId: string, commentId: string}>}
 */
export async function publishPhotoWithLink({ imageUrl, message, linkComment, pageToken }) {
  // 1. Publish the photo
  const { postId } = await publishPhoto({ imageUrl, message, pageToken });

  // 2. Wait 2 seconds for Facebook to process
  await delay(2000);

  // 3. Add the article link as first comment
  const { commentId } = await addComment({ postId, message: linkComment, pageToken });

  console.log(`[FB] Complete: post=${postId}, comment=${commentId}`);
  return { postId, commentId };
}

/**
 * Publish multiple photos as a Facebook multi-photo post (carousel-like).
 *
 * FB Graph API multi-photo flow:
 * 1. Upload each photo as unpublished (published=false)
 * 2. Create a feed post with attached_media referencing all photo IDs
 *
 * @param {Object} params
 * @param {string[]} params.imageUrls - Array of public image URLs (2-10)
 * @param {string} params.message - Post caption
 * @param {string} params.pageToken - Facebook Page access token
 * @returns {Promise<{postId: string}>}
 */
export async function publishMultiPhoto({ imageUrls, message, pageToken }) {
  if (!imageUrls || imageUrls.length < 2) {
    throw new Error(`FB multi-photo requires at least 2 images, got ${imageUrls?.length || 0}`);
  }

  // 1. Upload each photo as unpublished to get media_fbid
  console.log(`[FB] Uploading ${imageUrls.length} photos (unpublished)...`);
  const photoIds = [];
  for (const imgUrl of imageUrls) {
    const uploadUrl = `${GRAPH_API}/${PAGE_ID}/photos`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imgUrl,
        published: false,
        access_token: pageToken,
      }),
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(`FB unpublished photo upload failed: ${data.error.message} (code ${data.error.code})`);
    }
    photoIds.push(data.id);
    console.log(`[FB] Unpublished photo: ${data.id}`);
  }

  // 2. Create the multi-photo post via /feed with attached_media
  console.log(`[FB] Creating multi-photo post with ${photoIds.length} photos...`);
  const feedUrl = `${GRAPH_API}/${PAGE_ID}/feed`;

  const body = {
    message,
    access_token: pageToken,
  };
  // attached_media must be indexed: attached_media[0], attached_media[1], etc.
  photoIds.forEach((id, i) => {
    body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });

  const response = await fetch(feedUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`FB multi-photo post failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[FB] Multi-photo post published: ${data.id} (${photoIds.length} photos)`);
  return { postId: data.id };
}

/**
 * Publish a photo as a Facebook Page Story
 * Uses the /{PAGE_ID}/photo_stories endpoint
 *
 * Flow:
 *   1. First publish the photo (unpublished) to get a photo_id
 *   2. Use the photo_id to create a Page Story
 *
 * @param {Object} params
 * @param {string} params.imageUrl - Public URL of the image
 * @param {string} params.pageToken - Facebook Page access token
 * @returns {Promise<{storyId: string}>}
 */
export async function publishStory({ imageUrl, pageToken }) {
  // 1. Upload photo as unpublished to get a photo_id
  const uploadUrl = `${GRAPH_API}/${PAGE_ID}/photos`;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imageUrl,
      published: false,
      access_token: pageToken,
    }),
  });

  const uploadData = await uploadResponse.json();

  if (uploadData.error) {
    throw new Error(`Facebook Story photo upload failed: ${uploadData.error.message} (code ${uploadData.error.code})`);
  }

  const photoId = uploadData.id;
  console.log(`[FB] Story photo uploaded (unpublished): ${photoId}`);

  // 2. Wait briefly for FB to process
  await delay(2000);

  // 3. Create the Page Story using the photo_id
  const storyUrl = `${GRAPH_API}/${PAGE_ID}/photo_stories`;

  const storyResponse = await fetch(storyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photo_id: photoId,
      access_token: pageToken,
    }),
  });

  const storyData = await storyResponse.json();

  if (storyData.error) {
    throw new Error(`Facebook publishStory failed: ${storyData.error.message} (code ${storyData.error.code})`);
  }

  console.log(`[FB] Story published: ${storyData.id}`);
  return { storyId: storyData.id };
}

// --- Helpers ---

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
