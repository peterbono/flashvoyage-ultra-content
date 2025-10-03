#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Configuration des APIs par ordre de priorité
const API_CHAIN = [
  {
    name: 'amadeus',
    priority: 1,
    quota: 2000,
    used: 0,
    baseUrl: 'https://api.amadeus.com/v2',
    auth: {
      clientId: process.env.AMADEUS_CLIENT_ID,
      clientSecret: process.env.AMADEUS_CLIENT_SECRET
    },
    endpoints: {
      flightOffers: '/shopping/flight-offers',
      flightInspiration: '/shopping/flight-destinations'
    }
  },
  {
    name: 'skyscanner',
    priority: 2,
    quota: 1000,
    used: 0,
    baseUrl: 'https://skyscanner-skyscanner-flight-search-v1.p.rapidapi.com',
    auth: {
      apiKey: process.env.SKYSCANNER_API_KEY
    },
    endpoints: {
      flightOffers: '/apiservices/browsequotes/v1.0',
      flightInspiration: '/apiservices/autosuggest/v1.0'
    }
  },
  {
    name: 'kiwi',
    priority: 3,
    quota: 100,
    used: 0,
    baseUrl: 'https://api.tequila.kiwi.com',
    auth: {
      apiKey: process.env.KIWI_API_KEY
    },
    endpoints: {
      flightOffers: '/v2/search',
      flightInspiration: '/locations/query'
    }
  }
];

// Cache pour éviter les requêtes répétées
const cache = new Map();
const CACHE_TTL = {
  flightOffers: 3600000, // 1 heure
  flightInspiration: 86400000, // 24 heures
  airportData: 604800000 // 7 jours
};

class FlightDataAPIs {
  constructor() {
    this.currentAPI = null;
    this.quotaStatus = {};
    this.initializeAPIs();
  }

  initializeAPIs() {
    // Initialiser le statut des quotas
    API_CHAIN.forEach(api => {
      this.quotaStatus[api.name] = {
        used: 0,
        remaining: api.quota,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Reset mensuel
      };
    });
    
    // Sélectionner la première API disponible
    this.currentAPI = API_CHAIN[0];
    console.log(`🚀 FlightDataAPIs initialisé avec ${API_CHAIN.length} APIs`);
  }

  async getFlightData(origin, destination, departureDate, returnDate = null) {
    const cacheKey = `flight_${origin}_${destination}_${departureDate}_${returnDate}`;
    
    // Vérifier le cache
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL.flightOffers) {
        console.log(`📋 Données récupérées du cache pour ${origin} → ${destination}`);
        return cached.data;
      }
    }

    // Essayer chaque API dans l'ordre de priorité
    for (const api of API_CHAIN) {
      try {
        console.log(`🔍 Tentative avec ${api.name}...`);
        const data = await this.callAPI(api, 'flightOffers', {
          origin,
          destination,
          departureDate,
          returnDate
        });
        
        if (data) {
          // Mettre en cache
          cache.set(cacheKey, {
            data,
            timestamp: Date.now()
          });
          
          // Mettre à jour le quota
          this.quotaStatus[api.name].used++;
          this.quotaStatus[api.name].remaining--;
          
          console.log(`✅ Données récupérées via ${api.name}`);
          return data;
        }
      } catch (error) {
        console.warn(`⚠️ Erreur avec ${api.name}: ${error.message}`);
        continue;
      }
    }
    
    throw new Error('Toutes les APIs de vols sont indisponibles');
  }

  async getFlightInspiration(origin, maxPrice = 500) {
    const cacheKey = `inspiration_${origin}_${maxPrice}`;
    
    // Vérifier le cache
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL.flightInspiration) {
        console.log(`📋 Inspiration récupérée du cache pour ${origin}`);
        return cached.data;
      }
    }

    // Essayer chaque API
    for (const api of API_CHAIN) {
      try {
        console.log(`🔍 Inspiration via ${api.name}...`);
        const data = await this.callAPI(api, 'flightInspiration', {
          origin,
          maxPrice
        });
        
        if (data) {
          cache.set(cacheKey, {
            data,
            timestamp: Date.now()
          });
          
          this.quotaStatus[api.name].used++;
          this.quotaStatus[api.name].remaining--;
          
          console.log(`✅ Inspiration récupérée via ${api.name}`);
          return data;
        }
      } catch (error) {
        console.warn(`⚠️ Erreur inspiration avec ${api.name}: ${error.message}`);
        continue;
      }
    }
    
    throw new Error('Toutes les APIs d\'inspiration sont indisponibles');
  }

  async callAPI(api, endpoint, params) {
    const url = `${api.baseUrl}${api.endpoints[endpoint]}`;
    
    // Vérifier le quota
    if (this.quotaStatus[api.name].remaining <= 0) {
      throw new Error(`Quota atteint pour ${api.name}`);
    }

    let config = {
      method: 'GET',
      url,
      params,
      timeout: 10000
    };

    // Ajouter l'authentification selon l'API
    if (api.name === 'amadeus') {
      const token = await this.getAmadeusToken(api);
      config.headers = { 'Authorization': `Bearer ${token}` };
    } else if (api.name === 'skyscanner') {
      config.headers = { 'X-RapidAPI-Key': api.auth.apiKey };
    } else if (api.name === 'kiwi') {
      config.headers = { 'apikey': api.auth.apiKey };
    }

    const response = await axios(config);
    return this.parseResponse(api.name, endpoint, response.data);
  }

  async getAmadeusToken(api) {
    const tokenCacheKey = 'amadeus_token';
    
    if (cache.has(tokenCacheKey)) {
      const cached = cache.get(tokenCacheKey);
      if (Date.now() - cached.timestamp < 1800000) { // 30 minutes
        return cached.token;
      }
    }

    const response = await axios.post(`${api.baseUrl}/v1/security/oauth2/token`, {
      grant_type: 'client_credentials',
      client_id: api.auth.clientId,
      client_secret: api.auth.clientSecret
    });

    const token = response.data.access_token;
    cache.set(tokenCacheKey, {
      token,
      timestamp: Date.now()
    });

    return token;
  }

  parseResponse(apiName, endpoint, data) {
    switch (apiName) {
      case 'amadeus':
        return this.parseAmadeusResponse(endpoint, data);
      case 'skyscanner':
        return this.parseSkyscannerResponse(endpoint, data);
      case 'kiwi':
        return this.parseKiwiResponse(endpoint, data);
      default:
        return data;
    }
  }

  parseAmadeusResponse(endpoint, data) {
    if (endpoint === 'flightOffers') {
      return {
        source: 'amadeus',
        offers: data.data?.map(offer => ({
          price: offer.price?.total,
          currency: offer.price?.currency,
          departure: offer.itineraries[0]?.segments[0]?.departure,
          arrival: offer.itineraries[0]?.segments[0]?.arrival,
          duration: offer.itineraries[0]?.duration,
          carrier: offer.itineraries[0]?.segments[0]?.carrierCode,
          stops: offer.itineraries[0]?.segments.length - 1
        })) || []
      };
    }
    return data;
  }

  parseSkyscannerResponse(endpoint, data) {
    if (endpoint === 'flightOffers') {
      return {
        source: 'skyscanner',
        offers: data.Quotes?.map(quote => ({
          price: quote.MinPrice,
          currency: data.Currencies[0]?.Code,
          departure: quote.OutboundLeg?.DepartureDate,
          arrival: quote.OutboundLeg?.ArrivalDate,
          carrier: quote.OutboundLeg?.CarrierIds[0],
          stops: quote.OutboundLeg?.Stops?.length || 0
        })) || []
      };
    }
    return data;
  }

  parseKiwiResponse(endpoint, data) {
    if (endpoint === 'flightOffers') {
      return {
        source: 'kiwi',
        offers: data.data?.map(offer => ({
          price: offer.price,
          currency: offer.currency,
          departure: offer.dTimeUTC,
          arrival: offer.aTimeUTC,
          duration: offer.fly_duration,
          carrier: offer.airlines[0],
          stops: offer.route?.length - 1 || 0
        })) || []
      };
    }
    return data;
  }

  getQuotaStatus() {
    return this.quotaStatus;
  }

  getCacheStats() {
    return {
      size: cache.size,
      keys: Array.from(cache.keys())
    };
  }

  clearCache() {
    cache.clear();
    console.log('🗑️ Cache vidé');
  }
}

export default FlightDataAPIs;

