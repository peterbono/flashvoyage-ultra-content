#!/usr/bin/env node

/**
 * Send Daily Digest Email — FlashVoyage
 *
 * Reads the generated digest HTML from data/daily-digest.html
 * and outputs the subject + body for use with Gmail API / MCP.
 *
 * This script is designed to be called by Claude Code (which has
 * Gmail MCP access) to create a draft or send the email.
 *
 * Usage:
 *   node scripts/send-digest-email.js             # Generate + output subject and body path
 *   node scripts/send-digest-email.js --generate   # Regenerate + output
 *
 * The caller (Claude Code or GH Actions) then uses:
 *   - Gmail MCP: gmail_create_draft / send with the HTML body
 *   - Gmail API: via googleapis in the workflow
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIGEST_PATH = join(ROOT, 'data', 'daily-digest.html');

const shouldRegenerate = process.argv.includes('--generate');

if (shouldRegenerate || !existsSync(DIGEST_PATH)) {
  console.error('[SEND] Generating fresh digest...');
  execSync(`node ${join(__dirname, 'daily-digest-generator.js')} --file`, {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}

if (!existsSync(DIGEST_PATH)) {
  console.error('[SEND] ERROR: Digest file not found at', DIGEST_PATH);
  process.exit(1);
}

// Generate subject
const subjectRaw = execSync(`node ${join(__dirname, 'daily-digest-generator.js')} --subject`, {
  cwd: ROOT,
  encoding: 'utf-8',
}).trim();

const htmlBody = readFileSync(DIGEST_PATH, 'utf-8');

// Output as JSON for programmatic consumption
const output = {
  to: 'florian.gouloubi@gmail.com',
  subject: subjectRaw,
  htmlBodyPath: DIGEST_PATH,
  htmlBodyLength: htmlBody.length,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(output, null, 2));
