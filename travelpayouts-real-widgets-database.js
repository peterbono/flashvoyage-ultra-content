/**
 * BASE DE DONNÉES RÉELLE DES WIDGETS TRAVELPAYOUTS
 * Basée sur le fichier CSV fourni par l'utilisateur
 * Partner ID: 463418, Marker: 676421
 *
 * Ordre flights: aviasales en premier (40% reward) pour que le placer utilise
 * le Flight Search Form Aviasales par défaut.
 */

import { isKnownLocation } from './airport-lookup.js';

export const REAL_TRAVELPAYOUTS_WIDGETS = {
  // ===== VOLS (FLIGHTS) =====
  // aviasales en premier pour sélection par défaut (getWidgetScript prend le premier provider)
  flights: {
    aviasales: {
      searchForm: {
        brand: "aviasales.com",
        type: "Flight Search Form",
        reward: "40%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&show_hotels=true&powered_by=true&locale=fr&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100" charset="utf-8"></script>`,
        context: "Articles sur vols, guides de réservation, comparatifs"
      },
      scheduleWidget: {
        brand: "aviasales.com",
        type: "Schedule Widget",
        reward: "40%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&color_button=%23FF0000&target_host=www.aviasales.com%2Fsearch&locale=fr&powered_by=true&origin=LON&destination=BKK&with_fallback=false&non_direct_flights=true&min_lines=5&border_radius=0&color_background=%23FFFFFF&color_text=%23000000&color_border=%23FFFFFF&promo_id=2811&campaign_id=100" charset="utf-8"></script>`,
        context: "Articles sur horaires de vol, planning de voyage"
      },
      pricingCalendar: {
        brand: "aviasales.com",
        type: "Pricing Calendar Widget",
        reward: "40%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&searchUrl=www.aviasales.com%2Fsearch&locale=fr&powered_by=true&one_way=false&only_direct=false&period=year&range=7%2C14&primary=%230C73FE&color_background=%23ffffff&dark=%23000000&light=%23FFFFFF&achieve=%2345AD35&promo_id=4041&campaign_id=100" charset="utf-8"></script>`,
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
        type: "Price on Map Widget",
        reward: "40%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&lat=51.51&lng=0.06&powered_by=true&search_host=www.aviasales.com%2Fsearch&locale=en&origin=LON&value_min=0&value_max=1000000&round_trip=true&only_direct=false&radius=1&draggable=true&disable_zoom=false&show_logo=false&scrollwheel=false&primary=%233FABDB&secondary=%233FABDB&light=%23ffffff&width=1500&height=500&zoom=2&promo_id=4054&campaign_id=100" charset="utf-8"></script>`,
        context: "Articles géographiques, comparaisons de prix par région"
      }
    },
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
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&locale=fr&stops=any&show_hotels=true&powered_by=true&border_radius=0&plain=true&color_button=%2300A991&color_button_text=%23ffffff&promo_id=3414&campaign_id=111" charset="utf-8"></script>`,
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
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&powered_by=true&locale=fr&campaign_id=111&promo_id=4484" charset="utf-8"></script>`,
        context: "Articles sur routes spécifiques (Paris-Bangkok, etc.)"
      },
      popularDestinations: {
        brand: "Kiwi.com",
        type: "Popular Destinations Widget",
        reward: "3%",
        category: "Flights",
        script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&locale=fr&powered_by=true&limit=4&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&promo_id=4563&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur destinations populaires, top destinations"
      }
    }
  },

  // ===== HÔTELS =====
  // HOTELLOOK SUPPRIMÉ - Plus de partenaire
  hotels: {
    // Section vide - Hotellook retiré
  },

  // ===== ASSURANCE (INSURANCE) =====
  // visitorCoverage en premier pour sélection par défaut (widget le plus générique)
  insurance: {
    visitorCoverage: {
      travelMedical: {
        brand: "VisitorCoverage",
        type: "Travel medical insurance",
        reward: "—",
        category: "Insurance",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&type=visitor&theme=small-theme1&powered_by=true&campaign_id=153&promo_id=4652" charset="utf-8"></script>`,
        context: "Articles sur assurance voyage, santé, visa Schengen, USA"
      }
    },
    insubuy: {
      usaHorizontal: {
        brand: "Insubuy",
        type: "Insurance for USA Search Form (Horizontal)",
        reward: "—",
        category: "Insurance",
        script: `<iframe src="https://tp.media/content?campaign_id=165&promo_id=4792&shmarker=676421&trs=463418&widget=670x119" width="670" height="119" frameborder="0"> </iframe>`,
        context: "Articles sur assurance voyage USA, séjour aux États-Unis"
      },
      usaVertical: {
        brand: "Insubuy",
        type: "Insurance for USA Search Form (Vertical)",
        reward: "—",
        category: "Insurance",
        script: `<iframe src="https://tp.media/content?campaign_id=165&promo_id=4775&shmarker=676421&trs=463418&widget=320x356" width="320" height="356" frameborder="0"> </iframe>`,
        context: "Articles sur assurance voyage USA (format vertical)"
      }
      // schengenVisa: à ajouter quand l'URL Insubuy Schengen sera fournie (actuellement non fournie)
    }
  },

  // ===== SIM CARDS / CONNECTIVITÉ =====
  connectivity: {
    airalo: {
      esimSearch: {
        brand: "Airalo.com",
        type: "Esim Search Form",
        reward: "12%",
        category: "SIM-cards",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&locale=en&powered_by=true&color_button=%2332a8dd&color_focused=%2332a8dd&secondary=%23FFFFFF&dark=%23262626&light=%23FFFFFF&special=%23C4C4C4&border_radius=0&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>`,
        context: "Articles sur connectivité, eSIM, guides technologiques pour nomades"
      }
    }
  },

  // ===== ESIM (alias pour connectivity) =====
  esim: {
    airalo: {
      esimSearch: {
        brand: "Airalo.com",
        type: "Esim Search Form",
        reward: "12%",
        category: "SIM-cards",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&locale=en&powered_by=true&color_button=%2332a8dd&color_focused=%2332a8dd&secondary=%23FFFFFF&dark=%23262626&light=%23FFFFFF&special=%23C4C4C4&border_radius=0&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>`,
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
      insurance: this.hasInsuranceKeywords(text),
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
    } else if (keywords.insurance) {
      context.type = 'insurance';
      context.priority = 'insurance';
    }

    // Ajustement selon le type d'article
    if (articleType === 'temoignage') {
      context.priority = 'flights'; // Témoignages = voyages
    } else if (articleType === 'guide') {
      context.priority = keywords.hotels ? 'hotels' : keywords.insurance ? 'insurance' : 'flights';
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
      case 'insurance':
        return this.selectInsuranceWidget();
      default:
        return this.selectFlightWidget(destination);
    }
  }

  /**
   * Sélectionne un widget de vol
   */
  selectFlightWidget(destination) {
    // Priorité: Aviasales (40% vs 3% Kiwi) - aviasales est en premier dans l'objet
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
   * Sélectionne un widget d'assurance (premier disponible = VisitorCoverage travelMedical)
   */
  selectInsuranceWidget() {
    return {
      widget: this.widgets.insurance.visitorCoverage.travelMedical,
      reason: "Assurance voyage médicale pour lecteurs"
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
   * Détecte les mots-clés liés à l'assurance
   */
  hasInsuranceKeywords(text) {
    const insuranceKeywords = [
      'assurance', 'santé', 'sécurité', 'protection', 'couverture', 'visa', 'schengen',
      'medical', 'urgence', 'hospital', 'accident', 'vol', 'bagage'
    ];
    return insuranceKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Extrait les destinations mentionnées
   */
  extractDestinations(text) {
    // Détection dynamique via BDD OpenFlights (5600+ entrées)
    const words = text.toLowerCase().split(/[\s,;.()!?]+/).filter(w => w.length > 2);
    const found = [];
    const seen = new Set();
    for (const word of words) {
      if (!seen.has(word) && isKnownLocation(word)) {
        found.push(word);
        seen.add(word);
      }
    }
    return found;
  }

  /**
   * Retourne tous les widgets disponibles par catégorie
   */
  getAllWidgetsByCategory() {
    const flattenCategory = (cat) => {
      if (!cat || typeof cat !== 'object') return [];
      return Object.values(cat).flatMap(provider =>
        typeof provider === 'object' && provider !== null
          ? Object.values(provider).filter(v => v && typeof v === 'object' && v.script)
          : []
      );
    };
    return {
      flights: flattenCategory(this.widgets.flights),
      hotels: flattenCategory(this.widgets.hotels),
      connectivity: flattenCategory(this.widgets.connectivity),
      insurance: flattenCategory(this.widgets.insurance)
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
      connectivity: allWidgets.connectivity.filter(w => w.reward === '12%'),
      insurance: allWidgets.insurance
    };
  }
}

export default RealTravelpayoutsWidgetSelector;
