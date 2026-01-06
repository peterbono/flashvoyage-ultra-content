#!/usr/bin/env node

/**
 * Reddit Semantic Extractor
 * Extracte des informations sémantiques d'un thread Reddit (post + commentaires)
 * sans utiliser de LLM - uniquement heuristiques et regex
 */

// Liste des destinations Asie (réutilisée du code existant)
const ASIA_DESTINATIONS = [
  // Indonésie
  'indonesia', 'indonésie', 'bali', 'jakarta', 'yogyakarta', 'bandung', 'surabaya', 'medan', 'ubud', 'seminyak', 'canggu', 'lombok',
  // Vietnam
  'vietnam', 'viet nam', 'ho chi minh', 'hanoi', 'hồ chí minh', 'hà nội', 'da nang', 'đà nẵng', 'hue', 'huế', 'hoi an', 'hội an', 'nha trang', 'sapa', 'sa pa',
  // Thaïlande
  'thailand', 'thaïlande', 'bangkok', 'chiang mai', 'chiangmai', 'phuket', 'krabi', 'pattaya', 'koh samui', 'koh phangan', 'koh tao', 'pai', 'ayutthaya', 'sukhothai',
  // Japon
  'japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'hokkaido', 'hokkaidō', 'hiroshima', 'nara', 'sapporo', 'fukuoka', 'okinawa', 'yokohama', 'nagoya', 'sendai',
  // Corée du Sud
  'korea', 'corée', 'south korea', 'corée du sud', 'seoul', 'séoul', 'busan', 'pusan', 'jeju', 'jeju island', 'incheon', 'daegu', 'gwangju', 'ulsan',
  // Philippines
  'philippines', 'philippine', 'manila', 'cebu', 'boracay', 'palawan', 'el nido', 'coron', 'siargao', 'bohol', 'davao', 'baguio', 'makati',
  // Singapour
  'singapore', 'singapour'
];

// Villes majeures supplémentaires (pour heuristique capitalisation)
const MAJOR_CITIES = [
  'paris', 'london', 'new york', 'sydney', 'melbourne', 'dubai', 'hong kong', 'taipei', 'kuala lumpur',
  'mumbai', 'delhi', 'bangalore', 'chennai', 'kolkata', 'shanghai', 'beijing', 'guangzhou', 'shenzhen'
];

// Whitelist emojis utiles (à garder si utilisés comme signal)
const EMOJI_WHITELIST = ['⚠️', '✅', '❌', '💰', '✈️', '🏥', '🚨'];

/**
 * Nettoie le texte Reddit en supprimant Markdown, code blocks, URLs, etc.
 * Ne déforme pas les faits, juste le formatage.
 */
export function cleanRedditText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  
  let text = raw;
  
  // 1. Supprimer les code blocks (```...```)
  text = text.replace(/```[\s\S]*?```/g, ' ');
  
  // 2. Supprimer les inline code (`...`)
  text = text.replace(/`[^`]+`/g, ' ');
  
  // 3. Enlever les liens Markdown [txt](url) -> txt
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  
  // 4. Enlever bold/italics ** * __
  text = text.replace(/\*\*([^\*]+)\*\*/g, '$1');
  text = text.replace(/\*([^\*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  
  // 5. Enlever les headings #
  text = text.replace(/^#{1,6}\s+/gm, '');
  
  // 6. Enlever les blockquotes > (garder le texte)
  text = text.replace(/^>\s*/gm, '');
  
  // 7. Enlever les URLs brutes (http://, https://, www.)
  text = text.replace(/https?:\/\/[^\s]+/g, ' ');
  text = text.replace(/www\.[^\s]+/g, ' ');
  
  // 8. Supprimer les emojis décoratifs (sauf whitelist)
  // Pattern: emoji unicode ranges
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  text = text.replace(emojiRegex, (match) => {
    return EMOJI_WHITELIST.includes(match) ? match : ' ';
  });
  
  // 9. Normaliser espaces et nouvelles lignes
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\n+/g, ' ');
  text = text.trim();
  
  return text;
}

/**
 * Aplatit l'arbre de commentaires Reddit en liste plate
 * Trie par: score desc, longueur desc, created_utc asc
 */
export function flattenRedditComments(commentsTree, depth = 0, parentId = null) {
  if (!commentsTree || !Array.isArray(commentsTree)) return [];
  
  const flat = [];
  
  for (const comment of commentsTree) {
    // Ignorer les placeholders "more" ou commentaires vides
    if (!comment || comment.kind === 'more') {
      continue;
    }
    
    // Extraire les données du commentaire (format Reddit API)
    const commentData = comment.data || comment;
    
    // Vérifier si le commentaire a un body valide
    const body = commentData.body || commentData.selftext || '';
    if (!body || body.trim() === '' || body === '[deleted]' || body === '[removed]') {
      continue;
    }
    
    flat.push({
      id: commentData.id || commentData.name || `comment_${Date.now()}_${Math.random()}`,
      author: commentData.author || '[deleted]',
      body: body,
      score: commentData.score || 0,
      created_utc: commentData.created_utc || 0,
      depth: depth,
      parent_id: parentId
    });
    
    // Récursivement aplatir les réponses
    if (commentData.replies) {
      let repliesData = null;
      if (commentData.replies.data && commentData.replies.data.children) {
        repliesData = commentData.replies.data.children;
      } else if (Array.isArray(commentData.replies)) {
        repliesData = commentData.replies;
      }
      
      if (repliesData) {
        const replies = flattenRedditComments(
          repliesData,
          depth + 1,
          commentData.id || commentData.name
        );
        flat.push(...replies);
      }
    }
  }
  
  // Trier: score desc, longueur desc, created_utc asc
  flat.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.body.length !== a.body.length) return b.body.length - a.body.length;
    return a.created_utc - b.created_utc;
  });
  
  return flat;
}

/**
 * Extrait les dates du texte
 */
function extractDates(text) {
  const results = [];
  const lowerText = text.toLowerCase();
  
  // Mois EN
  const monthsEN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthsENShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  
  // Mois FR
  const monthsFR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const monthsFRShort = ['janv', 'fév', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
  
  // Pattern 1: "Jan 2023", "January 2023", "Janvier 2023"
  const monthYearPattern = new RegExp(
    `\\b(${[...monthsEN, ...monthsENShort, ...monthsFR, ...monthsFRShort].join('|')})\\s+(\\d{4})\\b`,
    'gi'
  );
  let match;
  while ((match = monthYearPattern.exec(text)) !== null) {
    const value = match[0];
    const quote = extractSentenceQuote(text, match.index, 100);
    results.push({ value, quote, offset: match.index, source: 'post' });
  }
  
  // Pattern 2: "5 Nov", "12 Janvier"
  const dayMonthPattern = new RegExp(
    `\\b(\\d{1,2})\\s+(${[...monthsENShort, ...monthsFRShort].join('|')})\\b`,
    'gi'
  );
  while ((match = dayMonthPattern.exec(text)) !== null) {
    const value = match[0];
    const quote = extractSentenceQuote(text, match.index, 100);
    results.push({ value, quote, offset: match.index, source: 'post' });
  }
  
  // Pattern 3: Dates numériques "12/05/2024", "2024-05-12", "05-12-2024"
  const numericDatePattern = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/g;
  while ((match = numericDatePattern.exec(text)) !== null) {
    const value = match[0];
    const quote = extractSentenceQuote(text, match.index, 100);
    results.push({ value, quote, offset: match.index, source: 'post' });
  }
  
  // Pattern 4: Années simples "2023", "2024" (seulement si contexte clair)
  const yearPattern = /\b(19|20)\d{2}\b/g;
  while ((match = yearPattern.exec(text)) !== null) {
    // Vérifier contexte: "in 2023", "during 2024", "en 2023"
    const context = text.substring(Math.max(0, match.index - 10), match.index + 15).toLowerCase();
    if (/\b(in|during|en|durant|en|à|au)\s+\d{4}\b/.test(context) || 
        /\b\d{4}\s+(trip|voyage|travel|visit|visite)\b/.test(context)) {
      const value = match[0];
      const quote = extractSentenceQuote(text, match.index, 100);
      results.push({ value, quote, offset: match.index, source: 'post' });
    }
  }
  
  // Pattern 5: Expressions temporelles "last week", "next month", "winter 2026/27"
  const temporalPattern = /\b(last|next|this|winter|spring|summer|fall|autumn|hiver|printemps|été|automne)\s+(\w+|\d{4}\/\d{2})\b/gi;
  while ((match = temporalPattern.exec(text)) !== null) {
    const value = match[0];
    const quote = extractSentenceQuote(text, match.index, 100);
    results.push({ value, quote, offset: match.index, source: 'post' });
  }
  
  // Dédupliquer par valeur normalisée
  return deduplicateByNormalizedKey(results, 'post');
}

/**
 * Parse un coût brut en structure normalisée { amount, currency, raw }
 */
function parseCost(raw) {
  if (!raw || typeof raw !== 'string') return null;
  
  const currencies = {
    '€': 'EUR',
    '$': 'USD',
    '£': 'GBP',
    '¥': 'JPY',
    'usd': 'USD',
    'eur': 'EUR',
    'cad': 'CAD',
    'aud': 'AUD',
    'gbp': 'GBP',
    'jpy': 'JPY'
  };
  
  // Pattern: €120, 120€, $ 1,200, 1200 USD, 50€ per night
  // Devise avant: €120, $1,200, £50
  let match = raw.match(/^([€$£¥])\s*([\d,]+\.?\d*)/i);
  if (match) {
    const symbol = match[1];
    const amountStr = match[2].replace(/,/g, '');
    const amount = parseFloat(amountStr);
    if (!isNaN(amount)) {
      return {
        amount,
        currency: currencies[symbol] || symbol,
        raw: raw.trim()
      };
    }
  }
  
  // Devise après: 120€, 50 USD, 1,200 CAD
  match = raw.match(/([\d,]+\.?\d*)\s*([€$£¥]|USD|EUR|CAD|AUD|GBP|JPY)/i);
  if (match) {
    const amountStr = match[1].replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const currencySymbol = match[2].toUpperCase();
    if (!isNaN(amount)) {
      return {
        amount,
        currency: currencies[currencySymbol.toLowerCase()] || currencySymbol,
        raw: raw.trim()
      };
    }
  }
  
  // Devise séparée: $ 1,200
  match = raw.match(/([€$£¥])\s+([\d,]+\.?\d*)/i);
  if (match) {
    const symbol = match[1];
    const amountStr = match[2].replace(/,/g, '');
    const amount = parseFloat(amountStr);
    if (!isNaN(amount)) {
      return {
        amount,
        currency: currencies[symbol] || symbol,
        raw: raw.trim()
      };
    }
  }
  
  return null;
}

/**
 * Extrait les coûts du texte
 */
function extractCosts(text) {
  const results = [];
  
  // Devises et symboles
  const currencies = {
    '€': 'EUR',
    '$': 'USD',
    '£': 'GBP',
    '¥': 'JPY',
    'USD': 'USD',
    'EUR': 'EUR',
    'CAD': 'CAD',
    'AUD': 'AUD',
    'GBP': 'GBP',
    'JPY': 'JPY'
  };
  
  // Pattern: €120, 120€, $ 1,200, 1200 USD, 50€ per night
  const costPatterns = [
    // Devise avant: €120, $1,200, £50
    /([€$£¥])\s*([\d,]+\.?\d*)\s*(per\s+(night|day|week|month|person|pax))?/gi,
    // Devise après: 120€, 50 USD, 1,200 CAD
    /([\d,]+\.?\d*)\s*([€$£¥]|USD|EUR|CAD|AUD|GBP|JPY)\s*(per\s+(night|day|week|month|person|pax))?/gi,
    // Devise séparée: $ 1,200
    /([€$£¥])\s+([\d,]+\.?\d*)/gi
  ];
  
  for (const pattern of costPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const currencySymbol = match[1] || match[2];
      const amount = match[2] || match[1];
      const period = match[3] || match[4] || '';
      
      const rawValue = `${currencySymbol}${amount}${period ? ' ' + period : ''}`.trim();
      const parsed = parseCost(rawValue);
      
      if (parsed) {
        const quote = extractSentenceQuote(text, match.index, 160);
        results.push({
          value: rawValue,
          amount: parsed.amount,
          currency: parsed.currency,
          quote,
          offset: match.index,
          source: 'post'
        });
      }
    }
  }
  
  // Dédupliquer par (amount, currency) au lieu de proximité
  return deduplicateCosts(results);
}

/**
 * Extrait les lieux du texte
 */
function extractLocations(text) {
  const results = [];
  const lowerText = text.toLowerCase();
  
  // Heuristique 1: Dictionnaire interne (destinations Asie + villes majeures)
  const allLocations = [...ASIA_DESTINATIONS, ...MAJOR_CITIES];
  
  for (const location of allLocations) {
    const regex = new RegExp(`\\b${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = match[0];
      const quote = extractSentenceQuote(text, match.index, 120);
      results.push({ value, quote, offset: match.index, source: 'post' });
    }
  }
  
  // Heuristique 2: Capitalisation + prépositions (limité)
  // Pattern: "in Paris", "à Bangkok", "au Vietnam", "en Thaïlande", "from Tokyo", "to Seoul"
  const prepositionPattern = /\b(in|à|au|en|vers|from|to|at|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  let match;
  while ((match = prepositionPattern.exec(text)) !== null) {
    const location = match[2];
    const lowerLocation = location.toLowerCase();
    
    // Vérifier si c'est dans le dictionnaire OU si c'est une ville majeure connue
    if (allLocations.some(loc => lowerLocation.includes(loc) || loc.includes(lowerLocation))) {
      const value = location;
      const quote = extractSentenceQuote(text, match.index, 120);
      results.push({ value, quote, offset: match.index, source: 'post' });
    }
  }
  
  return deduplicateByNormalizedKey(results, 'post');
}

/**
 * Extrait les événements du texte
 */
function extractEvents(text) {
  const results = [];
  const lowerText = text.toLowerCase();
  
  // Patterns d'événements voyage
  const eventPatterns = [
    { pattern: /\b(i|we|they)\s+(went\s+to|visited|traveled\s+to|flew\s+to)\s+([^.!?]+)/gi, label: 'visit' },
    { pattern: /\b(took\s+a\s+flight|caught\s+a\s+flight|booked\s+a\s+flight)\s+([^.!?]+)/gi, label: 'flight' },
    { pattern: /\b(checked\s+in|check-in|checkin)\s+([^.!?]+)/gi, label: 'check-in' },
    { pattern: /\b(hospital|clinic|doctor|medical|emergency)\s+([^.!?]+)/gi, label: 'medical' },
    { pattern: /\b(filed\s+a\s+claim|insurance\s+claim|claimed)\s+([^.!?]+)/gi, label: 'insurance claim' },
    { pattern: /\b(immigration|visa\s+appointment|embassy|consulate)\s+([^.!?]+)/gi, label: 'visa/immigration' },
    { pattern: /\b(missed\s+flight|delayed\s+flight|cancelled\s+flight)\s+([^.!?]+)/gi, label: 'flight issue' }
  ];
  
  for (const { pattern, label } of eventPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const value = label;
      const quote = extractSentenceQuote(text, match.index, 300);
      results.push({ value, quote, offset: match.index, source: 'post' });
    }
  }
  
  return deduplicateByNormalizedKey(results, 'post');
}

/**
 * Extrait les problèmes du texte
 */
function extractProblems(text) {
  const results = [];
  const lowerText = text.toLowerCase();
  
  const problemKeywords = [
    'sick', 'illness', 'food poisoning', 'food poisoning', 'intoxication alimentaire',
    'scam', 'arnaque', 'fraud', 'fraude',
    'stolen', 'volé', 'theft', 'vol',
    'cancelled', 'annulé', 'canceled',
    'delayed', 'retardé', 'delay',
    'overstayed', 'séjour prolongé',
    'denied', 'refusé', 'refused',
    'lost', 'perdu', 'missing', 'manquant',
    'broken', 'cassé', 'damaged', 'endommagé',
    'stranded', 'bloqué', 'stuck'
  ];
  
  for (const keyword of problemKeywords) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = keyword;
      const quote = extractSentenceQuote(text, match.index, 160);
      results.push({ value, quote, offset: match.index, source: 'post' });
    }
  }
  
  return deduplicateByNormalizedKey(results, 'post');
}

/**
 * Extrait les émotions explicites du texte
 */
function extractEmotions(text) {
  const results = [];
  const lowerText = text.toLowerCase();
  
  const emotionKeywords = [
    'stress', 'stressed', 'stressful', 'stressant',
    'scared', 'frightened', 'peur', 'effrayé',
    'anxious', 'anxiety', 'anxieux', 'anxiété',
    'angry', 'anger', 'en colère', 'colère',
    'happy', 'happiness', 'heureux', 'bonheur',
    'relieved', 'soulagé', 'relief',
    'frustrated', 'frustration', 'frustré',
    'worried', 'worry', 'inquiet', 'inquiétude',
    'excited', 'excitement', 'excité',
    'disappointed', 'disappointment', 'déçu', 'déception',
    'confused', 'confusion', 'confus'
  ];
  
  for (const keyword of emotionKeywords) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = keyword;
      const quote = extractSentenceQuote(text, match.index, 120);
      results.push({ value, quote, offset: match.index, source: 'post' });
    }
  }
  
  return deduplicateByNormalizedKey(results, 'post');
}

/**
 * Extrait les conseils explicites du texte
 */
function extractAdvice(text) {
  const results = [];
  const lowerText = text.toLowerCase();
  
  // Patterns EN
  const advicePatternsEN = [
    /\b(you\s+should|you\s+must|you\s+need\s+to|always|never|make\s+sure|i\s+recommend|i\s+suggest|don'?t|do\s+this|avoid)\s+([^.!?]+)/gi,
    /\b(get|buy|take|bring|pack|book|reserve)\s+([^.!?]+)/gi
  ];
  
  // Patterns FR
  const advicePatternsFR = [
    /\b(il\s+faut|tu\s+devrais|vous\s+devriez|évite|évitez|pense\s+à|pensez\s+à|je\s+recommande|je\s+suggère|n'?oublie\s+pas|n'?oubliez\s+pas)\s+([^.!?]+)/gi,
    /\b(achète|achetez|prends|prenez|apporte|apportez|réserve|réservez|booke|bookez)\s+([^.!?]+)/gi
  ];
  
  const allPatterns = [...advicePatternsEN, ...advicePatternsFR];
  
  for (const pattern of allPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      // Extraire le conseil (sans le marqueur)
      const adviceText = match[2] || match[1];
      const value = adviceText.trim().substring(0, 100); // Limiter à 100 chars
      const quote = extractSentenceQuote(text, match.index, 300);
      results.push({ value, quote, offset: match.index, source: 'post' });
    }
  }
  
  return deduplicateByNormalizedKey(results, 'post');
}

/**
 * Normalise une clé pour déduplication (lowercase, accents off, trim, collapse spaces, remove punctuation)
 */
function normalizeKey(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Collapse spaces
    .trim();
}

/**
 * Extrait une citation propre autour d'un offset, alignée sur les limites de phrases/mots
 */
function extractSentenceQuote(text, matchIndex, maxContextLength = 240) {
  if (!text || matchIndex < 0 || matchIndex >= text.length) return '';
  
  // Chercher en arrière la ponctuation . ! ? \n la plus proche (limite max 240 chars)
  let start = Math.max(0, matchIndex - maxContextLength);
  const sentenceStartPattern = /[.!?\n]/g;
  let lastSentenceEnd = start;
  
  // Chercher la dernière ponctuation avant matchIndex
  let match;
  while ((match = sentenceStartPattern.exec(text)) !== null) {
    if (match.index < matchIndex && match.index >= start) {
      lastSentenceEnd = match.index + 1;
    }
    if (match.index >= matchIndex) break;
  }
  
  // Si on a trouvé une ponctuation, commencer juste après
  if (lastSentenceEnd > start) {
    start = lastSentenceEnd;
  } else {
    // Fallback: chercher une limite de mot en arrière
    const wordBoundaryBack = text.lastIndexOf(' ', matchIndex - maxContextLength);
    if (wordBoundaryBack > start) {
      start = wordBoundaryBack + 1;
    }
  }
  
  // Chercher en avant la ponctuation . ! ? \n la plus proche (limite max 240 chars)
  let end = Math.min(text.length, matchIndex + maxContextLength);
  const sentenceEndPattern = /[.!?\n]/g;
  sentenceEndPattern.lastIndex = matchIndex;
  let firstSentenceEnd = end;
  
  match = sentenceEndPattern.exec(text);
  if (match && match.index < end) {
    firstSentenceEnd = match.index + 1;
  } else {
    // Fallback: chercher une limite de mot en avant
    const wordBoundaryForward = text.indexOf(' ', matchIndex + maxContextLength);
    if (wordBoundaryForward > matchIndex && wordBoundaryForward < end) {
      firstSentenceEnd = wordBoundaryForward;
    }
  }
  
  end = firstSentenceEnd;
  
  // Extraire la quote
  let quote = text.substring(start, end).trim();
  
  // Garantir que la quote commence par une lettre/chiffre (pas de ponctuation au début)
  quote = quote.replace(/^[^\wÀ-ÿ]+/, '');
  
  // Vérifier l'invariant: quote doit commencer par lettre/chiffre
  if (!/^[a-zA-ZÀ-ÿ0-9]/.test(quote)) {
    // Si ça ne commence pas bien, chercher le premier mot
    const firstWordMatch = quote.match(/[a-zA-ZÀ-ÿ0-9][^\s]*/);
    if (firstWordMatch) {
      const firstWordIndex = quote.indexOf(firstWordMatch[0]);
      quote = quote.substring(firstWordIndex);
    }
  }
  
  return quote;
}

/**
 * Extrait une citation autour d'un offset (fonction legacy, utilise extractSentenceQuote)
 */
function extractQuote(text, offset, contextLength = 50) {
  return extractSentenceQuote(text, offset, contextLength * 2);
}

/**
 * Déduplique les coûts par (amount, currency)
 */
function deduplicateCosts(results) {
  const unique = [];
  const seen = new Map();
  
  for (const result of results) {
    if (!result.amount || !result.currency) continue;
    
    const key = `${result.amount}_${result.currency}`;
    const existing = seen.get(key);
    
    if (!existing) {
      seen.set(key, result);
      unique.push(result);
    } else {
      // Garder celui avec la quote la plus longue et propre
      if (result.quote && result.quote.length > existing.quote.length) {
        const index = unique.indexOf(existing);
        if (index > -1) {
          unique[index] = result;
          seen.set(key, result);
        }
      }
    }
  }
  
  return unique;
}

/**
 * Déduplique les résultats par clé normalisée (pour problems, emotions, advice, etc.)
 */
function deduplicateByNormalizedKey(results, sourceType = 'post') {
  const unique = [];
  const seen = new Map();
  
  for (const result of results) {
    const normalizedValue = normalizeKey(result.value);
    if (!normalizedValue) continue;
    
    const key = `${normalizedValue}|${sourceType}|${result.source || ''}`;
    const existing = seen.get(key);
    
    if (!existing) {
      seen.set(key, result);
      unique.push(result);
    } else {
      // Garder celui avec la quote la plus longue et propre (commence/termine bien)
      const resultQuoteClean = result.quote && /^[a-zA-ZÀ-ÿ0-9]/.test(result.quote) && /[a-zA-ZÀ-ÿ0-9]$/.test(result.quote);
      const existingQuoteClean = existing.quote && /^[a-zA-ZÀ-ÿ0-9]/.test(existing.quote) && /[a-zA-ZÀ-ÿ0-9]$/.test(existing.quote);
      
      if (resultQuoteClean && (!existingQuoteClean || result.quote.length > existing.quote.length)) {
        const index = unique.indexOf(existing);
        if (index > -1) {
          unique[index] = result;
          seen.set(key, result);
        }
      }
    }
  }
  
  return unique;
}

/**
 * Déduplique les résultats par proximité (évite doublons proches) - legacy
 */
function deduplicateByProximity(results, proximityThreshold = 20) {
  return deduplicateByNormalizedKey(results);
}

/**
 * Analyse les commentaires pour extraire insights, warnings, etc.
 */
function analyzeComments(flatComments, postText) {
  const insights = [];
  const warnings = [];
  const contradictions = [];
  const consensus = [];
  const additionalFacts = [];
  
  const postLower = postText.toLowerCase();
  const postSentences = postText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  // 1. Insights (conseils ou retours d'expérience distincts)
  for (const comment of flatComments) {
    const body = cleanRedditText(comment.body);
    if (body.length < 50) continue; // Filtrer one-liners
    
    const lowerBody = body.toLowerCase();
    
    // Détecter conseil ou retour d'expérience
    if (/\b(i\s+recommend|i\s+suggest|my\s+experience|in\s+my\s+case|je\s+recommande|mon\s+expérience|dans\s+mon\s+cas)\b/i.test(body)) {
      const quote = extractSentenceQuote(body, 0, 300);
      insights.push({
        value: quote.substring(0, 150),
        quote,
        source: `comment:${comment.id}`,
        author: comment.author,
        score: comment.score
      });
    }
  }
  
  // 2. Warnings
  const warningPatterns = [
    /\b(beware|warning|attention|avoid|scam|arnaque|danger|risque)\s+([^.!?]+)/gi,
    /\b(attention|attention|évite|évitez|danger|risque)\s+([^.!?]+)/gi
  ];
  
  for (const comment of flatComments) {
    const body = cleanRedditText(comment.body);
    const lowerBody = body.toLowerCase();
    
    for (const pattern of warningPatterns) {
      let match;
      while ((match = pattern.exec(body)) !== null) {
        const value = match[2] || match[0];
        const quote = extractSentenceQuote(body, match.index, 200);
        warnings.push({
          value: value.trim().substring(0, 100),
          quote,
          source: `comment:${comment.id}`,
          author: comment.author,
          score: comment.score
        });
      }
    }
  }
  
  // 3. Contradictions (commentaire contredit le post) - STRICT
  const contradictionMarkers = [
    /\b(actually|but|however|not\s+true|that'?s\s+wrong|i\s+disagree|no,\s+|instead|faux|pas\s+vrai|je\s+ne\s+suis\s+pas\s+d'?accord|non,\s+|mais|cependant)\b/i
  ];
  
  // Extraire les claims du post (normalisés par clé)
  const postClaims = new Map();
  for (const sentence of postSentences) {
    const normalized = normalizeKey(sentence);
    if (normalized.length > 10) {
      postClaims.set(normalized, sentence.trim());
    }
  }
  
  for (const comment of flatComments) {
    const body = cleanRedditText(comment.body);
    if (body.length < 30) continue;
    
    // Vérifier si le commentaire contient un marqueur de contradiction
    let hasContradictionMarker = false;
    for (const marker of contradictionMarkers) {
      if (marker.test(body)) {
        hasContradictionMarker = true;
        break;
      }
    }
    
    if (!hasContradictionMarker) continue;
    
    // Normaliser le commentaire pour trouver un sujet commun avec un claim
    const commentNormalized = normalizeKey(body);
    const commentWords = commentNormalized.split(/\s+/).filter(w => w.length > 4);
    
    // Chercher un claim du post qui partage le même sujet (clé normalisée)
    for (const [claimKey, claimSentence] of postClaims.entries()) {
      const claimWords = claimKey.split(/\s+/).filter(w => w.length > 4);
      const commonWords = commentWords.filter(w => claimWords.includes(w));
      
      // Si ≥3 mots significatifs en commun, c'est probablement le même sujet
      if (commonWords.length >= 3) {
        // Extraire la contre-assertion propre
        const counterclaimMatch = body.match(/[.!?]\s*([^.!?]+(?:actually|but|however|not\s+true|wrong|instead|faux|mais|cependant)[^.!?]+)/i);
        const counterclaim = counterclaimMatch ? extractSentenceQuote(body, counterclaimMatch.index, 200) : extractSentenceQuote(body, 0, 200);
        const claimQuote = extractSentenceQuote(postText, postText.indexOf(claimSentence), 200);
        
        contradictions.push({
          claim: claimQuote || claimSentence,
          counterclaim,
          quote: extractSentenceQuote(body, 0, 300),
          source: `comment:${comment.id}`,
          author: comment.author,
          score: comment.score
        });
        break; // Un seul claim contredit par commentaire
      }
    }
  }
  
  // 4. Consensus (≥2 commentaires distincts avec le même signal) - STRICT
  // Construire une map key -> [comment_id...] sur warnings/advice/problèmes
  const consensusMap = new Map(); // key -> Set of comment_ids
  
  // Extraire warnings, advice, problems des commentaires
  for (const comment of flatComments) {
    const body = cleanRedditText(comment.body);
    if (body.length < 30) continue;
    
    // Extraire warnings
    for (const pattern of warningPatterns) {
      let match;
      while ((match = pattern.exec(body)) !== null) {
        const value = (match[2] || match[0]).trim();
        const normalized = normalizeKey(value);
        if (normalized.length > 5) {
          if (!consensusMap.has(normalized)) {
            consensusMap.set(normalized, new Set());
          }
          consensusMap.get(normalized).add(comment.id);
        }
      }
    }
    
    // Extraire advice (patterns similaires à extractAdvice)
    const advicePatterns = [
      /\b(you\s+should|you\s+must|always|never|make\s+sure|i\s+recommend|i\s+suggest|don'?t|do\s+this|avoid)\s+([^.!?]+)/gi,
      /\b(il\s+faut|tu\s+devrais|évite|évitez|je\s+recommande|je\s+suggère)\s+([^.!?]+)/gi
    ];
    
    for (const pattern of advicePatterns) {
      let match;
      while ((match = pattern.exec(body)) !== null) {
        const value = (match[2] || match[1]).trim();
        const normalized = normalizeKey(value);
        if (normalized.length > 5) {
          if (!consensusMap.has(normalized)) {
            consensusMap.set(normalized, new Set());
          }
          consensusMap.get(normalized).add(comment.id);
        }
      }
    }
    
    // Extraire problems
    const problemKeywords = ['sick', 'illness', 'food poisoning', 'scam', 'stolen', 'cancelled', 'delayed', 'denied', 'lost'];
    for (const keyword of problemKeywords) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(body)) {
        const normalized = normalizeKey(keyword);
        if (!consensusMap.has(normalized)) {
          consensusMap.set(normalized, new Set());
        }
        consensusMap.get(normalized).add(comment.id);
      }
    }
  }
  
  // Construire consensus: keys présentes dans ≥2 commentaires différents
  for (const [key, commentIds] of consensusMap.entries()) {
    if (commentIds.size >= 2) {
      // Récupérer les quotes des commentaires concernés
      const evidenceQuotes = [];
      for (const commentId of commentIds) {
        const comment = flatComments.find(c => c.id === commentId);
        if (comment) {
          const body = cleanRedditText(comment.body);
          const quote = extractSentenceQuote(body, 0, 200);
          evidenceQuotes.push({
            quote,
            source: `comment:${comment.id}`,
            author: comment.author,
            score: comment.score
          });
        }
      }
      
      if (evidenceQuotes.length >= 2) {
        consensus.push({
          value: key.substring(0, 150),
          count: commentIds.size,
          examples: evidenceQuotes.slice(0, 2) // Max 2 exemples
        });
      }
    }
  }
  
  // 5. Additional facts (nouveaux coûts, lieux, démarches)
  for (const comment of flatComments) {
    const body = cleanRedditText(comment.body);
    
    // Extraire nouveaux coûts
    const costs = extractCosts(body);
    for (const cost of costs) {
      // Vérifier si ce coût n'est pas déjà dans le post
      if (!postLower.includes(cost.value.toLowerCase())) {
        additionalFacts.push({
          type: 'cost',
          value: cost.value,
          quote: cost.quote,
          source: `comment:${comment.id}`,
          author: comment.author
        });
      }
    }
    
    // Extraire nouveaux lieux
    const locations = extractLocations(body);
    for (const location of locations) {
      if (!postLower.includes(location.value.toLowerCase())) {
        additionalFacts.push({
          type: 'location',
          value: location.value,
          quote: location.quote,
          source: `comment:${comment.id}`,
          author: comment.author
        });
      }
    }
  }
  
  return {
    insights: insights.slice(0, 10), // Limiter à 10
    warnings: warnings.slice(0, 10),
    contradictions: contradictions.slice(0, 5),
    consensus: consensus.slice(0, 5),
    additionalFacts: additionalFacts.slice(0, 15)
  };
}

/**
 * Valide qu'aucun item n'est inventé (anti-hallucination)
 */
function validateNoHallucination(output, originalPost, flatComments) {
  const postClean = cleanRedditText(originalPost);
  const commentMap = new Map();
  for (const comment of flatComments) {
    commentMap.set(comment.id, cleanRedditText(comment.body));
  }
  
  // Valider post signals
  for (const [key, items] of Object.entries(output.post.evidence)) {
    if (!Array.isArray(items)) continue;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item.quote || item.quote.trim() === '') {
        items.splice(i, 1);
        continue;
      }
      if (!postClean.includes(item.quote.trim())) {
        items.splice(i, 1);
        continue;
      }
    }
  }
  
  // Valider commentaires
  for (const [key, items] of Object.entries(output.comments.evidence)) {
    if (!Array.isArray(items)) continue;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item.quote || item.quote.trim() === '') {
        items.splice(i, 1);
        continue;
      }
      const sourceId = item.source?.replace('comment:', '') || item.source;
      const commentText = commentMap.get(sourceId);
      if (!commentText || !commentText.includes(item.quote.trim())) {
        items.splice(i, 1);
        continue;
      }
    }
  }
  
  // Valider aussi les sections directes (insights, warnings, etc.)
  for (const item of output.comments.insights) {
    if (item.source) {
      const sourceId = item.source.replace('comment:', '');
      const commentText = commentMap.get(sourceId);
      if (!commentText || !commentText.includes(item.quote.trim())) {
        const index = output.comments.insights.indexOf(item);
        if (index > -1) output.comments.insights.splice(index, 1);
      }
    }
  }
  
  // Même chose pour warnings, contradictions, etc.
  ['warnings', 'contradictions', 'additionalFacts'].forEach(section => {
    for (const item of output.comments[section] || []) {
      if (item.source) {
        const sourceId = item.source.replace('comment:', '');
        const commentText = commentMap.get(sourceId);
        if (!commentText || !commentText.includes(item.quote.trim())) {
          const index = output.comments[section].indexOf(item);
          if (index > -1) output.comments[section].splice(index, 1);
        }
      }
    }
  });
}

/**
 * Fonction principale: extrait les sémantiques d'un thread Reddit
 */
export function extractRedditSemantics(thread) {
  if (!thread || !thread.post) {
    throw new Error('Thread must have a post object');
  }
  
  const post = thread.post;
  const postText = cleanRedditText((post.selftext || post.content || '').trim());
  const titleText = cleanRedditText((post.title || '').trim());
  const fullPostText = `${titleText} ${postText}`.trim();
  
  // Flatten commentaires
  const flatComments = flattenRedditComments(thread.comments || []);
  
  // Extraire signaux du post
  const locations = extractLocations(fullPostText);
  const dates = extractDates(fullPostText);
  const costs = extractCosts(fullPostText);
  const events = extractEvents(fullPostText);
  const problems = extractProblems(fullPostText);
  const emotions = extractEmotions(fullPostText);
  const advice = extractAdvice(fullPostText);
  
  // Construire signals (valeurs uniques, normalisées pour coûts)
  const signals = {
    locations: [...new Set(locations.map(l => l.value))],
    dates: [...new Set(dates.map(d => d.value))],
    costs: [...new Set(costs.map(c => c.amount && c.currency ? `${c.amount} ${c.currency}` : c.value))],
    events: [...new Set(events.map(e => e.value))],
    problems: [...new Set(problems.map(p => p.value))],
    emotions_explicit: [...new Set(emotions.map(e => e.value))],
    advice_explicit: [...new Set(advice.map(a => a.value.substring(0, 50)))]
  };
  
  // Analyser commentaires
  const commentAnalysis = analyzeComments(flatComments, fullPostText);
  
  // Construire output
  const output = {
    source: {
      platform: 'reddit',
      subreddit: post.subreddit || '',
      url: post.url || '',
      post_id: post.id || post.name || '',
      title: titleText,
      author: post.author || '[deleted]',
      created_utc: post.created_utc || 0
    },
    post: {
      clean_text: postText,
      signals,
      evidence: {
        locations,
        dates,
        costs,
        events,
        problems,
        emotions_explicit: emotions,
        advice_explicit: advice
      }
    },
    comments: {
      count_total: flatComments.length,
      count_used: flatComments.filter(c => c.body && c.body.length > 30).length,
      insights: commentAnalysis.insights,
      warnings: commentAnalysis.warnings,
      contradictions: commentAnalysis.contradictions,
      consensus: commentAnalysis.consensus,
      additional_facts: commentAnalysis.additionalFacts,
      evidence: {
        insights: commentAnalysis.insights.map(i => ({
          value: i.value,
          quote: i.quote,
          source: i.source
        })),
        warnings: commentAnalysis.warnings.map(w => ({
          value: w.value,
          quote: w.quote,
          source: w.source
        })),
        contradictions: commentAnalysis.contradictions.map(c => ({
          claim: c.claim,
          counterclaim: c.counterclaim,
          quote: c.quote,
          source: c.source
        })),
        consensus: commentAnalysis.consensus.map(c => ({
          value: c.value,
          count: c.count,
          examples: c.examples
        })),
        additional_facts: commentAnalysis.additionalFacts.map(f => ({
          type: f.type,
          value: f.value,
          quote: f.quote,
          source: f.source
        }))
      }
    },
    quality: {
      has_minimum_signals: false,
      missing: []
    }
  };
  
  // Valider anti-hallucination
  validateNoHallucination(output, fullPostText, flatComments);
  
  // Calculer quality
  const hasProblemsEventsAdvice = 
    output.post.signals.problems.length > 0 ||
    output.post.signals.events.length > 0 ||
    output.post.signals.advice_explicit.length > 0;
  
  const hasLocationDateCost = 
    output.post.signals.locations.length > 0 ||
    output.post.signals.dates.length > 0 ||
    output.post.signals.costs.length > 0;
  
  output.quality.has_minimum_signals = hasProblemsEventsAdvice && hasLocationDateCost;
  
  if (!hasProblemsEventsAdvice) {
    output.quality.missing.push('problems/events/advice');
  }
  if (!hasLocationDateCost) {
    output.quality.missing.push('locations/dates/costs');
  }
  
  return output;
}
