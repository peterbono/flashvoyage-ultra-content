/**
 * DM Responder — FlashVoyage Webhook System
 * Generates a personalized DM via Haiku and sends it through the IG Messaging API.
 *
 * Flow:
 *   1. Call Claude Haiku to generate a short, friendly DM (French, tutoiement)
 *   2. Send the DM via POST /{PAGE_ID}/messages (Instagram Messaging API)
 *   3. Log the interaction
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
const PAGE_ID = '1068729919650308';
const GRAPH_API = 'https://graph.facebook.com/v21.0';

function getPageToken() {
  const tokensPath = join(__dirname, '..', 'data', 'tokens.json');
  const tokens = JSON.parse(readFileSync(tokensPath, 'utf-8'));
  return tokens.facebook?.token;
}

// --- Haiku message generation ---

/**
 * Generate a short, personalized DM using Claude Haiku.
 *
 * @param {string} articleUrl
 * @param {string} articleTitle
 * @param {string} commentText — the original comment (e.g. "INFO", "lien svp")
 * @returns {Promise<string>} — the DM text to send
 */
async function generateDMText(articleUrl, articleTitle, commentText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback if no API key — still send a useful DM
    console.warn('[DM] No ANTHROPIC_API_KEY, using fallback message');
    return `Salut ! Voici le lien vers l'article "${articleTitle}" :\n${articleUrl}\nBonne lecture !`;
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-haiku-4-20250414',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Tu es l'assistant Flash Voyage. Un utilisateur a commenté "${commentText}" sur notre post à propos de "${articleTitle}". Génère un message DM court et friendly (max 3 phrases) qui inclut le lien vers l'article. Ton: décontracté, tutoiement, pas commercial. Le lien est : ${articleUrl}`,
      },
    ],
  });

  const text = response.content[0]?.text;
  if (!text) {
    throw new Error('Haiku returned empty response');
  }

  return text.trim();
}

// --- IG Messaging API ---

/**
 * Send a DM to an Instagram user via the Page Messaging API.
 * Uses POST /{PAGE_ID}/messages with the instagram messaging product.
 *
 * @param {string} recipientId — Instagram-scoped user ID (IGSID)
 * @param {string} messageText — the message to send
 */
async function sendInstagramDM(recipientId, messageText) {
  const pageToken = getPageToken();
  if (!pageToken) {
    throw new Error('No Facebook page token found in tokens.json');
  }

  const url = `${GRAPH_API}/${PAGE_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: messageText },
      messaging_type: 'RESPONSE',
      access_token: pageToken,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`IG DM failed: ${data.error.message} (code ${data.error.code})`);
  }

  console.log(`[DM] Sent to ${recipientId}: ${messageText.slice(0, 60)}...`);
  return data;
}

// --- Public API ---

/**
 * Generate a personalized DM via Haiku and send it to the commenter.
 *
 * @param {string} userId — Instagram-scoped user ID
 * @param {string} articleUrl — article link to include in the DM
 * @param {string} articleTitle — article title for Haiku context
 * @param {string} commentText — the original comment text
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
export async function generateAndSendDM(userId, articleUrl, articleTitle, commentText) {
  try {
    console.log(`[DM] Generating for user ${userId}, article: "${articleTitle}"`);

    // 1. Generate personalized message via Haiku
    const dmText = await generateDMText(articleUrl, articleTitle, commentText);
    console.log(`[DM] Haiku generated: "${dmText.slice(0, 80)}..."`);

    // 2. Send DM via IG API
    await sendInstagramDM(userId, dmText);

    // 3. Log
    console.log(`[DM] Success: user=${userId}, article="${articleTitle}"`);
    return { success: true, message: dmText };
  } catch (err) {
    console.error(`[DM] Failed for user ${userId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}
