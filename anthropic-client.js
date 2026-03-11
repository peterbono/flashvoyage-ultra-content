#!/usr/bin/env node

/**
 * CLIENT ANTHROPIC/CLAUDE CENTRALISÉ
 * Support Claude 3.5 Haiku pour les tâches secondaires du pipeline
 */

import { ANTHROPIC_API_KEY, FORCE_OFFLINE, DRY_RUN } from './config.js';
import tracker from './llm-cost-tracker.js';

const forceOffline = FORCE_OFFLINE;
const isDryRun = DRY_RUN;

let anthropicClient = null;
let anthropicModule = null;

/**
 * Obtient le client Anthropic (singleton avec import dynamique lazy)
 */
export async function getAnthropicClient() {
  if (forceOffline) return null;
  if (!ANTHROPIC_API_KEY) return null;
  
  if (!anthropicModule) {
    try {
      anthropicModule = await import('@anthropic-ai/sdk');
    } catch (error) {
      console.error('❌ Erreur import Anthropic:', error.message);
      return null;
    }
  }
  
  if (!anthropicClient && anthropicModule) {
    const Anthropic = anthropicModule.default || anthropicModule.Anthropic;
    anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    console.log('✅ Client Anthropic initialisé');
  }
  
  return anthropicClient;
}

/**
 * Vérifie si Anthropic est disponible
 */
export function isAnthropicAvailable() {
  return !forceOffline && Boolean(ANTHROPIC_API_KEY);
}

/**
 * Wrapper pour messages.create avec retry et cost tracking
 * Compatible avec l'interface OpenAI pour faciliter le switch
 * 
 * @param {Object} config - Configuration (model, messages, max_tokens, etc.)
 * @param {number} retries - Nombre de retries
 * @param {string} trackingStep - Étape du pipeline pour le cost tracker
 */
export async function createClaudeCompletion(config, retries = 3, trackingStep = 'unknown') {
  const client = await getAnthropicClient();
  
  if (forceOffline || !client) {
    throw new Error('Anthropic non disponible (FORCE_OFFLINE=1 ou clé API manquante)');
  }
  
  const timeout = parseInt(process.env.ANTHROPIC_TIMEOUT_MS || '120000', 10);
  const backoffDelays = [2000, 5000, 10000];
  
  // Convertir le format OpenAI vers Anthropic
  const { model, messages, max_tokens, temperature, ...rest } = config;
  
  // Extraire le system message s'il existe
  const systemMessage = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }));
  
  const anthropicConfig = {
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: max_tokens || 4096,
    messages: userMessages,
    ...(systemMessage && { system: systemMessage.content }),
    ...(temperature !== undefined && { temperature })
  };
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const t0 = Date.now();
      const response = await client.messages.create(anthropicConfig);
      const durationMs = Date.now() - t0;
      
      // Cost tracking (format compatible OpenAI)
      if (response?.usage) {
        tracker.recordFromUsage(trackingStep, model || 'claude-3-5-haiku', {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens
        }, durationMs);
      }
      
      // Convertir la réponse au format OpenAI pour compatibilité
      return {
        id: response.id,
        model: response.model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: response.content[0]?.text || ''
          },
          finish_reason: response.stop_reason === 'end_turn' ? 'stop' : response.stop_reason
        }],
        usage: {
          prompt_tokens: response.usage?.input_tokens || 0,
          completion_tokens: response.usage?.output_tokens || 0,
          total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        }
      };
    } catch (error) {
      const isRetryable = error.status === 429 || 
                         error.status === 529 ||
                         error.message?.includes('overloaded');
      
      if (isRetryable && attempt < retries) {
        const delay = backoffDelays[attempt - 1];
        console.log(`⚠️ CLAUDE_RETRY: attempt=${attempt}/${retries} reason=${error.status || 'unknown'} delay=${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (attempt === retries) {
        throw error;
      }
    }
  }
}

/**
 * Génère du contenu avec Claude (interface simplifiée)
 */
export async function generateWithClaude(systemPrompt, userPrompt, options = {}) {
  const {
    model = 'claude-haiku-4-5-20251001',
    maxTokens = 4096,
    temperature = 0.7,
    trackingStep = 'claude-generation'
  } = options;
  
  const response = await createClaudeCompletion({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature
  }, 3, trackingStep);
  
  return response.choices[0]?.message?.content || '';
}

export default {
  getAnthropicClient,
  isAnthropicAvailable,
  createClaudeCompletion,
  generateWithClaude
};
