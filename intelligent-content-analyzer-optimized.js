#!/usr/bin/env node

import axios from 'axios';
import { OPENAI_API_KEY, DRY_RUN, FORCE_OFFLINE } from './config.js';
import { extractRedditForAnalysis, isDestinationQuestion, extractMainDestination } from './reddit-extraction-adapter.js';
import { detectRedditPattern } from './reddit-pattern-detector.js';
import { compileRedditStory } from './reddit-story-compiler.js';

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
      return translated;
    } catch (error) {
      console.warn(`⚠️ Erreur lors de la traduction: ${error.message}. Texte non traduit.`);
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
- Exemples BONS:
  ✅ "Visa Nomade Digital en Thaïlande : Mon Retour d'Expérience 2024"
  ✅ "Vivre à Bali avec 1000€/mois : Budget Réaliste pour Nomades"
  ✅ "Arnaque eSIM en Indonésie : Comment je l'ai évitée"
- Exemples MAUVAIS (trop fades):
  ❌ "Témoignage voyage: retours et leçons"
  ❌ "Mon expérience en Asie"
- Le titre DOIT contenir une destination asiatique précise (ville ou pays)
- Le titre DOIT être actionnable et spécifique
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
- ❌ INTERDIT: "Indonesia just launched..." → ✅ CORRECT: "L'Indonésie vient de lancer..."
- ❌ INTERDIT: "Thailand LTR visa is available..." → ✅ CORRECT: "Le visa LTR de Thaïlande est disponible..."
- ❌ INTERDIT: "Vietnam doesn't have..." → ✅ CORRECT: "Le Vietnam n'a pas..."
- ❌ INTERDIT: "The regular tourist visa..." → ✅ CORRECT: "Le visa touristique régulier..."
- ❌ INTERDIT: "Requirements are reasonable..." → ✅ CORRECT: "Les exigences sont raisonnables..."
- Traduis TOUS les textes anglais en français AVANT de les mettre dans le JSON
- Ne laisse AUCUN texte en anglais dans le contenu final
- VÉRIFIE que chaque champ du JSON est en français avant de répondre

🚨 GARDE-FOUS EXPLICITES (SOURCE OF TRUTH):
- N'invente aucun fait
- Si une section est absente dans le JSON story, ne la crée pas
- Sépare strictement l'auteur et la communauté
- Priorité absolue à la fidélité de la source
- Toutes les sections doivent être traçables au story.evidence

📐 STRUCTURE OBLIGATOIRE (dans cet ordre exact) :

1. CONTEXTE (OBLIGATOIRE)
   - Reformulation neutre de story.context.summary
   - Pas d'analyse, pas de jugement
   - Si story.context.summary est null → section absente

2. ÉVÉNEMENT CENTRAL (CONDITIONNEL)
   - Basé uniquement sur story.central_event.summary
   - Si null → section absente (ne pas inventer)
   - Reformulation neutre, pas de dramatisation

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
   ⚠️ NE JAMAIS utiliser "Questions ouvertes" - c'est anti-marketing !
   - TOUJOURS donner des recommandations FERMES et ACTIONNABLES
   - Format: <h2>🎯 Nos recommandations : Par où commencer ?</h2>
   - Structure: 3 options classées (🥇 #1, 🥈 #2, 🥉 #3)
   - Pour chaque option: budget réaliste, avantages (✅), inconvénients (⚠️)
   - Inclure CTAs clairs: "Voir les forfaits", "Comparer les prix", etc.
   - Budgets RÉALISTES (jamais < 700 USD/mois pour Asie)
   - Basé sur story evidence + extracted locations
   - Si données insuffisantes: recommander destinations génériques (Vietnam, Thaïlande, Malaisie)

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

${marketingSection}

FORMAT HTML: <h2>, <h3>, <p>, <ul><li>, <blockquote>, <strong>
LONGUEUR MINIMALE OBLIGATOIRE: 2000-3000 mots
⚠️ IMPORTANT: Chaque section doit être DÉVELOPPÉE et DÉTAILLÉE
- Contexte: minimum 200 mots avec tous les détails disponibles
- Événement central: minimum 300 mots avec chronologie précise
- Moment critique: minimum 200 mots si disponible
- Résolution: minimum 200 mots si disponible
- Développe TOUS les points issus du story, ne résume pas !

⚠️ STRUCTURE JSON OBLIGATOIRE :
{
  "article": {
    "titre": "...",
    "contexte": "...",  // Section 1 (si story.context.summary existe)
    "evenement_central": "...",  // Section 2 (si story.central_event.summary existe, sinon null)
    "moment_critique": "...",  // Section 3 (si story.critical_moment.summary existe, sinon null)
    "resolution": "...",  // Section 4 (si story.resolution.summary existe, sinon null)
    "lecons_auteur": "...",  // Section 5 (si story.author_lessons non vide, sinon null)
    "insights_communaute": "...",  // Section 6 (si story.community_insights non vide, sinon null)
    "recommandations": "...",  // Section 7 OBLIGATOIRE (3 options classées avec budgets + CTAs)
    "citations": [...],  // Citations courtes depuis evidence (max 5)
    "signature": "..."
  }
}

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

📍 DONNÉES EXTRAITES (à intégrer naturellement):
${locationsData ? `- Destinations: ${locationsData}` : ''}
${datesData ? `- Dates: ${datesData}` : ''}
${costsData ? `- Coûts: ${costsData}` : ''}
${eventsData ? `- Événements: ${eventsData}` : ''}
${problemsData ? `- Problèmes: ${problemsData}` : ''}
${insightsData ? `- Insights communauté: ${insightsData}` : ''}
${warningsData ? `- Warnings communauté: ${warningsData}` : ''}
${consensusData ? `- Consensus: ${consensusData}` : ''}

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
      const sections = [];
      
      // 1. Contexte (si présent)
      if (article.contexte && article.contexte.trim()) {
        const contexteText = article.contexte.trim();
        const englishDetection = this.detectEnglishContent(contexteText);
        let finalContexte = contexteText;
        if (englishDetection.isEnglish) {
          console.log(`🌐 Section "Contexte" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          finalContexte = await this.translateToFrench(contexteText);
        }
        sections.push(`<h2>Contexte</h2>\n${finalContexte}`);
      }
      
      // 2. Événement central (si présent)
      if (article.evenement_central && article.evenement_central.trim()) {
        const evenementText = article.evenement_central.trim();
        const englishDetection = this.detectEnglishContent(evenementText);
        let finalEvenement = evenementText;
        if (englishDetection.isEnglish) {
          console.log(`🌐 Section "Événement central" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          finalEvenement = await this.translateToFrench(evenementText);
        }
        sections.push(`<h2>Événement central</h2>\n${finalEvenement}`);
      }
      
      // 3. Moment critique (si présent) - TRADUCTION FORCÉE
      if (article.moment_critique && article.moment_critique.trim()) {
        const momentText = article.moment_critique.trim();
        console.log(`🌐 Section "Moment critique": traduction forcée en français...`);
        // TOUJOURS traduire
        const finalMoment = await this.translateToFrench(momentText);
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
            
            // Détecter si la citation est en anglais et la traduire si nécessaire
            const englishDetection = this.detectEnglishContent(cleanCitation);
            
            if (englishDetection.isEnglish) {
              console.log(`🌐 Citation détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
              cleanCitation = await this.translateToFrench(cleanCitation);
            }
            
            if (cleanCitation.length > 0 && cleanCitation.length <= 200) {
              return `<p>« ${cleanCitation} » — ${extracted.author || 'auteur Reddit'}</p>`;
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
        
        // Si après nettoyage il reste du contenu, l'ajouter avec UN SEUL H2
        if (cleanedInsights.trim()) {
          sections.push(`<h2>Ce que la communauté apporte</h2>\n${cleanedInsights}`);
        }
      }
      
      // 8. Nos recommandations (OBLIGATOIRE - remplace "questions ouvertes")
      if (article.recommandations && article.recommandations.trim()) {
        // Détecter si le contenu est en anglais et le traduire si nécessaire
        const recoText = article.recommandations.trim();
        const englishDetection = this.detectEnglishContent(recoText);
        
        let finalReco = recoText;
        if (englishDetection.isEnglish) {
          console.log(`🌐 Section "Recommandations" détectée en anglais (${Math.round(englishDetection.ratio * 100)}%): traduction en cours...`);
          finalReco = await this.translateToFrench(recoText);
        }
        
        sections.push(finalReco); // Le titre H2 est déjà inclus dans le contenu
      } else {
        // Fallback si le LLM n'a pas généré de recommandations (ne devrait jamais arriver)
        console.warn('⚠️ Aucune recommandation générée par le LLM - ajout de recommandations génériques');
        sections.push(`<h2>🎯 Nos recommandations</h2>\n<p>Nous recommandons de privilégier l'Asie du Sud-Est pour un budget maîtrisé et des infrastructures fiables.</p>`);
      }
      
      // 9. Signature (si présente)
      if (article.signature && article.signature.trim()) {
        sections.push(article.signature);
      }
      
      let htmlContent = sections.filter(Boolean).join('\n\n');
      
      // SUPPRESSION DES BLOCKQUOTES GÉNÉRÉS PAR LE LLM (le finalizer les rajoutera traduits)
      htmlContent = htmlContent.replace(/<blockquote[^>]*>.*?<\/blockquote>/gs, '');
      console.log('🧹 Blockquotes LLM supprimés (le finalizer les réinsérera traduits)');
      
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
