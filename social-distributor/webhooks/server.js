#!/usr/bin/env node

/**
 * FlashVoyage — "Commente INFO" Webhook Server
 *
 * Listens for Instagram comment events from Meta Webhooks.
 * When someone comments "INFO", "INFOS", "LIEN", or "LINK" on a post,
 * automatically sends them a DM with the article link via a Haiku-generated message.
 *
 * Endpoints:
 *   GET  /webhook — Meta verification (challenge-response)
 *   POST /webhook — Receives comment events
 *   GET  /health  — Health check
 *
 * Run locally:
 *   node social-distributor/webhooks/server.js
 *   # Then expose with: ngrok http 3001
 *
 * Env vars:
 *   VERIFY_TOKEN       — Webhook verification token (default: flashvoyage_webhook_2024)
 *   ANTHROPIC_API_KEY  — For Haiku DM generation
 *   PORT               — Server port (default: 3001)
 */

import express from 'express';
import crypto from 'crypto';
import { lookupPost } from './post-article-map.js';
import { generateAndSendDM } from './dm-responder.js';

// --- Config ---
const APP_SECRET = 'c936b60546cb3b47c54b053393b87424';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'flashvoyage_webhook_2024';
const PORT = process.env.PORT || 3001;

// Trigger keywords (case-insensitive)
const TRIGGER_KEYWORDS = ['info', 'infos', 'lien', 'link'];

// Track processed comments to avoid duplicates
const processedComments = new Set();

// --- Signature verification ---

function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expectedSig = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(req.rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}

// --- Comment processing ---

function isInfoComment(text) {
  const normalized = text.trim().toLowerCase().replace(/[!?.]+$/, '');
  return TRIGGER_KEYWORDS.includes(normalized);
}

async function handleCommentEvent(entry) {
  for (const change of entry.changes || []) {
    if (change.field !== 'comments') continue;

    const { id: commentId, text, from, media } = change.value || {};

    if (!commentId || !text || !from?.id || !media?.id) {
      console.log('[WEBHOOK] Incomplete comment event, skipping');
      continue;
    }

    // Dedup
    if (processedComments.has(commentId)) {
      console.log(`[WEBHOOK] Already processed comment ${commentId}, skipping`);
      continue;
    }

    console.log(`[WEBHOOK] Comment from ${from.id}: "${text}" on media ${media.id}`);

    // Check if it's a trigger keyword
    if (!isInfoComment(text)) {
      console.log(`[WEBHOOK] Not a trigger comment, ignoring`);
      continue;
    }

    processedComments.add(commentId);

    // Keep Set bounded (max 10k entries)
    if (processedComments.size > 10000) {
      const first = processedComments.values().next().value;
      processedComments.delete(first);
    }

    // Look up which article this post is about
    const postData = lookupPost(media.id);

    if (!postData) {
      console.warn(`[WEBHOOK] No article mapping for IG post ${media.id}`);
      // Still try to send a generic DM
      await generateAndSendDM(
        from.id,
        'https://flashvoyage.com',
        'Flash Voyage',
        text
      );
      continue;
    }

    // Send personalized DM with article link
    await generateAndSendDM(
      from.id,
      postData.articleUrl,
      postData.title,
      text
    );
  }
}

// --- Express app ---

const app = express();

// Parse JSON but keep raw body for signature verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// GET /webhook — Meta verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[WEBHOOK] Verification failed');
  res.status(403).send('Forbidden');
});

// POST /webhook — Receive events
app.post('/webhook', async (req, res) => {
  // Verify signature
  if (!verifySignature(req)) {
    console.warn('[WEBHOOK] Invalid signature, rejecting');
    return res.status(401).send('Invalid signature');
  }

  const body = req.body;

  // Must respond 200 within 20s or Meta retries
  res.status(200).send('OK');

  // Process asynchronously
  if (body.object !== 'instagram') {
    console.log(`[WEBHOOK] Ignoring non-instagram object: ${body.object}`);
    return;
  }

  for (const entry of body.entry || []) {
    try {
      await handleCommentEvent(entry);
    } catch (err) {
      console.error(`[WEBHOOK] Error processing entry: ${err.message}`);
    }
  }
});

// GET /health — Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    processedComments: processedComments.size,
  });
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`
========================================
  FlashVoyage "Commente INFO" Webhook
========================================
  Port:         ${PORT}
  Verify token: ${VERIFY_TOKEN}
  Endpoints:
    GET  /webhook  — Meta verification
    POST /webhook  — Comment events
    GET  /health   — Health check

  Next steps:
    1. Expose with ngrok:
       ngrok http ${PORT}
    2. Register webhook in Meta App Dashboard:
       - Go to https://developers.facebook.com/apps/
       - Webhooks > Instagram > comments
       - Callback URL: https://<ngrok-url>/webhook
       - Verify Token: ${VERIFY_TOKEN}
    3. Subscribe your Page to the app
========================================
`);
});
