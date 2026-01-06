#!/usr/bin/env node

import axios from 'axios';
import { OPENAI_API_KEY } from './config.js';
import { extractRedditForAnalysis, isDestinationQuestion, extractMainDestination } from './reddit-extraction-adapter.js';
import { detectRedditPattern } from './reddit-pattern-detector.js';

// 2) Utilitaire pour sécuriser tous les JSON.parse
function safeJsonParse(str, label = 'json') {
  if (!str || typeof str !== 'string' || str.trim().length === 0) {
    throw new Error(`SAFE_JSON_PARSE_EMPTY: ${label}`);
  }
  try {
    return JSON.parse(str);
  } catch (e) {
    const preview = str.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`SAFE_JSON_PARSE_FAIL: ${label} msg=${e.message} preview="${preview}"`);
  }
}

// C) Wrapper LLM avec retry + fallback template DRY_RUN
async function callOpenAIWithRetry(config, retries = 3) {
  const timeout = parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10);
  const isDryRun = process.env.FLASHVOYAGE_DRY_RUN === '1';
  const forceOffline = process.env.FORCE_OFFLINE === '1';
  
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

  // 3) Implémenter un fallback OFFLINE complet
  buildOfflineFallbackArticle(selectedArticle, analysis) {
    const title = selectedArticle?.title || 'Témoignage voyage: retours et leçons';
    const author = selectedArticle?.author || 'un membre de la communauté';
    const sourceName = selectedArticle?.sourceName || selectedArticle?.source || 'Communauté';
    const link = selectedArticle?.link || selectedArticle?.url || '#';

    const country = analysis?.geo?.country || selectedArticle?.geo?.country || null;
    const city = analysis?.geo?.city || selectedArticle?.geo?.city || null;

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
    
    // INTÉGRATION PHASE 2: Pattern Detector (derrière flag ENABLE_PATTERN_DETECTOR)
    // Appelé même si extractRedditForAnalysis échoue (fonction pure, pas de dépendance)
    if (process.env.ENABLE_PATTERN_DETECTOR === '1' && (isRedditArticle || article.subreddit)) {
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
          max_tokens: 600,
          temperature: 0.3
        },
        sourceText: article.content || article.source_text || '',
        article: article,
        type: 'analysis'
      });

      const analysis = safeJsonParse(responseData.choices[0].message.content, 'call1_response');
      // Verrouiller le type pour le plan de widgets
      analysis.type = analysis.type_contenu || analysis.type || 'Témoignage';
      
      // PHASE 2: Ajouter pattern si disponible (même en mode LLM)
      if (redditData && redditData.pattern) {
        analysis.pattern = redditData.pattern;
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
  async generateIntelligentContent(article, analysis) {
    // 1) Court-circuit OFFLINE au tout début (avant tout appel LLM / JSON.parse)
    const offline = process.env.FORCE_OFFLINE === '1';
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (offline || !apiKey || apiKey.startsWith('invalid-')) {
      console.log('⚠️ OFFLINE_CONTENT_FALLBACK: skipping LLM + JSON parsing');
      return this.buildOfflineFallbackArticle(article, analysis);
    }
    
    try {
      console.log('🔍 DEBUG: Author dans article:', article.author);
      // Extraire le contenu complet de l'article source
      const fullContent = await this.extractFullContent(article);
      
      // APPEL 1 : Extraction et structure
      console.log('🧠 Appel 1 : Extraction et structure...');
      const extractionResult = await this.extractAndStructure(article, analysis, fullContent);
      
      // APPEL 2 : Génération finale
      console.log('🧠 Appel 2 : Génération finale...');
      const finalContent = await this.generateFinalArticle(extractionResult, analysis, article);
      
      return finalContent;

    } catch (error) {
      console.error('❌ Erreur génération intelligente:', error.message);
      // 4) Modifier la logique "Refus de publier du contenu générique"
      const offline = process.env.FORCE_OFFLINE === '1';
      if (offline) {
        console.log(`⚠️ OFFLINE_FALLBACK_ON_ERROR: ${error.message}`);
        return this.buildOfflineFallbackArticle(article, analysis);
      }
      // ONLINE: si LLM fail → throw (retry géré par l'appelant)
      throw new Error(`ERREUR TECHNIQUE: Impossible de générer le contenu pour "${article.title}". Refus de publier du contenu générique.`);
    }
  }

  // APPEL 1 : Extraction et structure avec contexte système
  async extractAndStructure(article, analysis, fullContent) {
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

    const userMessage = `TITRE: ${article.title}
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
        max_tokens: 800,
        temperature: 0.7,
        response_format: { type: "json_object" }
      },
      sourceText: fullContent,
      article: article,
      type: 'extraction'
    });

    const content = safeJsonParse(responseData.choices[0].message.content, 'extractAndStructure_response');
    console.log('✅ Extraction terminée:', Object.keys(content));
    return content;
  }

  // APPEL 2 : Génération finale avec contexte système
  async generateFinalArticle(extraction, analysis, article) {
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

    const systemMessage = `Tu es un expert FlashVoyages. Crée un article de qualité exceptionnelle avec la STRUCTURE IMMERSIVE:
${correctionBlock}
⚠️ CONTRAINTE CRITIQUE ABSOLUE: Ce site est spécialisé ASIE uniquement. 
- NE MENTIONNE JAMAIS de destinations non-asiatiques (Portugal, Espagne, Lisbonne, Barcelone, Madrid, Porto, France, Paris, Italie, Rome, Grèce, Turquie, Istanbul, Europe, Amérique, USA, Brésil, Mexique, etc.)
- Utilise UNIQUEMENT des destinations asiatiques: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
- Si le témoignage mentionne une destination non-asiatique, remplace-la par une destination asiatique équivalente ou ignore-la complètement
- Si le témoignage parle de Lisbonne, remplace par Bangkok ou Bali
- Si le témoignage parle de Portugal, remplace par Thaïlande ou Vietnam
- Si le témoignage parle de Barcelone, remplace par Tokyo ou Singapour
- ⚠️ INTERDIT ABSOLU: Ne mentionne JAMAIS Lisbonne, Barcelone, Madrid, Porto, ou toute autre ville/destination non-asiatique dans le titre, le contenu, ou les exemples

STRUCTURE IMMERSIVE OBLIGATOIRE:
1. INTRODUCTION FOMO + CURATION (OBLIGATOIRE)
   Format: Crée une intro spécifique basée sur le contenu réel du témoignage. Utilise les mots-clés, destinations, et expériences mentionnées dans le texte source. Évite les formules génériques comme "Pendant que vous...". Focus sur l'expérience concrète du témoignage.

2. TÉMOIGNAGE AVEC CITATIONS DIRECTES (OBLIGATOIRE) - 3 citations minimum
   - Utilise les citations RÉELLES de l'article source
   - Format OBLIGATOIRE EXACT (en string simple):
     <blockquote>Citation textuelle du Reddit...</blockquote>
     <p>Témoignage de [AUTHOR_REDDIT_REEL] sur [source]</p>
   - IMPORTANT: Mentionne la source UNE SEULE FOIS au début, puis utilise des variantes: "Un membre de la communauté r/digitalnomad", "Un voyageur de la communauté Reddit", "Cette expérience révèle", "Ce témoignage montre"
   - IMPORTANT: Utilise UNIQUEMENT l'author Reddit fourni dans les données pour les citations
   - JAMAIS d'inventer de pseudos - utilise SEULEMENT l'author réel
   - Le titre de l'article NE DOIT PAS contenir le nom de l'auteur
   - TRADUIS TOUTES les citations en français si elles sont en anglais
   - Génère les citations comme des strings simples, pas des objets
   - VARIATION: Après la première citation avec attribution complète, utilise des variantes: "Cette expérience révèle", "Ce témoignage montre", "Son parcours illustre", "Cette approche démontre", "Cette stratégie permet", "Cette méthode révèle"
   - ATTRIBUTION CONTEXTUELLE: Remplace les pseudos Reddit par "Un membre de la communauté r/digitalnomad", "Un voyageur de la communauté Reddit", "Un nomade de la plateforme"
   - ÉVITE: "Pour [pseudo]", "L'auteur raconte", "Il explique" - utilise plutôt "Cette expérience", "Ce témoignage", "Son parcours"

3. ENCAPSULATION DES ÉMOTIONS / RÉACTIONS (OBLIGATOIRE)
   - ⚠️ IMPORTANT : Les sections d'émotions doivent être dans le DÉVELOPPEMENT, PAS dans les CITATIONS
   - Après chaque citation ou étape clé du témoignage, ajoute un bloc dédié aux émotions ressenties
   - Format OBLIGATOIRE EXACT :
     <p>🧠 Ce que [nom/alias Reddit] a probablement ressenti à ce moment-là :</p>
     <blockquote>Exemple : Une montée de stress et d'incompréhension en découvrant que son visa était invalide malgré les promesses de l'agence.</blockquote>
   - ⚠️ Le <blockquote> est correct pour les émotions (c'est une interprétation analytique, pas une citation Reddit)
   - ⚠️ Mais ces sections doivent être dans le champ "developpement", PAS dans "citations"
   - Les "citations" contiennent UNIQUEMENT les vraies citations Reddit avec attribution
   - Les "émotions" sont des interprétations analytiques que tu ajoutes dans le développement
   - Fais une interprétation analytique des émotions non verbalisées par l'utilisateur Reddit
   - Renforce la dimension empathique et la crédibilité rédactionnelle
   - Identifie ce que la personne a probablement ressenti à chaque étape clé (stress, soulagement, frustration, joie, incompréhension, etc.)
   - Base-toi sur le contexte du témoignage pour interpréter les émotions de manière crédible
   - Utilise des formulations comme "probablement ressenti", "sans doute éprouvé", "a dû vivre"

4. TRANSITIONS NARRATEUR (OBLIGATOIRE)
   - Utilise les transitions naturelles basées sur le contenu Reddit réel
   - Crée des liens fluides entre les sections
   - Évite les phrases modèles répétitives
   - ÉVITE les pseudos Reddit dans le texte: "Pour [pseudo]", "L'auteur raconte"
   - UTILISE: "Cette expérience", "Ce témoignage", "Son parcours", "Cette approche"

5. CONSEILS PRATIQUES (OBLIGATOIRE)
   - Remplace les descriptions sensoriel par des conseils actionnables
   - Focus sur la valeur ajoutée concrète
   - Utilise des données réelles du témoignage
   - Évite les descriptions génériques et sensationnelles


6. QUESTIONS RHÉTORIQUES (OBLIGATOIRE)
   - "Comment cette approche pourrait-elle vous aider...", "Que feriez-vous si...", "Comment optimiser..."
   - 2-3 questions par section, focus sur l'action

7. VARIATION DU RYTHME (OBLIGATOIRE)
   - Phrases courtes et percutantes
   - Phrases plus longues pour expliquer et respirer

8. CONTEXTE DES CITATIONS (OBLIGATOIRE)
   - 'L'auteur écrit:', 'Dans les commentaires un lecteur a dit:'
   - Toujours préciser d'où vient la citation (Reddit)

9. MISE EN PERSPECTIVE (OBLIGATOIRE)
   - Terminer chaque section par un enseignement pratique
   - Quel piège à éviter, quelle leçon pour le lecteur nomade

10. SYSTÈME DE TAGS PSYCHOLOGIQUES / META-LECTURE (OBLIGATOIRE)
   - ⚠️ OBLIGATOIRE : Tu DOIS générer au moins 2-3 sections de tags psychologiques dans le développement
   - À chaque fin de section ou de leçon, génère une mini-analyse psychologique
   - Format OBLIGATOIRE EXACT :
     <p>🧩 Leçon transversale :</p>
     <blockquote>Cette situation reflète un biais classique de [biais d'autorité / confiance naïve / effet d'urgence / biais de confirmation / biais de disponibilité / effet Dunning-Kruger / biais de planification / biais d'optimisme / biais de négativité / etc.].</blockquote>
   - ⚠️ Cette section DOIT être présente dans le champ "developpement" ou "tags_psychologiques"
   - Transforme le témoignage en lecture comportementale applicable par le lecteur
   - Identifie les biais cognitifs, erreurs de jugement, ou patterns comportementaux sous-jacents
   - Exemples de biais à identifier :
     - Biais d'autorité : faire confiance aveuglément à une source "officielle"
     - Confiance naïve : croire sans vérifier les promesses
     - Effet d'urgence : prendre des décisions sous pression temporelle
     - Biais de confirmation : chercher des informations qui confirment ses croyances
     - Biais de disponibilité : surestimer la probabilité d'événements récents ou médiatisés
     - Effet Dunning-Kruger : surestimer ses compétences
     - Biais de planification : sous-estimer le temps ou les coûts nécessaires
     - Biais d'optimisme : surestimer les chances de succès
     - Biais de négativité : donner plus de poids aux expériences négatives
   - Base-toi sur le contexte du témoignage pour identifier le biais le plus pertinent
   - Cette analyse apporte un niveau d'utilité éditoriale supérieur en transformant une expérience personnelle en leçon comportementale universelle

11. RÉÉCRITURE VOLONTAIRE DE L'ÉCHEC (OBLIGATOIRE)
   - ⚠️ OBLIGATOIRE : Tu DOIS générer cette section dans le développement
   - Force une section qui reformule l'erreur ou l'échec en "checklist préventive inversée"
   - Format OBLIGATOIRE EXACT :
     <p>⛔️ Ce que [nom/alias Reddit] aurait dû faire :</p>
     <ul>
     <li>Action préventive 1</li>
     <li>Action préventive 2</li>
     <li>Action préventive 3</li>
     </ul>
   - ⚠️ IMPORTANT : N'utilise PAS de [ ] devant les bullet points, juste des <li> simples
   - ⚠️ Cette section DOIT être présente dans le champ "developpement" ou "reecriture_echec"
   - Transforme chaque erreur mentionnée dans le témoignage en action préventive concrète
   - Crée une double couche de valeur : la narration + un outil de prévention directe
   - Identifie les erreurs commises et reformule-les en checklist d'actions à faire pour éviter ces erreurs
   - Base-toi sur le contexte du témoignage pour identifier les erreurs et les transformer en actions préventives
   - Cette approche frontale et directe différencie le contenu de la concurrence
   - Exemples de transformation :
     - Erreur : "J'ai fait confiance à une agence sans vérifier" → Action : "[ ] Vérifier les avis et références de l'agence avant de signer"
     - Erreur : "Je n'ai pas vérifié mon visa avant de partir" → Action : "[ ] Vérifier la validité du visa avant de réserver les vols"
     - Erreur : "Je n'ai pas souscrit d'assurance" → Action : "[ ] Souscrire une assurance voyage avant le départ"

12. TIMELINE INTERACTIVE SIMPLIFIÉE (OBLIGATOIRE)
   - ⚠️ OBLIGATOIRE : Tu DOIS générer cette section dans le développement
   - Génère une structure de timeline des événements clés du témoignage
   - Format OBLIGATOIRE EXACT :
     <p>📅 Chronologie de l'expérience :</p>
     <ul>
     <li>Janv. 2023 : arrivée à Lisbonne</li>
     <li>Fév. 2023 : dépôt de dossier visa</li>
     <li>Mars 2023 : 1er red flag administratif</li>
     <li>...</li>
     </ul>
   - ⚠️ Cette section DOIT être présente dans le champ "developpement" ou "timeline"
   - Identifie les dates et événements clés mentionnés dans le témoignage
   - Organise-les chronologiquement (du plus ancien au plus récent)
   - Utilise les dates mentionnées dans le témoignage (mois, année, ou période approximative)
   - Si aucune date précise n'est mentionnée, utilise des périodes approximatives basées sur le contexte (ex: "Début 2023", "Mi-2023", "Fin 2023")
   - Inclut les événements marquants : arrivée, dépôt de dossier, problèmes rencontrés, solutions trouvées, résultats obtenus
   - Même sans interactivité, ce bloc fixe l'ancrage temporel du témoignage
   - Les concurrents laissent tout ça implicite, toi tu le rends visible et lisible
   - Base-toi sur le contexte du témoignage pour identifier les événements clés et leurs dates

13. ENRICHISSEMENT DESTINATIONS (OBLIGATOIRE)
   - ⚠️ CRITIQUE : Ce site est spécialisé ASIE uniquement. NE MENTIONNE JAMAIS de destinations non-asiatiques (Portugal, Espagne, Lisbonne, Barcelone, Europe, Amérique, etc.)
   - Intègre subtilement des mentions de destinations spécifiques dans le contenu
   - Utilise UNIQUEMENT des destinations asiatiques: Thaïlande, Vietnam, Indonésie, Japon, Corée du Sud, Philippines, Singapour
   - Mentionne UNIQUEMENT des villes asiatiques: Bangkok, Ho Chi Minh, Bali, Tokyo, Manille, Singapour, Séoul, Canggu, etc.
   - ⚠️ INTERDIT: Ne mentionne JAMAIS Lisbonne, Barcelone, Madrid, Porto, ou toute autre ville/destination non-asiatique
   - Intègre naturellement dans les conseils et exemples
   - Évite les listes génériques, privilégie les mentions contextuelles

14. GLOSSAIRE IMPLICITE INTÉGRÉ (CONDITIONNEL)
   - ⚠️ CRITIQUE : Cette section doit être générée UNIQUEMENT s'il y a vraiment des termes techniques, acronymes, sigles, ou expressions spécifiques mentionnés dans le témoignage
   - ⚠️ Si aucun terme technique n'est mentionné, NE GÉNÈRE PAS cette section (laisse le champ "glossaire" vide ou null)
   - ⚠️ NE CRÉE PAS de termes inventés ou génériques (comme "D8", "NIF", "SEF") si ils ne sont PAS explicitement mentionnés dans le témoignage
   - ⚠️ EXEMPLE À NE PAS FAIRE : Si le témoignage parle de "Canggu" et "Bali" sans mentionner de termes techniques, NE GÉNÈRE PAS un glossaire avec "D8", "NIF", "SEF Portugal" car ces termes ne sont PAS mentionnés
   - Si des termes techniques sont présents, ajoute à la fin du témoignage un glossaire des termes techniques ou spécifiques utilisés
   - Format OBLIGATOIRE EXACT (si des termes techniques sont présents) :
     <p>📖 Termes utilisés dans ce récit :</p>
     <ul>
     <li>D8 : visa long séjour portugais pour travailleurs indépendants</li>
     <li>NIF : numéro fiscal portugais</li>
     <li>...</li>
     </ul>
   - ⚠️ Ne crée PAS de termes génériques ou inventés si aucun terme technique n'est réellement mentionné dans le témoignage
   - Identifie UNIQUEMENT les termes techniques, acronymes, sigles, ou expressions spécifiques RÉELLEMENT mentionnés dans le témoignage
   - Inclut les termes liés aux visas, formalités administratives, documents officiels, procédures spécifiques
   - Fournit une définition claire et concise pour chaque terme
   - Élève la lisibilité pour les lecteurs moins expérimentés
   - Aucun concurrent ne structure ça en bas de page, c'est un micro-bloc mais un fort différenciateur UX
   - Base-toi sur le contexte du témoignage pour identifier les termes à expliquer
   - Exemples de termes à inclure :
     - Acronymes de visas (D8, D7, Golden Visa, etc.)
     - Numéros fiscaux (NIF, NIE, etc.)
     - Documents officiels (CPF, CNPJ, etc.)
     - Procédures administratives spécifiques
     - Termes techniques liés au nomadisme digital

15. INDEXATION INTERNE STRUCTURÉE (CONDITIONNEL)
   - ⚠️ CRITIQUE : Cette section doit être générée UNIQUEMENT s'il y a vraiment des ressources (services, sites, démarches) mentionnées dans le témoignage
   - ⚠️ Si aucune ressource n'est mentionnée, NE GÉNÈRE PAS cette section (laisse le champ "indexation" vide ou null)
   - ⚠️ NE CRÉE PAS de ressources inventées ou génériques (comme "Site officiel SEF Portugal", "Agence locale X") si elles ne sont PAS explicitement mentionnées dans le témoignage
   - ⚠️ EXEMPLE À NE PAS FAIRE : Si le témoignage parle de "Canggu" et "Bali" sans mentionner de sites officiels ou d'agences, NE GÉNÈRE PAS une indexation avec "Site officiel SEF Portugal" car cette ressource n'est PAS mentionnée
   - Si des ressources sont mentionnées, ajoute une ancre de référencement pour chaque ressource RÉELLEMENT mentionnée
   - Format OBLIGATOIRE EXACT (si des ressources sont mentionnées) :
     <p>🧭 Ressource mentionnée :</p>
     <ul>
     <li><a href="...">Site officiel SEF Portugal</a></li>
     <li><a href="...">Agence locale X utilisée (non recommandée)</a></li>
     <li>...</li>
     </ul>
   - ⚠️ Ne crée PAS de ressources génériques ou inventées si aucune ressource n'est réellement mentionnée dans le témoignage
   - Identifie UNIQUEMENT les ressources RÉELLEMENT mentionnées dans le témoignage : sites officiels, agences, services, démarches administratives
   - Crée des liens vers les ressources officielles (sites gouvernementaux, services publics, etc.)
   - Pour les agences ou services utilisés mais non recommandés, indique-le clairement dans le libellé du lien
   - Pour les ressources recommandées, crée des liens vers les sites officiels
   - Prépare ton propre hub d'autorité en créant une base de liens internes utiles en bas de chaque témoignage
   - Base-toi sur le contexte du témoignage pour identifier toutes les ressources mentionnées
   - Exemples de ressources à inclure :
     - Sites officiels gouvernementaux (SEF Portugal, consulat, etc.)
     - Agences ou services utilisés (avec mention si recommandé ou non)
     - Démarches administratives mentionnées
     - Services de nomadisme digital mentionnés
     - Outils ou plateformes utilisés dans le témoignage${marketingSection}

TON: Inspirant, motivant, authentique
FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <ul><li>, <strong>, <table>
Pour les tableaux (si nécessaire), utilise le format WordPress natif:
<!-- wp:table -->
<figure class="wp-block-table">
<table class="has-fixed-layout">
<thead><tr><th>...</th></tr></thead>
<tbody><tr><td>...</td></tr></tbody>
</table>
</figure>
<!-- /wp:table -->
LONGUEUR: 1500-2000 mots

IMPORTANT: Le titre de l'article NE DOIT PAS contenir le nom de l'auteur Reddit. Utilise l'author UNIQUEMENT dans les citations.
TRADUCTION: Traduis TOUTES les citations en français si elles sont en anglais.

⚠️ STRUCTURE JSON OBLIGATOIRE - TOUTES LES SECTIONS DOIVENT ÊTRE GÉNÉRÉES :
{
  "article": {
    "titre": "...",
    "introduction": "...",
    "citations": [...],
    "developpement": "...",
    "emotions": "...",  // ⚠️ OBLIGATOIRE : Sections d'émotions (🧠) intégrées dans le développement
    "tags_psychologiques": "...",  // ⚠️ OBLIGATOIRE : Sections de tags psychologiques (🧩) intégrées dans le développement
    "reecriture_echec": "...",  // ⚠️ OBLIGATOIRE : Section de réécriture de l'échec (⛔️) intégrée dans le développement
    "timeline": "...",  // ⚠️ OBLIGATOIRE : Section timeline (📅) intégrée dans le développement
    "glossaire": "...",  // ⚠️ CONDITIONNEL : Section glossaire (📖) UNIQUEMENT si des termes techniques sont mentionnés dans le témoignage. Sinon, laisse vide ou null.
    "indexation": "...",  // ⚠️ CONDITIONNEL : Section indexation (🧭) UNIQUEMENT si des ressources sont mentionnées dans le témoignage. Sinon, laisse vide ou null.
    "conseils_pratiques": "...",
    "signature": "..."
  }
}

⚠️ IMPORTANT :
- Les sections "emotions", "tags_psychologiques", "reecriture_echec", "timeline" doivent être INTÉGRÉES dans le champ "developpement" (pas séparées)
- Les sections "glossaire" et "indexation" doivent être à la fin, après "conseils_pratiques" (SEULEMENT si elles sont générées)
- Les émotions (🧠) doivent être dans le développement, PAS dans les citations
- Toutes les sections doivent utiliser les formats EXACTS définis dans le prompt système
- ⚠️ "glossaire" et "indexation" sont STRICTEMENT CONDITIONNELS : ne les génère QUE s'il y a vraiment des termes techniques ou des ressources mentionnées dans le témoignage
- ⚠️ NE CRÉE PAS de contenu inventé ou générique pour ces sections
- ⚠️ Si aucun terme technique n'est mentionné dans le témoignage, laisse "glossaire" vide ou null (PAS de termes inventés comme "D8", "NIF" si ils ne sont pas mentionnés)
- ⚠️ Si aucune ressource n'est mentionnée dans le témoignage, laisse "indexation" vide ou null (PAS de ressources inventées comme "Site officiel SEF Portugal" si il n'est pas mentionné)
- ⚠️ Vérifie TOUJOURS dans le contenu du témoignage avant de générer ces sections : si les termes/ressources ne sont pas explicitement mentionnés, NE GÉNÈRE PAS ces sections

Réponds UNIQUEMENT en JSON avec cette structure complète.`;

    const userMessage = `TITRE: ${extraction.title || 'Témoignage Reddit'}
AUTHOR_REDDIT_REEL: ${article.author}
CITATIONS: ${extraction.citations || 'Citations'}
DONNÉES: ${extraction.donnees_cles || 'Données'}
ENSEIGNEMENTS: ${extraction.enseignements || 'Enseignements'}
DÉFIS: ${extraction.defis || 'Défis'}
STRATÉGIES: ${extraction.strategies || 'Stratégies'}
RÉSULTATS: ${extraction.resultats || 'Résultats'}
COÛTS: ${extraction.couts || 'Coûts'}
ERREURS: ${extraction.erreurs || 'Erreurs'}
SPÉCIFICITÉS: ${extraction.specificites || 'Spécificités'}
COMPARAISONS: ${extraction.comparaisons || 'Comparaisons'}
CONSEILS: ${extraction.conseils || 'Conseils'}`;

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
        max_tokens: 1500,
        temperature: 0.7,
        response_format: { type: "json_object" }
      },
      sourceText: extraction.citations?.join(' ') || userMessage,
      article: article,
      type: 'generation'
    });

    const content = safeJsonParse(responseData.choices[0].message.content, 'extractAndStructure_response');
    console.log('✅ Article final généré:', Object.keys(content));
    
    // Reconstruire le contenu final à partir de la structure article
    if (content.article) {
      const article = content.article;
      
      // Construire le développement avec toutes les sections intégrées
      let developpementComplet = article.developpement || '';
      
      // Intégrer les sections dans le développement (si elles sont séparées, les fusionner)
      if (article.emotions && !developpementComplet.includes('🧠')) {
        developpementComplet += '\n\n' + article.emotions;
      }
      if (article.tags_psychologiques && !developpementComplet.includes('🧩')) {
        developpementComplet += '\n\n' + article.tags_psychologiques;
      }
      if (article.reecriture_echec && !developpementComplet.includes('⛔️')) {
        developpementComplet += '\n\n' + article.reecriture_echec;
      }
      if (article.timeline && !developpementComplet.includes('📅')) {
        developpementComplet += '\n\n' + article.timeline;
      }
      
      const finalContent = {
        title: article.titre || 'Témoignage Reddit décrypté par FlashVoyages',
        content: [
          article.introduction,
          // Citations : UNIQUEMENT les vraies citations Reddit, PAS les émotions
          ...(article.citations || []).map(citation => {
            if (typeof citation === 'string') {
              // Vérifier que ce n'est pas une section d'émotions
              if (citation.includes('🧠') || citation.includes('Ce que') && citation.includes('ressenti')) {
                console.log('⚠️ Section d\'émotions détectée dans les citations - déplacée vers le développement');
                developpementComplet += '\n\n' + citation;
                return null; // Ne pas inclure dans les citations
              }
              return citation;
            }
            // Si c'est un objet, essayer d'extraire le texte
            const text = citation.text || citation.quote || citation.content || citation;
            // Vérifier que ce n'est pas une section d'émotions
            if (typeof text === 'string' && (text.includes('🧠') || (text.includes('Ce que') && text.includes('ressenti')))) {
              console.log('⚠️ Section d\'émotions détectée dans les citations - déplacée vers le développement');
              developpementComplet += '\n\n' + text;
              return null; // Ne pas inclure dans les citations
            }
            // JAMAIS DE FAKE DATA - Utiliser SEULEMENT les vraies données
            if (!article.author) {
              throw new Error(`ERREUR CRITIQUE: Pas d'author Reddit disponible pour "${article.title}". Refus de publier avec des données inventées.`);
            }
            const auteur = `u/${article.author}`;
            const source = citation.source || 'Reddit';
            return `<blockquote>${text}</blockquote>\n<p>Témoignage de ${auteur} sur ${source}</p>`;
          }).filter(Boolean), // Filtrer les null
          developpementComplet,
          article.conseils_pratiques,
          // Sections finales : glossaire et indexation (seulement si présents)
          article.glossaire && article.glossaire.trim() ? article.glossaire : null,
          article.indexation && article.indexation.trim() ? article.indexation : null,
          article.signature
        ].filter(Boolean).join('\n\n')
      };
      console.log('📄 Contenu final reconstruit:', finalContent.title);
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

      const content = safeJsonParse(responseData.choices[0].message.content, 'call2_response');
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
      
      const isDryRun = process.env.FLASHVOYAGE_DRY_RUN === '1';
      const forceOffline = process.env.FORCE_OFFLINE === '1';
      
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
