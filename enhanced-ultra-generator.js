#!/usr/bin/env node

import UltraStrategicGenerator from './ultra-strategic-generator.js';
import ContentEnhancer from './content-enhancer.js';
import IntelligentContentAnalyzerOptimized from './intelligent-content-analyzer-optimized.js';
import { CompleteLinkingStrategy } from './complete-linking-strategy.js';
import ArticleFinalizer from './article-finalizer.js';
import WidgetPlanBuilder from './widget-plan-builder.js';
import ContextualWidgetPlacer from './contextual-widget-placer-v2.js';
import { OPENAI_API_KEY } from './config.js';

class EnhancedUltraGenerator extends UltraStrategicGenerator {
  constructor() {
    super();
    this.contentEnhancer = new ContentEnhancer();
    this.intelligentAnalyzer = new IntelligentContentAnalyzerOptimized();
    this.linkingStrategy = new CompleteLinkingStrategy();
    this.articleFinalizer = new ArticleFinalizer();
    this.widgetPlanBuilder = new WidgetPlanBuilder();
    this.contextualWidgetPlacer = new ContextualWidgetPlacer();
    
    // Initialiser les composants nécessaires
    this.initializeComponents();
  }

  // Initialiser les composants
  initializeComponents() {
    // Cette méthode sera appelée après l'initialisation du parent
    // pour s'assurer que tous les composants sont disponibles
  }

  // Générer et publier un article stratégique amélioré
  async generateAndPublishEnhancedArticle() {
    try {
      console.log('🚀 Génération d\'article stratégique amélioré...\n');

      // 0. Mettre à jour la base de données d'articles (pour liens internes à jour)
      console.log('📚 Mise à jour de la base de données d\'articles...');
      try {
        await this.linkingStrategy.internalAnalyzer.loadArticlesDatabase('articles-database.json');
        console.log('✅ Base de données chargée\n');
      } catch (error) {
        console.warn('⚠️ Impossible de charger la base d\'articles:', error.message);
        console.warn('   → Les liens internes ne seront pas générés\n');
      }

      // 1. Récupérer les sources
      const sources = await this.scraper.scrapeAllSources();
      if (!sources || sources.length === 0) {
        throw new Error('Aucune source disponible');
      }

      // 2. Filtrer les articles rejetés par le scoring
      const validSources = sources.filter(article => {
        // Ignorer les articles rejetés par le scoring
        if (article.smartDecision === 'reject') {
          console.log(`⚠️ Article rejeté ignoré: ${article.title}`);
          return false;
        }
        return true;
      });

      if (validSources.length === 0) {
        throw new Error('Aucun article valide après filtrage des rejets');
      }

      const selectedArticle = validSources[0];
      console.log('📰 Article sélectionné:', selectedArticle.title);

      // 3. Analyse intelligente du contenu
      console.log('🧠 Analyse intelligente du contenu...');
      const analysis = await this.intelligentAnalyzer.analyzeContent(selectedArticle);
      console.log('✅ Analyse terminée:', analysis.type_contenu);

      // 4. Génération de contenu intelligent
      console.log('🎯 Génération de contenu intelligent...');
      const generatedContent = await this.intelligentAnalyzer.generateIntelligentContent(selectedArticle, analysis);
      console.log('✅ Contenu généré:', generatedContent.title);

      // 5. Amélioration avec widgets et liens internes
      console.log('🔧 Amélioration du contenu...');
      let contentToEnhance = '';
      
      if (Array.isArray(generatedContent.content)) {
        contentToEnhance = generatedContent.content.map(section => {
          if (typeof section === 'string') return section;
          if (section.content) return section.content;
          if (section.section && section.content) return `<h3>${section.section}</h3>\n${section.content}`;
          return JSON.stringify(section);
        }).join('\n\n');
      } else if (typeof generatedContent.content === 'string') {
        contentToEnhance = generatedContent.content;
      } else if (generatedContent.introduction) {
        contentToEnhance = generatedContent.introduction;
      } else {
        contentToEnhance = JSON.stringify(generatedContent);
      }
      
      // Ajouter le lien source Reddit au début du contenu
      const sourceLink = `<p><strong>Source :</strong> <a href="${selectedArticle.link}" target="_blank" rel="noopener">${selectedArticle.title}</a> - ${selectedArticle.source}</p>\n\n`;
      contentToEnhance = sourceLink + contentToEnhance;
      
      console.log('📝 Contenu à améliorer:', contentToEnhance.substring(0, 200) + '...');
      
      const enhanced = await this.contentEnhancer.enhanceContent(
        contentToEnhance,
        analysis,
        null // Pas d'ID d'article pour éviter l'auto-référence
      );

      // 6. Générer le quote highlight si disponible
      let quoteHighlight = '';
      if (analysis.best_quotes && analysis.best_quotes.selected_quote) {
        console.log('💬 Génération du quote highlight...');
        const redditUsername = analysis.reddit_username || null;
        quoteHighlight = this.templates.generateQuoteHighlight(
          analysis.best_quotes.selected_quote,
          redditUsername
        );
        console.log(`✅ Quote highlight généré (${redditUsername ? `u/${redditUsername}` : 'anonyme'})`);
      }

      // 7. Construction de l'article final
      const finalArticle = {
        title: generatedContent.title,
        content: enhanced.content.replace('{quote_highlight}', quoteHighlight),
        excerpt: this.generateExcerpt(enhanced.content),
        status: 'publish',
        categories: await this.getCategoriesForContent(analysis),
        tags: await this.getTagsForContent(analysis),
        meta: {
          description: this.generateMetaDescription(generatedContent.title, analysis),
          keywords: analysis.keywords
        },
        enhancements: {
          widgets: enhanced.widgets,
          internalLinks: enhanced.internalLinks,
          validation: enhanced.validation,
          quoteHighlight: quoteHighlight ? 'Oui' : 'Non'
        }
      };

      console.log('📊 Article final construit:', {
        title: finalArticle.title,
        contentLength: finalArticle.content.length,
        categories: finalArticle.categories,
        tags: finalArticle.tags
      });

      // 7. Enrichissement avec liens internes et externes
      console.log('🔗 Enrichissement avec liens intelligents...');
      try {
        const linkingStrategyResult = await this.linkingStrategy.createStrategy(
          finalArticle.content,
          finalArticle.title,
          null // Pas d'ID car nouvel article
        );

        console.log(`✅ Stratégie de liens créée: ${linkingStrategyResult.total_links} liens suggérés`);
        console.log(`   - Liens internes: ${linkingStrategyResult.breakdown.internal}`);
        console.log(`   - Liens externes: ${linkingStrategyResult.breakdown.external}`);

        // Intégrer tous les liens
        const enrichedContent = this.linkingStrategy.integrateAllLinks(
          finalArticle.content,
          linkingStrategyResult
        );

        // Mettre à jour le contenu avec les liens
        finalArticle.content = enrichedContent;
        finalArticle.enhancements.internalLinks = linkingStrategyResult.breakdown.internal;
        finalArticle.enhancements.externalLinks = linkingStrategyResult.breakdown.external;

        console.log('✅ Liens intégrés avec succès');
      } catch (linkError) {
        console.warn('⚠️ Erreur lors de l\'enrichissement des liens:', linkError.message);
        console.warn('   → Article publié sans enrichissement de liens');
      }

      // 8. Construire le plan de widgets et placer contextuellement
      console.log('🎯 Construction du plan de widgets...');
      const widgetPlan = this.widgetPlanBuilder.buildWidgetPlan(
        analysis.affiliateSlots || [],
        analysis.geo || {},
        {
          type: analysis.type || 'temoignage',
          destination: analysis.destination || 'Asie',
          audience: 'Nomades digitaux',
          hasItineraryContent: finalArticle.content.includes('itinéraire') || finalArticle.content.includes('programme'),
          hasGettingThereSection: finalArticle.content.includes('Comment s\'y rendre') || finalArticle.content.includes('Transport'),
          hasInternetSection: finalArticle.content.includes('Internet') || finalArticle.content.includes('WiFi'),
          hasSafetySection: finalArticle.content.includes('Sécurité') || finalArticle.content.includes('Sûr'),
          hasBudgetSection: finalArticle.content.includes('Budget') || finalArticle.content.includes('Coût'),
          hasVisaContent: finalArticle.content.includes('visa') || finalArticle.content.includes('Visa'),
          hasSensitiveContent: finalArticle.content.includes('politique') || finalArticle.content.includes('religion')
        },
        `article_${Date.now()}`
      );

      console.log('🎯 Placement contextuel des widgets...');
      const contentWithWidgets = await this.contextualWidgetPlacer.placeWidgetsIntelligently(
        finalArticle.content,
        {
          type: analysis.type || 'temoignage',
          destination: analysis.destination || 'Asie',
          audience: 'Nomades digitaux'
        },
        widgetPlan.widget_plan
      );

      // Mettre à jour le contenu avec les widgets
      finalArticle.content = contentWithWidgets;

      // 8b. Finalisation de l'article (quote, FOMO, image)
      const finalizedArticle = await this.articleFinalizer.finalizeArticle(finalArticle, analysis);
      
      // 8c. Récupérer l'image featured
      const featuredImage = await this.articleFinalizer.getFeaturedImage(finalizedArticle, analysis);
      if (featuredImage) {
        finalizedArticle.featuredImage = featuredImage;
      }
      
      // 8d. Mapper les catégories et tags vers IDs
      const categoriesAndTags = await this.articleFinalizer.getCategoriesAndTagsIds(
        finalizedArticle.categories || [],
        finalizedArticle.tags || []
      );
      finalizedArticle.categoryIds = categoriesAndTags.categories;
      finalizedArticle.tagIds = categoriesAndTags.tags;

      // 9. Validation finale
      const validation = this.validateFinalArticle(finalizedArticle);
      if (!validation.isValid) {
        throw new Error(`Article invalide: ${validation.errors.join(', ')}`);
      }

      // 10. Publication WordPress
      console.log('📝 Publication sur WordPress...');
      const publishedArticle = await this.publishToWordPress(finalizedArticle);
      
      console.log('✅ Article publié avec succès!');
      console.log('🔗 Lien:', publishedArticle.link);
      console.log('📊 Améliorations:', {
        widgetsReplaced: finalizedArticle.enhancements.widgetsReplaced || 0,
        internalLinks: finalizedArticle.enhancements.internalLinks || 0,
        externalLinks: finalizedArticle.enhancements.externalLinks || 0,
        quoteHighlight: finalizedArticle.enhancements.quoteHighlight || 'Non',
        fomoIntro: finalizedArticle.enhancements.fomoIntro || 'Non',
        validationScore: enhanced.validation.score
      });

      // 11. Mettre à jour la base de données d'articles (pour les prochains articles)
      console.log('\n📚 Mise à jour de la base de données...');
      try {
        const { WordPressArticlesCrawler } = await import('./wordpress-articles-crawler.js');
        const crawler = new WordPressArticlesCrawler();
        await crawler.crawlAllArticles();
        console.log('✅ Base de données mise à jour avec le nouvel article\n');
      } catch (error) {
        console.warn('⚠️ Impossible de mettre à jour la base:', error.message);
        console.warn('   → Relancez manuellement: node wordpress-articles-crawler.js\n');
      }

      return publishedArticle;

    } catch (error) {
      console.error('❌ Erreur génération article amélioré:', error.message);
      throw error;
    }
  }

  // Obtenir les catégories selon l'analyse
  async getCategoriesForContent(analysis) {
    const categoryMapping = {
      'TEMOIGNAGE_SUCCESS_STORY': 'Digital Nomades Asie',
      'TEMOIGNAGE_ECHEC_LEÇONS': 'Digital Nomades Asie',
      'TEMOIGNAGE_TRANSITION': 'Digital Nomades Asie',
      'TEMOIGNAGE_COMPARAISON': 'Digital Nomades Asie',
      'GUIDE_PRATIQUE': 'Guides Pratiques',
      'COMPARAISON_DESTINATIONS': 'Comparaisons',
      'ACTUALITE_NOMADE': 'Actualités',
      'CONSEIL_PRATIQUE': 'Conseils'
    };

    const mainCategory = categoryMapping[analysis.type_contenu] || 'Conseils';
    const subCategory = this.getSubCategory(analysis.sous_categorie);
    
    return [mainCategory, subCategory].filter(Boolean);
  }

  // Obtenir la sous-catégorie
  getSubCategory(sousCategorie) {
    const subCategoryMapping = {
      'visa': 'Visa & Formalités',
      'logement': 'Logement & Coliving',
      'transport': 'Transport & Mobilité',
      'santé': 'Santé & Assurance',
      'finance': 'Finance & Fiscalité',
      'communauté': 'Communauté & Réseau',
      'travail': 'Travail & Productivité',
      'voyage': 'Voyage & Découverte'
    };

    return subCategoryMapping[sousCategorie] || null;
  }

  // Obtenir les tags selon l'analyse
  async getTagsForContent(analysis) {
    const tags = [];
    
    // Tags par type de contenu
    const typeTags = {
      'TEMOIGNAGE_SUCCESS_STORY': ['Témoignage', 'Succès', 'Inspiration', 'Nomadisme Digital'],
      'TEMOIGNAGE_ECHEC_LEÇONS': ['Témoignage', 'Échec', 'Leçons', 'Nomadisme Digital'],
      'TEMOIGNAGE_TRANSITION': ['Témoignage', 'Transition', 'Changement', 'Nomadisme Digital'],
      'TEMOIGNAGE_COMPARAISON': ['Témoignage', 'Comparaison', 'Expérience', 'Nomadisme Digital'],
      'GUIDE_PRATIQUE': ['Guide', 'Pratique', 'Tutoriel'],
      'COMPARAISON_DESTINATIONS': ['Comparaison', 'Destination', 'Choix'],
      'ACTUALITE_NOMADE': ['Actualité', 'Nouvelle', 'Tendance'],
      'CONSEIL_PRATIQUE': ['Conseil', 'Astuce', 'Optimisation']
    };

    tags.push(...(typeTags[analysis.type_contenu] || ['Conseil']));
    
    // Tags par destination
    if (analysis.destination) {
      tags.push(analysis.destination);
    }
    
    // Tags par sous-catégorie
    if (analysis.sous_categorie) {
      tags.push(analysis.sous_categorie);
    }
    
    // Tags par audience
    if (analysis.audience) {
      const audienceTags = {
        'nomades_debutants': ['Débutant', 'Premier voyage'],
        'nomades_confirmes': ['Confirmé', 'Expérimenté'],
        'nomades_experts': ['Expert', 'Avancé'],
        'nomades_famille': ['Famille', 'Enfants']
      };
      
      const audienceTag = audienceTags[analysis.audience];
      if (audienceTag) {
        tags.push(...audienceTag);
      }
    }
    
    return tags.slice(0, 8); // Limiter à 8 tags
  }

  // Générer un extrait
  generateExcerpt(content) {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.substring(0, 160) + (text.length > 160 ? '...' : '');
  }

  // Générer une meta description
  generateMetaDescription(title, analysis) {
    const baseDescription = `Découvrez ${title.toLowerCase()} - Guide complet pour nomades en ${analysis.destination || 'Asie'}. Conseils pratiques, témoignages et bons plans.`;
    return baseDescription.substring(0, 160);
  }

  // Valider l'article final
  validateFinalArticle(article) {
    const errors = [];
    
    if (!article.title || article.title.length < 10) {
      errors.push('Titre trop court');
    }
    
    // Vérifier la longueur du contenu (plus flexible)
    const contentLength = typeof article.content === 'string' 
      ? article.content.length 
      : JSON.stringify(article.content).length;
    
    if (!article.content || contentLength < 300) {
      errors.push('Contenu trop court');
    }
    
    if (!article.categories || article.categories.length === 0) {
      errors.push('Aucune catégorie');
    }
    
    if (!article.tags || article.tags.length === 0) {
      errors.push('Aucun tag');
    }
    
    if (!article.meta || !article.meta.description) {
      errors.push('Meta description manquante');
    }
    
    console.log('📊 Validation article:', {
      titleLength: article.title?.length || 0,
      contentLength: contentLength,
      categories: article.categories?.length || 0,
      tags: article.tags?.length || 0,
      hasMeta: !!article.meta?.description
    });
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Publier sur WordPress
  async publishToWordPress(article) {
    try {
      const axios = (await import('axios')).default;
      const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
      
      console.log('📝 Publication sur WordPress...');
      
      // Préparer les données WordPress
      const wordpressData = {
        title: article.title,
        content: article.content,
        status: 'publish',
        excerpt: article.excerpt || '',
        categories: article.categoryIds || [],
        tags: article.tagIds || [],
        meta: {
          description: article.meta?.description || article.excerpt || '',
          keywords: article.meta?.keywords || '',
          'og:title': article.meta?.['og:title'] || article.title,
          'og:description': article.meta?.['og:description'] || article.excerpt || ''
        }
      };
      
      // Authentification
      const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
      
      // Publication
      const response = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, wordpressData, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      const publishedArticle = response.data;
      
      console.log('✅ Article publié sur WordPress !');
      console.log(`   ID: ${publishedArticle.id}`);
      console.log(`   URL: ${publishedArticle.link}`);
      
      // Uploader l'image featured si disponible
      if (article.featuredImage) {
        try {
          console.log('🖼️ Upload de l\'image featured...');
          
          // Télécharger l'image
          const imageResponse = await axios.get(article.featuredImage.url, {
            responseType: 'arraybuffer'
          });
          
          // Uploader sur WordPress
          const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, imageResponse.data, {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'image/jpeg',
              'Content-Disposition': `attachment; filename="featured-${publishedArticle.id}.jpg"`
            }
          });
          
          // Associer l'image à l'article
          await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${publishedArticle.id}`, {
            featured_media: uploadResponse.data.id
          }, {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          });
          
          console.log('✅ Image featured ajoutée');
        } catch (imageError) {
          console.warn('⚠️ Erreur upload image:', imageError.message);
        }
      }
      
      return {
        id: publishedArticle.id,
        title: publishedArticle.title.rendered,
        link: publishedArticle.link,
        status: publishedArticle.status,
        enhancements: article.enhancements
      };
    } catch (error) {
      console.error('❌ Erreur publication WordPress:', error.message);
      if (error.response) {
        console.error('   Détails:', error.response.data);
      }
      throw error;
    }
  }
}

export default EnhancedUltraGenerator;

// Exécution si lancé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new EnhancedUltraGenerator();
  generator.generateAndPublishEnhancedArticle()
    .then(() => {
      console.log('\n✅ Processus terminé avec succès !');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Erreur fatale:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}
