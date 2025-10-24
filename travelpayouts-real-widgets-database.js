/**
 * BASE DE DONNÉES RÉELLE DES WIDGETS TRAVELPAYOUTS
 * Basée sur le fichier CSV fourni par l'utilisateur
 * Partner ID: 463418, Marker: 676421
 */

export const REAL_TRAVELPAYOUTS_WIDGETS = {
  // ===== VOLS (FLIGHTS) =====
  flights: {
    kiwi: {
      popularRoutes: {
        brand: "Kiwi.com",
        type: "Popular routes widget",
        reward: "3%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&locale=fr&powered_by=true&limit=4&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&campaign_id=111&promo_id=3411" charset="utf-8"></script>`,
        context: "Articles sur destinations populaires, guides de voyage"
      },
      searchForm: {
        brand: "Kiwi.com",
        type: "Flight Search Form",
        reward: "3%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&locale=fr&default_origin=PAR&default_destination=BKK&stops=any&show_hotels=true&powered_by=true&border_radius=0&plain=true&color_button=%2300A991&color_button_text=%23ffffff&promo_id=3414&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur vols, comparatifs de prix, guides de réservation"
      },
      searchResults: {
        brand: "Kiwi.com",
        type: "Search Results Widget",
        reward: "3%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&powered_by=true&locale=fr&show_header=true&limit=3&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&campaign_id=111&promo_id=4478" charset="utf-8"></script>`,
        context: "Articles avec résultats de recherche, comparatifs"
      },
      specificRoute: {
        brand: "Kiwi.com",
        type: "Specific Route Widget",
        reward: "3%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&powered_by=true&locale=fr&from_name=paris_fr&to_name=bangkok_th&campaign_id=111&promo_id=4484" charset="utf-8"></script>`,
        context: "Articles sur routes spécifiques (Paris-Bangkok, etc.)"
      },
      popularDestinations: {
        brand: "Kiwi.com",
        type: "Popular destination widget",
        reward: "3%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&locale=fr&powered_by=true&limit=4&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&promo_id=4563&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur destinations populaires, top destinations"
      }
    },
    aviasales: {
      searchForm: {
        brand: "aviasales.com",
        type: "Flight Search Form",
        reward: "40%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&show_hotels=true&powered_by=true&locale=fr&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%23f2685f&color_icons=%2332a8dd&dark=%2311100f&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%23f2685f&border_radius=5&no_labels=true&plain=false&promo_id=7879&campaign_id=100" charset="utf-8"></script>`,
        context: "Articles sur vols, guides de réservation, comparatifs"
      },
      scheduleWidget: {
        brand: "aviasales.com",
        type: "Schedule Widget",
        reward: "40%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=usd&trs=463418&shmarker=676421&color_button=%23FF0000&target_host=www.aviasales.com%2Fsearch&locale=en&powered_by=true&origin=LON&destination=BKK&with_fallback=false&non_direct_flights=true&min_lines=5&border_radius=5&color_background=%23FFFFFF&color_text=%23000000&color_border=%23FFFFFF&promo_id=2811&campaign_id=100" charset="utf-8"></script>`,
        context: "Articles sur horaires de vol, planning de voyage"
      },
      pricingCalendar: {
        brand: "aviasales.com",
        type: "Pricing Calendar Widget",
        reward: "40%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&searchUrl=www.aviasales.com%2Fsearch&locale=fr&powered_by=true&origin=LON&destination=BKK&one_way=false&only_direct=false&period=year&range=7%2C14&primary=%230C73FE&color_background=%23FFFFFF&dark=%23000000&light=%23FFFFFF&achieve=%2345AD35&promo_id=4041&campaign_id=100" charset="utf-8"></script>`,
        context: "Articles sur meilleures périodes pour voyager, calendrier des prix"
      },
      popularRoutes: {
        brand: "aviasales.com",
        type: "Popular routes widget",
        reward: "40%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&target_host=www.aviasales.com%2Fsearch&locale=fr&limit=6&powered_by=true&primary=%230085FF&promo_id=4044&campaign_id=100" charset="utf-8"></script>`,
        context: "Articles sur routes populaires, destinations tendance"
      },
      pricesOnMap: {
        brand: "aviasales.com",
        type: "Prices on Map Widget",
        reward: "40%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=usd&trs=463418&shmarker=676421&lat=51.51&lng=0.06&powered_by=true&search_host=www.aviasales.com%2Fsearch&locale=en&origin=LON&value_min=0&value_max=1000000&round_trip=true&only_direct=false&radius=1&draggable=true&disable_zoom=false&show_logo=false&scrollwheel=false&primary=%233FABDB&secondary=%233FABDB&light=%23ffffff&width=1500&height=500&zoom=2&promo_id=4054&campaign_id=100" charset="utf-8"></script>`,
        context: "Articles géographiques, comparaisons de prix par région"
      }
    }
  },

  // ===== HÔTELS =====
  // HOTELLOOK SUPPRIMÉ - Plus de partenaire
  hotels: {
    // Section vide - Hotellook retiré
  },

  // ===== SIM CARDS / CONNECTIVITÉ =====
  connectivity: {
    airalo: {
      esimSearch: {
        brand: "Airalo.com",
        type: "Esim Search Form",
        reward: "12%",
        category: "SIM-cards",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&locale=en&powered_by=true&color_button=%23f2685f&color_focused=%23f2685f&secondary=%23FFFFFF&dark=%2311100f&light=%23FFFFFF&special=%23C4C4C4&border_radius=5&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>`,
        context: "Articles sur connectivité, eSIM, guides technologiques pour nomades"
      }
    }
  }
};

/**
 * LOGIQUE DE SÉLECTION INTELLIGENTE DES WIDGETS
 */
export class RealTravelpayoutsWidgetSelector {
  constructor() {
    this.widgets = REAL_TRAVELPAYOUTS_WIDGETS;
  }

  /**
   * Sélectionne le widget le plus pertinent selon le contexte
   */
  selectWidget(content, articleType, destination = null) {
    const keywords = this.extractKeywords(content);
    const context = this.analyzeContext(keywords, articleType, destination);
    
    return this.getBestWidget(context);
  }

  /**
   * Extrait les mots-clés pertinents du contenu
   */
  extractKeywords(content) {
    const text = content.toLowerCase();
    return {
      flights: this.hasFlightKeywords(text),
      hotels: this.hasHotelKeywords(text),
      connectivity: this.hasConnectivityKeywords(text),
      destinations: this.extractDestinations(text)
    };
  }

  /**
   * Analyse le contexte pour déterminer le type de widget
   */
  analyzeContext(keywords, articleType, destination) {
    const context = {
      type: 'general',
      priority: 'flights', // Par défaut
      destination: destination
    };

    // Logique de priorité basée sur les mots-clés
    if (keywords.flights && keywords.hotels) {
      context.type = 'travel_planning';
      context.priority = 'flights'; // Vols en priorité
    } else if (keywords.flights) {
      context.type = 'flights';
      context.priority = 'flights';
    } else if (keywords.hotels) {
      context.type = 'accommodation';
      context.priority = 'hotels';
    } else if (keywords.connectivity) {
      context.type = 'connectivity';
      context.priority = 'connectivity';
    }

    // Ajustement selon le type d'article
    if (articleType === 'temoignage') {
      context.priority = 'flights'; // Témoignages = voyages
    } else if (articleType === 'guide') {
      context.priority = keywords.hotels ? 'hotels' : 'flights';
    }

    return context;
  }

  /**
   * Retourne le meilleur widget selon le contexte
   */
  getBestWidget(context) {
    const { priority, destination } = context;

    switch (priority) {
      case 'flights':
        return this.selectFlightWidget(destination);
      case 'hotels':
        return this.selectHotelWidget(destination);
      case 'connectivity':
        return this.selectConnectivityWidget();
      default:
        return this.selectFlightWidget(destination);
    }
  }

  /**
   * Sélectionne un widget de vol
   */
  selectFlightWidget(destination) {
    // Priorité: Aviasales (40% vs 3% Kiwi)
    if (destination) {
      return {
        widget: this.widgets.flights.aviasales.searchForm,
        reason: "Formulaire de recherche de vol avec destination spécifique"
      };
    } else {
      return {
        widget: this.widgets.flights.aviasales.popularRoutes,
        reason: "Routes populaires pour contenu général"
      };
    }
  }

  /**
   * Sélectionne un widget d'hôtel
   */
  selectHotelWidget(destination) {
    // HOTELLOOK SUPPRIMÉ - Retourner un widget de vol à la place
    return {
      widget: this.widgets.flights.aviasales.searchForm,
      reason: "Hotellook supprimé - Widget de vol en remplacement"
    };
  }

  /**
   * Sélectionne un widget de connectivité
   */
  selectConnectivityWidget() {
    return {
      widget: this.widgets.connectivity.airalo.esimSearch,
      reason: "Recherche eSIM pour nomades digitaux"
    };
  }

  /**
   * Détecte les mots-clés liés aux vols
   */
  hasFlightKeywords(text) {
    const flightKeywords = [
      'vol', 'avion', 'vols', 'compagnie', 'aérien', 'aéroport', 'décollage', 'atterrissage',
      'billet', 'billets', 'réservation', 'booking', 'flight', 'airline', 'airport'
    ];
    return flightKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Détecte les mots-clés liés aux hôtels
   */
  hasHotelKeywords(text) {
    const hotelKeywords = [
      'hôtel', 'hotel', 'hébergement', 'logement', 'coliving', 'coworking', 'auberge',
      'hostel', 'airbnb', 'booking', 'réservation', 'chambre', 'appartement'
    ];
    return hotelKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Détecte les mots-clés liés à la connectivité
   */
  hasConnectivityKeywords(text) {
    const connectivityKeywords = [
      'internet', 'wifi', 'connexion', 'esim', 'sim', 'téléphone', 'mobile', 'data',
      'connectivité', 'réseau', '4g', '5g', 'roaming'
    ];
    return connectivityKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Extrait les destinations mentionnées
   */
  extractDestinations(text) {
    const destinations = [
      'thailande', 'vietnam', 'indonesie', 'singapour', 'malaisie', 'philippines',
      'cambodge', 'laos', 'myanmar', 'bangkok', 'ho chi minh', 'jakarta', 'manille',
      'kuala lumpur', 'singapour', 'phnom penh', 'vientiane', 'yangon'
    ];
    return destinations.filter(dest => text.includes(dest));
  }

  /**
   * Retourne tous les widgets disponibles par catégorie
   */
  getAllWidgetsByCategory() {
    return {
      flights: Object.values(this.widgets.flights).flat(),
      hotels: Object.values(this.widgets.hotels).flat(),
      connectivity: Object.values(this.widgets.connectivity).flat()
    };
  }

  /**
   * Retourne les widgets avec les meilleures récompenses
   */
  getHighRewardWidgets() {
    const allWidgets = this.getAllWidgetsByCategory();
    return {
      best: allWidgets.flights.filter(w => w.reward === '40%'),
      good: allWidgets.hotels.filter(w => w.reward === '40%'),
      connectivity: allWidgets.connectivity.filter(w => w.reward === '12%')
    };
  }
}

export default RealTravelpayoutsWidgetSelector;
