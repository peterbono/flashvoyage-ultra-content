#!/usr/bin/env node

/**
 * ANTI-HALLUCINATION GUARD - Core detection module
 * =================================================
 * 
 * Ce module détecte les hallucinations dans le texte éditorial en comparant
 * avec le "truth pack" construit depuis les données extraites.
 * 
 * RÈGLES BLOQUANTES:
 * - HALLUCINATION_NEW_LOCATION: lieu absent de truthPack.allowed.locations
 * - HALLUCINATION_NEW_NUMBER: nombre/durée/montant absent de truthPack.allowed.numbers
 * - HALLUCINATION_ENTITY_DRIFT: drift d'entités (autre pays/ville non whitelist)
 * 
 * RÈGLES WARNING:
 * - TONE_AMPLIFICATION_SUSPECT: densité d'intensificateurs > seuil alors que tone_baseline est low
 * - KEYWORD_DRIFT: faible recouvrement de keywords (sans nouvelles entités)
 * 
 * USAGE:
 *   import { runAntiHallucinationGuard } from './src/anti-hallucination/anti-hallucination-guard.js';
 *   const result = await runAntiHallucinationGuard({ html, extracted, context });
 */

import { buildTruthPack } from './truth-pack.js';
import { extractEditorialText } from './html-segmentation.js';

/**
 * Normalise un texte pour comparaison (trim, lowercase, collapse spaces)
 */
function normalizeText(s) {
  if (typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Extrait les tokens d'un texte (mots simples)
 */
function extractTokens(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/**
 * Détecte les lieux dans un texte (pattern simple)
 */
function detectLocations(text) {
  const locations = [];
  const lowerText = text.toLowerCase();
  
  // Pattern 1: Pays/villes majeurs Asie + autres villes connues (liste étendue)
  const knownLocations = [
    'thailand', 'vietnam', 'japan', 'china', 'india', 'indonesia', 'philippines',
    'malaysia', 'singapore', 'south korea', 'taiwan', 'hong kong', 'myanmar',
    'cambodia', 'laos', 'bangladesh', 'sri lanka', 'nepal', 'bhutan', 'maldives',
    'mongolia', 'north korea', 'brunei', 'east timor', 'macau',
    'bangkok', 'chiang mai', 'phuket', 'pattaya', 'ho chi minh', 'hanoi',
    'tokyo', 'kyoto', 'osaka', 'seoul', 'busan', 'taipei', 'kaohsiung',
    'bali', 'jakarta', 'manila', 'cebu', 'kuala lumpur', 'penang',
    // Ajouter quelques villes non-Asie pour détecter le drift
    'paris', 'london', 'berlin', 'madrid', 'rome', 'barcelona', 'amsterdam',
    'new york', 'los angeles', 'san francisco', 'london', 'sydney', 'melbourne'
  ];
  
  for (const loc of knownLocations) {
    const regex = new RegExp(`\\b${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      matches.forEach(match => {
        const normalized = normalizeText(match);
        if (!locations.some(l => l === normalized)) {
          locations.push(normalized);
        }
      });
    }
  }
  
  // Pattern 2: Capitalisation + prépositions (plus général, mais strict)
  const prepositionPattern = /\b(in|à|au|en|vers|from|to|at|near|around|à|dans|de)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  let match;
  while ((match = prepositionPattern.exec(text)) !== null) {
    const location = normalizeText(match[2]);
    // Filtrer les mots communs qui ne sont pas des lieux (liste étendue)
    const commonWords = [
      'le', 'la', 'les', 'un', 'une', 'des', 'mon', 'ma', 'mes', 'the', 'a', 'an',
      'ce', 'cette', 'ces', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos',
      'leur', 'leurs', 'cette', 'cet', 'cette', 'cet', 'cette', 'cet'
    ];
    // Liste de mots français communs qui ne sont pas des lieux
    const frenchCommonWords = [
      'extrait', 'contexte', 'points', 'conseils', 'valider', 'structurer',
      'checklist', 'assurance', 'plan', 'résumé', 'détails', 'informations',
      'contenu', 'section', 'article', 'texte', 'paragraphe', 'chapitre',
      'introduction', 'conclusion', 'analyse', 'recommandation', 'suggestion',
      'exemple', 'cas', 'situation', 'problème', 'solution', 'méthode',
      'technique', 'stratégie', 'approche', 'processus', 'étape', 'phase',
      'période', 'moment', 'temps', 'date', 'jour', 'semaine', 'mois', 'année',
      'subreddit', 'reddit', 'moderation', 'modération', 'flair', 'rules', 'règles',
      'royaume', 'unie', 'unies', 'états', 'états-unis', 'royaume-uni',
      'kaiseki', 'sushi', 'ramen', 'tempura', 'yakitori', 'izakaya' // Types de cuisine/restaurants, pas des lieux
    ];
    if (location.length > 2 && 
        !commonWords.includes(location) && 
        !frenchCommonWords.includes(location) &&
        !locations.some(l => l === location)) {
      // Vérifier que ce n'est pas un mot commun français
      const isCommonFrenchWord = /^(extrait|contexte|points|conseils|valider|structurer|checklist|assurance|plan|résumé|détails|informations|contenu|section|article|texte|paragraphe|chapitre|introduction|conclusion|analyse|recommandation|suggestion|exemple|cas|situation|problème|solution|méthode|technique|stratégie|approche|processus|étape|phase|période|moment|temps|date|jour|semaine|mois|année|subreddit|reddit|moderation|modération|flair|rules|règles|royaume|unie|unies|états|états-unis|royaume-uni|kaiseki|sushi|ramen|tempura|yakitori|izakaya)$/i.test(location);
      if (!isCommonFrenchWord) {
        locations.push(location);
      }
    }
  }
  
  // Pattern 3: DÉSACTIVÉ - Trop de faux positifs
  // On ne détecte plus les mots capitalisés isolés car cela génère trop de faux positifs
  // Seulement les lieux connus (Pattern 1) et ceux après prépositions (Pattern 2) sont détectés
  
  return locations;
}

/**
 * Détecte les nombres (durées, quantités, montants) dans un texte
 * Patterns stricts figés:
 * - montant: \d+€
 * - durée: \d+\s?(jours|semaines|mois|ans)
 * - pourcentage: \d+%
 */
function detectNumbers(text) {
  const numbers = [];
  
  // Patterns stricts figés selon spécifications
  const numericPatterns = [
    /\b\d+€/g,  // Montant: "500€" (strict, pas de $ ou autres devises)
    /\b\d+\s*%/g,  // Pourcentage: "50%" (strict)
    /\b\d+\s?(jours|semaines|mois|ans)\b/g  // Durée: "7 jours", "2 semaines", "3 mois", "1 ans" (strict)
  ];
  
  for (const pattern of numericPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const normalized = normalizeText(match);
        // Ne pas filtrer par valeur minimale, accepter tous les matches des patterns stricts
        if (!numbers.some(n => n === normalized)) {
          numbers.push(normalized);
        }
      });
    }
  }
  
  return numbers;
}

/**
 * Calcule le recouvrement de keywords entre deux listes
 */
function calculateKeywordOverlap(textKeywords, truthKeywords) {
  if (!truthKeywords || truthKeywords.length === 0) return 1.0; // Pas de keywords = pas de drift
  
  const textTokens = new Set(textKeywords);
  const truthTokens = new Set(truthKeywords);
  
  let overlap = 0;
  for (const token of textTokens) {
    if (truthTokens.has(token)) {
      overlap++;
    }
  }
  
  return truthTokens.size > 0 ? overlap / truthTokens.size : 0;
}

/**
 * Détecte les intensificateurs dans un texte
 */
function detectIntensifiers(text) {
  const intensifiers = [
    'amazing', 'incredible', 'fantastic', 'terrible', 'awful', 'horrible',
    'incroyable', 'fantastique', 'terrible', 'horrible', 'époustouflant',
    'extraordinaire', 'remarquable', 'exceptionnel', 'formidable'
  ];
  
  const lowerText = text.toLowerCase();
  const found = intensifiers.filter(term => lowerText.includes(term));
  return found.length;
}

/**
 * Extrait le contexte autour d'une occurrence dans un texte
 */
function extractContext(text, match, contextLength = 50) {
  const index = text.indexOf(match);
  if (index === -1) return '';
  
  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + match.length + contextLength);
  return text.substring(start, end).trim();
}

/**
 * Exécute le guard anti-hallucination
 * 
 * @param {Object} params - { html, extracted, context }
 * @returns {Object} { status, blocking, reasons, evidence, debug }
 */
export async function runAntiHallucinationGuard({ html, extracted, context = {} }) {
  // FIX: Enrichir extracted avec context si disponible
  const enrichedExtracted = {
    ...extracted,
    context: context,
    // Ajouter aussi depuis context.story.extracted si disponible
    ...(context.story?.extracted ? { 
      post: {
        ...extracted?.post,
        ...context.story.extracted.post,
        clean_text: context.story.extracted.post?.clean_text || context.story.extracted.post?.selftext || extracted?.post?.clean_text,
        selftext: context.story.extracted.post?.selftext || context.story.extracted.post?.clean_text || extracted?.post?.selftext
      },
      source: {
        ...extracted?.source,
        ...context.story.extracted.source
      }
    } : {})
  };
  
  // 1. Construire le truth pack
  const truthPack = buildTruthPack(enrichedExtracted);
  
  // 2. Extraire le texte éditorial (exclure segments non-éditoriaux)
  const segmentationResult = await extractEditorialText(html);
  const text = segmentationResult.included_text;
  
  // Initialiser le résultat
  const result = {
    status: 'pass',
    blocking: false,
    reasons: [],
    evidence: [],
    debug: {
      included_len: text.length
    }
  };
  
  // Si pas de texte éditorial, retourner pass
  if (!text || text.length < 10) {
    return result;
  }
  
  const lowerText = text.toLowerCase();
  const normalizedText = normalizeText(text);
  
  // ===== RÈGLES BLOQUANTES =====
  
  // RÈGLE 1: HALLUCINATION_NEW_LOCATION
  // Liste de mots à ignorer (faux positifs communs)
  const falsePositiveWords = new Set([
    'extrait', 'contexte', 'points', 'conseils', 'valider', 'structurer',
    'checklist', 'assurance', 'plan', 'résumé', 'détails', 'informations',
    'contenu', 'section', 'article', 'texte', 'paragraphe', 'chapitre',
    'introduction', 'conclusion', 'analyse', 'recommandation', 'suggestion',
    'exemple', 'cas', 'situation', 'problème', 'solution', 'méthode',
    'technique', 'stratégie', 'approche', 'processus', 'étape', 'phase',
    'période', 'moment', 'temps', 'date', 'jour', 'semaine', 'mois', 'année',
    'guide', 'liste', 'tableau', 'graphique', 'diagramme', 'schéma',
    'document', 'fichier', 'dossier', 'page', 'ligne', 'mot', 'phrase',
    'kaiseki', 'sushi', 'ramen', 'tempura', 'yakitori', 'izakaya' // Types de cuisine/restaurants, pas des lieux
  ]);
  
  // Liste des destinations asiatiques valides (tolérance si mentionnées dans le contenu généré)
  const validAsiaDestinations = [
    'thailand', 'thaïlande', 'vietnam', 'indonesia', 'indonésie', 'japan', 'japon',
    'korea', 'corée', 'philippines', 'singapore', 'singapour', 'bangkok', 'bali',
    'tokyo', 'hanoi', 'ho chi minh', 'seoul', 'manila', 'kyoto', 'osaka'
  ];
  
  const detectedLocations = detectLocations(text);
  for (const location of detectedLocations) {
    const normalizedLocation = normalizeText(location);
    
    // Ignorer les faux positifs
    if (falsePositiveWords.has(normalizedLocation)) {
      continue;
    }
    
    // Ignorer les mots trop courts (probablement pas des lieux)
    if (normalizedLocation.length < 4) {
      continue;
    }
    
    const isInWhitelist = truthPack.allowed.locations.some(loc => 
      normalizeText(loc) === normalizedLocation || 
      normalizeText(loc).includes(normalizedLocation) ||
      normalizedLocation.includes(normalizeText(loc))
    );
    
    // Tolérance: si la destination est asiatique valide, ne pas bloquer (peut être mentionnée dans le contenu généré même si absente du source)
    const isValidAsiaDestination = validAsiaDestinations.some(dest => 
      normalizeText(dest) === normalizedLocation || 
      normalizeText(dest).includes(normalizedLocation) ||
      normalizedLocation.includes(normalizeText(dest))
    );
    
    if (!isInWhitelist && !isValidAsiaDestination) {
      const context = extractContext(text, location, 50);
      result.reasons.push('HALLUCINATION_NEW_LOCATION');
      result.evidence.push({
        type: 'location',
        text: location,
        why: `Lieu "${location}" détecté mais absent de truthPack.allowed.locations`
      });
      result.blocking = true;
      result.status = 'fail';
    }
  }
  
  // RÈGLE 2: HALLUCINATION_NEW_NUMBER
  const detectedNumbers = detectNumbers(text);
  // Debug: logger les nombres détectés
  if (detectedNumbers.length > 0) {
    result.debug.detected_numbers = detectedNumbers;
  }
  for (const number of detectedNumbers) {
    const normalizedNumber = normalizeText(number);
    const numberDigits = normalizedNumber.replace(/[^\d]/g, '');
    
    const isInWhitelist = truthPack.allowed.numbers.some(num => {
      const normalizedNum = normalizeText(num);
      const numDigits = normalizedNum.replace(/[^\d]/g, '');
      
      // Matching strict pour montants avec devise: "500€" doit matcher exactement "500€" ou "500 eur"
      // MAIS "5000€" ne doit PAS matcher "500€"
      if (normalizedNumber.includes('€') || normalizedNumber.includes('eur') || normalizedNumber.includes('$') || normalizedNumber.includes('usd')) {
        // Pour montants, matching exact ou équivalent devise MAIS chiffres doivent être identiques
        if (normalizedNum === normalizedNumber) return true;
        // Vérifier si même devise et mêmes chiffres
        const hasSameCurrency = (normalizedNum.includes('€') || normalizedNum.includes('eur')) && (normalizedNumber.includes('€') || normalizedNumber.includes('eur')) ||
                                 (normalizedNum.includes('$') || normalizedNum.includes('usd')) && (normalizedNumber.includes('$') || normalizedNumber.includes('usd'));
        if (hasSameCurrency && numberDigits === numDigits && numberDigits.length > 0) {
          return true;
        }
        return false; // Pas de match flexible pour montants
      }
      
      // Matching flexible pour durées: "7 jours" match "en 7 jours"
      if (normalizedNumber.includes('jour') || normalizedNumber.includes('mois') || normalizedNumber.includes('année')) {
        return normalizedNum === normalizedNumber ||
               normalizedNum.includes(normalizedNumber) ||
               normalizedNumber.includes(normalizedNum) ||
               (numberDigits === numDigits && (normalizedNum.includes('jour') || normalizedNum.includes('mois') || normalizedNum.includes('année')));
      }
      
      // Matching exact pour autres nombres
      return normalizedNum === normalizedNumber ||
             (numberDigits === numDigits && numberDigits.length > 0);
    });
    
    if (!isInWhitelist) {
      const context = extractContext(text, number, 50);
      result.reasons.push('HALLUCINATION_NEW_NUMBER');
      result.evidence.push({
        type: 'number',
        text: number,
        why: `Nombre "${number}" détecté mais absent de truthPack.allowed.numbers`
      });
      result.blocking = true;
      result.status = 'fail';
    }
  }
  
  // RÈGLE 3: HALLUCINATION_ENTITY_DRIFT
  // Si truthPack.allowed.locations non vide et que le texte mentionne un autre pays/ville non whitelist
  if (truthPack.allowed.locations.length > 0) {
    // Liste de mots à ignorer (faux positifs communs)
    const falsePositiveWords = new Set([
      'extrait', 'contexte', 'points', 'conseils', 'valider', 'structurer',
      'checklist', 'assurance', 'plan', 'résumé', 'détails', 'informations',
      'contenu', 'section', 'article', 'texte', 'paragraphe', 'chapitre',
      'introduction', 'conclusion', 'analyse', 'recommandation', 'suggestion',
      'exemple', 'cas', 'situation', 'problème', 'solution', 'méthode',
      'technique', 'stratégie', 'approche', 'processus', 'étape', 'phase',
      'période', 'moment', 'temps', 'date', 'jour', 'semaine', 'mois', 'année',
      'guide', 'liste', 'tableau', 'graphique', 'diagramme', 'schéma',
      'document', 'fichier', 'dossier', 'page', 'ligne', 'mot', 'phrase'
    ]);
    
    const detectedLocationsInText = detectLocations(text);
    const whitelistedLocations = truthPack.allowed.locations.map(loc => normalizeText(loc));
    
    for (const location of detectedLocationsInText) {
      const normalizedLocation = normalizeText(location);
      
      // Ignorer les faux positifs
      if (falsePositiveWords.has(normalizedLocation)) {
        continue;
      }
      
      // Ignorer les mots trop courts
      if (normalizedLocation.length < 4) {
        continue;
      }
      
      const isWhitelisted = whitelistedLocations.some(loc => 
        loc === normalizedLocation || 
        loc.includes(normalizedLocation) ||
        normalizedLocation.includes(loc)
      );
      
      if (!isWhitelisted) {
        // Vérifier si c'est un drift significatif (autre pays/ville)
        const context = extractContext(text, location, 50);
        result.reasons.push('HALLUCINATION_ENTITY_DRIFT');
        result.evidence.push({
          type: 'entity_drift',
          text: location,
          why: `Drift d'entité: "${location}" mentionné alors que truthPack.allowed.locations contient ${truthPack.allowed.locations.join(', ')}`
        });
        result.blocking = true;
        result.status = 'fail';
        break; // Un seul drift suffit pour bloquer
      }
    }
  }
  
  // ===== RÈGLES WARNING (non bloquantes) =====
  
  // RÈGLE 4: TONE_AMPLIFICATION_SUSPECT
  // Seuils figés: déclenchement si intensifier_count >= 4 sur included_text.length < 800
  // ou densité > 0.8% au-delà (0.8% = 8/1000)
  if (truthPack.tone_baseline.sentiment_hint === 'low') {
    const intensifierCount = detectIntensifiers(text);
    const textLength = text.length;
    const intensifierDensity = textLength > 0 ? intensifierCount / (textLength / 1000) : 0;
    
    // Seuil figé: intensifier_count >= 4 si textLength < 800 OU densité > 0.8% (8/1000)
    const shouldTrigger = (textLength < 800 && intensifierCount >= 4) || (intensifierDensity > 8);
    
    if (shouldTrigger) {
      result.reasons.push('TONE_AMPLIFICATION_SUSPECT');
      result.evidence.push({
        type: 'tone_amplification',
        text: `${intensifierCount} intensificateurs détectés`,
        why: `Densité d'intensificateurs (${intensifierDensity.toFixed(2)}/1000 chars, ${intensifierCount} sur ${textLength} chars) dépasse le seuil alors que tone_baseline est low`
      });
      if (result.status === 'pass') {
        result.status = 'warn';
      }
    }
  }
  
  // RÈGLE 5: KEYWORD_DRIFT
  // Seuils figés: seulement si keywords disponibles ET overlap < 10% ET included_text.length > 400 (warning)
  if (truthPack.allowed.keywords.length > 0) {
    const textLength = text.length;
    // Seuil figé: textLength > 400
    if (textLength > 400) {
      const textKeywords = extractTokens(text);
      const keywordOverlap = calculateKeywordOverlap(textKeywords, truthPack.allowed.keywords);
      
      // Seuil figé: overlap < 10% (0.1) ET pas de nouvelles entités bloquantes
      if (keywordOverlap < 0.1 && result.status !== 'fail') {
        result.reasons.push('KEYWORD_DRIFT');
        result.evidence.push({
          type: 'keyword_drift',
          text: `Recouvrement: ${(keywordOverlap * 100).toFixed(1)}%`,
          why: `Faible recouvrement de keywords (${(keywordOverlap * 100).toFixed(1)}% < 10%) sans nouvelles entités bloquantes`
        });
        if (result.status === 'pass') {
          result.status = 'warn';
        }
      }
    }
  }
  
  return result;
}
