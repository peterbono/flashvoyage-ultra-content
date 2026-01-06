#!/usr/bin/env node

/**
 * REDDIT PATTERN DETECTOR
 * Analyse les posts Reddit pour détecter des patterns et classifier le contenu
 * Phase 2 - Pattern Detector pour témoignages Reddit
 * 
 * Fonction pure, déterministe, sans dépendance externe
 */

/**
 * Détecte les patterns dans un post Reddit
 * @param {Object} input - Données du post Reddit
 * @param {string} input.title - Titre du post
 * @param {string} input.body - Corps du post
 * @param {Array} input.comments - Commentaires (optionnel)
 * @param {Object} input.meta - Métadonnées (optionnel)
 * @returns {Object} Classification du pattern
 */
export function detectRedditPattern(input) {
  const { title = '', body = '', comments = [], meta = {} } = input;
  
  // Normaliser le texte
  const fullText = `${title} ${body}`.trim();
  const textLower = fullText.toLowerCase();
  const commentsText = comments.map(c => c.body || '').join(' ').toLowerCase();
  
  // Si texte trop court, retourner valeurs par défaut
  if (fullText.length < 50) {
    return {
      story_type: 'mixed',
      theme_primary: 'other',
      themes_secondary: [],
      emotional_load: { score: 0, label: 'low', signals: [] },
      exploitable_events: { count: 0, events: [] },
      complexity: { score: 0, label: 'low', signals: [] },
      comments_utility: { score: 0, label: 'low', signals: [], sample_count: 0 },
      confidence: { score: 0, notes: ['Texte trop court pour analyse'] }
    };
  }
  
  // 1) Détecter story_type (passer input complet pour accès title/body séparés)
  const storyType = detectStoryType(fullText, textLower, input);
  
  // 2) Détecter theme_primary et themes_secondary
  const { primary, secondary } = detectThemes(textLower, commentsText);
  
  // 3) Détecter emotional_load
  const emotionalLoad = detectEmotionalLoad(fullText, textLower);
  
  // 4) Détecter exploitable_events
  const exploitableEvents = detectExploitableEvents(fullText, textLower);
  
  // 5) Détecter complexity
  const complexity = detectComplexity(fullText, textLower, exploitableEvents.count, secondary.length);
  
  // 6) Détecter comments_utility
  const commentsUtility = detectCommentsUtility(comments, commentsText);
  
  // 7) Calculer confidence (avec story_type et complexity pour plafonnement)
  const confidence = calculateConfidence(fullText, primary, exploitableEvents.count, comments.length, storyType, complexity.label);
  
  return {
    story_type: storyType,
    theme_primary: primary,
    themes_secondary: secondary.slice(0, 5),
    emotional_load: emotionalLoad,
    exploitable_events: {
      count: exploitableEvents.count,
      events: exploitableEvents.events.slice(0, 8)
    },
    complexity: complexity,
    comments_utility: commentsUtility,
    confidence: confidence
  };
}

/**
 * 1) Détecte le type de récit
 * SOURCE OF TRUTH - Priorité stricte (impossible à bypasser):
 * warning > update_thread > guide > list > linear/fragmented > question > mixed
 * 
 * Règle absolue: un post contenant ? ne doit JAMAIS sortir en question
 * si un signal warning est présent (ex: scam dans le titre).
 */
function detectStoryType(fullText, textLower, input = {}) {
  const { title = '', body = '' } = input;
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();
  
  // 1. WARNING: Priorité la plus haute (même si contient un ?)
  // SOURCE OF TRUTH: Cette vérification DOIT être la première, avant toute autre détection
  const warningKeywords = ['scam', 'arnaque', 'avoid', 'warning', 'attention', 'ne faites pas', 'à éviter', 'beware', 'danger', 'ne jamais', 'interdit', '⚠️', 'warn', 'fraud', 'escroc'];
  
  // Compter les occurrences dans le titre (poids x2) et le body
  const titleWarningCount = warningKeywords.filter(kw => titleLower.includes(kw)).length * 2;
  const bodyWarningCount = warningKeywords.filter(kw => bodyLower.includes(kw)).length;
  const warningCount = titleWarningCount + bodyWarningCount;
  
  // Warning si: (scam/arnaque dans titre) OU (≥2 signaux) OU (1 signal + !/⚠️)
  const hasScamInTitle = titleLower.includes('scam') || titleLower.includes('arnaque');
  const hasExclamation = textLower.includes('!') || textLower.includes('⚠️');
  
  if (hasScamInTitle || warningCount >= 2 || (warningCount >= 1 && hasExclamation)) {
    return 'warning';
  }
  
  // 2. UPDATE_THREAD: Priorité haute
  const updatePatterns = ['update', 'mise à jour', 'edit:', 'part 2', 'part ii', 'suite', 'follow-up', '[update]', '[edit]'];
  if (updatePatterns.some(p => textLower.includes(p))) {
    return 'update_thread';
  }
  
  // 3. GUIDE: Priorité haute
  const guidePatterns = ['tips', 'guide', 'checklist', 'voici', "j'ai appris", 'lessons', 'conseils', 'how to', 'step by step', 'étapes', 'tutorial', 'tutoriel'];
  const guideCount = guidePatterns.filter(p => textLower.includes(p)).length;
  if (guideCount >= 2) {
    return 'guide';
  }
  
  // 4. LIST: Priorité haute (puces ou numérotation)
  const bulletPatterns = /^[\s]*[-*•]\s|^\d+[\.\)]\s/gm;
  const bulletMatches = fullText.match(bulletPatterns) || [];
  if (bulletMatches.length >= 3) {
    return 'list';
  }
  
  // 5. LINEAR/FRAGMENTED: Avant question (si pas de signaux forts)
  const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = sentences.length > 0 ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length : 0;
  const hasEllipses = fullText.includes('...') || fullText.includes('…');
  const lineBreaks = (fullText.match(/\n/g) || []).length;
  const fragmentationScore = (lineBreaks / Math.max(1, sentences.length)) * 10 + (hasEllipses ? 5 : 0) + (avgSentenceLength < 50 ? 5 : 0);
  
  // 6. QUESTION: Détection stricte (seulement si pas de signaux forts ci-dessus)
  const hasQuestionMark = fullText.includes('?');
  const questionWords = ['how', 'what', 'where', 'when', 'why', 'où', 'comment', 'quel', 'quelle', 'quand', 'pourquoi', 'qui'];
  const questionWordMatches = questionWords.filter(word => textLower.includes(word));
  const hasQuestionWord = questionWordMatches.length > 0;
  
  // Question seulement si:
  // - présence de ? ET
  // - pas de signaux forts de warning/guide/list/update_thread (déjà vérifiés) ET
  // - ratio interrogatif suffisant (≥2 marqueurs interrogatifs OU ? + mot interrogatif)
  if (hasQuestionMark && hasQuestionWord) {
    const questionMarkCount = (fullText.match(/\?/g) || []).length;
    const totalInterrogativeMarkers = questionMarkCount + questionWordMatches.length;
    
    // Ratio suffisant: ≥2 marqueurs interrogatifs OU (? + au moins 1 mot interrogatif)
    if (totalInterrogativeMarkers >= 2 || (questionMarkCount >= 1 && questionWordMatches.length >= 1)) {
      // Mais seulement si pas de signaux narratifs forts (éviter de classer un récit avec une question finale comme "question")
      const narrativeSignals = ['story', 'récit', 'experience', 'expérience', 'journey', 'voyage', 'trip', 'finally', 'finalement', 'after', 'après'];
      const hasNarrativeSignal = narrativeSignals.some(signal => textLower.includes(signal));
      
      // Si signaux narratifs présents ET texte long (>300 chars), privilégier linear
      if (hasNarrativeSignal && fullText.length > 300) {
        if (fragmentationScore > 8) {
          return 'fragmented';
        }
        return 'linear';
      }
      
      return 'question';
    }
  }
  
  // 7. FRAGMENTED vs LINEAR (si pas de signaux ci-dessus)
  if (fragmentationScore > 8) {
    return 'fragmented';
  }
  
  return 'linear';
}

/**
 * 2) Détecte les thèmes principaux et secondaires
 */
function detectThemes(textLower, commentsText) {
  const themes = {
    health: {
      keywords: ['sick', 'hospital', 'doctor', 'insurance', 'malade', 'urgence', 'clinique', 'medical', 'health', 'santé', 'médecin', 'pharmacy', 'pharmacie'],
      score: 0
    },
    visa: {
      keywords: ['visa', 'immigration', 'embassy', 'schengen', 'overstayed', 'titre de séjour', 'consulat', 'passport', 'passeport', 'entry', 'exit', 'border'],
      score: 0
    },
    flights: {
      keywords: ['flight', 'delay', 'refund', 'airline', 'aéroport', 'correspondance', 'layover', 'booking', 'reservation', 'vol', 'avion', 'airport'],
      score: 0
    },
    scam: {
      keywords: ['scam', 'lawyer took money', 'arnaque', 'escroc', 'fraud', 'tricked', 'victim', 'victime', 'stolen', 'volé', 'rip-off'],
      score: 0
    },
    esim_connectivity: {
      keywords: ['esim', 'airalo', 'sim', 'data', 'roaming', 'wifi', 'internet', 'connection', 'connexion', 'mobile', 'phone', 'téléphone'],
      score: 0
    },
    money: {
      keywords: ['money', 'budget', 'cost', 'price', 'prix', 'coût', 'euro', 'dollar', 'usd', 'eur', 'expensive', 'cher', 'cheap', 'pas cher'],
      score: 0
    },
    accommodation: {
      keywords: ['hotel', 'hostel', 'airbnb', 'accommodation', 'logement', 'hébergement', 'room', 'chambre', 'apartment', 'appartement', 'coliving'],
      score: 0
    },
    safety: {
      keywords: ['safe', 'safety', 'danger', 'dangerous', 'sécurité', 'danger', 'risk', 'risque', 'police', 'thief', 'voleur', 'pickpocket'],
      score: 0
    },
    work: {
      keywords: ['work', 'job', 'remote', 'travail', 'emploi', 'freelance', 'client', 'income', 'revenu', 'salary', 'salaire'],
      score: 0
    },
    gear: {
      keywords: ['laptop', 'computer', 'equipment', 'équipement', 'bag', 'sac', 'luggage', 'bagage', 'camera', 'caméra', 'phone', 'téléphone'],
      score: 0
    },
    itinerary: {
      keywords: ['itinerary', 'route', 'journey', 'itinéraire', 'voyage', 'travel', 'trip', 'destination', 'city', 'ville', 'country', 'pays'],
      score: 0
    },
    admin: {
      keywords: ['document', 'paperwork', 'form', 'formulaire', 'application', 'candidature', 'procedure', 'procédure', 'bureaucracy', 'bureaucratie'],
      score: 0
    }
  };
  
  // Calculer les scores
  const combinedText = `${textLower} ${commentsText}`;
  for (const [theme, data] of Object.entries(themes)) {
    data.score = data.keywords.filter(kw => combinedText.includes(kw)).length;
  }
  
  // Trier par score
  const sortedThemes = Object.entries(themes)
    .map(([name, data]) => ({ name, score: data.score }))
    .sort((a, b) => b.score - a.score);
  
  const primary = sortedThemes[0]?.score > 0 ? sortedThemes[0].name : 'other';
  const secondary = sortedThemes
    .filter(t => t.name !== primary && t.score > 0)
    .map(t => t.name);
  
  return { primary, secondary };
}

/**
 * 3) Détecte la charge émotionnelle
 */
function detectEmotionalLoad(fullText, textLower) {
  let score = 0;
  const signals = [];
  
  // Lexique émotions négatives
  const negativeEmotions = ['panic', 'stress', 'nightmare', 'terrified', 'horrible', 'catastrophe', 'disaster', 'terrible', 'awful', 'worst', 'panique', 'cauchemar', 'terrifié', 'horrible', 'catastrophe', 'désastre', 'terrible', 'pire'];
  negativeEmotions.forEach(emotion => {
    if (textLower.includes(emotion)) {
      score += 5;
      signals.push(emotion);
    }
  });
  
  // Ponctuation intensive
  const exclamationCount = (fullText.match(/!/g) || []).length;
  if (exclamationCount >= 3) {
    score += 10;
    signals.push('multiple_exclamations');
  }
  
  // Intensificateurs
  const intensifiers = ['wtf', 'omg', 'fuck', 'merde', 'putain', 'damn', 'very', 'très', 'extremely', 'extrêmement', 'incredibly', 'incroyablement'];
  intensifiers.forEach(int => {
    if (textLower.includes(int)) {
      score += 3;
      if (!signals.includes('intensifiers')) signals.push('intensifiers');
    }
  });
  
  // Caps lock
  const capsRatio = (fullText.match(/[A-Z]{3,}/g) || []).length;
  if (capsRatio > 0) {
    score += 5;
    signals.push('caps_lock');
  }
  
  score = Math.min(100, score);
  
  let label = 'low';
  if (score >= 65) label = 'high';
  else if (score >= 30) label = 'medium';
  
  return { score, label, signals: signals.slice(0, 5) };
}

/**
 * 4) Détecte les événements exploitables
 */
function detectExploitableEvents(fullText, textLower) {
  const events = [];
  
  // Patterns temporels
  const timePatterns = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/gi,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /\b(then|ensuite|après|après ça|le lendemain|next day|yesterday|hier|today|aujourd'hui|tomorrow|demain)\b/gi
  ];
  
  // Verbes d'action + objets
  const actionPatterns = [
    /(booked|reserved|got|received|filed|contacted|applied|submitted|paid|paid for|acheté|réservé|obtenu|reçu|déposé|contacté|appliqué|soumis|payé)\s+[a-z\s]{5,30}/gi,
    /(got|became|fell|was|étais|suis devenu|suis tombé|était)\s+(sick|scammed|stuck|stranded|malade|arnaqué|bloqué|coincé)/gi
  ];
  
  // Extraire snippets
  const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  sentences.forEach(sentence => {
    const sentenceLower = sentence.toLowerCase();
    let eventType = null;
    let snippet = sentence.trim().substring(0, 120);
    
    // Vérifier patterns temporels
    const hasTimePattern = timePatterns.some(pattern => pattern.test(sentence));
    
    // Vérifier patterns d'action
    if (actionPatterns[0].test(sentence) || actionPatterns[1].test(sentence)) {
      if (sentenceLower.includes('visa') || sentenceLower.includes('embassy')) {
        eventType = 'visa_action';
      } else if (sentenceLower.includes('flight') || sentenceLower.includes('airline') || sentenceLower.includes('vol')) {
        eventType = 'flight_action';
      } else if (sentenceLower.includes('sick') || sentenceLower.includes('hospital') || sentenceLower.includes('malade')) {
        eventType = 'health_event';
      } else if (sentenceLower.includes('scam') || sentenceLower.includes('arnaque')) {
        eventType = 'scam_event';
      } else if (hasTimePattern) {
        eventType = 'timeline_event';
      } else {
        eventType = 'action_event';
      }
      
      if (eventType) {
        events.push({ type: eventType, snippet });
      }
    }
  });
  
  return { count: events.length, events };
}

/**
 * 5) Détecte la complexité
 */
function detectComplexity(fullText, textLower, eventsCount, themesCount) {
  let score = 0;
  const signals = [];
  
  // Longueur
  if (fullText.length > 2000) {
    score += 20;
    signals.push('long_text');
  } else if (fullText.length > 1000) {
    score += 10;
  }
  
  // Diversité de thèmes
  if (themesCount >= 5) {
    score += 25;
    signals.push('multiple_themes');
  } else if (themesCount >= 3) {
    score += 15;
  }
  
  // Nombre d'événements
  if (eventsCount >= 5) {
    score += 20;
    signals.push('multiple_events');
  } else if (eventsCount >= 3) {
    score += 10;
  }
  
  // Contraintes (budget, temps, visa rules)
  const constraints = ['budget', 'time', 'deadline', 'limit', 'constraint', 'budget', 'temps', 'délai', 'limite', 'contrainte'];
  const constraintsCount = constraints.filter(c => textLower.includes(c)).length;
  if (constraintsCount >= 2) {
    score += 10;
    signals.push('constraints');
  }
  
  // Contradictions
  const contradictions = ['but', 'however', 'except', 'sauf que', 'mais', 'cependant', 'toutefois', 'pourtant'];
  const contradictionsCount = contradictions.filter(c => textLower.includes(c)).length;
  if (contradictionsCount >= 2) {
    score += 15;
    signals.push('contradictions');
  }
  
  score = Math.min(100, score);
  
  let label = 'low';
  if (score >= 70) label = 'high';
  else if (score >= 35) label = 'medium';
  
  return { score, label, signals: signals.slice(0, 5) };
}

/**
 * 6) Détecte l'utilité des commentaires
 */
function detectCommentsUtility(comments, commentsText) {
  if (!comments || comments.length === 0) {
    return { score: 0, label: 'low', signals: [], sample_count: 0 };
  }
  
  let score = 0;
  const signals = [];
  
  // Densité de conseils
  const advicePatterns = ['you should', 'recommend', 'je conseille', 'avoid', 'évitez', 'suggest', 'suggère', 'try', 'essayez', 'use', 'utilisez'];
  const adviceCount = advicePatterns.filter(p => commentsText.includes(p)).length;
  if (adviceCount >= 3) {
    score += 30;
    signals.push('advice_dense');
  } else if (adviceCount >= 1) {
    score += 15;
  }
  
  // Présence de sources/links
  const hasLinks = /https?:\/\//.test(commentsText);
  if (hasLinks) {
    score += 20;
    signals.push('has_links');
  }
  
  // Contradictions/corrections
  const correctionPatterns = ['actually', 'faux', 'attention', 'correction', 'wrong', 'incorrect', 'not true', 'pas vrai'];
  const correctionCount = correctionPatterns.filter(p => commentsText.includes(p)).length;
  if (correctionCount >= 1) {
    score += 15;
    signals.push('corrections');
  }
  
  // Score des commentaires (si disponible)
  const scoredComments = comments.filter(c => c.score && c.score > 0);
  if (scoredComments.length > 0) {
    const avgScore = scoredComments.reduce((sum, c) => sum + (c.score || 0), 0) / scoredComments.length;
    if (avgScore > 10) {
      score += 20;
      signals.push('high_scored_comments');
    }
  }
  
  score = Math.min(100, score);
  
  let label = 'low';
  if (score >= 65) label = 'high';
  else if (score >= 30) label = 'medium';
  
  return {
    score,
    label,
    signals: signals.slice(0, 5),
    sample_count: Math.min(20, comments.length)
  };
}

/**
 * 7) Calcule la confiance
 * Ajusté pour éviter confidence trop haute quand events=0 et complexity=0
 * Plafonne à 80 pour warning/question avec complexity low et events <= 1
 */
function calculateConfidence(fullText, primaryTheme, eventsCount, commentsCount, storyType, complexityLabel) {
  let score = 100;
  const notes = [];
  
  // Pénalité si texte court
  if (fullText.length < 200) {
    score -= 30;
    notes.push('Texte court');
  } else if (fullText.length < 500) {
    score -= 15;
    notes.push('Texte moyen');
  }
  
  // Pénalité si aucun thème clair
  if (primaryTheme === 'other') {
    score -= 25;
    notes.push('Aucun thème clair détecté');
  }
  
  // Pénalité si aucun événement (plus forte)
  if (eventsCount === 0) {
    score -= 30; // Augmenté de 20 à 30
    notes.push('Aucun événement exploitable détecté');
  }
  
  // Bonus si commentaires présents
  if (commentsCount > 0) {
    score += 10;
    notes.push('Commentaires disponibles');
  }
  
  // Règle spéciale: si events=0 ET texte court/moyen, plafonner à 70
  if (eventsCount === 0 && fullText.length < 500) {
    score = Math.min(70, score);
    notes.push('Plafonné à 70 (events=0 + texte court)');
  }
  
  // Règle spéciale: si events=0 ET thème=other, plafonner à 60
  if (eventsCount === 0 && primaryTheme === 'other') {
    score = Math.min(60, score);
    notes.push('Plafonné à 60 (events=0 + thème=other)');
  }
  
  // SOURCE OF TRUTH - Règle non négociable de confidence
  // Si story_type est warning ou question ET complexity est low ET events <= 1
  // => confidence DOIT être <= 80 (plafonnement strict)
  if ((storyType === 'warning' || storyType === 'question') && complexityLabel === 'low' && eventsCount <= 1) {
    score = Math.min(80, score);
    notes.push(`Plafonné à 80 (${storyType} + complexity low + events<=1) - SOURCE OF TRUTH`);
  }
  
  score = Math.max(0, Math.min(100, score));
  
  return { score, notes };
}
