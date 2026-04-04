#!/usr/bin/env node

/**
 * CONTEXTUAL AFFILIATE INJECTOR
 * Phase 5.A - Plan d'injection déterministe basé sur extracted + pattern + story
 * 
 * Règles strictes:
 * - Zéro modification HTML
 * - Zéro LLM
 * - Heuristiques basées sur keywords + pattern/story
 * - Gouvernance anti-spam (max 2 placements, max 3 pour guide)
 */

/**
 * Décide les placements d'affiliation contextuels
 * @param {Object} input - Données d'entrée
 * @param {Object} input.extracted - Données extraites (title, selftext, geo, meta)
 * @param {Object} input.pattern - Pattern détecté (theme_primary, themes_secondary, story_type, etc.)
 * @param {Object} input.story - Story compilée (story.*, evidence.source_snippets)
 * @param {Object} input.geo_defaults - Géolocalisation par défaut (country, city, nearest_hub)
 * @param {Object} [input.angle] - Angle Hunter result (optionnel)
 * @returns {Object} { placements: [...], debug: {...} }
 */
export function decideAffiliatePlacements({ extracted, pattern, story, geo_defaults, angle }) {
  const placements = [];
  const debug = {
    matched: {},
    skipped: {}
  };

  // PHASE 2.3a: Résoudre IATA destination depuis city/country
  const COUNTRY_HUB_MAP = {
    vietnam: 'SGN', thailande: 'BKK', thailand: 'BKK', indonesie: 'DPS', indonesia: 'DPS',
    philippines: 'MNL', japon: 'NRT', japan: 'NRT', coree: 'ICN', korea: 'ICN',
    malaisie: 'KUL', malaysia: 'KUL', singapour: 'SIN', singapore: 'SIN',
    cambodge: 'PNH', cambodia: 'PNH', myanmar: 'RGN', birmanie: 'RGN',
    laos: 'VTE', inde: 'DEL', india: 'DEL', chine: 'PEK', china: 'PEK',
    taiwan: 'TPE', hong_kong: 'HKG', sri_lanka: 'CMB', nepal: 'KTM'
  };
  const CITY_IATA_MAP = {
    hanoi: 'HAN', 'ha noi': 'HAN', 'hà nội': 'HAN',
    'ho chi minh': 'SGN', saigon: 'SGN', 'hô chi minh': 'SGN', 'hô-chi-minh': 'SGN',
    bangkok: 'BKK', 'chiang mai': 'CNX', phuket: 'HKT',
    bali: 'DPS', denpasar: 'DPS', jakarta: 'CGK',
    manila: 'MNL', cebu: 'CEB',
    tokyo: 'NRT', osaka: 'KIX', kyoto: 'KIX',
    seoul: 'ICN', busan: 'PUS',
    'kuala lumpur': 'KUL', penang: 'PEN',
    'phnom penh': 'PNH', 'siem reap': 'REP',
    vientiane: 'VTE', 'luang prabang': 'LPQ',
    singapour: 'SIN', singapore: 'SIN'
  };
  function resolveIATA(geo_defaults) {
    const city = (geo_defaults?.city || '').toLowerCase().trim();
    if (city && CITY_IATA_MAP[city]) return CITY_IATA_MAP[city];
    if (geo_defaults?.nearest_hub && /^[A-Z]{3}$/.test(geo_defaults.nearest_hub)) return geo_defaults.nearest_hub;
    const country = (geo_defaults?.country || geo_defaults?.destination || '').toLowerCase().trim();
    if (country && COUNTRY_HUB_MAP[country]) return COUNTRY_HUB_MAP[country];
    return null;
  }
  const resolvedIATA = resolveIATA(geo_defaults);

  // Injecter le placement prioritaire depuis l'Angle Hunter si resolver présent
  const resolver = angle?.business_vector?.affiliate_friction?.resolver;
  if (resolver) {
    const resolverToId = {
      insurance: 'insurance',
      bank_card: 'flights',
      esim: 'esim',
      flight: 'flights',
      accommodation: 'accommodation',
      vpn: 'esim',
      tours: 'tours',
      gear: 'car_rental',
      transfers: 'transfers',
      car_rental: 'car_rental',
      bikes: 'bikes',
      flight_compensation: 'flight_compensation',
      events: 'events'
    };
    const placementId = resolverToId[resolver] || resolver;
    const friction = angle.business_vector.affiliate_friction;
    placements.push({
      id: placementId,
      priority: 0,
      anchor: 'after_critical_moment',
      reason: [
        `angle_hunter_resolver: ${resolver}`,
        `friction_moment: ${friction.moment?.substring(0, 60) || 'n/a'}`,
        `cost_of_inaction: ${friction.cost_of_inaction?.substring(0, 60) || 'n/a'}`
      ],
      confidence: 95,
      payload: {
        type: placementId,
        country: geo_defaults?.country || 'asia',
        city: geo_defaults?.city || null,
        iata_destination: resolvedIATA || 'BKK',
        iata_origin: geo_defaults?.origin || 'PAR',
        source: 'angle_hunter',
        friction_moment: friction.moment || null,
        friction_cost: friction.cost_of_inaction || null
      }
    });
    debug.matched.angle_hunter = { resolver, placementId, iata: resolvedIATA, confidence: 95 };
    console.log(`   ✅ AFFILIATE_ANGLE_HUNTER: resolver=${resolver} → placement=${placementId} iata=${resolvedIATA || 'BKK'} (confidence=95)`);
  }

  // Construire le texte complet pour recherche de keywords
  const fullText = [
    extracted.source?.title || extracted.title || '',
    extracted.selftext || '',
    ...(story?.evidence?.source_snippets || []).map(s => s.snippet || '').filter(Boolean)
  ].join(' ').toLowerCase();

  // 1. INSURANCE
  const insuranceKeywords = ['sick', 'ill', 'hospital', 'injury', 'accident', 'claim', 'reimbursement', 'stolen', 'theft', 'baggage', 'missed flight', 'delay', 'medical', 'emergency', 'ambulance', 'doctor', 'clinic', 'assurance', 'santé', 'hôpital', 'maladie', 'urgence'];
  const insuranceThemeMatch = pattern?.theme_primary === 'health' || pattern?.theme_primary === 'safety' || 
                               pattern?.themes_secondary?.includes('health') || pattern?.themes_secondary?.includes('safety');
  const insuranceKeywordMatch = insuranceKeywords.some(kw => fullText.includes(kw));
  
  if (insuranceThemeMatch || insuranceKeywordMatch) {
    const reasons = [];
    if (insuranceThemeMatch) reasons.push(`theme_primary=${pattern.theme_primary}`);
    if (insuranceKeywordMatch) {
      const matchedKw = insuranceKeywords.find(kw => fullText.includes(kw));
      reasons.push(`matched_keywords: ${matchedKw}`);
    }
    
    placements.push({
      id: 'insurance',
      priority: 1,
      anchor: 'after_critical_moment',
      reason: reasons,
      confidence: insuranceThemeMatch && insuranceKeywordMatch ? 90 : insuranceThemeMatch ? 75 : 60,
      payload: {
        type: 'insurance',
        destination: geo_defaults?.country || 'asia'
      }
    });
    debug.matched.insurance = { reasons, confidence: placements[placements.length - 1].confidence };
  } else {
    debug.skipped.insurance = 'no theme or keyword match';
  }

  // 2. ESIM / CONNECTIVITY
  const esimKeywords = ['sim', 'roaming', 'data', 'signal', 'internet', 'whatsapp', '4g', '5g', 'wifi', 'connection', 'connectivity', 'esim', 'e-sim', 'airalo', 'holafly', 'données mobiles', 'téléphone'];
  const esimThemeMatch = pattern?.theme_primary === 'esim_connectivity' || pattern?.themes_secondary?.includes('esim_connectivity');
  const esimKeywordMatch = esimKeywords.some(kw => fullText.includes(kw));
  const multiCountry = geo_defaults && (fullText.includes('multiple') || fullText.includes('several') || fullText.includes('various'));
  
  if (esimThemeMatch || esimKeywordMatch || multiCountry) {
    const reasons = [];
    if (esimThemeMatch) reasons.push(`theme_primary=${pattern.theme_primary}`);
    if (esimKeywordMatch) {
      const matchedKw = esimKeywords.find(kw => fullText.includes(kw));
      reasons.push(`matched_keywords: ${matchedKw}`);
    }
    if (multiCountry) reasons.push('multi-country trip detected');
    
    placements.push({
      id: 'esim',
      priority: 2,
      anchor: 'after_context',
      reason: reasons,
      confidence: esimThemeMatch && esimKeywordMatch ? 85 : esimThemeMatch ? 70 : esimKeywordMatch ? 65 : 50,
      payload: {
        type: 'connectivity',
        destination: geo_defaults?.country || 'asia',
        multi_country: multiCountry
      }
    });
    debug.matched.esim = { reasons, confidence: placements[placements.length - 1].confidence };
  } else {
    debug.skipped.esim = 'no theme or keyword match';
  }

  // 3. FLIGHTS
  const flightsKeywords = ['flight', 'connection', 'layover', 'delayed', 'cancelled', 'missed connection', 'airport', 'airline', 'booking', 'ticket', 'departure', 'arrival', 'vol', 'avion', 'aéroport', 'billet'];
  const flightsKeywordMatch = flightsKeywords.some(kw => fullText.includes(kw));
  const longTrip = story?.story?.context?.summary && story.story.context.summary.length > 500; // Long context = probable long trip
  
  // Flights matche par keywords OU par destination identifiée (fallback universel pour articles voyage)
  const hasDestination = !!(geo_defaults?.destination || geo_defaults?.country);
  if (flightsKeywordMatch || longTrip || hasDestination) {
    const reasons = [];
    if (flightsKeywordMatch) {
      const matchedKw = flightsKeywords.find(kw => fullText.includes(kw));
      reasons.push(`matched_keywords: ${matchedKw}`);
    }
    if (longTrip) reasons.push('long trip detected');
    if (!flightsKeywordMatch && !longTrip && hasDestination) reasons.push('destination identified (fallback)');
    
    placements.push({
      id: 'flights',
      priority: 3,
      anchor: 'after_central_event',
      confidence: flightsKeywordMatch ? (longTrip ? 80 : 70) : hasDestination ? 55 : 50,
      reason: reasons,
      payload: {
        type: 'flights',
        origin: geo_defaults?.origin || 'PAR',
        destination: geo_defaults?.nearest_hub || geo_defaults?.destination || 'BKK',
        country: geo_defaults?.country || 'asia'
      }
    });
    debug.matched.flights = { reasons, confidence: placements[placements.length - 1].confidence };
  } else {
    debug.skipped.flights = 'no keyword match, long trip, or destination';
  }

  // 4. ACCOMMODATION
  const accommodationKeywords = ['hotel', 'hostel', 'booking', 'airbnb', 'accommodation', 'lodging', 'stay', 'reservation', 'check-in', 'check-out', 'room', 'hôtel', 'hébergement', 'logement', 'auberge', 'chambre'];
  const accommodationKeywordMatch = accommodationKeywords.some(kw => fullText.includes(kw));
  
  if (accommodationKeywordMatch) {
    const matchedKw = accommodationKeywords.find(kw => fullText.includes(kw));
    placements.push({
      id: 'accommodation',
      priority: 4,
      anchor: 'after_resolution',
      reason: [`matched_keywords: ${matchedKw}`],
      confidence: 65,
      payload: {
        type: 'accommodation',
        destination: geo_defaults?.country || 'asia',
        city: geo_defaults?.city || null
      }
    });
    debug.matched.accommodation = { reasons: [`matched_keywords: ${matchedKw}`], confidence: 65 };
  } else {
    debug.skipped.accommodation = 'no keyword match';
  }

  // 5. COWORKING
  const coworkingKeywords = ['coworking', 'workspace', 'remote work', 'laptop', 'productivity', 'wifi', 'office', 'desk', 'working', 'nomad', 'digital nomad'];
  const coworkingKeywordMatch = coworkingKeywords.some(kw => fullText.includes(kw));
  const coworkingThemeMatch = pattern?.theme_primary === 'work' || pattern?.themes_secondary?.includes('work');
  
  if (coworkingKeywordMatch || coworkingThemeMatch) {
    const reasons = [];
    if (coworkingThemeMatch) reasons.push(`theme_primary=${pattern.theme_primary}`);
    if (coworkingKeywordMatch) {
      const matchedKw = coworkingKeywords.find(kw => fullText.includes(kw));
      reasons.push(`matched_keywords: ${matchedKw}`);
    }
    
    placements.push({
      id: 'coworking',
      priority: 5,
      anchor: 'before_related',
      reason: reasons,
      confidence: coworkingThemeMatch && coworkingKeywordMatch ? 75 : coworkingKeywordMatch ? 60 : 50,
      payload: {
        type: 'coworking',
        destination: geo_defaults?.country || 'asia',
        city: geo_defaults?.city || null
      }
    });
    debug.matched.coworking = { reasons, confidence: placements[placements.length - 1].confidence };
  } else {
    debug.skipped.coworking = 'no theme or keyword match';
  }

  // 6. TRANSFERS
  const transfersKeywords = ['transfer', 'shuttle', 'taxi', 'pickup', 'chauffeur', 'navette', 'depuis l\'aéroport', 'arrivée aéroport', 'airport pickup', 'private driver'];
  const transfersKeywordMatch = transfersKeywords.some(kw => fullText.includes(kw));
  
  if (transfersKeywordMatch) {
    const matchedKw = transfersKeywords.find(kw => fullText.includes(kw));
    placements.push({
      id: 'transfers',
      priority: 7,
      anchor: 'after_context',
      reason: [`matched_keywords: ${matchedKw}`],
      confidence: 65,
      payload: {
        type: 'transfers',
        destination: geo_defaults?.country || 'asia',
        city: geo_defaults?.city || null
      }
    });
    debug.matched.transfers = { reasons: [`matched_keywords: ${matchedKw}`], confidence: 65 };
  } else {
    debug.skipped.transfers = 'no keyword match';
  }

  // 7. TOURS & ACTIVITIES
  const toursKeywords = ['tour', 'excursion', 'museum', 'temple', 'activity', 'activities', 'guide', 'visite', 'things to do', 'food tour', 'attraction', 'sightseeing', 'day trip'];
  const toursKeywordMatch = toursKeywords.some(kw => fullText.includes(kw));
  
  if (toursKeywordMatch) {
    const matchedKw = toursKeywords.find(kw => fullText.includes(kw));
    placements.push({
      id: 'tours',
      priority: 8,
      anchor: 'after_context',
      reason: [`matched_keywords: ${matchedKw}`],
      confidence: 65,
      payload: {
        type: 'tours',
        destination: geo_defaults?.country || 'asia',
        city: geo_defaults?.city || null
      }
    });
    debug.matched.tours = { reasons: [`matched_keywords: ${matchedKw}`], confidence: 65 };
  } else {
    debug.skipped.tours = 'no keyword match';
  }

  // 8. CAR RENTAL
  const carRentalKeywords = ['rental car', 'rent a car', 'location voiture', 'location de voiture', 'road trip', 'driving', 'driver\'s license', 'voiture', 'conduire', 'louer une voiture', 'car hire'];
  const carRentalKeywordMatch = carRentalKeywords.some(kw => fullText.includes(kw));
  
  if (carRentalKeywordMatch) {
    const matchedKw = carRentalKeywords.find(kw => fullText.includes(kw));
    placements.push({
      id: 'car_rental',
      priority: 9,
      anchor: 'after_context',
      reason: [`matched_keywords: ${matchedKw}`],
      confidence: 65,
      payload: {
        type: 'car_rental',
        destination: geo_defaults?.country || 'asia',
        city: geo_defaults?.city || null
      }
    });
    debug.matched.car_rental = { reasons: [`matched_keywords: ${matchedKw}`], confidence: 65 };
  } else {
    debug.skipped.car_rental = 'no keyword match';
  }

  // 9. BIKES & SCOOTERS
  const bikesKeywords = ['scooter', 'bike', 'motorcycle', 'motorbike', 'moto', 'velo', 'vélo', 'deux-roues', 'louer un scooter', 'louer une moto'];
  const bikesKeywordMatch = bikesKeywords.some(kw => fullText.includes(kw));
  
  if (bikesKeywordMatch) {
    const matchedKw = bikesKeywords.find(kw => fullText.includes(kw));
    placements.push({
      id: 'bikes',
      priority: 10,
      anchor: 'after_context',
      reason: [`matched_keywords: ${matchedKw}`],
      confidence: 65,
      payload: {
        type: 'bikes',
        destination: geo_defaults?.country || 'asia'
      }
    });
    debug.matched.bikes = { reasons: [`matched_keywords: ${matchedKw}`], confidence: 65 };
  } else {
    debug.skipped.bikes = 'no keyword match';
  }

  // 10. FLIGHT COMPENSATION
  const flightCompKeywords = ['delayed flight', 'cancelled flight', 'compensation', 'indemnisation', 'eu261', 'claim', 'vol annulé', 'retard de vol', 'flight delay', 'overbooking'];
  const flightCompKeywordMatch = flightCompKeywords.some(kw => fullText.includes(kw));
  
  if (flightCompKeywordMatch) {
    const matchedKw = flightCompKeywords.find(kw => fullText.includes(kw));
    placements.push({
      id: 'flight_compensation',
      priority: 11,
      anchor: 'after_critical_moment',
      reason: [`matched_keywords: ${matchedKw}`],
      confidence: 75,
      payload: {
        type: 'flight_compensation'
      }
    });
    debug.matched.flight_compensation = { reasons: [`matched_keywords: ${matchedKw}`], confidence: 75 };
  } else {
    debug.skipped.flight_compensation = 'no keyword match';
  }

  // 11. EVENTS
  const eventsKeywords = ['concert', 'festival', 'show', 'event', 'match', 'sport', 'theatre', 'theater', 'spectacle', 'live music', 'billetterie'];
  const eventsKeywordMatch = eventsKeywords.some(kw => fullText.includes(kw));
  
  if (eventsKeywordMatch) {
    const matchedKw = eventsKeywords.find(kw => fullText.includes(kw));
    placements.push({
      id: 'events',
      priority: 12,
      anchor: 'before_related',
      reason: [`matched_keywords: ${matchedKw}`],
      confidence: 60,
      payload: {
        type: 'events',
        destination: geo_defaults?.country || 'asia'
      }
    });
    debug.matched.events = { reasons: [`matched_keywords: ${matchedKw}`], confidence: 60 };
  } else {
    debug.skipped.events = 'no keyword match';
  }

  // 12. OPPORTUNITÉS DANS SECTION "ERREURS À ÉVITER"
  // Détecter si l'article mentionne des erreurs, problèmes, ou conseils d'évitement
  const errorsKeywords = ['mistake', 'error', 'wrong', 'avoid', 'don\'t', 'shouldn\'t', 'problem', 'issue', 'difficulty', 'challenge', 'erreur', 'éviter', 'problème', 'difficulté'];
  const errorsKeywordMatch = errorsKeywords.some(kw => fullText.includes(kw));
  // Vérifier aussi si le story contient des erreurs fréquentes
  const hasErrorsSection = story?.story?.community_insights && 
                          (story.story.community_insights.toLowerCase().includes('error') ||
                           story.story.community_insights.toLowerCase().includes('mistake') ||
                           story.story.community_insights.toLowerCase().includes('éviter') ||
                           story.story.community_insights.toLowerCase().includes('erreur'));
  
  if (errorsKeywordMatch || hasErrorsSection) {
    const reasons = [];
    if (errorsKeywordMatch) {
      const matchedKw = errorsKeywords.find(kw => fullText.includes(kw));
      reasons.push(`matched_keywords: ${matchedKw}`);
    }
    if (hasErrorsSection) reasons.push('errors section detected in story');
    
    // Proposer un placement d'assurance ou eSIM selon le contexte (les erreurs nécessitent souvent ces outils)
    // Priorité à l'assurance si keywords santé/sécurité, sinon eSIM
    const hasHealthKeywords = ['sick', 'hospital', 'medical', 'injury', 'accident'].some(kw => fullText.includes(kw));
    const placementId = hasHealthKeywords ? 'insurance' : 'esim';
    
    placements.push({
      id: placementId,
      priority: 6,
      anchor: 'after_errors',
      reason: reasons,
      confidence: errorsKeywordMatch && hasErrorsSection ? 70 : errorsKeywordMatch ? 60 : 50,
      payload: {
        type: placementId,
        destination: geo_defaults?.country || 'asia',
        origin: geo_defaults?.origin || null
      }
    });
    debug.matched[`errors_${placementId}`] = { reasons, confidence: placements[placements.length - 1].confidence };
  } else {
    debug.skipped.errors_placement = 'no error keywords or errors section detected';
  }

  // GOUVERNANCE ANTI-SPAM
  // Déduplication par id
  const uniquePlacements = [];
  const seenIds = new Set();
  for (const placement of placements) {
    if (!seenIds.has(placement.id)) {
      seenIds.add(placement.id);
      uniquePlacements.push(placement);
    }
  }

  // Filter out low-confidence placements (confidence < 50 = not worth a widget)
  const MIN_CONFIDENCE = 50;
  const confidentPlacements = uniquePlacements.filter(p => {
    if (p.confidence < MIN_CONFIDENCE) {
      debug.skipped[`${p.id}_low_confidence`] = `confidence=${p.confidence} < ${MIN_CONFIDENCE}`;
      console.log(`   ⚠️ AFFILIATE_LOW_CONFIDENCE: skipping ${p.id} (confidence=${p.confidence} < ${MIN_CONFIDENCE})`);
      return false;
    }
    return true;
  });

  // Trier par priority (1 = plus important)
  confidentPlacements.sort((a, b) => a.priority - b.priority);

  // Cap max placements
  const maxPlacements = pattern?.story_type === 'guide' ? 3 : 2;
  const finalPlacements = confidentPlacements.slice(0, maxPlacements);

  // Mettre à jour debug avec les placements finaux
  debug.final_count = finalPlacements.length;
  debug.max_allowed = maxPlacements;
  debug.story_type = pattern?.story_type || 'unknown';

  // FV-121: Missing opportunity detection
  // After placement, check if key topics are discussed but have no widget
  const missingOpportunities = [];
  const finalIds = new Set(finalPlacements.map(p => p.id));

  const opportunityMap = {
    flights: {
      keywords: ['vol', 'avion', 'aéroport', 'flight', 'airport', "billet d'avion"],
      label: 'flight widget'
    },
    accommodation: {
      keywords: ['hôtel', 'hébergement', 'booking', 'hotel', 'hostel', 'airbnb', 'logement'],
      label: 'hotel widget'
    },
    insurance: {
      keywords: ['assurance', 'santé', 'hôpital', 'insurance', 'medical', 'urgence'],
      label: 'insurance widget'
    },
    esim: {
      keywords: ['sim', 'internet', '4g', '5g', 'esim', 'e-sim', 'données mobiles'],
      label: 'eSIM widget'
    }
  };

  for (const [widgetId, config] of Object.entries(opportunityMap)) {
    if (finalIds.has(widgetId)) continue;
    const hasTopicMention = config.keywords.some(kw => fullText.includes(kw));
    if (hasTopicMention) {
      const matchedKw = config.keywords.find(kw => fullText.includes(kw));
      missingOpportunities.push({ widgetId, keyword: matchedKw, label: config.label });

      if (finalPlacements.length < maxPlacements) {
        const newPlacement = {
          id: widgetId,
          priority: 13,
          anchor: 'after_context',
          reason: [`FV-121_missing_opportunity: topic "${matchedKw}" discussed but no ${config.label}`],
          confidence: 55,
          payload: {
            type: widgetId,
            destination: geo_defaults?.country || 'asia',
            city: geo_defaults?.city || null,
            source: 'missing_opportunity_detection'
          }
        };
        finalPlacements.push(newPlacement);
        finalIds.add(widgetId);
        console.log(`   \u{1f50d} FV-121_MISSING_OPPORTUNITY: added ${widgetId} (keyword="${matchedKw}")`);
      }
    }
  }

  debug.missing_opportunities = missingOpportunities;
  debug.final_count = finalPlacements.length;

  return {
    placements: finalPlacements,
    debug
  };
}
