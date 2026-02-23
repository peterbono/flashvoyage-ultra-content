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
  // HOTELLOOK SUPPRIMÉ - Plus de partenaire hôtels dédié
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
        reward: "$1.50-$150/policy",
        category: "Insurance",
        script: `<iframe src="https://tp.media/content?campaign_id=165&promo_id=4792&shmarker=676421&trs=463418&widget=670x119" width="670" height="119" frameborder="0"> </iframe>`,
        context: "Articles sur assurance voyage USA, séjour aux États-Unis"
      },
      usaVertical: {
        brand: "Insubuy",
        type: "Insurance for USA Search Form (Vertical)",
        reward: "$1.50-$150/policy",
        category: "Insurance",
        script: `<iframe src="https://tp.media/content?campaign_id=165&promo_id=4775&shmarker=676421&trs=463418&widget=320x356" width="320" height="356" frameborder="0"> </iframe>`,
        context: "Articles sur assurance voyage USA (format vertical)"
      },
      schengenVisa: {
        brand: "Insubuy",
        type: "Schengen Visa Insurance Search Form",
        reward: "$1.50-$150/policy",
        category: "Insurance",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=4797&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur visa Schengen, assurance pour l'Europe"
      }
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
  },

  // ===== TRANSFERTS AÉROPORT / NAVETTES =====
  // Kiwitaxi en premier (couverture Asie la plus large)
  transfers: {
    kiwitaxi: {
      shuttlesSearch: {
        brand: "Kiwitaxi",
        type: "Shuttles Search Form",
        reward: "9-11%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=2949&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur transferts aéroport, navettes, arrivée dans un pays"
      },
      shortSearch: {
        brand: "Kiwitaxi",
        type: "Short and Tidy Shuttles Search Form",
        reward: "9-11%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=1486&campaign_id=111" charset="utf-8"></script>`,
        context: "Encart compact pour transferts aéroport"
      },
      reviews: {
        brand: "Kiwitaxi",
        type: "Reviews Widget",
        reward: "9-11%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=2948&campaign_id=111" charset="utf-8"></script>`,
        context: "Avis sur les transferts, retours d'expérience"
      },
      whiteLabel: {
        brand: "Kiwitaxi",
        type: "White Label",
        reward: "9-11%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=691&campaign_id=111" charset="utf-8"></script>`,
        context: "Page dédiée transferts, intégration complète"
      },
      whiteLabel2: {
        brand: "Kiwitaxi",
        type: "White Label 2.0",
        reward: "9-11%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3879&campaign_id=111" charset="utf-8"></script>`,
        context: "Page dédiée transferts, version modernisée"
      }
    },
    intui: {
      shuttlesSearch: {
        brand: "intui.travel",
        type: "Shuttles Search Form",
        reward: "10%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=1586&campaign_id=111" charset="utf-8"></script>`,
        context: "Recherche de navettes et transferts"
      },
      oneFieldSearch: {
        brand: "intui.travel",
        type: "One Field Shuttles Search Form",
        reward: "10%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3506&campaign_id=111" charset="utf-8"></script>`,
        context: "Formulaire compact une ligne pour navettes"
      },
      top3Options: {
        brand: "intui.travel",
        type: "Shuttles Search Form (Top 3 Options)",
        reward: "10%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3507&campaign_id=111" charset="utf-8"></script>`,
        context: "Top 3 options de transfert pour une destination"
      },
      shortSearch: {
        brand: "intui.travel",
        type: "Short and Tidy Shuttles Search Form",
        reward: "10%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=4674&campaign_id=111" charset="utf-8"></script>`,
        context: "Encart compact pour navettes intui.travel"
      },
      specificDestination: {
        brand: "intui.travel",
        type: "Specific Destination Widget",
        reward: "10%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3465&campaign_id=111" charset="utf-8"></script>`,
        context: "Transferts vers une destination spécifique"
      },
      specificRoute: {
        brand: "intui.travel",
        type: "Specific Route Widget",
        reward: "10%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3466&campaign_id=111" charset="utf-8"></script>`,
        context: "Route de transfert spécifique (ex: aéroport → hôtel)"
      },
      topDestinations: {
        brand: "intui.travel",
        type: "Shuttles Search Form (Top Destinations)",
        reward: "10%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=8597&campaign_id=111" charset="utf-8"></script>`,
        context: "Destinations populaires pour transferts"
      },
      topCountries: {
        brand: "intui.travel",
        type: "Shuttles Search Form (Top Countries)",
        reward: "10%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=8598&campaign_id=111" charset="utf-8"></script>`,
        context: "Pays populaires pour transferts"
      },
      whiteLabel: {
        brand: "intui.travel",
        type: "White Label",
        reward: "10%",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=1504&campaign_id=111" charset="utf-8"></script>`,
        context: "Page dédiée transferts intui.travel"
      }
    },
    welcomePickups: {
      shuttlesSearch: {
        brand: "Welcome Pickups",
        type: "Shuttles Search Form",
        reward: "—",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=8951&campaign_id=111" charset="utf-8"></script>`,
        context: "Accueil personnalisé et transfert aéroport"
      }
    },
    indrive: {
      rideSearch: {
        brand: "Indrive",
        type: "Ride Search Form",
        reward: "—",
        category: "Transfers",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=8450&campaign_id=111" charset="utf-8"></script>`,
        context: "Trajets ville-à-ville, alternative aux bus/trains"
      }
    }
  },

  // ===== TOURS & ACTIVITÉS =====
  // Tiqets en premier (large catalogue global)
  tours: {
    tiqets: {
      popularTours: {
        brand: "Tiqets",
        type: "Popular Tours Widget",
        reward: "3.5-8%",
        category: "Tours",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3947&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur activités, visites, temples, musées, que faire"
      },
      specificTour: {
        brand: "Tiqets",
        type: "Specific Tour Widget",
        reward: "3.5-8%",
        category: "Tours",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3948&campaign_id=111" charset="utf-8"></script>`,
        context: "Tour/activité spécifique dans une ville"
      },
      availabilityCalendar: {
        brand: "Tiqets",
        type: "Availability Calendar Widget",
        reward: "3.5-8%",
        category: "Tours",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3984&campaign_id=111" charset="utf-8"></script>`,
        context: "Calendrier de disponibilité pour tours et activités"
      }
    },
    wegotrip: {
      specificTours: {
        brand: "WeGoTrip",
        type: "Specific Tours Widget",
        reward: "20-41.5%",
        category: "Tours",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=4489&campaign_id=111" charset="utf-8"></script>`,
        context: "Tours audio-guidés et excursions spécifiques"
      }
    }
  },

  // ===== LOCATION VOITURES =====
  // Economybookings en premier (60% commission !)
  car_rental: {
    economybookings: {
      searchForm: {
        brand: "Economybookings.com",
        type: "Rental Cars Search Form",
        reward: "60%",
        category: "Car Rental",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=4480&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur location de voiture, road trip, explorer par la route"
      },
      dynamicBanner: {
        brand: "Economybookings.com",
        type: "Rental Cars Dynamic Banner",
        reward: "60%",
        category: "Car Rental",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=2082&campaign_id=111" charset="utf-8"></script>`,
        context: "Bannière dynamique location de voiture"
      }
    },
    qeeq: {
      searchForm: {
        brand: "QEEQ",
        type: "Rental Cars Search Form",
        reward: "—",
        category: "Car Rental",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=4850&campaign_id=111" charset="utf-8"></script>`,
        context: "Recherche location de voiture, alternative Economybookings"
      }
    },
    localrent: {
      searchForm: {
        brand: "Localrent.com",
        type: "Rental Cars Search Form",
        reward: "50%",
        category: "Car Rental",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=4322&campaign_id=111" charset="utf-8"></script>`,
        context: "Location voiture locale, agences indépendantes"
      },
      whiteLabel: {
        brand: "Localrent.com",
        type: "White Label Widget",
        reward: "50%",
        category: "Car Rental",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=2466&campaign_id=111" charset="utf-8"></script>`,
        context: "Page dédiée location locale"
      }
    },
    getrentacar: {
      searchForm: {
        brand: "GetRentacar.com",
        type: "Search form",
        reward: "—",
        category: "Car Rental",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=8813&campaign_id=111" charset="utf-8"></script>`,
        context: "Location voiture internationale"
      }
    },
    autoeurope: {
      searchForm: {
        brand: "AutoEurope (EU,UK)",
        type: "Rental Cars Search Form",
        reward: "6%/2.4%",
        category: "Car Rental",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=4362&campaign_id=111" charset="utf-8"></script>`,
        context: "Location voiture Europe et international"
      }
    }
  },

  // ===== VÉLOS & SCOOTERS =====
  bikes: {
    bikesbooking: {
      searchForm: {
        brand: "BikesBooking.com",
        type: "Rental Bikes Search Form",
        reward: "4%",
        category: "Bikes",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=5472&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur vélo, scooter, deux-roues, explorer en moto"
      }
    }
  },

  // ===== COMPENSATION VOLS =====
  flight_compensation: {
    airhelp: {
      searchForm: {
        brand: "AirHelp",
        type: "Flight Compensation Search Form",
        reward: "15-16.6%",
        category: "Flight Compensation",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=8679&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur retards, annulations, droits des passagers"
      }
    },
    compensair: {
      submitForm: {
        brand: "Compensair",
        type: "Submit Application Widget",
        reward: "€5-12/claim",
        category: "Flight Compensation",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=2110&campaign_id=111" charset="utf-8"></script>`,
        context: "Formulaire de réclamation compensation vol"
      },
      shortSubmitForm: {
        brand: "Compensair",
        type: "Short Submit Application Widget",
        reward: "€5-12/claim",
        category: "Flight Compensation",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3408&campaign_id=111" charset="utf-8"></script>`,
        context: "Formulaire court de réclamation compensation vol"
      }
    }
  },

  // ===== ÉVÉNEMENTS =====
  events: {
    ticketnetwork: {
      eventsSchedule: {
        brand: "TicketNetwork",
        type: "Events Schedule with Search Filters",
        reward: "6-12.5%",
        category: "Events",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=6086&campaign_id=111" charset="utf-8"></script>`,
        context: "Articles sur événements, concerts, spectacles, sports"
      },
      ticketsSearch: {
        brand: "TicketNetwork",
        type: "Tickets Search Form",
        reward: "6-12.5%",
        category: "Events",
        script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=8505&campaign_id=111" charset="utf-8"></script>`,
        context: "Recherche de billets pour événements"
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
      transfers: this.hasTransferKeywords(text),
      tours: this.hasTourKeywords(text),
      car_rental: this.hasCarRentalKeywords(text),
      bikes: this.hasBikeKeywords(text),
      flight_compensation: this.hasFlightCompensationKeywords(text),
      events: this.hasEventsKeywords(text),
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

    // Logique de priorité : catégories spécifiques d'abord, flights (large) en dernier
    // Ceci évite les faux-positifs (ex: 'aéroport' matche flights ET transfers)
    if (keywords.flight_compensation) {
      context.type = 'flight_compensation';
      context.priority = 'flight_compensation';
    } else if (keywords.transfers) {
      context.type = 'transfers';
      context.priority = 'transfers';
    } else if (keywords.tours) {
      context.type = 'tours';
      context.priority = 'tours';
    } else if (keywords.car_rental || keywords.bikes) {
      context.type = keywords.bikes ? 'bikes' : 'car_rental';
      context.priority = keywords.bikes ? 'bikes' : 'car_rental';
    } else if (keywords.events) {
      context.type = 'events';
      context.priority = 'events';
    } else if (keywords.connectivity) {
      context.type = 'connectivity';
      context.priority = 'connectivity';
    } else if (keywords.insurance) {
      context.type = 'insurance';
      context.priority = 'insurance';
    } else if (keywords.flights && keywords.hotels) {
      context.type = 'travel_planning';
      context.priority = 'flights';
    } else if (keywords.flights) {
      context.type = 'flights';
      context.priority = 'flights';
    } else if (keywords.hotels) {
      context.type = 'accommodation';
      context.priority = 'hotels';
    }

    // Ajustement selon le type d'article — ne remplace la priorité
    // QUE si aucun mot-clé spécifique n'a été trouvé (priorité restée à 'flights' par défaut)
    if (articleType === 'temoignage' && context.priority === 'flights') {
      context.priority = 'flights';
    } else if (articleType === 'guide' && context.priority === 'flights') {
      // En mode guide, si aucun keyword spécifique n'a matché, on préfère hotels > insurance > flights
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
      case 'transfers':
        return this.selectTransferWidget();
      case 'tours':
        return this.selectTourWidget();
      case 'car_rental':
        return this.selectCarRentalWidget();
      case 'bikes':
        return this.selectBikeWidget();
      case 'flight_compensation':
        return this.selectFlightCompensationWidget();
      case 'events':
        return this.selectEventsWidget();
      default:
        return this.selectFlightWidget(destination);
    }
  }

  /**
   * Sélectionne un widget de vol
   */
  selectFlightWidget(destination) {
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
    // Pas de partenaire hôtels dédié — fallback vers vols
    return {
      widget: this.widgets.flights.aviasales.searchForm,
      reason: "Pas de partenaire hôtels — Widget de vol en remplacement"
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
   * Sélectionne un widget d'assurance
   */
  selectInsuranceWidget() {
    return {
      widget: this.widgets.insurance.visitorCoverage.travelMedical,
      reason: "Assurance voyage médicale pour lecteurs"
    };
  }

  /**
   * Sélectionne un widget de transferts
   */
  selectTransferWidget() {
    return {
      widget: this.widgets.transfers.kiwitaxi.shuttlesSearch,
      reason: "Recherche de navettes/transferts aéroport (Kiwitaxi)"
    };
  }

  /**
   * Sélectionne un widget de tours/activités
   */
  selectTourWidget() {
    return {
      widget: this.widgets.tours.tiqets.popularTours,
      reason: "Tours et activités populaires (Tiqets)"
    };
  }

  /**
   * Sélectionne un widget de location de voiture
   */
  selectCarRentalWidget() {
    return {
      widget: this.widgets.car_rental.economybookings.searchForm,
      reason: "Location de voiture (Economybookings — 60% commission)"
    };
  }

  /**
   * Sélectionne un widget de vélo/scooter
   */
  selectBikeWidget() {
    return {
      widget: this.widgets.bikes.bikesbooking.searchForm,
      reason: "Location de vélo/scooter (BikesBooking)"
    };
  }

  /**
   * Sélectionne un widget de compensation vol
   */
  selectFlightCompensationWidget() {
    return {
      widget: this.widgets.flight_compensation.airhelp.searchForm,
      reason: "Compensation vol (AirHelp)"
    };
  }

  /**
   * Sélectionne un widget d'événements
   */
  selectEventsWidget() {
    return {
      widget: this.widgets.events.ticketnetwork.eventsSchedule,
      reason: "Événements et spectacles (TicketNetwork)"
    };
  }

  // ===== KEYWORD DETECTION METHODS =====

  hasFlightKeywords(text) {
    // Mots-clés exacts (word-boundary) pour éviter les faux positifs:
    // 'vol' matcherait 'vol annulé' (compensation), 'billet' matcherait 'billetterie' (events)
    const exactKw = ['vol', 'vols', 'billet', 'billets'];
    const substringKw = [
      'avion', 'compagnie aérien', 'aérien', 'décollage', 'atterrissage',
      'billet d\'avion', 'vol pas cher', 'vol direct', 'réserver un vol',
      'flight', 'airline', 'airport', 'compagnie low cost'
    ];
    const hasExact = exactKw.some(k => {
      const regex = new RegExp('\\b' + k + '\\b');
      // Vérifie que le mot est isolé ET pas dans un contexte compensation/events
      if (!regex.test(text)) return false;
      // 'vol' dans 'vol annulé/retardé' → pas un keyword flight
      if (k === 'vol' && /vol\s+(annulé|retardé|supprimé|en retard)/.test(text)) return false;
      // 'billet' dans 'billetterie' → pas un keyword flight
      if ((k === 'billet' || k === 'billets') && text.includes('billetterie')) return false;
      return true;
    });
    return hasExact || substringKw.some(k => text.includes(k));
  }

  hasHotelKeywords(text) {
    const kw = [
      'hôtel', 'hotel', 'hébergement', 'logement', 'coliving', 'coworking', 'auberge',
      'hostel', 'airbnb', 'booking', 'réservation', 'chambre', 'appartement'
    ];
    return kw.some(k => text.includes(k));
  }

  hasConnectivityKeywords(text) {
    const kw = [
      'internet', 'wifi', 'connexion', 'esim', 'sim', 'téléphone', 'mobile', 'data',
      'connectivité', 'réseau', '4g', '5g', 'roaming'
    ];
    return kw.some(k => text.includes(k));
  }

  hasInsuranceKeywords(text) {
    const kw = [
      'assurance', 'santé', 'sécurité', 'protection', 'couverture', 'visa', 'schengen',
      'medical', 'urgence', 'hospital', 'accident', 'bagage'
    ];
    return kw.some(k => text.includes(k));
  }

  hasTransferKeywords(text) {
    const kw = [
      'transfert', 'navette', 'shuttle', 'taxi', 'pickup', 'pick-up', 'trajet',
      'chauffeur', 'accueil', 'arrivée aéroport', 'depuis l\'aéroport'
    ];
    return kw.some(k => text.includes(k));
  }

  hasTourKeywords(text) {
    const kw = [
      'visite guidée', 'excursion', 'activité', 'activités', 'que faire', 'billet d\'entrée',
      'musée', 'temple', 'guide local', 'food tour', 'street food tour', 'day trip'
    ];
    return kw.some(k => text.includes(k));
  }

  hasCarRentalKeywords(text) {
    const kw = [
      'location voiture', 'location de voiture', 'louer une voiture', 'rental car',
      'voiture de location', 'road trip', 'conduire', 'permis international'
    ];
    return kw.some(k => text.includes(k));
  }

  hasBikeKeywords(text) {
    const kw = [
      'vélo', 'scooter', 'moto', 'bike', 'deux-roues', 'louer un scooter',
      'louer une moto', 'motorbike', 'location scooter', 'location moto'
    ];
    return kw.some(k => text.includes(k));
  }

  hasFlightCompensationKeywords(text) {
    const kw = [
      'retard de vol', 'vol annulé', 'compensation', 'indemnisation',
      'réclamation', 'droits des passagers', 'EU261', 'remboursement vol'
    ];
    return kw.some(k => text.includes(k));
  }

  hasEventsKeywords(text) {
    const kw = [
      'concert', 'spectacle', 'événement', 'événements', 'festival', 'match',
      'billet spectacle', 'billet concert', 'ticket', 'sport', 'théâtre',
      'opéra', 'show', 'live event', 'billetterie'
    ];
    return kw.some(k => text.includes(k));
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
      insurance: flattenCategory(this.widgets.insurance),
      transfers: flattenCategory(this.widgets.transfers),
      tours: flattenCategory(this.widgets.tours),
      car_rental: flattenCategory(this.widgets.car_rental),
      bikes: flattenCategory(this.widgets.bikes),
      flight_compensation: flattenCategory(this.widgets.flight_compensation),
      events: flattenCategory(this.widgets.events)
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
