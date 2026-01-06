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

/**
 * Extrait la destination principale depuis l'extraction Reddit
 * RÈGLE STRICTE: Si has_minimum_signals === false, main_destination = null
 * Exception UNIQUEMENT si destination clairement présente dans le titre Reddit
 */
export function extractMainDestination(redditExtraction) {
  if (!redditExtraction || !redditExtraction.post) return null;
  
  const hasMinimumSignals = redditExtraction.quality?.has_minimum_signals === true;
  const title = (redditExtraction.source.title || '').toLowerCase();
  
  // FIX 4: Mapping lieux secondaires → destinations principales
  const secondaryLocationMap = {
    'magome': 'japan',
    'nagiso': 'japan',
    'nakasendo': 'japan',
    'tokyo': 'japan',
    'kyoto': 'japan',
    'osaka': 'japan',
    'bangkok': 'thailand',
    'chiang mai': 'thailand',
    'phuket': 'thailand',
    'hanoi': 'vietnam',
    'ho chi minh': 'vietnam',
    'saigon': 'vietnam',
    'bali': 'indonesia',
    'jakarta': 'indonesia',
    'ubud': 'indonesia',
    'seoul': 'korea',
    'séoul': 'korea',
    'manila': 'philippines',
    'cebu': 'philippines'
  };
  
  // Liste des destinations Asie pour matching strict
  const asiaDestinations = [
    'thailand', 'thaïlande', 'bangkok', 'chiang mai', 'phuket',
    'vietnam', 'hanoi', 'ho chi minh', 'saigon',
    'indonesia', 'indonésie', 'bali', 'jakarta', 'ubud',
    'japan', 'japon', 'tokyo', 'kyoto', 'osaka',
    'korea', 'corée', 'seoul', 'séoul',
    'philippines', 'manila', 'cebu',
    'singapore', 'singapour',
    // FIX 4: Ajouter lieux secondaires connus
    'magome', 'nagiso', 'nakasendo'
  ];
  
  // Vérifier si une destination est présente dans le titre (match strict)
  for (const dest of asiaDestinations) {
    if (title.includes(dest)) {
      // FIX 4: Si lieu secondaire, mapper vers destination principale
      if (secondaryLocationMap[dest]) {
        return secondaryLocationMap[dest];
      }
      // Destination trouvée dans le titre = valide même si has_minimum_signals === false
      return dest;
    }
  }
  
  // Si has_minimum_signals === false, ne pas utiliser les autres heuristiques
  if (!hasMinimumSignals) {
    return null;
  }
  
  // Si has_minimum_signals === true, utiliser les heuristiques normales
  const postLocations = redditExtraction.post.signals.locations || [];
  const postLocationsLower = postLocations.map(l => l.toLowerCase());
  
  // Vérifier consensus commentaires (≥2 commentaires mentionnent la même destination)
  const commentLocations = new Map();
  
  // Extraire destinations des commentaires (insights, warnings, additional_facts)
  const allCommentTexts = [
    ...(redditExtraction.comments.insights || []).map(i => i.quote || ''),
    ...(redditExtraction.comments.warnings || []).map(w => w.quote || ''),
    ...(redditExtraction.comments.additional_facts || [])
      .filter(f => f.type === 'location')
      .map(f => f.quote || '')
  ];
  
  for (const commentText of allCommentTexts) {
    const lowerText = commentText.toLowerCase();
    for (const dest of asiaDestinations) {
      if (lowerText.includes(dest)) {
        // FIX 4: Mapper lieu secondaire vers destination principale
        const mappedDest = secondaryLocationMap[dest] || dest;
        const count = commentLocations.get(mappedDest) || 0;
        commentLocations.set(mappedDest, count + 1);
      }
    }
  }
  
  // Si une destination est mentionnée ≥2 fois dans les commentaires, c'est un consensus
  for (const [dest, count] of commentLocations.entries()) {
    if (count >= 2) {
      return dest;
    }
  }
  
  // Si le post mentionne une destination une seule fois mais de manière claire
  if (postLocations.length === 1 && postLocations[0]) {
    return postLocations[0];
  }
  
  // Sinon, pas de destination principale claire
  return null;
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
    
    return {
      reddit_extraction: redditExtraction,
      reddit_signals_compact: redditSignalsCompact,
      is_destination_question: isDestinationQuestion(article),
      main_destination: extractMainDestination(redditExtraction)
    };
    
  } catch (error) {
    console.warn('⚠️ Erreur extraction Reddit (fallback silencieux):', error.message);
    return null;
  }
}
