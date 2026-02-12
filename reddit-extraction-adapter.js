#!/usr/bin/env node

/**
 * Reddit Extraction Adapter
 * Adapte l'extracteur Reddit au format analysis du pipeline
 */

import { extractRedditSemantics } from './reddit-semantic-extractor.js';

/**
 * Détecte si un article est une question "où partir / itinéraire / idées"
 */
export function isDestinationQuestion(article) {
  if (!article || !article.title) return false;
  
  const text = `${article.title} ${article.content || ''}`.toLowerCase();
  
  // Patterns de questions de destination
  const questionPatterns = [
    /\b(where\s+to\s+(?:go|travel|visit)|où\s+(?:aller|partir|voyager)|where\s+should\s+i\s+go|où\s+devrais|itinéraire|itinerary|route\s+plan|idées\s+(?:de\s+)?voyage|travel\s+ideas|destination\s+ideas|where\s+to\s+travel|best\s+places?\s+to\s+visit|meilleurs?\s+endroits?)\b/i,
    /\b(which\s+(?:country|destination|place|city)|quel\s+(?:pays|destination|endroit|ville))\b/i,
    /\b(compare|comparer|comparison|vs|versus)\s+(?:destinations?|countries?|places?|cities?)\b/i
  ];
  
  return questionPatterns.some(pattern => pattern.test(text));
}

// Mapping lieux secondaires → destinations principales (réutilisé dans plusieurs fonctions)
const SECONDARY_LOCATION_MAP = {
  'magome': 'japan', 'nagiso': 'japan', 'nakasendo': 'japan',
  'tokyo': 'japan', 'kyoto': 'japan', 'osaka': 'japan', 'nara': 'japan', 'hiroshima': 'japan',
  'bangkok': 'thailand', 'chiang mai': 'thailand', 'phuket': 'thailand', 'koh samui': 'thailand',
  'hanoi': 'vietnam', 'ho chi minh': 'vietnam', 'saigon': 'vietnam', 'da nang': 'vietnam',
  'bali': 'indonesia', 'jakarta': 'indonesia', 'ubud': 'indonesia', 'lombok': 'indonesia',
  'seoul': 'korea', 'séoul': 'korea', 'busan': 'korea',
  'manila': 'philippines', 'cebu': 'philippines', 'palawan': 'philippines',
  'kuala lumpur': 'malaysia', 'penang': 'malaysia', 'langkawi': 'malaysia',
  'phnom penh': 'cambodia', 'siem reap': 'cambodia',
  'singapore': 'singapore', 'singapour': 'singapore'
};

// Liste des destinations Asie pour matching strict
const ASIA_DESTINATIONS = [
  'indonesia', 'indonésie', 'bali', 'jakarta', 'ubud', 'lombok',
  'japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'nara', 'hiroshima',
  'thailand', 'thaïlande', 'bangkok', 'chiang mai', 'phuket', 'koh samui',
  'vietnam', 'hanoi', 'ho chi minh', 'saigon', 'da nang',
  'korea', 'corée', 'seoul', 'séoul', 'busan',
  'philippines', 'manila', 'cebu', 'palawan',
  'malaysia', 'malaisie', 'kuala lumpur', 'penang', 'langkawi',
  'cambodia', 'cambodge', 'phnom penh', 'siem reap',
  'singapore', 'singapour',
  'magome', 'nagiso', 'nakasendo'
];

/**
 * Normalise un nom de destination vers son pays/région principal
 */
function normalizeDestination(dest) {
  const lower = dest.toLowerCase().trim();
  return SECONDARY_LOCATION_MAP[lower] || lower;
}

/**
 * Score la richesse en données exploitables de chaque destination
 * Compte les signaux : coûts, lieux spécifiques, insights, warnings, citations
 * @returns {Map<string, {score: number, signals: string[]}>}
 */
export function scoreDestinationRichness(redditExtraction) {
  if (!redditExtraction || !redditExtraction.post) return new Map();
  
  const scores = new Map();
  
  const addSignal = (dest, signalType) => {
    const normalized = normalizeDestination(dest);
    if (!scores.has(normalized)) {
      scores.set(normalized, { score: 0, signals: [] });
    }
    const entry = scores.get(normalized);
    entry.score += 1;
    entry.signals.push(signalType);
  };

  // 1. Signaux du post (poids 1 chacun)
  const postSignals = redditExtraction.post.signals || {};
  
  // Locations du post
  for (const loc of (postSignals.locations || [])) {
    const locLower = loc.value ? loc.value.toLowerCase() : loc.toLowerCase();
    for (const asiaDest of ASIA_DESTINATIONS) {
      if (locLower.includes(asiaDest)) {
        addSignal(asiaDest, 'post_location');
        break;
      }
    }
  }
  
  // Coûts du post (liés à une destination via le contexte)
  const postText = (redditExtraction.source?.title || '') + ' ' + (redditExtraction.post.clean_text || '');
  const postTextLower = postText.toLowerCase();
  for (const cost of (postSignals.costs || [])) {
    // Associer le coût à la destination la plus proche dans le texte
    for (const asiaDest of ASIA_DESTINATIONS) {
      if (postTextLower.includes(asiaDest)) {
        addSignal(asiaDest, 'post_cost');
        break;
      }
    }
  }

  // 2. Signaux des commentaires (poids 1 chacun)
  const comments = redditExtraction.comments || {};
  
  for (const insight of (comments.insights || [])) {
    const quote = (insight.quote || '').toLowerCase();
    for (const asiaDest of ASIA_DESTINATIONS) {
      if (quote.includes(asiaDest)) {
        addSignal(asiaDest, 'comment_insight');
      }
    }
  }
  
  for (const warning of (comments.warnings || [])) {
    const quote = (warning.quote || '').toLowerCase();
    for (const asiaDest of ASIA_DESTINATIONS) {
      if (quote.includes(asiaDest)) {
        addSignal(asiaDest, 'comment_warning');
      }
    }
  }
  
  for (const fact of (comments.additional_facts || [])) {
    const quote = (fact.quote || '').toLowerCase();
    for (const asiaDest of ASIA_DESTINATIONS) {
      if (quote.includes(asiaDest)) {
        addSignal(asiaDest, `comment_fact_${fact.type || 'other'}`);
      }
    }
  }

  return scores;
}

/**
 * Extrait la destination principale depuis l'extraction Reddit
 * Stratégie : Priorité au titre Reddit, SAUF si une autre destination a 2x plus de signaux.
 * Retourne un objet { destination, original_destination, pivot_reason } au lieu d'un simple string.
 */
export function extractMainDestination(redditExtraction) {
  if (!redditExtraction || !redditExtraction.post) return { destination: null, original_destination: null, pivot_reason: null };
  
  const hasMinimumSignals = redditExtraction.quality?.has_minimum_signals === true;
  const title = (redditExtraction.source.title || '').toLowerCase();
  
  // ÉTAPE 1: Trouver la destination du titre Reddit
  let titleDestination = null;
  for (const dest of ASIA_DESTINATIONS) {
    if (title.includes(dest)) {
      titleDestination = normalizeDestination(dest);
      break;
    }
  }
  
  // Si pas de destination dans le titre et pas de signaux minimum → null
  if (!titleDestination && !hasMinimumSignals) {
    return { destination: null, original_destination: null, pivot_reason: null };
  }
  
  // ÉTAPE 2: Scorer la richesse de chaque destination
  const richness = scoreDestinationRichness(redditExtraction);
  
  // Si pas de scores du tout, utiliser la destination du titre ou fallback
  if (richness.size === 0) {
    const fallbackDest = titleDestination || null;
    return { destination: fallbackDest, original_destination: fallbackDest, pivot_reason: null };
  }
  
  // ÉTAPE 3: Comparer la destination du titre avec la plus riche
  const titleScore = titleDestination ? (richness.get(titleDestination)?.score || 0) : 0;
  
  // Trouver la destination la plus riche
  let richestDest = null;
  let richestScore = 0;
  for (const [dest, data] of richness.entries()) {
    if (data.score > richestScore) {
      richestScore = data.score;
      richestDest = dest;
    }
  }
  
  // ÉTAPE 4: Décision de pivot (ratio 2:1)
  if (titleDestination) {
    // Si la destination du titre existe, on la garde SAUF si une autre a 2x plus de signaux
    if (richestDest && richestDest !== titleDestination && richestScore >= titleScore * 2 && richestScore >= 4) {
      // PIVOT: une autre destination a beaucoup plus de données exploitables
      console.log(`🔄 DESTINATION_PIVOT: "${titleDestination}" (${titleScore} signaux) → "${richestDest}" (${richestScore} signaux). Ratio ${(richestScore / Math.max(titleScore, 1)).toFixed(1)}:1`);
      return {
        destination: richestDest,
        original_destination: titleDestination,
        pivot_reason: `La communauté a apporté ${richestScore} signaux exploitables sur ${richestDest} contre ${titleScore} pour ${titleDestination} (ratio ${(richestScore / Math.max(titleScore, 1)).toFixed(1)}:1)`
      };
    }
    
    // Pas de pivot: garder la destination du titre
    return { destination: titleDestination, original_destination: titleDestination, pivot_reason: null };
  }
  
  // Pas de destination dans le titre: utiliser la plus riche
  if (richestDest && richestScore >= 2) {
    return { destination: richestDest, original_destination: null, pivot_reason: null };
  }
  
  // Fallback: post locations
  const postLocations = redditExtraction.post.signals?.locations || [];
  if (postLocations.length === 1) {
    const loc = (postLocations[0].value || postLocations[0]).toString().toLowerCase();
    const normalized = normalizeDestination(loc);
    return { destination: normalized, original_destination: normalized, pivot_reason: null };
  }
  
  return { destination: null, original_destination: null, pivot_reason: null };
}

/**
 * Adapte un article Reddit au format thread pour l'extracteur
 */
function adaptArticleToThread(article) {
  // Construire le thread Reddit depuis l'article
  // L'article peut avoir comments déjà scrapés ou non
  const thread = {
    post: {
      id: article.id || article.link?.match(/\/comments\/([^\/]+)/)?.[1] || '',
      title: article.title || '',
      selftext: article.content || article.selftext || '',
      author: article.author || '[deleted]',
      created_utc: article.date ? new Date(article.date).getTime() / 1000 : 0,
      url: article.link || '',
      subreddit: article.source?.match(/r\/(\w+)/)?.[1] || 'travel',
      score: article.upvotes || 0
    },
    comments: article.comments || article.comments_tree || []
  };
  
  return thread;
}

/**
 * Extrait les sémantiques Reddit d'un article et les adapte au format analysis
 * DRY_RUN safe: ne fait pas d'appels réseau, utilise les données en mémoire
 */
export async function extractRedditForAnalysis(article) {
  try {
    // Vérifier que c'est un article Reddit
    if (!article.link || !article.link.includes('reddit.com')) {
      return null;
    }
    
    // Adapter l'article au format thread
    const thread = adaptArticleToThread(article);
    
    // Extraire les sémantiques (sans LLM, sans réseau)
    const redditExtraction = extractRedditSemantics(thread);
    
    // Construire la version compacte pour analysis
    const redditSignalsCompact = {
      locations: redditExtraction.post.signals.locations || [],
      dates: redditExtraction.post.signals.dates || [],
      costs: redditExtraction.post.signals.costs || [],
      problems: redditExtraction.post.signals.problems || [],
      advice: redditExtraction.post.signals.advice_explicit || [],
      warnings: (redditExtraction.comments.warnings || []).map(w => ({
        value: w.value,
        quote: w.quote
      })),
      additional_facts: (redditExtraction.comments.additional_facts || []).map(f => ({
        type: f.type,
        value: f.value,
        quote: f.quote
      }))
    };
    
    const destResult = extractMainDestination(redditExtraction);
    
    return {
      reddit_extraction: redditExtraction,
      reddit_signals_compact: redditSignalsCompact,
      is_destination_question: isDestinationQuestion(article),
      main_destination: destResult.destination,
      original_destination: destResult.original_destination,
      pivot_reason: destResult.pivot_reason
    };
    
  } catch (error) {
    console.warn('⚠️ Erreur extraction Reddit (fallback silencieux):', error.message);
    return null;
  }
}
