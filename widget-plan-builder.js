/**
 * WidgetPlanBuilder - Construit un plan de widgets structuré pour le LLM
 * Le LLM utilise ce plan pour décider intelligemment des positions et types de widgets
 */

export class WidgetPlanBuilder {
  constructor() {
    // Mapping des providers par slot - UNIQUEMENT CEUX QUI EXISTENT VRAIMENT
    this.providers = {
      flights: "Travelpayouts-Aviasales",
      esim: "Airalo"
      // hotels: SUPPRIMÉ - Pas de widgets hotels disponibles
      // transport: SUPPRIMÉ - Pas de widgets transport disponibles  
      // activities: SUPPRIMÉ - Pas de widgets activities disponibles
      // insurance: SUPPRIMÉ - Pas de widgets insurance disponibles
      // coworking: SUPPRIMÉ - Pas de widgets coworking disponibles
      // productivity: SUPPRIMÉ - Pas de widgets productivity disponibles
    };

    // Presets de rendu recommandés - UNIQUEMENT CEUX QUI EXISTENT VRAIMENT
    this.presets = {
      flights: "search_bar",
      esim: "compact_card"
      // hotels: SUPPRIMÉ - Pas de widgets hotels disponibles
      // transport: SUPPRIMÉ - Pas de widgets transport disponibles
      // activities: SUPPRIMÉ - Pas de widgets activities disponibles
      // insurance: SUPPRIMÉ - Pas de widgets insurance disponibles
      // coworking: SUPPRIMÉ - Pas de widgets coworking disponibles
      // productivity: SUPPRIMÉ - Pas de widgets productivity disponibles
    };

    // Contraintes par défaut
    this.defaultConstraints = {
      disclosure_required: true,
      nofollow_sponsored: true,
      sensitive_page_soft_limit: true,
      visa_pages_max_widgets: 1
    };
  }

  /**
   * Construit un plan de widgets complet
   * @param {Array} affiliateSlots - Slots détectés avec scores
   * @param {Object} geo - Informations géographiques
   * @param {Object} articleContext - Contexte de l'article
   * @param {string} articleId - ID de l'article
   * @returns {Object} Plan de widgets structuré
   */
  buildWidgetPlan(affiliateSlots, geo, articleContext, articleId) {
    // Trier les slots par score décroissant
    const intents = affiliateSlots
      .sort((a, b) => b.score - a.score)
      .slice(0, 4); // Max 4 slots

    // Récupérer final_destination depuis articleContext (source of truth)
    const finalDestination = articleContext?.final_destination || articleContext?.analysis?.final_destination || null;

    // Construire le plan
    const widgetPlan = {
      intents: intents,
      providers: this.buildProviders(intents),
      presets: this.buildPresets(intents),
      caps: this.buildCaps(articleContext),
      constraints: this.buildConstraints(articleContext),
      geo_defaults: this.buildGeoDefaults(geo, finalDestination),
      tracking: this.buildTracking(articleId, geo),
      inventory: this.checkInventory(intents),
      hints: this.extractHints(articleContext)
    };

    return { widget_plan: widgetPlan };
  }

  /**
   * Construit le mapping des providers pour les slots détectés
   */
  buildProviders(intents) {
    const providers = {};
    intents.forEach(intent => {
      if (this.providers[intent.slot]) {
        providers[intent.slot] = this.providers[intent.slot];
      }
    });
    return providers;
  }

  /**
   * Construit les presets de rendu pour les slots
   */
  buildPresets(intents) {
    const presets = {};
    intents.forEach(intent => {
      if (this.presets[intent.slot]) {
        presets[intent.slot] = this.presets[intent.slot];
      }
    });
    return presets;
  }

  /**
   * Construit les limites (caps) selon le contexte
   */
  buildCaps(articleContext) {
    const baseCaps = {
      desktop_max: 3,
      mobile_max: 2,
      min_paragraph_gap: 3,
      allow_above_fold: false
    };

    // Ajuster selon le type d'article
    if (articleContext.type === 'nomade') {
      baseCaps.desktop_max = 4; // Plus de widgets pour les nomades
    }

    if (articleContext.hasSafetySection) {
      baseCaps.allow_above_fold = true; // Widgets sécurité peuvent être en haut
    }

    return baseCaps;
  }

  /**
   * Construit les contraintes selon le contexte
   */
  buildConstraints(articleContext) {
    const constraints = { ...this.defaultConstraints };

    // Ajuster selon le contenu
    if (articleContext.hasVisaContent) {
      constraints.visa_pages_max_widgets = 1;
    }

    if (articleContext.hasSensitiveContent) {
      constraints.sensitive_page_soft_limit = true;
    }

    return constraints;
  }

  /**
   * Construit les valeurs géographiques par défaut
   * RÈGLE STRICTE: Pas de fallback "Bangkok" toxique
   */
  buildGeoDefaults(geo, final_destination = null) {
    console.log(`🔍 DEBUG buildGeoDefaults: geo reçu:`, geo);
    console.log(`🔍 DEBUG buildGeoDefaults: final_destination:`, final_destination);
    
    // RÈGLE 1: Utiliser final_destination si disponible (source of truth)
    if (final_destination && final_destination !== 'Asie') {
      const geoFromFinal = this.buildFromCountry(final_destination);
      if (geoFromFinal) {
        console.log(`   ✓ Geo construite depuis final_destination: ${final_destination}`);
        return geoFromFinal;
      }
    }
    
    // RÈGLE 2: Utiliser geo.country si disponible
    if (geo?.country) {
      const geoFromCountry = this.buildFromCountry(geo.country);
      if (geoFromCountry) {
        console.log(`   ✓ Geo construite depuis geo.country: ${geo.country}`);
        return geoFromCountry;
      }
    }
    
    // E) RÈGLE 3: Utiliser geo.city si disponible (avec nearest_hub correct)
    if (geo?.city) {
      const nearestHub = this.getNearestHub(geo.city);
      const destination = this.getDestinationFromCity(geo.city);
      if (destination && nearestHub) {
        console.log(`   ✓ Geo construite depuis geo.city: ${geo.city}, nearest_hub=${nearestHub}`);
    return {
          country: geo.country || null,
          city: geo.city,
          nearest_hub: nearestHub,
          origin: 'PAR',
      destination: destination
    };
      }
    }
    
    // RÈGLE 4: Pas de fallback toxique - retourner null
    console.log('   ⚠️ Geo insuffisante → retour null (pas de fallback Bangkok)');
    return null;
  }
  
  /**
   * Construit les geo_defaults depuis un pays
   */
  buildFromCountry(country) {
    if (!country) return null;
    
    const countryLower = country.toLowerCase();
    const COUNTRY_HUBS = {
      'japan': { hub: 'TYO', city: 'tokyo', country: 'japan' },
      'japon': { hub: 'TYO', city: 'tokyo', country: 'japan' },
      'thailand': { hub: 'BKK', city: 'bangkok', country: 'thailand' },
      'thaïlande': { hub: 'BKK', city: 'bangkok', country: 'thailand' },
      'vietnam': { hub: 'SGN', city: 'ho chi minh', country: 'vietnam' },
      'indonesia': { hub: 'DPS', city: 'bali', country: 'indonesia' },
      'indonésie': { hub: 'DPS', city: 'bali', country: 'indonesia' },
      'philippines': { hub: 'MNL', city: 'manila', country: 'philippines' },
      'singapore': { hub: 'SIN', city: 'singapore', country: 'singapore' },
      'singapour': { hub: 'SIN', city: 'singapore', country: 'singapore' },
      'korea': { hub: 'ICN', city: 'seoul', country: 'korea' },
      'corée': { hub: 'ICN', city: 'seoul', country: 'korea' }
    };
    
    // Chercher une correspondance (exacte ou partielle)
    for (const [key, value] of Object.entries(COUNTRY_HUBS)) {
      if (countryLower.includes(key) || key.includes(countryLower)) {
        return {
          country: value.country,
          city: value.city,
          nearest_hub: value.hub,
          origin: 'PAR',
          destination: value.hub
        };
      }
    }
    
    return null;
  }

  /**
   * Convertit une ville en code aéroport de destination
   */
  getDestinationFromCity(city) {
    const cityToAirport = {
      // Thaïlande
      'bangkok': 'BKK',
      'chiang mai': 'CNX',
      'chiangmai': 'CNX',
      'phuket': 'HKT',
      'krabi': 'KBV',
      'pattaya': 'BKK', // Utilise Bangkok
      'koh samui': 'USM',
      'koh phangan': 'USM', // Utilise Koh Samui
      'koh tao': 'USM', // Utilise Koh Samui
      'pai': 'CNX', // Utilise Chiang Mai
      'thailand': 'BKK', // Par défaut Bangkok pour Thaïlande
      'thaïlande': 'BKK',
      // Vietnam
      'ho chi minh': 'SGN',
      'hanoi': 'HAN',
      'hồ chí minh': 'SGN',
      'hà nội': 'HAN',
      'da nang': 'DAD',
      'đà nẵng': 'DAD',
      'hue': 'HUI',
      'huế': 'HUI',
      'hoi an': 'DAD', // Utilise Da Nang
      'hội an': 'DAD',
      'nha trang': 'CXR',
      'sapa': 'HAN', // Utilise Hanoi
      'sa pa': 'HAN',
      'vietnam': 'SGN', // Par défaut Ho Chi Minh pour Vietnam
      'viet nam': 'SGN',
      // Indonésie
      'jakarta': 'CGK',
      'bali': 'DPS',
      'denpasar': 'DPS',
      'canggu': 'DPS', // Utilise Denpasar (Bali)
      'ubud': 'DPS', // Utilise Denpasar (Bali)
      'seminyak': 'DPS', // Utilise Denpasar (Bali)
      'lombok': 'LOP',
      'yogyakarta': 'JOG',
      'bandung': 'BDO',
      'surabaya': 'SUB',
      'medan': 'KNO',
      'indonesia': 'DPS', // Par défaut Denpasar (Bali) pour Indonésie
      'indonésie': 'DPS',
      // Philippines
      'manila': 'MNL',
      'cebu': 'CEB',
      'boracay': 'MNL', // Utilise Manila
      'palawan': 'PPS',
      'el nido': 'PPS', // Utilise Puerto Princesa
      'coron': 'USU',
      'siargao': 'IAO',
      'bohol': 'TAG',
      'davao': 'DVO',
      'baguio': 'MNL', // Utilise Manila
      'makati': 'MNL', // Utilise Manila
      'philippines': 'MNL', // Par défaut Manille pour Philippines
      'philippine': 'MNL',
      // Japon
      'tokyo': 'NRT',
      'kyoto': 'KIX', // Utilise Osaka
      'osaka': 'KIX',
      'hokkaido': 'CTS',
      'hokkaidō': 'CTS',
      'hiroshima': 'HIJ',
      'nara': 'KIX', // Utilise Osaka
      'sapporo': 'CTS',
      'fukuoka': 'FUK',
      'okinawa': 'OKA',
      'yokohama': 'NRT', // Utilise Tokyo
      'nagoya': 'NGO',
      'sendai': 'SDJ',
      'japan': 'NRT', // Par défaut Tokyo pour Japon
      'japon': 'NRT',
      // Corée du Sud
      'seoul': 'ICN',
      'séoul': 'ICN',
      'busan': 'PUS',
      'pusan': 'PUS',
      'jeju': 'CJU',
      'jeju island': 'CJU',
      'incheon': 'ICN', // Utilise Seoul
      'daegu': 'TAE',
      'gwangju': 'KWJ',
      'ulsan': 'USN',
      'korea': 'ICN', // Par défaut Séoul pour Corée
      'corée': 'ICN',
      'south korea': 'ICN',
      'corée du sud': 'ICN',
      // Singapour
      'singapore': 'SIN',
      'singapour': 'SIN',
      // Destinations non-asiatiques (pour rejet)
      'barcelone': 'BCN',
      'lisbonne': 'LIS',
      'istanbul': 'IST',
      'madrid': 'MAD',
      'rome': 'FCO',
      'londres': 'LHR',
      'berlin': 'TXL',
      'amsterdam': 'AMS',
      'turkey': 'IST', // Par défaut Istanbul pour Turquie
      'turquie': 'IST',
      'spain': 'BCN', // Par défaut Barcelone pour Espagne
      'portugal': 'LIS', // Par défaut Lisbonne pour Portugal
      'italy': 'FCO', // Par défaut Rome pour Italie
      'uk': 'LHR', // Par défaut Londres pour UK
      'germany': 'TXL', // Par défaut Berlin pour Allemagne
      'netherlands': 'AMS' // Par défaut Amsterdam pour Pays-Bas
    };
    
    const normalizedCity = city.toLowerCase().trim();
    return cityToAirport[normalizedCity] || 'BKK'; // Bangkok par défaut
  }

  /**
   * Construit le tracking UTM et sub_ids
   */
  buildTracking(articleId, geo) {
    const country = geo.country || 'thailand';
    const city = geo.city || 'bangkok';
    
    return {
      utm_source: "flashvoyages",
      utm_medium: "affiliate", 
      utm_campaign: `${country}_${city}`,
      sub_id_schema: `${articleId}|{slot}|${country}_${city}`
    };
  }

  /**
   * Vérifie l'inventaire des widgets (simulation)
   */
  checkInventory(intents) {
    const inventory = {};
    intents.forEach(intent => {
      // Simulation - en réalité, on vérifierait l'API
      inventory[intent.slot] = "ok";
    });
    return inventory;
  }

  /**
   * Extrait les indices contextuels pour le LLM
   */
  extractHints(articleContext) {
    const hints = [];

    if (articleContext.hasItineraryContent) {
      hints.push("page_theme: itinerary");
    }

    if (articleContext.hasGettingThereSection) {
      hints.push("has section: getting_there");
    }

    if (articleContext.hasInternetSection) {
      hints.push("has section: internet");
    }

    if (articleContext.hasSafetySection) {
      hints.push("has section: safety");
    }

    if (articleContext.hasBudgetSection) {
      hints.push("has section: budget");
    }

    return hints;
  }

  /**
   * Obtient le hub aéroportuaire le plus proche
   * RÈGLE STRICTE: Pas de fallback "BKK" toxique
   */
  getNearestHub(city) {
    if (!city) return null;
    
    const hubMap = {
      'bangkok': 'BKK',
      'chiang mai': 'CNX', 
      'phuket': 'HKT',
      'ho chi minh': 'SGN',
      'hanoi': 'HAN',
      'bali': 'DPS',
      'jakarta': 'CGK',
      'manila': 'MNL',
      'tokyo': 'NRT',
      'singapore': 'SIN',
      'seoul': 'ICN'
    };

    const hub = hubMap[city.toLowerCase()];
    if (!hub) {
      console.log(`   ⚠️ Hub non trouvé pour ${city} → retour null (pas de fallback BKK)`);
    }
    return hub || null;
  }
}

export default WidgetPlanBuilder;
