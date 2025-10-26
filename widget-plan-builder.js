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

    // Construire le plan
    const widgetPlan = {
      intents: intents,
      providers: this.buildProviders(intents),
      presets: this.buildPresets(intents),
      caps: this.buildCaps(articleContext),
      constraints: this.buildConstraints(articleContext),
      geo_defaults: this.buildGeoDefaults(geo),
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
   */
  buildGeoDefaults(geo) {
    return {
      country: geo.country || 'thailand',
      city: geo.city || 'bangkok',
      nearest_hub: this.getNearestHub(geo.city),
      // Configuration pour les widgets de vols
      origin: 'PAR', // Paris par défaut pour les vols depuis la France
      destination: this.getDestinationFromCity(geo.city || 'bangkok')
    };
  }

  /**
   * Convertit une ville en code aéroport de destination
   */
  getDestinationFromCity(city) {
    const cityToAirport = {
      'bangkok': 'BKK',
      'ho chi minh': 'SGN',
      'hanoi': 'HAN',
      'singapore': 'SIN',
      'kuala lumpur': 'KUL',
      'jakarta': 'CGK',
      'manila': 'MNL',
      'tokyo': 'NRT',
      'osaka': 'KIX',
      'seoul': 'ICN',
      'barcelone': 'BCN',
      'lisbonne': 'LIS',
      'madrid': 'MAD',
      'rome': 'FCO',
      'londres': 'LHR',
      'berlin': 'TXL',
      'amsterdam': 'AMS',
      'vietnam': 'SGN', // Par défaut Ho Chi Minh pour Vietnam
      'thailand': 'BKK', // Par défaut Bangkok pour Thaïlande
      'indonesia': 'CGK', // Par défaut Jakarta pour Indonésie
      'malaysia': 'KUL', // Par défaut Kuala Lumpur pour Malaisie
      'philippines': 'MNL', // Par défaut Manille pour Philippines
      'japan': 'NRT', // Par défaut Tokyo pour Japon
      'singapore': 'SIN', // Singapour
      'korea': 'ICN', // Par défaut Séoul pour Corée
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
   */
  getNearestHub(city) {
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
      'singapore': 'SIN'
    };

    return hubMap[city?.toLowerCase()] || 'BKK';
  }
}

export default WidgetPlanBuilder;
