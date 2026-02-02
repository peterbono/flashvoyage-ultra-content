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
 * @returns {Object} { placements: [...], debug: {...} }
 */
export function decideAffiliatePlacements({ extracted, pattern, story, geo_defaults }) {
  const placements = [];
  const debug = {
    matched: {},
    skipped: {}
  };

  // Construire le texte complet pour recherche de keywords
  const fullText = [
    extracted.title || '',
    extracted.selftext || '',
    ...(story?.evidence?.source_snippets || []).map(s => s.snippet || '').filter(Boolean)
  ].join(' ').toLowerCase();

  // 1. INSURANCE
  const insuranceKeywords = ['sick', 'ill', 'hospital', 'injury', 'accident', 'claim', 'reimbursement', 'stolen', 'theft', 'baggage', 'missed flight', 'delay', 'medical', 'emergency', 'ambulance', 'doctor', 'clinic'];
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
  const esimKeywords = ['sim', 'roaming', 'data', 'signal', 'internet', 'whatsapp', '4g', '5g', 'wifi', 'connection', 'connectivity', 'esim', 'e-sim', 'airalo', 'holafly'];
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
  const flightsKeywords = ['flight', 'connection', 'layover', 'delayed', 'cancelled', 'missed connection', 'airport', 'airline', 'booking', 'ticket', 'departure', 'arrival'];
  const flightsKeywordMatch = flightsKeywords.some(kw => fullText.includes(kw));
  const longTrip = story?.story?.context?.summary && story.story.context.summary.length > 500; // Long context = probable long trip
  
  if (flightsKeywordMatch || longTrip) {
    const reasons = [];
    if (flightsKeywordMatch) {
      const matchedKw = flightsKeywords.find(kw => fullText.includes(kw));
      reasons.push(`matched_keywords: ${matchedKw}`);
    }
    if (longTrip) reasons.push('long trip detected');
    
    placements.push({
      id: 'flights',
      priority: 3,
      anchor: 'after_central_event',
      reason: reasons,
      confidence: flightsKeywordMatch && longTrip ? 80 : flightsKeywordMatch ? 70 : 50,
      payload: {
        type: 'flights',
        origin: geo_defaults?.origin || 'PAR',
        destination: geo_defaults?.nearest_hub || geo_defaults?.destination || 'BKK',
        country: geo_defaults?.country || 'asia'
      }
    });
    debug.matched.flights = { reasons, confidence: placements[placements.length - 1].confidence };
  } else {
    debug.skipped.flights = 'no keyword match or long trip';
  }

  // 4. ACCOMMODATION
  const accommodationKeywords = ['hotel', 'hostel', 'booking', 'airbnb', 'accommodation', 'lodging', 'stay', 'reservation', 'check-in', 'check-out', 'room'];
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

  // 6. OPPORTUNITÉS DANS SECTION "ERREURS À ÉVITER"
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

  // Trier par priority (1 = plus important)
  uniquePlacements.sort((a, b) => a.priority - b.priority);

  // Cap max placements
  const maxPlacements = pattern?.story_type === 'guide' ? 3 : 2;
  const finalPlacements = uniquePlacements.slice(0, maxPlacements);

  // Mettre à jour debug avec les placements finaux
  debug.final_count = finalPlacements.length;
  debug.max_allowed = maxPlacements;
  debug.story_type = pattern?.story_type || 'unknown';

  return {
    placements: finalPlacements,
    debug
  };
}
