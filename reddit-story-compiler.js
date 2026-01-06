#!/usr/bin/env node

/**
 * REDDIT STORY COMPILER
 * Phase 3 - Compilation d'un squelette narratif premium à partir de données Reddit
 * 
 * Règles strictes:
 * - Zéro invention, zéro ajout de faits
 * - Si une section n'est pas supportée par le texte source → null + reason
 * - Traçabilité obligatoire avec evidence_snippets
 */

/**
 * Compile un squelette narratif à partir de données Reddit
 * @param {Object} input - Données d'entrée
 * @param {Object} input.reddit - Données Reddit (title, selftext, author, created_utc, url, subreddit, comments?)
 * @param {Object} input.extraction - Résultat de extractRedditForAnalysis (optionnel)
 * @param {Object} input.pattern - Résultat de detectRedditPattern
 * @param {Object} input.geo - Géolocalisation (optionnel: country, city)
 * @param {Object} input.source - Métadonnées (optionnel: id, score, etc.)
 * @returns {Object} { story, evidence, meta }
 */
export function compileRedditStory(input) {
  const { reddit = {}, extraction = {}, pattern = {}, geo = {}, source = {} } = input;
  
  // Normaliser les données
  const title = reddit.title || '';
  const selftext = reddit.selftext || reddit.body || '';
  const author = reddit.author || null;
  const comments = reddit.comments || [];
  const fullText = `${title} ${selftext}`.trim();
  
  // Initialiser les structures
  const story = {
    context: {},
    central_event: null,
    critical_moment: null,
    resolution: null,
    author_lessons: [],
    community_insights: [],
    open_questions: []
  };
  
  const evidence = {
    source_snippets: []
  };
  
  const missingSections = [];
  
  // 1. CONTEXT
  story.context = compileContext(title, selftext, author, geo, evidence, missingSections);
  
  // 2. CENTRAL_EVENT
  story.central_event = compileCentralEvent(fullText, pattern, evidence, missingSections);
  
  // 3. CRITICAL_MOMENT
  story.critical_moment = compileCriticalMoment(fullText, pattern, evidence, missingSections);
  
  // 4. RESOLUTION
  story.resolution = compileResolution(fullText, pattern, evidence, missingSections);
  
  // 5. AUTHOR_LESSONS
  story.author_lessons = compileAuthorLessons(fullText, pattern, evidence);
  
  // 6. COMMUNITY_INSIGHTS
  if (pattern.comments_utility && pattern.comments_utility.label !== 'low' && comments.length > 0) {
    story.community_insights = compileCommunityInsights(comments, evidence);
  }
  
  // 7. OPEN_QUESTIONS
  if (pattern.story_type === 'question' || pattern.story_type === 'guide') {
    story.open_questions = compileOpenQuestions(fullText, pattern, evidence);
  }
  
  // META
  const meta = {
    story_type: pattern.story_type || 'mixed',
    themes: {
      primary: pattern.theme_primary || 'other',
      secondary: pattern.themes_secondary || []
    },
    confidence: {
      pattern_confidence: pattern.confidence?.score || 0,
      story_compiler_confidence: calculateStoryCompilerConfidence(story, evidence, missingSections, pattern)
    },
    constraints: {
      no_invention: true,
      neutral_rewrite: true
    },
    missing_sections: missingSections
  };
  
  return { story, evidence, meta };
}

/**
 * Helper unifié pour setter une section avec traçabilité obligatoire
 * @param {string} sectionName - Nom de la section (ex: 'central_event')
 * @param {Object} sectionData - Données de la section (ex: { summary, type })
 * @param {Array} snippetCandidates - Candidats de snippets (ex: [{ text, origin, comment_id? }])
 * @param {Object} evidence - Objet evidence à modifier
 * @param {Array} missingSections - Array missing_sections à modifier
 * @returns {Object|null} - Section data ou null si pas de snippet
 */
function setSection(sectionName, sectionData, snippetCandidates, evidence, missingSections) {
  // Choisir un snippet non vide
  const validSnippet = snippetCandidates.find(s => s && s.text && s.text.trim().length > 0);
  
  if (!validSnippet) {
    missingSections.push({ 
      section: sectionName, 
      reason: 'no supporting snippet found' 
    });
    return null;
  }
  
  // Ajouter automatiquement dans evidence
  evidence.source_snippets.push({
    section: sectionName,
    snippet: validSnippet.text.trim().substring(0, 300),
    origin: validSnippet.origin || 'selftext',
    comment_id: validSnippet.comment_id || null
  });
  
  return sectionData;
}

/**
 * Compile le contexte (summary, who, where, when)
 */
function compileContext(title, selftext, author, geo, evidence, missingSections) {
  const context = {
    summary: null,
    who: null,
    where: null,
    when: null
  };
  
  const fullText = `${title} ${selftext}`.trim();
  
  // Summary: 1-3 phrases neutres extraites du début
  const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences.length > 0) {
    const summarySentences = sentences.slice(0, Math.min(3, sentences.length));
    const summaryText = summarySentences.map(s => s.trim()).join(' ').substring(0, 300);
    const summarySnippet = setSection(
      'context.summary',
      summaryText, // Pour context.summary, on retourne directement le texte
      [{ text: summaryText, origin: 'selftext' }],
      evidence,
      missingSections
    );
    context.summary = summarySnippet; // Peut être null si pas de snippet
  }
  
  // Who: auteur si mentionné
  if (author) {
    context.who = author;
    // Chercher si l'auteur se mentionne dans le texte
    const authorMentions = ['I', 'me', 'my', 'we', 'our', 'je', 'moi', 'mon', 'ma', 'mes', 'nous'];
    if (authorMentions.some(mention => selftext.toLowerCase().includes(mention))) {
      evidence.source_snippets.push({
        section: 'context.who',
        snippet: `Author: ${author}`,
        origin: 'meta'
      });
    }
  }
  
  // Where: géolocalisation ou mention dans le texte
  if (geo.country || geo.city) {
    context.where = geo.city ? `${geo.city}, ${geo.country}` : geo.country;
    evidence.source_snippets.push({
      section: 'context.where',
      snippet: context.where,
      origin: 'geo'
    });
  } else {
    // Chercher des mentions de lieux dans le texte
    const locationPatterns = /\b(Thailand|Vietnam|Japan|Bali|Chiang Mai|Ho Chi Minh|Tokyo|Bangkok|Siem Reap)\b/gi;
    const locationMatches = fullText.match(locationPatterns);
    if (locationMatches && locationMatches.length > 0) {
      context.where = locationMatches[0];
      evidence.source_snippets.push({
        section: 'context.where',
        snippet: context.where,
        origin: 'selftext'
      });
    }
  }
  
  // When: chercher des dates ou références temporelles
  const timePatterns = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{1,2}/gi,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /\b(last\s+month|last\s+year|yesterday|today|tomorrow|hier|aujourd'hui|demain|il y a)\b/gi
  ];
  
  for (const pattern of timePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      context.when = match[0];
      evidence.source_snippets.push({
        section: 'context.when',
        snippet: context.when,
        origin: 'selftext'
      });
      break;
    }
  }
  
  return context;
}

/**
 * Compile l'événement central
 */
function compileCentralEvent(fullText, pattern, evidence, missingSections) {
  const snippetCandidates = [];
  
  // Utiliser exploitable_events si présent
  if (pattern.exploitable_events && pattern.exploitable_events.events.length > 0) {
    const firstEvent = pattern.exploitable_events.events[0];
    snippetCandidates.push({
      text: firstEvent.snippet,
      origin: 'selftext'
    });
    
    const sectionData = {
      summary: firstEvent.snippet.substring(0, 200),
      type: firstEvent.type || pattern.theme_primary || 'other'
    };
    
    return setSection('central_event', sectionData, snippetCandidates, evidence, missingSections);
  }
  
  // Sinon, extraire depuis le texte en fonction du theme_primary
  const theme = pattern.theme_primary || 'other';
  const themeKeywords = {
    visa: ['visa', 'extension', 'embassy', 'consulate', 'immigration'],
    health: ['sick', 'hospital', 'doctor', 'insurance', 'medical', 'health'],
    flights: ['flight', 'airline', 'delay', 'booking', 'airport'],
    scam: ['scam', 'fraud', 'tricked', 'stolen', 'arnaque'],
    esim_connectivity: ['esim', 'sim', 'data', 'internet', 'wifi', 'connection']
  };
  
  const keywords = themeKeywords[theme] || [];
  if (keywords.length === 0) {
    missingSections.push({ section: 'central_event', reason: 'No exploitable events and theme not extractable' });
    return null;
  }
  
  // Trouver la phrase contenant le mot-clé
  const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    if (keywords.some(kw => sentenceLower.includes(kw))) {
      snippetCandidates.push({
        text: sentence.trim(),
        origin: 'selftext'
      });
      
      const sectionData = {
        summary: sentence.trim().substring(0, 200),
        type: theme
      };
      
      return setSection('central_event', sectionData, snippetCandidates, evidence, missingSections);
    }
  }
  
  missingSections.push({ section: 'central_event', reason: 'No sentence found matching theme keywords' });
  return null;
}

/**
 * Compile le moment critique
 */
function compileCriticalMoment(fullText, pattern, evidence, missingSections) {
  const snippetCandidates = [];
  
  // Chercher des signaux de pivot/crise
  const criticalSignals = [
    'but', 'however', 'suddenly', 'then', 'finally', 'unfortunately', 'problem', 'issue',
    'mais', 'cependant', 'soudainement', 'ensuite', 'finalement', 'malheureusement', 'problème'
  ];
  
  const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    if (criticalSignals.some(signal => sentenceLower.includes(signal))) {
      const trigger = criticalSignals.find(signal => sentenceLower.includes(signal));
      snippetCandidates.push({
        text: sentence.trim(),
        origin: 'selftext'
      });
      
      const sectionData = {
        summary: sentence.trim().substring(0, 200),
        trigger: trigger || null
      };
      
      return setSection('critical_moment', sectionData, snippetCandidates, evidence, missingSections);
    }
  }
  
  // Si pattern a emotional_load élevé, chercher des signaux émotionnels
  if (pattern.emotional_load && pattern.emotional_load.label === 'high') {
    const emotionalSignals = pattern.emotional_load.signals || [];
    for (const signal of emotionalSignals) {
      const regex = new RegExp(`[^.!?]*${signal}[^.!?]*`, 'i');
      const match = fullText.match(regex);
      if (match) {
        snippetCandidates.push({
          text: match[0].trim(),
          origin: 'selftext'
        });
        
        const sectionData = {
          summary: match[0].trim().substring(0, 200),
          trigger: signal
        };
        
        return setSection('critical_moment', sectionData, snippetCandidates, evidence, missingSections);
      }
    }
  }
  
  missingSections.push({ section: 'critical_moment', reason: 'No critical signals found in text' });
  return null;
}

/**
 * Compile la résolution
 */
function compileResolution(fullText, pattern, evidence, missingSections) {
  const snippetCandidates = [];
  
  // Chercher des signaux de résolution
  const resolutionSignals = {
    resolved: ['solved', 'fixed', 'resolved', 'worked', 'success', 'résolu', 'réglé', 'fonctionné', 'succès'],
    unresolved: ['still', 'ongoing', 'waiting', 'pending', 'toujours', 'en cours', 'en attente'],
    ongoing: ['trying', 'working on', 'in progress', 'essayer', 'travailler', 'en cours']
  };
  
  const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  let status = 'unknown';
  
  // Vérifier dans l'ordre: resolved > unresolved > ongoing
  for (const [statusKey, keywords] of Object.entries(resolutionSignals)) {
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      if (keywords.some(kw => sentenceLower.includes(kw))) {
        status = statusKey;
        snippetCandidates.push({
          text: sentence.trim(),
          origin: 'selftext'
        });
        
        const sectionData = {
          summary: sentence.trim().substring(0, 200),
          status
        };
        
        return setSection('resolution', sectionData, snippetCandidates, evidence, missingSections);
      }
    }
  }
  
  // Si aucun signal trouvé, chercher dans les derniers événements
  if (pattern.exploitable_events && pattern.exploitable_events.events.length > 0) {
    const lastEvent = pattern.exploitable_events.events[pattern.exploitable_events.events.length - 1];
    snippetCandidates.push({
      text: lastEvent.snippet,
      origin: 'selftext'
    });
    
    const sectionData = {
      summary: lastEvent.snippet.substring(0, 200),
      status: 'ongoing'
    };
    
    return setSection('resolution', sectionData, snippetCandidates, evidence, missingSections);
  }
  
  missingSections.push({ section: 'resolution', reason: 'No resolution signals found' });
  return null;
}

/**
 * Compile les leçons de l'auteur
 */
function compileAuthorLessons(fullText, pattern, evidence) {
  const lessons = [];
  
  // Chercher des patterns de leçons
  const lessonPatterns = [
    /(learned|learnt|lesson|advice|tip|conseil|leçon|appris|conseil)\s+[^.!?]{10,100}/gi,
    /(should|would|must|devrait|doit|faudrait)\s+[^.!?]{10,100}/gi,
    /(don't|never|avoid|ne pas|jamais|éviter)\s+[^.!?]{10,100}/gi
  ];
  
  for (const pattern of lessonPatterns) {
    const matches = fullText.match(pattern);
    if (matches) {
      for (const match of matches.slice(0, 3)) {
        const lesson = match.trim().substring(0, 150);
        lessons.push({
          lesson,
          evidence_snippet: lesson
        });
        evidence.source_snippets.push({
          section: 'author_lessons',
          snippet: lesson,
          origin: 'selftext'
        });
      }
    }
  }
  
  return lessons;
}

/**
 * Compile les insights de la communauté
 */
function compileCommunityInsights(comments, evidence) {
  const insights = [];
  
  // Chercher des commentaires avec conseils/recommandations
  const advicePatterns = [
    /(recommend|suggest|advice|tip|conseil|recommandation|suggestion)/gi,
    /(you should|you could|try|essayez|devriez)/gi
  ];
  
  for (const comment of comments.slice(0, 5)) {
    const commentText = comment.body || comment.text || '';
    if (commentText.length < 20) continue;
    
    for (const pattern of advicePatterns) {
      if (pattern.test(commentText)) {
        const insight = commentText.substring(0, 200);
        insights.push({
          insight,
          from: 'comment',
          evidence_snippet: insight,
          comment_id: comment.id || null
        });
        evidence.source_snippets.push({
          section: 'community_insights',
          snippet: insight,
          origin: 'comment',
          comment_id: comment.id || null
        });
        break;
      }
    }
  }
  
  return insights;
}

/**
 * Compile les questions ouvertes
 */
function compileOpenQuestions(fullText, pattern, evidence) {
  const questions = [];
  
  // Extraire les questions du texte
  const questionPattern = /[^.!?]*\?[^.!?]*/g;
  const matches = fullText.match(questionPattern);
  
  if (matches) {
    for (const match of matches.slice(0, 3)) {
      const question = match.trim();
      if (question.length > 10 && question.length < 200) {
        questions.push(question);
        evidence.source_snippets.push({
          section: 'open_questions',
          snippet: question,
          origin: 'selftext'
        });
      }
    }
  }
  
  return questions;
}

/**
 * Calcule la confiance du story compiler
 * SOURCE OF TRUTH - Plafonnement similaire à Phase 2 pour éviter confidence trop optimiste
 */
function calculateStoryCompilerConfidence(story, evidence, missingSections, pattern) {
  let score = 100;
  
  // Pénalité pour sections manquantes (plus forte)
  score -= missingSections.length * 15; // Augmenté de 10 à 15
  
  // Pénalité si pas d'évidence pour certaines sections
  const requiredSections = ['context.summary', 'central_event'];
  const hasEvidence = requiredSections.every(section => {
    return evidence.source_snippets.some(snippet => snippet.section.includes(section));
  });
  
  if (!hasEvidence) {
    score -= 25; // Augmenté de 20 à 25
  }
  
  // Bonus si community_insights présents
  if (story.community_insights.length > 0) {
    score += 10;
  }
  
  // Bonus si author_lessons présents
  if (story.author_lessons.length > 0) {
    score += 10;
  }
  
  // SOURCE OF TRUTH - Plafonnement basé sur events et complexity (comme Phase 2)
  const storyType = pattern?.story_type || 'mixed';
  const eventsCount = pattern?.exploitable_events?.count || 0;
  const complexityLabel = pattern?.complexity?.label || 'low';
  
  // Si events<=1 et complexity=low → cap à 80 pour warning/question, cap à 90 pour les autres
  if (eventsCount <= 1 && complexityLabel === 'low') {
    if (storyType === 'warning' || storyType === 'question') {
      score = Math.min(80, score);
    } else {
      score = Math.min(90, score);
    }
  }
  
  // Pénalité supplémentaire si missing_sections > 0 (plafonnement final)
  if (missingSections.length > 0) {
    score = Math.min(score, 100 - (missingSections.length * 10));
  }
  
  return Math.max(0, Math.min(100, score));
}
