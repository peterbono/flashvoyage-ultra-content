#!/usr/bin/env node

import axios from 'axios';

/**
 * Scraper de statistiques réelles pour widgets FOMO
 */
export class RealStatsScraper {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Scrape les prix de vols réels depuis Skyscanner
   */
  async getFlightStats(origin = 'PAR', destination = 'BKK') {
    try {
      const cacheKey = `flights_${origin}_${destination}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) return cached;

      console.log(`🔍 Scraping prix vols ${origin} → ${destination}...`);
      
      // Scrape Skyscanner pour les prix réels
      const response = await axios.get(`https://www.skyscanner.fr/transport/vols/${origin}/${destination}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });

      // Extraction simple des prix avec regex
      const priceRegex = /(\d{3,4})\s*€/g;
      const prices = [];
      let match;
      while ((match = priceRegex.exec(response.data)) !== null) {
        prices.push(parseInt(match[1]));
      }

      if (prices.length === 0) {
        throw new Error(`ERREUR CRITIQUE: Impossible de récupérer les prix de vols réels pour ${origin} → ${destination}. Refus de publier avec des données inventées.`);
      }

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      const savings = Math.round((maxPrice - minPrice) / maxPrice * 100);

      const stats = {
        min_price: minPrice,
        max_price: maxPrice,
        avg_price: avgPrice,
        savings_percent: savings,
        sample_size: prices.length,
        last_updated: new Date().toISOString()
      };

      this.setCachedData(cacheKey, stats);
      return stats;

    } catch (error) {
      throw new Error(`ERREUR CRITIQUE: Impossible de scraper les données de vols réels. ${error.message}. Refus de publier avec des données inventées.`);
    }
  }

  /**
   * Scrape les prix d'hébergement réels depuis Booking
   */
  async getHotelStats(city = 'Bangkok') {
    try {
      const cacheKey = `hotels_${city}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) return cached;

      console.log(`🔍 Scraping prix hôtels ${city}...`);
      
      // Scrape Booking.com pour les prix réels
      const response = await axios.get(`https://www.booking.com/searchresults.fr.html?ss=${encodeURIComponent(city)}&checkin=2024-12-01&checkout=2024-12-03`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });

      // Extraction simple des prix avec regex
      const priceRegex = /(\d{2,3})\s*€/g;
      const prices = [];
      let match;
      while ((match = priceRegex.exec(response.data)) !== null) {
        prices.push(parseInt(match[1]));
      }

      if (prices.length === 0) {
        throw new Error(`ERREUR CRITIQUE: Impossible de récupérer les prix d'hébergement réels pour ${city}. Refus de publier avec des données inventées.`);
      }

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      const savings = Math.round((maxPrice - minPrice) / maxPrice * 100);

      const stats = {
        min_price: minPrice,
        max_price: maxPrice,
        avg_price: avgPrice,
        savings_percent: savings,
        sample_size: prices.length,
        last_updated: new Date().toISOString()
      };

      this.setCachedData(cacheKey, stats);
      return stats;

    } catch (error) {
      throw new Error(`ERREUR CRITIQUE: Impossible de scraper les données d'hébergement réelles. ${error.message}. Refus de publier avec des données inventées.`);
    }
  }

  /**
   * Génère des contextes FOMO avec stats réelles
   */
  async generateFOMOContext(widgetType, geoData = {}) {
    const origin = geoData.origin || 'PAR';
    const destination = geoData.destination || 'BKK';
    const city = geoData.city || 'Bangkok';

    let stats;
    let context;

    switch (widgetType) {
      case 'flights':
        stats = await this.getFlightStats(origin, destination);
        context = `D'après nos données en temps réel, les prix des vols ${origin} → ${destination} varient de ${stats.min_price}€ à ${stats.max_price}€. Réserver en avance peut vous faire économiser jusqu'à ${stats.savings_percent}% (${stats.sample_size} vols analysés).`;
        break;

      case 'hotels':
        stats = await this.getHotelStats(city);
        context = `Nos données actuelles montrent que les prix d'hébergement à ${city} oscillent entre ${stats.min_price}€ et ${stats.max_price}€ par nuit. Comparer les sites peut vous faire économiser jusqu'à ${stats.savings_percent}% (${stats.sample_size} hôtels analysés).`;
        break;

      default:
        throw new Error(`ERREUR CRITIQUE: Type de widget non supporté: ${widgetType}. Refus de publier avec des données inventées.`);
    }

    return {
      context,
      stats,
      last_updated: new Date().toISOString()
    };
  }

  /**
   * Données génériques réalistes en fallback
   */
  getGenericFlightStats() {
    return {
      min_price: 450,
      max_price: 850,
      avg_price: 650,
      savings_percent: 35,
      sample_size: 150,
      last_updated: new Date().toISOString(),
      source: 'generic'
    };
  }

  getGenericHotelStats() {
    return {
      min_price: 25,
      max_price: 120,
      avg_price: 65,
      savings_percent: 45,
      sample_size: 200,
      last_updated: new Date().toISOString(),
      source: 'generic'
    };
  }

  /**
   * Cache management
   */
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}

export default RealStatsScraper;
