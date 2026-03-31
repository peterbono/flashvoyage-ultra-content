/**
 * Reel Cost Tracker — FlashVoyage
 *
 * Tracks LLM API costs from reel generation (Haiku calls in generators)
 * and appends to the shared cost-history.jsonl for unified cost reporting.
 *
 * Haiku pricing (claude-haiku-4-5-20251001):
 * - Input: $0.80 / 1M tokens
 * - Output: $4.00 / 1M tokens
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COST_LOG = join(__dirname, '..', '..', 'data', 'cost-history.jsonl');

// Pricing per 1M tokens
const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

let _sessionCosts = [];

/**
 * Record a single LLM call cost.
 */
export function recordCall({ model, tokensIn, tokensOut, purpose }) {
  const pricing = PRICING[model] || PRICING['claude-haiku-4-5-20251001'];
  const costUSD = (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000;

  _sessionCosts.push({
    model,
    tokensIn,
    tokensOut,
    costUSD,
    purpose,
    timestamp: new Date().toISOString(),
  });

  return costUSD;
}

/**
 * Flush all session costs to cost-history.jsonl.
 * Called at the end of a reel generation run.
 */
export function flushCosts({ format, destination, reelId }) {
  if (_sessionCosts.length === 0) return;

  const totalCostUSD = _sessionCosts.reduce((sum, c) => sum + c.costUSD, 0);
  const totalTokensIn = _sessionCosts.reduce((sum, c) => sum + c.tokensIn, 0);
  const totalTokensOut = _sessionCosts.reduce((sum, c) => sum + c.tokensOut, 0);

  const entry = {
    date: new Date().toISOString(),
    type: 'reel',
    format,
    destination: destination || 'unknown',
    reelId: reelId || null,
    totalCostUSD: Math.round(totalCostUSD * 1000000) / 1000000,
    totalTokens: totalTokensIn + totalTokensOut,
    totalTokensIn,
    totalTokensOut,
    totalCalls: _sessionCosts.length,
    byStep: {},
    byModel: {},
  };

  // Aggregate by purpose
  for (const c of _sessionCosts) {
    const step = c.purpose || 'unknown';
    if (!entry.byStep[step]) entry.byStep[step] = { calls: 0, tokensIn: 0, tokensOut: 0, costUSD: 0 };
    entry.byStep[step].calls++;
    entry.byStep[step].tokensIn += c.tokensIn;
    entry.byStep[step].tokensOut += c.tokensOut;
    entry.byStep[step].costUSD += c.costUSD;

    const model = c.model || 'unknown';
    if (!entry.byModel[model]) entry.byModel[model] = { calls: 0, tokensIn: 0, tokensOut: 0, costUSD: 0 };
    entry.byModel[model].calls++;
    entry.byModel[model].tokensIn += c.tokensIn;
    entry.byModel[model].tokensOut += c.tokensOut;
    entry.byModel[model].costUSD += c.costUSD;
  }

  // Round all costUSD values
  for (const step of Object.values(entry.byStep)) step.costUSD = Math.round(step.costUSD * 1000000) / 1000000;
  for (const model of Object.values(entry.byModel)) model.costUSD = Math.round(model.costUSD * 1000000) / 1000000;

  // Append to cost-history.jsonl
  const dir = dirname(COST_LOG);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(COST_LOG, JSON.stringify(entry) + '\n');

  console.log(`[COST] Reel ${format}: $${entry.totalCostUSD.toFixed(6)} (${entry.totalCalls} calls, ${entry.totalTokens} tokens)`);

  // Reset session
  const costs = [..._sessionCosts];
  _sessionCosts = [];
  return { entry, calls: costs };
}
