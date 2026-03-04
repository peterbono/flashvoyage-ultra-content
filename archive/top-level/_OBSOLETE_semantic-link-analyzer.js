#!/usr/bin/env node

/**
 * ANALYSEUR SÉMANTIQUE LLM - IDENTIFIER LES OPPORTUNITÉS DE LIENS INTERNES
 */

import { getOpenAIClient, isOpenAIAvailable } from './openai-client.js';
import fs from 'fs';
import { AnchorTextValidator } from './anchor-text-validator.js';
import { DRY_RUN, FORCE_OFFLINE } from './config.js';

class SemanticLinkAnalyzer {
  constructor(apiKey) {
    // Utiliser le client centralisé (initialisation lazy - pas d'import OpenAI au top-level)
    // Le client sera initialisé de manière async dans les méthodes qui l'utilisent
    this.client = null; // Initialisé lazy via getOpenAIClient() dans les méthodes async
    this.articlesDatabase = null;
    this.anchorValidator = new AnchorTextValidator();
  }
  
  // Helper pour obtenir le client de manière lazy
  async getClient() {
    if (!this.client) {
      this.client = await getOpenAIClient();
    }
    return this.client;
  }

  loadArticlesDatabase(filename = 'articles-database.json') {
    console.log(`📚 Chargement de la base de données: ${filename}`);
    
    try {
      const data = fs.readFileSync(filename, 'utf-8');
      this.articlesDatabase = JSON.parse(data);
      console.log(`✅ ${this.articlesDatabase.total_articles} articles chargés\n`);
      return true;
    } catch (error) {
      console.error(`❌ Erreur lors du chargement: ${error.message}`);
      return false;
    }
  }

  /**
   * 2. Extraire destination depuis un article (catégories/tags)
   */
  extractDestinationFromArticle(article) {
    const categories = (article.categories || []).map(c => c.name?.toLowerCase() || '').join(' ');
    const tags = (article.tags || []).map(t => t.name?.toLowerCase() || '').join(' ');
    const combined = `${categories} ${tags}`.toLowerCase();
    
    const destinationMap = {
      'japon': 'japan',
      'japan': 'japan',
      'thaïlande': 'thailand',
      'thailand': 'thailand',
      'vietnam': 'vietnam',
      'indonésie': 'indonesia',
      'indonesia': 'indonesia',
      'corée': 'korea',
      'korea': 'korea',
      'philippines': 'philippines',
      'singapour': 'singapore',
      'singapore': 'singapore'
    };
    
    for (const [term, dest] of Object.entries(destinationMap)) {
      if (combined.includes(term)) {
        return dest;
      }
    }
    
    return null; // Pas de destination connue
  }

  async analyzeAndSuggestLinks(newArticleContent, newArticleTitle, maxLinks = 8, currentArticleId = null, linkContext = {}) {
    console.log('🤖 ANALYSE SÉMANTIQUE POUR LIENS INTERNES');
    console.log('==========================================\n');
    console.log(`📝 Article à analyser: "${newArticleTitle}"`);
    console.log(`🎯 Objectif: Trouver ${maxLinks} liens internes pertinents\n`);

    if (!this.articlesDatabase) {
      throw new Error('Base de données non chargée. Appelez loadArticlesDatabase() d\'abord.');
    }

    // Fonction pour détecter les candidats non-Asie
    const NON_ASIA_TERMS = [
      'portugal','spain','espagne','lisbon','lisbonne','barcelona','barcelone','madrid','porto',
      'france','paris','italy','italie','rome','greece','grèce','turkey','turquie','istanbul',
      'europe','america','usa','brazil','brésil','mexico','mexique'
    ];
    
    function isNonAsiaCandidate(post) {
      const hay = `${post.title || ''} ${post.slug || ''} ${post.url || ''}`.toLowerCase();
      return NON_ASIA_TERMS.some(t => hay.includes(t));
    }

    // Préparer la liste des articles disponibles pour le LLM
    // EXCLURE l'article en cours pour éviter les autolinks
    let availableArticles = this.articlesDatabase.articles
      .filter(article => article.id !== currentArticleId)
      .map(article => ({
        id: article.id,
        title: article.title,
        url: article.url,
        slug: article.slug || '',
        categories: article.categories.map(c => c.name).join(', '),
        tags: article.tags.map(t => t.name).join(', '),
        // 2. Ajouter destination pour filtrage strict
        _destination: this.extractDestinationFromArticle(article)
      }));
    
    // FILTRE 1: Si destination Asie, purger toute référence non-Asie
    if (linkContext?.destination) {
      const beforeCount = availableArticles.length;
      availableArticles = availableArticles.filter(p => !isNonAsiaCandidate(p));
      const filteredCount = beforeCount - availableArticles.length;
      if (filteredCount > 0) {
        console.log(`🚫 ${filteredCount} articles non-Asie filtrés (destination: ${linkContext.destination})`);
      }
    }
    
    // FILTRE 2: Filtrer strictement par destination si spécifiée (AVANT LLM)
    // 4) Normalisation destination pour le filtre des liens internes WP (comparaison lowercase)
    if (linkContext?.destination && linkContext.destination !== 'Asie') {
      const beforeDestFilter = availableArticles.length;
      const targetDestination = linkContext.destination.toLowerCase(); // Normaliser en lowercase
      const destinationMap = {
        'japan': ['japon', 'japan'],
        'thailand': ['thaïlande', 'thailand'],
        'vietnam': ['vietnam'],
        'indonesia': ['indonésie', 'indonesia'],
        'korea': ['corée', 'korea'],
        'philippines': ['philippines'],
        'singapore': ['singapour', 'singapore']
      };
      
      const expectedTerms = destinationMap[targetDestination] || [];
      availableArticles = availableArticles.filter(article => {
        // Utiliser destination extraite si disponible (comparaison lowercase)
        if (article._destination) {
          return article._destination.toLowerCase() === targetDestination;
        }
        
        // Sinon, chercher dans catégories/tags
        const articleText = `${article.categories} ${article.tags}`.toLowerCase();
        return expectedTerms.some(term => articleText.includes(term));
      });
      
      const afterDestFilter = availableArticles.length;
      if (beforeDestFilter !== afterDestFilter) {
        console.log(`🚫 ${beforeDestFilter - afterDestFilter} articles hors destination filtrés (${targetDestination})`);
      }
    }
    
    console.log(`📚 Articles disponibles: ${availableArticles.length} (article ${currentArticleId} exclu)\n`);

    // Créer le prompt pour Claude
    const prompt = this.createAnalysisPrompt(newArticleContent, newArticleTitle, availableArticles, maxLinks);

    console.log('🔄 Envoi à OpenAI pour analyse...\n');

    // D) Guard FORCE_OFFLINE / DRY_RUN: pas d'appel OpenAI si API key invalide
    const forceOffline = FORCE_OFFLINE;
    const isDryRun = DRY_RUN;
    
    // Initialiser le client de manière lazy (pas d'import OpenAI si FORCE_OFFLINE=1)
    const client = await this.getClient();
    const hasInvalidKey = !client || (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('invalid-'));
    
    if (forceOffline || hasInvalidKey) {
      console.log('⚠️ LINKS_LLM_SKIPPED: invalid_key ou FORCE_OFFLINE=1 - Utilisation heuristique interne uniquement');
      // 2) Corriger l'exception: utiliser fonction utilitaire au lieu de méthode inexistante
      const heuristicResult = generateHeuristicLinks(newArticleContent, newArticleTitle, availableArticles, maxLinks, linkContext);
      // Adapter le format pour correspondre au format attendu
      return {
        suggested_links: heuristicResult.suggested_links.map(link => ({
          article_id: link.target_id,
          article_title: availableArticles.find(a => a.id === link.target_id)?.title || '',
          article_url: link.target_url,
          anchor_text: link.anchor,
          placement_context: link.context,
          relevance_score: link.relevance_score,
          reasoning: link.context
        })),
        analysis_summary: heuristicResult.reasoning
      };
    }

    try {
      if (!client) {
        throw new Error('OpenAI non disponible (FORCE_OFFLINE=1 ou clé API manquante)');
      }
      
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      
      console.log('✅ ANALYSE TERMINÉE\n');
      console.log(`📊 RÉSULTATS BRUTS:`);
      console.log(`  - Liens suggérés: ${analysis.suggested_links.length}`);
      console.log(`  - Score de pertinence moyen: ${this.calculateAverageScore(analysis.suggested_links)}/10\n`);

      // Valider les ancres suggérées
      const validation = this.anchorValidator.validateBatch(analysis.suggested_links);
      
      // Remplacer par les liens valides uniquement
      analysis.suggested_links = validation.valid;
      
      // 2. FILTRE POST-LLM: Filtrer strictement par destination
      if (linkContext?.destination && linkContext.destination !== 'Asie') {
        const beforeFilter = analysis.suggested_links.length;
        analysis.suggested_links = analysis.suggested_links.filter(link => {
          // Trouver l'article cible dans la DB (le LLM peut retourner article_id, target_id, ou url)
          const linkId = link.article_id || link.target_id || link.id;
          const linkUrl = link.url || link.target_url;
          
          const targetArticle = this.articlesDatabase.articles.find(a => 
            (linkId && a.id === linkId) || 
            (linkUrl && (a.url === linkUrl || a.slug === linkUrl))
          );
          
          if (!targetArticle) {
            // FIX 2: Séparer clairement NO_TARGET vs DESTINATION_MISMATCH
            const candidatesCount = this.articlesDatabase.articles.filter(a => 
              (linkId && a.id === linkId) || 
              (linkUrl && (a.url === linkUrl || a.slug === linkUrl))
            ).length;
            console.log(`   ⚠️ INTERNAL_LINK_REJECTED_NO_TARGET: anchor="${link.anchor_text}" id=${linkId} url=${linkUrl} candidates=${candidatesCount} current_dest=${linkContext.destination}`);
            return false;
          }
          
          // Extraire destination de l'article cible (catégories/tags)
          const targetCategories = (targetArticle.categories || []).map(c => c.name?.toLowerCase() || '').join(' ');
          const targetTags = (targetArticle.tags || []).map(t => t.name?.toLowerCase() || '').join(' ');
          const targetText = `${targetCategories} ${targetTags}`.toLowerCase();
          
          // Mapping destination → catégories/tags attendus
          const destinationMap = {
            'japan': ['japon', 'japan'],
            'thailand': ['thaïlande', 'thailand'],
            'vietnam': ['vietnam'],
            'indonesia': ['indonésie', 'indonesia'],
            'korea': ['corée', 'korea'],
            'philippines': ['philippines'],
            'singapore': ['singapour', 'singapore']
          };
          
          const expectedTerms = destinationMap[linkContext.destination] || [];
          const matchesDestination = expectedTerms.some(term => targetText.includes(term));
          
          if (!matchesDestination) {
            // FIX 2: Log clair avec toutes les infos
            console.log(`   ⚠️ INTERNAL_LINK_REJECTED_DESTINATION_MISMATCH: anchor="${link.anchor_text}" target_title="${targetArticle.title}" target_dest=${targetText.substring(0, 50)} current_dest=${linkContext.destination} candidates=${this.articlesDatabase.articles.length}`);
            return false;
          }
          
          return true;
        });
        
        const afterFilter = analysis.suggested_links.length;
        if (beforeFilter !== afterFilter) {
          console.log(`   🚫 ${beforeFilter - afterFilter} liens rejetés (destination mismatch: ${linkContext.destination})`);
        }
      }
      
      console.log(`📊 RÉSULTATS APRÈS VALIDATION:`);
      console.log(`  - Liens valides: ${validation.valid.length}`);
      console.log(`  - Liens rejetés: ${validation.invalid.length}\n`);

      return analysis;

    } catch (error) {
      console.error('❌ Erreur lors de l\'analyse:', error.message);
      throw error;
    }
  }

  createAnalysisPrompt(articleContent, articleTitle, availableArticles, maxLinks) {
    // Extraire des phrases clés du contenu pour aider GPT à trouver des ancres réelles
    const textContent = articleContent.replace(/<[^>]*>/g, ' ').substring(0, 3000);
    
    return `Tu es un expert SEO spécialisé dans les liens internes pour FlashVoyages.com, un site sur le nomadisme digital en Asie.

NOUVEL ARTICLE À ANALYSER:
Titre: ${articleTitle}

Contenu (texte brut pour trouver les ancres):
${textContent}

ARTICLES DISPONIBLES POUR LIENS INTERNES:
${JSON.stringify(availableArticles, null, 2)}

⚠️ IMPORTANT: Pour article_title, utilise TOUJOURS le champ "title" (pas "excerpt") !

TA MISSION:
Identifie les ${maxLinks} meilleurs opportunités de liens internes pour cet article.

⚠️ RÈGLES CRITIQUES POUR LES ANCRES:
1. L'anchor_text DOIT être un mot ou une phrase QUI EXISTE EXACTEMENT dans le contenu ci-dessus
2. Vérifie que le texte de l'ancre est présent mot pour mot dans le contenu
3. Utilise des expressions courtes (2-5 mots maximum)
4. Privilégie les expressions complètes plutôt que des mots isolés
5. NE PAS inventer d'ancres qui n'existent pas dans le texte

CRITÈRES DE SÉLECTION:
1. Pertinence sémantique (même sujet, destination similaire, thématique connexe)
2. Valeur ajoutée pour le lecteur (complément d'information utile)
3. Diversité (ne pas suggérer que des articles sur la même destination)
4. Ancre existante (VÉRIFIE que le texte existe dans le contenu)

POUR CHAQUE LIEN SUGGÉRÉ, FOURNIS:
- article_id: L'ID de l'article
- article_title: Utilise le champ "title" de l'article (PAS "excerpt")
- article_url: L'URL de l'article
- anchor_text: Le texte d'ancrage (DOIT exister dans le contenu ci-dessus)
- placement_context: Où placer le lien (ex: "dans la section sur les coûts")
- relevance_score: Score de pertinence de 1 à 10
- reasoning: Pourquoi ce lien est pertinent (1 phrase)

RÉPONDS UNIQUEMENT EN JSON VALIDE:
{
  "suggested_links": [
    {
      "article_id": 123,
      "article_title": "...",
      "article_url": "...",
      "anchor_text": "...",
      "placement_context": "...",
      "relevance_score": 8,
      "reasoning": "..."
    }
  ],
  "analysis_summary": "Résumé de l'analyse en 2-3 phrases"
}`;
  }

  calculateAverageScore(links) {
    if (links.length === 0) return 0;
    const sum = links.reduce((acc, link) => acc + link.relevance_score, 0);
    return (sum / links.length).toFixed(1);
  }

  displayResults(analysis) {
    console.log('📋 LIENS INTERNES SUGGÉRÉS:');
    console.log('============================\n');

    analysis.suggested_links.forEach((link, index) => {
      console.log(`${index + 1}. ${link.article_title}`);
      console.log(`   Score: ${link.relevance_score}/10`);
      console.log(`   Ancre: "${link.anchor_text}"`);
      console.log(`   Contexte: ${link.placement_context}`);
      console.log(`   Raison: ${link.reasoning}`);
      console.log(`   URL: ${link.article_url}`);
      console.log('');
    });

    console.log('💡 RÉSUMÉ:');
    console.log('==========');
    console.log(analysis.analysis_summary);
  }

  saveResults(analysis, filename = 'suggested-links.json') {
    console.log(`\n💾 Sauvegarde des résultats: ${filename}`);
    
    const data = {
      analyzed_at: new Date().toISOString(),
      total_suggestions: analysis.suggested_links.length,
      average_score: this.calculateAverageScore(analysis.suggested_links),
      ...analysis
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log('✅ Résultats sauvegardés');
  }
}

// 2) Fonction utilitaire pour générer des liens heuristiques (fallback FORCE_OFFLINE)
function generateHeuristicLinks(content, title, availableArticles, maxLinks, linkContext) {
  const links = [];
  const contentLower = content.toLowerCase();
  const titleLower = title.toLowerCase();
  
  // Normaliser destination pour comparaison (4)
  const targetDestination = linkContext?.destination ? linkContext.destination.toLowerCase() : null;
  
  // Matching simple par mots-clés dans le titre/contenu
  for (const article of availableArticles.slice(0, maxLinks * 2)) {
    const articleTitleLower = article.title.toLowerCase();
    
    // 4) Vérifier correspondance destination (comparaison lowercase)
    if (targetDestination) {
      const articleDestination = (article._destination || article.destination || '').toLowerCase();
      if (articleDestination && articleDestination !== targetDestination) {
        continue;
      }
    }
    
    // Matching simple: mots communs entre titre/contenu et article
    const titleWords = titleLower.split(/\s+/).filter(w => w.length > 3);
    const articleWords = articleTitleLower.split(/\s+/).filter(w => w.length > 3);
    const commonWords = titleWords.filter(w => articleWords.includes(w));
    
    if (commonWords.length >= 1) {
      links.push({
        anchor: article.title.substring(0, 50),
        target_url: article.url,
        target_id: article.id,
        relevance_score: commonWords.length * 2,
        context: `Matching heuristique: ${commonWords.join(', ')}`
      });
    }
    
    if (links.length >= maxLinks) break;
  }
  
  return {
    suggested_links: links.slice(0, maxLinks),
    reasoning: 'Liens générés par heuristique (FORCE_OFFLINE)'
  };
}

// Exporter la classe
export { SemanticLinkAnalyzer };

// Test si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('⚠️ Pour tester, utilisez: node test-semantic-analyzer.js');
}
