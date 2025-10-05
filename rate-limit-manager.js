#!/usr/bin/env node

/**
 * Rate Limit Manager - Gestion intelligente des limites de taux
 * Implémente retry exponentiel + circuit breaker pour toutes les APIs
 */

class RateLimitManager {
  constructor() {
    this.circuitBreakers = new Map();
    this.retryAttempts = new Map();
    this.lastRequest = new Map();
  }

  // Configuration des limites par API
  getApiLimits(apiName) {
    const limits = {
      'reddit': { requests: 60, window: 60000, retryAfter: 2000 },
      'openai': { requests: 60, window: 60000, retryAfter: 1000 },
      'pexels': { requests: 200, window: 3600000, retryAfter: 500 },
      'wordpress': { requests: 100, window: 60000, retryAfter: 1000 },
      'amadeus': { requests: 2000, window: 3600000, retryAfter: 100 }
    };
    return limits[apiName] || { requests: 100, window: 60000, retryAfter: 1000 };
  }

  // Vérifier si on peut faire une requête
  canMakeRequest(apiName) {
    const breaker = this.circuitBreakers.get(apiName);
    if (breaker && breaker.state === 'OPEN') {
      const now = Date.now();
      if (now - breaker.lastFailure < breaker.timeout) {
        return false; // Circuit ouvert
      }
      // Réessayer après timeout
      breaker.state = 'HALF_OPEN';
    }
    return true;
  }

  // Gérer une erreur 429
  async handleRateLimit(apiName, error, retryFunction) {
    const retryAfter = this.extractRetryAfter(error);
    const attempts = this.retryAttempts.get(apiName) || 0;
    const maxRetries = 3;

    console.log(`⏰ Rate limit ${apiName}: ${retryAfter}ms, tentative ${attempts + 1}/${maxRetries}`);

    if (attempts >= maxRetries) {
      this.openCircuit(apiName);
      throw new Error(`Circuit breaker ouvert pour ${apiName} après ${maxRetries} tentatives`);
    }

    // Retry exponentiel
    const delay = Math.min(retryAfter || (1000 * Math.pow(2, attempts)), 30000);
    this.retryAttempts.set(apiName, attempts + 1);

    console.log(`⏳ Attente ${delay}ms avant retry...`);
    await this.sleep(delay);

    return await retryFunction();
  }

  // Extraire le délai de retry depuis l'erreur
  extractRetryAfter(error) {
    const retryAfter = error.response?.headers?.['retry-after'] || 
                      error.response?.headers?.['Retry-After'];
    return retryAfter ? parseInt(retryAfter) * 1000 : null;
  }

  // Ouvrir le circuit breaker
  openCircuit(apiName) {
    this.circuitBreakers.set(apiName, {
      state: 'OPEN',
      lastFailure: Date.now(),
      timeout: 300000 // 5 minutes
    });
    console.log(`🔴 Circuit breaker ouvert pour ${apiName}`);
  }

  // Fermer le circuit breaker
  closeCircuit(apiName) {
    this.circuitBreakers.set(apiName, { state: 'CLOSED' });
    this.retryAttempts.delete(apiName);
    console.log(`🟢 Circuit breaker fermé pour ${apiName}`);
  }

  // Wrapper pour requêtes avec gestion automatique des rate limits
  async makeRequest(apiName, requestFunction) {
    if (!this.canMakeRequest(apiName)) {
      throw new Error(`Circuit breaker ouvert pour ${apiName}`);
    }

    try {
      const result = await requestFunction();
      this.closeCircuit(apiName);
      return result;
    } catch (error) {
      if (error.response?.status === 429) {
        return await this.handleRateLimit(apiName, error, () => this.makeRequest(apiName, requestFunction));
      } else if (error.response?.status >= 500) {
        // Erreur serveur - ouvrir circuit breaker
        this.openCircuit(apiName);
        throw error;
      } else {
        throw error;
      }
    }
  }

  // Délai avec backoff exponentiel
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Obtenir le statut des circuit breakers
  getStatus() {
    const status = {};
    for (const [api, breaker] of this.circuitBreakers) {
      status[api] = {
        state: breaker.state,
        lastFailure: breaker.lastFailure,
        attempts: this.retryAttempts.get(api) || 0
      };
    }
    return status;
  }
}

export default RateLimitManager;
