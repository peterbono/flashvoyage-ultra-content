#!/usr/bin/env node

/**
 * ANALYSEUR SÉMANTIQUE LLM - IDENTIFIER LES OPPORTUNITÉS DE LIENS INTERNES
 */

import OpenAI from 'openai';
import fs from 'fs';
import { AnchorTextValidator } from './anchor-text-validator.js';

class SemanticLinkAnalyzer {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
    this.articlesDatabase = null;
    this.anchorValidator = new AnchorTextValidator();
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

  async analyzeAndSuggestLinks(newArticleContent, newArticleTitle, maxLinks = 8, currentArticleId = null) {
    console.log('🤖 ANALYSE SÉMANTIQUE POUR LIENS INTERNES');
    console.log('==========================================\n');
    console.log(`📝 Article à analyser: "${newArticleTitle}"`);
    console.log(`🎯 Objectif: Trouver ${maxLinks} liens internes pertinents\n`);

    if (!this.articlesDatabase) {
      throw new Error('Base de données non chargée. Appelez loadArticlesDatabase() d\'abord.');
    }

    // Préparer la liste des articles disponibles pour le LLM
    // EXCLURE l'article en cours pour éviter les autolinks
    const availableArticles = this.articlesDatabase.articles
      .filter(article => article.id !== currentArticleId)
      .map(article => ({
        id: article.id,
        title: article.title,
        url: article.url,
        excerpt: article.excerpt,
        categories: article.categories.map(c => c.name).join(', '),
        tags: article.tags.map(t => t.name).join(', ')
      }));
    
    console.log(`📚 Articles disponibles: ${availableArticles.length} (article ${currentArticleId} exclu)\n`);

    // Créer le prompt pour Claude
    const prompt = this.createAnalysisPrompt(newArticleContent, newArticleTitle, availableArticles, maxLinks);

    console.log('🔄 Envoi à OpenAI pour analyse...\n');

    try {
      const response = await this.client.chat.completions.create({
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
- article_title: Le titre de l'article
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

// Exporter la classe
export { SemanticLinkAnalyzer };

// Test si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('⚠️ Pour tester, utilisez: node test-semantic-analyzer.js');
}
