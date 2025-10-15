/**
 * WidgetPlanBuilder - Construit un plan de widgets structuré pour le LLM
 * Le LLM utilise ce plan pour décider intelligemment des positions et types de widgets
 */

export class WidgetPlanBuilder {
  constructor() {
    // Mapping des providers par slot
    this.providers = {
      flights: "Travelpayouts-Aviasales",
      hotels: "Travelpayouts-Hotels", 
      transport: "12Go",
      activities: "Klook",
      esim: "Airalo",
      insurance: "SafetyWing",
      coworking: "NomadList",
      productivity: "Notion"
    };

    // Presets de rendu recommandés
    this.presets = {
      flights: "search_bar",
      hotels: "search_bar", 
      transport: "route_tiles",
      esim: "compact_card",
      insurance: "compact_card",
      activities: "compact_card",
      coworking: "compact_card",
      productivity: "compact_card"
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
      nearest_hub: this.getNearestHub(geo.city)
    };
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
