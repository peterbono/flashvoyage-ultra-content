#!/usr/bin/env node

/**
 * Threads Publisher - FlashVoyage Social Distributor
 * Publishes posts to Threads via Threads API (graph.threads.net)
 *
 * Flow: create container -> wait for processing -> publish
 * Threads uses its own API domain (graph.threads.net), NOT graph.facebook.com
 */

const THREADS_USER = '26656054517311281';
const THREADS_API = 'https://graph.threads.net/v1.0';

/**
 * Create a Threads media container
 * @param {Object} params
 * @param {string} params.text - Post text (max 500 chars)
 * @param {string} [params.imageUrl] - Optional public image URL
 * @param {string} params.threadsToken - Threads access token
 * @returns {Promise<string>} creation_id
 */
async function createContainer({ text, imageUrl, threadsToken }) {
  const url = `${THREADS_API}/${THREADS_USER}/threads`;

  const body = {
    text,
    access_token: threadsToken,
  };

  // If image provided, set media_type to IMAGE and attach URL
  if (imageUrl) {
    body.media_type = 'IMAGE';
    body.image_url = imageUrl;
  } else {
    body.media_type = 'TEXT';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Threads createContainer failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[THREADS] Container created: ${data.id}`);
  return data.id;
}

/**
 * Publish a Threads container
 * @param {string} creationId - Container ID from createContainer
 * @param {string} threadsToken - Threads access token
 * @returns {Promise<string>} thread_id of published post
 */
async function publishContainer(creationId, threadsToken) {
  const url = `${THREADS_API}/${THREADS_USER}/threads_publish`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: threadsToken,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Threads publishContainer failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[THREADS] Post published: ${data.id}`);
  return data.id;
}

/**
 * Full Threads publish flow
 * @param {Object} params
 * @param {string} params.text - Post text (max 500 chars)
 * @param {string} [params.imageUrl] - Optional public image URL
 * @param {string} params.threadsToken - Threads access token
 * @returns {Promise<{threadId: string}>}
 */
export async function publishPost({ text, imageUrl, threadsToken }) {
  // 1. Create container
  const creationId = await createContainer({ text, imageUrl, threadsToken });

  // 2. Wait 3 seconds for Threads to process
  await delay(3000);

  // 3. Publish
  const threadId = await publishContainer(creationId, threadsToken);

  console.log(`[THREADS] Complete: threadId=${threadId}`);
  return { threadId };
}

// --- Helpers ---

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
