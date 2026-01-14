#!/usr/bin/env node

/**
 * CLIENT OPENAI CENTRALISÉ
 * Un seul point d'entrée pour tous les appels OpenAI
 * Règle: FORCE_OFFLINE=1 → zéro appel OpenAI
 * IMPORT DYNAMIQUE LAZY: Aucun import OpenAI au top-level pour éviter "File is not defined"
 */

import { OPENAI_API_KEY, FORCE_OFFLINE, DRY_RUN } from './config.js';

const forceOffline = FORCE_OFFLINE;
const isDryRun = DRY_RUN;

// Créer le client UNE SEULE FOIS (lazy import)
let openaiClient = null;
let openaiModule = null;

/**
 * Obtient le client OpenAI (singleton avec import dynamique lazy)
 * En FORCE_OFFLINE, retourne null pour bloquer tous les appels
 * Aucun import OpenAI n'est exécuté si FORCE_OFFLINE=1
 */
export async function getOpenAIClient() {
  // FORCE_OFFLINE bloque complètement (AVANT tout import)
  if (forceOffline) {
    return null;
  }
  
  // Si pas de clé API, retourner null (AVANT tout import)
  if (!OPENAI_API_KEY) {
    return null;
  }
  
  // Import dynamique lazy (seulement si nécessaire)
  if (!openaiModule) {
    try {
      openaiModule = await import('openai');
    } catch (error) {
      console.error('❌ Erreur import OpenAI:', error.message);
      return null;
    }
  }
  
  // Créer le client une seule fois (singleton)
  if (!openaiClient && openaiModule) {
    const OpenAI = openaiModule.default || openaiModule.OpenAI;
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log('✅ Client OpenAI initialisé (import dynamique)');
  }
  
  return openaiClient;
}

/**
 * Obtient le client OpenAI de manière synchrone (pour constructeurs)
 * Retourne null si FORCE_OFFLINE ou si pas encore initialisé
 * Le client sera initialisé de manière lazy dans les méthodes async
 */
export function getOpenAIClientSync() {
  if (forceOffline || !OPENAI_API_KEY) {
    return null;
  }
  return openaiClient; // Peut être null si pas encore initialisé
}

/**
 * Vérifie si OpenAI est disponible (synchrone pour compatibilité)
 */
export function isOpenAIAvailable() {
  return !forceOffline && Boolean(OPENAI_API_KEY);
}

/**
 * Wrapper pour chat.completions.create avec retry et fallback DRY_RUN
 */
export async function createChatCompletion(config, retries = 3) {
  const client = await getOpenAIClient();
  
  // En FORCE_OFFLINE, ne jamais appeler OpenAI
  if (forceOffline || !client) {
    throw new Error('OpenAI non disponible (FORCE_OFFLINE=1 ou clé API manquante)');
  }
  
  const timeout = parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10);
  const backoffDelays = [1000, 3000, 7000];
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        ...config,
        timeout: timeout
      });
      
      return response;
    } catch (error) {
      const isRetryable = error.code === 'ETIMEDOUT' || 
                         error.code === 'ECONNRESET' || 
                         error.status === 429;
      
      if (isRetryable && attempt < retries) {
        const delay = backoffDelays[attempt - 1];
        console.log(`⚠️ LLM_RETRY: attempt=${attempt}/${retries} reason=${error.code || error.status || 'unknown'} delay=${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Si après retries ça échoue
      if (attempt === retries) {
        if (isDryRun || forceOffline) {
          // En DRY_RUN, on peut utiliser un fallback (géré par l'appelant)
          throw new Error(`LLM timeout après ${retries} tentatives: ${error.message}`);
        } else {
          // En PROD, throw
          throw error;
        }
      }
    }
  }
}
