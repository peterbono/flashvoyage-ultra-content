/**
 * Tracked Anthropic Client — FlashVoyage
 *
 * Drop-in replacement for `import Anthropic from '@anthropic-ai/sdk'`
 * that auto-tracks every messages.create() call to cost-history.jsonl.
 *
 * Usage in generators:
 *   // Before: import Anthropic from '@anthropic-ai/sdk';
 *   // After:  import { createTrackedClient } from '../tracked-anthropic.js';
 *   //         const client = createTrackedClient('humor-generator');
 *
 * Or for minimal changes, just wrap the existing client:
 *   import { wrapClient } from '../tracked-anthropic.js';
 *   const client = wrapClient(existingClient, 'humor-generator');
 */

import Anthropic from '@anthropic-ai/sdk';
import { recordCall, flushCosts } from './cost-tracker.js';

/**
 * Create a tracked Anthropic client.
 * Every messages.create() call is automatically recorded.
 *
 * @param {string} purpose - What this client is used for (e.g., 'humor-generator', 'poll-generator')
 * @returns {Anthropic} Proxied client that tracks costs
 */
export function createTrackedClient(purpose = 'unknown') {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const realClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return wrapClient(realClient, purpose);
}

/**
 * Wrap an existing Anthropic client with cost tracking.
 *
 * @param {Anthropic} client - Existing Anthropic client instance
 * @param {string} purpose - Label for cost tracking
 * @returns {Anthropic} Proxied client
 */
export function wrapClient(client, purpose = 'unknown') {
  if (!client) return null;

  const originalCreate = client.messages.create.bind(client.messages);

  client.messages.create = async function trackedCreate(params) {
    const response = await originalCreate(params);

    // Extract token usage from response
    const usage = response.usage || {};
    const tokensIn = usage.input_tokens || 0;
    const tokensOut = usage.output_tokens || 0;
    const model = params.model || response.model || 'unknown';

    recordCall({
      model,
      tokensIn,
      tokensOut,
      purpose,
    });

    return response;
  };

  return client;
}

export { recordCall, flushCosts };
