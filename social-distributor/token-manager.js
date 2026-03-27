#!/usr/bin/env node

/**
 * Token Manager - FlashVoyage Social Distributor
 * Manages Meta API tokens with expiration tracking
 *
 * Tokens stored in data/tokens.json (gitignored)
 * Structure: { platform: { token, expiresAt } }
 *
 * Platforms:
 * - facebook: Facebook Page Token (also used for Instagram API)
 * - instagram: Alias for facebook token (IG uses Page Token)
 * - threads: Separate Threads-specific token
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(__dirname, 'data', 'tokens.json');

/**
 * Load tokens from disk
 * @returns {Object} tokens object
 */
function loadTokens() {
  if (!existsSync(TOKENS_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  } catch (err) {
    console.error(`[TOKEN] Failed to read tokens.json: ${err.message}`);
    return {};
  }
}

/**
 * Save tokens to disk
 * @param {Object} tokens
 */
function saveTokens(tokens) {
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
}

/**
 * Get a token for a platform
 * Instagram returns the Facebook token (IG API uses Page Token)
 *
 * @param {string} platform - 'facebook' | 'instagram' | 'threads'
 * @returns {string|null} token or null if not found/expired
 */
export function getToken(platform) {
  const tokens = loadTokens();

  // Instagram uses the same token as Facebook
  const key = platform === 'instagram' ? 'facebook' : platform;
  const entry = tokens[key];

  if (!entry || !entry.token) {
    console.warn(`[TOKEN] No token found for ${platform}`);
    return null;
  }

  // Check expiration
  if (entry.expiresAt) {
    const expiresAt = new Date(entry.expiresAt);
    const now = new Date();

    if (now >= expiresAt) {
      console.error(`[TOKEN] Token for ${platform} EXPIRED on ${expiresAt.toISOString()}`);
      return null;
    }

    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) {
      console.warn(`[TOKEN] Token for ${platform} expires in ${daysLeft} day(s)!`);
    }
  }

  return entry.token;
}

/**
 * Set a token for a platform
 * @param {string} platform - 'facebook' | 'threads'
 * @param {string} token - The access token
 * @param {number} [expiresInDays=60] - Days until expiration (Meta tokens are typically 60 days)
 */
export function setToken(platform, token, expiresInDays = 60) {
  const tokens = loadTokens();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  tokens[platform] = {
    token,
    expiresAt: expiresAt.toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveTokens(tokens);
  console.log(`[TOKEN] ${platform} token updated, expires ${expiresAt.toISOString()}`);
}

/**
 * Check expiration status of all tokens
 * Logs warnings for tokens expiring within 7 days, errors for expired tokens
 *
 * @returns {{ platform: string, status: 'ok'|'warning'|'expired'|'missing', daysLeft: number|null }[]}
 */
export function checkExpiration() {
  const tokens = loadTokens();
  const platforms = ['facebook', 'threads'];
  const results = [];
  const now = new Date();

  for (const platform of platforms) {
    const entry = tokens[platform];

    if (!entry || !entry.token) {
      console.error(`[TOKEN] ${platform}: MISSING`);
      results.push({ platform, status: 'missing', daysLeft: null });
      continue;
    }

    if (!entry.expiresAt) {
      console.warn(`[TOKEN] ${platform}: no expiration date set`);
      results.push({ platform, status: 'ok', daysLeft: null });
      continue;
    }

    const expiresAt = new Date(entry.expiresAt);
    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      console.error(`[TOKEN] ${platform}: EXPIRED ${Math.abs(daysLeft)} day(s) ago`);
      results.push({ platform, status: 'expired', daysLeft });
    } else if (daysLeft <= 7) {
      console.warn(`[TOKEN] ${platform}: expires in ${daysLeft} day(s)!`);
      results.push({ platform, status: 'warning', daysLeft });
    } else {
      console.log(`[TOKEN] ${platform}: OK (${daysLeft} days left)`);
      results.push({ platform, status: 'ok', daysLeft });
    }
  }

  // Also report instagram as alias
  const fbEntry = tokens.facebook;
  if (fbEntry) {
    console.log(`[TOKEN] instagram: uses facebook token`);
  }

  return results;
}

/**
 * Get all tokens for queue processing
 * Convenience method that returns the object shape expected by queue-manager
 *
 * @returns {{ facebook: string|null, instagram: string|null, threads: string|null }}
 */
export function getAllTokens() {
  return {
    facebook: getToken('facebook'),
    instagram: getToken('instagram'),  // Returns FB token (alias)
    threads: getToken('threads'),
  };
}
