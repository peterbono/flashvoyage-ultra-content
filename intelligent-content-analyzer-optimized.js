#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs';
import { OPENAI_API_KEY, DRY_RUN, FORCE_OFFLINE, LLM_PROVIDER, LLM_MODEL } from './config.js';
import { createClaudeCompletion, isAnthropicAvailable } from './anthropic-client.js';
import { extractRedditForAnalysis, isDestinationQuestion, extractMainDestination } from './reddit-extraction-adapter.js';
import { detectRedditPattern } from './reddit-pattern-detector.js';
import { compileRedditStory } from './reddit-story-compiler.js';
import { isKnownLocation } from './airport-lookup.js';
import { COUNTRY_DISPLAY_NAMES } from './destinations.js';
import tracker from './llm-cost-tracker.js';
import { FEW_SHOT_EXAMPLES } from './few-shot-examples.js';

// Helper pour logger en NDJSON
function debugLog(location, message, data, hypothesisId) {
  const logEntry = JSON.stringify({
    location,
    message,
    data,
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'run1',
    hypothesisId
  }) + '\n';
  try {
    const logPath = '/Users/floriangouloubi/Documents/perso/flashvoyage/.cursor/debug.log';
    // Créer le répertoire s'il n'existe pas
    const logDir = '/Users/floriangouloubi/Documents/perso/flashvoyage/.cursor';
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logPath, logEntry);
  } catch (e) {
    console.error('DEBUG LOG ERROR:', e.message);
  }
}

// Helper pour décoder les entités HTML courantes et numériques
function decodeHtmlEntities(text) {
  // D'abord décoder les entités HTML numériques (&#8217;, &#39;, etc.)
  text = text.replace(/&#(\d+);/g, (match, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });
  // Puis décoder les entités HTML nommées courantes
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'");
}

// 2) Utilitaire pour sécuriser tous les JSON.parse avec réparation automatique
function safeJsonParse(str, label = 'json') {
  if (!str || typeof str !== 'string' || str.trim().length === 0) {
    throw new Error(`SAFE_JSON_PARSE_EMPTY: ${label}`);
  }
  
  // Strip markdown code fences (Claude wraps JSON in ```json ... ```)
  let cleaned = str.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  
  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    // Réparation JSON Claude : trailing commas, control chars, newlines dans strings
    let repairAttempt = cleaned
      .replace(/,\s*([\]}])/g, '$1')           // trailing commas
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' '); // control chars (except \n \r \t)
    try {
      return JSON.parse(repairAttempt);
    } catch (_) {}
    
    // Fix Claude: literal newlines inside JSON string values -> \\n
    const withEscapedNewlines = repairAttempt.replace(
      /"(?:[^"\\]|\\.)*"/g,
      match => match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    );
    try {
      return JSON.parse(withEscapedNewlines);
    } catch (_) {}
    
    // Extraire le premier objet/array JSON valide par regex
    const jsonExtract = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonExtract) {
      const extracted = jsonExtract[1]
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/"(?:[^"\\]|\\.)*"/g, m => m.replace(/\n/g, '\\n').replace(/\r/g, '\\r'));
      try {
        return JSON.parse(extracted);
      } catch (_) {}
    }
  }
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Stratégie 0: Guillemets HTML non-échappés dans les valeurs JSON
    // Ex: "quick_guide": "<p class="bold">..." → les " dans les attributs HTML cassent le JSON
    if (e.message.includes("Expected ','") || e.message.includes("Expected '}'") || e.message.includes('after property value')) {
      console.warn(`⚠️ JSON avec guillemets HTML non-échappés pour ${label} - Extraction par regex...`);
      
      // Extraire le titre par regex
      const titreMatch = cleaned.match(/"titre"\s*:\s*"([^"]{5,200})"/);
      const titre = titreMatch ? titreMatch[1] : 'Article généré';
      
      // Extraire le developpement par regex (le plus gros champ)
      const devMatch = cleaned.match(/"developpement"\s*:\s*"([\s\S]+?)(?:"\s*,\s*"(?:recommandations|ce_qu_il_faut_retenir|signature|_editorial)"|"\s*\}\s*\}|$)/);
      if (devMatch && devMatch[1] && devMatch[1].length > 200) {
        let extractedDev = devMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\t/g, '\t');
        
        // Extraire aussi les autres champs si possible
        const quickMatch = cleaned.match(/"quick_guide"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"(?:developpement|introduction|ce_que_les_autres))/);
        const recoMatch = cleaned.match(/"recommandations"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"(?:ce_qu_il_faut_retenir|signature)"|"\s*\}\s*\})/);
        const retainMatch = cleaned.match(/"ce_qu_il_faut_retenir"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"(?:signature|_editorial)"|"\s*\}\s*\})/);
        
        const unescape = (s) => s?.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\') || '';
        
        console.log(`✅ JSON réparé par extraction regex: titre="${titre.substring(0, 50)}..." dev=${extractedDev.length} chars`);
        return {
          article: {
            titre,
            quick_guide: quickMatch ? unescape(quickMatch[1]) : null,
            developpement: extractedDev,
            recommandations: recoMatch ? unescape(recoMatch[1]) : null,
            ce_qu_il_faut_retenir: retainMatch ? unescape(retainMatch[1]) : null,
            signature: null
          }
        };
      }
    }
    
    // Tentative de réparation si JSON incomplet (tronqué)
    if (e.message.includes('Unexpected end of JSON input') || e.message.includes('end of data') || e.message.includes("Expected ','") || e.message.includes("Expected '}'")) {
      console.warn(`⚠️ JSON tronqué détecté pour ${label} - Tentative de réparation...`);
      
      // Stratégie 1: Chercher le dernier objet/array valide
      let repaired = cleaned;
      
      // Si le JSON commence par { mais ne se termine pas par }, essayer de fermer
      if (repaired.startsWith('{') && !repaired.endsWith('}')) {
        // Compter les accolades ouvertes/fermées
        let openBraces = 0;
        let lastValidPos = -1;
        for (let i = 0; i < repaired.length; i++) {
          if (repaired[i] === '{') openBraces++;
          if (repaired[i] === '}') openBraces--;
          if (openBraces === 0 && i > 0) {
            lastValidPos = i;
          }
        }
        
        if (lastValidPos > 0) {
          repaired = repaired.substring(0, lastValidPos + 1);
          try {
            return JSON.parse(repaired);
          } catch (e2) {
            // Si ça échoue, continuer avec les autres stratégies
          }
        }
        
        // Stratégie 2: Fermer toutes les structures ouvertes
        let openCount = (repaired.match(/\{/g) || []).length;
        let closeCount = (repaired.match(/\}/g) || []).length;
        let missingCloses = openCount - closeCount;
        
        if (missingCloses > 0) {
          // Retirer les virgules finales et fermer les structures
          repaired = repaired.replace(/,\s*$/, '');
          for (let i = 0; i < missingCloses; i++) {
            repaired += '}';
          }
          
          try {
            return JSON.parse(repaired);
          } catch (e3) {
            // Si ça échoue encore, essayer d'extraire un objet partiel
          }
        }
      }
      
      // Stratégie 3: Extraire un objet JSON partiel valide
      const jsonMatch = repaired.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e4) {
          // Stratégie 4: Extraire le champ "developpement" par regex (CRITIQUE pour articles)
          // Le champ developpement contient le corps de l'article et est souvent tronqué
          console.warn(`⚠️ Stratégie 4: Tentative d'extraction du champ developpement par regex...`);
          
          // Pattern pour extraire developpement (peut être tronqué à la fin)
          const devMatch = cleaned.match(/"developpement"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*,\s*"[a-z_]+"\s*:|"\s*\}|$)/i);
          if (devMatch && devMatch[1] && devMatch[1].length > 200) {
            let extractedDev = devMatch[1];
            // Nettoyer les échappements JSON
            extractedDev = extractedDev
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\')
              .replace(/\\t/g, '\t');
            
            console.log(`✅ Champ "developpement" extrait par regex: ${extractedDev.length} caractères`);
            
            // Extraire aussi le titre si possible
            const titreMatch = cleaned.match(/"titre"\s*:\s*"([^"]+)"/i);
            const titre = titreMatch ? titreMatch[1] : 'Article généré';
            
            // Retourner un objet minimal mais fonctionnel avec le developpement récupéré
            return {
              article: {
                titre: titre,
                developpement: extractedDev,
                recommandations: null,
                ce_qu_il_faut_retenir: null,
                signature: null
              }
            };
          }
          
          // Dernière tentative: créer un objet minimal avec ce qui est disponible
          console.warn(`⚠️ Réparation JSON échouée pour ${label} - Utilisation d'un objet minimal`);
          return {
            citations: [],
            donnees_cles: { titre: label, contenu: 'JSON tronqué - contenu non disponible' },
            structure: {},
            enseignements: [],
            defis: [],
            strategies: [],
            resultats: [],
            couts: [],
            erreurs: [],
            specificites: [],
            comparaisons: [],
            conseils: []
          };
        }
      }
    }
    
    // Si aucune réparation n'a fonctionné, throw avec preview
    const preview = cleaned.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`SAFE_JSON_PARSE_FAIL: ${label} msg=${e.message} preview="${preview}"`);
  }
}

// C) Wrapper LLM avec retry + fallback template DRY_RUN
async function callOpenAIWithRetry(config, retries = 3) {
  const timeout = parseInt(process.env.OPENAI_TIMEOUT_MS || '180000', 10);
  const isDryRun = DRY_RUN;
  const forceOffline = FORCE_OFFLINE;
  
  const backoffDelays = [1000, 3000, 7000];
  
  // En FORCE_OFFLINE, simuler timeout immédiatement
  if (forceOffline && !config.apiKey) {
    console.log(`⚠️ DRYRUN_LLM_FALLBACK_TEMPLATE_USED: reason=FORCE_OFFLINE`);
    return generateTemplateFallback(config.sourceText, config.article, config.type);
  }

  // Route vers Anthropic si provider configuré et disponible
  if (config.provider === 'anthropic' && isAnthropicAvailable()) {
    try {
      const anthropicResponse = await createClaudeCompletion({
        model: config.body?.model || LLM_MODEL,
        messages: config.body?.messages || [],
        max_tokens: config.body?.max_tokens || 4096,
        temperature: config.body?.temperature
      }, retries, config._trackingStep || 'unknown');
      return anthropicResponse;
    } catch (error) {
      if (isDryRun || forceOffline) {
        console.log(`⚠️ DRYRUN_LLM_FALLBACK_TEMPLATE_USED: reason=anthropic_error_${error.status || 'unknown'}`);
        return generateTemplateFallback(config.sourceText, config.article, config.type);
      }
      console.warn(`⚠️ ANTHROPIC_FALLBACK: ${error.message} — tentative OpenAI...`);
    }
  }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const t0 = Date.now();
      const response = await axios.post('https://api.openai.com/v1/chat/completions', config.body, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: timeout
      });
      const durationMs = Date.now() - t0;

      // Cost tracking
      if (response.data?.usage) {
        const step = config._trackingStep || 'unknown';
        const model = config.body?.model || 'unknown';
        tracker.recordFromUsage(step, model, response.data.usage, durationMs);
      }
      
      return response.data;
    } catch (error) {
      const isRetryable = error.code === 'ETIMEDOUT' || 
                         error.code === 'ECONNRESET' || 
                         error.response?.status === 429 ||
                         error.response?.status === 401;
      
      if (isRetryable && attempt < retries) {
        const delay = backoffDelays[attempt - 1];
        console.log(`⚠️ LLM_RETRY: attempt=${attempt}/${retries} reason=${error.code || error.response?.status || 'unknown'} delay=${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (attempt === retries) {
        if (isDryRun || forceOffline) {
          console.log(`⚠️ DRYRUN_LLM_FALLBACK_TEMPLATE_USED: reason=${error.code || error.response?.status || 'unknown'}`);
          return generateTemplateFallback(config.sourceText, config.article, config.type);
        } else {
          throw error;
        }
      }
    }
  }
}

// Fallback template déterministe (C)
function generateTemplateFallback(sourceText, article, type = 'analysis') {
  if (!sourceText || sourceText.length < 30) {
    throw new Error('Fallback template refusé: source_text < 30 chars');
  }
  
  // Extraire phrases clés du source_text
  const sentences = sourceText
    .split(/[.!?]\s+/)
    .filter(s => s.length > 20 && s.length < 30)
    .slice(0, 10);
  
  const bullets = sentences.slice(0, 6).map(s => s.trim());
  
  if (type === 'analysis') {
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            type_contenu: 'TEMOIGNAGE_SUCCESS_STORY',
            sous_categorie: 'Voyage en Asie',
            angle: 'Expérience authentique',
            audience: 'Digital nomades et voyageurs',
            destination: article.geo?.country || 'Asie',
            ton: 'Authentique et inspirant',
            template_specifique: 'success_story',
            raison: 'Témoignage basé sur expérience réelle'
          })
        }
      }]
    };
  } else if (type === 'extraction') {
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            citations: bullets.slice(0, 3),
            donnees_cles: bullets.slice(0, 4),
            structure: 'Témoignage',
            enseignements: bullets.slice(0, 3),
            conseils: bullets.slice(0, 5)
          })
        }
      }]
    };
  } else if (type === 'generation') {
    // Générer HTML basique avec template
    const intro = `Ce témoignage décrit une expérience de voyage en ${article.geo?.country || 'Asie'}.`;
    const sections = [
      '<h2>Contexte</h2>',
      `<p>${intro}</p>`,
      '<h2>Problème</h2>',
      `<p>${bullets[0] || 'Expérience de voyage'}</p>`,
      '<h2>Ce que dit la source</h2>',
      `<ul>${bullets.slice(0, 4).map(b => `<li>${b}</li>`).join('')}</ul>`,
      '<h2>Conseils actionnables</h2>',
      `<ul>${bullets.slice(4, 8).map(b => `<li>${b}</li>`).join('')}</ul>`,
      '<h2>Check-list pratique</h2>',
      `<ul>${bullets.slice(0, 6).map(b => `<li>${b}</li>`).join('')}</ul>`
    ].join('\n\n');
    
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            article: {
              titre: article.title || 'Témoignage de voyage',
              developpement: sections,
              conclusion: 'Cette expérience illustre les défis et opportunités du voyage en Asie.'
            }
          })
        }
      }]
    };
  }
  
  throw new Error('Type de fallback non supporté');
}

/**
 * PHASE 2 HELPER: Construit un truth pack minimal pour contraindre le LLM.
 * Sources strictement structurées — pas de regex sur le texte brut du post.
 * @param {Object} extracted - Données extraites par reddit-semantic-extractor
 * @returns {{ allowedNumbers: string[], allowedNumberTokens: string[], allowedLocations: string[], isPoor: boolean }}
 */
function buildPromptTruthPack(extracted, story = null) {
  const allowedNumbers = [];
  const allowedNumberTokens = new Set();

  // Helper: add a numeric string to the allowed lists
  function addNumber(str) {
    if (str && /\d/.test(str)) {
      allowedNumbers.push(str);
      const digits = str.match(/[\d]+/g) || [];
      digits.forEach(d => allowedNumberTokens.add(d));
      const concatenated = digits.join('');
      if (concatenated.length > 0 && digits.length > 1) allowedNumberTokens.add(concatenated);
    }
  }

  // --- NUMBERS FROM POST SIGNALS ---

  // Nombres depuis signals.costs (ex: "1500 USD", "220 bahts")
  const costs = extracted?.post?.signals?.costs || extracted?.costs || [];
  for (const cost of costs) {
    const str = typeof cost === 'string' ? cost : (cost?.value || cost?.amount ? `${cost.amount} ${cost.currency || ''}`.trim() : '');
    addNumber(str);
  }

  // Nombres depuis signals.dates (ex: "30 days", "March 2025") — seulement ceux contenant un chiffre
  const dates = extracted?.post?.signals?.dates || [];
  for (const date of dates) {
    const str = typeof date === 'string' ? date : (date?.value || '');
    addNumber(str);
  }

  // --- NUMBERS FROM COMMENTS (additional_facts) ---

  const commentAdditionalFacts = extracted?.comments?.additional_facts || [];
  for (const fact of commentAdditionalFacts) {
    const val = typeof fact === 'string' ? fact : (fact?.value || '');
    addNumber(val);
    // Also extract from the quote if present
    if (fact?.quote && /\d/.test(fact.quote)) {
      const quoteNums = fact.quote.match(/(\d[\d\s,.']*\d|\d+)\s*(€|euros?|dollars?|\$|bahts?|thb|฿|vnd|₫|%|jours?|semaines?|mois|ans?|années?|nuits?|heures?|km|miles?|minutes?|USD|GBP|SGD|AUD|MYR|IDR|PHP|JPY|KRW|CNY|INR|TWD|HKD|NZD)/gi) || [];
      for (const qn of quoteNums) addNumber(qn);
    }
  }

  // Numbers from comment insights/warnings values
  const commentInsights = extracted?.comments?.insights || [];
  for (const insight of commentInsights) {
    const val = typeof insight === 'string' ? insight : (insight?.value || '');
    if (/\d/.test(val)) addNumber(val);
  }

  // --- NUMBERS FROM STORY (stage 3 compilation) ---

  if (story) {
    // story.story.context.summary may contain numbers
    const storySummary = story?.story?.context?.summary || '';
    if (storySummary && /\d/.test(storySummary)) {
      const storyNums = storySummary.match(/(\d[\d\s,.']*\d|\d+)\s*(€|euros?|dollars?|\$|bahts?|thb|฿|vnd|₫|%|jours?|semaines?|mois|ans?|années?|nuits?|heures?|km|miles?|minutes?|USD|GBP|SGD|AUD|MYR|IDR|PHP|JPY|KRW|CNY|INR|TWD|HKD|NZD)/gi) || [];
      for (const sn of storyNums) addNumber(sn);
    }

    // Numbers from evidence source_snippets
    const snippets = story?.evidence?.source_snippets || [];
    for (const snippet of snippets) {
      const text = snippet?.snippet || '';
      if (text && /\d/.test(text)) {
        const snippetNums = text.match(/(\d[\d\s,.']*\d|\d+)\s*(€|euros?|dollars?|\$|bahts?|thb|฿|vnd|₫|%|jours?|semaines?|mois|ans?|années?|nuits?|heures?|km|miles?|minutes?|USD|GBP|SGD|AUD|MYR|IDR|PHP|JPY|KRW|CNY|INR|TWD|HKD|NZD)/gi) || [];
        for (const en of snippetNums) addNumber(en);
      }
    }

    // Numbers from author_lessons and community_insights
    const lessons = story?.story?.author_lessons || [];
    for (const lesson of lessons) {
      const val = typeof lesson === 'string' ? lesson : (lesson?.lesson || '');
      if (/\d/.test(val)) addNumber(val);
    }
    const communityInsights = story?.story?.community_insights || [];
    for (const ci of communityInsights) {
      const val = typeof ci === 'string' ? ci : (ci?.value || ci?.insight || '');
      if (/\d/.test(val)) addNumber(val);
    }
  }

  // --- LOCATIONS ---

  const locSet = new Set();

  // Locations from post signals
  const rawLocations = extracted?.post?.signals?.locations || [];
  for (const loc of rawLocations) {
    const str = (typeof loc === 'string' ? loc : (loc?.value || '')).trim();
    if (str) locSet.add(str);
  }
  if (extracted?.destination) locSet.add(extracted.destination.trim());
  if (Array.isArray(extracted?.destinations)) {
    for (const d of extracted.destinations) {
      if (typeof d === 'string' && d.trim()) locSet.add(d.trim());
    }
  }

  // Locations from comments additional_facts
  for (const fact of commentAdditionalFacts) {
    if (fact?.type === 'location' || fact?.type === 'lieu') {
      const val = typeof fact === 'string' ? fact : (fact?.value || '');
      if (val.trim()) locSet.add(val.trim());
    }
  }

  // Locations from story context
  if (story?.story?.context?.where) {
    const where = story.story.context.where;
    if (typeof where === 'string' && where.trim()) locSet.add(where.trim());
  }

  const allowedLocations = [...locSet].slice(0, 40);

  // --- DURATIONS / DISTANCES ---

  const durationSet = new Set();
  function extractDurationsFromText(text) {
    if (!text || typeof text !== 'string') return;
    const durationPatterns = [
      // "2 hours", "30 minutes", "3 days", "2 weeks", "6 months", "1 year"
      /\b(\d+)\s*(hours?|heures?|minutes?|mins?|days?|jours?|weeks?|semaines?|months?|mois|years?|ans?|années?|nuits?|nights?)\b/gi,
      // "150 km", "200 miles", "50 meters"
      /\b(\d[\d\s,.']*\d|\d+)\s*(km|kilometres?|kilometers?|miles?|meters?|m[eè]tres?)\b/gi,
      // "2h30", "1h", "45min"
      /\b(\d+)h(\d+)?\b/gi,
      /\b(\d+)min\b/gi
    ];
    for (const pattern of durationPatterns) {
      let m;
      while ((m = pattern.exec(text)) !== null) {
        durationSet.add(m[0].trim());
      }
    }
  }

  // Extract durations from post text
  const postText = extracted?.post?.clean_text || '';
  extractDurationsFromText(postText);

  // Extract durations from story evidence
  if (story?.evidence?.source_snippets) {
    for (const snippet of story.evidence.source_snippets) {
      extractDurationsFromText(snippet?.snippet || '');
    }
  }

  // Extract durations from comment additional_facts
  for (const fact of commentAdditionalFacts) {
    const val = typeof fact === 'string' ? fact : (fact?.value || '');
    extractDurationsFromText(val);
    if (fact?.quote) extractDurationsFromText(fact.quote);
  }

  const allowedDurations = [...durationSet].slice(0, 30);

  // --- PEOPLE / NAMES ---

  const peopleSet = new Set();
  // Author from extracted
  const author = extracted?.source?.author || extracted?.author || null;
  if (author && author !== '[deleted]' && author !== 'AutoModerator') {
    peopleSet.add(author);
  }
  // Who from story context
  if (story?.story?.context?.who) {
    const who = story.story.context.who;
    if (typeof who === 'string' && who.trim() && who !== '[deleted]') {
      peopleSet.add(who.trim());
    }
  }
  const allowedPeople = [...peopleSet].slice(0, 10);

  // --- RESULT ---

  const isPoor = allowedNumbers.length === 0;

  return {
    allowedNumbers,
    allowedNumberTokens: [...allowedNumberTokens],
    allowedLocations,
    allowedDurations,
    allowedPeople,
    isPoor,
    coverage: {
      numberCount: allowedNumbers.length,
      locationCount: allowedLocations.length,
      durationCount: allowedDurations.length,
      peopleCount: allowedPeople.length,
      sources: ['post', story ? 'story' : null, commentAdditionalFacts.length > 0 ? 'comments' : null].filter(Boolean)
    }
  };
}

/**
 * PHASE 2 HELPER: Extrait les claims chiffrés déjà présents dans un HTML.
 * Couvre €, eur, $, usd, baht/thb/฿, vnd/₫, %, jours/semaines/mois, formats "1 380" et "1,380".
 * @param {string} html - Contenu HTML
 * @returns {string[]} - Tokens numériques uniques trouvés
 */
function extractExistingClaims(html) {
  const text = html.replace(/<[^>]+>/g, ' ');
  const claimPatterns = /(\d[\d\s,.']*\d|\d+)\s*(€|euros?|dollars?|\$|bahts?|thb|฿|vnd|₫|%|jours?|semaines?|mois|ans?|années?|nuits?|heures?)/gi;
  const tokens = new Set();
  let match;
  while ((match = claimPatterns.exec(text)) !== null) {
    const num = match[1].replace(/[\s,.']/g, '');
    if (num && /^\d+$/.test(num)) tokens.add(num);
  }
  // Also catch standalone large numbers (>= 10) that might be prices/durations
  const standaloneNums = text.match(/\b\d{2,}\b/g) || [];
  for (const n of standaloneNums) tokens.add(n);
  return [...tokens];
}

class IntelligentContentAnalyzerOptimized {
  constructor() {
    this.apiKey = OPENAI_API_KEY;
  }

  /**
   * Rank citations by editorial quality — prioritize emotion/insight over logistics
   * Best practice from senior travel content writers:
   * - The best quote makes the reader FEEL something
   * - Logistics ("we stayed at Hotel X") = low value
   * - Insight ("we couldn't do both without rushing") = high value
   * - Regret/surprise/warning = highest value
   */
  rankCitationsByQuality(evidenceSnippets) {
    if (!evidenceSnippets || evidenceSnippets.length === 0) return [];

    const scored = evidenceSnippets
      .filter(s => s.snippet && s.snippet.length > 15)
      .map(s => {
        const text = s.snippet.substring(0, 300);
        let score = 0;

        // HIGH VALUE: Emotional markers (regret, surprise, warning, realization)
        const emotionPatterns = /\b(wish|regret|mistake|surprised|shocked|didn'?t expect|couldn'?t|wasn'?t worth|overrated|underrated|worst|best|amazing|terrible|disaster|scam|rip.?off|warning|avoid|don'?t|never again|game.?changer|life.?changing|jaw.?drop|blown away|disappointed|frustrat|overwhelm|exhaust|stress|panic|relief|grateful|lucky|unlucky|impossible|struggled|survived|barely|rushed|couldn'?t.*without|missed|skipped|sacrificed|wasted|saved|learned|realized|turned out|actually|honestly|truth is|real talk|nobody tells|what.*don'?t|je.*regrette|erreur|déçu|surprise|impossible|épuisé|arnaque|piège|évite|jamais|catastroph|galère|stress|pas pu|raté|sacrif|gaspill|économis|appris|réalis|en fait|honnêtement|la vérité|personne.*dit|on.*cru|sans courir)/gi;
        const emotionMatches = (text.match(emotionPatterns) || []).length;
        score += emotionMatches * 15;

        // HIGH VALUE: Personal pronouns + verb (first person narrative)
        const personalNarrative = /\b(I |We |I'm |We're |I've |We've |I was |We were |je |nous |j'ai |on a |j'étais|on était)/gi;
        score += (text.match(personalNarrative) || []).length * 5;

        // HIGH VALUE: Contains numbers/costs (concrete, credible)
        const hasNumbers = /\d+\s*(€|EUR|\$|USD|%|jours?|days?|hours?|heures?|minutes?)/gi;
        score += (text.match(hasNumbers) || []).length * 8;

        // LOW VALUE: Pure logistics (itinerary, hotel names, transport routes)
        const logisticsPatterns = /\b(->|→|itinerary|itinéraire|séjourner|stay at|hotel|hostel|airbnb|check.?in|check.?out|flight.*number|booking|réservation|confirmation|address|adresse|transit|layover|connection)\b/gi;
        score -= (text.match(logisticsPatterns) || []).length * 10;

        // LOW VALUE: Just listing cities/places without insight
        const cityListPattern = /([A-Z][a-z]+\s*[-→>]\s*){2,}/g;
        if (cityListPattern.test(text)) score -= 20;

        // BONUS: Short and punchy (1-2 sentences, <150 chars = more impactful)
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
        if (sentences.length <= 2 && text.length < 150) score += 10;
        if (sentences.length > 4) score -= 5; // Too long = rambling

        // BONUS: Contains contrast/tension
        const contrastPatterns = /\b(but|mais|however|sauf|except|pourtant|en revanche|par contre|instead|contrairement|alors que|while)\b/gi;
        score += (text.match(contrastPatterns) || []).length * 8;

        return { text: text.substring(0, 200), score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.text);

    return scored;
  }

  /**
   * Traduit les blockquotes en anglais dans un texte HTML
   */
  async translateBlockquotesInText(html) {
    if (!html || typeof html !== 'string') return html;
    
    // Extraire tous les blockquotes
    const blockquoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    const blockquotes = [];
    let match;
    
    while ((match = blockquoteRegex.exec(html)) !== null) {
      blockquotes.push({
        fullMatch: match[0],
        content: match[1],
        index: match.index
      });
    }
    
    const needTranslation = [];
    for (const blockquote of blockquotes) {
      const contentText = blockquote.content.replace(/<[^>]+>/g, '').trim();
      if (contentText.length > 10) {
        const englishDetection = this.detectEnglishContent(contentText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.3) {
          needTranslation.push({ blockquote, contentText });
        }
      }
    }
    if (needTranslation.length === 0) return html;
    const segments = needTranslation.map(({ contentText }) => contentText);
    const translatedList = await this.translateBulkToFrench(segments);
    let translatedHtml = html;
    needTranslation.forEach(({ blockquote, contentText }, i) => {
      const translated = translatedList[i] || contentText;
          const translatedBlockquote = blockquote.fullMatch.replace(
            blockquote.content,
            `<p>${translated}</p>`
          );
          translatedHtml = translatedHtml.replace(blockquote.fullMatch, translatedBlockquote);
    });
    return translatedHtml;
  }

  /**
   * Traduit un texte anglais en français
   * @param {string} text - Texte à traduire
   * @returns {Promise<string>} Texte traduit en français
   */
  async translateToFrench(text) {
    if (!text || !text.trim()) return text;
    
    const isDryRun = DRY_RUN;
    
    // Sans clé API, retourner le texte tel quel (pas de traduction)
    if (!this.apiKey) {
      console.warn(`⚠️ Traduction désactivée (pas de clé API): texte non traduit`);
      return text;
    }
    
    // NOTE: On ne bloque PLUS la traduction en mode FORCE_OFFLINE
    // car la traduction est essentielle pour la qualité du contenu
    
    try {
      // FIX BUG TRADUCTION INVERSÉE: Le prompt doit être bidirectionnel
      // Problème: quand on envoie du français, le LLM le traduisait EN ANGLAIS !
      // Solution: Si le texte est déjà en français, le retourner tel quel
      const t0Translate = Date.now();
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Tu es un traducteur professionnel. RÈGLES STRICTES:
1. Si le texte est DÉJÀ en français → retourne-le EXACTEMENT tel quel, sans aucune modification
2. Si le texte est en anglais → traduis-le vers le français avec le même ton et style
3. Si le texte est mixte (FR/EN) → traduis UNIQUEMENT les parties en anglais, garde le français intact
4. Réponds UNIQUEMENT avec le texte final, sans commentaires ni explications
5. Préserve TOUT le HTML/formatage tel quel (<h2>, <p>, <strong>, etc.)
6. ✅ Copie les URLs (http/https) exactement telles quelles — aucune modification ni commentaire
7. Si le texte entier est une URL → retourne-la EXACTEMENT sans commentaire`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: Math.min(2000, text.length * 2)
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      if (response.data?.usage) {
        tracker.recordFromUsage('translate-section', 'gpt-4o-mini', response.data.usage, Date.now() - t0Translate);
      }
      
      const translated = response.data.choices[0].message.content.trim();
      
      // Failsafe: Détecter si la traduction a été inversée (FR→EN au lieu de EN→FR)
      const originalWasFrench = /[àâäéèêëïîôùûüç]/i.test(text) && !/\b(the|and|with|for|this|that|from|are|was|have|been)\b/i.test(text);
      const resultIsFrench = /[àâäéèêëïîôùûüç]/i.test(translated) && !/\b(the|and|with|for|this|that|from|are|was|have|been)\b/i.test(translated);
      const translationReversed = originalWasFrench && !resultIsFrench;
      
      if (translationReversed) {
        console.warn(`⚠️ ALERTE TRADUCTION INVERSÉE DÉTECTÉE! Original FR → Résultat EN. Retour du texte original.`);
        return text; // Failsafe: retourner l'original si traduction inversée détectée
      }
      console.log(`✅ Texte traduit: ${text.substring(0, 50)}... → ${translated.substring(0, 50)}...`);
      return translated;
    } catch (error) {
      console.warn(`⚠️ Erreur lors de la traduction: ${error.message}. Texte non traduit.`);
      return text; // Retourner le texte original en cas d'erreur
    }
  }

  /**
   * Traduit en lot des textes anglais vers le français (1 à 2 appels LLM max).
   * @param {string[]} segments - Tableau de textes à traduire (ordre préservé)
   * @returns {Promise<string[]>} Tableau de textes traduits dans le même ordre
   */
  async translateBulkToFrench(segments) {
    const filtered = (segments || []).map(s => (typeof s === 'string' ? s.trim() : '')).filter(s => s.length > 0);
    if (filtered.length === 0) return [];
    if (!this.apiKey) {
      console.warn('⚠️ Traduction bulk désactivée (pas de clé API)');
      return filtered;
    }
    const MAX_CHARS_PER_BATCH = 6000;
    const batches = [];
    let current = [];
    let currentChars = 0;
    for (const seg of filtered) {
      if (currentChars + seg.length + 50 > MAX_CHARS_PER_BATCH && current.length > 0) {
        batches.push(current);
        current = [];
        currentChars = 0;
      }
      current.push(seg);
      currentChars += seg.length + 50;
    }
    if (current.length > 0) batches.push(current);
    const sys = 'Tu es un traducteur professionnel. Traduis chaque segment de l\'anglais vers le français. Garde le ton et le style. Réponds UNIQUEMENT avec un objet JSON dont les clés sont "1", "2", "3"... et les valeurs les traductions dans l\'ordre. Aucun commentaire.';
    const out = [];
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const userContent = batch.map((text, i) => `${i + 1}. ${text}`).join('\n\n');
      try {
        const t0Batch = Date.now();
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: `Segments à traduire :\n\n${userContent}` }
          ],
          temperature: 0.3,
          max_tokens: Math.min(4000, batch.reduce((acc, s) => acc + s.length * 2, 0))
        }, {
          headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 25000
        });
        if (response.data?.usage) {
          tracker.recordFromUsage('translate-batch', 'gpt-4o-mini', response.data.usage, Date.now() - t0Batch);
        }
        const raw = response.data.choices[0].message.content.trim();
        const json = (() => {
          const m = raw.match(/\{[\s\S]*\}/);
          if (!m) return {};
          try { return JSON.parse(m[0]); } catch { return {}; }
        })();
        for (let i = 0; i < batch.length; i++) {
          const key = String(i + 1);
          out.push(typeof json[key] === 'string' ? json[key].trim() : batch[i]);
        }
      } catch (err) {
        console.warn(`⚠️ Erreur traduction bulk (batch ${b + 1}): ${err.message}. Segments conservés.`);
        batch.forEach(s => out.push(s));
      }
    }
    return out;
  }

  /**
   * Détecte si un texte est majoritairement en anglais
   * @param {string} text - Texte à analyser
   * @returns {Object} { isEnglish: boolean, ratio: number }
   */
  detectEnglishContent(text) {
    if (!text || !text.trim()) return { isEnglish: false, ratio: 0 };
    
    const englishWordsPattern = /\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|I|you|he|she|it|we|they|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|running|business|abroad|anyone|built|trade|services|themselves|moved|company|digital|nomad|currently|early|20s|always|planned|stay|self|employed|cleaner|painter|own|home|improvement|however|recently|been|considering|career|change|question|questions|has|anyone|built|up|then|moved|running|domestic|training|painting|decorating|hi|r\/travel|happy|following|last|year|survey|decided|make|few|changes|things|like|flair|how|subreddit|run|concerns|regarding|rules|details|asking|too|much|mod|team|easier|original|author|provide|all|information|commenters|pick|out|still|available|here|wiki)\b/gi;
    const englishWords = (text.match(englishWordsPattern) || []).length;
    const totalWords = text.split(/\s+/).length;
    const ratio = totalWords > 0 ? englishWords / totalWords : 0;
    
    // Considérer comme anglais si >30% de mots anglais et au moins 5 mots
    return {
      isEnglish: ratio > 0.3 && totalWords >= 5,
      ratio: ratio
    };
  }

  // 3) Implémenter un fallback OFFLINE complet
  // PHASE 4.1: Utilise extracted au lieu de selectedArticle
  buildOfflineFallbackArticle(extracted, analysis) {
    const title = extracted?.title || 'Témoignage voyage: retours et leçons';
    const author = extracted?.author || 'un membre de la communauté';
    const sourceName = extracted?.meta?.source || 'Communauté';
    const link = extracted?.meta?.url || '#';

    const country = analysis?.geo?.country || extracted?.geo?.country || null;
    const city = analysis?.geo?.city || extracted?.geo?.city || null;

    // Contenu simple mais structuré, avec H2, et ancré sur les signaux disponibles
    const h2Place = city ? `${city}` : (country ? `${country}` : 'Asie');
    const content = `
<p><strong>Source :</strong> <a href="${link}" target="_blank" rel="noopener">${title}</a> - ${sourceName}</p>
<p>${author} partage un retour d'expérience centré sur ${h2Place}. Voici une synthèse structurée basée sur les informations disponibles en mode offline.</p>

<h2>Ce qui ressort du témoignage</h2>
<ul>
  <li>Contexte: installation / voyage et premiers repères</li>
  <li>Points d'attention: budget, logistique, visa, santé, connectivité</li>
  <li>Leçons: ce qui aurait dû être anticipé</li>
</ul>

<h2>Conseils pratiques</h2>
<ul>
  <li>Valider les démarches administratives et les sources officielles</li>
  <li>Prévoir une marge budget + santé + imprévus</li>
  <li>Structurer un plan de mobilité (vols, hub, itinéraire)</li>
</ul>

<h2>Checklist rapide</h2>
<ul>
  <li>Assurance + documents</li>
  <li>eSIM / data</li>
  <li>Plan B logement + transport</li>
</ul>
`.trim();

    return {
      title: title,
      content: content
    };
  }

  // Analyser intelligemment le contenu d'un article avec les 4 types de témoignage
  async analyzeContent(article) {
    // Extraire les sémantiques Reddit si c'est un article Reddit (DRY_RUN safe)
    let redditData = null;
    const isRedditArticle = article.link && article.link.includes('reddit.com');
    
    if (isRedditArticle) {
      try {
        redditData = await extractRedditForAnalysis(article);
        if (redditData) {
          console.log('✅ reddit_extraction attached');
          if (redditData.reddit_extraction.quality.has_minimum_signals) {
            console.log('   ✓ has_minimum_signals: true');
          } else {
            console.log('   ⚠️ has_minimum_signals: false');
          }
        }
      } catch (error) {
        console.warn('⚠️ Erreur extraction Reddit (fallback silencieux):', error.message);
        redditData = null;
      }
    }
    
    // OBSOLETE: Pattern Detector appelé ici (double détection inutile, déjà dans pipeline-runner.js)
    // Le flag ENABLE_PATTERN_DETECTOR est désactivé car redondant avec pipeline-runner.js:runPatternDetector()
    if (false && process.env.ENABLE_PATTERN_DETECTOR === '1' && (isRedditArticle || article.subreddit)) {
      try {
        const patternInput = {
          title: article.title || '',
          body: article.content || article.source_text || article.selftext || '',
          comments: article.comments_snippets ? article.comments_snippets.map(c => ({ body: c })) : [],
          meta: {
            subreddit: article.subreddit || '',
            author: article.author || '',
            url: article.link || article.url || ''
          }
        };
        
        const pattern = detectRedditPattern(patternInput);
        
        // Logger unique
        console.log(`✅ PATTERN_DETECTED: story_type=${pattern.story_type} theme=${pattern.theme_primary} emotion=${pattern.emotional_load.label} events=${pattern.exploitable_events.count} complexity=${pattern.complexity.label} comments=${pattern.comments_utility.label}`);
        
        // Stocker dans redditData pour propagation
        if (redditData) {
          redditData.pattern = pattern;
        } else {
          redditData = { pattern };
        }
        
        // OBSOLETE: Story Compiler appelé ici (double détection inutile, déjà dans pipeline-runner.js)
        // Le flag ENABLE_STORY_COMPILER est désactivé car redondant avec pipeline-runner.js:runStoryCompiler()
        if (false && process.env.ENABLE_STORY_COMPILER === '1' && article) {
          try {
            const storyInput = {
              reddit: {
                title: article.title || '',
                selftext: article.content || article.source_text || article.selftext || '',
                author: article.author || '',
                created_utc: article.created_utc || null,
                url: article.link || article.url || '',
                subreddit: article.subreddit || '',
                comments: article.comments_snippets ? article.comments_snippets.map(c => ({ body: c })) : []
              },
              extraction: redditData.reddit_extraction || {},
              pattern: pattern,
              geo: article.geo || {},
              source: {
                id: article.id || null,
                score: article.upvotes || null
              }
            };
            
            const compiledStory = compileRedditStory(storyInput);
            
            // Logger unique
            const sectionsCount = [
              compiledStory.story.context.summary ? 1 : 0,
              compiledStory.story.central_event ? 1 : 0,
              compiledStory.story.critical_moment ? 1 : 0,
              compiledStory.story.resolution ? 1 : 0,
              compiledStory.story.author_lessons.length,
              compiledStory.story.community_insights.length,
              compiledStory.story.open_questions.length
            ].reduce((a, b) => a + b, 0);
            
            console.log(`✅ STORY_COMPILED: sections=${sectionsCount} missing=${compiledStory.meta.missing_sections.length} events=${compiledStory.story.central_event ? 1 : 0} community=${compiledStory.story.community_insights.length}`);
            
            // Stocker dans redditData pour propagation
            if (redditData) {
              redditData.story = compiledStory;
            } else {
              redditData = { story: compiledStory };
            }
          } catch (error) {
            console.warn('⚠️ Erreur story compilation (fallback silencieux):', error.message);
          }
        }
      } catch (error) {
        console.warn('⚠️ Erreur pattern detection (fallback silencieux):', error.message);
      }
    }
    
    try {
      // Vérifier si la clé API est disponible
      if (!this.apiKey) {
        console.log('⚠️ Clé OpenAI non disponible - Utilisation du fallback');
        const fallback = this.getFallbackAnalysis(article);
        // Ajouter reddit data même en fallback
        if (redditData) {
          fallback.reddit_extraction = redditData.reddit_extraction;
          fallback.reddit_signals_compact = redditData.reddit_signals_compact;
          fallback.is_destination_question = redditData.is_destination_question;
          fallback.main_destination = redditData.main_destination;
          // PHASE 2: Ajouter pattern si disponible
          if (redditData.pattern) {
            fallback.pattern = redditData.pattern;
          }
          // PHASE 3: Ajouter story si disponible
          if (redditData.story) {
            fallback.story = redditData.story;
          }
          // PHASE 3: Ajouter story si disponible
          if (redditData.story) {
            fallback.story = redditData.story;
          }
        }
        return fallback;
      }

      const prompt = `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE À ANALYSER:
- Titre: ${article.title}
- Source: ${article.source}
- Type: ${article.type}
- Contenu: ${article.content}
- Lien: ${article.link}

MISSION: Analyser ce contenu et déterminer la meilleure approche éditoriale.

GUIDELINES FLASHVOYAGES:
- Cible: Digital nomades et voyageurs passionnés d'Asie
- Spécialités: Bons plans, formalités, transports, sécurité, tourisme
- Objectif: Contenu unique, valeur ajoutée, économies concrètes
- Ton: Expert, confident, proche (comme Voyage Pirate mais pour l'Asie)

TYPES DE CONTENU DISPONIBLES:
1. TEMOIGNAGE_SUCCESS_STORY (15% du contenu)
   - Récits de réussite, transformation, objectifs atteints
   - Structure: Défi → Action → Résultat
   - Ton: Inspirant, motivant, authentique
   - Exemples: "Comment j'ai doublé mes revenus", "Ma transformation nomade"

2. TEMOIGNAGE_ECHEC_LEÇONS (10% du contenu)
   - Erreurs commises, leçons apprises, prévention
   - Structure: Erreur → Conséquences → Leçons
   - Ton: Humble, préventif, éducatif
   - Exemples: "Mon échec avec le visa", "L'erreur qui m'a coûté cher"

3. TEMOIGNAGE_TRANSITION (10% du contenu)
   - Changements de vie, adaptations, évolutions
   - Structure: Avant → Pendant → Après
   - Ton: Réfléchi, adaptatif, encourageant
   - Exemples: "De salarié à nomade", "Ma transition vers l'Asie"

4. TEMOIGNAGE_COMPARAISON (5% du contenu)
   - Comparaisons entre destinations, méthodes, options
   - Structure: Option A vs Option B → Recommandation
   - Ton: Comparatif, objectif, informatif
   - Exemples: "Bali vs Vietnam", "Coliving vs Airbnb"

5. GUIDE_PRATIQUE (20% du contenu)
   - Guides step-by-step, procédures, checklists
   - Structure: Introduction → Étapes → Conclusion
   - Ton: Pratique, utilitaire, actionnable
   - Exemples: "Comment obtenir un visa", "Guide coliving Asie"

6. COMPARAISON_DESTINATIONS (15% du contenu)
   - Comparaisons détaillées entre pays/villes
   - Structure: Critères → Analyse → Recommandation
   - Ton: Analytique, objectif, informatif
   - Exemples: "Vietnam vs Thaïlande", "Bangkok vs Chiang Mai"

7. ACTUALITE_NOMADE (15% du contenu)
   - Nouvelles, tendances, réglementations
   - Structure: Contexte → Impact → Conseils
   - Ton: Informé, réactif, pratique
   - Exemples: "Nouveau visa nomade", "Changements réglementaires"

8. CONSEIL_PRATIQUE (10% du contenu)
   - Astuces, bonnes pratiques, optimisations
   - Structure: Problème → Solution → Bénéfices
   - Ton: Expert, confident, pratique
   - Exemples: "Comment économiser", "Astuces productivité"

ANALYSE REQUISE:
1. Type de contenu (un des 8 types ci-dessus)
2. Sous-catégorie spécifique (visa, logement, transport, santé, finance, communauté)
3. Angle éditorial (pratique, comparatif, analyse, conseil, inspirant, préventif)
4. Audience cible spécifique (débutant, confirmé, expert, famille, senior)
5. Destination concernée (Vietnam, Thaïlande, Indonésie, Japon, Corée du Sud, Singapour, Asie)
6. Niveau d'urgence (high, medium, low)
7. Mots-clés pertinents (max 5)
8. CTA approprié
9. Score de pertinence (0-100)
10. Recommandation: template_fixe OU generation_llm
11. Template spécifique à utiliser (si template_fixe)

RÉPONDRE UNIQUEMENT EN JSON VALIDE:
{
  "type_contenu": "TEMOIGNAGE_SUCCESS_STORY",
  "type": "TEMOIGNAGE_SUCCESS_STORY",
  "sous_categorie": "visa",
  "angle": "inspirant",
  "audience": "nomades_debutants_vietnam",
  "destination": "Vietnam",
  "urgence": "medium",
  "keywords": "visa nomade vietnam, réussite, transformation",
  "cta": "Découvrez comment réussir votre visa nomade au Vietnam",
  "pertinence": 85,
  "recommandation": "generation_llm",
  "template_specifique": "success_story",
  "raison": "Récit de réussite avec conseils pratiques pour débutants"
}

IMPORTANT: Le champ "type" doit prendre la même valeur que "type_contenu". Pour les témoignages, utilisez les valeurs exactes:
- "TEMOIGNAGE_SUCCESS_STORY" pour les récits de réussite
- "TEMOIGNAGE_ECHEC_LEÇONS" pour les échecs et leçons apprises
- "TEMOIGNAGE_TRANSITION" pour les transitions de vie
- "TEMOIGNAGE_COMPARAISON" pour les comparaisons
- Et les autres types de contenu selon la liste ci-dessus.`;

      const responseData = await callOpenAIWithRetry({
        apiKey: this.apiKey,
        provider: LLM_PROVIDER,
        _trackingStep: 'analyzer-extract',
        body: {
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.3
        },
        sourceText: article.content || article.source_text || '',
        article: article,
        type: 'analysis'
      });

      // Vérifier que la réponse contient du contenu
      if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message || !responseData.choices[0].message.content) {
        throw new Error('Réponse LLM invalide: contenu manquant (analyzeContent)');
      }
      
      const rawContent = responseData.choices[0].message.content;
      const finishReason = responseData.choices[0].finish_reason;
      if (finishReason === 'length') {
        console.warn('⚠️ Réponse LLM tronquée (finish_reason=length) dans analyzeContent - Tentative de réparation JSON');
      }
      
      const analysis = safeJsonParse(rawContent, 'call1_response');
      // Verrouiller le type pour le plan de widgets
      analysis.type = analysis.type_contenu || analysis.type || 'Témoignage';
      
      // PHASE 2: Ajouter pattern si disponible (même en mode LLM)
      if (redditData && redditData.pattern) {
        analysis.pattern = redditData.pattern;
      }
      
      // PHASE 3: Ajouter story si disponible (même en mode LLM)
      if (redditData && redditData.story) {
        analysis.story = redditData.story;
      }
      
      // Ajouter les données Reddit si disponibles
      if (redditData) {
        analysis.reddit_extraction = redditData.reddit_extraction;
        analysis.reddit_signals_compact = redditData.reddit_signals_compact;
        analysis.is_destination_question = redditData.is_destination_question;
        analysis.main_destination = redditData.main_destination;
        // PHASE 2: Ajouter pattern si disponible
        if (redditData.pattern) {
          analysis.pattern = redditData.pattern;
        }
        
        // RÈGLE CRITIQUE: Si c'est une question "où partir", forcer COMPARAISON_DESTINATIONS ou GUIDE_PRATIQUE
        if (redditData.is_destination_question) {
          console.log('🔍 Détection question destination - Forçage type COMPARAISON_DESTINATIONS ou GUIDE_PRATIQUE');
          if (analysis.type_contenu !== 'COMPARAISON_DESTINATIONS' && analysis.type_contenu !== 'GUIDE_PRATIQUE') {
            analysis.type_contenu = 'COMPARAISON_DESTINATIONS';
            analysis.type = 'COMPARAISON_DESTINATIONS';
            // FIX: S'assurer que analysis.pattern est défini quand on force le type
            if (!analysis.pattern) {
              analysis.pattern = {
                story_type: 'comparison',
                theme_primary: 'destination_comparison',
                themes_secondary: [],
                emotional_load: { score: 0, label: 'low', signals: [] },
                exploitable_events: { count: 0, events: [] },
                complexity: { score: 0, label: 'low', signals: [] },
                comments_utility: { score: 0, label: 'low', signals: [], sample_count: 0 },
                confidence: { score: 0.7, notes: ['Pattern créé automatiquement pour COMPARAISON_DESTINATIONS'] }
              };
              console.log('   → Pattern créé pour COMPARAISON_DESTINATIONS');
            }
            console.log('   → Type changé en COMPARAISON_DESTINATIONS');
          }
        }
        
        // RÈGLE CRITIQUE: Ne pas inventer de destination principale
        // La destination doit venir du post (mentions fortes) ou consensus commentaires
        if (redditData.main_destination) {
          // Destination validée par l'extracteur (post ou consensus)
          analysis.destination = redditData.main_destination;
          console.log(`   ✓ Destination validée: ${redditData.main_destination}`);
        } else {
          // FIX 4: Ne pas logger "Destination non validée" si elle sera validée plus tard par scoring
          // Vérifier si une destination peut être reconstruite depuis le contenu
          const canBeReconstructed = redditData.main_destination || 
                                     (redditData.reddit_extraction?.post?.signals?.locations?.length > 0);
          
          if (analysis.destination && !redditData.is_destination_question) {
            // Si le LLM a inventé une destination et que ce n'est pas une question, la retirer
            // Mais seulement si l'extracteur ne peut pas la valider plus tard
            if (!canBeReconstructed) {
              console.log(`   ⚠️ Destination "${analysis.destination}" non validée par extracteur - retirée`);
              analysis.destination = 'Asie'; // Fallback générique
            } else {
              // Destination peut être validée plus tard, ne pas logger d'erreur
              console.log(`   ℹ️ Destination "${analysis.destination}" sera validée par scoring pipeline`);
            }
          } else if (redditData.is_destination_question) {
            // Question destination = pas de destination principale
            analysis.destination = 'Asie';
            console.log('   → Question destination: pas de destination principale, fallback "Asie"');
          }
        }
      }
      
      return analysis;

    } catch (error) {
      console.error('❌ Erreur analyse intelligente:', error.message);
      const fallback = this.getFallbackAnalysis(article);
      // Ajouter reddit data même en cas d'erreur si disponible
      if (redditData) {
        fallback.reddit_extraction = redditData.reddit_extraction;
        fallback.reddit_signals_compact = redditData.reddit_signals_compact;
        fallback.is_destination_question = redditData.is_destination_question;
        fallback.main_destination = redditData.main_destination;
      }
      return fallback;
    }
  }

  // Générer du contenu intelligent avec 2 appels LLM séquentiels
  // PHASE 4.1: Nouveau contrat d'entrée - uniquement { extracted, pattern, story }
  async generateIntelligentContent(input, analysis) {
    // Validation bloquante en entrée
    if (!input || !input.extracted || !input.pattern || !input.story) {
      throw new Error('SOURCE OF TRUTH VIOLATION: ultra-fresh-article-generator requires extracted + pattern + story inputs.');
    }
    
    if (!input.story.evidence || !input.story.evidence.source_snippets || input.story.evidence.source_snippets.length === 0) {
      throw new Error('SOURCE OF TRUTH VIOLATION: ultra-fresh-article-generator requires story.evidence.source_snippets.length > 0');
    }
    
    const { extracted, pattern, story } = input;
    
    // Log de preuve
    console.log('✅ ULTRA_FRESH_INPUT_READY: extracted + pattern + story received');
    
    // 1) Court-circuit OFFLINE au tout début (avant tout appel LLM / JSON.parse)
    const offline = FORCE_OFFLINE;
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (offline || !apiKey || apiKey.startsWith('invalid-')) {
      console.log('⚠️ OFFLINE_CONTENT_FALLBACK: skipping LLM + JSON parsing');
      return this.buildOfflineFallbackArticle(extracted, analysis);
    }
    
    try {
      console.log('🔍 DEBUG: Author dans extracted:', extracted.source?.author || extracted.author);
      // Utiliser extracted.post.clean_text ou extracted.selftext (compatibilité)
      const fullContent = extracted.post?.clean_text || extracted.selftext || extracted.post?.selftext || '';
      
      if (!fullContent || fullContent.length < 30) {
        throw new Error(`CONTENU INSUFFISANT: extracted.post.clean_text length=${fullContent.length} < 200`);
      }
      
      // APPEL 1 : Extraction et structure
      console.log('🧠 Appel 1 : Extraction et structure...');
      const extractionResult = await this.extractAndStructure(extracted, analysis, fullContent);
      
      // APPEL 2 : Génération finale (avec titres/angles existants pour anti-répétition)
      console.log('🧠 Appel 2 : Génération finale...');
      const options = {
        existingTitles: input.existingTitles || [],
        existingAngles: input.existingAngles || [],
        // Smart destination (passé depuis pipeline-runner via extractMainDestination)
        main_destination: input.main_destination || null,
        original_destination: input.original_destination || null,
        pivot_reason: input.pivot_reason || null,
        // Titre Reddit original (pour détection régionale)
        reddit_title: input.title || '',
        // Mode éditorial NEWS / EVERGREEN (conditionne le prompt)
        editorial_mode: input.editorial_mode || 'evergreen',
        // Angle Hunter — stratégie éditoriale déterministe (Phase 1)
        angle: input.angle || null,
        // URL Reddit source pour les citations
        reddit_source_url: input.reddit_source_url || input.url || '',
        // Article Outline (FV-111)
        outline: input.outline || null
      };
      const finalContent = await this.generateFinalArticle(extractionResult, analysis, extracted, pattern, story, options);
      
      return finalContent;

    } catch (error) {
      console.error('❌ Erreur génération intelligente:', error.message);
      // 4) Modifier la logique "Refus de publier du contenu générique"
      const offline = FORCE_OFFLINE;
      if (offline) {
        console.log(`⚠️ OFFLINE_FALLBACK_ON_ERROR: ${error.message}`);
        return this.buildOfflineFallbackArticle(extracted, analysis);
      }
      // Si c'est une erreur de parsing JSON, essayer un fallback même en production
      if (error.message.includes('SAFE_JSON_PARSE_FAIL') || error.message.includes('JSON') || error.message.includes('Unexpected end')) {
        console.warn('⚠️ Erreur parsing JSON en production - Fallback vers contenu offline');
        return this.buildOfflineFallbackArticle(extracted, analysis);
      }
      
      // ONLINE: si LLM fail → throw (retry géré par l'appelant)
      throw new Error(`ERREUR TECHNIQUE: Impossible de générer le contenu pour "${extracted.title}". Refus de publier du contenu générique.`);
    }
  }

  // APPEL 1 : Extraction et structure avec contexte système
  // PHASE 4.1: Utilise extracted au lieu de article brut
  async extractAndStructure(extracted, analysis, fullContent) {
    const systemMessage = `Tu es un expert FlashVoyages spécialisé dans l'analyse de témoignages Reddit. 

Extrait les éléments clés selon la structure SUCCESS_STORY:
- Défi initial et objectifs
- Stratégies gagnantes (3-5 points)
- Résultats concrets (chiffres, pourcentages)
- Coûts détaillés (breakdown mensuel)
- Erreurs commises et leçons
- Spécificités locales
- Comparaisons avec autres destinations
- Conseils pratiques pour reproduire

         IMPORTANT: Traduis TOUTES les citations en français. Si le contenu Reddit est en anglais, traduis-le en français naturel et fluide.
         
         Réponds UNIQUEMENT en JSON avec ces clés: citations, donnees_cles, structure, enseignements, defis, strategies, resultats, couts, erreurs, specificites, comparaisons, conseils.`;

    const userMessage = `TITRE: ${extracted.title}
CONTENU: ${fullContent.substring(0, 6000)}`;

    console.log(`📏 Taille system: ${systemMessage.length} caractères`);
    console.log(`📏 Taille user: ${userMessage.length} caractères`);

    const responseData = await callOpenAIWithRetry({
      apiKey: this.apiKey,
      provider: LLM_PROVIDER,
      _trackingStep: 'generator-main',
      body: {
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 4000,
      temperature: 0.7,
      ...(LLM_PROVIDER === 'openai' && { response_format: { type: "json_object" } })
      },
      sourceText: fullContent,
      article: extracted, // Utiliser extracted comme article pour compatibilité
      type: 'extraction'
    });

    // Vérifier que la réponse contient du contenu
    if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message || !responseData.choices[0].message.content) {
      throw new Error('Réponse LLM invalide: contenu manquant');
    }
    
    const rawContent = responseData.choices[0].message.content;
    
    // Vérifier si la réponse est tronquée (finish_reason = 'length')
    const finishReason = responseData.choices[0].finish_reason;
    if (finishReason === 'length') {
      console.warn('⚠️ Réponse LLM tronquée (finish_reason=length) - Tentative de réparation JSON');
    }
    
    const content = safeJsonParse(rawContent, 'extractAndStructure_response');
    console.log('✅ Extraction terminée:', Object.keys(content));
    return content;
  }

  // APPEL 2 : Génération finale avec contexte système
  /**
   * Extrait les vrais points clés du témoignage (approche expert content writer)
   * Basé sur le contenu réel plutôt qu'une grille générique
   * @param {Object} extracted - Données extraites
   * @param {Object} story - Story compilée
   * @param {Object} pattern - Pattern détecté
   * @returns {Array} Points clés avec {label, value}
   */
  /**
   * Convertit un montant USD en EUR pour les lecteurs français
   * @param {number|string} amountUSD - Montant en USD
   * @returns {string} Montant en EUR formaté (ex: "~1840 €")
   */
  convertUSDToEUR(amountUSD) {
    const rate = 0.92;
    const numericAmount = typeof amountUSD === 'string' 
      ? parseFloat(amountUSD.replace(/[^\d.]/g, '')) 
      : amountUSD;
    if (isNaN(numericAmount) || numericAmount <= 0) return amountUSD;
    const amountEUR = Math.round(numericAmount * rate);
    return `~${amountEUR} €`;
  }

  convertTitleUSDToEUR(title) {
    if (!title) return title;
    const rate = 0.92;
    let result = title;
    // $2,500 / $2500 / $ 2500
    result = result.replace(/\$\s?(\d[\d,]*)/g, (_, amt) => {
      const n = parseFloat(amt.replace(/,/g, ''));
      if (isNaN(n) || n <= 0) return _;
      return `${Math.round(n * rate).toLocaleString('fr-FR')} €`;
    });
    // 2500 USD / 2 500 USD / 2500 dollars
    result = result.replace(/(\d[\d\s,.]*\d|\d)\s*(?:USD|dollars?)\b/gi, (_, amt) => {
      const n = parseFloat(amt.replace(/[\s.]/g, '').replace(',', '.'));
      if (isNaN(n) || n <= 0) return _;
      return `${Math.round(n * rate).toLocaleString('fr-FR')} €`;
    });
    // 2500$ (no space)
    result = result.replace(/(\d[\d,]*)\$/g, (_, amt) => {
      const n = parseFloat(amt.replace(/,/g, ''));
      if (isNaN(n) || n <= 0) return _;
      return `${Math.round(n * rate).toLocaleString('fr-FR')} €`;
    });
    if (result !== title) {
      console.log(`💶 TITLE_USD_TO_EUR: "${title}" → "${result}"`);
    }
    return result;
  }

  extractRealKeyPoints(extracted, story, pattern) {
    const keyPoints = [];
    
    // PRIORITÉ 1: LEÇON PRINCIPALE (le plus actionnable pour le lecteur)
    const authorLessons = story?.story?.author_lessons || [];
    if (authorLessons.length > 0) {
      const firstLesson = typeof authorLessons[0] === 'string' 
        ? authorLessons[0] 
        : (authorLessons[0].lesson || authorLessons[0].value || authorLessons[0].text || '');
      if (firstLesson && firstLesson.length > 15 && firstLesson.length < 100) {
        keyPoints.push({ label: 'Leçon principale', value: firstLesson.trim() });
      }
    }
    
    // PRIORITÉ 2: INSIGHT COMMUNAUTÉ (conseil pratique)
    const communityInsights = story?.story?.community_insights || [];
    if (communityInsights.length > 0) {
      const firstInsight = typeof communityInsights[0] === 'string'
        ? communityInsights[0]
        : (communityInsights[0].value || communityInsights[0].text || communityInsights[0].insight || '');
      if (firstInsight && firstInsight.length > 20 && firstInsight.length < 100) {
        keyPoints.push({ label: 'Conseil communauté', value: firstInsight.trim() });
      }
    }
    
    // PRIORITÉ 3: ÉVÉNEMENT CLÉ / MOMENT DÉCISIF (contexte narratif)
    const centralEvent = story?.story?.central_event?.summary;
    const criticalMoment = story?.story?.critical_moment?.summary;
    if (centralEvent && centralEvent.length > 20 && centralEvent.length < 30) {
      // Extraire la phrase la plus percutante (première phrase ou plus courte)
      const sentences = centralEvent.split(/[.!?]\s+/).filter(s => s.length > 15 && s.length < 100);
      if (sentences.length > 0) {
        // Prioriser les phrases plus courtes (plus percutantes)
        const keySentence = sentences.sort((a, b) => a.length - b.length)[0].trim();
        keyPoints.push({ label: 'Événement clé', value: keySentence });
      }
    } else if (criticalMoment && criticalMoment.length > 20 && criticalMoment.length < 30) {
      const sentences = criticalMoment.split(/[.!?]\s+/).filter(s => s.length > 15 && s.length < 100);
      if (sentences.length > 0) {
        const keySentence = sentences.sort((a, b) => a.length - b.length)[0].trim();
        keyPoints.push({ label: 'Moment décisif', value: keySentence });
      }
    }
    
    // PRIORITÉ 4: RÉSULTAT/RÉSOLUTION (impact)
    const resolution = story?.story?.resolution?.summary;
    if (resolution && resolution.length > 20 && resolution.length < 30) {
      const sentences = resolution.split(/[.!?]\s+/).filter(s => s.length > 15 && s.length < 100);
      if (sentences.length > 0) {
        const keySentence = sentences.sort((a, b) => a.length - b.length)[0].trim();
        keyPoints.push({ label: 'Résultat', value: keySentence });
      }
    }
    
    // PRIORITÉ 5: DÉFI PRINCIPAL (si pattern = warning ou challenges présents)
    if (pattern?.story_type === 'warning' || pattern?.story_type === 'challenge') {
      const challenges = story?.story?.evidence?.challenges || [];
      if (challenges.length > 0) {
        const firstChallenge = typeof challenges[0] === 'string' ? challenges[0] : (challenges[0].text || challenges[0].challenge || '');
        if (firstChallenge && firstChallenge.length > 15 && firstChallenge.length < 100) {
          keyPoints.push({ label: 'Défi rencontré', value: firstChallenge.trim() });
        }
      }
    }
    
    // PRIORITÉ 6: BUDGET (seulement si réellement mentionné avec un montant spécifique)
    const budgetData = story?.story?.evidence?.budget_data || extracted?.costs || [];
    if (budgetData.length > 0) {
      let budgetValue = Array.isArray(budgetData) ? budgetData[0] : budgetData;
      // Vérifier que c'est un montant réel (chiffres + devise) et pas "Non spécifié"
      if (budgetValue && typeof budgetValue === 'string' && 
          /[\d€$]/.test(budgetValue) && 
          budgetValue.length < 80 &&
          !/non\s+(spécifié|mentionné|disponible)/i.test(budgetValue)) {
        // Convertir USD en EUR si nécessaire
        const usdMatch = budgetValue.match(/(\d+)\s*USD/i) || budgetValue.match(/\$\s*(\d+)/i) || budgetValue.match(/(\d+)\s*\$/i);
        if (usdMatch) {
          const usdAmount = parseInt(usdMatch[1], 10);
          const eurAmount = this.convertUSDToEUR(usdAmount);
          budgetValue = `${eurAmount} (${usdAmount} USD)`;
        }
        keyPoints.push({ label: 'Budget', value: budgetValue });
      }
    }
    
    // PRIORITÉ 7: DURÉE (seulement si spécifique et mentionnée avec chiffres)
    const duration = story?.story?.context?.duration;
    if (duration && 
        duration !== 'Non spécifié' && 
        /\d+/.test(duration) && // Doit contenir au moins un chiffre
        /(\d+\s*(mois|semaines?|jours?|ans?)|plusieurs|quelques)/i.test(duration)) {
      keyPoints.push({ label: 'Durée', value: duration });
    }
    
    // PRIORITÉ 8: DESTINATION (seulement si spécifique, pas générique)
    const destination = extracted?.destination || story?.story?.context?.location;
    if (destination && 
        destination !== 'Asie' && 
        destination !== 'Non spécifié' &&
        !/^(asie|asia)$/i.test(destination)) {
      keyPoints.push({ label: 'Destination', value: destination });
    }
    
    // Limiter à 5 points clés maximum pour garder le focus
    return keyPoints.slice(0, 5);
  }

  // PHASE 4.1: Utilise extracted, pattern, story au lieu de article brut
  async generateFinalArticle_legacy(extraction, analysis, extracted, pattern, story, options = {}) {
    const existingTitles = options.existingTitles || [];
    const existingAngles = options.existingAngles || [];
    const mainDestination = options.main_destination || null;
    const originalDestination = options.original_destination || null;
    const pivotReason = options.pivot_reason || null;
    const editorialMode = options.editorial_mode || 'evergreen';
    console.log(`📰 EDITORIAL MODE pour génération: ${editorialMode.toUpperCase()}`);
    // Construire la section marketing d'affiliation pour les témoignages
    const isTemoignage = analysis.type_contenu && analysis.type_contenu.startsWith('TEMOIGNAGE_');
    const marketingSection = isTemoignage ? `
AFFILIATION POUR TÉMOIGNAGES (à intégrer dans le développement avec des H2 NARRATIFS, pas de titres fixes) :
- Vers la fin du développement, intègre les leçons clés du témoignage avec des mentions naturelles de vols et connectivité
- Inclus une checklist de préparation avec les mots-clés : "vols vers [DESTINATION]", "eSIM", "visa/formalités"
- Termine par un paragraphe court invitant à planifier (vols + eSIM)
- Insère exactement ces placeholders à la fin : {{TRAVELPAYOUTS_FLIGHTS_WIDGET}} et si connectivité mentionnée : {{TRAVELPAYOUTS_CONNECTIVITY_WIDGET}}
- ⚠️ Les titres H2 doivent être NARRATIFS et adaptés à l'article, PAS des titres fixes` : '';

    // C. Ajouter instructions de correction si présentes
    const correctionBlock = analysis.correctionInstructions ? `\n\n🚨 CORRECTION OBLIGATOIRE:\n${analysis.correctionInstructions}\n` : '';

    // PHASE 4.2: Adapter le ton selon pattern
    const toneGuidance = pattern.story_type === 'warning' 
      ? 'Ton factuel et alerte, focus sur la prévention et les risques identifiés.'
      : pattern.story_type === 'success_story' || pattern.story_type === 'linear'
      ? 'Ton progressif et structuré, met en avant les étapes et les résultats.'
      : pattern.story_type === 'question'
      ? 'Ton clarifiant et structuré, répond aux questions de manière organisée.'
      : 'Ton neutre et informatif, reformulation fidèle sans jugement.';

    const emotionalGuidance = pattern.emotional_load?.label === 'high'
      ? 'Respecte la charge émotionnelle élevée sans dramatisation excessive.'
      : pattern.emotional_load?.label === 'low'
      ? 'Maintiens un ton factuel et neutre.'
      : 'Adapte le ton à la charge émotionnelle modérée.';

    // PHASE 4.2: Construire les données story pour le prompt
    const storyContext = story.story.context?.summary || null;
    const storyCentralEvent = story.story.central_event?.summary || null;
    const storyCriticalMoment = story.story.critical_moment?.summary || null;
    const storyResolution = story.story.resolution?.summary || null;
    // Extraire les leçons de l'auteur (peuvent être des objets { lesson, evidence_snippet } ou des strings)
    const storyAuthorLessonsRaw = story.story.author_lessons || [];
    const storyAuthorLessons = storyAuthorLessonsRaw.map(item => {
      if (typeof item === 'string') return item;
      return item.lesson || item.value || item.text || item.summary || '';
    }).filter(l => l && l.trim());
    
    const storyCommunityInsightsRaw = story.story.community_insights || [];
    let storyCommunityInsights = storyCommunityInsightsRaw.map(item => {
      if (typeof item === 'string') return item;
      return item.value || item.text || item.summary || item.quote || item.insight || '';
    }).filter(i => i && i.trim());
    
    // DÉDUPLICATION NORMALISÉE des insights AVANT envoi au LLM
    if (storyCommunityInsights.length > 0) {
      const normalize = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      const seen = new Set();
      const uniqueInsights = [];
      for (const insight of storyCommunityInsights) {
        const normalized = normalize(insight);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          uniqueInsights.push(insight);
        }
      }
      if (uniqueInsights.length < storyCommunityInsights.length) {
        console.log(`   🧹 Insights dédupliqués: ${storyCommunityInsights.length} → ${uniqueInsights.length} (${storyCommunityInsights.length - uniqueInsights.length} doublons supprimés)`);
      }
      storyCommunityInsights = uniqueInsights;
    }
    
    // TRADUCTION DES INSIGHTS COMMUNAUTAIRES EN FRANÇAIS
    if (storyCommunityInsights.length > 0) {
      const insightsText = storyCommunityInsights.join('\n');
      const englishDetection = this.detectEnglishContent(insightsText);
      
      if (englishDetection.isEnglish && englishDetection.ratio > 0.3) {
        console.log(`🌐 Insights communauté détectés en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
        const translatedText = await this.translateToFrench(insightsText);
        // Re-splitter les insights traduits
        storyCommunityInsights = translatedText.split('\n').filter(i => i.trim());
      }
    }
    
    const storyOpenQuestionsRaw = story.story.open_questions || [];
    const storyOpenQuestions = storyOpenQuestionsRaw.map(item => {
      if (typeof item === 'string') return item;
      return item.value || item.text || item.summary || item.question || '';
    }).filter(q => q && q.trim());

    // Extraire et SCORER les citations depuis evidence
    // Best practice content writing: pick quotes with EMOTION, INSIGHT, TENSION
    // Not logistics ("Tokyo -> Hakone -> Kyoto") but feelings ("On n'a pas pu faire les deux sans courir")
    const evidenceSnippets = story.evidence?.source_snippets || [];
    const availableCitations = this.rankCitationsByQuality(evidenceSnippets);

    const anglesList = [...existingTitles, ...existingAngles].slice(0, 30);
    const anglesBlock = anglesList.length > 0 ? `
⚠️ ANGLES ET TITRES DÉJÀ UTILISÉS — CHOISIR UN ANGLE FRAIS (OBLIGATOIRE) :
${anglesList.map(t => `- ${String(t).trim()}`).join('\n')}
Tu DOIS proposer un titre et un angle éditorial UNIQUES : ni même formulation, ni même angle (ex. si "budget 12 mois Thaïlande" existe, propose un autre angle pour ce témoignage).
` : '';

    // ═══════════════════════════════════════════════════════════════════════
    // BLOC ÉDITORIAL CONDITIONNEL : NEWS vs EVERGREEN
    // ═══════════════════════════════════════════════════════════════════════
    let editorialBlock;

    if (editorialMode === 'news') {
      // ─── MODE NEWS / ACTU ─────────────────────────────────────────
      editorialBlock = `🎯 TON ET VOIX (MODE NEWS / ACTU) :
- ${toneGuidance}
- ${emotionalGuidance}
- Thème principal: ${pattern.theme_primary || 'non spécifié'}
- Ton direct, factuel, orienté impact immédiat. Tutoiement obligatoire.

⚠️⚠️⚠️ OBLIGATIONS ÉDITORIALES NON-NÉGOCIABLES — L'ARTICLE SERA REJETÉ SANS CES ÉLÉMENTS ⚠️⚠️⚠️

🎭 PERSONA FLASH VOYAGE — "Le pote expat cash qui a tout vu" :
ATTRIBUTS : tranchant, terrain, cash, complice, opinionné.

TICS DE LANGAGE (utilise 3-5 par article, variés) :
- "Spoiler : [révélation]"
- "Le calcul est simple."
- "Et c'est là que ça se corse."
- "Sur [N] témoignages, [X] disent la même chose :"
- "Traduction : [reformulation cash]"
- "On a fait le calcul (pour que tu n'aies pas à le faire)."
- "(et personne ne te le dira)"
- "Le vrai coût, c'est pas [X]. C'est [Y]."
- "Verdict terrain :"
- "À tester si... / À éviter si..."

BLACKLIST STRICTE — JAMAIS UTILISER :
- "Ce magnifique pays", "le paradis sur terre", "un incontournable"
- "Découvrez les merveilles de", "pour les plus aventureux"
- "Il y en a pour tous les goûts", "N'hésitez pas à"
- "Une expérience inoubliable", "un dépaysement total"
- "Chaque voyage est unique", "Il est important de noter que"
- Toute phrase qui pourrait apparaître sur N'IMPORTE QUEL blog voyage → réécrire avec un fait concret

CLICHÉS VOYAGE BANNIS (en plus de la blacklist ci-dessus) :
- "joyau caché", "hors des sentiers battus", "baigné de soleil"
- "eaux cristallines", "à couper le souffle", "creuset culturel"
- "animé", "pittoresque", "niché", "se vante de"
- "un festin pour les sens", "riche tapisserie", "chargé d'histoire"
- "carte postale", "dépaysement garanti", "monde à part"

USAGE DU "TU" : toujours suivi d'une conséquence concrète, d'un coût, ou d'une action. JAMAIS d'une émotion ou platitude.
❌ "Tu vas adorer ce pays !" → ✅ "Tu vas cramer 200 € en frais bancaires si tu ne configures pas Wise avant."

TÉMOIGNAGES NOMMÉS (MINIMUM 3 PAR ARTICLE) :
L'article DOIT mentionner au minimum 3 prénoms inventés avec profils distincts :
- Protagoniste 1 : le cas principal (détaillé dans l'intro, suivi tout au long)
- Protagoniste 2 : contre-exemple ou profil différent (couple vs solo, budget vs confort)
- Protagoniste 3 : confirmation ou nuance (freelance, famille, retraité)
Chaque protagoniste = prénom + âge + durée sur place + 1 fait chiffré unique.
Exemple : "Marie, 34 ans, 3 semaines en couple, a dépensé 45 % de plus que prévu en excursions."
NE JAMAIS utiliser un seul protagoniste pour tout l'article.

- ZÉRO amplification : ne dramatise pas, ne projette pas, ne suppose pas. Restitue les faits tels qu'ils sont.
- Distingue explicitement ce qui est CERTAIN (fait vérifié, citation directe) de ce qui est INCERTAIN (hypothèse, rumeur, non confirmé).

📰 CADRE ÉDITORIAL NEWS — Contraintes de contenu (PAS un template rigide) :

1. HOOK (1-2 phrases) : micro-scène factuelle + contexte immédiat. Plonge le lecteur dans le fait principal sans préambule.

2. BLOC « Ce que ça change concrètement » (OBLIGATOIRE) :
   - Un H2 contenant le mot "change" ou "impact" ou "concrètement"
   - Suivi de 3-7 bullets actionnables (<ul><li>)
   - Chaque bullet = une conséquence pratique pour le voyageur, pas une reformulation du fait

3. BLOC « Combien ça coûte / combien tu perds » (OBLIGATOIRE si le sujet implique de l'argent) :
   - Montants explicites en EUROS uniquement (pas de dollars, pas de USD entre parenthèses)
   - Exemple : « ~920 euros » ou « environ 200 euros »
   - Si pas d'argent impliqué, ce bloc peut être omis

LONGUEUR MINIMALE DES PARAGRAPHES : Chaque <p> doit contenir AU MINIMUM 2-3 phrases (120+ caractères). Jamais de paragraphes d'une seule phrase courte — ça donne un rythme robotique. Développe chaque idée avec un détail concret, un exemple, ou une nuance.

4. MINI-SCÉNARIO « Si tu es dans ce cas → fais ça » (2-4 phrases) :
   - Situation concrète du lecteur → action immédiate recommandée
   - Pas de conditionnel vague : être directif

5. PREUVES : 1-3 citations Reddit inline max entre guillemets français « ... »
   - Ne pas paraphraser : citer textuellement depuis les données extraites
   - Pas plus de 3 citations

6. 1 CTA MAXIMUM, intégré naturellement dans le flux. Si aucun CTA n'est pertinent, 0 CTA.

⚠️ CONTRAINTES NEWS STRICTES :
- Format : 600-1000 mots. Pas de guide exhaustif, pas de comparatifs longs.
- 1 CTA AFFILIÉ MAXIMUM : uniquement s'il résout le problème immédiat exposé dans l'actu. Sinon 0.
- Pas de sections "limites et biais", "erreurs fréquentes", "FAQ", "checklist longue". Ce n'est PAS un guide.
- Structure linéaire : fait → impact → coût → scénario → action.
- Les H2 doivent être factuels et spécifiques au fait traité (pas de H2 narratifs longs).
- ✅ Les CTAs décrivent l'action réelle du lecteur : «Compare les vols depuis Paris», «Vérifie les conditions du visa». Les placeholders techniques restent invisibles.
- Tous les montants doivent être en euros (EUR) uniquement. Si la source donne un montant en USD, convertir avec taux ~0.92. Ne PAS indiquer le montant en dollars. Ex: ~920 euros.

${marketingSection}

FORMAT HTML: <h2>, <h3>, <p>, <ul><li>, <strong>. LONGUEUR: 600-1000 mots. Format court, décision rapide.

🚨 EXPLOITATION DES DONNÉES EXTRAITES: INTÈGRE les détails pertinents (faits, dates, chiffres). UTILISE 90% minimum des données fournies. Pas d'invention.

⚠️ STRUCTURE JSON (MODE NEWS) :
{
  "article": {
    "titre": "...",
    "developpement": "...",  // Corps de l'article en HTML. Commence par 1-2 paragraphes <p> (hook + annonce fait). Puis H2 factuels. COURT. EN FRANÇAIS.
    "a_retenir": "...",  // 2-3 bullets HTML (<ul><li>) : les takeaways clés. Sans H2 (le système l'ajoute).
    "signature": "...",  // CTA soft de fin (1 seul, contextuel). ✅ Décris l'action : «Compare les assurances voyage» plutôt qu'un placeholder technique.
    "citations": [...],  // max 3
    "opportunites_liens_internes": [...]
  }
}

⚠️ RAPPELS NEWS : Ton factuel. Pas d'invention. Pas de dramatisation. Tout en FRANÇAIS. 1 CTA max. Court. Aucun placeholder d'affiliation visible.

Réponds UNIQUEMENT en JSON avec cette structure.`;
    } else {
      // ─── MODE EVERGREEN / STRATÉGIE ───────────────────────────────
      editorialBlock = `🎯 TON ET VOIX (MODE EVERGREEN / STRATÉGIE) :
- Tutoiement obligatoire : s'adresser au lecteur avec "tu" (pas "vous"). Ton direct, éditorial, ni cliché ni fantasme.
- ${toneGuidance}
- ${emotionalGuidance}
- Thème principal: ${pattern.theme_primary || 'non spécifié'}

⚠️⚠️⚠️ OBLIGATIONS ÉDITORIALES NON-NÉGOCIABLES — L'ARTICLE SERA REJETÉ SANS CES ÉLÉMENTS ⚠️⚠️⚠️

🎭 PERSONA FLASH VOYAGE — "Le pote expat cash qui a tout vu" :
ATTRIBUTS : tranchant, terrain, cash, complice, opinionné.

TICS DE LANGAGE (utilise 3-5 par article, variés) :
- "Spoiler : [révélation]"
- "Le calcul est simple."
- "Et c'est là que ça se corse."
- "Sur [N] témoignages, [X] disent la même chose :"
- "Traduction : [reformulation cash]"
- "On a fait le calcul (pour que tu n'aies pas à le faire)."
- "(et personne ne te le dira)"
- "Le vrai coût, c'est pas [X]. C'est [Y]."
- "Verdict terrain :"
- "À tester si... / À éviter si..."

BLACKLIST STRICTE — JAMAIS UTILISER :
- "Ce magnifique pays", "le paradis sur terre", "un incontournable"
- "Découvrez les merveilles de", "pour les plus aventureux"
- "Il y en a pour tous les goûts", "N'hésitez pas à"
- "Une expérience inoubliable", "un dépaysement total"
- "Chaque voyage est unique", "Il est important de noter que"
- Toute phrase qui pourrait apparaître sur N'IMPORTE QUEL blog voyage → réécrire avec un fait concret

CLICHÉS VOYAGE BANNIS (en plus de la blacklist ci-dessus) :
- "joyau caché", "hors des sentiers battus", "baigné de soleil"
- "eaux cristallines", "à couper le souffle", "creuset culturel"
- "animé", "pittoresque", "niché", "se vante de"
- "un festin pour les sens", "riche tapisserie", "chargé d'histoire"
- "carte postale", "dépaysement garanti", "monde à part"

USAGE DU "TU" : toujours suivi d'une conséquence concrète, d'un coût, ou d'une action. JAMAIS d'une émotion ou platitude.
❌ "Tu vas adorer ce pays !" → ✅ "Tu vas cramer 200 € en frais bancaires si tu ne configures pas Wise avant."

- ✅ Titre : structure [Sujet] : la vérité (ni cliché, ni fantasme) ou [Révélation] + [Intent SEO]. Chaque titre est unique à CET article — il contient la destination + un angle précis. Exemple : «Vivre à Bali avec 1 000 €/mois : budget réaliste pour nomades» au lieu de «Guide complet budget».
- Chaque section doit répondre à une vraie question ou tension du lecteur ; pas de remplissage générique.

RÈGLE CARDINALE — TENSION ORBITALE :
Ton article entier doit orbiter autour d'une tension éditoriale unique fournie dans les données (bloc ANGLE EDITORIAL STRATEGIQUE).
Chaque section, chaque paragraphe doit faire avancer cette tension vers une résolution.
On ne décrit pas. On arbitre. On évalue. On tranche.
Le lecteur doit sentir qu'une décision se joue à chaque paragraphe.

RÈGLE ANTI-ARTICLE INTERCHANGEABLE (80%+ des H2 doivent être décisionnels) :
Chaque H2 doit poser un arbitrage ou une tension, pas simplement informer.
Privilégie les H2 contenant un verbe décisionnel (choisir, éviter, payer, optimiser, risquer, arbitrer, renoncer, privilégier, sacrifier, négliger) ou un connecteur de tension (mais, vs, au prix de, à condition de, en revanche, pas encore, vrai/véritables).
Les H2 sur les coûts doivent inclure "frais", "surcoût", "facture", "caché", "piège" ou un arbitrage — jamais un titre neutre.
Un H2 purement descriptif ("Budget au Vietnam", "Transports à Bali") affaiblit l'article et sera pénalisé à l'audit (-3 à -8 pts).

📖 OUVERTURE IMMERSIVE — HOOK CINÉMATIQUE (premier paragraphe, OBLIGATOIRE) :
- Ouvrir sur une micro-scène sensorielle (2-4 phrases) : lieu, odeur, bruit, geste, tension. Puis 1 question qui accroche.
- La scène doit être tirée du témoignage (lieu réel, situation réelle, enjeu réel).
REGLE SOURCE : Ne mentionne jamais Reddit, r/xxx, ou subreddit dans le texte. Le lecteur voit un temoignage de voyageur, pas un post Reddit. Utilise « forums de voyageurs », « communautes d'expatries ».

REGLE INTEGRITE : Utilise UNIQUEMENT les faits, prix, lieux et dates du brief ci-dessous. Aucun ajout exterieur.

REGLE DEDUP : Chaque paragraphe apporte exactement 1 fait nouveau. Pas de repetition de citation, chiffre, ou formulation.

- ✅ Ouvre TOUJOURS par une micro-scène sensorielle (lieu + action + tension), puis enchaîne sur une question. Exemple : «L'écran du distributeur affiche 220 bahts de frais — tu calcules mentalement si ça vaut le coup.»
- Exemples calibrés :
  * Budget : "Chaque fois que je devais sortir du cash en Thaïlande, ça commençait pareil. L'écran du distributeur affiche les frais, tu calcules mentalement, et tu te demandes si le jeu en vaut la chandelle. Combien te coûte vraiment cette habitude sur un mois ?"
  * Visa : "Tu atterris à Bangkok avec un visa de 30 jours et une liste qui en demanderait 90. L'air chaud te frappe en sortant de l'aéroport. Et là, première question : par où commencer ?"
  * Santé : "Il est 2h du matin à Bali quand ton estomac décide que la soirée est terminée. Tu cherches une pharmacie, tout est fermé. Qu'est-ce que tu aurais dû prévoir ?"

📊 CONTEXTE NARRATIF (paragraphe 2-3, OBLIGATOIRE) :
- Après le hook, 1 paragraphe cadre : où on en est / ce qui déclenche / ce qui est en jeu.
- ✅ Ancre dans le cas concret du témoignage : qui est cette personne, quel est son projet, quel est l'enjeu. Exemple : «Julien, 28 ans, vient de quitter son CDI pour tester 3 mois en Thaïlande avec 4 000 € — son enjeu : tenir sans toucher à son épargne.»
- Inclure des benchmarks concrets si disponibles (coût/jour, coût/mois, durées, distances).

📌 PREUVES INTÉGRÉES (OBLIGATOIRE) :
- Inclure 2 extraits courts (<= 20 mots chacun) du témoignage (post ou commentaires) sous forme de citation intégrée.
- Chaque citation contextualisée : "Un voyageur résume : « citation »", "L'auteur précise : « citation »".
- Les citations servent de preuve, pas de décoration — elles ancrent un argument.

🎯 ARBITRAGE ÉDITORIAL (OBLIGATOIRE) :
- Écrire noir sur blanc une recommandation tranchée basée sur les signaux Reddit.
- Format : "Si ton budget est [X]... [recommandation]. Si tu veux [Y]... [alternative]."
- Ne PAS rester neutre — choisir, trancher, recommander. Le lecteur vient pour un avis, pas un résumé.

📌 SECTIONS PRATIQUES ET PEURS :
- Style de voyage : H2 type "Quel style de voyage permet de durer longtemps avec [budget] ?"
- Peurs invisibles : "Les peurs invisibles qui stoppent les voyages longs" (si pertinent dans le témoignage).

📌 RÉALITÉ VS FANTASME ET AFFILIATION :
- "Réalité vs fantasme : 3 vérités que personne ne te dira" : 3 points vérifiables. ✅ Garde le focus sur les faits terrain — les liens affiliés restent invisibles dans le flux narratif. Exemple : «Le coworking à 46 €/mois existe, mais le wifi tombe 3 fois par jour.»

📌 VERDICT / CE QU'IL FAUT RETENIR :
- Ton réaliste, pas vendeur. Minimum 2 paragraphes substantiels.
- ✅ Le verdict doit trancher avec un avis personnel étayé. Exemple : «Avec 1 500 €/mois, Chiang Mai reste imbattable — à condition d'accepter la chaleur d'avril.» Accompagne le CTA d'un fait concret qui le justifie.

✍️ GUIDE DE STYLE — PHRASES À HAUTE VALEUR (chaque phrase contient un fait, un chiffre, ou un choix) :
- ✅ Remplace les tournures impersonnelles par des phrases directes avec tutoiement. Exemple : «Le visa te coûtera 35 €» au lieu de «Il est important de savoir que le visa coûte 35 €».
- ✅ Chaque phrase apporte un fait concret ou un arbitrage. Exemple : «La ligne de bus 39 relie l'aéroport au centre pour 0,90 €» au lieu de «Il est recommandé de prendre le bus».
- ✅ Attaque avec le sujet réel, pas une béquille syntaxique. Exemple : «Le décalage horaire depuis Paris (+5h/+6h) complique les visios» au lieu de «Dans un premier temps, il convient de noter le décalage».
- ✅ Chaque phrase passe le test : «Est-ce que cette info aide le lecteur à prendre une décision ?» Si non, reformule avec un fait ou un chiffre.

📐 STRUCTURE ÉDITORIALE (pilotée par le récit) :

⚠️ Un seul bloc "développement" (HTML libre). L'ordre des H2/H3 et le choix des titres sont LIBRES, pilotés par le récit.

0. QUICK GUIDE (OBLIGATOIRE pour EVERGREEN)
   - Résumé ultra-concis en début d'article : destination, durée, budget, type de voyage, difficulté.
   - Intégrer dans le récit narratif ou en encart structuré.

1. DÉVELOPPEMENT (OBLIGATOIRE - UN SEUL CHAMP "developpement")
   - LONGUEUR : 2000-3000 mots. Assez pour couvrir le sujet EN PROFONDEUR, pas assez pour divaguer.
   - ⛔ SCOPE LOCK : L'article couvre EXACTEMENT ce que le titre promet. RIEN DE PLUS.
     Si le titre dit "2 risques" → l'article parle de CES 2 risques en profondeur. Pas de guide général, pas de FAQ sur les vols, pas de section budget générique.
     Si le titre dit "5 frais cachés" → 5 frais, chacun développé. Pas de section "comment se déplacer" ou "meilleure période".
     CHAQUE section H2 doit répondre directement à la promesse du titre. Si une section pourrait exister dans un article avec un AUTRE titre → elle n'a pas sa place ici.
   - Contenu en HTML libre (<h2>, <h3>, <p>, <ul><li>). Arc narratif (situation → surprise → impact → options → choix → plan d'action).
   - OBLIGATOIRE : Hook cinématique, 2-5 citations inline « ... », témoignage comme preuve, angles SERP, 3 CTA narratifs, affiliation dans le flux.
   - SECTIONS SERP OBLIGATOIRES (H2 dédiés) :
     * ⛔ SECTION "CE QUE LES BLOGS IGNORENT" (OBLIGATOIRE, FORMAT STRICT) :
     H2 : "Ce que les blogs ignorent sur [sujet précis] à [destination]"
     FORMAT OBLIGATOIRE — 3 mythes débunkés :

     <p><strong>Mythe #1 : « [croyance populaire citée textuellement] »</strong></p>
     <p>Réalité terrain : [fait contraire avec chiffre exact]. Sur {N} témoignages analysés, {X} contredisent cette affirmation. [Conséquence en euros pour le lecteur].</p>

     <p><strong>Mythe #2 : « [deuxième croyance] »</strong></p>
     <p>Réalité terrain : [fait + lieu nommé + prix]. [Source : témoignage de {prénom}, {âge} ans, {durée} sur place].</p>

     <p><strong>Mythe #3 : « [troisième croyance] »</strong></p>
     <p>Réalité terrain : [fermeture/changement de règle/arnaque nommée avec dates]. [Action préventive en 1 phrase].</p>

     CHAQUE mythe = 1 croyance populaire entre guillemets + 1 réalité avec chiffre + 1 source. PAS de vague "les guides oublient souvent..." — des FAITS.
     PATTERNS BANNIS (=filler générique, rejet automatique) : «les coûts cachés des transferts locaux», «les périodes creuses», «les arnaques récurrentes ciblant les touristes francophones». À la place : arnaques nommées avec lieu précis, coûts cachés en devise locale + EUR, fermetures saisonnières avec dates exactes.
     * H2 "Erreurs fréquentes à éviter" — OBLIGATOIRE, pièges concrets avec montants.
     * H2 "Limites et biais de cet article" — OBLIGATOIRE, transparence E-E-A-T, 1-2 paragraphes honnêtes sur les limites des sources.
   - OPTIONNEL (si le story le justifie) : peurs invisibles, réalité vs fantasme, leçons auteur.

⛔ CHECKLIST SAUVEGARDABLE (REJET AUTOMATIQUE SI ABSENTE pour EVERGREEN) :
L'article DOIT contenir une div class="fv-checklist" avec structure Avant/Sur place/À éviter.
SANS CETTE CHECKLIST, L'ARTICLE EST AUTOMATIQUEMENT REJETÉ.
- Div avec classe "fv-checklist", style : background #f7fafc, border 2px solid #3182CE, border-radius 12px, padding 24px
- H3 : "✈️ Checklist Flash Voyage — [Destination] [Sujet]"
- Sous-titre : "📸 Capture d'écran recommandée"
- Structure : "Avant de partir" (2-3 items ✔️) + "Sur place" (2-3 items ✔️) + "À éviter" (2 items ❌)
- Max 8 items. Chaque item = action spécifique + détail chiffré (montant, lieu, timing)
- La checklist va JUSTE AVANT le verdict décisionnel dans le développement

⛔ VERDICT DÉCISIONNEL (REJET AUTOMATIQUE SI ABSENT) :
L'article DOIT contenir un H2 "Verdict Flash Voyage" avec 3-4 profils "Si tu es [X] → [Y]".
SANS CE BLOC, L'ARTICLE EST AUTOMATIQUEMENT REJETÉ PAR LE PANEL DE REVIEW.
- H2 : "Verdict Flash Voyage : à qui c'est vraiment destiné"
- 3-4 profils au format : "<strong>Si tu es [profil SPÉCIFIQUE avec chiffre]</strong> → [action directe impérative]"
- Le dernier profil = qui NE DEVRAIT PAS faire ça (contrarian)
- DIRECTIF : pas "tu peux considérer" mais "pars sur", "évite", "réserve maintenant"
- Exemple :
  "Si tu es freelance avec moins de 1 800 €/mois → Pars sur Chiang Mai, coworking Punspace à 85 €/mois."
  "Si tu cherches le paradis digital nomad pas cher → Oublie. Ça n'existe pas."

2. RECOMMANDATIONS (OBLIGATOIRE - champ séparé)
   - <h2>Nos recommandations : Par où commencer ?</h2> + 3 options avec CTAs.

3. CE QU'IL FAUT RETENIR + SIGNATURE (champs séparés)

📝 FORMAT CITATIONS — GUILLEMETS FRANÇAIS INLINE UNIQUEMENT :
- ✅ Utilise des guillemets français inline « ... » pour toutes les citations. Le système ajoutera les <blockquote> en post-traitement. Exemple : Un voyageur résume : « le budget a explosé dès le premier jour ».
- Citations courtes UNIQUEMENT entre guillemets français inline : « ... »
- Attribution : « ... » — ${extracted.author || 'auteur Reddit'}
- OBLIGATOIRE : 2-5 citations inline depuis story.evidence.source_snippets

⚠️ RÈGLE ABSOLUE — H2 SPÉCIFIQUES (blacklist étendue) :
- ✅ Chaque H2 contient un verbe décisionnel + la destination ou un angle concret. Exemple : «Pourquoi Bali coûte 40 % plus cher que prévu» au lieu de «Budget», «Trois erreurs de visa qui bloquent ton entrée au Vietnam» au lieu de «Conseils pratiques», «Le vrai coût d'un mois à Chiang Mai quartier par quartier» au lieu de «Hébergement».
- Chaque H2 DOIT être ancré dans le cas spécifique : destination + angle unique.
- H2 qualifiés AUTORISÉS : spécifiques à cet article (ex. "Pourquoi 220 bahts par retrait te coûtent une nuit d'hôtel par mois", "Chiang Mai vs Bangkok : où ton budget tient le plus longtemps").

🔄 ARC NARRATIF OBLIGATOIRE :
1. SITUATION (hook + tension) → 2. SURPRISE/RÉVÉLATION → 3. IMPACT RÉEL → 4. OPTIONS CONCRÈTES → 5. CHOIX RECOMMANDÉ → 6. PLAN D'ACTION

📝 CITATIONS INLINE (2-5 OBLIGATOIRES) : intégrées contextualisées dans le flux narratif.
🚫 ADRESSE AU LECTEUR :
- Le "tu" s'adresse TOUJOURS au lecteur/visiteur du site, JAMAIS a l'auteur du post source.
- ❌ INTERDIT dans le CORPS : "Reddit", "r/xxx", "subreddit". Réservé au byline et à la boîte source en bas.
- Les citations sont en 3eme personne : "l'auteur explique", "un voyageur raconte", "une utilisatrice temoigne".

📊 DONNÉES TANGIBLES : budget, chronologie, chiffres intégrés naturellement. Mots-clés SEO : "budget réel", "chronologie", "contraintes".

⚡ RISQUES, ERREURS ET CONSEILS ACTIONNABLES : action préventive concrète, ancres d'affiliation naturelles.

🔍 ANALYSE CRITIQUE : coûts cachés, pieges, erreurs frequentes. Distinction faits / ressentis / interpretations.

📐 STRUCTURE PARAGRAPHES — CONTRAINTES DURES :
- MINIMUM 200 caractères par <p> (sauf max 2 one-liners dramatiques par article entier).
- Chaque <p> = un BLOC DE PENSÉE de 3-5 phrases qui développent UNE idée complète.
- Chaque phrase contient un fait ou une decision. Supprimable sans perte d'info = a supprimer.
- Structure de paragraphe : [accroche courte] + [developpement 2-3 phrases] + [conclusion ou transition].
- 70 %+ des paragraphes font 200+ caracteres.

🎭 ÉCRITURE HUMAINE — TON DE CONVERSATION ENTRE POTES :
- Tu écris comme un pote qui RACONTE son voyage au bar. Pas comme un guide touristique.
- MÉLANGE dans le même paragraphe : un fait concret + un ressenti/sensation + une conséquence pratique. Exemple : «Le bus pour Vientiane part à 7h, sauf que personne te dit que la gare routière est à 45 minutes du centre — et le tuk-tuk pour y aller te coûte autant que le billet de bus. Tu te retrouves à 6h du mat dans le noir, ton sac de 15 kilos sur le dos, à négocier en lao avec un chauffeur qui sent que t'es pressé.»
- DIGRESSIONS OBLIGATOIRES (2-3 par article) : insère des apartés sensoriels ou anecdotiques entre parenthèses ou en incise. Exemples : "(le café au 7-Eleven est étrangement bon)", "— le genre de truc que tu découvres en slip à 6h du mat dans un dortoir de Chiang Mai", "(spoiler : c'est toujours plus loin que sur Google Maps)".
- VARIE les attaques de paragraphes : "Et là,", "Sauf que", "Le truc c'est que", "Bon.", "Résultat :", une question directe, un chiffre-choc. JAMAIS deux paragraphes consécutifs qui commencent par "Le/La/Les/Tu/Il".
- EXPRESSIONS ORALES naturelles : "franchement", "genre", "du coup", "en vrai", "le truc c'est que", "bon", "bref". 2-3 par section, pas plus.
- LONGUEUR DE PHRASES : alterne UNE phrase courte percutante (5-8 mots) pour DEUX phrases longues développées (20-35 mots). Ratio 1:2, pas 1:1.
- Citations Reddit : intégrées DANS le flux narratif entre « », fermées avec ». TOUJOURS contextualisées (qui parle, pourquoi c'est pertinent).
- Les citations Reddit entre « » doivent TOUJOURS être fermées avec ».

🇫🇷 NICHE FRANCOPHONE ASIE — L'article s'adresse a des voyageurs FRANCOPHONES qui partent en Asie :
- References francaises : vols depuis Paris (CDG/ORY), Lyon, Marseille, Bruxelles.
- 💶 DEVISE : TOUT montant est en EUROS (€). Convertis chaque prix USD source en euros (taux ~0.92). Exemple : source «$2500» → article «~2 300 €», source «$50/night» → article «~46 €/nuit». Le symbole € se place après le nombre.
- Contexte FR : vacances scolaires, conges payes, jours feries francais, ponts. Passeport francais pour les visas.
- ✅ Ton naturel : tutoiement, expressions courantes («galère», «bon plan», «se faire arnaquer», «valoir le coup»). Écris comme un pote qui a voyagé, pas comme un guide Michelin.
- Specificites FR en Asie : decalage horaire depuis Paris, assurance carte bancaire francaise (Visa Premier), forfait mobile Free international, Revolut/Wise pour les paiements.

📊 ÉLÉMENTS STRUCTURELS EVERGREEN (obligatoires si le sujet s'y prête) :
- TABLEAU COMPARATIF : obligatoire si l'article compare 2+ options, destinations ou produits. Format HTML <table> avec <thead> et <tbody>. Ex: comparatif budget, avantages/inconvénients, destinations côte à côte.
- FAQ SEO : 3-5 questions/réponses en fin de développement. Format OBLIGATOIRE : <details><summary>Question ?</summary><p>Réponse détaillée.</p></details> — PAS de <h3> pour les questions FAQ.
  ⛔ SCOPE LOCK FAQ : Les questions FAQ doivent porter UNIQUEMENT sur le sujet spécifique de l'article. Si l'article parle de "2 risques moto", les FAQ parlent de moto et de ces risques — PAS de "combien coûte un vol" ou "quelle est la meilleure saison" (sauf si directement lié au sujet).
- CHECKLIST : obligatoire si l'article est un guide pratique ou un plan d'action. Format <ul><li> avec items actionnables.

🎯 AFFILIATION NATIVE (2-4 insertions max, DANS LE FLUX) :
- ✅ Chaque insertion suit le schéma : problème concret → solution affiliée dans le flux. Exemple : «Les frais bancaires te coûtent 15 €/mois → ouvre un compte Wise avant de partir.»
- Chaque CTA suit un paragraphe qui décrit un problème concret vécu.
- CTA "préventif" TÔT (après le hook), CTA "solution" AU PIC (après révélation), CTA "setup long terme" APRÈS (avant conclusion).
- Marquer chaque emplacement CTA avec : <!-- FV:CTA_SLOT reason="description du problème résolu" -->

✅ STANDARDS : H2 spécifiques avec destination + angle, listes de 5 items max classées par priorité, ton éditorial engagé, conseils actionnables sans morale. Exemple de liste bien hiérarchisée : «1. Ouvre Wise (gratuit) 2. Configure les alertes de change 3. Préviens ta banque FR».

✅ CTA NATURELS — TOUJOURS DÉCRIRE L'ACTION RÉELLE :
- ✅ Chaque CTA décrit l'action concrète du lecteur. Exemple : «Compare les vols vers Bangkok», «Trouve ton assurance voyage», «Réserve ta première nuit à Chiang Mai».
- Les CTAs doivent décrire l'action réelle ("Compare les vols vers Bangkok", "Trouve ton assurance voyage") — jamais un placeholder technique.

🔗 TRANSITIONS BLOCS PARTENAIRES/CTA (OBLIGATOIRE) :
- Chaque bloc partenaire/CTA DOIT être précédé d'une phrase de transition naturelle qui fait le lien avec le paragraphe précédent.
- Chaque CTA decoule naturellement du paragraphe qui precede.
- ✅ Exemple : "Avant de partir, compare les prix des vols : les tarifs varient énormément selon la saison." [bloc partenaire]
- ✅ Exemple : "Pour éviter ce surcoût, le plus simple reste d'ouvrir un compte Wise avant le départ." [bloc partenaire]
- ✅ Exemple : "Si tu veux verrouiller un bon tarif, voici où chercher en priorité." [bloc partenaire]
- La transition DOIT mentionner le BÉNÉFICE pour le lecteur, pas juste annoncer un lien.
- ❌ INTERDIT : "Voici un lien utile :", "Découvrez notre partenaire :", "Cliquez ici :".
- 🎯 COHÉRENCE GÉOGRAPHIQUE : Les blocs partenaires DOIVENT correspondre à la destination de l'article. ❌ INTERDIT : un widget Amsterdam dans un article Vietnam. ❌ INTERDIT : un CTA "vols vers Tokyo" dans un article sur Bali. Chaque CTA doit référencer la bonne destination.

💶 CONVERSION MONETAIRE : Tous les montants en euros uniquement (taux USD ~0.92, GBP ~1.16). Symbole € apres le nombre. Exemples : $1200/month → ~1 100 €/mois, 5000 THB → ~130 €.

📊 MOINS WIKIPEDIA, PLUS DÉCISION (OBLIGATOIRE — vérifié automatiquement) :
- Chaque section DOIT se terminer par une recommandation, un choix, ou un verdict — pas par un résumé neutre.
- MAXIMUM 3 phrases de décision dans TOUT l'article (pas plus !), utilisant ce format : "Si tu [verbe situation], privilégie/évite/opte pour/choisis/pars sur [option concrète]."
- VARIÉTÉ OBLIGATOIRE : ne mets JAMAIS deux "Si tu..." dans des paragraphes consécutifs. Espace-les d'au moins 2-3 paragraphes.
- Les autres paragraphes doivent utiliser des formulations variées : impératifs directs ("Réserve...", "Prévois..."), questions rhétoriques, ou conseils narratifs.
- Un article sans prise de position sera REJETÉ.

STYLE : transitions fluides, questions rhétoriques, variation du rythme, tutoiement, ton expert accessible.

🔍 PROFONDEUR ANALYTIQUE : coûts réels, temporalité, contraintes, questions utilisateur.

✅ VALIDATION ANTI-SPAM SERP : chaque section apporte une info absente chez 50%+ des concurrents.

🔗 OPPORTUNITÉS DE LIENS INTERNES :
- 5-10 passages avec lien interne naturel. Placement stratégique (30% premiers de l'article, sous H2, avant recommandations).
- Densité : 5-10 liens pour 2000-3000 mots. Ancres précises (2-5 mots).
- COHÉRENCE THÉMATIQUE OBLIGATOIRE : chaque lien interne doit pointer vers un article thématiquement lié au paragraphe qui le contient. Interdit : lien hors-sujet dans l'intro ou dans une section sans rapport.

${marketingSection}

FORMAT HTML: <h2>, <h3>, <p>, <ul><li>, <strong>.
LONGUEUR OBLIGATOIRE: MINIMUM 2500 mots, IDÉAL 3000 mots. Un article EVERGREEN de moins de 1500 mots sera AUTOMATIQUEMENT REJETÉ. Pas de minimum par section, mais le total DOIT dépasser 2500 mots.

🚨 EXPLOITATION DES DONNÉES EXTRAITES : INTÈGRE dans "developpement" les détails temporels, lieux, chiffres, entités extraites. UTILISE 90 % minimum des données fournies. ✅ Chaque prix affiché provient de la source Reddit ou du truth pack. Pour un coût non sourcé, reformule sans montant : «reste abordable», «ne ruinera pas ton budget», «le surcoût est réel». Exemple : «Le trajet en Grab coûte ~9 € (sourcé)» vs «Le trajet en Grab reste raisonnable (non sourcé)».

📍 MARQUEURS ÉDITORIAUX (à insérer dans "developpement") :
- <!-- FV:CTA_SLOT reason="description du problème résolu" --> : 2-4 max, aux emplacements où un widget d'affiliation serait pertinent.
- <!-- FV:DIFF_ANGLE --> : avant le paragraphe qui apporte un angle différenciant (ce que les autres guides ne disent pas).
- <!-- FV:COMMON_MISTAKES --> : avant la section erreurs fréquentes / pièges.
Ces marqueurs sont invisibles pour le lecteur mais exploités par le pipeline. Ne PAS les omettre.

⚠️ STRUCTURE JSON (MODE EVERGREEN) :
{
  "article": {
    "titre": "...",
    "title_tag": "...",  // OBLIGATOIRE - Titre SEO court (50-60 chars MAX), mot-clé principal en tête. Distinct du titre H1. Ex: "Thaïlande 2 semaines : itinéraire et budget réel"
    "quick_guide": "...",  // OPTIONNEL - Quick Guide (destination, durée, budget, type, difficulté)
    "developpement": "...",  // OBLIGATOIRE - MINIMUM 2500 mots. HTML libre. Inclure les marqueurs FV:CTA_SLOT, FV:DIFF_ANGLE, FV:COMMON_MISTAKES. Commence TOUJOURS par 1-2 paragraphes <p> d'intro (hook) AVANT le premier <h2>. EN FRANÇAIS.
    "faq": "...",  // OBLIGATOIRE - 4-6 questions/réponses en HTML <details><summary>Question ?</summary><p>Réponse.</p></details>. Questions basées sur les vraies interrogations du post Reddit et de la communauté.
    "recommandations": "...",  // OBLIGATOIRE - <h2>Nos recommandations</h2> + 3 options + CTAs
    "ce_qu_il_faut_retenir": "...",  // OBLIGATOIRE - Verdict réaliste (tutoiement), 2 paragraphes.
    "signature": "...",  // CTA soft de fin
    "citations": [...],  // max 5
    "opportunites_liens_internes": [...],
    "articles_connexes": [...]
  },
}

⚠️ ANGLES SERP : Intégrer "chronologie"/"timeline", "budget réel"/"coûts réels", "contraintes"/"difficultés" dans le développement.

⚠️ TRADUCTION : Tout le JSON en FRANÇAIS. Si tu génères de l'anglais, l'article sera REJETÉ.

⚠️ RÈGLES ABSOLUES : Auteur ≠ commentaires. Toujours traçable au story.evidence. Pas d'invention. Sections absentes = null ou omises.

⚠️ ✅ Intègre contexte, événement central, moment critique et résolution directement dans le champ "developpement" (HTML libre) — ces champs n'existent pas en sortie JSON.


Réponds UNIQUEMENT en JSON avec cette structure.`;
    }

    const systemMessage = `Tu es un expert FlashVoyages. Rédige un article engageant basé sur le témoignage Reddit.

🚨 TOP 7 RÈGLES CRITIQUES (VÉRIFIER CHAQUE PARAGRAPHE AVANT DE RÉPONDRE) :

1. PRIX RÉELS OBLIGATOIRES : GARDE TOUS LES CHIFFRES. Chaque montant en euros, dollars, bahts, yen etc. DOIT rester dans l'article tel quel. ❌ INTERDIT : "quelques euros", "un budget conséquent", "un coût maîtrisable", "une dépense notable", "un investissement réel". ✅ OBLIGATOIRE : "45€/nuit", "1 300€ le vol A/R", "180 bahts le trajet". Si tu n'as pas le chiffre exact, écris "prix variable selon la saison — vérifier avant de réserver" mais JAMAIS un euphémisme vague. Réf: ThePointsGuy écrit "$395 annual fee" pas "un coût significatif".

2. 
RYTHME PARAGRAPHES TPG : Alterne INTENTIONNELLEMENT paragraphes courts et moyens. Pattern obligatoire : 1 paragraphe court (1-2 phrases, punchline ou transition) → 1-2 paragraphes moyens (3-4 phrases, argumentation développée). ❌ INTERDIT : 3 paragraphes courts d'affilée. ❌ INTERDIT : mur de texte de 6+ phrases. ❌ INTERDIT : une seule phrase par <p> sauf punchline intentionnelle. Chaque paragraphe moyen développe, illustre et nuance. Utilise "franchement", "en vrai", "du coup", "genre", "le truc c'est que" (2-3 par section). Ajoute 2-3 digressions sensorielles entre parenthèses : "(le café au 7-Eleven est étrangement correct)", "(spoiler : c'est toujours plus loin que sur Maps)".

3. HOOK EN 3 TEMPS + CONTRAT ÉDITORIAL (réf TPG) : Le début de l'article suit un arc en 4 paragraphes OBLIGATOIRES :
(1) FRICTION — micro-scène sensorielle concrète qui pose le problème (lieu, action, tension).
(2) EMPATHIE — tu reconnais que le lecteur vit cette question ("Et c'est exactement le dilemme que des milliers de voyageurs affrontent chaque année").
(3) PROMESSE DE VALEUR — tu annonces ce que l'article apporte ("On a recoupé les retours de 30 voyageurs et expatriés sur les forums — voici ce que les blogs ignorent").
(4) 🔒 CONTRAT ÉDITORIAL (OBLIGATOIRE — ne JAMAIS sauter) — Un paragraphe dédié qui explique au lecteur COMMENT cet article a été produit. Ce paragraphe DOIT :
   - Indiquer le NOMBRE EXACT de témoignages analysés (utilise le count réel des données fournies, ex: "On a recoupé les retours de [N] voyageurs et expatriés sur les forums")
   - Dire "forums de voyageurs" ou "communautés d'expatriés" (JAMAIS "Reddit")
   - Promettre ce que le lecteur va obtenir (risques + solutions concrètes)
   - Exemples OBLIGATOIRES à imiter :
     ✅ "Ce constat, ce n'est pas nous qui l'inventons. On a recoupé les retours de 30 voyageurs et expatriés sur les forums, ceux qui y vivent vraiment. Voici les 3 risques qu'aucun blog ne mentionne, et surtout, comment les anticiper concrètement."
     ✅ "Pour cet article, on a épluché [N] témoignages sur les forums de voyageurs et communautés d'expatriés. Le but : extraire les galères réelles, les vrais chiffres, et les solutions qui marchent."
     ✅ "Ce guide repose sur [N] retours de terrain, recueillis sur les forums francophones et internationaux de voyageurs. Pas de théorie, que du vécu."
   - ❌ INTERDIT de sauter ce paragraphe. ❌ INTERDIT de le fusionner avec le hook ou l'empathie. C'est un paragraphe DISTINCT.
❌ INTERDIT de passer directement du hook aux infos sans empathie + promesse + contrat éditorial.

4. TITRE HOOK ÉMOTIONNEL : Le titre provoque une émotion forte (regret, peur, surprise). ❌ INTERDIT les listicles : "X risques que...", "X choses que...", "X erreurs que...". ❌ INTERDIT : "les blogs cachent", "guide complet", "tout savoir". ✅ Patterns : "J'ai [vécu X] à [destination] — [conséquence inattendue]", "[Destination] : le moment où j'ai compris que [révélation]", "Pourquoi personne ne te prévient sur [problème concret] à [destination]".

5. LIENS INTERNES INLINE (pas en bloc) : Les liens internes doivent être tissés DANS les phrases, comme TPG fait. ✅ "les frais cachés du JR Pass peuvent représenter <a href='...'>un vrai piège logistique</a>". ❌ INTERDIT les blocs dédiés type "Pour aller plus loin, Article Title." ou "<p class='internal-link-transition'>". Fréquence : 1 lien interne tous les 100-150 mots, toujours contextuel.

6. CITATIONS INLINE — TOUJOURS QUANTIFIÉES (RÈGLE CRITIQUE) : intègre 2-5 citations courtes entre guillemets français « ... » depuis les données du témoignage.
🔒 RÈGLE ABSOLUE : CHAQUE citation DOIT être introduite avec un CONTEXTE HUMAIN + une QUANTIFICATION CHIFFRÉE. Pas d'exception.
✅ EXEMPLES OBLIGATOIRES À IMITER (5 patterns) :
  1. "Ce point revient dans 8 témoignages sur 30 : « le budget a explosé dès le premier jour »"
  2. "Un expatrié installé depuis 3 ans résume ce que 12 autres confirment : « on sous-estime toujours les frais de visa »"
  3. "Une voyageuse qui a vécu 6 mois sur place, et dont l'avis est partagé par 15 autres témoignages : « les arnaques transport sont systématiques »"
  4. "Parmi les [N] retours analysés, 18 mentionnent exactement ce problème : « les ATM prennent 220 bahts à chaque retrait »"
  5. "Ce constat revient mot pour mot dans un tiers des témoignages : « personne ne te prévient sur les frais cachés »"
Chaque citation DOIT inclure un contexte humain + une quantification chiffree. Formulations generiques sans quantification = article rejete.
✅ Varie les verbes d'introduction : résume, prévient, confirme, nuance, met en garde, alerte, tempère, relativise.
✅ Format inline « ... » uniquement (le système gère les blockquotes).
❌ INTERDIT de répéter la même citation 2 fois. Minimum 2 citations uniques pour validation.

7. H2 DÉCISIONNELS (80%+ obligatoire) : chaque H2 pose un arbitrage, une tension ou un choix. ✅ Verbe décisionnel (choisir, éviter, optimiser, sacrifier, risquer) ou connecteur de tension (mais, vs, en revanche, caché, vrai). ✅ Exemples : «Pourquoi 220 bahts par retrait te coûtent une nuit d'hôtel par mois», «Chiang Mai vs Bangkok : où ton budget tient le plus longtemps».
✅ BONUS CURATION : certains H2 peuvent communiquer la méthode de curation pour renforcer la crédibilité. Exemples :
  - «Ce que 30 voyageurs disent vraiment sur [sujet]»
  - «Le risque n°1 cité par les expatriés (et ignoré par tous les guides)»
  - «Pourquoi les retours des forums contredisent les blogs»
  - «Les 3 pièges que [N] témoignages mentionnent sur [destination]»
  - «Ce que les expatriés de [destination] répètent depuis 2 ans»
Ces H2 "curation" renforcent la proposition de valeur unique de FlashVoyage. En utiliser 1-2 par article.


9. RAPPELS DE SOURCING (2-3 par article) : Le lecteur qui scanne doit comprendre que cet article synthétise des dizaines de retours réels. Insère 2-3 rappels dans le flux :
✅ "Sur les forums, le constat est unanime :", "Ce point divise les expatriés : une moitié recommande X, l'autre Y.", "Parmi les 30 témoignages analysés, 22 mentionnent ce piège."
✅ En transition : "Et ce n'est pas un cas isolé.", "On retrouve le même retour chez des voyageurs à [destination]."
❌ Le sourcing doit vivre DANS le texte, pas seulement dans le byline que personne ne lit.

📊 ENCARTS DE CRÉDIBILITÉ VISUELS (1-2 par article, OBLIGATOIRE) :
Insère 1 à 2 encarts de crédibilité dans le CORPS de l'article (pas juste le byline).
- Le PREMIER encart se place après l'intro (avant le premier H2).
- Un SECOND encart optionnel peut être placé mi-article (après 40-60% du contenu).
- Format HTML OBLIGATOIRE :
<div class='fv-source-anchor' style='margin:1.5rem 0;padding:0.8rem 1rem;background:#f0f7ff;border-left:3px solid #2563eb;border-radius:4px;font-size:0.88rem;color:#4b5563;'>📊 <strong>Synthèse de [N] témoignages</strong> de voyageurs et expatriés | [X] risques identifiés | Sources : forums de voyageurs francophones et internationaux</div>
- Remplace [N] par le nombre réel de témoignages dans les données. Remplace [X] par le nombre de risques/problèmes identifiés dans l'analyse.
- Cet encart sert d'ancre visuelle pour le lecteur qui scanne : il voit immédiatement que l'article est basé sur des données réelles.

8. SÉLECTION DES CITATIONS (RÈGLE ÉDITORIALE SENIOR) :
- La bonne citation = la phrase où le voyageur RESSENT quelque chose, pas celle où il décrit son itinéraire.
- ✅ HAUTE VALEUR : regret, surprise, avertissement, réalisation, émotion, tension ("On n'a pas pu faire les deux sans courir", "J'aurais aimé savoir ça avant")
- ❌ BASSE VALEUR : logistique pure (itinéraire, noms d'hôtels, dates, "nous séjournons à X"), descriptions factuelles sans insight
- Les citations sont classées par qualité ci-dessous. UTILISE LA #1 en priorité (la plus émotionnelle).
- Maximum 1 blockquote dans tout l'article. Les autres citations = guillemets français inline « ... ».
- ❌ INTERDIT : mettre des liens internes dans les blockquotes.
- ❌ INTERDIT : laisser des slugs ou URLs dans le texte des citations.
- Chaque blockquote = 1-2 phrases MAX, en français. Pas de paragraphes entiers.

10. ❌ ZÉRO RÉPÉTITION (RÈGLE ABSOLUE) : Chaque phrase de l'article doit être UNIQUE. Aucune phrase ni aucun paragraphe ne doit être répété, même reformulé.
- ❌ INTERDIT de répéter la même phrase ou le même paragraphe, même avec des mots légèrement différents.
- ❌ INTERDIT de réutiliser la même formule d'introduction : si tu as déjà dit "Voici ce que synthétise la communauté", ne le redis pas.
- ❌ INTERDIT de reprendre le même chiffre + la même citation dans deux sections différentes.
- ✅ OBLIGATOIRE : avant de rédiger chaque paragraphe, vérifie mentalement que tu n'as pas déjà dit la même chose.
- ✅ Si tu veux rappeler un point important, reformule-le sous un angle NOUVEAU avec des données DIFFÉRENTES.
- Exemples de répétitions BANNIES :
  ❌ Section 1 : "Les frais bancaires grèvent le budget" → Section 3 : "Les frais bancaires pèsent sur le budget" (même idée, paraphrasée)
  ❌ Intro : "On a analysé 30 témoignages" → Mi-article : "Comme le montrent les 30 témoignages analysés" (redondant)
  ✅ OK : Intro mentionne 30 témoignages → Mi-article utilise un NOUVEAU chiffre : "18 des témoignages pointent spécifiquement le problème du change"

9. ANCHOR TEXT NATUREL : Le texte des liens internes doit être une phrase naturelle en français. ❌ INTERDIT : "voyager au vietnam avec 500 e comment optimiser chaque depense" (slug brut). ❌ INTERDIT : "Article Title Complet Avec Majuscules". ✅ OBLIGATOIRE : "optimiser son budget au Vietnam", "les vrais coûts du JR Pass" (phrase courte naturelle).

SOURÇAGE DES DONNÉES (OBLIGATOIRE) :
Chaque statistique DOIT avoir une attribution :
- Données internes : "Source : synthèse FlashVoyage, [mois année], [N] témoignages analysés"
- Prix : "Tarif vérifié [mois année]" ou "Source : [Numbeo/Rome2Rio/Google Flights], [mois année]"
- Pourcentages : "Sur [N] voyageurs interrogés, [X] rapportent que..."
INTERDIT : chiffres sans source. "73% des voyageurs" sans dire d'où ça vient = rejet.

🇫🇷 TOUT EN FRANCAIS : Produis 100 % du JSON en francais. Source anglaise → redige directement en francais.

📝 RÈGLES POUR LE TITRE (OBLIGATOIRE) — HOOK ÉMOTIONNEL + SEO :
- Structure : [Tension/Enjeu émotionnel] + [Destination] + [Curiosity gap]
- Le titre doit provoquer une ÉMOTION : peur de rater, regret, surprise, soulagement, injustice.
- Patterns qui HOOKENT (utilise-en un) :
  • REGRET : "J'aurais dû savoir ça avant [destination]" / "L'erreur à X€ que j'ai faite à [destination]"
  • TENSION : "[Destination] : le moment où j'ai compris que [révélation]"
  • INJUSTICE : "Pourquoi personne ne te prévient sur [problème] à [destination]"
  • CURIOSITÉ : "[Chiffre inattendu] + [destination] : ce que ça change vraiment"
  • CONTRASTE : "[Destination] : ce que tu crois vs ce qui t'attend vraiment"
- ❌ INTERDITS : titres descriptifs plats ("X risques que...", "l'itinéraire qu'on te cache", "guide complet", "tout savoir sur")
- Le lecteur doit ressentir : "il FAUT que je lise ça sinon je vais le regretter"
- Intent explicite : budget / sécurité / long séjour / erreurs à éviter / guide pratique
- ✅ Titre sans date — sauf si l'année est liée à une actualité (changement de visa, nouvelle loi). Exemple : «Visa nomade Thaïlande : retour d'expérience» plutôt que «Visa nomade Thaïlande (2026)».
- ✅ Titres H1 et H2 en texte pur — les emojis restent dans le corps de l'article (paragraphes, listes). Exemple : «<h2>Nos recommandations</h2>» et non «<h2>🎯 Nos recommandations</h2>».
- ✅ FIDÉLITÉ CHIFFRES TITRE : chaque chiffre dans le titre garde son contexte source. Exemple : si la source dit «$50/month for coworking», le titre peut dire «coworking à ~46 €/mois» — le chiffre reste lié au coworking, pas au coût de la vie global.
- 💶 TITRE EN EUROS UNIQUEMENT : convertis en euros (taux ~0.92). Exemple : source «$2500» → titre «2 300 €». Le symbole € se place après le nombre.
- Exemples HOOKS (à imiter) :
  ✅ "J'ai claqué 400€ de trop en Thaïlande — l'erreur bête que tout le monde fait"
  ✅ "Vietnam solo : le truc que j'aurais voulu savoir avant de réserver"
  ✅ "Bali à 1000€/mois ? Voilà ce qu'on ne te dit pas"
  ✅ "Pourquoi ton premier mois à Bangkok va te coûter le double"
  ✅ "Visa run au Laos : ce que 3 passages m'ont vraiment coûté"
  ✅ "Corée du Sud : l'arnaque transport que 90% des touristes se prennent"
- Transforme les titres descriptifs en hooks emotionnels avec tension + destination + enjeu concret.
- Le titre DOIT contenir une destination asiatique précise (ville ou pays)
- Le titre DOIT être actionnable et spécifique
- Maximum 70 caractères pour le SEO
- ✅ Titres intemporels par défaut. Réserve l'année aux actualités datées (changement de visa, nouvelle loi en ${new Date().getFullYear()}). Exemple : «Nouveau visa nomade Thaïlande ${new Date().getFullYear()} : conditions et retours» est OK ; «Bali : guide logement (${new Date().getFullYear()})» ne l'est pas.

${anglesBlock}
⚠️ RÈGLE ABSOLUE - TITRES H2 EN TEXTE PUR :
- ✅ Les titres H2 sont rédigés en texte uniquement — les emojis enrichissent le corps de l'article.
- Les emojis sont autorisés UNIQUEMENT dans le corps du texte (paragraphes, listes)
- Exemples CORRECTS: <h2>Nos recommandations</h2>, <h2>Les erreurs frequentes</h2>, <h2>Limites et biais de cet article</h2>
- ✅ Exemples corrects : <h2>Nos recommandations</h2>, <h2>Ce que la communauté en dit vraiment</h2>

⚠️ INTERDICTION DE RÉPÉTER LE BLOCKQUOTE:
- Le blockquote principal apparaît UNE SEULE FOIS dans l'article
- ✅ Reformule le sujet du post Reddit avec tes propres mots dans le corps de l'article. Exemple : si le titre Reddit est «Best coworking in Chiang Mai?», écris «trouver le bon espace de travail à Chiang Mai» — pas une copie du titre.

${correctionBlock}
🎯 COHÉRENCE TITRE/CONTENU — RÈGLE ANTI-DRIFT:
- Si une DESTINATION PRINCIPALE est spécifiée dans le user message, le titre ET le contenu DOIVENT parler de cette destination.
- Le titre doit contenir le nom de la destination principale.
- Les H2 doivent référencer cette destination quand pertinent.
- Les autres destinations mentionnées dans les commentaires ne sont que des points de comparaison secondaires.
- ✅ Le titre et le contenu ciblent la même destination principale. Exemple : si le titre mentionne «Bali», 80 %+ du contenu parle de Bali — les autres destinations ne sont que des comparaisons brèves.

⚠️ CONTRAINTE CRITIQUE ABSOLUE: Ce site est spécialisé ASIE uniquement. 
- ✅ Cite uniquement des destinations asiatiques : Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour, Cambodge, Laos, Myanmar, Malaisie. Si le témoignage mentionne une destination hors Asie, remplace-la par un équivalent asiatique ou ignore-la.
- Utilise UNIQUEMENT des destinations asiatiques: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
- Si le témoignage mentionne une destination non-asiatique, remplace-la par une destination asiatique équivalente ou ignore-la complètement

🌐 LANGUE : Cf. regle FRANCAIS ci-dessus. Termes techniques anglais courants (coworking, digital nomad, hostel) en italique.
- ✅ Chaque phrase est 100 % français. Les termes techniques anglais courants (coworking, digital nomad, hostel) restent en italique ; tout le reste est traduit.

🚨 GARDE-FOUS (SOURCE OF TRUTH) :
- Chaque fait provient de la source ou du truth pack. Prix non source → formulation qualitative («reste abordable»).
- Chaque chiffre garde le contexte exact de sa source ($50/month coworking → ~46 €/mois pour un espace de coworking).
- Cite uniquement les lieux presents dans le brief. Un lieu non source bloque la publication.
- Chaque section repond a une vraie question du lecteur. SEO before affiliate.
- Separe strictement auteur et communaute. Sections absentes dans le JSON story = ne pas creer.

✍️ STYLE DIRECT : Chaque phrase attaque avec un sujet concret + fait. Teste : si supprimable sans perte d'info, reformule.

🤖 VOIX NATURELLE (rejet si non respecte) :
- Verbes concrets, pas d'abstractions : «Chiang Mai te coute 40 % moins cher que Bali, mais tu perds la plage.»
- H2 factuels, pas de formules creuses : «Le piege du ferry Krabi-Koh Lanta» au lieu de «Ce que les guides ne disent pas»
- Varie les formats : paragraphe fluide, mini-recit, liste comparative. Pas de «Option 1 / Option 2».
- Raconte les pieges comme des scenarios vecus, pas des listes numerotees.
- Montre les tensions concretement : «Le Grab coute 4x le bus, mais il te depose devant la porte a 2h du matin.»


✍️ VOIX D'AUTEUR (OBLIGATOIRE) :
- Écris comme un rédacteur voyage expérimenté qui a un POINT DE VUE, pas comme un assistant qui résume
- Affirme des opinions : "Koh Phi Phi ne vaut pas le détour en 2 semaines" plutôt que "certains voyageurs trouvent que..."
- Varie les structures : un paragraphe analytique, puis un court percutant, puis une liste, puis un dialogue intérieur
- Chaque citation de la source Reddit doit être intégrée avec le LIEN vers le post original fourni dans les données

📋 FAQ OBLIGATOIRE (champ "faq") :
- Génère 4-6 questions/réponses au format HTML <details><summary>...</summary><p>...</p></details>
- Les questions doivent venir des VRAIES interrogations du post Reddit ou de la communauté
- Les réponses doivent être concises (2-3 phrases max), factuelles, et actionables
- Inclure au moins 1 question sur le budget et 1 sur la logistique

📌 CONTRAT DE SORTIE (OBLIGATOIRE AVANT RÉPONSE) :
- Le titre doit rester <= 70 caractères et contenir la destination principale.
- Le maillage interne doit être cohérent et limité (3 à 8 liens maximum), sans ancres tronquées.
- Si une URL Reddit source est fournie, ajoute au moins 1 mention explicite du lien source dans le corps (hors hook).
- Aucun placeholder textuel cassé ne doit apparaître dans la sortie finale.

📍 MARQUEURS OBLIGATOIRES dans "developpement" (HTML comments) :
- <!-- FV:CTA_SLOT reason="..." --> (2-4 emplacements pour widgets affiliés)
- <!-- FV:DIFF_ANGLE --> (avant le paragraphe différenciant)
- <!-- FV:COMMON_MISTAKES --> (avant la section erreurs/pièges)

${editorialBlock}

🚨 RAPPEL CRITIQUE — SECTIONS SERP OBLIGATOIRES DANS "developpement" :
Le champ "developpement" DOIT contenir ces 3 H2 comme dernières sections de contenu (AVANT FAQ/Comparatif/Retenir) :
1. Un H2 avec un angle différenciant SPÉCIFIQUE à cet article. ✅ Exemples : «Pourquoi 3 jours à Chiang Mai changent tout», «Le piège du ferry Krabi-Koh Lanta que personne ne mentionne», «Ce qui change vraiment entre 1 mois et 3 mois à Bali»
2. Un H2 sur les pièges concrets avec un titre NARRATIF. ✅ Exemples : «Quatre décisions qui plombent un séjour en [destination]», «Ce que j'aurais aimé savoir avant de réserver», «Les 3 frais cachés qui grèvent ton budget dès la première semaine»
3. <h2>Limites et biais de cet article</h2> — transparence E-E-A-T, 1-2 paragraphes honnêtes sur les sources utilisées. Cite explicitement le lien Reddit source.
Si tu omets ces 3 sections, l'article sera REJETÉ par le quality gate.`;

    // PHASE 4.2: User message basé sur story, pattern, extracted
    // ENRICHISSEMENT: Extraire les données structurées depuis extracted
    const extractedSignals = extracted.post?.signals || {};
    const extractedComments = extracted.comments || {};
    
    // Formater les données extraites pour le prompt
    const locationsData = extractedSignals.locations?.slice(0, 5).join(', ') || '';
    const datesData = extractedSignals.dates?.slice(0, 3).join(', ') || '';
    const costsData = extractedSignals.costs?.slice(0, 5).join(', ') || '';
    const eventsData = extractedSignals.events?.slice(0, 3).join(', ') || '';
    const problemsData = extractedSignals.problems?.slice(0, 3).join(', ') || '';
    
    // Insights communauté
    const insightsData = extractedComments.insights?.slice(0, 3)
      .map(i => `"${i.value}"`)
      .join(', ') || '';
    
    const warningsData = extractedComments.warnings?.slice(0, 2)
      .map(w => `"${w.value}"`)
      .join(', ') || '';
    
    const consensusData = extractedComments.consensus?.slice(0, 2)
      .map(c => `"${c.value}" (${c.count}x)`)
      .join(', ') || '';

    // Construire la directive de destination principale
    let destinationDirective = '';
    // Détecter si le post Reddit est multi-pays / régional
    // Chercher le titre du post Reddit dans plusieurs sources possibles
    const redditTitle = options.reddit_title || extracted.title || extracted.post?.title || story?.story?.title || extraction?.title || '';
    const titleLowerForRegion = redditTitle.toLowerCase();
    const isRegionalTopic = /southeast asia|south.?east asia|asie du sud|multiple countr|several countr/i.test(titleLowerForRegion) ||
      (redditTitle.match(/\b(thailand|vietnam|indonesia|singapore|philippines|cambodia|malaysia|laos)\b/gi) || []).length >= 2;
    console.log(`   🌏 REGIONAL_DETECTION: title="${redditTitle.substring(0,60)}" isRegional=${isRegionalTopic} mainDest=${mainDestination || 'null'}`);
    
    if (mainDestination && !isRegionalTopic) {
      // Convertir en nom français (thailand → Thaïlande, japan → Japon, etc.)
      const mainDestFR = COUNTRY_DISPLAY_NAMES[mainDestination.toLowerCase()] || mainDestination.charAt(0).toUpperCase() + mainDestination.slice(1);
      destinationDirective = `\n🎯 DESTINATION PRINCIPALE (OBLIGATOIRE): ${mainDestFR}
L'article ENTIER doit parler de cette destination. Le titre, les H2, le contenu, les recommandations et les CTA doivent TOUS référencer cette destination. Les autres destinations ne peuvent être mentionnées que comme comparaisons secondaires ou alternatives brèves.`;
      if (pivotReason) {
        const origDestFR = COUNTRY_DISPLAY_NAMES[originalDestination?.toLowerCase()] || originalDestination;
        destinationDirective += `\n⚠️ PIVOT DE DESTINATION: Le post Reddit original mentionnait "${origDestFR}" mais la communauté a fourni beaucoup plus d'informations exploitables sur "${mainDestFR}". ${pivotReason}. Adapte le titre et le contenu en conséquence pour ${mainDestFR}.`;
      }
      destinationDirective += '\n';
    } else if (isRegionalTopic) {
      destinationDirective = `\n🌏 ARTICLE RÉGIONAL (MULTI-PAYS): Cet article couvre PLUSIEURS pays d'Asie du Sud-Est.
- Le titre et la conclusion doivent mentionner "Asie du Sud-Est" (pas un seul pays).
- Chaque H2 peut couvrir un pays différent (Thaïlande, Vietnam, Indonésie, Philippines, etc.) — c'est souhaité.
- ✅ Répartis les H2 sur plusieurs pays — la diversité géographique est la valeur ajoutée d'un article régional. Exemple : un H2 Thaïlande, un H2 Vietnam, un H2 Indonésie.
- Les recommandations doivent couvrir au moins 2-3 pays différents.\n`;
    }

    const redditSourceUrl = options.reddit_source_url || extracted?.meta?.url || options.article?.link || '';
    const userMessage = `TITRE: ${extracted.title || 'Témoignage Reddit'}
AUTEUR: ${extracted.author || 'auteur Reddit'}
🔗 URL SOURCE REDDIT: ${redditSourceUrl || 'Non disponible'}
${destinationDirective}
📊 PATTERN DÉTECTÉ:
- Type: ${pattern.story_type || 'non spécifié'}
- Thème: ${pattern.theme_primary || 'non spécifié'}
- Charge émotionnelle: ${pattern.emotional_load?.label || 'non spécifiée'}
- Complexité: ${pattern.complexity?.label || 'non spécifiée'}

📍 DONNÉES EXTRAITES (OBLIGATOIRE: intégrer 90% minimum):
${locationsData ? `- Destinations: ${locationsData}` : ''}
${datesData ? `- Dates: ${datesData}` : ''}
${costsData ? `- Coûts: ${costsData}` : ''}
${eventsData ? `- Événements: ${eventsData}` : ''}
${problemsData ? `- Problèmes: ${problemsData}` : ''}
${insightsData ? `- Insights communauté: ${insightsData}` : ''}
${warningsData ? `- Warnings communauté: ${warningsData}` : ''}
${consensusData ? `- Consensus: ${consensusData}` : ''}

📋 ENTITÉS EXTRAITES (à mentionner dans l'article):
${extracted.entities?.length > 0 ? extracted.entities.slice(0, 10).join(', ') : 'Aucune'}

📝 TEXTE COMPLET DU POST REDDIT (source de vérité):
${extracted.post?.clean_text || extracted.source_text || 'Non disponible'}

💬 COMMENTAIRES DÉTAILLÉS (à exploiter):
${extracted.comments_snippets?.length > 0 ? extracted.comments_snippets.slice(0, 5).map((c, i) => `${i+1}. ${c}`).join('\n') : 'Aucun commentaire disponible'}

📖 SQUELETTE NARRATIF (story) — à intégrer dans "developpement", pas en sections H2 séparées:
${storyContext ? `CONTEXTE: ${storyContext}` : 'CONTEXTE: null (section absente)'}
${storyCentralEvent ? `ÉVÉNEMENT CENTRAL: ${storyCentralEvent}` : 'ÉVÉNEMENT CENTRAL: null (section absente)'}
${storyCriticalMoment ? `MOMENT CRITIQUE: ${storyCriticalMoment}` : 'MOMENT CRITIQUE: null (section absente)'}
${storyResolution ? `RÉSOLUTION: ${storyResolution}` : 'RÉSOLUTION: null (section absente)'}
${storyAuthorLessons.length > 0 ? `LEÇONS AUTEUR (${storyAuthorLessons.length}):\n${storyAuthorLessons.map((l, i) => `${i+1}. ${l}`).join('\n')}` : 'LEÇONS AUTEUR: [] (section absente)'}
${storyCommunityInsights.length > 0 ? `INSIGHTS COMMUNAUTÉ (${storyCommunityInsights.length}):\n${storyCommunityInsights.map((i, idx) => `${idx+1}. ${i}`).join('\n')}` : 'INSIGHTS COMMUNAUTÉ: [] (section absente)'}
${storyOpenQuestions.length > 0 ? `QUESTIONS OUVERTES (${storyOpenQuestions.length}):\n${storyOpenQuestions.map((q, idx) => `${idx+1}. ${q}`).join('\n')}` : 'QUESTIONS OUVERTES: [] (section absente)'}

📝 CITATIONS DISPONIBLES (depuis evidence):
${availableCitations.length > 0 ? availableCitations.map((c, i) => `${i+1}. "${c}"`).join('\n') : 'Aucune citation disponible'}
${redditSourceUrl ? `\n🔗 IMPORTANT: Chaque citation Reddit dans l'article DOIT être suivie d'un lien vers le post source : <a href="${redditSourceUrl}" target="_blank" rel="noopener">voir la discussion originale</a>. Au minimum, place ce lien UNE FOIS dans l'introduction et UNE FOIS en conclusion.` : ''}

${options.angle ? `
🎯 ANGLE EDITORIAL STRATEGIQUE (Angle Hunter v${options.angle.angle_version}):
- Tension centrale: ${options.angle.primary_angle.tension}
- Type d'angle: ${options.angle.primary_angle.type}
- Hook stratégique: ${options.angle.primary_angle.hook}
- Enjeu lecteur: ${options.angle.primary_angle.stake}
- Vecteur émotionnel: ${options.angle.emotional_vector}
- Friction affiliation (moment): ${options.angle.business_vector.affiliate_friction?.moment || 'aucune'}
- Friction affiliation (coût d'erreur): ${options.angle.business_vector.affiliate_friction?.cost_of_inaction || 'aucun'}
- Module affilié suggéré: ${options.angle.business_vector.affiliate_friction?.resolver || 'aucun'}
- Positionnement concurrent: ${options.angle.competitive_positioning}
- Signaux source: ${options.angle.source_facts.join(', ')}

TON ARTICLE ENTIER DOIT ORBITER AUTOUR DE CETTE TENSION. Chaque H2 doit y contribuer.

🔑 MOTS-CLÉS DU HOOK DANS L'INTRO (OBLIGATOIRE) : Les 2 premiers paragraphes (<p>) de l'article DOIVENT reprendre au moins 3 mots significatifs du hook stratégique ci-dessus (ex: si le hook parle d'"arbitrage", "confort", "optimiser" → ces mots ou leurs dérivés doivent apparaître dans l'intro). Le lecteur doit reconnaître immédiatement la tension annoncée.
` : ''}
${(() => {
  const tp = buildPromptTruthPack(extracted, story);
  if (tp.isPoor) {
    return `📋 CONTRAINTES FACTUELLES : Aucun chiffre source precis disponible. Utilise des formulations qualitatives (des frais, des dizaines d'euros, plusieurs jours) sans inventer de montants. Lieux autorises : ${tp.allowedLocations.join(', ') || 'ceux mentionnes dans les donnees ci-dessus'}.
Ne mentionne aucun lieu absent de cette liste.`;
  }
  return `📋 CONTRAINTES FACTUELLES :
- Nombres autorises : ${tp.allowedNumbers.join(', ')}
- Lieux autorises : ${tp.allowedLocations.join(', ')}${tp.allowedDurations.length > 0 ? '\n- Durees/distances autorisees : ' + tp.allowedDurations.join(', ') : ''}
- Tous les chiffres, lieux et durees de l\'article doivent provenir de ces listes. Si tu as besoin de plus de contenu, approfondis les analyses et arbitrages.`;
})()}

📐 RAPPEL LONGUEUR : Ton champ "developpement" doit contenir au minimum 6 sections H2 avec chacune 2-3 paragraphes denses. Chaque section doit introduire un arbitrage, un cout, un risque ou un trade-off — pas de paragraphe purement descriptif.

⚠️ RAPPEL CRITIQUE: Intègre TOUT dans "developpement" avec des titres H2 NARRATIFS uniques. Utilise les données non-null du squelette narratif comme matière première, PAS comme structure de sections.

🚨 H2 RÉSERVÉS AU SYSTÈME (seront supprimés si générés — utilise des titres narratifs à la place) :
- "Contexte", "Événement central", "Moment critique", "Résolution"
- "Chronologie de l'expérience", "Risques et pièges réels", "Conseils pratiques"
- "Ce que la communauté apporte", "Ce que l'auteur retient"
- "Ce que les témoignages Reddit ne disent pas explicitement"
- "Erreurs fréquentes à éviter", "Leçons clés pour les nomades numériques"

Chaque H2 doit être UNIQUE et refléter l'angle spécifique de CET article.`;

    console.log(`📏 Taille system: ${systemMessage.length} caractères`);
    console.log(`📏 Taille user: ${userMessage.length} caractères`);
    
    
    // DEBUG: Afficher les données disponibles
    console.log(`\n🔍 DEBUG DONNÉES DISPONIBLES POUR LE LLM:`);
    console.log(`   📍 Locations: ${locationsData || 'VIDE'}`);
    console.log(`   📅 Dates: ${datesData || 'VIDE'}`);
    console.log(`   💰 Coûts: ${costsData || 'VIDE'}`);
    console.log(`   🎯 Événements: ${eventsData || 'VIDE'}`);
    console.log(`   ⚠️  Problèmes: ${problemsData || 'VIDE'}`);
    console.log(`   💬 Insights: ${insightsData || 'VIDE'}`);
    console.log(`   🚨 Warnings: ${warningsData || 'VIDE'}`);
    console.log(`   ✅ Consensus: ${consensusData || 'VIDE'}`);
    console.log(`   📖 Story Context: ${storyContext ? storyContext.substring(0, 80) + '...' : 'NULL'}`);
    console.log(`   📖 Story Lessons: ${storyAuthorLessons.length} leçons`);
    console.log(`   📖 Story Insights: ${storyCommunityInsights.length} insights`);
    console.log(`   📖 Story Questions: ${storyOpenQuestions.length} questions\n`);

    const responseData = await callOpenAIWithRetry({
      apiKey: this.apiKey,
      provider: LLM_PROVIDER,
      _trackingStep: 'generator-evergreen',
      body: {
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 12000,
      temperature: 0.7,
      ...(LLM_PROVIDER === 'openai' && { response_format: { type: "json_object" } })
      },
      sourceText: (Array.isArray(extraction.citations) ? extraction.citations.join(' ') : (extraction.citations || '')) || userMessage,
      article: extracted, // Utiliser extracted comme article pour compatibilité
      type: 'generation'
    });

    // Vérifier que la réponse contient du contenu
    if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message || !responseData.choices[0].message.content) {
      throw new Error('Réponse LLM invalide: contenu manquant (generateFinalArticle)');
    }
    
    const rawContent = responseData.choices[0].message.content;
    const finishReason = responseData.choices[0].finish_reason;
    if (finishReason === 'length') {
      console.warn('⚠️ Réponse LLM tronquée (finish_reason=length) dans generateFinalArticle - Tentative de réparation JSON');
    }
    
    
    const content = safeJsonParse(rawContent, 'generateFinalArticle_response');
    console.log('✅ Article final généré:', Object.keys(content));
    
    // DIAGNOSTIC LOGS: Identifier les problèmes de génération
    console.log(`\n📊 DIAGNOSTIC GÉNÉRATION LLM:`);
    console.log(`   📦 JSON reçu: ${rawContent.length} caractères`);
    console.log(`   🏁 finish_reason: ${finishReason} ${finishReason === 'length' ? '⚠️ TRONQUÉ!' : '✅'}`);
    if (content.article) {
      console.log(`   📝 Champs article: ${Object.keys(content.article).join(', ')}`);
      console.log(`   📖 developpement: ${content.article.developpement ? `✅ ${content.article.developpement.length} chars` : '❌ ABSENT'}`);
      console.log(`   📋 contexte: ${content.article.contexte ? `${content.article.contexte.length} chars` : 'absent'}`);
      console.log(`   📋 recommandations: ${content.article.recommandations ? `${content.article.recommandations.length} chars` : 'absent'}`);
      console.log(`   📋 ce_qu_il_faut_retenir: ${content.article.ce_qu_il_faut_retenir ? `${content.article.ce_qu_il_faut_retenir.length} chars` : 'absent'}`);
    } else {
      console.log(`   ❌ content.article: ABSENT - structure JSON incorrecte`);
    }
    console.log('');
    
    // PHASE 4.1.4: NETTOYAGE IMMÉDIAT des titres H2 incorrects dans le JSON
    if (content.article) {
      console.log('🧹 Nettoyage des titres H2 incorrects dans le JSON...');
      // Nettoyer evenement_central
      if (content.article.evenement_central) {
        // Supprimer tous les H2, y compris ceux avec anglais
        content.article.evenement_central = content.article.evenement_central.replace(/<h2[^>]*>.*?<\/h2>/gi, '').trim();
        // Supprimer aussi les titres sans H2 qui contiennent "Événement central" avec anglais
        content.article.evenement_central = content.article.evenement_central.replace(/Événement central[^\n]*/gi, '').trim();
      }
      // Nettoyer ce_que_les_autres_ne_disent_pas
      if (content.article.ce_que_les_autres_ne_disent_pas) {
        // Supprimer tous les H2, y compris "What Reddit testimonials don't explicitly say"
        content.article.ce_que_les_autres_ne_disent_pas = content.article.ce_que_les_autres_ne_disent_pas.replace(/<h2[^>]*>.*?<\/h2>/gi, '').trim();
        // Supprimer aussi les titres sans H2
        content.article.ce_que_les_autres_ne_disent_pas = content.article.ce_que_les_autres_ne_disent_pas.replace(/What\s+Reddit\s+testimonials?\s+don[''\u2019]?t\s+explicitly\s+say[^\n]*/gi, '').trim();
      }
      // Nettoyer moment_critique
      if (content.article.moment_critique) {
        // Supprimer tous les H2, y compris "Critical Moment"
        content.article.moment_critique = content.article.moment_critique.replace(/<h2[^>]*>.*?<\/h2>/gi, '').trim();
        // Supprimer aussi les titres sans H2
        content.article.moment_critique = content.article.moment_critique.replace(/Critical\s+Moment[^\n]*/gi, '').trim();
      }
    }
    
    // PHASE 4.1.5: TRADUCTION FORCÉE du JSON (bulk = 1 appel LLM)
    if (content.article) {
      const toTranslate = [];
      const keys = [];
      for (const [key, value] of Object.entries(content.article)) {
        if (typeof value === 'string' && value.length > 20) {
          const englishDetection = this.detectEnglishContent(value);
          if (englishDetection.isEnglish && englishDetection.ratio > 0.3) {
            toTranslate.push(value);
            keys.push(key);
          }
        }
      }
      if (toTranslate.length > 0) {
        console.log(`🌐 Traduction bulk de ${toTranslate.length} champ(s) JSON...`);
        const translated = await this.translateBulkToFrench(toTranslate);
        translated.forEach((t, i) => { if (keys[i]) content.article[keys[i]] = t; });
      }
    }
    
    // PHASE 4.2: Reconstruire le contenu final à partir de la structure "FlashVoyage Premium"
    if (content.article) {
      const article = content.article;
      
      // Construire le contenu dans l'ordre strict de la structure obligatoire
      // ORDRE ABSOLU : Quick Guide → Contexte → Événement central → Moment critique → Résolution
      const sections = [];
      
      // 0. Quick Guide (OPTIONNEL - seulement si vraiment nécessaire)
      // APPROCHE EXPERT CONTENT WRITER : Le quick-guide doit être intégré dans le récit narratif, pas isolé
      let quickGuideText = article.quick_guide?.trim() || '';
      
      // Si le LLM n'a pas généré de quick-guide, ne pas en créer un automatiquement
      // Les informations seront intégrées dans le récit narratif
      if (quickGuideText) {
        const englishDetection = this.detectEnglishContent(quickGuideText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Quick Guide" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          quickGuideText = await this.translateToFrench(quickGuideText);
      }
      
        // S'assurer que le Quick Guide a le bon format HTML s'il est présent
      if (!quickGuideText.includes('<div class="quick-guide">') && !quickGuideText.includes('<h3>Points clés')) {
        sections.push(`<div class="quick-guide">\n<h3>Points clés de ce témoignage</h3>\n${quickGuideText}\n</div>`);
      } else {
        sections.push(quickGuideText);
      }
        console.log('   ✅ Quick Guide ajouté (généré par LLM)');
      } else {
        console.log('   ℹ️ Quick Guide optionnel : non généré, informations intégrées dans le récit narratif');
      }
      
      
      if (article.developpement && article.developpement.trim()) {
        // Option B : un seul bloc développement + recommandations + verdict + signature (sans fallbacks)
        console.log('   ✅ FORMAT: Option B détecté (developpement présent)');
        // #region agent log
        const brokenInLLM = (article.developpement.match(/[a-zà-ÿ]{3,}\s+[àâäéèêëïîôùûüÿ][a-zà-ÿ]+/gi) || []);
        fetch('http://127.0.0.1:7901/ingest/6e314725-9b46-4c28-8b38-06554a24d929',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'intelligent-content-analyzer-optimized.js:1800',message:'H1: broken accents in raw LLM developpement output',data:{count:brokenInLLM.length,samples:brokenInLLM.slice(0,15)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        let devHtml = article.developpement.trim();
        // Nettoyer les wrappers markdown ```html...``` que le LLM peut ajouter
        devHtml = devHtml.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        const englishDetection = this.detectEnglishContent(devHtml);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log('   🌐 Champ "développement" détecté en anglais: traduction...');
          devHtml = await this.translateToFrench(devHtml);
          // #region agent log
          const brokenAfterTranslate = (devHtml.match(/[a-zà-ÿ]{3,}\s+[àâäéèêëïîôùûüÿ][a-zà-ÿ]+/gi) || []);
          fetch('http://127.0.0.1:7901/ingest/6e314725-9b46-4c28-8b38-06554a24d929',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'intelligent-content-analyzer-optimized.js:1810',message:'H3: broken accents AFTER translateToFrench',data:{count:brokenAfterTranslate.length,samples:brokenAfterTranslate.slice(0,15)},timestamp:Date.now(),hypothesisId:'H3-translate'})}).catch(()=>{});
          // #endregion
        }
        devHtml = await this.translateBlockquotesInText(devHtml);        sections.push(devHtml);
        // --- Sections conditionnelles selon le mode éditorial ---
        if (editorialMode === 'news') {
          // MODE NEWS : pas de recommandations obligatoires, "a_retenir" au lieu de "ce_qu_il_faut_retenir"
          if (article.recommandations && article.recommandations.trim()) {
            // Recommandations optionnelles en NEWS (si le LLM les a generees)
            let recoText = article.recommandations.trim();
            const engReco = this.detectEnglishContent(recoText);
            if (engReco.isEnglish && engReco.ratio > 0.1) recoText = await this.translateToFrench(recoText);
            sections.push(recoText);
          }
          // a_retenir (NEWS) ou ce_qu_il_faut_retenir (fallback)
          const retenirField = article.a_retenir || article.ce_qu_il_faut_retenir || '';
          if (retenirField.trim()) {
            let retenirText = retenirField.trim();
            if (!retenirText.includes('<h2>')) sections.push(`<h2>À retenir</h2>\n${retenirText}`);
            else sections.push(retenirText);
          } else {
            sections.push(`<h2>À retenir</h2>\n<ul><li>Les points clés de cette actualité</li></ul>`);
          }
        } else {
          // MODE EVERGREEN : recommandations + ce_qu_il_faut_retenir obligatoires
          if (article.recommandations && article.recommandations.trim()) {
            let recoText = article.recommandations.trim();
            const engReco = this.detectEnglishContent(recoText);
            if (engReco.isEnglish && engReco.ratio > 0.1) recoText = await this.translateToFrench(recoText);
            sections.push(recoText);
          } else {
            console.warn('   ⚠️ Recommandations absentes - ajout minimal');
            sections.push(`<h2>Nos recommandations : Par où commencer ?</h2>\n<p>Nous recommandons de privilégier l'Asie du Sud-Est pour un budget maîtrisé.</p>`);
          }
          // FAQ section (FIX: was missing in Option B path)
          if (article.faq && article.faq.trim()) {
            let faqText = article.faq.trim();
            if (!faqText.includes('<h2>')) faqText = `<h2 class="wp-block-heading">Questions fréquentes</h2>\n${faqText}`;
            sections.push(faqText);
            console.log(`   ✅ FAQ intégrée Option B (${(faqText.match(/<details/g) || []).length} questions)`);
          }
          if (article.ce_qu_il_faut_retenir && article.ce_qu_il_faut_retenir.trim()) {
            let retenirText = article.ce_qu_il_faut_retenir.trim();
            if (!retenirText.includes('<h2>')) sections.push(`<h2>Ce qu'il faut retenir</h2>\n${retenirText}`);
            else sections.push(retenirText);
          } else {
            sections.push(`<h2>Ce qu'il faut retenir</h2>\n<p>Résume les points clés et rappelle les outils utiles (eSIM, assurance, vols). Propose une note d'action au lecteur.</p>`);
          }
          if (article.quick_card_html && article.quick_card_html.trim()) {
            sections.push(article.quick_card_html.trim());
            console.log('   ✅ Quick-reference card intégrée');
          }
        }
        if (article.signature && article.signature.trim()) sections.push(article.signature);
        } else {
      // FALLBACK: Le LLM n'a pas renvoyé "developpement" — fusionner les anciens champs dans un seul bloc
      console.warn('   ⚠️ FORMAT: developpement ABSENT — fusion des anciens champs en un seul bloc');
      // MERGE FALLBACK: Concaténer tous les anciens champs non-vides dans un seul bloc
      const oldFieldsToMerge = ['contexte', 'evenement_central', 'moment_critique', 'resolution'];
      const mergedParts = [];
      for (const field of oldFieldsToMerge) {
        if (article[field] && article[field].trim()) {
          let text = article[field].trim();
          // Traduire si nécessaire
          const engDetect = this.detectEnglishContent(text);
          if (engDetect.isEnglish && engDetect.ratio > 0.1) {
            console.log(`   🌐 Champ "${field}" en anglais: traduction...`);
            text = await this.translateToFrench(text);
          }
          text = await this.translateBlockquotesInText(text);
          // Supprimer les H2 template du contenu fusionné
          text = text.replace(/<h2[^>]*>(Contexte|Événement central|Moment critique|Résolution)[^<]*<\/h2>/gi, '').trim();
          if (text) mergedParts.push(text);
          console.log(`   ✅ Champ "${field}" fusionné (${text.length} chars)`);
        }
      }
      // Fusionner aussi les champs analytiques s'ils existent
      for (const field of ['ce_que_les_autres_ne_disent_pas', 'erreurs_frequentes']) {
        if (article[field] && article[field].trim()) {
          let text = article[field].trim();
          text = text.replace(/<h2[^>]*>.*?<\/h2>/gi, '').trim();
          const engDetect = this.detectEnglishContent(text);
          if (engDetect.isEnglish && engDetect.ratio > 0.1) text = await this.translateToFrench(text);
          if (text) mergedParts.push(text);
        }
      }
      if (mergedParts.length > 0) {
        sections.push(mergedParts.join('\n\n'));
        console.log(`   ✅ ${mergedParts.length} ancien(s) champ(s) fusionné(s) dans le développement`);
      }
      // Recommandations + verdict — conditionné par mode éditorial
      if (editorialMode === 'news') {
        if (article.recommandations && article.recommandations.trim()) {
          let recoText = article.recommandations.trim();
          const engReco = this.detectEnglishContent(recoText);
          if (engReco.isEnglish && engReco.ratio > 0.1) recoText = await this.translateToFrench(recoText);
          sections.push(recoText);
        }
        const retenirField = article.a_retenir || article.ce_qu_il_faut_retenir || '';
        if (retenirField.trim()) {
          let retenirText = retenirField.trim();
          if (!retenirText.includes('<h2>')) sections.push(`<h2>À retenir</h2>\n${retenirText}`);
          else sections.push(retenirText);
        }
      } else {
        if (article.recommandations && article.recommandations.trim()) {
          let recoText = article.recommandations.trim();
          const engReco = this.detectEnglishContent(recoText);
          if (engReco.isEnglish && engReco.ratio > 0.1) recoText = await this.translateToFrench(recoText);
          sections.push(recoText);
        } else {
          sections.push(`<h2>Nos recommandations : Par où commencer ?</h2>\n<p>Nous recommandons de privilégier l'Asie du Sud-Est pour un budget maîtrisé.</p>`);
        }
        // FAQ section (nouveau champ obligatoire)
        if (article.faq && article.faq.trim()) {
          let faqText = article.faq.trim();
          if (!faqText.includes('<h2>')) faqText = `<h2 class="wp-block-heading">Questions fréquentes</h2>\n${faqText}`;
          sections.push(faqText);
          console.log(`   ✅ FAQ intégrée (${(faqText.match(/<details/g) || []).length} questions)`);
        }

        if (article.ce_qu_il_faut_retenir && article.ce_qu_il_faut_retenir.trim()) {
          let retenirText = article.ce_qu_il_faut_retenir.trim();
          if (!retenirText.includes('<h2>')) sections.push(`<h2>Ce qu'il faut retenir</h2>\n${retenirText}`);
          else sections.push(retenirText);
        } else {
          sections.push(`<h2>Ce qu'il faut retenir</h2>\n<p>Les points clés de cet article et les outils utiles (eSIM, assurance, vols).</p>`);
        }
        if (article.quick_card_html && article.quick_card_html.trim()) {
          sections.push(article.quick_card_html.trim());
          console.log('   ✅ Quick-reference card intégrée');
        }
      }
      // Signature
      if (article.signature && article.signature.trim()) sections.push(article.signature);
      }
      
      let htmlContent = sections.filter(Boolean).join('\n\n');
      
      // NETTOYAGE MARKDOWN: Supprimer les wrappers ```html...``` du LLM
      htmlContent = htmlContent.replace(/```(?:html)?\s*\n?/g, '');
      
      // GARDE-FOU CRITIQUE : Vérifier que l'article a du contenu réel
      const textOnly = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const textLength = textOnly.length;
      console.log(`📏 ASSEMBLAGE: ${sections.length} section(s), ${htmlContent.length} chars HTML, ${textLength} chars texte`);
      
      if (textLength < 500) {
        console.error(`❌ ARTICLE VIDE DÉTECTÉ: seulement ${textLength} caractères de texte (minimum: 500)`);
        console.error(`   📋 Sections assemblées: ${sections.length}`);
        console.error(`   📋 Champs JSON reçus: titre=${!!article.titre}, developpement=${!!article.developpement}, contexte=${!!article.contexte}`);
        throw new Error(`EMPTY_ARTICLE_GUARD: Article trop court (${textLength} chars < 500 minimum). Le JSON LLM était probablement tronqué. Vérifier max_tokens et finish_reason.`);
      }

      // GARDE LONGUEUR EVERGREEN : expansion automatique si trop court
      if (editorialMode === 'evergreen') {
        const wordCount = textOnly.split(/\s+/).filter(w => w.length > 0).length;
        console.log(`📏 EVERGREEN WORD COUNT: ${wordCount} mots`);
        
        // PHASE 2.1b: Injecter truth pack + extracted dans options pour l'expansion
        if (!options._truthPack) options._truthPack = buildPromptTruthPack(extracted, story);
        if (!options._extracted) options._extracted = extracted;

        // SERP SAFETY NET: injecter les sections SERP manquantes comme squelettes
        const serpSections = [
          { pattern: /ce que les autres.*?ne disent|angle.*?différenci|piège.*?personne|guide.*?oubli/i, label: 'Angle différenciant' },
          { pattern: /erreurs?\s*(fréquentes?|courantes?|à\s*éviter|qui\s*co[uû]tent)|décisions?\s*qui\s*plomb|aimé\s*savoir/i, label: 'Pièges/Erreurs' }
        ];
        const missingSerpSections = serpSections.filter(s => !s.pattern.test(htmlContent));
        if (missingSerpSections.length > 0) {
          console.log(`⚠️ SERP_SAFETY_NET: ${missingSerpSections.length}/2 section(s) SERP manquante(s) — le générateur devra les produire`);
          missingSerpSections.forEach(s => console.log(`   ⚠️ Manquant: "${s.label}"`));
        }

        // PHASE 2.2 / P8: Skip expansion si déjà suffisant (>2200 mots)
        // Autoriser plus de passes si l'article est tres court pour atteindre 2500
        const expansionThreshold = 2200;
        const MAX_EXPANSION_PASSES = wordCount >= expansionThreshold ? 0 : wordCount < 1200 ? 3 : wordCount < 1800 ? 2 : 1;
        
        if (wordCount >= expansionThreshold && wordCount < 2500) {
          console.log(`📏 EVERGREEN ${wordCount} mots (>= ${expansionThreshold}): expansion skip, contenu suffisamment dense.`);
        }
        if (wordCount < 2500 && MAX_EXPANSION_PASSES > 0) {
          console.log(`⚠️ EVERGREEN trop court (${wordCount} < 2500 mots). Lancement passe d'expansion LLM (max ${MAX_EXPANSION_PASSES})...`);
          let currentWords = wordCount;
          for (let pass = 1; pass <= MAX_EXPANSION_PASSES && currentWords < 2500; pass++) {
            try {
              console.log(`📐 Passe d'expansion ${pass}/${MAX_EXPANSION_PASSES} (${currentWords} mots actuels)...`);
              htmlContent = await this.expandEvergreenContent(htmlContent, extraction, options);
              const expandedText = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              const expandedWords = expandedText.split(/\s+/).filter(w => w.length > 0).length;
              console.log(`📏 APRÈS EXPANSION ${pass}: ${expandedWords} mots (delta: +${expandedWords - currentWords})`);
              if (expandedWords <= currentWords) {
                console.log(`   ℹ️ Pas d'amélioration, arrêt des passes d'expansion`);
                break;
              }
              currentWords = expandedWords;
            } catch (expandError) {
              console.warn(`⚠️ Expansion EVERGREEN passe ${pass} échouée: ${expandError.message}. Continuation.`);
              break;
            }
          }
        }
      }

      // NETTOYAGE IMMÉDIAT AVANT POST-PROC 0 : Nettoyer les titres "Événement central" avec contenu supplémentaire
      // (au cas où un H2 avec le titre incorrect serait présent dans le JSON)
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central[^<]*<\/h2>/gi, (match) => {
        const titleContent = match.replace(/<h2[^>]*>|<\/h2>/gi, '').trim();
        if (titleContent !== 'Événement central') {
          console.log(`🔧 NETTOYAGE IMMÉDIAT: Titre "Événement central" avec contenu supplémentaire détecté: "${titleContent}" → nettoyage`);
          return '<h2>Événement central</h2>';
        }
        return match;
      });
      
      // POST-PROCESSING 0 : NETTOYAGE IMMÉDIAT des titres avec anglais (AVANT tous les autres post-processings)
      // Décoder TOUTES les entités HTML dans le HTML complet pour faciliter le matching
      // (WordPress encode les entités HTML, donc il faut les décoder avant les post-processings)
      htmlContent = decodeHtmlEntities(htmlContent);
      
      // Nettoyer IMMÉDIATEMENT tous les titres "Événement central" avec de l'anglais
      // APPROCHE AGRESSIVE : Si le titre contient quoi que ce soit après "Événement central", on le nettoie
      // (car le titre correct est juste "Événement central" sans rien d'autre)
      const beforeClean = htmlContent.match(/<h2[^>]*>Événement central[^<]*<\/h2>/gi);
      if (beforeClean) {
        console.log(`🔍 POST-PROC 0: ${beforeClean.length} titre(s) "Événement central" trouvé(s) avant nettoyage:`, beforeClean);
      }
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central[^<]*<\/h2>/gi, (match) => {        // Extraire le contenu du titre (sans les balises H2)
        const titleContent = match.replace(/<h2[^>]*>|<\/h2>/gi, '').trim();
        // APPROCHE AGRESSIVE : Si le titre n'est pas exactement "Événement central", on le nettoie
        // (car le titre correct ne doit contenir QUE "Événement central")
        if (titleContent !== 'Événement central') {
          console.log(`⚠️ POST-PROC 0: Titre "Événement central" avec contenu supplémentaire détecté: "${titleContent}" → nettoyage`);          return '<h2>Événement central</h2>';
        }
        return match;
      });
      const afterClean = htmlContent.match(/<h2[^>]*>Événement central[^<]*<\/h2>/gi);
      if (afterClean) {
        console.log(`🔍 POST-PROC 0: ${afterClean.length} titre(s) "Événement central" trouvé(s) après nettoyage:`, afterClean);
        afterClean.forEach((match, i) => {
          const titleContent = match.replace(/<h2[^>]*>|<\/h2>/gi, '').trim();
          if (titleContent !== 'Événement central') {
            console.log(`   ⚠️ [${i+1}] Titre non nettoyé: "${titleContent}"`);
          }
        });
      }
      // Nettoyer aussi les titres "What Reddit testimonials don't explicitly say"
      // Pattern amélioré pour gérer les apostrophes normales (') et Unicode (U+2019, U+0027)
      htmlContent = htmlContent.replace(/<h2[^>]*>What\s+Reddit\s+testimonials?\s+don[''\u2019]?t\s+explicitly\s+say[^<]*<\/h2>/gi, '<h2>Ce que les témoignages Reddit ne disent pas explicitement</h2>');
      // Nettoyer "Critical Moment"
      htmlContent = htmlContent.replace(/<h2[^>]*>Critical\s+Moment[^<]*<\/h2>/gi, '<h2>Moment critique</h2>');
      // POST-PROCESSING 1 : Supprimer TOUTES les sections "Event" qui contiennent un blockquote AVANT de réorganiser
      // "Event" est TOUJOURS supprimé si la section contient un blockquote (c'est une section générée par editorial-enhancer)
      // Pattern plus flexible pour matcher "Event" avec ou sans espaces, dans différents formats
      let eventMatch;
      const eventRegex = /<h2[^>]*>Event\s*<\/h2>[\s\S]*?(?=<h2[^>]*>|$)/gi;
      while ((eventMatch = eventRegex.exec(htmlContent)) !== null) {
        const fullMatch = eventMatch[0];
        // Si la section contient un blockquote, la supprimer complètement (même s'il y a des widgets après)
        if (fullMatch.includes('<blockquote')) {
          console.log('   🧹 Section "Event" (contient blockquote) supprimée');
          htmlContent = htmlContent.replace(fullMatch, '');
          // Réinitialiser le regex après modification
          eventRegex.lastIndex = 0;
        } else {
          // Sinon, remplacer le titre par "Événement central"
          console.log('   🔄 Section "Event" renommée en "Événement central"');
          htmlContent = htmlContent.replace(/<h2[^>]*>Event\s*<\/h2>/gi, '<h2>Événement central</h2>');
          break; // Une seule fois suffit pour le remplacement
        }
      }
      
      // POST-PROCESSING 1.5 : Quick Guide apres le premier H2 (pas en ouverture)
      // L'intro doit commencer par l'accroche narrative, pas par un bloc technique
      let quickGuideMatch = htmlContent.match(/<div class="quick-guide">[\s\S]*?<\/div>/i);
      const firstH2Match = htmlContent.match(/<h2[^>]*>[\s\S]*?<\/h2>/i);
      
      if (quickGuideMatch && firstH2Match) {
        const quickGuideIndex = htmlContent.indexOf(quickGuideMatch[0]);
        const firstH2Index = htmlContent.indexOf(firstH2Match[0]);
        
        // Si le Quick Guide est avant le premier H2, le deplacer juste apres
        if (quickGuideIndex < firstH2Index) {
          console.log('⚠️ Quick Guide avant le H2 → deplacement apres le premier H2...');
          const quickGuideSection = quickGuideMatch[0];
          htmlContent = htmlContent.replace(quickGuideSection, '').trim();
          const h2End = htmlContent.indexOf(firstH2Match[0]) + firstH2Match[0].length;
          htmlContent = htmlContent.substring(0, h2End) + '\n' + quickGuideSection + '\n' + htmlContent.substring(h2End);
          console.log('   ✅ Quick Guide deplace apres le premier H2');
          quickGuideMatch = htmlContent.match(/<div class="quick-guide">[\s\S]*?<\/div>/i);
        }
      }
      
      // POST-PROCESSING 1.6 : Traduire le Quick Guide s'il contient de l'anglais
      if (quickGuideMatch) {
        const quickGuideSection = quickGuideMatch[0];
        const englishDetection = this.detectEnglishContent(quickGuideSection);
        // Détecter aussi les mots-clés anglais spécifiques du Quick Guide
        const hasEnglishKeywords = /(Duration|Difficulty|Not specified|Malaysia|Ipoh|Backpacking|Medium)/i.test(quickGuideSection);
        if (englishDetection.isEnglish || englishDetection.ratio > 0.05 || hasEnglishKeywords) {
          console.log(`🌐 Quick Guide détecté en anglais (${Math.round(englishDetection.ratio * 100)}%${hasEnglishKeywords ? ', mots-clés anglais' : ''}): traduction...`);
          const translated = await this.translateToFrench(quickGuideSection);
          htmlContent = htmlContent.replace(quickGuideSection, translated);
        }
      }
      
      // POST-PROCESSING 2 : Supprimer TOUS les blockquotes générés par le LLM (editorial-enhancer les ajoutera traduits)
      const blockquotesBefore = (htmlContent.match(/<blockquote[^>]*>.*?<\/blockquote>/gs) || []).length;
      htmlContent = htmlContent.replace(/<blockquote[^>]*>.*?<\/blockquote>/gs, '');
      if (blockquotesBefore > 0) {
        console.log(`🧹 ${blockquotesBefore} blockquote(s) LLM supprimé(s) (editorial-enhancer les réinsérera traduits)`);
      }
      
      // POST-PROCESSING 3 : Intégrer les sections immersives dans le développement
      // Les sections emotions, tags_psychologiques, reecriture_echec, timeline doivent être intégrées dans le contenu
      if (article.emotions && article.emotions.trim()) {
        // Intégrer les émotions dans le contenu (chercher un endroit approprié après une section)
        const emotionsContent = article.emotions.trim();
        const englishDetection = this.detectEnglishContent(emotionsContent);
        let finalEmotions = emotionsContent;
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          finalEmotions = await this.translateToFrench(emotionsContent);
        }
        // Insérer après la première section principale (Contexte ou Événement central)
        const firstH2Match = htmlContent.match(/<h2>([^<]+)<\/h2>[\s\S]*?(?=<h2>|$)/);
        if (firstH2Match) {
          const insertPoint = firstH2Match.index + firstH2Match[0].length;
          htmlContent = htmlContent.substring(0, insertPoint) + '\n\n' + finalEmotions + '\n\n' + htmlContent.substring(insertPoint);
          console.log('   ✅ Sections émotions intégrées dans le développement');
        }
      }
      
      if (article.tags_psychologiques && article.tags_psychologiques.trim()) {
        const tagsContent = article.tags_psychologiques.trim();
        const englishDetection = this.detectEnglishContent(tagsContent);
        let finalTags = tagsContent;
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          finalTags = await this.translateToFrench(tagsContent);
        }
        // Insérer avant "Nos recommandations" ou à la fin d'une section principale
        const recoMatch = htmlContent.indexOf('<h2>🎯 Nos recommandations');
        if (recoMatch > -1) {
          htmlContent = htmlContent.substring(0, recoMatch) + '\n\n' + finalTags + '\n\n' + htmlContent.substring(recoMatch);
          console.log('   ✅ Tags psychologiques intégrés dans le développement');
        }
      }
      
      if (article.reecriture_echec && article.reecriture_echec.trim()) {
        const echecContent = article.reecriture_echec.trim();
        const englishDetection = this.detectEnglishContent(echecContent);
        let finalEchec = echecContent;
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          finalEchec = await this.translateToFrench(echecContent);
        }
        // Insérer avant "Nos recommandations" ou après une section d'erreurs
        const recoMatch = htmlContent.indexOf('<h2>🎯 Nos recommandations');
        if (recoMatch > -1) {
          htmlContent = htmlContent.substring(0, recoMatch) + '\n\n' + finalEchec + '\n\n' + htmlContent.substring(recoMatch);
          console.log('   ✅ Réécriture échec intégrée dans le développement');
        }
      }
      
      if (article.timeline && article.timeline.trim()) {
        const timelineContent = article.timeline.trim();
        const englishDetection = this.detectEnglishContent(timelineContent);
        let finalTimeline = timelineContent;
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          finalTimeline = await this.translateToFrench(timelineContent);
        }
        // Insérer après "Contexte" ou "Événement central"
        const contexteMatch = htmlContent.indexOf('<h2>Contexte</h2>');
        if (contexteMatch > -1) {
          const nextH2 = htmlContent.indexOf('<h2>', contexteMatch + 1);
          const insertPoint = nextH2 > -1 ? nextH2 : htmlContent.length;
          htmlContent = htmlContent.substring(0, insertPoint) + '\n\n' + finalTimeline + '\n\n' + htmlContent.substring(insertPoint);
          console.log('   ✅ Timeline intégrée dans le développement');
        }
      }
      
      // POST-PROCESSING 4 : Remplacer "Questions encore ouvertes" par "Nos recommandations"
      htmlContent = htmlContent.replace(/<h2[^>]*>Questions (encore )?ouvertes[^<]*<\/h2>/gi, '<h2>🎯 Nos recommandations : Par où commencer ?</h2>');
      htmlContent = htmlContent.replace(/Questions (encore )?ouvertes/gi, 'Nos recommandations');
      
      // SUPPRESSION/REMPLACEMENT DE "Questions ouvertes" (interdit)
      if (htmlContent.match(/<h2[^>]*>.*Questions.*ouvertes.*<\/h2>/i)) {
        console.log('⚠️ Section "Questions ouvertes" détectée → suppression...');
        htmlContent = htmlContent.replace(/<h2[^>]*>.*Questions.*ouvertes.*<\/h2>[\s\S]*?(?=<h2>|$)/gi, '');
        console.log('   ✅ Section "Questions ouvertes" supprimée');
      }
      
      // SUPPRESSION/REMPLACEMENT DE "Questions ouvertes" (interdit)
      if (htmlContent.match(/<h2[^>]*>.*Questions.*ouvertes.*<\/h2>/i)) {
        console.log('⚠️ Section "Questions ouvertes" détectée → suppression...');
        htmlContent = htmlContent.replace(/<h2[^>]*>.*Questions.*ouvertes.*<\/h2>[\s\S]*?(?=<h2>|$)/gi, '');
        console.log('   ✅ Section "Questions ouvertes" supprimée');
      }
      
      // POST-PROCESSING 5 : Nettoyer les titres tronqués AVANT la détection de duplication
      // Corriger les titres tronqués
      htmlContent = htmlContent.replace(/<h2>Événement\s*<\/h2>/gi, '<h2>Événement central</h2>');
      htmlContent = htmlContent.replace(/<h2>Moment\s*<\/h2>/gi, '<h2>Moment critique</h2>');
      // Supprimer les sections "Événement" qui sont juste des blockquotes (souvent générées par editorial-enhancer)
      // Si une section "Événement" ne contient qu'un blockquote et pas de texte, la supprimer
      htmlContent = htmlContent.replace(/<h2>Événement<\/h2>\s*<blockquote[^>]*>[\s\S]*?<\/blockquote>\s*(?=<h2>|$)/gi, '');
      // Supprimer les titres en anglais
      htmlContent = htmlContent.replace(/<h2>Event\s*<\/h2>/gi, '<h2>Événement central</h2>');
      htmlContent = htmlContent.replace(/<h2>What Reddit testimonials don'?t explicitly say[^<]*<\/h2>/gi, '<h2>Ce que les témoignages Reddit ne disent pas explicitement</h2>');
      htmlContent = htmlContent.replace(/<h2>Our recommendations:?\s*Where to start\?[^<]*<\/h2>/gi, '<h2>Nos recommandations : Par où commencer ?</h2>');
      htmlContent = htmlContent.replace(/<h2>Limitations and biases[^<]*<\/h2>/gi, '<h2>Limites et biais de ce témoignage</h2>');
      // POST-PROCESSING 5.3 : Traduire TOUS les titres en anglais AVANT la détection de duplication
      // Note: "Event" est déjà traité dans POST-PROCESSING 1
      htmlContent = htmlContent.replace(/<h2[^>]*>What Reddit testimonials don'?t explicitly say[^<]*<\/h2>/gi, '<h2>Ce que les témoignages Reddit ne disent pas explicitement</h2>');
      htmlContent = htmlContent.replace(/<h2[^>]*>Our recommendations:?\s*Where to start\?[^<]*<\/h2>/gi, '<h2>Nos recommandations : Par où commencer ?</h2>');
      htmlContent = htmlContent.replace(/<h2[^>]*>What the community brings[^<]*<\/h2>/gi, '<h2>Ce que la communauté apporte</h2>');

      // POST-PROCESSING 5.5 : Supprimer les sections dupliquées et les sections en anglais
      // Détecter et supprimer les sections avec "(suite)" dans le titre
      htmlContent = htmlContent.replace(/<h2[^>]*>[^<]*\(suite\)[^<]*<\/h2>[\s\S]*?(?=<h2>|$)/gi, '');
      
      // Supprimer les sections avec des titres en anglais (Critical Moment, etc.)
      const englishSectionTitles = [
        /<h2[^>]*>Critical Moment[^<]*<\/h2>/i,
        /<h2[^>]*>Central Event[^<]*<\/h2>/i,
        /<h2[^>]*>Context[^<]*<\/h2>/i,
        /<h2[^>]*>Resolution[^<]*<\/h2>/i
      ];
      for (const pattern of englishSectionTitles) {
        if (htmlContent.match(pattern)) {
          htmlContent = htmlContent.replace(new RegExp(pattern.source + '[\\s\\S]*?(?=<h2>|$)', 'gi'), '');
          console.log(`   🧹 Section anglaise supprimée: ${pattern.source}`);
        }
      }
      
      // Supprimer les sections dupliquées (même titre H2 apparaissant plusieurs fois)
      // Normaliser les variantes (ex: "Événement" = "Événement central")
      const normalizeTitle = (title) => {
        const normalized = title.toLowerCase()
          .replace(/\s*\(suite\)\s*/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        // Variantes à normaliser
        if (normalized === 'événement' || normalized === 'evenement' || normalized === 'event') return 'événement central';
        if (normalized === 'moment') return 'moment critique';
        if (normalized === 'contexte :') return 'contexte';
        if (normalized.includes('limitations') && normalized.includes('biais')) return 'limites et biais de ce témoignage';
        if (normalized.includes('what reddit') && normalized.includes('don\'t')) return 'ce que les témoignages reddit ne disent pas explicitement';
        if (normalized.includes('our recommendations') || normalized.includes('where to start')) return 'nos recommandations : par où commencer ?';
        if (normalized.includes('what the community') && normalized.includes('brings')) return 'ce que la communauté apporte';
        return normalized;
      };
      
      const seenTitles = new Map();
      const sectionsToKeep = [];
      
      // Parser le HTML par sections
      const allSections = htmlContent.split(/(?=<h2[^>]*>)/i);
      for (const section of allSections) {
        const titleMatch = section.match(/<h2[^>]*>([^<]+)<\/h2>/i);
        if (titleMatch) {
          const originalTitle = titleMatch[1].trim();
          const normalizedTitle = normalizeTitle(originalTitle);
          
          if (seenTitles.has(normalizedTitle)) {
            console.log(`   🧹 Section dupliquée supprimée: "${originalTitle}" (normalisé: "${normalizedTitle}")`);
            continue; // Skip cette section dupliquée
          }
          seenTitles.set(normalizedTitle, true);
        }
        sectionsToKeep.push(section);
      }
      htmlContent = sectionsToKeep.join('');
      
      // POST-PROCESSING 6 : Nettoyer les titres de sections qui contiennent des destinations incorrectes
      // Ex: "Contexte : Vietnam" quand l'article parle de Malaisie
      htmlContent = htmlContent.replace(/<h2[^>]*>Contexte\s*:\s*[^<]+<\/h2>/gi, '<h2>Contexte</h2>');
      // Nettoyer les titres "Événement central" avec de l'anglais résiduel (ex: "Événement central : Vietnam : Fatigue setting in, unimpressed")
      // APPROCHE AGRESSIVE : Si le titre contient quoi que ce soit après "Événement central", on le nettoie
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central[^<]*<\/h2>/gi, (match) => {
        const titleContent = match.replace(/<h2[^>]*>|<\/h2>/gi, '').trim();
        // APPROCHE AGRESSIVE : Si le titre n'est pas exactement "Événement central", on le nettoie
        if (titleContent !== 'Événement central') {
          console.log(`⚠️ POST-PROC 6: Titre "Événement central" avec contenu supplémentaire détecté: "${titleContent}" → nettoyage`);
          return '<h2>Événement central</h2>';
        }
        return match;
      });
      // Nettoyer les titres avec de l'anglais résiduel (pattern générique pour autres titres)
      htmlContent = htmlContent.replace(/<h2[^>]*>([^:]+):\s*[^:]+:\s*[A-Z][a-z]+(\s+[a-z]+)*\s*<\/h2>/gi, (match, p1) => {
        // Extraire seulement la partie française avant le premier ":"
        return `<h2>${p1.trim()}</h2>`;
      });
      // Nettoyer les titres qui contiennent des phrases anglaises résiduelles
      htmlContent = htmlContent.replace(/<h2[^>]*>([^<]*)\s+(setting|in|unimpressed|critical|moment|event|central)[^<]*<\/h2>/gi, (match, p1) => {
        // Garder seulement la partie française
        const frenchPart = p1.replace(/:\s*[^:]*$/i, '').trim();
        return `<h2>${frenchPart || 'Événement central'}</h2>`;
      });
      
      // POST-PROCESSING 7 : Détecter et traduire les sections encore en anglais
      // PROTECTION : Sauvegarder les titres H2 "Événement central" avant la traduction
      // Utiliser un placeholder HTML valide qui ne sera pas traduit par le LLM
      const protectedTitles = new Map();
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central[^<]*<\/h2>/gi, (match) => {
        const id = `<h2 data-protected="event-central-${protectedTitles.size}">ÉVÉNEMENT_CENTRAL_PLACEHOLDER</h2>`;
        protectedTitles.set(id, '<h2>Événement central</h2>');
        return id;
      });
      
      const htmlSections = htmlContent.split(/(?=<h2[^>]*>)/i);
      const translatedSections = [];
      for (const section of htmlSections) {
        if (!section.trim()) {
          translatedSections.push(section);
          continue;
        }
        const englishDetection = this.detectEnglishContent(section);
        // Détecter aussi les phrases anglaises isolées (ex: "An overview of his journey reveals...")
        const englishPhrases = section.match(/[A-Z][a-z]+(\s+[a-z]+){3,}/g);
        const hasEnglishPhrases = englishPhrases && englishPhrases.length > 0;
        // Détecter les mots-clés anglais courants dans les sections
        const englishKeywords = /\b(about|advantages|disadvantages|budget|option|essential|may|could|should|underestimating|not budgeting|duration|difficulty|not specified|malaysia|ipoh|the author finds|the author begins|feeling disappointed|thinking about returning|advantage|disadvantage|abundant|higher cost|opportunity|may feel|may lack|enjoy its|affordable cost|potential isolation|ideal island|soothing natural|fewer job|compare (rental|coworking|prices)|explore (activities|local)|realistic monthly|developed infrastructure|international community|active nomad|seasonal pollution|very popular|low cost of living|pleasant climate)\b/gi;
        const hasEnglishKeywords = englishKeywords.test(section);
        // Détecter les patterns anglais spécifiques (ex: "Duration:", "Not specified", "The author finds himself", "Budget:", "Advantage:", "Disadvantage:")
        const englishPatterns = /(Duration|Difficulty|Not specified|Malaysia, Ipoh|The author finds|The author begins|Feeling disappointed|thinking about returning to work|Budget:|Advantage:|Disadvantages?:|May lack|Abundant|Higher cost|Opportunity|May feel|Enjoy its|Affordable cost|Potential isolation|Ideal island|Soothing natural|Fewer job|Compare (rental|coworking|prices)|Explore (activities|local)|Realistic monthly|Developed infrastructure|International community|Active nomad|Seasonal pollution|Very popular)/i;
        const hasEnglishPatterns = englishPatterns.test(section);
        // Détecter les phrases anglaises complètes dans les listes (ex: "Underestimating administrative delays")
        const englishListItems = section.match(/<strong[^>]*>([A-Z][a-z]+(\s+[a-z]+)+)<\/strong>/g);
        const hasEnglishListItems = englishListItems && englishListItems.some(item => {
          const text = item.replace(/<[^>]+>/g, '').trim();
          return /^[A-Z][a-z]+(\s+[a-z]+){2,}$/.test(text) && !text.includes('é') && !text.includes('è') && !text.includes('à');
        });
        
        // Détecter aussi les phrases anglaises dans les <strong> des listes (ex: "Extended stay in Ipoh", "Enjoy the affordable cost")
        const strongEnglishPattern = /<strong[^>]*>([A-Z][a-z]+(\s+[a-z]+){2,})<\/strong>/g;
        const strongMatches = section.match(strongEnglishPattern);
        const hasStrongEnglish = strongMatches && strongMatches.some(match => {
          const text = match.replace(/<[^>]+>/g, '').trim();
          return !/[àâäéèêëïîôùûüÿç]/.test(text) && /^[A-Z][a-z]+(\s+[a-z]+){2,}$/.test(text);
        });
        
        if ((englishDetection.isEnglish && englishDetection.ratio > 0.05) || hasEnglishPhrases || hasEnglishKeywords || hasEnglishPatterns || hasEnglishListItems || hasStrongEnglish) {
          console.log(`🌐 Section détectée en anglais (${Math.round(englishDetection.ratio * 100)}%${hasEnglishPhrases ? ', phrases anglaises' : ''}${hasEnglishKeywords ? ', mots-clés anglais' : ''}${hasStrongEnglish ? ', strong anglais' : ''}): traduction...`);
          let translated = await this.translateToFrench(section);
          // RESTAURATION IMMÉDIATE : Restaurer les titres H2 "Événement central" protégés après chaque traduction
          // Remplacer les placeholders protégés par le titre correct
          translated = translated.replace(/<h2[^>]*data-protected="event-central-\d+"[^>]*>ÉVÉNEMENT_CENTRAL_PLACEHOLDER<\/h2>/gi, '<h2>Événement central</h2>');
          // Remplacer aussi les variantes traduites comme "Event" qui sont dans le contexte de l'événement central
          // (seulement si la section contient le placeholder ou si c'est clairement l'événement central)
          if (section.includes('data-protected="event-central-') || section.includes('ÉVÉNEMENT_CENTRAL_PLACEHOLDER')) {
            translated = translated.replace(/<h2[^>]*>Event[^<]*<\/h2>/gi, '<h2>Événement central</h2>');
            translated = translated.replace(/<h2[^>]*>Événement[^<]*<\/h2>/gi, '<h2>Événement central</h2>');
            translated = translated.replace(/<h2[^>]*>Événement central[^<]*(Fatigue|setting|in|unimpressed|Vietnam)[^<]*<\/h2>/gi, '<h2>Événement central</h2>');
          }
          translatedSections.push(translated);
        } else {
          translatedSections.push(section);
        }
      }
      htmlContent = translatedSections.join('');
      
      // RESTAURATION FINALE : Restaurer les titres H2 "Événement central" protégés (au cas où)
      // Remplacer les placeholders protégés ou les variantes traduites par le titre correct
      htmlContent = htmlContent.replace(/<h2[^>]*data-protected="event-central-\d+"[^>]*>ÉVÉNEMENT_CENTRAL_PLACEHOLDER<\/h2>/gi, '<h2>Événement central</h2>');
      // Remplacer aussi les variantes traduites comme "Event", "Événement", "Événement central : Vietnam : Fatigue setting in, unimpressed"
      htmlContent = htmlContent.replace(/<h2[^>]*>Event[^<]*<\/h2>/gi, '<h2>Événement central</h2>');
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement[^<]*<\/h2>/gi, '<h2>Événement central</h2>');
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central[^<]*(Fatigue|setting|in|unimpressed|Vietnam)[^<]*<\/h2>/gi, '<h2>Événement central</h2>');
      // POST-PROCESSING 8 : Supprimer les sections vides (H2 sans contenu)
      htmlContent = htmlContent.replace(/<h2[^>]*>([^<]+)<\/h2>\s*(?=<h2|$)/gi, (match, title) => {
        // Vérifier si la section suivante commence immédiatement par un autre H2
        const afterMatch = htmlContent.substring(htmlContent.indexOf(match) + match.length);
        if (afterMatch.trim().startsWith('<h2')) {
          console.log(`   🧹 Section vide supprimée: "${title.trim()}"`);
          return ''; // Supprimer la section vide
        }
        return match; // Garder la section si elle a du contenu
      });
      
      // POST-PROCESSING 9 : FORCER la suppression de "Event" et la traduction des titres en anglais (dernière passe)
      // Supprimer "Event" si contient blockquote (même après tous les autres post-processings)
      htmlContent = htmlContent.replace(/<h2[^>]*>Event\s*<\/h2>[\s\S]*?(?=<h2[^>]*>|$)/gi, (match) => {
        if (match.includes('<blockquote')) {
          console.log('   🧹 POST-PROC 9: Section "Event" (blockquote) supprimée');
          return '';
        }
        return match.replace(/<h2[^>]*>Event\s*<\/h2>/gi, '<h2>Événement central</h2>');
      });
      // Nettoyer les titres "Événement central" qui contiennent de l'anglais après (pattern plus flexible)
      // Pattern pour capturer "Événement central : [destination] : [phrase anglaise]" et supprimer toute la section si elle contient un blockquote
      // Pattern amélioré pour capturer toutes les variantes avec anglais (ex: "Fatigue setting in, unimpressed")
      // D'abord, supprimer toute la section si elle contient un blockquote ET de l'anglais dans le titre
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central\s*:\s*[^<]*:[^<]*[A-Z][a-z]+(\s+[a-z]+){1,}[^<]*<\/h2>[\s\S]*?(?=<h2[^>]*>|$)/gi, (match) => {
        if (match.includes('<blockquote')) {
          console.log('   🧹 POST-PROC 9: Section "Événement central" (avec anglais dans titre + blockquote) supprimée');
          return '';
        }
        // Sinon, nettoyer juste le titre en supprimant tout après "Événement central"
        return match.replace(/<h2[^>]*>Événement central\s*:\s*[^<]*:[^<]*[A-Z][a-z]+(\s+[a-z]+){1,}[^<]*<\/h2>/gi, '<h2>Événement central</h2>');
      });
      // Ensuite, nettoyer aussi les cas où il n'y a qu'un seul deux-points mais de l'anglais après
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central\s*:\s*[^<]*[A-Z][a-z]+(\s+[a-z]+){2,}[^<]*<\/h2>/gi, '<h2>Événement central</h2>');
      // Pattern final pour capturer TOUS les cas avec anglais après "Événement central" (détection spécifique de mots anglais)
      // Détecter les mots anglais courants après "Événement central"
      const englishWordsAfterEvent = /(Fatigue|setting|in|unimpressed|Event|What|Our|Critical)/i;
      const beforeEventClean = htmlContent.match(/<h2[^>]*>Événement central[^<]*<\/h2>/gi);      // APPROCHE AGRESSIVE : Si le titre contient quoi que ce soit après "Événement central", on le nettoie
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central[^<]*<\/h2>/gi, (match) => {
        const titleContent = match.replace(/<h2[^>]*>|<\/h2>/gi, '').trim();
        // APPROCHE AGRESSIVE : Si le titre n'est pas exactement "Événement central", on le nettoie
        if (titleContent !== 'Événement central') {
          console.log(`   🧹 POST-PROC 9: Titre "Événement central" avec contenu supplémentaire nettoyé: "${titleContent}"`);          return '<h2>Événement central</h2>';
        }
        return match;
      });
      const afterEventClean = htmlContent.match(/<h2[^>]*>Événement central[^<]*<\/h2>/gi);      // Forcer la traduction des titres en anglais restants (pattern plus flexible pour capturer toutes les variantes)
      // Les entités HTML ont déjà été décodées dans POST-PROC 0, donc on peut utiliser des patterns simples
      htmlContent = htmlContent.replace(/<h2[^>]*>What\s+Reddit\s+testimonials?\s+don'?t\s+explicitly\s+say[^<]*<\/h2>/gi, '<h2>Ce que les témoignages Reddit ne disent pas explicitement</h2>');
      htmlContent = htmlContent.replace(/<h2[^>]*>Our\s+recommendations:?\s*Where\s+to\s+start\?[^<]*<\/h2>/gi, '<h2>Nos recommandations : Par où commencer ?</h2>');
      htmlContent = htmlContent.replace(/<h2[^>]*>What\s+the\s+community\s+brings[^<]*<\/h2>/gi, '<h2>Ce que la communauté apporte</h2>');
      htmlContent = htmlContent.replace(/<h2[^>]*>Critical\s+Moment[^<]*<\/h2>/gi, '<h2>Moment critique</h2>');
      
      // POST-PROCESSING 11 : Traduire les liens en anglais (ex: "Discover the options", "Compare prices")
      const englishLinkPattern = /<a[^>]*>([A-Z][a-z]+(\s+[a-z]+){1,})<\/a>/g;
      let linkMatch;
      const linksToTranslate = [];
      while ((linkMatch = englishLinkPattern.exec(htmlContent)) !== null) {
        const fullMatch = linkMatch[0];
        const textContent = linkMatch[1];
        // Vérifier si c'est vraiment de l'anglais (pas de caractères accentués français)
        if (!/[àâäéèêëïîôùûüÿç]/.test(textContent) && /^[A-Z][a-z]+(\s+[a-z]+){0,}$/.test(textContent) && textContent.length > 3) {
          linksToTranslate.push({ match: fullMatch, text: textContent });
        }
      }
      // Traduire tous les liens détectés
      for (const { match, text } of linksToTranslate) {
        console.log(`🌐 POST-PROC 11: Traduction lien anglais: "${text}"`);
        const translated = await this.translateToFrench(text);
        htmlContent = htmlContent.replace(match, match.replace(text, translated));
      }
      
      // POST-PROCESSING 10 : Forcer la traduction des textes en anglais dans les sections critiques
      // 10.1 : Traduire le Quick Guide s'il contient de l'anglais
      const quickGuideMatchFinal = htmlContent.match(/<div class="quick-guide">[\s\S]*?<\/div>/i);
      if (quickGuideMatchFinal) {
        const quickGuideContent = quickGuideMatchFinal[0];
        const englishInQuickGuide = /(Duration|Budget:\s*Not specified|Difficulty|Type d'expérience:\s*Digital Nomad)/i.test(quickGuideContent);
        if (englishInQuickGuide) {
          console.log('🌐 POST-PROC 10.1: Traduction Quick Guide contenant de l\'anglais...');
          const translated = await this.translateToFrench(quickGuideContent);
          htmlContent = htmlContent.replace(quickGuideContent, translated);
        }
      }
      
      // 10.2 : Traduire les phrases anglaises isolées dans les paragraphes (pattern plus flexible)
      const englishParagraphPattern = /<p[^>]*>([A-Z][a-z]+(\s+[a-z]+){3,}[^<]*?)(\s*Pour en savoir plus|<\/p>)/g;
      let paragraphMatch;
      const paragraphsToTranslate = [];
      while ((paragraphMatch = englishParagraphPattern.exec(htmlContent)) !== null) {
        const fullMatch = paragraphMatch[0];
        const textContent = paragraphMatch[1].trim();
        // Vérifier si c'est vraiment de l'anglais (pas de caractères accentués français, commence par majuscule)
        if (textContent.length > 20 && !/[àâäéèêëïîôùûüÿç]/.test(textContent) && /^[A-Z][a-z]+/.test(textContent)) {
          // Vérifier le ratio de mots anglais
          const words = textContent.split(/\s+/);
          const englishWords = words.filter(w => /^[a-z]+$/i.test(w) && w.length > 2).length;
          if (englishWords / words.length > 0.7) {
            paragraphsToTranslate.push({ match: fullMatch, text: textContent });
          }
        }
      }
      // Traduire tous les paragraphes détectés
      for (const { match, text } of paragraphsToTranslate) {
        console.log(`🌐 POST-PROC 10.2: Traduction phrase anglaise: "${text.substring(0, 60)}..."`);
        const translated = await this.translateToFrench(text);
        htmlContent = htmlContent.replace(match, match.replace(text, translated));
      }
      
      // 10.3 : Traduire les sections "Erreurs courantes" et "Nos recommandations" qui contiennent beaucoup d'anglais
      // Détecter les sections avec H2 "Erreurs courantes" ou "Nos recommandations"
      // Pattern amélioré pour capturer toutes les variantes de "Erreurs courantes"
      const errorsSectionMatch = htmlContent.match(/(<h2[^>]*>(?:Erreurs courantes|Erreurs fréquentes)[^<]*<\/h2>[\s\S]*?)(?=<h2[^>]*>|$)/i);
      if (errorsSectionMatch) {
        const errorsSection = errorsSectionMatch[1];
        // Détecter l'anglais dans les <strong> et dans le texte
        const englishInErrors = /(Underestimating|Not budgeting|Essential for|administrative delays|budgeting for contingencies|check medical coverage)/i.test(errorsSection);
        if (englishInErrors) {
          console.log('🌐 POST-PROC 10.3.1: Traduction section "Erreurs courantes" contenant de l\'anglais...');          // Traduire d'abord les balises <strong> en anglais (pattern amélioré pour capturer plus de cas)
          let translatedSection = errorsSection;
          // Pattern amélioré pour capturer les <strong> avec phrases complètes en anglais (ex: "Underestimating administrative delays")
          // Pattern plus flexible pour capturer même si les balises ont des attributs
          const strongMatches = [...errorsSection.matchAll(/<strong[^>]*>([A-Z][a-z]+(\s+[a-z]+){1,})<\/strong>/g)];          for (const match of strongMatches) {
            const fullMatch = match[0];
            const textContent = match[1];
            // Vérifier si c'est de l'anglais (pas de caractères accentués français, commence par majuscule)
            const isEnglish = !/[àâäéèêëïîôùûüÿç]/.test(textContent) && /^[A-Z][a-z]+(\s+[a-z]+){1,}$/.test(textContent);
            // Vérifier aussi si c'est une phrase anglaise connue (ex: "Underestimating administrative delays")
            const isKnownEnglish = /(Underestimating|Not budgeting|Essential for)/i.test(textContent);
            if (isEnglish || isKnownEnglish) {
              console.log(`   🔄 Traduction <strong>: "${textContent}"`);              const translated = await this.translateToFrench(textContent);              // Échapper les caractères spéciaux pour le remplacement
              const escapedMatch = fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              translatedSection = translatedSection.replace(new RegExp(escapedMatch, 'g'), `<strong>${translated}</strong>`);
            }
          }
          // Traduire aussi les phrases en anglais dans le texte (ex: "Essential for Vietnam, check medical coverage")
          // Pattern plus large pour capturer toutes les phrases en anglais après ":"
          const englishPhrases = translatedSection.match(/:\s*[A-Z][a-z]+(\s+[a-z]+){2,}[^<]*/gi);
          if (englishPhrases) {
            for (const phrase of englishPhrases) {
              // Vérifier si c'est vraiment de l'anglais (pas de caractères accentués français)
              if (!/[àâäéèêëïîôùûüÿç]/.test(phrase) && /Essential|check medical|coverage/i.test(phrase)) {
                const translatedPhrase = await this.translateToFrench(phrase);
                translatedSection = translatedSection.replace(phrase, translatedPhrase);
              }
            }
          }
          // Traduire toute la section si elle contient encore de l'anglais
          // Vérifier d'abord si la section contient encore de l'anglais
          const stillHasEnglish = /(Underestimating|Not budgeting|Essential for|check medical)/i.test(translatedSection);
          let translated = translatedSection;
          if (stillHasEnglish) {
            console.log('   ⚠️ Section contient encore de l\'anglais après traduction partielle, traduction complète...');
            translated = await this.translateToFrench(translatedSection);
          }
          // NETTOYAGE FINAL : Forcer la traduction des balises <strong> avec anglais qui persistent
          const remainingStrongs = translated.match(/<strong[^>]*>(Underestimating|Not budgeting|Essential for)[^<]*<\/strong>/gi);
          if (remainingStrongs) {
            console.log('   ⚠️ Balises <strong> avec anglais persistent, traduction forcée...');
            for (const strongMatch of remainingStrongs) {
              const textMatch = strongMatch.match(/<strong[^>]*>([^<]+)<\/strong>/i);
              if (textMatch) {
                const textContent = textMatch[1];
                const translatedText = await this.translateToFrench(textContent);
                const escapedMatch = strongMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                translated = translated.replace(new RegExp(escapedMatch, 'g'), `<strong>${translatedText}</strong>`);
              }
            }
          }          // Échapper la section originale pour le remplacement
          const escapedSection = errorsSection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          htmlContent = htmlContent.replace(new RegExp(escapedSection, 'g'), translated);
        }
      }
      
      const recommendationsSectionMatch = htmlContent.match(/(<h2[^>]*>Nos recommandations[^<]*<\/h2>[\s\S]*?)(?=<h2[^>]*>|$)/i);
      if (recommendationsSectionMatch) {
        const recommendationsSection = recommendationsSectionMatch[1];
        // Détection améliorée : patterns anglais plus complets incluant #1, #2, #3, phrases complètes
        const englishPatterns = /(Option \d+:|#\d+|Prepare your documents|Stay calm|Use reliable services|Realistic budget:|Advantages?:|Disadvantages?:|can be|Compare prices|Learn more|Check|Book|Find|Get|Search|Select|Choose|Available|Required|Needed|Important|Remember|Note|Tip|Warning)/i;
        const englishInRecommendations = englishPatterns.test(recommendationsSection);
        
        // Vérification supplémentaire : ratio de mots anglais dans la section
        if (!englishInRecommendations) {
          const textContent = recommendationsSection.replace(/<[^>]+>/g, ' ').trim();
          const englishWords = (textContent.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|just|prepare|stay|use|reliable|services|documents|calm|check|book|available|required|needed|important|remember|note|tip|warning)\b/gi) || []).length;
          const totalWords = textContent.split(/\s+/).filter(w => w.length > 0).length;
          const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
          if (englishRatio > 0.30) {
            console.log(`🌐 POST-PROC 10.3.2: Section "Nos recommandations" avec ${Math.round(englishRatio * 100)}% de mots anglais détectés, traduction...`);
            const translated = await this.translateToFrench(recommendationsSection);
            htmlContent = htmlContent.replace(recommendationsSection, translated);
          }
        } else {
          console.log('🌐 POST-PROC 10.3.2: Traduction section "Nos recommandations" contenant de l\'anglais...');
          const translated = await this.translateToFrench(recommendationsSection);
          htmlContent = htmlContent.replace(recommendationsSection, translated);
        }
      }
      
      // 10.3.3 : Traduire la section "Ce que la communauté apporte" si elle contient de l'anglais
      const communitySectionMatch = htmlContent.match(/(<h2[^>]*>Ce que la communauté apporte[^<]*<\/h2>[\s\S]*?)(?=<h2[^>]*>|$)/i);
      if (communitySectionMatch) {
        const communitySection = communitySectionMatch[1];
        // AMÉLIORATION: Détecter TOUT contenu anglais, pas seulement des patterns spécifiques
        const englishDetection = this.detectEnglishContent(communitySection);
        const hasEnglishLiItems = /<li[^>]*>[^<]*\b(great|food|service|amazing|vistas|affordable|loved|consider|interested|culture|architecture|mountain|water|national|park|scenery)\b[^<]*<\/li>/gi.test(communitySection);
        if (englishDetection.isEnglish || hasEnglishLiItems) {
          console.log(`🌐 POST-PROC 10.3.3: Traduction section "Ce que la communauté apporte" (${Math.round(englishDetection.ratio * 100)}% anglais)...`);
          const translated = await this.translateToFrench(communitySection);
          htmlContent = htmlContent.replace(communitySection, translated);
        }
      }
      
      // 10.4 : Traduire les listes avec de l'anglais (ex: "I travel full-time...")
      const listItemsWithEnglish = htmlContent.match(/<li[^>]*>([^<]*"[A-Z][a-z]+[^"]*"[^<]*)<\/li>/g);
      if (listItemsWithEnglish) {
        for (const listItem of listItemsWithEnglish) {
          const textContent = listItem.replace(/<[^>]+>/g, ' ').trim();
          if (textContent.length > 30 && !/[àâäéèêëïîôùûüÿç]/.test(textContent) && /^["']?[A-Z]/.test(textContent)) {
            console.log(`🌐 POST-PROC 10.4: Traduction liste anglaise: "${textContent.substring(0, 60)}..."`);
            const translated = await this.translateToFrench(textContent);
            htmlContent = htmlContent.replace(listItem, listItem.replace(textContent, translated));
          }
        }
      }
      
      // NETTOYAGE FINAL : S'assurer qu'aucun titre avec anglais ne subsiste
      // APPROCHE AGRESSIVE : Si le titre contient quoi que ce soit après "Événement central", on le nettoie
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central[^<]*<\/h2>/gi, (match) => {
        const titleContent = match.replace(/<h2[^>]*>|<\/h2>/gi, '').trim();
        // APPROCHE AGRESSIVE : Si le titre n'est pas exactement "Événement central", on le nettoie
        if (titleContent !== 'Événement central') {
          console.log(`⚠️ NETTOYAGE FINAL: Titre "Événement central" avec contenu supplémentaire détecté: "${titleContent}" → nettoyage`);
          return '<h2>Événement central</h2>';
        }
        return match;
      });
      // Vérifier et nettoyer les titres "What Reddit testimonials"
      htmlContent = htmlContent.replace(/<h2[^>]*>What\s+Reddit\s+testimonials?\s+don[''\u2019]?t\s+explicitly\s+say[^<]*<\/h2>/gi, '<h2>Ce que les témoignages Reddit ne disent pas explicitement</h2>');
      // Vérifier et nettoyer "Critical Moment"
      htmlContent = htmlContent.replace(/<h2[^>]*>Critical\s+Moment[^<]*<\/h2>/gi, '<h2>Moment critique</h2>');
      
      // NETTOYAGE FINAL : Forcer la traduction des balises <strong> avec anglais qui persistent
      const finalStrongsWithEnglish = htmlContent.match(/<strong[^>]*>(Underestimating|Not budgeting|Essential for)[^<]*<\/strong>/gi);
      if (finalStrongsWithEnglish) {
        console.log('⚠️ NETTOYAGE FINAL: Balises <strong> avec anglais détectées, traduction forcée...');
        for (const strongMatch of finalStrongsWithEnglish) {
          const textMatch = strongMatch.match(/<strong[^>]*>([^<]+)<\/strong>/i);
          if (textMatch) {
            const textContent = textMatch[1];
            console.log(`   🔄 Traduction forcée <strong>: "${textContent}"`);
            const translatedText = await this.translateToFrench(textContent);
            const escapedMatch = strongMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            htmlContent = htmlContent.replace(new RegExp(escapedMatch, 'g'), `<strong>${translatedText}</strong>`);
          }
        }
      }
      let finalTitle = article.titre || 'Témoignage Reddit décrypté par FlashVoyages';
      finalTitle = this.convertTitleUSDToEUR(finalTitle);

      const titleTag = article.title_tag || finalTitle.substring(0, 60);

      const finalContent = {
        title: finalTitle,
        title_tag: titleTag,
        content: htmlContent,
        _truthPack: options._truthPack || null
      };
      
      console.log('📄 Contenu final reconstruit (FlashVoyage Premium):', finalContent.title);
      console.log(`   Sections présentes: ${sections.filter(Boolean).length}`);
      return finalContent;
    }
    
    return content;
  }


  // ═══════════════════════════════════════════════════════════════════════
  // FV-108: MICRO-PROMPT PIPELINE (replaces single mega-prompt)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * STEP 1/4: Generate the cinematic hook opening + context paragraph.
   * Short focused prompt, max_tokens: 1500.
   */
  /**
   * Generate an SEO-optimized title for the article using the LLM.
   * Returns { titre, title_tag }.
   */
  async generateSEOTitle(extracted, story, options = {}) {
    const mainDestination = options.main_destination || null;
    const mainDestFR = mainDestination ? (COUNTRY_DISPLAY_NAMES[mainDestination.toLowerCase()] || mainDestination) : '';
    const redditTitle = extracted.title || '';
    const angle = options.angle?.primary_angle?.tension || '';

    const systemPrompt = `Tu es un expert SEO voyage pour FlashVoyages. Génère un titre H1 et un title_tag SEO pour un article basé sur un témoignage Reddit.

RÈGLES :
- Le titre H1 (60-80 caractères) doit être accrocheur, contenir la destination principale et un angle éditorial fort.
- Le title_tag (50-60 caractères MAX) est optimisé pour Google : mot-clé principal en tête, distinct du H1.
- Langue : 100% français. Zéro anglais. Montants en euros.
- NE JAMAIS utiliser "Témoignage Reddit" ou "décrypté" dans le titre.
- Le titre doit donner envie de cliquer : tension, chiffre concret, ou promesse de valeur.

EXEMPLES :
- H1 : «Thaïlande : pourquoi ton budget de 50 €/jour ne suffira pas»
  title_tag : «Budget Thaïlande : coût réel et pièges à éviter»
- H1 : «Bali en couple : l'itinéraire que personne ne recommande (et qui marche)»
  title_tag : «Itinéraire Bali couple : guide alternatif et budget»
- H1 : «Japon 3 semaines : le vrai coût quand on sort des sentiers battus»
  title_tag : «Japon 3 semaines budget réel : guide complet»

Réponds UNIQUEMENT en JSON : { "titre": "...", "title_tag": "..." }`;

    const userPrompt = `TITRE REDDIT ORIGINAL : ${redditTitle}
${mainDestFR ? 'DESTINATION : ' + mainDestFR : ''}
${angle ? 'ANGLE ÉDITORIAL : ' + angle : ''}
${extracted.post?.clean_text ? 'EXTRAIT DU POST :\n' + extracted.post.clean_text.substring(0, 500) : ''}

Génère le JSON avec titre H1 et title_tag SEO.`;

    console.log('   📝 Step 0/4: generateSEOTitle...');
    try {
      const responseData = await callOpenAIWithRetry({
        apiKey: this.apiKey,
        provider: LLM_PROVIDER,
        _trackingStep: 'micro-seo-title',
        body: {
          model: LLM_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 300,
          temperature: 0.7,
          ...(LLM_PROVIDER === 'openai' && { response_format: { type: "json_object" } })
        },
        sourceText: extracted.post?.clean_text || '',
        article: extracted,
        type: 'generation'
      });

      if (!responseData.choices?.[0]?.message?.content) {
        throw new Error('No content in SEO title response');
      }

      const parsed = safeJsonParse(responseData.choices[0].message.content, 'generateSEOTitle');
      const titre = parsed.titre || null;
      const titleTag = parsed.title_tag || null;
      if (titre) {
        console.log(`   ✅ SEO Title: "${titre}" | tag: "${titleTag}"`);
      }
      return { titre, titleTag };
    } catch (err) {
      console.warn(`   ⚠️ SEO title generation failed: ${err.message}. Will use fallback.`);
      return { titre: null, titleTag: null };
    }
  }

    async generateIntroHook(extracted, story, pattern, options = {}) {
    const editorialMode = options.editorial_mode || 'evergreen';
    const mainDestination = options.main_destination || null;
    const mainDestFR = mainDestination ? (COUNTRY_DISPLAY_NAMES[mainDestination.toLowerCase()] || mainDestination) : '';
    const redditSourceUrl = options.reddit_source_url || extracted?.meta?.url || '';

    const storyContext = story.story.context?.summary || '';
    const storyCentralEvent = story.story.central_event?.summary || '';

    // Extract available citations — ranked by emotional/insight quality
    const evidenceSnippets = story.evidence?.source_snippets || [];
    const availableCitations = this.rankCitationsByQuality(evidenceSnippets).slice(0, 3);

    // Alternate between two intro styles
    const introStyles = ['contrarian', 'stat_bomb'];
    const selectedStyle = introStyles[Math.floor(Math.random() * introStyles.length)];
    console.log(`   🎯 Intro style selected: ${selectedStyle.toUpperCase()}`);

    const styleInstructions = selectedStyle === 'contrarian'
      ? `STYLE: CONTRARIAN — Ouvre en démolissant une croyance répandue.

STRUCTURE OBLIGATOIRE (3 paragraphes <p>, rien d'autre) :

P1 — LA FAUSSE VÉRITÉ (2 phrases max)
- Phrase 1 : Énonce une croyance largement partagée sur ${mainDestFR || 'cette destination'}. Utilise "Tout le monde te dit que...", "Tu as lu partout que...", "Le consensus sur les blogs :...".
- Phrase 2 : Démolition immédiate avec un fait concret du témoignage. Utilise "C'est un mensonge par omission.", "Sauf que les chiffres disent l'inverse.", "La réalité terrain est plus brutale."
- Le contraste doit être MESURABLE : croyance chiffrée vs réalité chiffrée. Pas de contraste vague.

P2 — LE TÉMOIN + LE VERDICT COLLECTIF (3-4 phrases)
- Présente le protagoniste : prénom inventé + âge + profil concret (freelance, couple, backpacker solo, retraité). PAS "un voyageur".
- Décris sa situation en 1 phrase factuelle (durée, lieu, contexte).
- Puis le verdict collectif : "Sur {N} témoignages de voyageurs ayant fait le même arbitrage, {Y} arrivent au même constat : {conclusion en 1 phrase}."

P3 — LA PUNCHLINE-PROBLÈME (1-2 phrases)
- Reformule le vrai problème sous-jacent. Pas de solution ici, juste le diagnostic.
- Pattern : "Parce que le vrai coût de ${mainDestFR || 'cette destination'}, ce n'est pas {élément évident}. C'est {élément caché}."

ADRESSAGE "TU" (NON-NÉGOCIABLE) :
- "Tu" = le LECTEUR qui planifie. TOUJOURS au futur ou présent de planification.
- OK : "tu dépenseras", "tu risques de", "ça te coûtera", "si tu pars en juillet"
- INTERDIT : "tu as dépensé", "tu es revenu", "tu as pris ce vol", "tu t'es fait arnaquer"
- Le voyageur source = TOUJOURS 3e personne : "Lucas a dépensé...", "elle s'est fait arnaquer..."
- Zéro mention de Reddit, forums, communauté. Dis "témoignages de voyageurs" ou "retours de terrain".`
      : `STYLE: STAT BOMB + PROMISE STACK — Ouvre avec un chiffre dur, puis liste ce que l'article couvre.

STRUCTURE OBLIGATOIRE (3 paragraphes <p>, rien d'autre) :

P1 — LE CHIFFRE-CHOC (2-3 phrases)
- Phrase 1 : Un fait chiffré brut et surprenant. Pattern : "Sur {N} voyageurs ayant fait {durée} à ${mainDestFR || 'cette destination'} avec un budget similaire, {X}% ont {constat mesurable}."
- Phrase 2 : La comparaison immédiate qui éclaire le chiffre.
- PAS de narration, PAS d'émotion. Juste les faits.

P2 — LE TÉMOIN + LE RECOUPEMENT (3 phrases)
- Présente le protagoniste : prénom inventé + âge + profil.
- "On a croisé son expérience avec les retours de {N} voyageurs ayant fait le même arbitrage."
- "Résultat : {conclusion factuelle en 1 phrase avec chiffre}."

P3 — PROMISE STACK (3-4 phrases)
- "Ce qu'on couvre ici :" suivi de 3 points CONCRETS entre tirets :
  - Les vrais chiffres poste par poste (avec fourchettes)
  - Les pièges de trésorerie / logistique que les guides ignorent
  - Comment recalculer / décider / arbitrer avant de réserver
- Chaque point doit être SPÉCIFIQUE à cette destination et ce sujet.

ADRESSAGE "TU" (NON-NÉGOCIABLE) :
- "Tu" = le LECTEUR qui planifie. TOUJOURS au futur ou présent de planification.
- OK : "tu dépenseras", "tu risques de", "ça te coûtera", "si tu pars en juillet"
- INTERDIT : "tu as dépensé", "tu es revenu", "tu as pris ce vol", "tu t'es fait arnaquer"
- Le voyageur source = TOUJOURS 3e personne : "Lucas a dépensé...", "elle s'est fait arnaquer..."
- Zéro mention de Reddit, forums, communauté. Dis "témoignages de voyageurs" ou "retours de terrain".`;

    const selectedExample = selectedStyle === 'contrarian'
      ? FEW_SHOT_EXAMPLES.hookContrarian
      : FEW_SHOT_EXAMPLES.hookStatBomb;

    const systemPrompt = `Tu es un rédacteur voyage expert FlashVoyages. Génère UNIQUEMENT l'introduction de l'article (hook + contexte + accroche).

${styleInstructions}

RÈGLES IMPÉRATIVES :
- Tutoiement obligatoire, ton direct et éditorial.
- Invente un PRÉNOM RÉALISTE pour le voyageur (pas "un voyageur"). Ex: Lucas, Sophie, Thomas, Camille.
- Ne mentionne JAMAIS Reddit, forums, communauté. Dis "témoignages de voyageurs" ou "retours de X voyageurs".
- 1 citation courte du témoignage entre guillemets français « ... ».
- Langue : 100% français. Zéro anglais.
- Format : HTML pur (<p> uniquement, pas de <h2>). 3 paragraphes exactement.
- Charge émotionnelle : ${pattern.emotional_load?.label || 'modérée'}.
${editorialMode === 'news' ? 'FORMAT NEWS : Plus court et factuel, 2-3 paragraphes max.' : ''}

EXEMPLE DE QUALITÉ ATTENDUE:
\`\`\`html
${selectedExample}
\`\`\``;

    const userPrompt = `TITRE: ${extracted.title || 'Témoignage Reddit'}
AUTEUR: ${extracted.author || 'auteur Reddit'}
${mainDestFR ? 'DESTINATION PRINCIPALE: ' + mainDestFR : ''}
${options.angle ? 'TENSION ÉDITORIALE: ' + options.angle.primary_angle?.tension : ''}
${options.angle ? 'HOOK STRATÉGIQUE: ' + options.angle.primary_angle?.hook : ''}

CONTEXTE NARRATIF: ${storyContext || 'Non disponible'}
ÉVÉNEMENT CENTRAL: ${storyCentralEvent || 'Non disponible'}

CITATIONS DISPONIBLES:
${availableCitations.map((c, i) => (i+1) + '. "' + c + '"').join('\n') || 'Aucune'}
${redditSourceUrl ? '\nURL SOURCE: ' + redditSourceUrl : ''}

EXTRAIT DU POST REDDIT:
${(extracted.post?.clean_text || extracted.source_text || '').substring(0, 800)}

Génère UNIQUEMENT le HTML de l'introduction (2-3 paragraphes <p>). Pas de JSON, pas de H2, juste le HTML brut.`;

    console.log('   📝 Step 1/4: generateIntroHook...');
    const responseData = await callOpenAIWithRetry({
      apiKey: this.apiKey,
      provider: LLM_PROVIDER,
      _trackingStep: 'micro-intro-hook',
      body: {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.7
      },
      sourceText: extracted.post?.clean_text || '',
      article: extracted,
      type: 'generation'
    });

    if (!responseData.choices?.[0]?.message?.content) {
      throw new Error('Réponse LLM invalide: contenu manquant (generateIntroHook)');
    }

    let intro = responseData.choices[0].message.content.trim();
    // Clean markdown wrappers
    intro = intro.replace(/^\`\`\`(?:html)?\s*\n?/, '').replace(/\n?\`\`\`\s*$/, '');
    // Translate if needed
    const engDetect = this.detectEnglishContent(intro);
    if (engDetect.isEnglish && engDetect.ratio > 0.1) {
      intro = await this.translateToFrench(intro);
    }
    console.log(`   ✅ Intro hook: ${intro.length} chars`);
    return intro;
  }

  /**
   * STEP 2/4: Generate the main H2 body sections (core content).
   * Focused prompt for decisional H2 sections, max_tokens: 8000.
   */
  async generateBodySections(extracted, story, pattern, options = {}, introHtml = '') {
    const editorialMode = options.editorial_mode || 'evergreen';
    const mainDestination = options.main_destination || null;
    const mainDestFR = mainDestination ? (COUNTRY_DISPLAY_NAMES[mainDestination.toLowerCase()] || mainDestination) : '';
    const redditSourceUrl = options.reddit_source_url || extracted?.meta?.url || '';

    // Build truth pack
    const tp = buildPromptTruthPack(extracted, story);

    // Extract story elements
    const storyContext = story.story.context?.summary || '';
    const storyCentralEvent = story.story.central_event?.summary || '';
    const storyCriticalMoment = story.story.critical_moment?.summary || '';
    const storyResolution = story.story.resolution?.summary || '';
    const storyAuthorLessons = (story.story.author_lessons || []).map(item => typeof item === 'string' ? item : (item.lesson || '')).filter(Boolean);
    const storyCommunityInsights = (story.story.community_insights || []).map(item => typeof item === 'string' ? item : (item.value || item.insight || '')).filter(Boolean);
    const storyOpenQuestions = (story.story.open_questions || []).map(item => typeof item === 'string' ? item : (item.question || '')).filter(Boolean);

    // Evidence citations — ranked by emotional/insight quality
    const evidenceSnippets = story.evidence?.source_snippets || [];
    const availableCitations = this.rankCitationsByQuality(evidenceSnippets);

    // Extracted signals
    const extractedSignals = extracted.post?.signals || {};
    const locationsData = extractedSignals.locations?.slice(0, 5).join(', ') || '';
    const costsData = extractedSignals.costs?.slice(0, 5).join(', ') || '';

    const truthPackBlock = tp.isPoor
      ? `CONTRAINTES FACTUELLES: Pas de chiffres précis disponibles. Formulations qualitatives uniquement. Lieux autorisés: ${tp.allowedLocations.join(', ') || 'ceux du témoignage'}.`
      : `CONTRAINTES FACTUELLES:
- Nombres autorisés: ${tp.allowedNumbers.join(', ')}
- Lieux autorisés: ${tp.allowedLocations.join(', ')}${tp.allowedDurations.length > 0 ? '\n- Durées/distances autorisées: ' + tp.allowedDurations.join(', ') : ''}
- Tous les chiffres, lieux et durées doivent provenir de ces listes.`;

    const isNews = editorialMode === 'news';

    const systemPrompt = `Tu es un rédacteur expert FlashVoyages. Génère les SECTIONS H2 du corps de l'article (PAS l'intro, PAS la conclusion).

RÈGLES DE STRUCTURE :
- ${isNews ? '3-4 H2 factuels, 600-800 mots total.' : '4-6 H2 décisionnels, 1800-2500 mots total.'}
- Chaque H2 pose un arbitrage, une tension ou un choix. Inclure un verbe décisionnel (choisir, éviter, optimiser, risquer).
- ✅ Chaque H2 contient un verbe décisionnel + destination ou angle concret. Exemple : «Pourquoi Bali coûte 40 % plus cher que prévu» au lieu de «Budget».
- EXEMPLE DE QUALITE ATTENDUE (H2 decisionnel + premier paragraphe):
\`\`\`html
${FEW_SHOT_EXAMPLES.decisionalH2}
\`\`\`
- Tutoiement obligatoire. Ton direct. Pas de remplissage.
- Intégrer 2-4 citations courtes du témoignage entre « ... ».
- Format HTML : <h2>, <h3>, <p>, <ul><li>, <strong>. Pas de <blockquote>.

⛔ PULL-STATS (MINIMUM 2 OBLIGATOIRES) :
L'article DOIT contenir au moins 2 div class="fv-pull-stat" avec un chiffre frappant.
Quand un chiffre est particulièrement frappant, mets-le en évidence avec ce format :
<div class="fv-pull-stat" style="text-align:center;margin:24px 0;padding:20px;background:#f0f4ff;border-radius:12px;">
<p style="font-size:2.2rem;font-weight:800;color:#1e40af;margin:0;">[CHIFFRE]</p>
<p style="font-size:0.95rem;color:#64748b;margin:4px 0 0;">[Contexte court en 1 ligne]</p>
</div>
Maximum 2 pull-stats par article. Réserve-les aux chiffres qui choquent (pas les chiffres banals).

STAT CALLOUT (2 maximum dans le body) :
Quand un chiffre est SURPRENANT ou ÉCONOMISE de l'argent au lecteur, mets-le en évidence :
<aside class="fv-stat" style="margin:2rem 0;padding:1.25rem 1.5rem;border-left:4px solid #f59e0b;background:#fffbeb;border-radius:0 8px 8px 0;max-width:540px;">
<span style="font-size:2.5rem;font-weight:800;color:#b45309;">{CHIFFRE}{UNITÉ}</span>
<p style="margin:0.5rem 0 0;font-size:0.95rem;color:#78350f;">{1 ligne de contexte expliquant pourquoi ce chiffre compte}</p>
</aside>
Règles : le chiffre doit être surprenant OU contredire une croyance OU sauver de l'argent. Max 2 par article. Minimum 250 mots entre deux callouts.

- Langue : 100% français. Zéro anglais. Tous montants en euros.
- Chaque paragraphe apporte un fait, chiffre ou choix éditorial. Pas de platitudes.
- ✅ Phrases directes avec tutoiement : «Le visa te coûtera 35 €» au lieu de «Il est important de savoir que...».

  ADRESSAGE "TU" :
  - "Tu" = le LECTEUR qui planifie. JAMAIS le voyageur du témoignage.
  - OK : "tu dépenseras", "si tu pars", "ça te coûtera"
  - INTERDIT : "tu as dépensé", "tu es revenu de", "tu t'es fait arnaquer"
  - Le voyageur source = 3e personne : "Lucas a dépensé...", "elle a constaté..."

  COHÉRENCE TITRE/CONTENU :
  - Si le titre contient un nombre (ex: "10 frais cachés", "5 pièges"), le contenu DOIT livrer EXACTEMENT ce nombre d'éléments, numérotés en H3 : <h3>1. Premier élément</h3>, <h3>2. Deuxième</h3>, etc.
  - Si tu ne peux pas remplir le nombre promis, RÉDUIS le nombre dans le titre.

  BLOCKQUOTES :
  - Maximum 1 <blockquote> dans TOUT l'article. Toutes les autres citations = guillemets français « ... » inline.
  - Le blockquote ne doit JAMAIS être le titre du post Reddit. Choisis la phrase la plus impactante d'un COMMENTAIRE.
  - Le texte du blockquote doit être 100% en français. Zéro anglais.
  - Chaque citation est précédée d'un contexte humain : "Un expatrié installé depuis 3 ans résume : « citation »"

RYTHME DES PHRASES :
- Phrase courte. Puis une phrase plus longue qui développe et apporte de la nuance. Puis une autre courte.
- JAMAIS 2 phrases longues (15+ mots) d'affilée — insère une phrase de moins de 8 mots entre elles.
- Varie la longueur : le lecteur doit sentir un rythme, pas un métronome.

${isNews ? `CADRE NEWS :
- Bloc "Ce que ça change concrètement" (3-7 bullets actionnables).
- Si argent impliqué : montants en euros.
- Mini-scénario "Si tu es dans ce cas, fais ça".
- 1 CTA max, intégré naturellement.` : `CADRE EVERGREEN :
- Arc narratif : situation, surprise, impact, options, choix, plan d'action.
- Marqueurs obligatoires dans le HTML : <!-- FV:CTA_SLOT reason="..." --> (2-4), <!-- FV:DIFF_ANGLE -->, <!-- FV:COMMON_MISTAKES -->.
- Tableau comparatif si 2+ options. Checklist si guide pratique.

SECTIONS SERP OBLIGATOIRES (non négociable — inclure ces 3 H2 parmi les sections) :
1. **Angle différenciant** : Un H2 dont le titre NOMME la destination ET un sujet précis. Commence par <!-- FV:DIFF_ANGLE -->. Pattern obligatoire : «Le [sujet spécifique] de [destination] que les guides occultent». Exemples : «Le surcoût du JR Pass que les blogs ignorent», «La réalité des arnaques au tuk-tuk après 22h à Bangkok», «Les fermetures de temples à Bali entre janvier et mars». INTERDIT : titre générique sans destination ni sujet concret. Le contenu sous ce H2 DOIT contenir au minimum 2 faits spécifiques avec chiffres/prix/dates du témoignage. PATTERNS BANNIS (rejet automatique) : «les coûts cachés des transferts locaux», «les périodes creuses», «les arnaques récurrentes ciblant les touristes francophones». Exige plutôt : arnaques nommées avec lieu, coûts en devise locale + EUR, dates de fermeture précises.
2. **Erreurs courantes** : Un H2 sur les pièges et erreurs fréquentes des voyageurs. Commence par <!-- FV:COMMON_MISTAKES -->. Exemple : «Les 3 erreurs qui plombent ton budget à [destination]» ou «Pourquoi 80 % des voyageurs se trompent sur [sujet]».
3. **Limites et biais** : <h2>Limites et biais de cet article</h2> — 1-2 paragraphes honnêtes sur les limites du témoignage (un seul point de vue, période spécifique, etc.).`}

${truthPackBlock}

PERSONA FLASH VOYAGE — 3 TICS SIGNATURE (obligatoires, 1 de chaque minimum) :

TIC 1 — COST ANCHOR : Compare au moins 1 prix à quelque chose que le lecteur connaît.
Exemples : "Moins cher que ton Netflix", "Le prix d'un Uber à Paris", "Ce que tu dépenses en café en une semaine".
→ Place-le quand tu mentionnes un prix pour la première fois.

TIC 2 — INSIDER CORRECTION : Corrige au moins 1 croyance touristique avec l'autorité d'un expat.
Exemples : "Les blogs disent X. Les expats savent que Y.", "Le guide Lonely Planet recommande Z — ignore-le, voici pourquoi."
→ Place-le dans ta section la plus contrarian.

TIC 3 — DIRECT ADDRESS : Parle directement AU lecteur au moins 1 fois.
Exemples : "Toujours là ? La suite va te faire économiser.", "Si t'as skimmé jusqu'ici, reviens — cette partie est cruciale."
→ Place-le avant une section dense ou technique.

Ces 3 tics sont ta SIGNATURE. Le lecteur doit pouvoir reconnaître un article Flash Voyage sans voir le logo.`;

    const userPrompt = `TITRE: ${extracted.title || 'Témoignage Reddit'}
${mainDestFR ? 'DESTINATION: ' + mainDestFR : ''}
${options.angle ? 'TENSION CENTRALE: ' + options.angle.primary_angle?.tension : ''}
${options.angle ? 'ENJEU LECTEUR: ' + options.angle.primary_angle?.stake : ''}

INTRO DÉJÀ GÉNÉRÉE (pour continuité de ton) :
${introHtml.substring(0, 500)}

DONNÉES EXTRAITES :
${locationsData ? '- Destinations: ' + locationsData : ''}
${costsData ? '- Coûts: ' + costsData : ''}

SQUELETTE NARRATIF :
${storyContext ? 'CONTEXTE: ' + storyContext : ''}
${storyCentralEvent ? 'ÉVÉNEMENT CENTRAL: ' + storyCentralEvent : ''}
${storyCriticalMoment ? 'MOMENT CRITIQUE: ' + storyCriticalMoment : ''}
${storyResolution ? 'RÉSOLUTION: ' + storyResolution : ''}
${storyAuthorLessons.length > 0 ? 'LEÇONS AUTEUR:\n' + storyAuthorLessons.map((l, i) => (i+1) + '. ' + l).join('\n') : ''}
${storyCommunityInsights.length > 0 ? 'INSIGHTS COMMUNAUTÉ:\n' + storyCommunityInsights.map((c, i) => (i+1) + '. ' + c).join('\n') : ''}
${storyOpenQuestions.length > 0 ? 'QUESTIONS OUVERTES:\n' + storyOpenQuestions.map((q, i) => (i+1) + '. ' + q).join('\n') : ''}

CITATIONS DISPONIBLES :
${availableCitations.map((c, i) => (i+1) + '. "' + c + '"').join('\n') || 'Aucune'}

TEXTE COMPLET DU POST :
${(extracted.post?.clean_text || extracted.source_text || '').substring(0, 3000)}

COMMENTAIRES :
${(extracted.comments_snippets || []).slice(0, 5).map((c, i) => (i+1) + '. ' + c).join('\n') || 'Aucun'}
${redditSourceUrl ? '\nURL SOURCE: ' + redditSourceUrl : ''}

${options.outline ? `PLAN D'ARTICLE (FV-111 — suis cette structure) :
${options.outline.sections.map((s, i) => `H2 #${i+1}: ${s.title}
- Points clés : ${s.keyPoints.join(' | ')}
- Evidence : ${s.evidence.slice(0, 2).join(' ; ').substring(0, 150)}
- Chiffres autorisés : ${s.truthPackNumbers.join(', ') || 'aucun'}
- CTO slot : ${s.ctaSlot ? 'OUI' : 'NON'}`).join('\n')}

HOOK SUGGÉRÉ: ${options.outline.hookSuggestion.strategy} - ${options.outline.hookSuggestion.element}
VERDICT: ${options.outline.mandatoryElements.verdictDirection.tone} — ${options.outline.mandatoryElements.verdictDirection.direction}
FAQ TOPICS: ${options.outline.mandatoryElements.faqTopics.join(' | ')}` : ''}
Génère UNIQUEMENT le HTML des sections H2 du corps en suivant le plan ci-dessus si fourni. Pas de JSON, pas d'intro, pas de conclusion. HTML brut.`;

    console.log('   📝 Step 2/4: generateBodySections...');
    const responseData = await callOpenAIWithRetry({
      apiKey: this.apiKey,
      provider: LLM_PROVIDER,
      _trackingStep: 'micro-body-sections',
      body: {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 8000,
        temperature: 0.7
      },
      sourceText: extracted.post?.clean_text || '',
      article: extracted,
      type: 'generation'
    });

    if (!responseData.choices?.[0]?.message?.content) {
      throw new Error('Réponse LLM invalide: contenu manquant (generateBodySections)');
    }

    let body = responseData.choices[0].message.content.trim();
    body = body.replace(/^\`\`\`(?:html)?\s*\n?/, '').replace(/\n?\`\`\`\s*$/, '');
    const engDetect = this.detectEnglishContent(body);
    if (engDetect.isEnglish && engDetect.ratio > 0.1) {
      body = await this.translateToFrench(body);
    }
    console.log(`   ✅ Body sections: ${body.length} chars`);
    return body;
  }

  /**
   * STEP 3/4: Generate conclusion (verdict + recommendations + FAQ).
   * Focused prompt, max_tokens: 3000.
   */
  async generateConclusion(extracted, story, pattern, options = {}, introHtml = '', bodyHtml = '') {
    const editorialMode = options.editorial_mode || 'evergreen';
    const mainDestination = options.main_destination || null;
    const mainDestFR = mainDestination ? (COUNTRY_DISPLAY_NAMES[mainDestination.toLowerCase()] || mainDestination) : '';
    const redditSourceUrl = options.reddit_source_url || extracted?.meta?.url || '';
    const isNews = editorialMode === 'news';

    // Build truth pack
    const tp = buildPromptTruthPack(extracted, story);
    const truthPackBlock = tp.isPoor
      ? 'Pas de chiffres précis. Formulations qualitatives.'
      : `Nombres autorisés: ${tp.allowedNumbers.join(', ')}. Lieux autorisés: ${tp.allowedLocations.join(', ')}.${tp.allowedDurations.length > 0 ? ' Durées/distances autorisées: ' + tp.allowedDurations.join(', ') + '.' : ''}`;

    const systemPrompt = `Tu es un rédacteur expert FlashVoyages. Génère la CONCLUSION de l'article : verdict, recommandations, FAQ et signature.

ÉLÉMENTS OBLIGATOIRES DANS CETTE ÉTAPE :

1. VERDICT FLASH VOYAGE (champ JSON "verdict_html") :
Tu DOIS générer un bloc HTML avec H2 "Verdict Flash Voyage : à qui c'est vraiment destiné" suivi de 3-4 paragraphs "<strong>Si tu es [profil spécifique avec chiffre]</strong> → [action directe impérative]".
Le dernier profil = contrarian (qui NE devrait PAS faire ça).
EXEMPLE :
${FEW_SHOT_EXAMPLES.verdictBlock}

2. CHECKLIST SAUVEGARDABLE (champ JSON "checklist_html", evergreen seulement) :
Tu DOIS générer une div class="fv-checklist" avec la structure Avant de partir / Sur place / À éviter.
10-12 items, chacun avec un chiffre concret (montant, %, durée).
EXEMPLE :
${FEW_SHOT_EXAMPLES.checklistBlock}

3. QUICK-REFERENCE CARD (champ JSON "quick_card_html") :
Génère une carte de référence ultra-dense avec les infos clés de la destination.
Format HTML :
<div class="fv-quick-card" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:24px 0;">
<h3 style="margin-top:0;font-size:1.1rem;">📋 {Destination} — Fiche rapide</h3>
<ul style="list-style:none;padding:0;margin:0;">
<li>🗓 <strong>Meilleure période :</strong> {mois}</li>
<li>💰 <strong>Budget/jour :</strong> {montant} (backpacker) / {montant} (confort)</li>
<li>✈️ <strong>Vol depuis Paris :</strong> ~{prix} A/R</li>
<li>⚡ <strong>À faire :</strong> {1 chose}</li>
<li>🚫 <strong>À éviter :</strong> {1 chose}</li>
<li>🏨 <strong>Où dormir :</strong> {1 reco}</li>
</ul>
</div>

RÈGLES :
- Tutoiement. Ton réaliste, pas vendeur. Langue 100% français.
- Verdict : 2 paragraphes substantiels avec prise de position tranchée.
- Format : "Si tu [situation], privilégie/évite [option concrète]."
- EXEMPLE DE QUALITE ATTENDUE (verdict tranchant):
\`\`\`html
${FEW_SHOT_EXAMPLES.verdict}
\`\`\`
${isNews ? `MODE NEWS :
- Champ "a_retenir" : 2-3 bullets HTML des takeaways clés.
- 1 CTA soft max. Pas de FAQ.` : `MODE EVERGREEN :
- Recommandations : <h2>Nos recommandations : Par où commencer ?</h2> + 3 options avec CTA narratifs.
- Ce qu'il faut retenir : 2 paragraphes de verdict.
- FAQ : 4-6 questions/réponses au format <details><summary>Question ?</summary><p>Réponse.</p></details>.
    RÈGLES FAQ NON-NÉGOCIABLES :
    a) Chaque réponse utilise les CHIFFRES et LIEUX de cet article. Pas de fourchettes génériques.
    b) DESTINATION-LOCK : Tous les moyens de transport mentionnés doivent EXISTER dans cette destination.
       Pas de "scooter" au Japon urbain, pas de "tuk-tuk" en Corée, pas de "grab" au Japon.
    c) Les saisons mentionnées doivent correspondre au CLIMAT RÉEL de la destination.
       Exemple : la saison des pluies au Japon = juin-juillet (tsuyu), PAS "mai-septembre".
    d) Les prix doivent refléter la RÉALITÉ de la destination. Un hostel au Japon = 25-35€, PAS "15-30€".
    e) Chaque réponse = phrase COMPLETE et autonome. Ne copie JAMAIS de fragments du corps.
    f) La FAQ COMPLÈTE l'article, elle ne le résume pas.
- Signature : CTA soft de fin.
- INTERDIT : ne jamais inclure de titres d articles, slugs ou URLs dans le texte. Les liens vont dans opportunites_liens_internes uniquement.`}

CONTRAINTES : ${truthPackBlock}
✅ Les CTAs décrivent l'action réelle : «Compare les vols», «Vérifie les conditions du visa». Citations en guillemets français inline « ... » uniquement.

Réponds en JSON :
${isNews ? `{
  "recommandations": "...",
  "a_retenir": "...",
  "verdict_html": "...",
  "signature": "...",
  "citations": [],
  "opportunites_liens_internes": []
}` : `{
  "recommandations": "...",
  "faq": "...",
  "ce_qu_il_faut_retenir": "...",
  "verdict_html": "...",
  "checklist_html": "...",
  "quick_card_html": "...",
  "signature": "...",
  "citations": [],
  "opportunites_liens_internes": [],
  "articles_connexes": []
}`}`;

    const userPrompt = `TITRE: ${extracted.title || 'Témoignage Reddit'}
${mainDestFR ? 'DESTINATION: ' + mainDestFR : ''}

INTRO (déjà générée, pour continuité) :
${introHtml.substring(0, 400)}

CORPS (déjà généré, résumé des H2) :
${bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').substring(0, 1500)}

${redditSourceUrl ? 'URL SOURCE REDDIT: ' + redditSourceUrl : ''}
${options.angle ? 'TENSION CENTRALE: ' + options.angle.primary_angle?.tension : ''}

Génère UNIQUEMENT le JSON de conclusion.`;

    console.log('   📝 Step 3/4: generateConclusion...');
    const responseData = await callOpenAIWithRetry({
      apiKey: this.apiKey,
      provider: LLM_PROVIDER,
      _trackingStep: 'micro-conclusion',
      body: {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 5000,
        temperature: 0.7,
        ...(LLM_PROVIDER === 'openai' && { response_format: { type: "json_object" } })
      },
      sourceText: extracted.post?.clean_text || '',
      article: extracted,
      type: 'generation'
    });

    if (!responseData.choices?.[0]?.message?.content) {
      throw new Error('Réponse LLM invalide: contenu manquant (generateConclusion)');
    }

    const rawContent = responseData.choices[0].message.content;
    const conclusion = safeJsonParse(rawContent, 'generateConclusion_response');
    console.log(`   ✅ Conclusion: ${Object.keys(conclusion).join(', ')}`);
    return conclusion;
  }

  /**
   * STEP 4/4: Deterministic assembly — NO LLM call.
   * Combines intro + body + conclusion into the final JSON structure.
   */
  assembleArticle(introHtml, bodyHtml, conclusionJson, extracted, options = {}) {
    const editorialMode = options.editorial_mode || 'evergreen';
    const isNews = editorialMode === 'news';

    console.log('   🔧 Step 4/4: assembleArticle (deterministic)...');

    // Build the full developpement field: intro + body
    const developpement = introHtml + '\n\n' + bodyHtml;

    // Build title — prefer LLM-generated SEO title, fallback to extracted
    const titre = options._seoTitle || extracted.title || 'Témoignage Reddit décrypté par FlashVoyages';
    const title_tag = (options._seoTitleTag || titre).substring(0, 60);

    // Assemble the article JSON
    const article = {
      titre,
      title_tag,
      developpement,
    };

    // Verdict and checklist from dedicated micro-step fields
    article.verdict_html = conclusionJson.verdict_html || null;
    if (!isNews) {
      article.quick_guide = null;
      article.checklist_html = conclusionJson.checklist_html || null;
      article.faq = conclusionJson.faq || null;
      article.recommandations = conclusionJson.recommandations || null;
      article.ce_qu_il_faut_retenir = conclusionJson.ce_qu_il_faut_retenir || null;
      article.quick_card_html = conclusionJson.quick_card_html || null;
    } else {
      article.a_retenir = conclusionJson.a_retenir || null;
      if (conclusionJson.recommandations) article.recommandations = conclusionJson.recommandations;
    }

    article.signature = conclusionJson.signature || null;
    article.citations = conclusionJson.citations || [];
    article.opportunites_liens_internes = conclusionJson.opportunites_liens_internes || [];
    if (!isNews) article.articles_connexes = conclusionJson.articles_connexes || [];

    // Build _editorial_self_check
    const _editorial_self_check = {
      decisions_taken: ['Micro-prompt pipeline v1 (FV-108)'],
      mistakes_to_avoid: [],
      differentiating_angles: [],
      cta_slots_proposed: []
    };

    console.log(`   ✅ Article assemblé: ${Object.keys(article).length} champs, developpement=${developpement.length} chars`);

    return { article, _editorial_self_check };
  }

  /**
   * FV-108: New orchestrator — calls 4-step micro-generation pipeline.
   * Maintains the exact same input/output contract as generateFinalArticle_legacy.
   * Falls back to legacy on any micro-step failure.
   */
  async generateFinalArticle(extraction, analysis, extracted, pattern, story, options = {}) {
    const editorialMode = options.editorial_mode || 'evergreen';
    console.log(`\n🔬 MICRO-PROMPT PIPELINE (FV-108) — mode: ${editorialMode.toUpperCase()}`);

    try {
      // ── STEP 0: SEO Title ──
      const seoTitleResult = await this.generateSEOTitle(extracted, story, options);
      if (seoTitleResult.titre) options._seoTitle = seoTitleResult.titre;
      if (seoTitleResult.titleTag) options._seoTitleTag = seoTitleResult.titleTag;

      // ── STEP 1: Intro Hook ──
      const introHtml = await this.generateIntroHook(extracted, story, pattern, options);

      // ── STEP 2: Body Sections ──
      const bodyHtml = await this.generateBodySections(extracted, story, pattern, options, introHtml);

      // ── STEP 3: Conclusion (JSON) ──
      const conclusionJson = await this.generateConclusion(extracted, story, pattern, options, introHtml, bodyHtml);

      // ── STEP 4: Deterministic Assembly ──
      const assembled = this.assembleArticle(introHtml, bodyHtml, conclusionJson, extracted, options);
      const content = assembled;

      console.log('✅ Micro-prompt pipeline: article assemblé, lancement post-processing...');
      console.log('🔍 FAQ DEBUG: article.faq present=' + !!(content.article?.faq), 'length=' + (content.article?.faq?.length || 0), 'trimmed=' + !!(content.article?.faq?.trim()));

      // ═══ POST-PROCESSING (reused from legacy) ═══
      if (content.article) {
        const article = content.article;
        const sections = [];
        const isNews = (options.editorial_mode || 'evergreen') === 'news';

        // 0. Quick Guide
        let quickGuideText = article.quick_guide?.trim() || '';
        if (quickGuideText) {
          const englishDetection = this.detectEnglishContent(quickGuideText);
          if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
            quickGuideText = await this.translateToFrench(quickGuideText);
          }
          if (!quickGuideText.includes('<div class="quick-guide">') && !quickGuideText.includes('<h3>Points clés')) {
            sections.push('<div class="quick-guide">\n<h3>Points clés de ce témoignage</h3>\n' + quickGuideText + '\n</div>');
          } else {
            sections.push(quickGuideText);
          }
        }

        if (article.developpement && article.developpement.trim()) {
          let devHtml = article.developpement.trim();
          devHtml = devHtml.replace(/^\`\`\`(?:html)?\s*\n?/, '').replace(/\n?\`\`\`\s*$/, '');
          const englishDetection = this.detectEnglishContent(devHtml);
          if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
            devHtml = await this.translateToFrench(devHtml);
          }
          devHtml = await this.translateBlockquotesInText(devHtml);
          sections.push(devHtml);

          // Verdict + Checklist + Recommendations + FAQ assembly
          // Order: verdict → checklist → recommandations → faq → ce_qu_il_faut_retenir → signature

          // Insert verdict_html (from micro-step) before recommendations
          if (article.verdict_html?.trim()) {
            sections.push(article.verdict_html.trim());
            console.log('   ✅ verdict_html from micro-step placed in assembly');
          }

          // Insert checklist_html (from micro-step, evergreen only) before FAQ
          if (!isNews && article.checklist_html?.trim()) {
            sections.push(article.checklist_html.trim());
            console.log('   ✅ checklist_html from micro-step placed in assembly');
          }

          if (editorialMode === 'news') {
            if (article.recommandations?.trim()) {
              let recoText = article.recommandations.trim();
              const engReco = this.detectEnglishContent(recoText);
              if (engReco.isEnglish && engReco.ratio > 0.1) recoText = await this.translateToFrench(recoText);
              sections.push(recoText);
            }
            const retenirField = article.a_retenir || article.ce_qu_il_faut_retenir || '';
            if (retenirField.trim()) {
              let retenirText = retenirField.trim();
              if (!retenirText.includes('<h2>')) sections.push('<h2>À retenir</h2>\n' + retenirText);
              else sections.push(retenirText);
            } else {
              sections.push('<h2>À retenir</h2>\n<ul><li>Les points clés de cette actualité</li></ul>');
            }
          } else {
            if (article.recommandations?.trim()) {
              let recoText = article.recommandations.trim();
              const engReco = this.detectEnglishContent(recoText);
              if (engReco.isEnglish && engReco.ratio > 0.1) recoText = await this.translateToFrench(recoText);
              sections.push(recoText);
            } else {
              sections.push('<h2>Nos recommandations : Par où commencer ?</h2>\n<p>Nous recommandons de privilégier l\'Asie du Sud-Est pour un budget maîtrisé.</p>');
            }
            console.log('🔍 FAQ_PUSH: entering FAQ block, faq length=' + (article.faq?.length || 0));
            if (article.faq?.trim()) {
              let faqText = article.faq.trim();
              if (!faqText.includes('<h2>')) faqText = '<h2 class="wp-block-heading">Questions fréquentes</h2>\n' + faqText;
              sections.push(faqText);
            }
            if (article.ce_qu_il_faut_retenir?.trim()) {
              let retenirText = article.ce_qu_il_faut_retenir.trim();
              if (!retenirText.includes('<h2>')) sections.push('<h2>Ce qu\'il faut retenir</h2>\n' + retenirText);
              else sections.push(retenirText);
            } else {
              sections.push('<h2>Ce qu\'il faut retenir</h2>\n<p>Les points clés de cet article et les outils utiles.</p>');
            }
            if (article.quick_card_html?.trim()) {
              sections.push(article.quick_card_html.trim());
              console.log('   ✅ Quick-reference card intégrée');
            }
          }
          if (article.signature?.trim()) sections.push(article.signature);
        }

        let htmlContent = sections.filter(Boolean).join('\n\n');
        htmlContent = htmlContent.replace(/\`\`\`(?:html)?\s*\n?/g, '');

        // Guard: check minimum text length
        const textOnly = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const textLength = textOnly.length;
        console.log(`📏 MICRO-PIPELINE ASSEMBLAGE: ${sections.length} section(s), ${htmlContent.length} chars HTML, ${textLength} chars texte`);

        if (textLength < 500) {
          console.error(`❌ MICRO-PIPELINE: Article trop court (${textLength} chars). Fallback vers legacy...`);
          throw new Error('MICRO_PIPELINE_SHORT: ' + textLength + ' chars < 500');
        }

        // Blockquote cleanup
        const blockquotesBefore = (htmlContent.match(/<blockquote[^>]*>.*?<\/blockquote>/gs) || []).length;
        htmlContent = htmlContent.replace(/<blockquote[^>]*>.*?<\/blockquote>/gs, '');
        if (blockquotesBefore > 0) {
          console.log(`🧹 ${blockquotesBefore} blockquote(s) supprimé(s)`);
        }

        // EVERGREEN expansion if needed
        if (editorialMode === 'evergreen') {
          const wordCount = textOnly.split(/\s+/).filter(w => w.length > 0).length;
          console.log(`📏 EVERGREEN WORD COUNT (micro-pipeline): ${wordCount} mots`);
          if (!options._truthPack) options._truthPack = buildPromptTruthPack(extracted, story);
          if (!options._extracted) options._extracted = extracted;
          const MAX_EXPANSION_PASSES = wordCount >= 2200 ? 0 : wordCount < 1200 ? 3 : wordCount < 1800 ? 2 : 1;
          if (wordCount < 2500 && MAX_EXPANSION_PASSES > 0) {
            console.log(`⚠️ MICRO-PIPELINE trop court (${wordCount} < 2500). Expansion...`);
            let currentWords = wordCount;
            for (let pass = 1; pass <= MAX_EXPANSION_PASSES && currentWords < 2500; pass++) {
              try {
                htmlContent = await this.expandEvergreenContent(htmlContent, extraction, options);
                const expandedText = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                const expandedWords = expandedText.split(/\s+/).filter(w => w.length > 0).length;
                console.log(`📏 EXPANSION ${pass}: ${expandedWords} mots (+${expandedWords - currentWords})`);
                if (expandedWords <= currentWords) break;
                currentWords = expandedWords;
              } catch (e) {
                console.warn(`⚠️ Expansion passe ${pass} échouée: ${e.message}`);
                break;
              }
            }
          }
        }

        // Title processing
        let finalTitle = article.titre || 'Témoignage Reddit décrypté par FlashVoyages';
        finalTitle = this.convertTitleUSDToEUR(finalTitle);
        const titleTag = article.title_tag || finalTitle.substring(0, 60);

        const finalContent = {
          title: finalTitle,
          title_tag: titleTag,
          content: htmlContent,
          _truthPack: options._truthPack || null
        };

        console.log(`📄 MICRO-PIPELINE: Article final "${finalContent.title}" (${sections.length} sections)`);
        return finalContent;
      }

      return content;

    } catch (microError) {
      console.warn(`⚠️ MICRO-PROMPT PIPELINE FAILED: ${microError.message}. Fallback to legacy...`);
      return this.generateFinalArticle_legacy(extraction, analysis, extracted, pattern, story, options);
    }
  }


  /**
   * EXPANSION EVERGREEN : enrichit un article trop court via un appel LLM dédié.
   * Appelé uniquement si l'article EVERGREEN fait < 1500 mots après génération initiale.
   * 
   * @param {string} htmlContent - HTML de l'article existant
   * @param {Object} extraction - Données extraites (citations, données clés)
   * @param {Object} options - Options du pipeline (titre, contexte)
   * @returns {Promise<string>} - HTML enrichi
   */
  async expandEvergreenContent(htmlContent, extraction, options = {}) {
    console.log('\n📐 EXPANSION EVERGREEN: Enrichissement du contenu...');

    // PHASE 2.1b: Construire truth pack + claims existants pour contraindre l'expansion
    const truthPack = options._truthPack || buildPromptTruthPack(options._extracted || {}, options._story || null);
    const existingClaims = extractExistingClaims(htmlContent);
    const angle = options.angle || null;

    // P4: Extraction des mots-clés de l'angle pour contrôle de dilution
    const extractAngleKeywords = (tension) => {
      if (!tension) return [];
      const stopWords = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'en', 'et', 'ou', 'mais', 'donc', 'car', 'pour', 'par', 'avec', 'dans', 'sur', 'sans', 'plus', 'pas', 'tout', 'tous', 'cette', 'ces', 'son', 'ses', 'qui', 'que']);
      return tension.toLowerCase().split(/\s+/)
        .filter(w => w.length > 4 && !stopWords.has(w))
        .slice(0, 5);
    };
    const angleKeywords = extractAngleKeywords(angle?.primary_angle?.tension);
    const countKeywords = (text, keywords) => {
      const textLower = text.replace(/<[^>]*>/g, ' ').toLowerCase();
      return keywords.reduce((sum, kw) => sum + (textLower.match(new RegExp(kw, 'gi')) || []).length, 0);
    };
    const preExpansionCount = countKeywords(htmlContent, angleKeywords);

    const truthPackBlock = truthPack.isPoor
      ? `\nCONTRAINTES FACTUELLES : Aucun chiffre source disponible. Utilise des formulations qualitatives (des frais, des dizaines d'euros, plusieurs jours) sans inventer de montants precis. Lieux autorises : ${truthPack.allowedLocations.join(', ') || 'aucun specifie'}.`
      : `\nCONTRAINTES FACTUELLES (ABSOLU) :
- Nombres autorises : ${truthPack.allowedNumbers.join(', ')}
- Tokens numeriques autorises : ${truthPack.allowedNumberTokens.join(', ')}
- Lieux autorises : ${truthPack.allowedLocations.join(', ')}
- Tu NE PEUX PAS introduire de nouveau lieu, nouveau prix, nouveau chiffre, ou nouvel exemple concret non source.
- Si tu as besoin de plus de contenu, approfondis les analyses, trade-offs et arbitrages — ne fabrique pas de nouvelles donnees.`;

    const tensionBlock = angle
      ? `\nTENSION ORBITALE : Chaque paragraphe ajoute doit faire avancer cette tension : "${angle.primary_angle?.tension || ''}"`
      : '';

    const existingClaimsBlock = existingClaims.length > 0
      ? `\nCLAIMS DEJA PRESENTS (ne pas repeter) : ${existingClaims.join(', ')}`
      : '';

    const systemPrompt = `Tu es un redacteur expert en voyage. Tu recois un article HTML EVERGREEN trop court.

Ta mission : ENRICHIR cet article pour atteindre MINIMUM 2500 mots, IDEAL 3000 mots.

REGLES ABSOLUES :
1. NE SUPPRIME RIEN de l'article existant. Tu AJOUTES du contenu.
2. NE INVENTE AUCUN fait, chiffre, lieu ou experience non present dans l'article ou le contexte fourni.
3. NE REPETE PAS les claims chiffres deja presents — approfondis plutot leur analyse.
4. ENRICHIS chaque section H2 existante avec :
   - Analyses plus profondes (avantages/inconvenients, pieges a eviter)
   - Contexte supplementaire (comparaisons, mises en perspective)
   - Trade-offs et arbitrages concrets
5. CONSERVE le meme ton (tutoiement, expert accessible, pas scolaire).
6. ECRIS EN FRANCAIS uniquement.
7. RETOURNE l'article HTML COMPLET enrichi (pas un diff, pas un resume).
${truthPackBlock}${tensionBlock}${existingClaimsBlock}

COHERENCE ANGLE (ABSOLU) :
- Chaque paragraphe ajoute doit servir la tension editoriale centrale. Si le paragraphe ne fait PAS avancer la tension, ne l'ajoute pas.
- Chaque H2 ajoute doit contenir un arbitrage, une decision, ou un trade-off — pas une description neutre.
- Reutilise l'angle editorial dans les transitions entre sections pour maintenir le fil rouge.
- Si les sections 'Ce que les autres ne disent pas' ou 'Erreurs frequentes' sont absentes, AJOUTE-LES obligatoirement.

REGLES DE FORME :
- Chaque paragraphe DOIT faire au moins 3 phrases (PAS de paragraphe d'une seule phrase).
- Chaque paragraphe DOIT contenir un avis, un arbitrage, un chiffre, ou une recommandation concrete.
- PAS de phrases de transition isolees comme "Parlons maintenant de..." ou "Voyons comment...".
- Fusionne les informations liees dans des paragraphes denses, pas des micro-paragraphes.

CITATIONS SOURCEES (OBLIGATOIRE) :
- L'article DOIT contenir au minimum 2 citations entre guillemets francais « ... » issues du temoignage.
- Format : "Un voyageur explique : « citation courte »" ou "L'auteur precise : « citation courte »".
- Si l'article en contient moins de 2, AJOUTE des citations pertinentes extraites des donnees source.

EQUILIBRE SECTIONS :
- Repartis le contenu ajoute de maniere EQUILIBREE entre les sections H2. Pas de section 5x plus longue qu'une autre.
- Si une section est trop courte, enrichis-la en priorite. Si une section est deja dense, ne l'allonge pas davantage.

TON ET STYLE :
- Tutoiement OBLIGATOIRE : utilise "tu", "ton", "ta", "tes" (jamais "vous" ni "il faut" ni "on doit").
- ✅ PHRASES DIRECTES : remplace les béquilles syntaxiques par des sujets concrets. Exemple : «Le visa coûte 35 € et se demande en ligne» au lieu de «Il est important de noter que le visa coûte 35 €».

CONTRAINTES FACTUELLES STRICTES :
- ✅ Utilise uniquement les lieux listés dans "Lieux autorisés". Exemple : si Chiang Mai et Bangkok sont autorisés, reste sur ces villes.
- ✅ Utilise uniquement les chiffres listés dans "Nombres autorisés". Pour un coût non sourcé, reformule sans montant : «reste abordable», «le surcoût est réel», «pèse sur ton budget».
- ✅ Enrichis les analyses et arbitrages existants plutôt que d'inventer de nouveaux exemples ou anecdotes.
- ✅ Chaque paragraphe contient un avis, un arbitrage, un chiffre ou une recommandation concrète.
- ✅ Fusionne les paragraphes courts (< 3 phrases) avec le paragraphe précédent ou suivant pour créer des blocs denses.`;

    const angleBlock = angle ? `
ANGLE EDITORIAL STRATEGIQUE :
- Tension centrale: ${angle.primary_angle?.tension || 'N/A'}
- Type d'angle: ${angle.primary_angle?.type || 'N/A'}
- Hook strategique: ${angle.primary_angle?.hook || 'N/A'}
- Enjeu lecteur: ${angle.primary_angle?.stake || 'N/A'}
Chaque ajout doit faire avancer cette tension.
IMPORTANT : ne modifie PAS les 2 premiers paragraphes de l'intro s'ils contiennent deja les mots-cles du hook. Si tu les modifies, conserve les mots significatifs du hook strategique.
` : '';

    const userPrompt = `ARTICLE A ENRICHIR (trop court, doit atteindre 2500+ mots) :

${htmlContent}

DONNEES SOURCE DISPONIBLES (utilise-les pour enrichir) :
- Titre: ${options.reddit_title || options.title || 'N/A'}
- Citations disponibles: ${JSON.stringify(Array.isArray(extraction?.citations) ? extraction.citations.slice(0, 5) : [])}
- Donnees cles: ${JSON.stringify(extraction?.donnees_cles || extraction?.key_data || {})}
${angleBlock}
RETOURNE l'article HTML COMPLET enrichi. MINIMUM 2500 mots.`;

    const responseData = await callOpenAIWithRetry({
      apiKey: this.apiKey,
      provider: LLM_PROVIDER,
      _trackingStep: 'generator-expand',
      body: {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 10000,
        temperature: 0.6
      },
      sourceText: htmlContent,
      article: extraction || {},
      type: 'expansion'
    });

    if (!responseData.choices?.[0]?.message?.content) {
      throw new Error('Réponse LLM vide pour expansion EVERGREEN');
    }

    let expanded = responseData.choices[0].message.content.trim();
    
    // Nettoyer les wrappers markdown ```html...```
    expanded = expanded.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    // #region agent log
    const brokenAccentsExpansion = expanded.match(/[a-zà-ÿ]{3,}\s+[àâäéèêëïîôùûüÿ]/gi) || [];
    fetch('http://127.0.0.1:7901/ingest/6e314725-9b46-4c28-8b38-06554a24d929',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'intelligent-content-analyzer-optimized.js:2657',message:'H1: broken accents in expansion LLM output',data:{count:brokenAccentsExpansion.length,samples:brokenAccentsExpansion.slice(0,10)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    // Vérifier que l'expansion a bien augmenté le contenu
    const originalWords = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).length;
    const expandedWords = expanded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).length;
    
    if (expandedWords <= originalWords) {
      console.warn(`⚠️ Expansion n'a pas augmenté le contenu (${originalWords} → ${expandedWords} mots). Conservation de l'original.`);
      return htmlContent;
    }

    // P4: Contrôle de dilution de l'angle après expansion
    if (angleKeywords.length > 0 && preExpansionCount > 0) {
      const postExpansionCount = countKeywords(expanded, angleKeywords);
      const ratio = postExpansionCount / preExpansionCount;
      if (ratio < 0.7) {
        console.warn(`⚠️ EXPANSION_REJECTED: angle_dilution (ratio=${(ratio * 100).toFixed(0)}% < 70%)`);
        return htmlContent;
      }
      console.log(`✅ Angle coherence: ${(ratio * 100).toFixed(0)}% (pre=${preExpansionCount}, post=${postExpansionCount})`);
    }
    
    console.log(`✅ EXPANSION EVERGREEN: ${originalWords} → ${expandedWords} mots (+${expandedWords - originalWords})`);
    return expanded;
  }

  /**
   * PASSE 2: Amélioration du contenu en deux phases
   * Phase 1: Checks heuristiques (regex, sans LLM) — détection d'anomalies
   * Phase 2: Correction LLM (seulement si anomalies détectées en phase 1)
   * 
   * @param {string} rawContent - HTML du contenu généré par la passe 1
   * @param {Object} context - Contexte de l'article (destination, theme, etc.)
   * @returns {Promise<string>} - HTML amélioré
   */
  async improveContentWithLLM(rawContent, context = {}) {
    console.log('\n🔄 PASSE 2: Amélioration du contenu (deux phases)...');
    console.log(`   📏 Contenu initial: ${rawContent.length} caractères`);
    
    const rawDestination = context.destination || context.final_destination || 'Asie';
    // GARDE: éviter les noms de ville partiels ou ambigus comme destination pour les H2
    const AMBIGUOUS_CITY_NAMES = ['George', 'Town', 'City', 'Beach', 'Island', 'Bay', 'Port', 'Hat', 'Ko', 'Koh'];
    const destination = (rawDestination.length <= 5 || AMBIGUOUS_CITY_NAMES.includes(rawDestination))
      ? 'la destination' : rawDestination;
    const theme = context.theme || 'voyage';

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Checks heuristiques (regex, sans LLM)
    // ═══════════════════════════════════════════════════════════════
    console.log('   📋 Phase 1: Checks heuristiques...');
    const anomalies = [];
    
    // 1a. Détection H2 génériques (blacklist)
    const GENERIC_H2_BLACKLIST = [
      'contexte', 'événement central', 'moment critique', 'résolution',
      'chronologie de l\'expérience', 'risques et pièges réels',
      'ce que la communauté apporte', 'conseils pratiques',
      'en résumé', 'stratégies', 'ce qu\'il faut savoir', 'points clés',
      'notre avis', 'analyse', 'solutions', 'conclusion',
      'ce qu\'il faut retenir', 'nos recommandations', 'options alternatives'
    ];
    // Patterns "lazy" : un mot générique + ":" + complément → toujours mauvais
    const LAZY_H2_PATTERN = /^(conclusion|stratégies|options|solutions|résumé|analyse)\s*:/i;
    
    const h2Matches = [...(rawContent.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi) || [])];
    const genericH2s = h2Matches.filter(m => {
      const title = m[1].trim().toLowerCase().replace(/[^\wàâäéèêëïîôùûüÿç\s'-]/g, '').trim();
      const isNakedGeneric = GENERIC_H2_BLACKLIST.some(banned => 
        title === banned || title.startsWith(banned + ' ') || title.startsWith(banned + ':') || title.startsWith(banned + ',')
      );
      const isLazy = LAZY_H2_PATTERN.test(m[1].trim());
      return isNakedGeneric || isLazy;
    });
    if (genericH2s.length > 0) {
      anomalies.push({ type: 'generic_h2', count: genericH2s.length, details: genericH2s.map(m => m[1].trim()) });
      console.log(`   ⚠️ H2 génériques détectés: ${genericH2s.map(m => `"${m[1].trim()}"`).join(', ')}`);
    }

    // 1a-bis. Détection H2 trop courts (1-2 mots, ex: "Bali", "Chiang Mai") — non descriptifs
    const shortH2s = h2Matches.filter(m => {
      const title = m[1].trim();
      const words = title.split(/\s+/).filter(w => w.length > 0);
      return words.length <= 2 && title.length < 20;
    });
    if (shortH2s.length > 0) {
      anomalies.push({ type: 'short_h2', count: shortH2s.length, details: shortH2s.map(m => m[1].trim()) });
      console.log(`   ⚠️ H2 trop courts (non descriptifs): ${shortH2s.map(m => `"${m[1].trim()}"`).join(', ')}`);
    }

    // 1b. Comptage de quotes « ... » (minimum 2)
    const quoteMatches = rawContent.match(/«[^»]+»/g) || [];
    if (quoteMatches.length < 2) {
      anomalies.push({ type: 'low_quotes', count: quoteMatches.length, expected: 2 });
      console.log(`   ⚠️ Citations insuffisantes: ${quoteMatches.length}/2 minimum`);
    }
    
    // 1c. Détection "Reddit" / "subreddit" / "r/" et patterns bannis dans les 500 premiers caractères
    const textOnly = rawContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const first500 = textOnly.slice(0, 500);
    const redditInHook = /\breddit\b|\bsubreddit\b|\br\//i.test(first500);
    if (redditInHook) {
      anomalies.push({ type: 'reddit_in_hook' });
      console.log('   ⚠️ Mention de Reddit dans les 500 premiers caractères du hook');
    }
    
    // 1c-bis. Détection du hook banni "Te voilà" (ancien pattern formulaique)
    const bannedHookPatterns = /\bte voilà\b|\bte voila\b/i.test(first500);
    if (bannedHookPatterns) {
      anomalies.push({ type: 'banned_hook_pattern' });
      console.log('   ⚠️ Hook banni détecté: "Te voilà..." (ancien pattern formulaique)');
    }
    
    // 1d. Détection phrases plates courantes
    const FLAT_PHRASES = [
      /il est important de\b/gi,
      /il faut savoir que\b/gi,
      /il convient de noter\b/gi,
      /en conclusion\b/gi,
      /en somme\b/gi,
      /en effet\b/gi,
      /dans cet article\b/gi,
      /chaque voyage est unique\b/gi,
      /il est toujours préférable de se renseigner\b/gi
    ];
    const flatPhrasesFound = [];
    for (const pattern of FLAT_PHRASES) {
      const matches = rawContent.match(pattern);
      if (matches) flatPhrasesFound.push(...matches);
    }
    if (flatPhrasesFound.length > 0) {
      anomalies.push({ type: 'flat_phrases', count: flatPhrasesFound.length, details: flatPhrasesFound.slice(0, 5) });
      console.log(`   ⚠️ Phrases plates détectées: ${flatPhrasesFound.length} (${flatPhrasesFound.slice(0, 3).map(p => `"${p}"`).join(', ')})`);
    }
    
    // 1e. Détection manque de decisions concretes (K4)
    const k4Arbitrage = (rawContent.match(/data-fv-move="arbitrage"/gi) || []).length;
    const k4Verdicts = (textOnly.match(/notre\s+(?:arbitrage|verdict|conseil|recommandation)|en\s+pratique\s*[:,]\s*\w+|mieux\s+vaut|on\s+recommande/gi) || []).length;
    const k4SiTu = (textOnly.match(/si\s+tu\s+\w+.*?,\s*(choisis|privil[eé]gie|opte|pr[eé]f[eè]re|[eé]vite|mise\s+sur|pars\s+sur)/gi) || []).length;
    const k4Total = k4Arbitrage + k4Verdicts + k4SiTu;
    if (k4Total < 2) {
      anomalies.push({ type: 'low_decisions', count: k4Total, expected: 2 });
      console.log(`   ⚠️ Decisions concretes insuffisantes: ${k4Total}/2 minimum (arbitrage:${k4Arbitrage} verdicts:${k4Verdicts} si-tu:${k4SiTu})`);
    }

    // 1e-bis. Détection phrases robotiques (patterns tonalité quality-analyzer)
    const ROBOTIC_PHRASES = [
      'il est important de noter que', 'dans le cadre de', 'il convient de souligner',
      'force est de constater', 'il va sans dire', 'en ce qui concerne',
      'dans un premier temps', 'dans un second temps', 'il est à noter que', 'nous allons voir'
    ];
    const roboticFound = ROBOTIC_PHRASES.filter(p => textOnly.toLowerCase().includes(p));
    if (roboticFound.length > 0) {
      anomalies.push({ type: 'robotic_tone', count: roboticFound.length, details: roboticFound });
      console.log(`   ⚠️ Phrases robotiques détectées: ${roboticFound.length} (${roboticFound.slice(0, 3).map(p => `"${p}"`).join(', ')})`);
    }

    // 1e. Détection anglais résiduel (heuristique rapide)
    const englishPatterns = rawContent.match(/\b(the|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|you|he|she|we|they|here|there|my|your|not|anymore|phone|camera)\b/gi) || [];
    const hasSignificantEnglish = englishPatterns.length > 10;
    if (hasSignificantEnglish) {
      anomalies.push({ type: 'english_residual', count: englishPatterns.length });
      console.log(`   ⚠️ Anglais résiduel détecté: ${englishPatterns.length} mots anglais`);
    }
    
    // Phase 1 summary
    const hasTargetedInstructions = Array.isArray(context.targetedInstructions) && context.targetedInstructions.length > 0;
    if (anomalies.length === 0 && !hasTargetedInstructions) {
      console.log('   ✅ Phase 1: Aucune anomalie détectée — skip de la passe LLM (économie de coût)');
      return rawContent;
    }
    console.log(`   📊 Phase 1: ${anomalies.length} anomalie(s) détectée(s) → déclenchement Phase 2 (LLM)`);
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Correction LLM (seulement si anomalies détectées)
    // ═══════════════════════════════════════════════════════════════
    console.log('   🤖 Phase 2: Correction LLM ciblée...');
    
    // Construire les instructions de correction spécifiques aux anomalies trouvées
    const correctionInstructions = [];
    
    for (const anomaly of anomalies) {
      switch (anomaly.type) {
        case 'generic_h2':
          correctionInstructions.push(
            `REFORMULE ces H2 génériques en H2 spécifiques contenant la destination "${destination}" ou le sujet concret de l'article : ${anomaly.details.map(d => `"${d}"`).join(', ')}. Exemple : "Conseils pratiques" → "Comment éviter les pièges bancaires en ${destination}".`
          );
          break;
        case 'low_quotes':
          correctionInstructions.push(
            `L'article ne contient que ${anomaly.count} citation(s) inline « ... ». Ajoute des citations pertinentes depuis le témoignage, intégrées dans le flux narratif avec un contexte (ex: "Un voyageur résume : « ... »"). Minimum 2 citations.`
          );
          break;
        case 'reddit_in_hook':
          correctionInstructions.push(
            'Le hook (500 premiers caractères) mentionne "Reddit" ou "subreddit". Reformule le début pour plonger le lecteur dans une scène concrète SANS mentionner la source. La mention de Reddit doit apparaître plus tard dans l\'article.'
          );
          break;
        case 'banned_hook_pattern':
          correctionInstructions.push(
            'Le hook utilise le pattern banni "Te voilà...". Remplace-le par un hook cinématique : une micro-scène sensorielle concrète tirée du témoignage, avec tension et enjeu budget/temps. Exemples : "Chaque fois que je devais sortir du cash en Thaïlande, ça commençait pareil..." ou "Tu atterris à Bangkok avec un visa de 30 jours et une liste de choses à faire qui en demanderait 90." Le hook doit plonger le lecteur dans l\'ACTION, pas dans une description.'
          );
          break;
        case 'flat_phrases':
          correctionInstructions.push(
            `Remplace les phrases plates suivantes par des formulations à haute valeur ("ce que ça change pour toi", "le piège classique", "la règle simple") : ${anomaly.details.map(d => `"${d}"`).join(', ')}.`
          );
          break;
        case 'english_residual':
          correctionInstructions.push(
            `Traduis en français les ${anomaly.count} mots/passages anglais restants dans l'article. Tout doit être en français.`
          );
          break;
        case 'short_h2':
          correctionInstructions.push(
            `REFORMULE ces H2 trop courts (1-2 mots) en H2 descriptifs et engageants : ${anomaly.details.map(d => `"${d}"`).join(', ')}. Un H2 doit contenir une promesse ou un angle : "Bali" → "Bali : entre paradis instagrammable et réalité budgétaire", "Bangkok" → "Pourquoi Bangkok reste imbattable pour les premiers mois".`
          );
          break;
        case 'robotic_tone':
          correctionInstructions.push(
            `Reformule ces phrases robotiques en langage naturel avec tutoiement : ${anomaly.details.map(d => `"${d}"`).join(', ')}. Exemples : "il est important de noter que" → "ce que tu dois savoir", "dans le cadre de" → "pour ton", "il convient de souligner" → "un point clé".`
          );
          break;
        case 'low_decisions':
          correctionInstructions.push(
            `CRITIQUE — L'article ne contient que ${anomaly.count} prise(s) de position sur 2 minimum. C'est BLOQUANT.

INSÈRE EXACTEMENT ${Math.max(2, 3 - anomaly.count)} phrases de décision dans le dernier <p> de ${Math.max(2, 3 - anomaly.count)} sections H2 différentes. Chaque phrase DOIT suivre UN de ces formats EXACTS (copie-colle la structure, remplace les crochets) :

- "Si tu [verbe ta situation], privilégie [option concrète]." (MAXIMUM 1-2 dans TOUT l'article)
- ALTERNATIVE (préférée) : Utilise l'impératif direct — "Réserve...", "Prévois...", "Compare...", "Vérifie..."
- ALTERNATIVE : Question rhétorique — "Tu hésites entre X et Y ? Commence par..."
- ⚠️ INTERDICTION ABSOLUE : ne mets JAMAIS "Si tu..." à la fin de chaque paragraphe. C'est le pattern #1 qui fait détecter l'article comme IA.

EXEMPLES CONCRETS à adapter au sujet de l'article :
- "Privilégie les bus locaux plutôt que les vols intérieurs si ton budget est serré."
- "Choisis la basse saison (mai-septembre) pour éviter la foule et payer 30% moins cher."
- ⚠️ NOTE : Ces exemples utilisent l'impératif DIRECT, pas "Si tu...". C'est le ton à adopter.
- "Si tu hésites entre deux îles, pars sur celle qui correspond à ton rythme."

RÈGLES :
- La phrase DOIT commencer par "Si tu" suivi d'un verbe
- Après la virgule, utilise OBLIGATOIREMENT un de ces verbes : privilégie, évite, opte pour, choisis, pars sur, mise sur
- Place chaque phrase à la FIN du dernier paragraphe d'une section H2 existante
- ✅ Insère la phrase à la suite du dernier paragraphe existant de la section H2 — pas de nouveau paragraphe.`
          );
          break;
      }
    }
    
    // Inject quality gate targeted instructions from context
    if (Array.isArray(context.targetedInstructions) && context.targetedInstructions.length > 0) {
      for (const ti of context.targetedInstructions) {
        if (typeof ti === 'string' && ti.trim().length > 0) {
          correctionInstructions.push(ti.trim());
        }
      }
      console.log('   Targeted instructions injectees:', context.targetedInstructions.length);
    }

    // PHASE 2.1d: Construire les contraintes truth pack pour l'improve
    const improveTruthPack = context.extracted ? buildPromptTruthPack(context.extracted, context.story || null) : null;
    const improveTruthPackBlock = improveTruthPack
      ? (improveTruthPack.isPoor
        ? `\n7. AUCUN nouveau chiffre, prix ou montant ne doit etre introduit (aucune source disponible). Lieux autorises : ${improveTruthPack.allowedLocations.join(', ')}.`
        : `\n7. ✅ Utilise uniquement les lieux et chiffres déjà présents dans l'article original.\n   Nombres autorises : ${improveTruthPack.allowedNumbers.join(', ')}\n   Lieux autorises : ${improveTruthPack.allowedLocations.join(', ')}${improveTruthPack.allowedDurations?.length > 0 ? '\n   Durees/distances autorisees : ' + improveTruthPack.allowedDurations.join(', ') : ''}`)
      : '';
    const improveAngleBlock = context.angle
      ? `\n8. TENSION EDITORIALE a respecter : "${context.angle.primary_angle?.tension || ''}". Ne pas diluer cette tension. Chaque correction doit maintenir ou renforcer cette tension — jamais l'aplatir.`
      : '';

    const systemPrompt = `Tu es un éditeur expert français pour FlashVoyages.com. Tu corriges des anomalies SPÉCIFIQUES dans le contenu HTML existant.

RÈGLES ABSOLUES (par ordre de priorité):

1. CORRIGE UNIQUEMENT les anomalies listées ci-dessous — ne touche pas au reste
2. TRADUIS EN FRANÇAIS tout contenu anglais résiduel
3. CORRIGE LES ESPACES MANQUANTS entre les mots collés (ex: "Salutà tous" → "Salut à tous")
4. Corrige les phrases qui ne se terminent pas par . ! ? (ajoute la ponctuation)
5. ✅ Conserve 100 % du contenu existant — améliore et corrige sans supprimer.
6. Conserve TOUS les widgets (<script>, <aside class="affiliate-module">), liens, blockquotes, et structure HTML${improveTruthPackBlock}${improveAngleBlock}
9. ✅ Enrichis les analyses et arbitrages existants — les nouveaux exemples ou anecdotes doivent être tracés à la source.

ANOMALIES À CORRIGER:
${correctionInstructions.map((instr, i) => `${i + 1}. ${instr}`).join('\n')}

CORRECTIONS SUPPLEMENTAIRES (si detectees) :
- Si l'article contient moins de 2 citations « ... » (guillemets francais), ajoute des citations pertinentes issues du temoignage en format : "Un voyageur explique : « citation »".
- Si tu detectes des phrases robotiques ("il est important de", "il convient de", "force est de constater", "il va sans dire", "en ce qui concerne"), reformule-les en langage naturel avec tutoiement.
- Utilise TOUJOURS le tutoiement ("tu", "ton", "ta") — jamais "vous", "il faut" ou "on doit" de maniere impersonnelle.
- REPETITIONS : Si deux paragraphes expriment la meme idee ou le meme conseil (meme reformule), SUPPRIME le second et ne garde que le meilleur des deux.

CONTRAINTES DE SORTIE :
- ✅ Retourne le HTML brut directement — commence par la première balise, sans wrapper markdown.
- ✅ Le résultat contient uniquement le HTML corrigé, sans explication ni commentaire.
- ✅ Prix uniquement sourcés : chaque montant vient de l'article original. Pour un coût non sourcé, reformule sans montant.
- ✅ Convertis les montants USD en euros (taux ~0.92). Exemple : «$500» → «~460 €».
- ✅ Conserve les attributs HTML, les sections et les paragraphes existants.
- ✅ Utilise uniquement les lieux et prix déjà dans l'article original.
- ✅ Garde les H2 structurels tels quels : «Ce qu'il faut retenir», «Les erreurs fréquentes», «FAQ», «Nos recommandations». Si un H2 contient «guides ne disent pas» ou «guides classiques» de manière générique, reformule-le pour nommer la destination ET un sujet précis (pattern : «Le [sujet] de [destination] que les guides occultent»).

FORMAT DE RÉPONSE (CRITIQUE):
- Retourne L'INTÉGRALITÉ du contenu HTML corrigé — du premier au dernier caractère.
- Le contenu retourné DOIT avoir une longueur similaire à l'entrée (±10%).
- Commence directement par la première balise HTML (<h2>, <div>, <p>).
- ✅ Retourne L'INTÉGRALITÉ du contenu HTML — du premier au dernier caractère, longueur similaire à l'entrée (±10%).`;

    // PROTECTION: Remplacer les liens internes par des placeholders avant envoi au LLM
    // Le LLM strip systématiquement les <a> tags et laisse le texte nu
    const linkPlaceholders = new Map();
    let linkCounter = 0;
    let protectedContent = rawContent.replace(/<a\s+href="[^"]*flashvoyage[^"]*"[^>]*>[\s\S]*?<\/a>/gi, (match) => {
      const key = `__ILINK_${linkCounter++}__`;
      linkPlaceholders.set(key, match);
      return key;
    });
    if (linkCounter > 0) {
      console.log(`   🔗 ${linkCounter} lien(s) interne(s) protégé(s) avant LLM`);
    }

    const userPrompt = `Corrige les anomalies dans ce contenu HTML pour l'article sur "${destination}" (thème: ${theme}).
IMPORTANT: Le contenu fait ${protectedContent.length} caractères. Ta réponse doit faire une longueur SIMILAIRE (retourne TOUT le contenu, pas juste les parties modifiées).
IMPORTANT: Les tokens __ILINK_N__ sont des liens internes protégés. NE LES MODIFIE PAS, NE LES SUPPRIME PAS, garde-les exactement tels quels.

${protectedContent}`;

    try {
      const responseData = await callOpenAIWithRetry({
        apiKey: this.apiKey,
        _trackingStep: 'autocritique-pass2',
        body: {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 16000,
          temperature: 0.3
        },
        sourceText: rawContent,
        article: { content: rawContent },
        type: 'improvement'
      });

      if (!responseData.choices?.[0]?.message?.content) {
        console.warn('⚠️ Passe 2: Réponse LLM invalide, utilisation du contenu original');
        return rawContent;
      }

      let improvedContent = responseData.choices[0].message.content.trim();
      
      // POST-PROCESSING: Supprimer les wrappers markdown si présents
      // Pattern: ```html...``` ou ```...``` (même avec espaces/newlines avant)
      if (/^\s*```/.test(improvedContent)) {
        console.log('   ⚠️ Passe 2: Suppression wrapper markdown détecté');
        improvedContent = improvedContent.replace(/^\s*```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      // Nettoyage global: toutes les occurrences de ``` dans le texte
      improvedContent = improvedContent.replace(/```(?:html)?\s*\n?/g, '').replace(/\n?```\s*$/g, '');
      
      // POST-PROCESSING: Corriger les espaces manquants courants
      improvedContent = improvedContent
        .replace(/([a-zàâäéèêëïîôùûüÿç])([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ])/g, '$1 $2') // motMot → mot Mot
        .replace(/([a-zàâäéèêëïîôùûüÿç]{2,})([àâäéèêëïîôùûüÿç])/g, (match, p1, p2) => {
          // Corriger les mots collés comme "toujoursété" → "toujours été"
          // Seulement si ça crée un mot français valide
          return match;
        });
      
      // RESTAURATION: Réinsérer les liens internes protégés
      let restoredLinks = 0;
      for (const [placeholder, original] of linkPlaceholders) {
        if (improvedContent.includes(placeholder)) {
          improvedContent = improvedContent.replace(placeholder, original);
          restoredLinks++;
        } else {
          // Le LLM a supprimé le placeholder — le texte de l'ancre est peut-être en clair
          const anchorText = original.replace(/<[^>]+>/g, '').trim();
          if (anchorText && improvedContent.includes(anchorText)) {
            improvedContent = improvedContent.replace(anchorText, original);
            restoredLinks++;
            console.log(`   🔗 Lien restauré depuis texte nu: "${anchorText.substring(0, 40)}..."`);
          }
        }
      }
      if (linkPlaceholders.size > 0) {
        console.log(`   🔗 ${restoredLinks}/${linkPlaceholders.size} lien(s) interne(s) restauré(s)`);
      }

      // Validation: le contenu amélioré ne doit pas être significativement plus court
      if (improvedContent.length < rawContent.length * 0.65) {
        console.warn(`⚠️ Passe 2: Contenu amélioré trop court (${improvedContent.length} < ${rawContent.length * 0.65}), utilisation de l'original`);
        return rawContent;
      }

      console.log(`   ✅ Contenu amélioré: ${rawContent.length} → ${improvedContent.length} caractères (${anomalies.length} anomalies traitées)`);
      return improvedContent;

    } catch (error) {
      console.error(`❌ Passe 2: Erreur LLM: ${error.message}, utilisation du contenu original`);
      return rawContent; // Fallback sur le contenu original en cas d'erreur
    }
  }

  // Génération de contenu simple en cas d'erreur - UNIQUEMENT avec vraies données
  async generateSimpleContent(article, analysis) {
    try {
      const fullContent = await this.extractFullContent(article);
      
      // Vérifier qu'on a du vrai contenu
      if (!fullContent || fullContent.length < 100) {
        throw new Error(`CONTENU INSUFFISANT: Impossible d'extraire le contenu de "${article.title}". Refus de publier.`);
      }
      
      const simplePrompt = `Crée un article FlashVoyages basé sur ce témoignage Reddit RÉEL:

TITRE REDDIT: ${article.title}
CONTENU REDDIT COMPLET: ${fullContent.substring(0, 1200)}

IMPORTANT: Utilise UNIQUEMENT les informations du témoignage Reddit fourni. Ne pas inventer de citations ou de données.

Génère un article complet avec:
1. Introduction FOMO basée sur le contenu réel
2. Citations directes du Reddit (extrait du contenu fourni) avec attribution complète
3. Transitions du narrateur
4. Scènes sensorielles basées sur le témoignage
5. Questions rhétoriques
6. Enseignements pratiques

FORMAT CITATIONS OBLIGATOIRE EXACT (en string simple):
<blockquote>Citation textuelle du Reddit...</blockquote>
<p>Témoignage de [nom_utilisateur] sur [source]</p>

EXEMPLE:
<blockquote>J'ai commencé avec 2500€/mois et maintenant je gagne 12000€/mois</blockquote>
<p>Témoignage de u/nomade_indonesie sur Reddit</p>

IMPORTANT: Génère les citations comme des strings simples, pas des objets JSON

Format HTML: <h2>, <h3>, <p>, <blockquote>, <ul><li>, <strong>
Longueur: 700-1000 mots
Titre en français

Réponse JSON:`;

      const responseData = await callOpenAIWithRetry({
        apiKey: this.apiKey,
        _trackingStep: 'title-coherence',
        body: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: simplePrompt }],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" }
        },
        sourceText: article.content || article.source_text || '',
        article: article,
        type: 'generation'
      });

      // Vérifier que la réponse contient du contenu
      if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message || !responseData.choices[0].message.content) {
        throw new Error('Réponse LLM invalide: contenu manquant (generateSimpleContent)');
      }
      
      const rawContent = responseData.choices[0].message.content;
      const finishReason = responseData.choices[0].finish_reason;
      if (finishReason === 'length') {
        console.warn('⚠️ Réponse LLM tronquée (finish_reason=length) dans generateSimpleContent - Tentative de réparation JSON');
      }
      
      const content = safeJsonParse(rawContent, 'call2_response');
      console.log('✅ Contenu simple généré avec vraies données:', Object.keys(content));
      return content;

    } catch (error) {
      console.error('❌ Erreur génération simple:', error.message);
      // Refuser de publier plutôt que de créer du faux contenu
      throw new Error(`ERREUR TECHNIQUE: Impossible de générer le contenu pour "${article.title}". Refus de publier du contenu générique.`);
    }
  }

  // Obtenir le prompt selon le type de contenu
  getPromptByType(typeContenu, article, analysis, fullContent) {
    const basePrompt = `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE SOURCE COMPLET:
- Titre: ${article.title}
- Source: ${article.source}
- Contenu complet: ${fullContent.substring(0, 800)}
- Lien: ${article.link}

ANALYSE ÉDITORIALE:
- Type: ${analysis.type_contenu}
- Sous-catégorie: ${analysis.sous_categorie}
- Angle: ${analysis.angle}
- Audience: ${analysis.audience}
- Destination: ${analysis.destination}
- Mots-clés: ${analysis.keywords}
- CTA: ${analysis.cta}

MISSION: Créer un article éditorial de qualité qui transforme cette source en contenu FlashVoyages.

GUIDELINES FLASHVOYAGES:
- Cible: Digital nomades et voyageurs passionnés d'Asie
- Objectif: Valeur ajoutée, conseils pratiques, économies concrètes
- Structure: H2/H3, listes, sections, CTA
- Signature: "Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie."

INSTRUCTIONS SPÉCIFIQUES:
1. EXTRACTION DE DONNÉES: Utilise les informations spécifiques de l'article source
2. PERSONNALISATION: Adapte le contenu à l'audience ciblée
3. VALEUR AJOUTÉE: Ajoute des conseils pratiques et des astuces
4. STRUCTURE: Utilise des H2/H3 pour organiser, des listes pour les détails
5. SPÉCIFICITÉ: Évite les généralités, utilise des données précises
6. LONGUEUR: MINIMUM 1200 mots, IDÉAL 1500-2000 mots. Développe chaque section en profondeur avec des exemples concrets, des chiffres, des conseils actionnables. Un article court ne rankera pas en SEO

CONTENU REQUIS:
1. Titre accrocheur (sans emoji, avec mention "témoignage Reddit" à la fin)
2. Introduction FOMO + Curation FlashVoyages (OBLIGATOIRE)
   Format: Crée une intro spécifique basée sur le contenu réel. Utilise les mots-clés, destinations, et expériences du témoignage. Évite les formules génériques.
   Exemples:
   - "Un nomade digital partage comment il a transformé sa vie en Thaïlande, découvrant de nouvelles saveurs et une nouvelle facette de lui-même."
   - "Un voyageur révèle les leçons apprises lors de son aventure en Asie, où chaque rencontre est devenue une leçon de vie."
3. Développement structuré selon le type
4. Conseils pratiques et concrets
5. CTA spécifique
6. Signature FlashVoyages

FORMAT HTML OBLIGATOIRE:
- Utilise <h2> pour les titres principaux (PAS ##)
- Utilise <h3> pour les sous-titres (PAS ###)
- Utilise <p> pour les paragraphes
- Utilise <ul><li> pour les listes
- Utilise <strong> pour le gras
- ✅ Utilise exclusivement le format HTML (<h2>, <h3>, <strong>, etc.)

RÉPONDRE UNIQUEMENT EN JSON VALIDE:`;

    // Prompts spécialisés par type
    switch (typeContenu) {
      case 'TEMOIGNAGE_SUCCESS_STORY':
        return basePrompt + `
{
  "title": "🌍 ${article.title} - Témoignage Reddit décrypté par FlashVoyages",
  "target_audience": "${analysis.audience}",
  "ton": "Inspirant, motivant, authentique",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Introduction → Défi → Stratégie → Résultats → Conseils"
}`;

      case 'TEMOIGNAGE_ECHEC_LEÇONS':
        return basePrompt + `
{
  "title": "⚠️ Mon échec en {destination} : {erreur} et les leçons apprises",
  "target_audience": "${analysis.audience}",
  "ton": "Humble, préventif, éducatif",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "STRUCTURE IMMERSIVE TÉMOIGNAGE (même que SUCCESS_STORY):
  
  1. INTRODUCTION FOMO + CURATION (OBLIGATOIRE) - Spécifique au contenu réel
  2. TÉMOIGNAGE AVEC CITATIONS DIRECTES (OBLIGATOIRE) - 3 citations minimum, source mentionnée UNE FOIS
  3. TRANSITIONS NARRATEUR (OBLIGATOIRE) - Variantes pour éviter répétitions
  4. CONSEILS PRATIQUES (OBLIGATOIRE) - Basés sur l'expérience réelle, actionnables
  5. QUESTIONS RHÉTORIQUES (OBLIGATOIRE) - Spécifiques au contenu
  6. VARIATION DU RYTHME (OBLIGATOIRE) - Évite les formules répétitives
  7. CONTEXTE DES CITATIONS (OBLIGATOIRE)
  8. MISE EN PERSPECTIVE (OBLIGATOIRE)
  
  TON: Humble, préventif, éducatif. L'émotion doit émerger du contenu.
  FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <em>, <strong>. ✅ Format HTML uniquement.
  LONGUEUR: MINIMUM 1200 mots, IDÉAL 1500-2000 mots. Développe chaque section en profondeur avec des détails concrets."
}`;

      case 'TEMOIGNAGE_TRANSITION':
        return basePrompt + `
{
  "title": "🔄 Ma transition de {situation_avant} à {situation_apres} en {destination}",
  "target_audience": "${analysis.audience}",
  "ton": "Réfléchi, adaptatif, encourageant",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "IMPORTANT: Analyse le contenu RÉEL de l'article source et adapte le contenu en conséquence.

  Si l'article parle de:
  - Rêve réalisé → Structure: Rêve → Défis → Réalisation → Conseils
  - Transition de vie → Structure: Avant → Pendant → Après → Leçons
  - Défis surmontés → Structure: Problème → Solutions → Résultats → Conseils
  
  STRUCTURE:
  1. Introduction FOMO: "Pendant que vous hésitez, d'autres agissent. Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui montre comment [transformation]."
  2. Citations directes du Reddit (3+ en <blockquote> avec attribution complète)
  3. Transitions du narrateur
  4. Mise en perspective
  
  TON: Réfléchi, adaptatif, encourageant. L'émotion doit émerger du contenu réel.
  FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <em>, <strong>. ✅ Format HTML uniquement.
  LONGUEUR: MINIMUM 1200 mots, IDÉAL 1500-2000 mots. Développe chaque section en profondeur avec des détails concrets."
}`;

      case 'TEMOIGNAGE_COMPARAISON':
        return basePrompt + `
{
  "title": "⚖️ {destination_a} vs {destination_b} : mon expérience comparative",
  "target_audience": "${analysis.audience}",
  "ton": "Comparatif, objectif, informatif",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "STRUCTURE IMMERSIVE TÉMOIGNAGE (même que SUCCESS_STORY):
  
  1. INTRODUCTION FOMO + CURATION (OBLIGATOIRE) - Spécifique au contenu réel
  2. TÉMOIGNAGE AVEC CITATIONS DIRECTES (OBLIGATOIRE) - 3 citations minimum, source mentionnée UNE FOIS
  3. TRANSITIONS NARRATEUR (OBLIGATOIRE) - Variantes pour éviter répétitions
  4. CONSEILS PRATIQUES (OBLIGATOIRE) - Basés sur l'expérience réelle, actionnables
  5. QUESTIONS RHÉTORIQUES (OBLIGATOIRE) - Spécifiques au contenu
  6. VARIATION DU RYTHME (OBLIGATOIRE) - Évite les formules répétitives
  7. CONTEXTE DES CITATIONS (OBLIGATOIRE)
  8. MISE EN PERSPECTIVE (OBLIGATOIRE)
  
  TON: Comparatif, objectif, informatif. L'émotion doit émerger du contenu.
  FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <em>, <strong>. ✅ Format HTML uniquement.
  LONGUEUR: MINIMUM 1200 mots, IDÉAL 1500-2000 mots. Développe chaque section en profondeur avec des détails concrets."
}`;

      case 'GUIDE_PRATIQUE':
        return basePrompt + `
{
  "title": "📋 Guide complet : {sujet} en {destination}",
  "target_audience": "${analysis.audience}",
  "ton": "Pratique, utilitaire, actionnable",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Introduction → Étapes détaillées → Conseils → Ressources → Conclusion"
}`;

      case 'COMPARAISON_DESTINATIONS':
        return basePrompt + `
{
  "title": "🏆 {destination_a} vs {destination_b} : Le guide définitif pour nomades",
  "target_audience": "${analysis.audience}",
  "ton": "Analytique, objectif, informatif",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Introduction → Critères → Analyse détaillée → Tableau comparatif → Recommandation"
}`;

      case 'ACTUALITE_NOMADE':
        // Détecter si c'est une actualité professionnelle (CNN, Skift) ou un témoignage Reddit
        const isProfessionalNews = article.source && 
          (article.source.toLowerCase().includes('cnn') || 
           article.source.toLowerCase().includes('skift') || 
           article.source.toLowerCase().includes('travel news') ||
           article.type === 'news');
        
        if (isProfessionalNews) {
          // Template pour actualités professionnelles (CNN, Skift)
          return basePrompt + `
{
  "title": "${article.title} : Ce que cela signifie pour les nomades en ${analysis.destination || 'Asie'}",
  "target_audience": "${analysis.audience}",
  "ton": "Informé, réactif, pratique, expert",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "IMPORTANT: Génère un article d'ACTUALITÉ professionnelle de 600-800 mots minimum avec cette structure:
  
  <p><strong>Source :</strong> <a href=\"${article.link}\" target=\"_blank\" rel=\"noopener\">${article.title}</a> - ${article.source}</p>
  
  <h2>L'actualité en bref</h2>
  <p>Résume l'actualité de manière claire et factuelle (100-150 mots): Quel est l'événement? Quand s'est-il produit? Où? Qui est concerné? Utilise des données concrètes du texte source.</p>
  
  <h2>Impact pour les nomades digitaux</h2>
  <p>Analyse l'impact concret pour la communauté nomade (150-200 mots): Comment cette actualité affecte-t-elle les nomades? Quelles sont les implications pratiques? Utilise des exemples concrets.</p>
  
  <h2>Actions à prendre immédiatement</h2>
  <p>Liste 4-6 actions concrètes à prendre (150-200 mots):</p>
  <ul>
    <li>Action 1 : Description détaillée avec explication pratique</li>
    <li>Action 2 : Description détaillée avec explication pratique</li>
    <li>Action 3 : Description détaillée avec explication pratique</li>
    <li>Action 4 : Description détaillée avec explication pratique</li>
  </ul>
  
  <h2>Conseils pratiques FlashVoyages</h2>
  <p>Ajoute 3-5 conseils pratiques spécifiques basés sur l'actualité (150-200 mots): Comment adapter sa stratégie? Quelles précautions prendre? Comment optimiser sa situation?</p>
  
  <h3>Préparer votre voyage</h3>
  <p>IMPORTANT: Mentionne OBLIGATOIREMENT les aspects pratiques du voyage liés à cette actualité (50-100 mots):
  - Comment se rendre sur place (vols, routes aériennes impactées)
  - Où loger une fois sur place (types d'hébergement, quartiers recommandés)
  - Budget transport et logement estimé
  Cela permettra d'insérer des outils de comparaison utiles pour le lecteur.</p>
  
  <p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie.</em></p>
  
  TON: Journalistique, factuel, mais avec une approche pratique pour nomades. Évite les formules génériques, utilise les données précises de l'actualité source."
}`;
        } else {
          // Template pour témoignages Reddit (fallback)
          return basePrompt + `
{
  "title": "${article.title} : Témoignage Reddit et analyse FlashVoyages",
  "target_audience": "${analysis.audience}",
  "ton": "Informé, réactif, pratique, personnel",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "IMPORTANT: Génère un article COMPLET de 500-700 mots minimum avec cette structure détaillée:
  
  <p><strong>Source :</strong> <a href=\"${article.link}\" target=\"_blank\" rel=\"noopener\">${article.title}</a> - ${article.source}</p>
  
  <h2>Le contexte du témoignage</h2>
  <p>Développe le contexte complet (100-150 mots): Qui est la personne? Quelle est sa situation? Pourquoi ce témoignage est important?</p>
  
  <h2>L'expérience détaillée</h2>
  <p>Décris l'expérience en détail (150-200 mots): Les faits concrets, les chiffres, les dates, les lieux précis, les défis rencontrés</p>
  
  <h2>Les leçons et conseils pratiques</h2>
  <p>Liste 5-7 conseils actionnables (150-200 mots):</p>
  <ul>
    <li>Conseil 1 avec explication détaillée</li>
    <li>Conseil 2 avec explication détaillée</li>
    <li>Conseil 3 avec explication détaillée</li>
    <li>Conseil 4 avec explication détaillée</li>
    <li>Conseil 5 avec explication détaillée</li>
  </ul>
  
  <h2>Les actions à prendre maintenant</h2>
  <p>Donne des actions concrètes (100-150 mots): Que faire immédiatement? Quelles ressources utiliser? Comment se préparer?</p>
  
  <h3>Préparer votre voyage</h3>
  <p>IMPORTANT: Mentionne OBLIGATOIREMENT les aspects pratiques du voyage (50-100 mots):
  - Comment se rendre sur place (vols, routes aériennes)
  - Où loger une fois sur place (types d'hébergement, quartiers recommandés)
  - Budget transport et logement estimé
  Cela permettra d'insérer des outils de comparaison utiles pour le lecteur.</p>
  
  <p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie.</em></p>"
}`;
        }

      case 'CONSEIL_PRATIQUE':
        return basePrompt + `
{
  "title": "💡 {astuce} : Comment {bénéfice} en {destination}",
  "target_audience": "${analysis.audience}",
  "ton": "Expert, confident, pratique",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Problème → Solution → Bénéfices → Mise en pratique → Ressources"
}`;

      default:
        return basePrompt + `
{
  "title": "🌏 {sujet} : Guide nomade pour {destination}",
  "target_audience": "${analysis.audience}",
  "ton": "Expert, confident, pratique",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Introduction → Développement → Conseils → Conclusion"
}`;
    }
  }

  // Sélection intelligente du contenu Reddit
  async selectSmartContent(article) {
    try {
      const fullContent = await this.extractFullContent(article);
      
      // Analyser le contenu pour extraire les éléments clés
      const lines = fullContent.split('\n').filter(line => line.trim().length > 0);
      
      // Identifier les meilleures citations (phrases avec "I", "We", "My", etc.)
      const personalQuotes = lines.filter(line => 
        /^(I|We|My|Our|I'm|We're|I've|We've)/.test(line.trim()) && 
        line.length > 20 && 
        line.length < 30
      );
      
      // Identifier les détails clés (chiffres, résultats, conseils)
      const keyDetails = lines.filter(line => 
        /\d+/.test(line) || 
        /(success|failed|learned|advice|tip|recommend|suggest)/i.test(line)
      );
      
      // Identifier le contexte essentiel (première phrase, dernière phrase)
      const context = [
        lines[0], // Première phrase
        lines[lines.length - 1] // Dernière phrase
      ].filter(Boolean);
      
      // Construire le contenu sélectionné
      const selectedContent = [
        ...context,
        ...personalQuotes.slice(0, 3), // Top 3 citations personnelles
        ...keyDetails.slice(0, 2) // Top 2 détails clés
      ].join('\n\n');
      
      console.log(`🎯 Contenu sélectionné: ${selectedContent.length} caractères (${personalQuotes.length} citations, ${keyDetails.length} détails)`);
      return selectedContent;
      
    } catch (error) {
      console.log('⚠️ Erreur sélection intelligente, utilisation du contenu complet');
      return await this.extractFullContent(article);
    }
  }

  // Extraction du contenu complet (B) Ne jamais refetch si source_text disponible
  async extractFullContent(article) {
    try {
      // B) Si source_text existe et >200 chars, utiliser directement
      if (article.source_text && article.source_text.length > 200) {
        console.log(`✅ SOURCE_TEXT_FROM_FIXTURES: len=${article.source_text.length}`);
        return article.source_text;
      }
      
      if (!article.link || article.link.includes('news.google.com')) {
        console.log('⚠️ Lien Google News - Utilisation du contenu disponible');
        return article.content || article.source_text || 'Contenu non disponible';
      }

      console.log('🔍 Extraction du contenu complet de l\'article source...');
      
      const isDryRun = DRY_RUN;
      const forceOffline = FORCE_OFFLINE;
      
      // En DRY_RUN/FORCE_OFFLINE, ne pas faire de fetch réseau si on a un fallback
      if ((isDryRun || forceOffline) && article.content && article.content.length > 200) {
        console.log('⚠️ DRY_RUN/FORCE_OFFLINE: utilisation contenu disponible sans fetch réseau');
        return article.content;
      }
      
      try {
      const response = await axios.get(article.link, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 10000
      });

      const html = response.data;
      const contentMatch = html.match(/<article[^>]*>(.*?)<\/article>/s) || 
                          html.match(/<main[^>]*>(.*?)<\/main>/s) ||
                          html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/s);
      
      if (contentMatch) {
        const content = contentMatch[1]
          .replace(/<script[^>]*>.*?<\/script>/gs, '')
          .replace(/<style[^>]*>.*?<\/style>/gs, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        console.log(`✅ Contenu extrait: ${content.length} caractères`);
        return content.substring(0, 3000);
      }

      console.log('⚠️ Impossible d\'extraire le contenu - Utilisation du contenu disponible');
        return article.content || article.source_text || 'Contenu non disponible';
      } catch (error) {
        const status = error.response?.status;
        console.log(`⚠️ SOURCE_CONTENT_FETCH_FAIL: status=${status || 'unknown'} url=${article.link} reason=${error.message}`);
        
        // Si 403/429 et DRY_RUN, utiliser fallback minimal
        if ((status === 403 || status === 429) && isDryRun) {
          const fallback = article.content || article.source_text || (article.title ? `${article.title}\n\n${article.title}` : 'Contenu non disponible');
          if (fallback.length > 200) {
            console.log(`⚠️ Utilisation fallback dégradé: len=${fallback.length}`);
            article.is_degraded_source = true;
            return fallback;
          }
        }
        
        // Fallback final
        return article.content || article.source_text || 'Contenu non disponible';
      }
    } catch (error) {
      console.log(`⚠️ Erreur extraction contenu: ${error.message}`);
      return article.content || article.source_text || 'Contenu non disponible';
    }
  }

  // Analyse de fallback quand OpenAI n'est pas disponible
  getFallbackAnalysis(article) {
    console.log('🔄 Utilisation de l\'analyse de fallback...');
    
    const title = article.title.toLowerCase();
    const content = (article.content || '').toLowerCase();
    const text = `${title} ${content}`;
    
    // Détection de type de contenu
    let typeContenu = 'CONSEIL_PRATIQUE';
    if (text.includes('success') || text.includes('réussite') || text.includes('doublé')) {
      typeContenu = 'TEMOIGNAGE_SUCCESS_STORY';
    } else if (text.includes('erreur') || text.includes('échec') || text.includes('mistake')) {
      typeContenu = 'TEMOIGNAGE_ECHEC_LEÇONS';
    } else if (text.includes('transition') || text.includes('changement') || text.includes('devenir')) {
      typeContenu = 'TEMOIGNAGE_TRANSITION';
    } else if (text.includes('vs') || text.includes('comparaison') || text.includes('compare')) {
      typeContenu = 'TEMOIGNAGE_COMPARAISON';
    } else if (text.includes('guide') || text.includes('comment') || text.includes('tutorial')) {
      typeContenu = 'GUIDE_PRATIQUE';
    } else if (text.includes('news') || text.includes('nouvelle') || text.includes('réglementation')) {
      typeContenu = 'ACTUALITE_NOMADE';
    }
    
    // Détection de sous-catégorie
    let sousCategorie = 'général';
    if (text.includes('visa') || text.includes('résidence')) {
      sousCategorie = 'visa';
    } else if (text.includes('coliving') || text.includes('logement')) {
      sousCategorie = 'logement';
    } else if (text.includes('transport') || text.includes('vol')) {
      sousCategorie = 'transport';
    } else if (text.includes('santé') || text.includes('assurance')) {
      sousCategorie = 'santé';
    } else if (text.includes('budget') || text.includes('coût')) {
      sousCategorie = 'finance';
    }
    
    // Détection d'audience
    let audience = 'nomades_generaux';
    if (text.includes('débutant') || text.includes('premier')) {
      audience = 'nomades_debutants';
    } else if (text.includes('expert') || text.includes('avancé')) {
      audience = 'nomades_experts';
    } else if (text.includes('famille')) {
      audience = 'nomades_famille';
    }
    
    return {
      type_contenu: typeContenu,
      type: typeContenu, // Verrouiller le type pour le plan de widgets
      sous_categorie: sousCategorie,
      angle: 'pratique',
      audience: audience,
      destination: this.extractDestinations(text),
      urgence: 'medium',
      keywords: this.extractKeywords(text),
      cta: 'Découvrez nos guides nomades Asie',
      pertinence: 70,
      recommandation: 'generation_llm',
      template_specifique: 'generic',
      raison: 'Analyse de fallback basée sur les mots-clés'
    };
  }

  // Extraire les mots-clés du texte
  extractKeywords(text) {
    const keywords = [];
    const nomadKeywords = ['nomad', 'digital nomad', 'remote work', 'coliving', 'coworking', 'visa', 'résidence', 'fiscal'];
    // Mots-clés conceptuels (pas des lieux → pas besoin de BDD)
    const conceptKeywords = ['asia', 'asie', 'budget', 'backpack', 'solo travel', 'expatriation'];
    
    nomadKeywords.forEach(keyword => {
      if (text.includes(keyword)) keywords.push(keyword);
    });
    
    conceptKeywords.forEach(keyword => {
      if (text.includes(keyword)) keywords.push(keyword);
    });
    
    // Détecter dynamiquement les pays/villes via la BDD OpenFlights
    const words = text.toLowerCase().split(/[\s,;.()]+/).filter(w => w.length > 3);
    const seen = new Set();
    for (const word of words) {
      if (!seen.has(word) && isKnownLocation(word) && !keywords.includes(word)) {
        keywords.push(word);
        seen.add(word);
      }
      if (keywords.length >= 5) break;
    }
    
    return keywords.slice(0, 5).join(', ');
  }

  // Extraire les destinations du texte (via BDD OpenFlights, plus de liste hardcodée)
  extractDestinations(text) {
    const destinations = [];
    const words = text.toLowerCase().split(/[\s,;.()]+/).filter(w => w.length > 2);
    const seen = new Set();
    
    for (const word of words) {
      if (!seen.has(word) && isKnownLocation(word)) {
        destinations.push(word);
        seen.add(word);
      }
    }
    
    const result = destinations.length > 0 ? destinations.join(', ') : 'Asie';
    return result;
  }

  // Contenu de fallback - UNIQUEMENT si erreur technique, PAS de fausses données
  getFallbackContent(article, analysis) {
    // Si erreur technique, on refuse de publier plutôt que de créer du faux contenu
    throw new Error(`ERREUR TECHNIQUE: Impossible de générer le contenu pour "${article.title}". Refus de publier du contenu générique.`);
  }
}

export default IntelligentContentAnalyzerOptimized;
