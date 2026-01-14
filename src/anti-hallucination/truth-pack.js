#!/usr/bin/env node

/**
 * TRUTH PACK - Normalisation extraction → whitelist
 * ==================================================
 * 
 * Ce module transforme les données extraites de Reddit en une structure stable
 * pour l'anti-hallucination. Il ne "devine" rien : uniquement ce qui est présent
 * dans les données extraites.
 * 
 * INVARIANTS:
 * - Pas d'invention : si un champ n'existe pas dans extracted, tableau vide []
 * - Arrays toujours définis : jamais null/undefined
 * - Normalisation stricte : trim, collapse spaces, casefold pour comparaisons
 * - Tolérance aux variations de schéma : cherche dans plusieurs chemins possibles
 * 
 * USAGE:
 *   import { buildTruthPack } from './src/anti-hallucination/truth-pack.js';
 *   const truthPack = buildTruthPack(extracted);
 *   // truthPack.allowed.locations, truthPack.allowed.numbers, etc.
 */

/**
 * Normalise un texte (trim, collapse spaces, casefold)
 */
function normalizeText(s) {
  if (typeof s !== 'string') return '';
  return s
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .toLowerCase(); // Casefold
}

/**
 * Retourne un tableau unique (sans doublons)
 */
function uniq(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  return arr.filter(item => {
    const normalized = typeof item === 'string' ? normalizeText(item) : String(item);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * Extrait des chaînes depuis un objet profond en testant plusieurs chemins possibles
 * Tolère les variations de schéma (ex: post.signals.locations vs post.evidence.locations)
 */
function extractStringsDeep(obj, pathCandidates) {
  if (!obj || typeof obj !== 'object') return [];
  
  const results = [];
  
  for (const path of pathCandidates) {
    const parts = path.split('.');
    let current = obj;
    let found = true;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        found = false;
        break;
      }
    }
    
    if (found) {
      if (Array.isArray(current)) {
        // Si c'est un tableau d'objets avec .value, extraire les valeurs
        const values = current.map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'value' in item) return item.value;
          if (item && typeof item === 'object' && 'amount' in item && 'currency' in item) {
            return `${item.amount} ${item.currency}`;
          }
          return String(item);
        }).filter(v => v && v.trim().length > 0);
        results.push(...values);
      } else if (typeof current === 'string' && current.trim().length > 0) {
        results.push(current);
      }
    }
  }
  
  return results;
}

/**
 * Construit le "truth pack" à partir des données extraites de Reddit
 * 
 * @param {Object} extracted - Données extraites (format reddit-semantic-extractor ou reddit-extraction-adapter)
 * @returns {Object} Structure normalisée avec allowed.* et tone_baseline
 */
export function buildTruthPack(extracted) {
  if (!extracted || typeof extracted !== 'object') {
    // Retourner structure vide si extracted invalide
    return {
      source_id: null,
      allowed: {
        locations: [],
        orgs: [],
        people: [],
        numbers: [],
        dates: [],
        events: [],
        keywords: []
      },
      tone_baseline: {
        sentiment_hint: null,
        intensity_terms: []
      }
    };
  }
  
  // Extraire source_id (plusieurs chemins possibles)
  const source_id = extracted.source?.post_id || 
                   extracted.post_id || 
                   extracted.id || 
                   extracted.source?.url ||
                   extracted.reddit_extraction?.source?.post_id ||
                   extracted.reddit_extraction?.source?.id ||
                   extracted.reddit_extraction?.source?.url ||
                   null;
  
  // Extraire locations (plusieurs chemins possibles)
  const locationPaths = [
    'post.signals.locations',
    'post.evidence.locations',
    'reddit_extraction.post.signals.locations',
    'reddit_extraction.post.evidence.locations',
    'reddit_signals_compact.locations',
    'signals.locations',
    'locations'
  ];
  const rawLocations = extractStringsDeep(extracted, locationPaths);
  
  // AMÉLIORATION: Extraire aussi depuis le texte brut du post
  const textPaths = [
    'post.clean_text',
    'post.selftext',
    'post.text',
    'reddit_extraction.post.clean_text',
    'reddit_extraction.post.selftext',
    'source_text',
    'content',
    'title'  // Ajouter aussi le titre
  ];
  const rawTexts = extractStringsDeep(extracted, textPaths);
  
  // FIX: Ajouter aussi directement depuis extracted.post.clean_text si disponible
  if (extracted?.post?.clean_text && typeof extracted.post.clean_text === 'string') {
    rawTexts.push(extracted.post.clean_text);
  }
  if (extracted?.post?.selftext && typeof extracted.post.selftext === 'string') {
    rawTexts.push(extracted.post.selftext);
  }
  
  // Ajouter aussi le titre depuis source
  if (extracted.source?.title) rawTexts.push(extracted.source.title);
  if (extracted.title) rawTexts.push(extracted.title);
  
  // FIX: Ajouter aussi depuis input.post si disponible (depuis pipeline-runner)
  if (extracted.input?.post?.selftext) {
    rawTexts.push(extracted.input.post.selftext);
  }
  if (extracted.input?.post?.title) {
    rawTexts.push(extracted.input.post.title);
  }
  
  // FIX CRITIQUE: Si extracted est vide, essayer de récupérer depuis context
  // Le pipeline-runner passe parfois le texte via context
  if (rawTexts.length === 0 && extracted.context) {
    const context = extracted.context;
    if (context.story?.extracted?.post?.selftext) {
      rawTexts.push(context.story.extracted.post.selftext);
    }
    if (context.story?.extracted?.post?.clean_text) {
      rawTexts.push(context.story.extracted.post.clean_text);
    }
    if (context.story?.extracted?.source?.title) {
      rawTexts.push(context.story.extracted.source.title);
    }
  }
  
  const combinedText = rawTexts.join(' ').toLowerCase();
  
  // Liste des destinations asiatiques connues pour extraction depuis texte (liste étendue)
  // Avec équivalents français/anglais
  const knownAsiaLocations = [
    'kuala lumpur', 'malaisie', 'malaysia', 'singapore', 'singapour',
    'thailand', 'thaïlande', 'vietnam', 'indonesia', 'indonésie',
    'japan', 'japon', 'korea', 'corée', 'philippines',
    'bangkok', 'chiang mai', 'phuket', 'ho chi minh', 'hanoi',
    'tokyo', 'kyoto', 'osaka', 'seoul', 'bali', 'jakarta', 'manila',
    'penang', 'langkawi', 'george town', 'ipoh', 'melaka', 'malacca',
    'kl', 'selangor', 'sabah', 'sarawak', 'borneo', 'phnom penh',
    'siem reap', 'yangon', 'rangoon', 'myanmar', 'burma', 'laos',
    'vientiane', 'luang prabang', 'macau', 'hong kong', 'taipei', 'taiwan'
  ];
  
  // Mapping équivalents français/anglais
  const locationEquivalents = {
    'malaisie': 'malaysia',
    'thaïlande': 'thailand',
    'indonésie': 'indonesia',
    'japon': 'japan',
    'corée': 'korea',
    'singapour': 'singapore'
  };
  
  // Extraire les locations depuis le texte brut (pattern plus flexible)
  for (const loc of knownAsiaLocations) {
    // Pattern flexible : peut être dans le texte même sans word boundary exacte
    // Utiliser un pattern qui cherche le mot complet mais tolère les variations
    const escapedLoc = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Chercher le mot complet, avec ou sans accents, avec ou sans majuscules
    const regex = new RegExp(`\\b${escapedLoc}\\b|${escapedLoc}`, 'gi');
    if (regex.test(combinedText)) {
      const normalizedLoc = normalizeText(loc);
      // Vérifier qu'on ne l'a pas déjà ajouté
      if (!rawLocations.some(l => normalizeText(l) === normalizedLoc)) {
        rawLocations.push(loc);
      }
    }
  }
  
  // AMÉLIORATION: Extraire aussi les lieux depuis les valeurs des objets evidence.locations
  // Si extracted.post.evidence.locations est un array d'objets avec .value
  if (extracted.post?.evidence?.locations && Array.isArray(extracted.post.evidence.locations)) {
    for (const locObj of extracted.post.evidence.locations) {
      if (locObj && typeof locObj === 'object' && locObj.value) {
        const locValue = String(locObj.value);
        const normalizedLoc = normalizeText(locValue);
        if (!rawLocations.some(l => normalizeText(l) === normalizedLoc)) {
          rawLocations.push(locValue);
        }
      } else if (typeof locObj === 'string') {
        const normalizedLoc = normalizeText(locObj);
        if (!rawLocations.some(l => normalizeText(l) === normalizedLoc)) {
          rawLocations.push(locObj);
        }
      }
    }
  }
  
  let locations = uniq(rawLocations.map(normalizeText)).filter(l => l.length > 0);
  
  // FIX: Ajouter les équivalents français/anglais
  const normalizedLocations = new Set(locations);
  for (const [fr, en] of Object.entries(locationEquivalents)) {
    const normalizedFr = normalizeText(fr);
    const normalizedEn = normalizeText(en);
    if (normalizedLocations.has(normalizedFr) && !normalizedLocations.has(normalizedEn)) {
      locations.push(en);
      normalizedLocations.add(normalizedEn);
    }
    if (normalizedLocations.has(normalizedEn) && !normalizedLocations.has(normalizedFr)) {
      locations.push(fr);
      normalizedLocations.add(normalizedFr);
    }
  }
  locations = uniq(locations.map(normalizeText)).filter(l => l.length > 0);
  
  // Extraire dates
  const datePaths = [
    'post.signals.dates',
    'post.evidence.dates',
    'reddit_extraction.post.signals.dates',
    'reddit_extraction.post.evidence.dates',
    'reddit_signals_compact.dates',
    'signals.dates',
    'dates'
  ];
  const rawDates = extractStringsDeep(extracted, datePaths);
  const dates = uniq(rawDates.map(normalizeText)).filter(d => d.length > 0);
  
  // Extraire numbers (depuis costs et autres mentions numériques)
  const costPaths = [
    'post.signals.costs',
    'post.evidence.costs',
    'reddit_extraction.post.signals.costs',
    'reddit_extraction.post.evidence.costs',
    'reddit_signals_compact.costs',
    'signals.costs',
    'costs'
  ];
  const rawCosts = extractStringsDeep(extracted, costPaths);
  
  // AMÉLIORATION: Extraire aussi les nombres depuis le texte brut
  const numbersFromText = [];
  // Patterns pour détecter les nombres (âges, durées, montants) - plus flexibles
  const numberPatterns = [
    /\b(\d+)\s*(ans?|years?|années?|year|an)\b/gi,  // "70 ans", "25 years", "70 ans"
    /\b(\d+)\s*(jours?|days?|jour|day)\b/gi,  // "7 jours", "2 days"
    /\b(\d+)\s*(semaines?|weeks?|semaine|week)\b/gi,  // "2 semaines", "3 weeks"
    /\b(\d+)\s*(mois|months?|month)\b/gi,  // "6 mois", "12 months"
    /\b(\d+)\s*(€|\$|usd|eur|dollars?|euros?)\b/gi,  // "500€", "$100", "500 dollars"
    /\b(\d+)\s*(%|percent|pourcent)\b/gi,  // "50%", "50 percent"
    /\b(\d+)\s*(k|thousand|mille)\b/gi,  // "80k", "5 thousand"
    /\b(\d+)\s*(heures?|hours?|heure|hour)\b/gi,  // "3 heures", "2 hours"
    /\b(\d+)\s*(minutes?|minute|min)\b/gi  // "30 minutes", "15 min"
  ];
  
  for (const pattern of numberPatterns) {
    // Créer une nouvelle regex à chaque fois pour éviter les problèmes avec lastIndex
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(combinedText)) !== null) {
      const numberStr = `${match[1]} ${match[2] || ''}`.trim();
      if (numberStr.length > 0) {
        const normalized = normalizeText(numberStr);
        if (!numbersFromText.includes(normalized)) {
          numbersFromText.push(normalized);
        }
      }
    }
  }
  
  // DEBUG: Log pour comprendre ce qui est extrait
  if (numbersFromText.length > 0) {
    console.log(`🔍 TRUTH_PACK_DEBUG: Nombres extraits depuis texte: ${numbersFromText.join(', ')}`);
  }
  
  // Combiner les coûts extraits et les nombres depuis le texte
  // NORMALISATION: Ajouter les équivalents français pour les nombres anglais
  const allNumbers = [...rawCosts, ...numbersFromText];
  const numbersWithTranslations = [];
  
  allNumbers.forEach(num => {
    const normalized = normalizeText(num);
    numbersWithTranslations.push(normalized);
    
    // Ajouter les traductions FR/EN pour les unités
    const translations = {
      'years': 'ans',
      'year': 'an',
      'days': 'jours',
      'day': 'jour',
      'weeks': 'semaines',
      'week': 'semaine',
      'months': 'mois',
      'month': 'mois',
      'hours': 'heures',
      'hour': 'heure',
      'minutes': 'minutes',
      'minute': 'minute'
    };
    
    // Pour chaque traduction, créer la version équivalente
    for (const [en, fr] of Object.entries(translations)) {
      if (normalized.includes(en)) {
        numbersWithTranslations.push(normalized.replace(en, fr));
      } else if (normalized.includes(fr)) {
        // Inverser: ajouter aussi la version anglaise
        for (const [enKey, frKey] of Object.entries(translations)) {
          if (frKey === fr) {
            numbersWithTranslations.push(normalized.replace(fr, enKey));
          }
        }
      }
    }
  });
  
  const numbers = uniq(numbersWithTranslations).filter(n => n.length > 0);
  
  // DEBUG: Log pour comprendre ce qui est extrait
  if (numbers.length === 0 && combinedText.length > 0) {
    console.log(`⚠️ TRUTH_PACK_DEBUG: Aucun nombre extrait depuis texte (${combinedText.substring(0, 200)}...)`);
  }
  
  // Extraire events
  const eventPaths = [
    'post.signals.events',
    'post.evidence.events',
    'reddit_extraction.post.signals.events',
    'reddit_extraction.post.evidence.events',
    'signals.events',
    'events'
  ];
  const rawEvents = extractStringsDeep(extracted, eventPaths);
  // Limiter à des micro-résumés courts (max 50 chars)
  const events = uniq(rawEvents.map(e => {
    const normalized = normalizeText(e);
    return normalized.length > 50 ? normalized.substring(0, 50) + '...' : normalized;
  })).filter(e => e.length > 0);
  
  // Extraire orgs (organisations, entreprises, institutions)
  // Chercher dans entities, ou dans les noms de lieux/coworking spaces mentionnés
  const orgPaths = [
    'entities',
    'post.evidence.locations', // Certains lieux peuvent être des organisations
    'reddit_extraction.post.evidence.locations'
  ];
  const rawOrgs = extractStringsDeep(extracted, orgPaths);
  // Filtrer pour garder seulement ceux qui ressemblent à des organisations
  // (capitalisés, pas des villes simples)
  const orgs = uniq(rawOrgs.map(org => {
    const normalized = normalizeText(org);
    // Si c'est un nom propre avec majuscules dans l'original, probablement une org
    if (org && org !== normalized && org.length > 2) {
      return normalized;
    }
    return null;
  }).filter(o => o !== null && o.length > 0));
  
  // Extraire people (auteurs, personnes mentionnées)
  const peoplePaths = [
    'source.author',
    'author',
    'post.author',
    'reddit_extraction.source.author'
  ];
  const rawPeople = extractStringsDeep(extracted, peoplePaths);
  // Filtrer les auteurs valides (pas "[deleted]", pas trop courts)
  const people = uniq(rawPeople.map(p => {
    const normalized = normalizeText(p);
    if (normalized === '[deleted]' || normalized === 'deleted' || normalized.length < 2) {
      return null;
    }
    return normalized;
  }).filter(p => p !== null && p.length > 0));
  
  // Extraire keywords (thèmes, lemmes simples)
  // Depuis problems, advice, emotions si disponibles
  const keywordPaths = [
    'post.signals.problems',
    'post.signals.advice_explicit',
    'post.signals.emotions_explicit',
    'reddit_extraction.post.signals.problems',
    'reddit_extraction.post.signals.advice_explicit',
    'reddit_extraction.post.signals.emotions_explicit',
    'reddit_signals_compact.problems',
    'reddit_signals_compact.advice'
  ];
  const rawKeywords = extractStringsDeep(extracted, keywordPaths);
  // Limiter à des mots-clés courts (max 30 chars)
  const keywords = uniq(rawKeywords.map(k => {
    const normalized = normalizeText(k);
    const short = normalized.length > 30 ? normalized.substring(0, 30) : normalized;
    return short;
  })).filter(k => k.length > 0);
  
  // Extraire tone_baseline (sentiment et intensité)
  // Chercher dans emotions si disponible
  const emotionPaths = [
    'post.signals.emotions_explicit',
    'post.evidence.emotions_explicit',
    'reddit_extraction.post.signals.emotions_explicit',
    'reddit_extraction.post.evidence.emotions_explicit'
  ];
  const rawEmotions = extractStringsDeep(extracted, emotionPaths);
  
  // Déterminer sentiment_hint basé sur les émotions détectées
  let sentiment_hint = null;
  const positiveTerms = ['happy', 'excited', 'amazing', 'great', 'wonderful', 'love', 'joy'];
  const negativeTerms = ['sad', 'angry', 'frustrated', 'disappointed', 'worried', 'stress'];
  const highIntensityTerms = ['amazing', 'incredible', 'fantastic', 'terrible', 'awful', 'horrible'];
  
  const emotionText = rawEmotions.join(' ').toLowerCase();
  const hasPositive = positiveTerms.some(term => emotionText.includes(term));
  const hasNegative = negativeTerms.some(term => emotionText.includes(term));
  
  if (hasPositive && !hasNegative) {
    sentiment_hint = 'high';
  } else if (hasPositive || hasNegative) {
    sentiment_hint = 'medium';
  } else if (rawEmotions.length > 0) {
    sentiment_hint = 'low';
  }
  
  // Extraire intensity_terms
  const intensity_terms = uniq(rawEmotions.filter(e => {
    const normalized = normalizeText(e);
    return highIntensityTerms.some(term => normalized.includes(term));
  }).map(normalizeText));
  
  return {
    source_id: source_id ? String(source_id) : null,
    allowed: {
      locations: locations,
      orgs: orgs,
      people: people,
      numbers: numbers,
      dates: dates,
      events: events,
      keywords: keywords
    },
    tone_baseline: {
      sentiment_hint: sentiment_hint,
      intensity_terms: intensity_terms
    }
  };
}
