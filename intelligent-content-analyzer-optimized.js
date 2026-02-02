#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs';
import { OPENAI_API_KEY, DRY_RUN, FORCE_OFFLINE } from './config.js';
import { extractRedditForAnalysis, isDestinationQuestion, extractMainDestination } from './reddit-extraction-adapter.js';
import { detectRedditPattern } from './reddit-pattern-detector.js';
import { compileRedditStory } from './reddit-story-compiler.js';

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
  
  try {
    return JSON.parse(str);
  } catch (e) {
    // Tentative de réparation si JSON incomplet (tronqué)
    if (e.message.includes('Unexpected end of JSON input') || e.message.includes('end of data')) {
      console.warn(`⚠️ JSON tronqué détecté pour ${label} - Tentative de réparation...`);
      
      // Stratégie 1: Chercher le dernier objet/array valide
      let repaired = str.trim();
      
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
    const preview = str.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`SAFE_JSON_PARSE_FAIL: ${label} msg=${e.message} preview="${preview}"`);
  }
}

// C) Wrapper LLM avec retry + fallback template DRY_RUN
async function callOpenAIWithRetry(config, retries = 3) {
  const timeout = parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10);
  const isDryRun = DRY_RUN;
  const forceOffline = FORCE_OFFLINE;
  
  const backoffDelays = [1000, 3000, 7000];
  
  // En FORCE_OFFLINE, simuler timeout immédiatement
  if (forceOffline && !config.apiKey) {
    console.log(`⚠️ DRYRUN_LLM_FALLBACK_TEMPLATE_USED: reason=FORCE_OFFLINE`);
    return generateTemplateFallback(config.sourceText, config.article, config.type);
  }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', config.body, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: timeout
      });
      
      return response.data;
    } catch (error) {
      const isRetryable = error.code === 'ETIMEDOUT' || 
                         error.code === 'ECONNRESET' || 
                         error.response?.status === 429 ||
                         error.response?.status === 401; // Invalid API key
      
      if (isRetryable && attempt < retries) {
        const delay = backoffDelays[attempt - 1];
        console.log(`⚠️ LLM_RETRY: attempt=${attempt}/${retries} reason=${error.code || error.response?.status || 'unknown'} delay=${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Si après retries ça échoue
      if (attempt === retries) {
        if (isDryRun || forceOffline) {
          // Fallback template en DRY_RUN
          console.log(`⚠️ DRYRUN_LLM_FALLBACK_TEMPLATE_USED: reason=${error.code || error.response?.status || 'unknown'}`);
          return generateTemplateFallback(config.sourceText, config.article, config.type);
        } else {
          // En PROD, throw
          throw error;
        }
      }
    }
  }
}

// Fallback template déterministe (C)
function generateTemplateFallback(sourceText, article, type = 'analysis') {
  if (!sourceText || sourceText.length < 200) {
    throw new Error('Fallback template refusé: source_text < 200 chars');
  }
  
  // Extraire phrases clés du source_text
  const sentences = sourceText
    .split(/[.!?]\s+/)
    .filter(s => s.length > 20 && s.length < 200)
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

class IntelligentContentAnalyzerOptimized {
  constructor() {
    this.apiKey = OPENAI_API_KEY;
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
    
    if (blockquotes.length === 0) return html;
    
    // Traduire chaque blockquote
    let translatedHtml = html;
    for (const blockquote of blockquotes) {
      const contentText = blockquote.content.replace(/<[^>]+>/g, '').trim();
      if (contentText.length > 10) {
        const englishDetection = this.detectEnglishContent(contentText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.3) {
          console.log(`   🔄 Traduction blockquote: "${contentText.substring(0, 50)}..." (${Math.round(englishDetection.ratio * 100)}% EN)`);
          const translated = await this.translateToFrench(contentText);
          // Remplacer le contenu du blockquote
          const translatedBlockquote = blockquote.fullMatch.replace(
            blockquote.content,
            `<p>${translated}</p>`
          );
          translatedHtml = translatedHtml.replace(blockquote.fullMatch, translatedBlockquote);
        }
      }
    }
    
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
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini', // Modèle moins cher pour la traduction
        messages: [
          {
            role: 'system',
            content: 'Tu es un traducteur professionnel. Traduis le texte fourni de l\'anglais vers le français. Garde le ton et le style du texte original. Réponds uniquement avec la traduction, sans commentaires.'
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: Math.min(1000, text.length * 2) // Limiter les tokens
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // Timeout court pour la traduction
      });
      
      const translated = response.data.choices[0].message.content.trim();
      console.log(`✅ Texte traduit: ${text.substring(0, 50)}... → ${translated.substring(0, 50)}...`);
      // #region agent log
      const stillEnglish = !/[àâäéèêëïîôùûüÿç]/.test(translated) && /^[A-Z][a-z]+/.test(translated);
      debugLog('intelligent-content-analyzer-optimized.js:322', 'translateToFrench terminé', {originalLength:text.length,translatedLength:translated.length,originalSample:text.substring(0,60),translatedSample:translated.substring(0,60),stillEnglish:stillEnglish}, 'C');
      // #endregion
      return translated;
    } catch (error) {
      console.warn(`⚠️ Erreur lors de la traduction: ${error.message}. Texte non traduit.`);
      // #region agent log
      debugLog('intelligent-content-analyzer-optimized.js:326', 'translateToFrench ERREUR', {error:error.message,textSample:text.substring(0,60)}, 'C');
      // #endregion
      return text; // Retourner le texte original en cas d'erreur
    }
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
        body: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500, // Augmenté pour éviter les troncatures
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
      
      if (!fullContent || fullContent.length < 200) {
        throw new Error(`CONTENU INSUFFISANT: extracted.post.clean_text length=${fullContent.length} < 200`);
      }
      
      // APPEL 1 : Extraction et structure
      console.log('🧠 Appel 1 : Extraction et structure...');
      const extractionResult = await this.extractAndStructure(extracted, analysis, fullContent);
      
      // APPEL 2 : Génération finale
      console.log('🧠 Appel 2 : Génération finale...');
      const finalContent = await this.generateFinalArticle(extractionResult, analysis, extracted, pattern, story);
      
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
CONTENU: ${fullContent.substring(0, 1000)}`;

    console.log(`📏 Taille system: ${systemMessage.length} caractères`);
    console.log(`📏 Taille user: ${userMessage.length} caractères`);

    const responseData = await callOpenAIWithRetry({
      apiKey: this.apiKey,
      body: {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 2000, // Augmenté pour éviter les troncatures
      temperature: 0.7,
      response_format: { type: "json_object" }
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
    if (centralEvent && centralEvent.length > 20 && centralEvent.length < 200) {
      // Extraire la phrase la plus percutante (première phrase ou plus courte)
      const sentences = centralEvent.split(/[.!?]\s+/).filter(s => s.length > 15 && s.length < 100);
      if (sentences.length > 0) {
        // Prioriser les phrases plus courtes (plus percutantes)
        const keySentence = sentences.sort((a, b) => a.length - b.length)[0].trim();
        keyPoints.push({ label: 'Événement clé', value: keySentence });
      }
    } else if (criticalMoment && criticalMoment.length > 20 && criticalMoment.length < 200) {
      const sentences = criticalMoment.split(/[.!?]\s+/).filter(s => s.length > 15 && s.length < 100);
      if (sentences.length > 0) {
        const keySentence = sentences.sort((a, b) => a.length - b.length)[0].trim();
        keyPoints.push({ label: 'Moment décisif', value: keySentence });
      }
    }
    
    // PRIORITÉ 4: RÉSULTAT/RÉSOLUTION (impact)
    const resolution = story?.story?.resolution?.summary;
    if (resolution && resolution.length > 20 && resolution.length < 200) {
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
      const budgetValue = Array.isArray(budgetData) ? budgetData[0] : budgetData;
      // Vérifier que c'est un montant réel (chiffres + devise) et pas "Non spécifié"
      if (budgetValue && typeof budgetValue === 'string' && 
          /[\d€$]/.test(budgetValue) && 
          budgetValue.length < 80 &&
          !/non\s+(spécifié|mentionné|disponible)/i.test(budgetValue)) {
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
  async generateFinalArticle(extraction, analysis, extracted, pattern, story) {
    // Construire la section marketing d'affiliation pour les témoignages
    const isTemoignage = analysis.type_contenu && analysis.type_contenu.startsWith('TEMOIGNAGE_');
    const marketingSection = isTemoignage ? `
16. SECTION "Leçons clés pour les nomades numériques à [DESTINATION]" (OBLIGATOIRE pour témoignages)
   - Crée un H2 exact : "Leçons clés pour les nomades numériques à [NOM DU PAYS/VILLE]"
   - Ajoute 3 à 5 sous-parties (paragraphes ou H3) avec ce schéma :
     - Problème concret tiré du témoignage
     - Leçon actionnable
     - Mention explicite d'un besoin de vol ou de connectivité si pertinent :
       - Vols : phrases du type "Avant de partir / pour organiser votre trajet vers [DESTINATION], comparez les vols vers [DESTINATION] avec un comparateur dédié."
       - Connectivité : phrases du type "Pour éviter les mauvaises surprises avec Internet, équipez-vous d'une eSIM avant d'atterrir à [DESTINATION]."

17. SECTION "Checklist pratique avant de partir pour [DESTINATION]" (OBLIGATOIRE pour témoignages)
   - Crée un H2 exact : "Checklist pratique avant de partir pour [DESTINATION]"
   - Liste 5 à 7 bullet points, dont obligatoirement :
     - un point avec le mot-clé "vols vers [DESTINATION]" ou "comparer les vols"
     - un point avec les mots-clés "eSIM", "connexion internet", "SIM"
     - un point "vérifier le visa / formalités"
   - Le texte doit rester neutre (pas de ton pub), mais contenir ces mots-clés pour que le système de widgets et les sélecteurs de liens puissent accrocher.

18. SECTION FINALE "Préparez votre prochain départ" (OBLIGATOIRE pour témoignages)
   - Crée un H2 exact : "Préparez votre prochain départ"
   - Rédige un paragraphe court (2–3 phrases) qui résume :
     - l'intérêt de planifier les vols
     - l'intérêt d'avoir une eSIM prête
   - NE PAS insérer de <script> dans le texte : juste des phrases incitatives naturelles.
   - À la fin du paragraphe, insère exactement la ligne suivante pour marquer l'emplacement d'un widget vols :
     {{TRAVELPAYOUTS_FLIGHTS_WIDGET}}
   - Si le témoignage mentionne la connexion internet, ajoute en plus une ligne :
     {{TRAVELPAYOUTS_CONNECTIVITY_WIDGET}}` : '';

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

    // Extraire les citations depuis evidence
    const evidenceSnippets = story.evidence?.source_snippets || [];
    const availableCitations = evidenceSnippets
      .filter(s => s.snippet && s.snippet.length > 0)
      .map(s => s.snippet.substring(0, 200))
      .slice(0, 5); // Max 5 citations

    const systemMessage = `Tu es un expert FlashVoyages. Rédige un article engageant basé sur le témoignage Reddit.

📝 RÈGLES POUR LE TITRE (OBLIGATOIRE):
- Format SEO optimisé avec DESTINATION + THÈME/ACTION
- ⚠️ JAMAIS D'EMOJI DANS LE TITRE - Les emojis sont INTERDITS dans les titres H1 et H2
- Exemples BONS:
  ✅ "Visa Nomade Digital en Thaïlande : Mon Retour d'Expérience 2024"
  ✅ "Vivre à Bali avec 1000€/mois : Budget Réaliste pour Nomades"
  ✅ "Arnaque eSIM en Indonésie : Comment je l'ai évitée"
- Exemples MAUVAIS (trop fades ou avec emojis):
  ❌ "Témoignage voyage: retours et leçons"
  ❌ "Mon expérience en Asie"
  ❌ "🎯 Nos recommandations" (emoji interdit)
  ❌ "⚠️ Limites et biais" (emoji interdit)
- Le titre DOIT contenir une destination asiatique précise (ville ou pays)
- Le titre DOIT être actionnable et spécifique

⚠️ RÈGLE ABSOLUE - EMOJIS INTERDITS DANS LES TITRES H2:
- JAMAIS d'emoji au début ou dans un titre H2
- Les emojis sont autorisés UNIQUEMENT dans le corps du texte (paragraphes, listes)
- Exemples CORRECTS: <h2>Limites et biais de ce témoignage</h2>, <h2>Nos recommandations</h2>
- Exemples INTERDITS: <h2>⚠️ Limites et biais</h2>, <h2>🎯 Nos recommandations</h2>, <h2>💬 Ce que dit le témoignage</h2>
- Maximum 70 caractères pour le SEO

⚠️ INTERDICTION DE RÉPÉTER LE BLOCKQUOTE:
- Le blockquote principal apparaît UNE SEULE FOIS dans l'article
- NE JAMAIS répéter le titre du post Reddit dans le corps de l'article

${correctionBlock}
⚠️ CONTRAINTE CRITIQUE ABSOLUE: Ce site est spécialisé ASIE uniquement. 
- NE MENTIONNE JAMAIS de destinations non-asiatiques (Portugal, Espagne, Lisbonne, Barcelone, Madrid, Porto, France, Paris, Italie, Rome, Grèce, Turquie, Istanbul, Europe, Amérique, USA, Brésil, Mexique, etc.)
- Utilise UNIQUEMENT des destinations asiatiques: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
- Si le témoignage mentionne une destination non-asiatique, remplace-la par une destination asiatique équivalente ou ignore-la complètement

🌐 LANGUE OBLIGATOIRE: TOUT le contenu doit être en FRANÇAIS. 
- ❌ INTERDIT ABSOLU: "Indonesia just launched..." → ✅ CORRECT: "L'Indonésie vient de lancer..."
- ❌ INTERDIT ABSOLU: "Thailand LTR visa is available..." → ✅ CORRECT: "Le visa LTR de Thaïlande est disponible..."
- ❌ INTERDIT ABSOLU: "Vietnam doesn't have..." → ✅ CORRECT: "Le Vietnam n'a pas..."
- ❌ INTERDIT ABSOLU: "The regular tourist visa..." → ✅ CORRECT: "Le visa touristique régulier..."
- ❌ INTERDIT ABSOLU: "Requirements are reasonable..." → ✅ CORRECT: "Les exigences sont raisonnables..."
- ❌ INTERDIT ABSOLU: "Essential for Vietnam" → ✅ CORRECT: "Essentiel pour le Vietnam"
- ❌ INTERDIT ABSOLU: "Underestimating" → ✅ CORRECT: "Sous-estimer"
- ❌ INTERDIT ABSOLU: "Not budgeting" → ✅ CORRECT: "Ne pas prévoir de budget"
- ❌ INTERDIT ABSOLU: "Fatigue setting in" → ✅ CORRECT: "La fatigue s'installe"
- ❌ INTERDIT ABSOLU: "Critical Moment" → ✅ CORRECT: "Moment critique"
- ❌ INTERDIT ABSOLU: "What Reddit testimonials" → ✅ CORRECT: "Ce que les témoignages Reddit"
- Traduis TOUS les textes anglais en français AVANT de les mettre dans le JSON
- Ne laisse AUCUN texte en anglais dans le contenu final (0% anglais toléré)
- VÉRIFIE que chaque champ du JSON est en français avant de répondre
- Si tu détectes du texte anglais dans le témoignage source, traduis-le immédiatement
- Les phrases mixtes FR/EN sont INTERDITES - tout doit être 100% français

🚨 GARDE-FOUS EXPLICITES (SOURCE OF TRUTH):
- N'invente aucun fait
- Si une section est absente dans le JSON story, ne la crée pas
- Sépare strictement l'auteur et la communauté
- Priorité absolue à la fidélité de la source
- Toutes les sections doivent être traçables au story.evidence

📐 STRUCTURE OBLIGATOIRE (dans cet ordre exact) :

⚠️ IMPORTANT : Le Quick Guide est une section SÉPARÉE, pas un sous-titre dans une autre section !

0. QUICK GUIDE (OBLIGATOIRE - TOUJOURS EN PREMIER, AVANT TOUT H2)
   - C'est la PREMIÈRE chose que le lecteur voit
   - NE PAS mettre dans une section "Ce que dit le témoignage" ou autre H2
   - Format HTML EXACT (copier tel quel) :
     <div class="quick-guide">
     <h3>Points clés de ce témoignage</h3>
     <ul>
     <li><strong>Destination</strong> : [destination EXACTE du témoignage, ex: Malaisie, Ipoh]</li>
     <li><strong>Durée</strong> : [durée mentionnée dans le témoignage]</li>
     <li><strong>Budget</strong> : [budget si mentionné, sinon "Non spécifié"]</li>
     <li><strong>Type d'expérience</strong> : [nomade digital / backpacking / expatriation / tourisme]</li>
     <li><strong>Difficulté</strong> : [Facile / Moyenne / Difficile]</li>
     </ul>
     </div>

1. CONTEXTE (OBLIGATOIRE - PREMIER H2 DE L'ARTICLE)
   - Reformulation neutre de story.context.summary
   - Pas d'analyse, pas de jugement
   - Si story.context.summary est null → section absente

2. ÉVÉNEMENT CENTRAL (CONDITIONNEL)
   - Basé uniquement sur story.central_event.summary
   - Si null → section absente (ne pas inventer)
   - Reformulation neutre, pas de dramatisation
   - ⚠️ TITRE UNIQUEMENT EN FRANÇAIS : <h2>Événement central</h2> (JAMAIS d'anglais dans le titre)

3. MOMENT CRITIQUE (CONDITIONNEL)
   - Basé uniquement sur story.critical_moment.summary
   - Optionnel, jamais inventé
   - Si null → section absente

4. RÉSOLUTION / SITUATION ACTUELLE (CONDITIONNEL)
   - Basé uniquement sur story.resolution.summary
   - Si null → section absente

5. CE QUE L'AUTEUR RETIENT (CONDITIONNEL)
   - Uniquement story.author_lessons (liste)
   - Liste courte si présente
   - Format: <ul><li>Leçon 1</li><li>Leçon 2</li></ul>
   - Si vide → section absente
   - SÉPARÉ visuellement de la communauté

6. CE QUE LA COMMUNAUTÉ APPORTE (CONDITIONNEL)
   ⚠️ ATTENTION : UNE SEULE FOIS ! Ne JAMAIS créer "Ce que dit la communauté" ou toute variante
   - Séparé visuellement de l'auteur (H2 distinct)
   - Basé uniquement sur story.community_insights
   - Format: <h2>Ce que la communauté apporte</h2><ul><li>Insight 1</li></ul>
   - Si vide → section absente
   - AUCUNE fusion avec l'auteur
   - ❌ NE PAS créer "Ce que dit la communauté" ou "Ce que la communauté apporte (suite)"

7. NOS RECOMMANDATIONS (OBLIGATOIRE - MARKETING-FIRST)
   ⚠️ INTERDICTION ABSOLUE : "Questions ouvertes", "Questions encore ouvertes", "Questions ouvertes", "Questions"
   ⚠️ NE JAMAIS utiliser "Questions ouvertes" - c'est anti-marketing !
   ⚠️ Si tu génères "Questions ouvertes", l'article sera REJETÉ
   ⚠️ TOUJOURS utiliser "Nos recommandations" (SANS EMOJI dans le H2)
   - TOUJOURS donner des recommandations FERMES et ACTIONNABLES
   - Format: <h2>Nos recommandations : Par où commencer ?</h2> (PAS d'emoji)
   - Structure: 3 options classées (#1, #2, #3)
   - Pour chaque option: budget réaliste, avantages, inconvénients
   - Inclure CTAs clairs: "Voir les forfaits", "Comparer les prix", etc.
   - Budgets RÉALISTES (jamais < 700 USD/mois pour Asie)
   
   ⚠️ RECOMMANDATIONS COHÉRENTES AVEC LE SUJET DE L'ARTICLE (CRITIQUE - VALIDATION STRICTE):
   - Les recommandations DOIVENT être 100% liées à la DESTINATION EXACTE du témoignage
   - EXEMPLE CONCRET pour cet article:
     * Si destination = Malaisie → recommander: Ipoh, Penang, Langkawi, Kuala Lumpur (PAS Vietnam, PAS Thaïlande)
     * Si destination = Vietnam → recommander: Hanoï, Ho Chi Minh, Da Nang, Hoi An (PAS Bali, PAS Japon)
     * Si destination = Bali → recommander: Ubud, Canggu, Seminyak, Lombok (PAS Malaisie, PAS Vietnam)
   - JAMAIS de recommandations génériques "Asie" ou destinations sans rapport
   - Les 3 options (#1, #2, #3) doivent être dans le MÊME PAYS ou pays voisin direct
   - Basé sur: extracted.destination, story.context.location
   - ⚠️ VALIDATION LIENS PARTENAIRES (CRITIQUE):
     * Si recommandation = logement/hôtel → lien DOIT pointer vers booking.com (PAS airalo.com, PAS kiwi.com)
     * Si recommandation = vols/avion → lien DOIT pointer vers kiwi.com (PAS airalo.com, PAS booking.com)
     * Si recommandation = eSIM/connexion → lien DOIT pointer vers airalo.com (PAS booking.com, PAS kiwi.com)
   - Les textes des liens ("Voir les forfaits", "Comparer les prix", "En savoir plus") DOIVENT correspondre au type de service

8. CE QUE LES TÉMOIGNAGES REDDIT NE DISENT PAS EXPLICITEMENT (OBLIGATOIRE - SERP)
   ⚠️ CRITIQUE: Cette section est OBLIGATOIRE pour le SEO (15 points SERP)
   - Format: <h2>Ce que les témoignages Reddit ne disent pas explicitement</h2>
   - Contenu: Paragraphe expliquant ce qui manque dans les témoignages Reddit
   - Exemples de ce qui n'est pas dit:
     * Coûts réels détaillés (logement, nourriture, transport)
     * Contraintes administratives (visas, formalités)
     * Impact sur le bien-être mental et physique
     * Temporalité réelle (délais, ajustements)
   - Basé sur: story.evidence ou extracted (ne pas inventer)
   - Si story.evidence manquant → utiliser template générique mais cohérent

9. ANGLES UNIQUES (OBLIGATOIRE - SERP - 30 points)
   ⚠️ CRITIQUE: Inclure TOUS les 3 angles suivants pour score SERP optimal (10 points chacun):
   - Budget détaillé: MENTIONNER EXPLICITEMENT "budget réel", "budget détaillé", "coûts réels", ou "dépenses réelles" - Intégrer dans Contexte, Résolution, ou Nos recommandations
   - Timeline/Chronologie: MENTIONNER EXPLICITEMENT "chronologie", "timeline", "étapes du voyage", "période", ou "durée du séjour" - Intégrer dans Contexte ou Événement central
   - Contraintes réelles: MENTIONNER EXPLICITEMENT "contraintes", "difficultés", "obstacles", "problèmes pratiques", ou "défis" - Intégrer dans Ce que les autres ne disent pas ou Erreurs fréquentes
   - Ces angles doivent être intégrés naturellement dans les sections existantes avec les mots-clés EXACTS ci-dessus
   - Ne pas créer une section séparée, mais les mentionner dans le contenu avec les mots-clés requis

📝 INTERDICTION STRICTE - NE JAMAIS GÉNÉRER DE <blockquote> :
- ❌ INTERDIT TOTAL : <blockquote>, <cite>, <q> ou tout élément similaire
- ❌ MÊME PAS pour des citations Reddit - le système les ajoutera automatiquement
- Si tu génères un <blockquote>, l'article sera REJETÉ
- Citations courtes (≤ 2 lignes) UNIQUEMENT entre guillemets : « ... »
- Attribution : « ... » — ${extracted.author || 'auteur Reddit'}
- Utilise les citations disponibles depuis story.evidence.source_snippets

🎯 TON ET STYLE :
- ${toneGuidance}
- ${emotionalGuidance}
- Thème principal: ${pattern.theme_primary || 'non spécifié'}
- Reformulation neutre, pas de réécriture libre
- Réorganisation stricte à partir du squelette story

🌟 STRUCTURE IMMERSIVE OBLIGATOIRE (15 éléments pour qualité premium) :

1. INTRODUCTION FOMO + CURATION (OBLIGATOIRE)
   - Crée une intro spécifique basée sur le contenu réel du témoignage
   - Utilise les mots-clés, destinations, et expériences mentionnées dans le texte source
   - Évite les formules génériques comme "Pendant que vous..."
   - Focus sur l'expérience concrète du témoignage

2. ANALYSE ÉMOTIONNELLE INTÉGRÉE (PAS DE SECTION SÉPARÉE)
   - ⚠️ INTERDIT : Ne génère PAS de label isolé comme "<p>🧠 Ce que le voyageur a ressenti :</p>" suivi de rien
   - ⚠️ OBLIGATOIRE : Intègre l'analyse émotionnelle DANS le texte narratif de chaque section
   - Exemple CORRECT : "À ce moment-là, le voyageur a probablement ressenti une montée de stress face à cette situation inattendue. L'incompréhension devait être totale..."
   - Exemple INTERDIT : "<p>🧠 Ce que le voyageur a ressenti :</p>" (label seul sans contenu)
   - Fais une interprétation analytique des émotions dans le flux narratif
   - Utilise des formulations comme "probablement ressenti", "sans doute éprouvé", "a dû vivre"

3. ANALYSE COMPORTEMENTALE INTÉGRÉE (PAS DE SECTION SÉPARÉE)
   - ⚠️ INTERDIT : Ne génère PAS de label isolé comme "<p>🧩 Leçon transversale :</p>" suivi de rien
   - ⚠️ OBLIGATOIRE : Intègre l'analyse comportementale DANS le texte narratif
   - Exemple CORRECT : "Cette situation illustre un biais de planification classique : sous-estimer les délais administratifs. C'est une erreur fréquente chez les voyageurs qui..."
   - Exemple INTERDIT : "<p>🧩 Leçon transversale :</p>" (label seul sans contenu)
   - Identifie les biais cognitifs et intègre-les naturellement dans le récit

4. ERREURS À ÉVITER (SECTION COMPLÈTE OBLIGATOIRE)
   - ⚠️ OBLIGATOIRE : Cette section doit avoir un CONTENU COMPLET, pas juste un label
   - Format CORRECT :
     <h3>Ce qu'il aurait fallu faire différemment</h3>
     <p>Pour éviter ces difficultés, voici les actions préventives recommandées :</p>
     <ul>
     <li>Action préventive 1 avec explication</li>
     <li>Action préventive 2 avec explication</li>
     <li>Action préventive 3 avec explication</li>
     </ul>
   - ⚠️ INTERDIT : "<p>⛔️ Ce que le voyageur aurait dû faire :</p>" suivi de rien
   - Transforme chaque erreur en action préventive concrète avec explication

5. CHRONOLOGIE DE L'EXPÉRIENCE (SECTION COMPLÈTE OBLIGATOIRE)
   - ⚠️ OBLIGATOIRE : Cette section doit avoir un CONTENU COMPLET, pas juste un label
   - Format CORRECT :
     <h3>Chronologie du voyage</h3>
     <ul>
     <li><strong>Janvier 2023</strong> : Arrivée à [destination], premières impressions...</li>
     <li><strong>Février 2023</strong> : Découverte de [lieu], rencontre avec...</li>
     <li><strong>Mars 2023</strong> : Incident avec [problème], résolution par...</li>
     </ul>
   - ⚠️ INTERDIT : "<p>📅 Chronologie de l'expérience :</p>" suivi de rien ou d'une liste vide
   - Identifie les dates et événements clés du témoignage
   - Si aucune date précise, utilise des périodes approximatives

6. TRANSITIONS NARRATEUR (OBLIGATOIRE)
   - Utilise les transitions naturelles basées sur le contenu Reddit réel
   - Crée des liens fluides entre les sections
   - Évite les phrases modèles répétitives
   - ÉVITE les pseudos Reddit dans le texte: "Pour [pseudo]", "L'auteur raconte"
   - UTILISE: "Cette expérience", "Ce témoignage", "Son parcours", "Cette approche", "Cette stratégie", "Cette méthode"
   - VARIATION: Après la première citation avec attribution complète, utilise des variantes: "Cette expérience révèle", "Ce témoignage montre", "Son parcours illustre", "Cette approche démontre", "Cette stratégie permet", "Cette méthode révèle"
   - ATTRIBUTION CONTEXTUELLE: Remplace les pseudos Reddit par "Un membre de la communauté r/digitalnomad", "Un voyageur de la communauté Reddit", "Un nomade de la plateforme"

7. QUESTIONS RHÉTORIQUES (OBLIGATOIRE)
   - 2-3 questions par section, focus sur l'action
   - Exemples: "Comment cette approche pourrait-elle vous aider...", "Que feriez-vous si...", "Comment optimiser..."
   - Questions spécifiques au contenu, pas génériques

8. VARIATION DU RYTHME (OBLIGATOIRE)
   - Phrases courtes et percutantes pour l'impact
   - Phrases plus longues pour expliquer et respirer
   - Évite les formules répétitives

9. MISE EN PERSPECTIVE (OBLIGATOIRE)
   - Terminer chaque section par un enseignement pratique
   - Quel piège à éviter, quelle leçon pour le lecteur nomade
   - Transforme chaque section en valeur actionnable

10. GLOSSAIRE IMPLICITE INTÉGRÉ (📖) - CONDITIONNEL
   - ⚠️ CRITIQUE : Cette section doit être générée UNIQUEMENT s'il y a vraiment des termes techniques, acronymes, sigles, ou expressions spécifiques mentionnés dans le témoignage
   - ⚠️ Si aucun terme technique n'est mentionné, NE GÉNÈRE PAS cette section (laisse le champ "glossaire" vide ou null)
   - ⚠️ NE CRÉE PAS de termes inventés ou génériques (comme "D8", "NIF", "SEF") si ils ne sont PAS explicitement mentionnés dans le témoignage
   - Si des termes techniques sont présents, ajoute à la fin du témoignage un glossaire des termes techniques ou spécifiques utilisés
   - Format OBLIGATOIRE EXACT (si des termes techniques sont présents) :
     <p>📖 Termes utilisés dans ce récit :</p>
     <ul>
     <li>Terme : définition</li>
     <li>...</li>
     </ul>
   - Identifie UNIQUEMENT les termes techniques, acronymes, sigles, ou expressions spécifiques RÉELLEMENT mentionnés dans le témoignage
   - Fournit une définition claire et concise pour chaque terme
   - Élève la lisibilité pour les lecteurs moins expérimentés

11. INDEXATION INTERNE STRUCTURÉE (🧭) - CONDITIONNEL
   - ⚠️ CRITIQUE : Cette section doit être générée UNIQUEMENT s'il y a vraiment des ressources (services, sites, démarches) mentionnées dans le témoignage
   - ⚠️ Si aucune ressource n'est mentionnée, NE GÉNÈRE PAS cette section (laisse le champ "indexation" vide ou null)
   - ⚠️ NE CRÉE PAS de ressources inventées ou génériques si elles ne sont PAS explicitement mentionnées dans le témoignage
   - Si des ressources sont mentionnées, ajoute une ancre de référencement pour chaque ressource RÉELLEMENT mentionnée
   - Format OBLIGATOIRE EXACT (si des ressources sont mentionnées) :
     <p>🧭 Ressource mentionnée :</p>
     <ul>
     <li><a href="...">Site officiel [nom]</a></li>
     <li><a href="...">Agence locale X utilisée (non recommandée)</a></li>
     <li>...</li>
     </ul>
   - Identifie UNIQUEMENT les ressources RÉELLEMENT mentionnées dans le témoignage : sites officiels, agences, services, démarches administratives
   - Crée des liens vers les ressources officielles (sites gouvernementaux, services publics, etc.)
   - Pour les agences ou services utilisés mais non recommandés, indique-le clairement dans le libellé du lien
   - Prépare ton propre hub d'autorité en créant une base de liens internes utiles en bas de chaque témoignage

12. CONTEXTE DES CITATIONS (OBLIGATOIRE)
   - Toujours préciser d'où vient la citation (Reddit)
   - Format: "Témoignage de [auteur] sur r/[subreddit]"
   - Mentionne la source UNE SEULE FOIS au début, puis utilise des variantes

13. ENRICHISSEMENT DESTINATIONS (OBLIGATOIRE)
   - ⚠️ CRITIQUE : Ce site est spécialisé ASIE uniquement. NE MENTIONNE JAMAIS de destinations non-asiatiques
   - Intègre subtilement des mentions de destinations spécifiques dans le contenu
   - Utilise UNIQUEMENT des destinations asiatiques: Thaïlande, Vietnam, Indonésie, Japon, Corée du Sud, Philippines, Singapour
   - Mentionne UNIQUEMENT des villes asiatiques: Bangkok, Ho Chi Minh, Bali, Tokyo, Manille, Singapour, Séoul, Canggu, etc.
   - Intègre naturellement dans les conseils et exemples
   - Évite les listes génériques, privilégie les mentions contextuelles

14. CONSEILS PRATIQUES (OBLIGATOIRE)
   - Remplace les descriptions sensorielles par des conseils actionnables
   - Focus sur la valeur ajoutée concrète
   - Utilise des données réelles du témoignage
   - Évite les descriptions génériques et sensationnelles

15. CONTENU SENSORIEL BASÉ SUR TÉMOIGNAGE (OBLIGATOIRE)
   - Utilise les détails sensoriels mentionnés dans le témoignage réel
   - Pas d'invention, uniquement ce qui est mentionné dans la source
   - Renforce l'authenticité et l'immersion

📊 SECTIONS ANALYTIQUES OBLIGATOIRES (pour dépasser les concurrents SERP) :

A. "Limites et biais de ce témoignage" (OBLIGATOIRE)
   - Format: <h2>⚠️ Limites et biais de ce témoignage</h2>
   - Contenu OBLIGATOIRE :
     - Cas non généralisables (situation spécifique, contexte unique)
     - Biais potentiels (biais de confirmation, biais d'optimisme, etc.)
     - Ce que le témoignage ne couvre pas (angles manquants)
     - Distinction claire : faits / ressentis / interprétations
   - **Objectif** : Renforcer E-E-A-T, montrer expertise critique
   - Cette section DOIT être présente dans le JSON sous "limites_biais"

B. "Ce que les témoignages Reddit ne disent pas explicitement" (OBLIGATOIRE - CRITIQUE SERP)
   ⚠️ CRITIQUE: Cette section est OBLIGATOIRE pour le SEO (15 points SERP)
   - Format: <h2>Ce que les témoignages Reddit ne disent pas explicitement</h2> (SANS emoji dans le H2)
   - Contenu OBLIGATOIRE (MINIMUM 2-3 paragraphes avec exemples concrets) :
     - Angles sous-traités par les témoignages (coûts réels cachés, temporalité réelle, contraintes non mentionnées)
     - Coûts réels associés au voyage (logement à long terme, dépenses quotidiennes) - MENTIONNER EXPLICITEMENT "coûts réels", "budget réel", ou "dépenses réelles"
     - Contraintes liées à la fatigue de voyage (impact sur bien-être mental et physique) - MENTIONNER EXPLICITEMENT "contraintes", "difficultés", ou "obstacles"
     - Temporalité réelle du voyage (délais administratifs, ajustements nécessaires) - MENTIONNER EXPLICITEMENT "chronologie", "timeline", ou "étapes du voyage"
     - Questions utilisateur non traitées dans les témoignages
     - Ce que les autres articles n'osent pas dire
   - EXEMPLES CONCRETS À INCLURE :
     * "Les témoignages omettent souvent les coûts réels cachés comme..."
     * "La chronologie réelle du voyage révèle que..."
     * "Les contraintes pratiques non mentionnées incluent..."
   - Basé sur: story.evidence ou extracted (ne pas inventer)
   - Si story.evidence manquant → utiliser template générique mais cohérent avec exemples spécifiques à la destination
   - **Objectif** : Profondeur analytique, valeur ajoutée unique
   - Cette section DOIT être présente dans le JSON sous "ce_que_les_autres_ne_disent_pas"

C. "Erreurs fréquentes signalées par les voyageurs" (OBLIGATOIRE si applicable)
   - Format: <h2>Erreurs fréquentes à éviter</h2> (SANS emoji dans le H2)
   - Contenu (si erreurs mentionnées dans les commentaires Reddit) :
     - Erreurs récurrentes mentionnées dans les commentaires Reddit
     - Patterns d'échec identifiés
     - Prévention concrète
   - **Objectif** : Couvrir l'intent préventif, valeur pratique
   - Cette section DOIT être présente dans le JSON sous "erreurs_frequentes" (peut être null si aucune erreur)

D. ANGLES UNIQUES (OBLIGATOIRE - CRITIQUE SERP - 30 points)
   ⚠️ CRITIQUE: Inclure TOUS les 3 angles suivants pour score SERP optimal (10 points chacun, total 30 points):
   
   1. Budget détaillé (OBLIGATOIRE):
      - MENTIONNER EXPLICITEMENT les mots-clés: "budget réel", "budget détaillé", "coûts réels", ou "dépenses réelles"
      - Intégrer dans "Contexte", "Résolution", "Nos recommandations", ou "Ce que les autres ne disent pas"
      - Si disponible dans story.evidence ou extracted → utiliser ces données précises
      - Sinon → générer un budget réaliste basé sur la destination (ex: "Le budget réel pour un séjour en [destination] oscille entre X et Y USD/mois selon la ville")
      - Format exemple: "Les coûts réels associés à ce type de voyage incluent..."
   
   2. Timeline/Chronologie (OBLIGATOIRE):
      - MENTIONNER EXPLICITEMENT les mots-clés: "chronologie", "timeline", "étapes du voyage", "période", ou "durée du séjour"
      - Intégrer dans "Contexte" ou "Événement central"
      - Utiliser les dates/étapes disponibles dans story.evidence ou extracted
      - Format exemple: "De [mois] à [mois], il parcourt... En [mois], il voyage... En [mois], il est..."
      - Si dates manquantes → mentionner la chronologie générale du voyage
   
   3. Contraintes réelles (OBLIGATOIRE):
      - MENTIONNER EXPLICITEMENT les mots-clés: "contraintes", "difficultés", "obstacles", "problèmes pratiques", ou "défis"
      - Intégrer dans "Ce que les autres ne disent pas" ou "Erreurs fréquentes"
      - Mentionner les contraintes pratiques : visas, logistique, fatigue, adaptation culturelle
      - Format exemple: "Les contraintes réelles non mentionnées incluent..."
   
   - Ces angles doivent être intégrés naturellement dans les sections existantes (Contexte, Résolution, etc.)
   - Ne pas créer une section séparée, mais les mentionner dans le contenu avec les mots-clés EXACTS ci-dessus
   - Si story.evidence contient ces informations → les utiliser
   - Si manquant → mentionner génériquement mais de manière pertinente avec les mots-clés requis

🎯 RENFORCEMENT E-E-A-T EXPLICITE (sans storytelling artificiel) :

- Expliciter la source des informations (Reddit, témoignage, retour d'expérience)
- Distinguer clairement : faits / ressentis / interprétations
- Format dans le contenu :
  - <p><strong>Source :</strong> Témoignage Reddit de [auteur] sur r/[subreddit], [date]</p>
  - <p><strong>Fait vérifiable :</strong> [fait]</p>
  - <p><strong>Interprétation :</strong> [interprétation basée sur contexte]</p>
- Ajouter des sections "limites", "biais", "cas non généralisables"
- Éviter : emphase émotionnelle artificielle, formules marketing, généralisation abusive

🔍 PROFONDEUR ANALYTIQUE (angles sous-traités) :

Traite systématiquement ces angles pour dépasser les concurrents :
- **Coûts réels** : Breakdown détaillé, coûts cachés, variations saisonnières
- **Temporalité** : Durées réelles vs annoncées, délais administratifs, timing optimal
- **Contraintes** : Limitations pratiques, cas non couverts, prérequis non mentionnés
- **Questions utilisateur** : Questions fréquentes non traitées dans les témoignages

✅ VALIDATION ANTI-SPAM SERP :

- Chaque section doit apporter une information absente chez ≥50% des concurrents
- Pas de reformulation creuse ou de remplissage
- Augmenter la profondeur, pas la longueur
- Si une section n'apporte pas de valeur unique → ne pas la générer

🔗 OPPORTUNITÉS DE LIENS INTERNES (stratégie de maillage) :

- Identifie 5-10 passages dans le contenu où un lien interne serait naturel
- Pour chaque opportunité, indique :
  - Le passage (phrase ou paragraphe)
  - Le type de page cible (guide pratique, comparaison, page pilier)
  - Le thème/sujet (visa, assurance, eSIM, budget, sécurité, logement)
  - L'ancre suggérée (2-5 mots avec mots-clés de la cible)
- Placement stratégique (par priorité) :
  1. Dans les 30% premiers de l'article (Google et lecteurs voient tôt)
  2. Sous chaque H2/H3 quand un sous-thème correspond à une page existante
  3. Juste avant "Nos recommandations" (liaison vers guides/réponses)
  4. Dans "Articles connexes" (liste courte et utile)
- Densité recommandée :
  - Article 2000-3000 mots : 5-10 liens internes
  - +1 lien interne par ~250-350 mots si le contenu le justifie
  - Jamais "spam" : pas plus de 1 lien interne par paragraphe
- Priorisation des cibles :
  1. Pages clés (money/pilier) : assurance voyage, eSIM, visa, logement, budget, sécurité
  2. Pages fraîches : contenu récemment publié (accélère discovery)
  3. Pages contextuelles : même pays, même type de problème, même intention
- Ancres précises (2-5 mots) :
  - Décrivent le sujet de la page cible (mots-clés principaux de la cible)
  - Éviter : "ici", "en savoir plus", "cet article", "lien"
  - Varier sans changer le sens (pas de répétition exacte)
- Note : Le LLM génère les opportunités, mais l'insertion réelle des liens se fait en post-traitement par le système qui vérifie l'existence des pages dans articles-database.json

${marketingSection}

FORMAT HTML: <h2>, <h3>, <p>, <ul><li>, <blockquote>, <strong>
LONGUEUR MINIMALE OBLIGATOIRE: 2000-3000 mots
⚠️ IMPORTANT: Chaque section doit être DÉVELOPPÉE et DÉTAILLÉE
- Contexte: minimum 200 mots avec TOUS les détails disponibles (durées, lieux, chiffres)
- Événement central: minimum 300 mots avec chronologie précise et détails concrets
- Moment critique: minimum 200 mots si disponible
- Résolution: minimum 200 mots si disponible
- Développe TOUS les points issus du story, ne résume pas !

🚨 EXPLOITATION OBLIGATOIRE DES DONNÉES EXTRAITES:
- INTÈGRE TOUS les détails temporels mentionnés (ex: "3 months", "6 months")
- INTÈGRE TOUS les lieux spécifiques (ex: "Punspace", "CAMP", "Khao Soi")
- INTÈGRE TOUS les chiffres concrets (ex: "$50-100/month", budgets, durées)
- INTÈGRE TOUS les entités extraites (noms de lieux, coworking spaces, spécialités locales)
- DÉVELOPPE les questions de la communauté avec les réponses disponibles
- UTILISE 90% minimum des données fournies dans "DONNÉES EXTRAITES"
- Ne laisse AUCUNE information pertinente de côté

⚠️ STRUCTURE JSON OBLIGATOIRE (ORDRE STRICT) :
{
  "article": {
    "titre": "...",
    "quick_guide": "...",  // Section 0 - OBLIGATOIRE - Quick Guide avec points clés (destination, durée, budget, type, difficulté)
    "contexte": "...",  // Section 1 - TOUJOURS APRÈS LE QUICK GUIDE (si story.context.summary existe)
    "evenement_central": "...",  // Section 2 (si story.central_event.summary existe, sinon null) - ⚠️ CONTENU UNIQUEMENT, PAS DE TITRE H2, TOUJOURS EN FRANÇAIS
    "moment_critique": "...",  // Section 3 (si story.critical_moment.summary existe, sinon null)
    "resolution": "...",  // Section 4 (si story.resolution.summary existe, sinon null)
    "lecons_auteur": "...",  // Section 5 (si story.author_lessons non vide, sinon null)
    "insights_communaute": "...",  // Section 6 - TOUJOURS EN FRANÇAIS (si story.community_insights non vide, sinon null)
    "recommandations": "...",  // Section 7 OBLIGATOIRE (3 options classées avec budgets + CTAs)
    "limites_biais": "...",  // NOUVEAU : Section obligatoire "Limites et biais de ce témoignage"
    "ce_que_les_autres_ne_disent_pas": "...",  // NOUVEAU : Section obligatoire "Ce que les témoignages Reddit ne disent pas explicitement" - ⚠️ CONTENU UNIQUEMENT, PAS DE TITRE H2, TOUJOURS EN FRANÇAIS, JAMAIS "What Reddit testimonials don't explicitly say"
    "erreurs_frequentes": "...",  // NOUVEAU : Section conditionnelle "Erreurs fréquentes signalées" (peut être null)
    "emotions": "...",  // NOUVEAU : Sections d'émotions (🧠) intégrées dans le développement
    "tags_psychologiques": "...",  // NOUVEAU : Sections de tags psychologiques (🧩) intégrées dans le développement
    "reecriture_echec": "...",  // NOUVEAU : Section de réécriture de l'échec (⛔️) intégrée dans le développement
    "timeline": "...",  // NOUVEAU : Section timeline (📅) intégrée dans le développement
    "glossaire": "...",  // NOUVEAU : Section glossaire (📖) CONDITIONNEL (uniquement si termes techniques mentionnés, sinon null)
    "indexation": "...",  // NOUVEAU : Section indexation (🧭) CONDITIONNEL (uniquement si ressources mentionnées, sinon null)
    "opportunites_liens_internes": [  // NOUVEAU : Opportunités de liens internes identifiées
      {
        "passage": "Avant de partir, vérifie ton assurance voyage...",
        "type_cible": "guide_pratique",
        "theme": "assurance",
        "ancre_suggeree": "assurance voyage Asie",
        "emplacement": "dans_les_30_premiers_pourcents",
        "raison": "Lien naturel vers guide assurance, placement stratégique"
      }
    ],
    "articles_connexes": [  // NOUVEAU : Liste d'articles connexes suggérés
      {
        "titre": "Assurance voyage en Asie : guide complet",
        "url": "/assurance-voyage-asie/",
        "ancre": "assurance voyage Asie",
        "raison": "Page pilier, thème compatible"
      }
    ],
    "citations": [...],  // Citations courtes depuis evidence (max 5)
    "signature": "..."
  }
}

⚠️ ORDRE STRICT DES SECTIONS HTML :
1. Contexte (TOUJOURS en premier)
2. Événement central
3. Moment critique
4. Résolution
5. Leçons auteur
6. Insights communauté (TOUJOURS en français)
7. Limites et biais de ce témoignage (OBLIGATOIRE - section analytique)
8. Ce que les témoignages Reddit ne disent pas explicitement (OBLIGATOIRE - section analytique)
9. Erreurs fréquentes signalées par les voyageurs (CONDITIONNEL - si erreurs mentionnées)
10. Recommandations
11. Glossaire (CONDITIONNEL - si termes techniques mentionnés)
12. Indexation (CONDITIONNEL - si ressources mentionnées)

⚠️ IMPORTANT : Les sections "emotions", "tags_psychologiques", "reecriture_echec", "timeline" doivent être INTÉGRÉES dans le champ "developpement" (pas séparées). Elles apparaissent dans le contenu HTML mais ne sont pas des sections H2 distinctes.

⚠️ CRITIQUE - ANGLES UNIQUES SERP (OBLIGATOIRE - 30 points):
- Dans le champ "contexte" : INTÉGRER "chronologie" ou "timeline" avec les dates/étapes du voyage
- Dans le champ "resolution" ou "recommandations" : INTÉGRER "budget réel", "budget détaillé", "coûts réels", ou "dépenses réelles" avec des chiffres concrets
- Dans le champ "ce_que_les_autres_ne_disent_pas" : INTÉGRER "contraintes", "difficultés", "obstacles", ou "problèmes pratiques" avec des exemples spécifiques
- Ces mots-clés DOIVENT apparaître explicitement dans le contenu généré pour être détectés par le système de qualité

⚠️ TRADUCTION OBLIGATOIRE :
- Les insights_communaute sont DÉJÀ traduits en français dans le prompt
- NE JAMAIS générer du contenu en anglais dans insights_communaute
- Si tu génères du contenu en anglais, l'article sera REJETÉ
- ⚠️ INTERDICTION ABSOLUE : NE JAMAIS générer de titres H2 avec anglais dans les champs JSON
  - INTERDIT : "Événement central : Vietnam : Fatigue setting in, unimpressed"
  - INTERDIT : "What Reddit testimonials don't explicitly say"
  - INTERDIT : "Critical Moment"
  - CORRECT : Contenu uniquement, sans titre H2, le système ajoutera automatiquement le titre correct
  - Les champs "evenement_central", "ce_que_les_autres_ne_disent_pas", "moment_critique" doivent contenir UNIQUEMENT le contenu, PAS de titre H2

⚠️ RÈGLES ABSOLUES :
- Si une section story est null/vide → champ JSON = null (pas de création)
- Sections absentes réellement absentes dans le JSON
- Auteur ≠ commentaires (visuellement clair dans le HTML)
- Toujours traçable au story.evidence
- Pas d'invention, pas de fusion auteur ↔ commentaires

Réponds UNIQUEMENT en JSON avec cette structure.`;

    // PHASE 4.2: User message basé sur story, pattern, extracted
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

    const userMessage = `TITRE: ${extracted.title || 'Témoignage Reddit'}
AUTEUR: ${extracted.author || 'auteur Reddit'}

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

📖 SQUELETTE NARRATIF (story):
${storyContext ? `CONTEXTE: ${storyContext}` : 'CONTEXTE: null (section absente)'}
${storyCentralEvent ? `ÉVÉNEMENT CENTRAL: ${storyCentralEvent}` : 'ÉVÉNEMENT CENTRAL: null (section absente)'}
${storyCriticalMoment ? `MOMENT CRITIQUE: ${storyCriticalMoment}` : 'MOMENT CRITIQUE: null (section absente)'}
${storyResolution ? `RÉSOLUTION: ${storyResolution}` : 'RÉSOLUTION: null (section absente)'}
${storyAuthorLessons.length > 0 ? `LEÇONS AUTEUR (${storyAuthorLessons.length}):\n${storyAuthorLessons.map((l, i) => `${i+1}. ${l}`).join('\n')}` : 'LEÇONS AUTEUR: [] (section absente)'}
${storyCommunityInsights.length > 0 ? `INSIGHTS COMMUNAUTÉ (${storyCommunityInsights.length}):\n${storyCommunityInsights.map((i, idx) => `${idx+1}. ${i}`).join('\n')}` : 'INSIGHTS COMMUNAUTÉ: [] (section absente)'}
${storyOpenQuestions.length > 0 ? `QUESTIONS OUVERTES (${storyOpenQuestions.length}):\n${storyOpenQuestions.map((q, idx) => `${idx+1}. ${q}`).join('\n')}` : 'QUESTIONS OUVERTES: [] (section absente)'}

📝 CITATIONS DISPONIBLES (depuis evidence):
${availableCitations.length > 0 ? availableCitations.map((c, i) => `${i+1}. "${c}"`).join('\n') : 'Aucune citation disponible'}

⚠️ RAPPEL: Utilise uniquement les sections non-null. Ne crée pas de sections absentes.`;

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
      body: {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 4000, // Augmenté pour article plus riche
      temperature: 0.7,
      response_format: { type: "json_object" }
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
    
    // PHASE 4.1.5: TRADUCTION FORCÉE du JSON avant reconstruction HTML
    if (content.article) {
      console.log('🌐 Traduction forcée de TOUS les champs JSON...');
      for (const [key, value] of Object.entries(content.article)) {
        if (typeof value === 'string' && value.length > 20) {
          const englishDetection = this.detectEnglishContent(value);
          if (englishDetection.isEnglish && englishDetection.ratio > 0.3) {
            console.log(`   🔄 Traduction champ "${key}": ${Math.round(englishDetection.ratio * 100)}% anglais`);
            content.article[key] = await this.translateToFrench(value);
          }
        }
      }
    }
    
    // PHASE 4.2: Reconstruire le contenu final à partir de la structure "FlashVoyage Premium"
    if (content.article) {
      const article = content.article;
      
      // Construire le contenu dans l'ordre strict de la structure obligatoire
      // ORDRE ABSOLU : Quick Guide → Contexte → Événement central → Moment critique → Résolution
      const sections = [];
      
      // 0. Quick Guide (TOUJOURS EN PREMIER - résumé actionnable)
      // APPROCHE EXPERT CONTENT WRITER : Extraire les vrais points clés du témoignage, pas une grille générique
      let quickGuideText = article.quick_guide?.trim() || '';
      
      if (!quickGuideText) {
        console.log('⚠️ Quick Guide manquant - Extraction intelligente des points clés réels du témoignage...');
        
        // Extraire les vrais points clés depuis le contenu réel
        const keyPoints = this.extractRealKeyPoints(extracted, story, pattern);
        
        if (keyPoints.length > 0) {
          const pointsHtml = keyPoints.map(point => {
            const label = point.label || 'Point clé';
            const value = point.value || '';
            return `<li><strong>${label}</strong> : ${value}</li>`;
          }).join('\n');
          
          quickGuideText = `<ul>\n${pointsHtml}\n</ul>`;
          console.log(`   ✅ Quick Guide généré avec ${keyPoints.length} points clés réels extraits du témoignage`);
        } else {
          // Fallback minimal si aucun point clé ne peut être extrait
          const destination = extracted?.destination || story?.story?.context?.location || 'Non spécifié';
          quickGuideText = `<ul>\n<li><strong>Destination</strong> : ${destination}</li>\n</ul>`;
          console.log('   ⚠️ Aucun point clé extractible, fallback minimal');
        }
      } else {
        const englishDetection = this.detectEnglishContent(quickGuideText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Quick Guide" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          quickGuideText = await this.translateToFrench(quickGuideText);
        }
      }
      
      // S'assurer que le Quick Guide a le bon format HTML
      if (!quickGuideText.includes('<div class="quick-guide">') && !quickGuideText.includes('<h3>Points clés')) {
        sections.push(`<div class="quick-guide">\n<h3>Points clés de ce témoignage</h3>\n${quickGuideText}\n</div>`);
      } else {
        sections.push(quickGuideText);
      }
      console.log('   ✅ Quick Guide ajouté en début d\'article');
      
      // 1. Contexte (APRÈS LE QUICK GUIDE si présent)
      if (article.contexte && article.contexte.trim()) {
        let contexteText = article.contexte.trim();
        // Supprimer tout H2 présent dans le contenu (on ajoutera le bon titre après)
        contexteText = contexteText.replace(/<h2[^>]*>.*?<\/h2>/gi, '').trim();
        const englishDetection = this.detectEnglishContent(contexteText);
        let finalContexte = contexteText;
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Contexte" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          finalContexte = await this.translateToFrench(contexteText);
        }
        // Nettoyer les blockquotes en anglais dans le contenu
        finalContexte = await this.translateBlockquotesInText(finalContexte);
        sections.push(`<h2>Contexte</h2>\n${finalContexte}`);
      }
      
      // 2. Événement central (si présent)
      if (article.evenement_central && article.evenement_central.trim()) {
        let evenementText = article.evenement_central.trim();
        // #region agent log
        debugLog('intelligent-content-analyzer-optimized.js:1659', 'AVANT nettoyage evenement_central', {originalText:evenementText.substring(0,200),hasH2:/<h2[^>]*>/i.test(evenementText)}, 'A');
        // #endregion
        // DÉCODER les entités HTML AVANT le nettoyage (pour que les patterns fonctionnent correctement)
        evenementText = decodeHtmlEntities(evenementText);
        // Sauvegarder l'état avant nettoyage pour les logs
        const beforeTitleClean = evenementText;
        // NETTOYAGE AGRESSIF : Supprimer TOUS les H2, y compris ceux avec de l'anglais dans le titre
        // Pattern pour capturer tous les H2, même avec de l'anglais après "Événement central"
        evenementText = evenementText.replace(/<h2[^>]*>.*?<\/h2>/gi, '').trim();
        // APPROCHE ULTRA-AGRESSIVE : Supprimer TOUT ce qui contient "Événement central" suivi de quoi que ce soit
        // (car le titre correct ne doit contenir QUE "Événement central" sans rien d'autre)
        evenementText = evenementText.replace(/Événement central[^\n]*/gi, '').trim();
        // Supprimer aussi les résidus comme ", unimpressed" qui peuvent rester
        evenementText = evenementText.replace(/^,\s*[a-z]+(\s+[a-z]+)*/gi, '').trim();
        // #region agent log
        if (beforeTitleClean !== evenementText) {
          debugLog('intelligent-content-analyzer-optimized.js:1687', 'Nettoyage titre Événement central', {before:beforeTitleClean.substring(0,100),after:evenementText.substring(0,100),removed:beforeTitleClean.length - evenementText.length}, 'A');
        }
        // #endregion
        // #region agent log
        debugLog('intelligent-content-analyzer-optimized.js:1667', 'APRÈS suppression H2 evenement_central', {cleanedText:evenementText.substring(0,200),stillHasH2:/<h2[^>]*>/i.test(evenementText),stillHasEnglishTitle:/Événement central[^<]*(Fatigue|setting)/i.test(evenementText)}, 'A');
        // #endregion
        const englishDetection = this.detectEnglishContent(evenementText);
        let finalEvenement = evenementText;
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Événement central" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          finalEvenement = await this.translateToFrench(evenementText);
        }
        // Nettoyer les blockquotes en anglais dans le contenu
        finalEvenement = await this.translateBlockquotesInText(finalEvenement);
        // VÉRIFICATION FINALE : S'assurer qu'aucun titre avec anglais ne subsiste dans le contenu
        // APPROCHE ULTRA-AGRESSIVE : Supprimer TOUT ce qui contient "Événement central" suivi de quoi que ce soit
        if (/Événement central[^<]*(Fatigue|setting|in|unimpressed|Event|What|Our|Critical|Vietnam)/i.test(finalEvenement) || /Événement central\s*:/.test(finalEvenement)) {
          console.log('⚠️ Titre "Événement central" avec anglais détecté dans le contenu final, nettoyage...');
          finalEvenement = finalEvenement.replace(/Événement central[^\n]*/gi, '').trim();
        }
        // NETTOYAGE FINAL : Supprimer tout H2 qui pourrait subsister dans finalEvenement
        finalEvenement = finalEvenement.replace(/<h2[^>]*>.*?<\/h2>/gi, '').trim();
        const finalSection = `<h2>Événement central</h2>\n${finalEvenement}`;
        // #region agent log
        debugLog('intelligent-content-analyzer-optimized.js:1671', 'Section Événement central ajoutée', {finalSection:finalSection.substring(0,200),hasEnglishInTitle:/Événement central[^<]*(Fatigue|setting)/i.test(finalSection)}, 'A');
        // #endregion
        sections.push(finalSection);
      }
      
      // 3. Moment critique (si présent) - TRADUCTION FORCÉE
      if (article.moment_critique && article.moment_critique.trim()) {
        let momentText = article.moment_critique.trim();
        // Supprimer tout H2 présent dans le contenu (on ajoutera le bon titre après)
        momentText = momentText.replace(/<h2[^>]*>.*?<\/h2>/gi, '').trim();
        console.log(`🌐 Section "Moment critique": traduction forcée en français...`);
        // TOUJOURS traduire - même si détecté comme français
        const englishDetection = this.detectEnglishContent(momentText);
        let finalMoment = momentText;
        if (englishDetection.isEnglish || englishDetection.ratio > 0.05) {
          finalMoment = await this.translateToFrench(momentText);
        } else {
          // Même si détecté comme français, vérifier s'il y a des phrases anglaises
          const englishPhrases = momentText.match(/[A-Z][a-z]+(\s+[a-z]+)+/g);
          if (englishPhrases && englishPhrases.length > 0) {
            console.log(`   ⚠️ Phrases anglaises détectées dans "Moment critique", traduction...`);
            finalMoment = await this.translateToFrench(momentText);
          }
        }
        // Nettoyer les blockquotes en anglais dans le contenu
        finalMoment = await this.translateBlockquotesInText(finalMoment);
        sections.push(`<h2>Moment critique</h2>\n<p>${finalMoment}</p>`);
      }
      
      // 4. Résolution (si présente) - DÉSACTIVÉ pour éviter doublons avec story.resolution
      // La résolution est déjà gérée par le finalizer via story.resolution
      // if (article.resolution && article.resolution.trim()) {
      //   const resolutionText = article.resolution.trim();
      //   const englishDetection = this.detectEnglishContent(resolutionText);
      //   let finalResolution = resolutionText;
      //   if (englishDetection.isEnglish) {
      //     console.log(`🌐 Section "Résolution" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
      //     finalResolution = await this.translateToFrench(resolutionText);
      //   }
      //   sections.push(`<h2>Résolution / Situation actuelle</h2>\n${finalResolution}`);
      // }
      
      // 5. Citations (si présentes)
      if (article.citations && article.citations.length > 0) {
        const redditTitle = (extracted?.source?.title || extracted?.title || '').trim();
        const redditTitleLower = redditTitle.toLowerCase();
        const citationsToProcess = article.citations
          .filter(c => c && typeof c === 'string' && c.trim().length > 0)
          .filter(c => {
            const lower = c.toLowerCase().trim();
            // FILTRER titre Reddit exact
            if (redditTitle && lower === redditTitleLower) return false;
            // FILTRER titre dupliqué (détection de répétition)
            if (redditTitle) {
              const words = redditTitle.split(' ');
              if (words.length >= 3) {
                // Vérifier si les 3 premiers mots du titre apparaissent 2x dans la citation
                const firstThreeWords = words.slice(0, 3).join(' ').toLowerCase();
                const occurrences = (c.toLowerCase().match(new RegExp(firstThreeWords.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                if (occurrences >= 2) return false;
              }
            }
            // FILTRER citations trop courtes (pays seuls)
            if (lower.length < 10 || lower === 'thailand' || lower === 'vietnam' || lower === 'indonesia') return false;
            return true;
          })
          .slice(0, 5); // Max 5 citations
        
        // Traiter les citations avec await (nécessite Promise.all)
        const citationsFormatted = await Promise.all(
          citationsToProcess.map(async (citation) => {
            // Format: « citation » — auteur
            let cleanCitation = citation.replace(/^["']|["']$/g, '').trim();
            
            // Nettoyer les guillemets doubles et les attributions répétées
            cleanCitation = cleanCitation.replace(/^«\s*«\s*|»\s*»\s*$/g, '').trim();
            cleanCitation = cleanCitation.replace(/\s*—\s*auteur Reddit\s*—\s*auteur Reddit/gi, '').trim();
            cleanCitation = cleanCitation.replace(/\s*—\s*auteur Reddit/gi, '').trim();
            // AMÉLIORATION: Supprimer aussi les autres formats d'attribution
            cleanCitation = cleanCitation.replace(/\s*—\s*[^—]*Reddit[^—]*/gi, '').trim();
            cleanCitation = cleanCitation.replace(/\s*—\s*Extrait Reddit/gi, '').trim();
            cleanCitation = cleanCitation.replace(/\s*—\s*Reddit author/gi, '').trim();
            
            // AMÉLIORATION: Vérifier que la citation contient du texte réel (pas seulement des espaces/ponctuation)
            const realText = cleanCitation.replace(/[^\w\sÀ-Ÿà-ÿ]/g, '').trim();
            if (realText.length < 10) {
              console.log(`⚠️ Citation trop courte ou vide après nettoyage, ignorée: "${cleanCitation.substring(0, 50)}..."`);
              return null;
            }
            
            // Détecter si la citation est en anglais et la traduire si nécessaire
            const englishDetection = this.detectEnglishContent(cleanCitation);
            
            if (englishDetection.isEnglish) {
              console.log(`🌐 Citation détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
              cleanCitation = await this.translateToFrench(cleanCitation);
              // Vérifier à nouveau après traduction
              const realTextAfterTranslation = cleanCitation.replace(/[^\w\sÀ-Ÿà-ÿ]/g, '').trim();
              if (realTextAfterTranslation.length < 10) {
                console.log(`⚠️ Citation trop courte après traduction, ignorée`);
                return null;
              }
            }
            
            // AMÉLIORATION: Validation finale stricte (minimum 10 caractères de texte réel, max 200)
            const finalRealText = cleanCitation.replace(/[^\w\sÀ-Ÿà-ÿ]/g, '').trim();
            if (finalRealText.length >= 10 && cleanCitation.length <= 200) {
              // AMÉLIORATION: Utiliser le nom de l'auteur si disponible, sinon un texte plus informatif
              const authorName = extracted.source?.author || extracted.author || null;
              let attribution = '— Extrait Reddit';
              
              if (authorName && authorName !== '[deleted]' && authorName.trim().length > 0) {
                attribution = `— ${authorName} (Reddit)`;
              }
              
              return `<p>« ${cleanCitation} » ${attribution}</p>`;
            }
            return null;
          })
        );
        
        const filteredCitations = citationsFormatted.filter(Boolean);
        
        if (filteredCitations.length > 0) {
          sections.push(`<h2>Citations</h2>\n${filteredCitations.join('\n')}`);
        }
      }
      
      // 6. Ce que l'auteur retient (si présent)
      if (article.lecons_auteur) {
        // Formater lecons_auteur correctement (peut être string, array, ou object)
        let leconsFormatted = '';
        if (typeof article.lecons_auteur === 'string') {
          leconsFormatted = article.lecons_auteur.trim();
        } else if (Array.isArray(article.lecons_auteur)) {
          // Si c'est un array, créer une liste
          const items = article.lecons_auteur
            .map(item => {
              if (typeof item === 'string') return item.trim();
              return item.lesson || item.value || item.text || item.summary || '';
            })
            .filter(item => item && item.trim());
          if (items.length > 0) {
            // Helper pour échapper HTML
            const escapeHtml = (text) => {
              if (typeof text !== 'string') return '';
              return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            };
            leconsFormatted = `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
          }
        } else if (typeof article.lecons_auteur === 'object') {
          // Si c'est un objet, essayer d'extraire le contenu
          leconsFormatted = article.lecons_auteur.lesson || article.lecons_auteur.value || article.lecons_auteur.text || article.lecons_auteur.summary || '';
          if (typeof leconsFormatted !== 'string') {
            leconsFormatted = '';
          }
        }
        
        if (leconsFormatted && leconsFormatted.trim() && !leconsFormatted.includes('[object Object]')) {
          sections.push(`<h2>Ce que l'auteur retient</h2>\n${leconsFormatted}`);
        } else {
          console.warn('⚠️ lecons_auteur invalide ou contient [object Object], section ignorée');
        }
      }
      
      // 7. Ce que la communauté apporte (si présent, SÉPARÉ visuellement)
      if (article.insights_communaute && article.insights_communaute.trim()) {
        // Nettoyer les H2 dupliqués que le LLM pourrait avoir générés
        let cleanedInsights = article.insights_communaute.trim();
        
        // Supprimer tout H2 "Ce que la communauté apporte" déjà présent dans le contenu
        cleanedInsights = cleanedInsights.replace(/<h2[^>]*>Ce que la communauté apporte[^<]*<\/h2>\s*/gi, '');
        
        // DEBUG: Détecter et supprimer les <li> dupliqués
        console.log(`🔍 DEBUG insights_communaute avant déduplication: ${cleanedInsights.length} caractères`);
        
        // Extraire tous les <li> et dédupliquer avec NORMALISATION
        const liMatches = cleanedInsights.match(/<li[^>]*>.*?<\/li>/gi);
        if (liMatches && liMatches.length > 0) {
          console.log(`   Trouvé ${liMatches.length} éléments <li>`);
          
          // Fonction de normalisation pour comparaison sémantique
          const normalize = (text) => {
            return text
              .toLowerCase()
              .replace(/<[^>]*>/g, '') // Supprimer HTML
              .replace(/[^\w\s]/g, '') // Supprimer ponctuation
              .replace(/\s+/g, ' ')    // Normaliser espaces
              .trim();
          };
          
          // Dédupliquer en comparant le contenu NORMALISÉ
          const seen = new Map();
          const uniqueLi = [];
          
          for (const li of liMatches) {
            const normalized = normalize(li);
            if (!seen.has(normalized)) {
              seen.set(normalized, true);
              uniqueLi.push(li);
            }
          }
          
          console.log(`   Après déduplication normalisée: ${uniqueLi.length} éléments <li> uniques`);
          
          if (uniqueLi.length < liMatches.length) {
            // Reconstruire le HTML avec seulement les <li> uniques
            cleanedInsights = cleanedInsights.replace(/<ul[^>]*>.*?<\/ul>/gis, '');
            cleanedInsights += `\n<ul>\n${uniqueLi.join('\n')}\n</ul>`;
            console.log(`   ✅ ${liMatches.length - uniqueLi.length} doublons supprimés (normalisation sémantique)`);
          }
        }
        
        // TRADUIRE les insights en français AVANT ajout
        if (cleanedInsights.trim()) {
          // Extraire le texte des <li> pour traduction
          const liTexts = cleanedInsights.match(/<li[^>]*>(.*?)<\/li>/gi);
          if (liTexts && liTexts.length > 0) {
            const allText = liTexts.map(li => li.replace(/<[^>]+>/g, '').trim()).join('\n');
            const englishDetection = this.detectEnglishContent(allText);
            if (englishDetection.isEnglish && englishDetection.ratio > 0.3) {
              console.log(`🌐 Insights communauté détectés en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
              const translatedText = await this.translateToFrench(allText);
              const translatedLines = translatedText.split('\n').filter(l => l.trim());
              
              // Reconstruire les <li> traduits
              if (translatedLines.length === liTexts.length) {
                const translatedLis = liTexts.map((li, idx) => {
                  const translatedContent = translatedLines[idx] || li.replace(/<[^>]+>/g, '').trim();
                  return li.replace(/>([^<]+)</, `>${translatedContent}<`);
                });
                cleanedInsights = cleanedInsights.replace(/<ul[^>]*>.*?<\/ul>/gis, '');
                cleanedInsights = `<ul>\n${translatedLis.map(li => `  ${li}`).join('\n')}\n</ul>`;
                console.log(`   ✅ ${translatedLines.length} insight(s) traduit(s)`);
              }
            }
          }
          
          sections.push(`<h2>Ce que la communauté apporte</h2>\n${cleanedInsights}`);
        }
      }
      
      // 7.5. Limites et biais de ce témoignage (OBLIGATOIRE - section analytique)
      if (article.limites_biais && article.limites_biais.trim()) {
        let limitesText = article.limites_biais.trim();
        const englishDetection = this.detectEnglishContent(limitesText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Limites et biais" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          limitesText = await this.translateToFrench(limitesText);
        }
        // S'assurer que le H2 est présent
        if (!limitesText.includes('<h2>⚠️ Limites et biais')) {
          sections.push(`<h2>⚠️ Limites et biais de ce témoignage</h2>\n${limitesText}`);
        } else {
          sections.push(limitesText);
        }
      } else {
        // Fallback : générer une section minimale si absente
        console.warn('⚠️ Section "Limites et biais" absente - ajout d\'une section minimale');
        sections.push(`<h2>⚠️ Limites et biais de ce témoignage</h2>\n<p>Ce témoignage reflète une expérience personnelle qui peut ne pas être généralisable à tous les contextes. Les situations varient selon les individus, les périodes et les destinations spécifiques.</p>`);
      }
      
      // 7.6. Ce que les témoignages Reddit ne disent pas explicitement (OBLIGATOIRE - section analytique)
      if (article.ce_que_les_autres_ne_disent_pas && article.ce_que_les_autres_ne_disent_pas.trim()) {
        let autresText = article.ce_que_les_autres_ne_disent_pas.trim();
        // DÉCODER les entités HTML AVANT le nettoyage
        autresText = decodeHtmlEntities(autresText);
        // NETTOYAGE AGRESSIF : Supprimer TOUS les H2, y compris ceux avec de l'anglais dans le titre
        autresText = autresText.replace(/<h2[^>]*>.*?<\/h2>/gi, '').trim();
        // Supprimer aussi les titres en anglais "What Reddit testimonials don't explicitly say"
        // Pattern amélioré pour gérer les apostrophes normales (') et Unicode (U+2019, U+0027)
        autresText = autresText.replace(/What\s+Reddit\s+testimonials?\s+don[''\u2019]?t\s+explicitly\s+say/gi, '').trim();
        const englishDetection = this.detectEnglishContent(autresText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Ce que les autres ne disent pas" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          autresText = await this.translateToFrench(autresText);
        }
        // Toujours ajouter le H2 correct (on a supprimé tous les H2 précédents)
        sections.push(`<h2>🔍 Ce que les témoignages Reddit ne disent pas explicitement</h2>\n${autresText}`);
      } else {
        // Fallback : générer une section minimale si absente
        console.warn('⚠️ Section "Ce que les autres ne disent pas" absente - ajout d\'une section minimale');
        sections.push(`<h2>🔍 Ce que les témoignages Reddit ne disent pas explicitement</h2>\n<p>Les témoignages Reddit se concentrent souvent sur les aspects positifs ou les problèmes immédiats, mais omettent parfois des détails importants comme les coûts réels cachés, les délais administratifs réels, ou les contraintes pratiques non mentionnées.</p>`);
      }
      
      // 7.7. Erreurs fréquentes signalées par les voyageurs (CONDITIONNEL - si applicable)
      if (article.erreurs_frequentes && article.erreurs_frequentes.trim()) {
        let erreursText = article.erreurs_frequentes.trim();
        const englishDetection = this.detectEnglishContent(erreursText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Erreurs fréquentes" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          erreursText = await this.translateToFrench(erreursText);
        }
        // S'assurer que le H2 est présent
        if (!erreursText.includes('<h2>❌ Erreurs fréquentes')) {
          sections.push(`<h2>❌ Erreurs fréquentes signalées par les voyageurs</h2>\n${erreursText}`);
        } else {
          sections.push(erreursText);
        }
      } else {
        // Fallback : générer une section minimale basée sur le contexte
        console.warn('⚠️ Section "Erreurs fréquentes" absente - ajout d\'une section générique');
        const destination = extracted?.destination || story?.context?.location || 'cette destination';
        sections.push(`<h2>Erreurs fréquentes à éviter</h2>
<p>Voici les erreurs les plus courantes que font les voyageurs :</p>
<ul>
<li><strong>Sous-estimer les délais administratifs</strong> : Les procédures de visa et les formalités peuvent prendre plus de temps que prévu.</li>
<li><strong>Ne pas prévoir de budget tampon</strong> : Les imprévus sont fréquents, prévoyez 15-20% de marge.</li>
<li><strong>Négliger l'assurance voyage</strong> : Indispensable pour ${destination}, vérifiez les couvertures médicales.</li>
</ul>`);
      }
      
      // 8. Nos recommandations (OBLIGATOIRE - remplace "questions ouvertes")
      if (article.recommandations && article.recommandations.trim()) {
        // Détecter si le contenu est en anglais et le traduire si nécessaire
        let recoText = article.recommandations.trim();
        
        // REMPLACER "Questions encore ouvertes" ou "Questions ouvertes" par "Nos recommandations"
        recoText = recoText.replace(/<h2[^>]*>Questions (encore )?ouvertes[^<]*<\/h2>/gi, '<h2>🎯 Nos recommandations : Par où commencer ?</h2>');
        recoText = recoText.replace(/Questions (encore )?ouvertes/gi, 'Nos recommandations');
        
        const englishDetection = this.detectEnglishContent(recoText);
        
        let finalReco = recoText;
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Recommandations" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          finalReco = await this.translateToFrench(recoText);
        }
        
        sections.push(finalReco); // Le titre H2 est déjà inclus dans le contenu
      } else {
        // Fallback si le LLM n'a pas généré de recommandations (ne devrait jamais arriver)
        console.warn('⚠️ Aucune recommandation générée par le LLM - ajout de recommandations génériques');
        sections.push(`<h2>🎯 Nos recommandations : Par où commencer ?</h2>\n<p>Nous recommandons de privilégier l'Asie du Sud-Est pour un budget maîtrisé et des infrastructures fiables.</p>`);
      }
      
      // 9. Glossaire (CONDITIONNEL - uniquement si termes techniques mentionnés)
      if (article.glossaire && article.glossaire.trim()) {
        let glossaireText = article.glossaire.trim();
        const englishDetection = this.detectEnglishContent(glossaireText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Glossaire" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          glossaireText = await this.translateToFrench(glossaireText);
        }
        // S'assurer que le H2 est présent
        if (!glossaireText.includes('<p>📖 Termes utilisés')) {
          sections.push(`<h2>📖 Termes utilisés dans ce récit</h2>\n${glossaireText}`);
        } else {
          sections.push(glossaireText);
        }
      }
      // Note: Pas de fallback pour cette section car elle est conditionnelle
      
      // 10. Indexation (CONDITIONNEL - uniquement si ressources mentionnées)
      if (article.indexation && article.indexation.trim()) {
        let indexationText = article.indexation.trim();
        const englishDetection = this.detectEnglishContent(indexationText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.1) {
          console.log(`🌐 Section "Indexation" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          indexationText = await this.translateToFrench(indexationText);
        }
        // S'assurer que le H2 est présent
        if (!indexationText.includes('<p>🧭 Ressource mentionnée')) {
          sections.push(`<h2>🧭 Ressources mentionnées</h2>\n${indexationText}`);
        } else {
          sections.push(indexationText);
        }
      }
      // Note: Pas de fallback pour cette section car elle est conditionnelle
      
      // 11. Signature (si présente)
      if (article.signature && article.signature.trim()) {
        sections.push(article.signature);
      }
      
      let htmlContent = sections.filter(Boolean).join('\n\n');
      
      // #region agent log
      const hasEncodedEntities = /&#\d+;/.test(htmlContent);
      const eventTitleBefore = htmlContent.match(/<h2[^>]*>Événement central[^<]*<\/h2>/gi);
      debugLog('intelligent-content-analyzer-optimized.js:2032', 'AVANT POST-PROC 0 - HTML assemblé', {htmlLength:htmlContent.length,hasEncodedEntities:hasEncodedEntities,eventTitles:eventTitleBefore}, 'A,B');
      // #endregion
      
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
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central[^<]*<\/h2>/gi, (match) => {
        // #region agent log
        debugLog('intelligent-content-analyzer-optimized.js:2062', 'Pattern match Événement central', {match:match,hasEnglish:/(Fatigue|setting|in|unimpressed|Event|What|Our|Critical|Vietnam.*Fatigue)/i.test(match)}, 'A');
        // #endregion
        // Extraire le contenu du titre (sans les balises H2)
        const titleContent = match.replace(/<h2[^>]*>|<\/h2>/gi, '').trim();
        // APPROCHE AGRESSIVE : Si le titre n'est pas exactement "Événement central", on le nettoie
        // (car le titre correct ne doit contenir QUE "Événement central")
        if (titleContent !== 'Événement central') {
          console.log(`⚠️ POST-PROC 0: Titre "Événement central" avec contenu supplémentaire détecté: "${titleContent}" → nettoyage`);
          // #region agent log
          debugLog('intelligent-content-analyzer-optimized.js:2062', 'Nettoyage Événement central avec contenu supplémentaire', {original:match,titleContent:titleContent,replaced:'<h2>Événement central</h2>'}, 'A');
          // #endregion
          return '<h2>Événement central</h2>';
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
      // #region agent log
      debugLog('intelligent-content-analyzer-optimized.js:2032', 'POST-PROC 0 - Nettoyage immédiat après assemblage', {htmlLength:htmlContent.length,hasEventEnglish:/<h2[^>]*>Événement central[^<]*(Fatigue|setting)/i.test(htmlContent),hasWhatReddit:/What\s+Reddit\s+testimonials/i.test(htmlContent)}, 'A,B');
      // #endregion
      
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
      
      // POST-PROCESSING 1.5 : Vérifier que le Quick Guide est en premier (AVANT TOUS LES H2)
      // Le Quick Guide doit être la première section, même avant tous les H2
      let quickGuideMatch = htmlContent.match(/<div class="quick-guide">[\s\S]*?<\/div>/i);
      const firstH2Match = htmlContent.match(/<h2[^>]*>[\s\S]*?<\/h2>/i);
      
      if (quickGuideMatch && firstH2Match) {
        const quickGuideIndex = htmlContent.indexOf(quickGuideMatch[0]);
        const firstH2Index = htmlContent.indexOf(firstH2Match[0]);
        
        // Si un H2 est avant le Quick Guide, réorganiser
        if (firstH2Index < quickGuideIndex) {
          console.log('⚠️ Un H2 est avant Quick Guide → réorganisation pour mettre Quick Guide en premier...');
          const quickGuideSection = quickGuideMatch[0];
          const reste = htmlContent.replace(quickGuideSection, '').trim();
          htmlContent = quickGuideSection + '\n\n' + reste;
          console.log('   ✅ Quick Guide déplacé en premier (avant tous les H2)');
          // Refaire le match après réorganisation
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
      htmlContent = htmlContent.replace(/<h2[^>]*>Limitations and biases[^<]*<\/h2>/gi, '<h2>Limites et biais de ce témoignage</h2>');
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
      
      // #region agent log
      debugLog('intelligent-content-analyzer-optimized.js:2267', 'POST-PROC 7 terminé - HTML après traduction sections', {htmlLength:htmlContent.length,englishInContent:/(Underestimating|Not budgeting|Essential for|Fatigue setting|Critical Moment|What Reddit)/i.test(htmlContent),sampleH2:htmlContent.match(/<h2[^>]*>[^<]*<\/h2>/gi)?.slice(0,5)||[]}, 'A,B');
      // #endregion
      
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
      const beforeEventClean = htmlContent.match(/<h2[^>]*>Événement central[^<]*<\/h2>/gi);
      // #region agent log
      debugLog('intelligent-content-analyzer-optimized.js:2342', 'AVANT pattern final Événement central', {beforeTitles:beforeEventClean,htmlSample:htmlContent.substring(0,500)}, 'B');
      // #endregion
      // APPROCHE AGRESSIVE : Si le titre contient quoi que ce soit après "Événement central", on le nettoie
      htmlContent = htmlContent.replace(/<h2[^>]*>Événement central[^<]*<\/h2>/gi, (match) => {
        const titleContent = match.replace(/<h2[^>]*>|<\/h2>/gi, '').trim();
        // APPROCHE AGRESSIVE : Si le titre n'est pas exactement "Événement central", on le nettoie
        if (titleContent !== 'Événement central') {
          console.log(`   🧹 POST-PROC 9: Titre "Événement central" avec contenu supplémentaire nettoyé: "${titleContent}"`);
          // #region agent log
          debugLog('intelligent-content-analyzer-optimized.js:2347', 'POST-PROC 9 - Nettoyage titre Événement central', {before:match,titleContent:titleContent,after:'<h2>Événement central</h2>'}, 'B');
          // #endregion
          return '<h2>Événement central</h2>';
        }
        return match;
      });
      const afterEventClean = htmlContent.match(/<h2[^>]*>Événement central[^<]*<\/h2>/gi);
      // #region agent log
      debugLog('intelligent-content-analyzer-optimized.js:2312', 'POST-PROC 9 terminé - Événement central', {beforeTitles:beforeEventClean,beforeCount:beforeEventClean?.length||0,afterTitles:afterEventClean,afterCount:afterEventClean?.length||0,stillHasEnglish:/(Fatigue setting|unimpressed)/i.test(htmlContent)}, 'B');
      // #endregion
      // Forcer la traduction des titres en anglais restants (pattern plus flexible pour capturer toutes les variantes)
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
          console.log('🌐 POST-PROC 10.3.1: Traduction section "Erreurs courantes" contenant de l\'anglais...');
          // #region agent log
          const allStrongs = errorsSection.match(/<strong[^>]*>[^<]*<\/strong>/gi) || [];
          debugLog('intelligent-content-analyzer-optimized.js:2383', 'POST-PROC 10.3.1 - Début traduction Erreurs courantes', {sectionLength:errorsSection.length,englishDetected:/(Underestimating|Not budgeting|Essential for)/i.test(errorsSection),strongMatches:allStrongs.length,strongContents:allStrongs.slice(0,5)}, 'C');
          // #endregion
          // Traduire d'abord les balises <strong> en anglais (pattern amélioré pour capturer plus de cas)
          let translatedSection = errorsSection;
          // Pattern amélioré pour capturer les <strong> avec phrases complètes en anglais (ex: "Underestimating administrative delays")
          // Pattern plus flexible pour capturer même si les balises ont des attributs
          const strongMatches = [...errorsSection.matchAll(/<strong[^>]*>([A-Z][a-z]+(\s+[a-z]+){1,})<\/strong>/g)];
          // #region agent log
          debugLog('intelligent-content-analyzer-optimized.js:2550', 'POST-PROC 10.3.1 - Balises <strong> trouvées', {count:strongMatches.length,matches:strongMatches.map(m => m[1]).slice(0,5)}, 'C');
          // #endregion
          for (const match of strongMatches) {
            const fullMatch = match[0];
            const textContent = match[1];
            // Vérifier si c'est de l'anglais (pas de caractères accentués français, commence par majuscule)
            const isEnglish = !/[àâäéèêëïîôùûüÿç]/.test(textContent) && /^[A-Z][a-z]+(\s+[a-z]+){1,}$/.test(textContent);
            // Vérifier aussi si c'est une phrase anglaise connue (ex: "Underestimating administrative delays")
            const isKnownEnglish = /(Underestimating|Not budgeting|Essential for)/i.test(textContent);
            if (isEnglish || isKnownEnglish) {
              console.log(`   🔄 Traduction <strong>: "${textContent}"`);
              // #region agent log
              debugLog('intelligent-content-analyzer-optimized.js:2390', 'Traduction <strong> en cours', {original:textContent,isEnglish:isEnglish,isKnownEnglish:isKnownEnglish,fullMatch:fullMatch}, 'C');
              // #endregion
              const translated = await this.translateToFrench(textContent);
              // #region agent log
              debugLog('intelligent-content-analyzer-optimized.js:2393', 'Traduction <strong> terminée', {original:textContent,translated:translated,stillEnglish:/(Underestimating|Not budgeting|Essential for)/i.test(translated)}, 'C');
              // #endregion
              // Échapper les caractères spéciaux pour le remplacement
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
          }
          // #region agent log
          const finalStrongs = translated.match(/<strong[^>]*>[^<]*<\/strong>/gi) || [];
          const finalEnglishStrongs = finalStrongs.filter(s => /(Underestimating|Not budgeting|Essential for)/i.test(s));
          debugLog('intelligent-content-analyzer-optimized.js:2400', 'POST-PROC 10.3.1 - Fin traduction Erreurs courantes', {originalLength:errorsSection.length,translatedLength:translated.length,stillHasEnglish:/(Underestimating|Not budgeting|Essential for)/i.test(translated),finalEnglishStrongs:finalEnglishStrongs}, 'C');
          // #endregion
          // Échapper la section originale pour le remplacement
          const escapedSection = errorsSection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          htmlContent = htmlContent.replace(new RegExp(escapedSection, 'g'), translated);
        }
      }
      
      const recommendationsSectionMatch = htmlContent.match(/(<h2[^>]*>Nos recommandations[^<]*<\/h2>[\s\S]*?)(?=<h2[^>]*>|$)/i);
      if (recommendationsSectionMatch) {
        const recommendationsSection = recommendationsSectionMatch[1];
        const englishInRecommendations = /(Option \d+:|Realistic budget:|Advantages?:|Disadvantages?:|can be|Compare prices|Learn more)/i.test(recommendationsSection);
        if (englishInRecommendations) {
          console.log('🌐 POST-PROC 10.3.2: Traduction section "Nos recommandations" contenant de l\'anglais...');
          const translated = await this.translateToFrench(recommendationsSection);
          htmlContent = htmlContent.replace(recommendationsSection, translated);
        }
      }
      
      // 10.3.3 : Traduire la section "Ce que la communauté apporte" si elle contient de l'anglais
      const communitySectionMatch = htmlContent.match(/(<h2[^>]*>Ce que la communauté apporte[^<]*<\/h2>[\s\S]*?)(?=<h2[^>]*>|$)/i);
      if (communitySectionMatch) {
        const communitySection = communitySectionMatch[1];
        const englishInCommunity = /(There'?s nothing wrong|taking a break|settling somewhere|recharge your batteries)/i.test(communitySection);
        if (englishInCommunity) {
          console.log('🌐 POST-PROC 10.3.3: Traduction section "Ce que la communauté apporte" contenant de l\'anglais...');
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
      
      // #region agent log
      const finalEnglishCheck = {
        hasEventEnglish: /<h2[^>]*>Événement central[^<]*(Fatigue|setting|unimpressed)[^<]*<\/h2>/i.test(htmlContent),
        hasErrorsEnglish: /(Underestimating|Not budgeting|Essential for)/i.test(htmlContent),
        hasCriticalMoment: /Critical\s+Moment/i.test(htmlContent),
        hasWhatReddit: /What\s+Reddit\s+testimonials/i.test(htmlContent),
        englishH2s: htmlContent.match(/<h2[^>]*>[^<]*(Fatigue|setting|Critical|What|Our|Event)[^<]*<\/h2>/gi) || [],
        englishStrongs: htmlContent.match(/<strong[^>]*>(Underestimating|Not budgeting|Essential)[^<]*<\/strong>/gi) || []
      };
      debugLog('intelligent-content-analyzer-optimized.js:2447', 'FIN generateFinalArticle - État final HTML', {htmlLength:htmlContent.length,englishIssues:finalEnglishCheck}, 'A,B,C');
      // #endregion
      
      const finalContent = {
        title: article.titre || 'Témoignage Reddit décrypté par FlashVoyages',
        content: htmlContent
      };
      
      console.log('📄 Contenu final reconstruit (FlashVoyage Premium):', finalContent.title);
      console.log(`   Sections présentes: ${sections.filter(Boolean).length}`);
      return finalContent;
    }
    
    return content;
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
        body: {
        model: 'gpt-4',
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
6. LONGUEUR: MINIMUM 500 mots, IDÉAL 700-1000 mots. Développe chaque section en détail avec des exemples concrets, des chiffres, des conseils actionnables

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
- JAMAIS de Markdown (##, ###, **, etc.)

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
  FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <em>, <strong>. JAMAIS de Markdown.
  LONGUEUR: MINIMUM 700 mots, IDÉAL 900-1200 mots."
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
  FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <em>, <strong>. JAMAIS de Markdown.
  LONGUEUR: MINIMUM 700 mots, IDÉAL 900-1200 mots."
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
  FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <em>, <strong>. JAMAIS de Markdown.
  LONGUEUR: MINIMUM 700 mots, IDÉAL 900-1200 mots."
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
        line.length < 200
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
    const asiaKeywords = ['asia', 'asie', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia'];
    
    nomadKeywords.forEach(keyword => {
      if (text.includes(keyword)) keywords.push(keyword);
    });
    
    asiaKeywords.forEach(keyword => {
      if (text.includes(keyword)) keywords.push(keyword);
    });
    
    return keywords.slice(0, 5).join(', ');
  }

  // Extraire les destinations du texte
  extractDestinations(text) {
    const destinations = [];
    const asiaCountries = ['vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong'];
    
    asiaCountries.forEach(country => {
      if (text.includes(country)) destinations.push(country);
    });
    
    return destinations.length > 0 ? destinations.join(', ') : 'Asie';
  }

  // Contenu de fallback - UNIQUEMENT si erreur technique, PAS de fausses données
  getFallbackContent(article, analysis) {
    // Si erreur technique, on refuse de publier plutôt que de créer du faux contenu
    throw new Error(`ERREUR TECHNIQUE: Impossible de générer le contenu pour "${article.title}". Refus de publier du contenu générique.`);
  }
}

export default IntelligentContentAnalyzerOptimized;
