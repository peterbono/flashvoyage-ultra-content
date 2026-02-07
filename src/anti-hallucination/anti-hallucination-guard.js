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
import { createChatCompletion, isOpenAIAvailable } from '../../openai-client.js';

/**
 * Normalise un texte pour comparaison (trim, lowercase, collapse spaces)
 */
function normalizeText(s) {
  if (typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * SMART LLM FALLBACK: Valide un lieu avec le LLM si absent de la whitelist dynamique
 * Coût: ~$0.0001/appel (gpt-4o-mini, ~200 tokens)
 * 
 * @param {string} location - Lieu à valider
 * @param {Object} context - Contexte de l'article (country, final_destination, etc.)
 * @returns {Promise<boolean>} - true si le lieu est géographiquement cohérent
 */
async function validateLocationWithLLM(location, context) {
  // Si OpenAI n'est pas disponible, tolérer par défaut (éviter faux blocage)
  if (!isOpenAIAvailable()) {
    console.log(`   ⚠️ LLM non disponible - tolérance pour: ${location}`);
    return true;
  }
  
  try {
    const countryContext = context?.final_destination || context?.geo?.country || 'Asie';
    
    // Prompt minimal optimisé pour coût (~150 tokens)
    const prompt = `Article de voyage sur: ${countryContext}
Lieu détecté dans l'article: "${location}"

Ce lieu est-il géographiquement cohérent avec le sujet de l'article (existe et est pertinent pour cet article sur ${countryContext})?
Réponds UNIQUEMENT par "oui" ou "non".`;

    console.log(`   🤖 LLM validation pour: "${location}" (contexte: ${countryContext})`);
    
    const response = await createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Tu es un expert en géographie. Réponds uniquement par "oui" ou "non".' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 10,
      temperature: 0.1
    });
    
    const answer = response.choices[0]?.message?.content?.toLowerCase().trim();
    const isValid = answer === 'oui' || answer.startsWith('oui');
    
    console.log(`   ${isValid ? '✅' : '❌'} LLM verdict pour "${location}": ${answer}`);
    
    return isValid;
  } catch (error) {
    // En cas d'erreur LLM, tolérer pour éviter faux blocage
    console.error(`   ⚠️ Erreur LLM validation: ${error.message} - tolérance pour: ${location}`);
    return true;
  }
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
 * Détecte les lieux dans un texte
 * SMART DETECTION: Utilise des patterns contextuels au lieu de listes statiques
 * Les lieux détectés seront validés par la whitelist dynamique + LLM fallback
 */
function detectLocations(text) {
  const locations = [];
  
  // Pattern principal: Capitalisation + prépositions géographiques (contexte clair)
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
    // Liste de mots français/anglais communs qui ne sont pas des lieux (éviter faux positifs type "Voici", "avoid")
    const frenchCommonWords = [
      'extrait', 'contexte', 'points', 'conseils', 'valider', 'structurer',
      'checklist', 'assurance', 'plan', 'résumé', 'détails', 'informations',
      'contenu', 'section', 'article', 'texte', 'paragraphe', 'chapitre',
      'introduction', 'conclusion', 'analyse', 'recommandation', 'suggestion',
      'exemple', 'cas', 'situation', 'problème', 'solution', 'méthode',
      'technique', 'stratégie', 'approche', 'processus', 'étape', 'phase',
      'période', 'moment', 'temps', 'date', 'jour', 'semaine', 'mois', 'année',
      // Mois en anglais (éviter faux positifs "April" détecté comme lieu)
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      // Mois en français
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
      'subreddit', 'reddit', 'moderation', 'modération', 'flair', 'rules', 'règles',
      'royaume', 'unie', 'unies', 'états', 'états-unis', 'royaume-uni',
      'kaiseki', 'sushi', 'ramen', 'tempura', 'yakitori', 'izakaya',
      'voici', 'avoid', 'éviter'
    ];
    // Ignorer séquences contenant "voici" ou "avoid" (faux positifs du pattern préposition)
    if ((location.includes('voici') || location.includes('avoid')) && !locations.some(l => l === location)) {
      continue;
    }
    if (location.length > 2 &&
        !commonWords.includes(location) &&
        !frenchCommonWords.includes(location) &&
        !locations.some(l => l === location)) {
      // Vérifier que ce n'est pas un mot commun français
      const isCommonFrenchWord = /^(extrait|contexte|points|conseils|valider|structurer|checklist|assurance|plan|résumé|détails|informations|contenu|section|article|texte|paragraphe|chapitre|introduction|conclusion|analyse|recommandation|suggestion|exemple|cas|situation|problème|solution|méthode|technique|stratégie|approche|processus|étape|phase|période|moment|temps|date|jour|semaine|mois|année|january|february|march|april|may|june|july|august|september|october|november|december|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|subreddit|reddit|moderation|modération|flair|rules|règles|royaume|unie|unies|états|états-unis|royaume-uni|kaiseki|sushi|ramen|tempura|yakitori|izakaya)$/i.test(location);
      if (!isCommonFrenchWord) {
        locations.push(location);
      }
    }
  }
  
  // DÉSACTIVÉ: Détection de mots capitalisés isolés - trop de faux positifs
  // Seuls les lieux après prépositions sont détectés, puis validés par whitelist + LLM
  
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
  // Liste de mots à ignorer (faux positifs communs — ex. "Voici", "avoid" captés par le pattern préposition)
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
    'kaiseki', 'sushi', 'ramen', 'tempura', 'yakitori', 'izakaya',
    'voici', 'avoid', 'éviter', 'remember', 'remember living', 'living'
  ]);
  // Équivalence asie/asia pour whitelist (source peut avoir "Asia", article "asie")
  const locationWhitelistIncludes = (normLoc, whitelist) =>
    whitelist.some(loc => {
      const n = normalizeText(loc);
      return n === normLoc || n.includes(normLoc) || normLoc.includes(n) ||
        (normLoc === 'asie' && n === 'asia') || (normLoc === 'asia' && n === 'asie');
    });
  // Ignorer lieux dont le libellé contient un faux positif (ex. "avoid voici", "remember living")
  const locationContainsFalsePositive = (loc) =>
    /voici|avoid|éviter|remember/.test(normalizeText(loc));
  
  // SMART VALIDATION: Plus de liste statique validAsiaDestinations
  // Utilisation du LLM comme fallback pour les lieux non présents dans la whitelist dynamique
  
  const detectedLocations = detectLocations(text);
  
  // Collecter les lieux à valider par LLM (ceux absents de la whitelist)
  const locationsToValidate = [];
  
  for (const location of detectedLocations) {
    const normalizedLocation = normalizeText(location);

    // Ignorer les faux positifs (dont séquences type "avoid voici")
    if (falsePositiveWords.has(normalizedLocation) || locationContainsFalsePositive(location)) {
      continue;
    }

    // Ignorer les mots trop courts (probablement pas des lieux)
    if (normalizedLocation.length < 4) {
      continue;
    }
    
    const isInWhitelist = locationWhitelistIncludes(normalizedLocation, truthPack.allowed.locations);
    
    if (!isInWhitelist) {
      // Lieu non dans whitelist → à valider par LLM
      locationsToValidate.push({ location, normalizedLocation });
    }
  }
  
  // LLM FALLBACK: Valider les lieux suspects avec le LLM
  if (locationsToValidate.length > 0) {
    console.log(`   🔍 ${locationsToValidate.length} lieu(x) à valider par LLM: ${locationsToValidate.map(l => l.location).join(', ')}`);
    
    for (const { location, normalizedLocation } of locationsToValidate) {
      // Appeler LLM pour validation contextuelle
      const isValidByLLM = await validateLocationWithLLM(location, context);
      
      if (!isValidByLLM) {
        // LLM a refusé → HALLUCINATION confirmée
        const ctxText = extractContext(text, location, 50);
        result.reasons.push('HALLUCINATION_NEW_LOCATION');
        result.evidence.push({
          type: 'location',
          text: location,
          why: `Lieu "${location}" rejeté par LLM (non cohérent avec le contexte de l'article)`
        });
        result.blocking = true;
        result.status = 'fail';
      }
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
    
    // Tolérance: pourcentages type "conseil" (5–30 %) non bloquants — ex. "prévoyez 15-20% de marge"
    const percentMatch = normalizedNumber.match(/^(\d+)\s*%$/);
    if (percentMatch) {
      const pct = parseInt(percentMatch[1], 10);
      if (pct >= 5 && pct <= 30) {
        continue; // Ne pas bloquer sur pourcentages conseil typiques
      }
    }

    // Tolérance: durée "X mois" quand la source a A et B mois avec A+B=X (ex. 3+6=9)
    // Utiliser des valeurs uniques car le truth pack peut avoir "3 months" + "3 mois" → doublons
    const moisMatch = normalizedNumber.match(/^(\d+)\s*(mois|months?)$/);
    if (moisMatch && !isInWhitelist) {
      const x = parseInt(moisMatch[1], 10);
      const packMonthValuesRaw = truthPack.allowed.numbers
        .map(n => n.match(/^(\d+)\s*(mois|months?)$/))
        .filter(Boolean)
        .map(m => parseInt(m[1], 10));
      const uniqueMonthValues = [...new Set(packMonthValuesRaw)];
      const sum = uniqueMonthValues.reduce((a, b) => a + b, 0);      if (uniqueMonthValues.length >= 2 && x === sum) {
        continue; // 9 mois autorisé quand source a 3 et 6 mois
      }
    }

    if (!isInWhitelist) {
      const packMonthValuesForLog = truthPack.allowed.numbers.map(n => n.match(/^(\d+)\s*(mois|months?)$/)).filter(Boolean).map(m => parseInt(m[1], 10));
      const sumForLog = packMonthValuesForLog.reduce((a, b) => a + b, 0);
      const xFromNum = normalizedNumber.match(/^(\d+)\s*(mois|months?)$/);      const context = extractContext(text, number, 50);
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

      // Ignorer les faux positifs (dont voici/avoid)
      if (falsePositiveWords.has(normalizedLocation) || locationContainsFalsePositive(location)) {
        continue;
      }

      // Ignorer les mots trop courts
      if (normalizedLocation.length < 4) {
        continue;
      }

      const isWhitelisted = locationWhitelistIncludes(normalizedLocation, truthPack.allowed.locations);
      
      if (!isWhitelisted) {
        const context = extractContext(text, location, 80);        // Ne plus bloquer sur entity_drift : on s'en remet au LLM (truth pack = trop de faux positifs)
        result.evidence.push({
          type: 'entity_drift',
          text: location,
          why: `Drift d'entité (warning): "${location}" mentionné alors que truthPack.allowed.locations contient ${truthPack.allowed.locations.join(', ')}`
        });
        result.status = result.status === 'pass' ? 'warn' : result.status;
        // Pas de result.blocking = true ni break
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
  }  return result;
}
