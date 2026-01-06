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

      // 0. Mettre à jour la base de données d'articles AVANT génération des liens
      console.log('📚 Mise à jour de la base de données d\'articles...');
      
      // GARDE DRY_RUN: Charger DB existante au lieu de crawler
      if (process.env.FLASHVOYAGE_DRY_RUN === '1') {
        console.log('🧪 DRY_RUN: crawler WordPress bloqué');
        // Charger la DB si elle existe
        const fs = await import('fs');
        try {
          if (fs.default.existsSync('articles-database.json')) {
            await this.linkingStrategy.internalAnalyzer.loadArticlesDatabase('articles-database.json');
            console.log('🧪 DRY_RUN: DB chargée depuis articles-database.json');
          } else {
            console.log('🧪 DRY_RUN: aucun articles-database.json, skip liens internes');
          }
        } catch (error) {
          console.warn('⚠️ DRY_RUN: Erreur chargement DB:', error.message);
          console.warn('   → Les liens internes ne seront pas générés\n');
        }
      } else {
      try {
        // D'ABORD : Crawler WordPress pour avoir la DB à jour
        const { WordPressArticlesCrawler } = await import('./wordpress-articles-crawler.js');
        const crawler = new WordPressArticlesCrawler();
        await crawler.crawlAllArticles();
        crawler.saveToFile('articles-database.json'); // SAUVEGARDE EXPLICITE
        console.log('✅ Base de données WordPress mise à jour');
        
        // ENSUITE : Charger la DB fraîchement mise à jour
        await this.linkingStrategy.internalAnalyzer.loadArticlesDatabase('articles-database.json');
        console.log('✅ Base de données chargée pour liens internes\n');
      } catch (error) {
        console.warn('⚠️ Impossible de mettre à jour/charger la base d\'articles:', error.message);
        console.warn('   → Les liens internes ne seront pas générés\n');
        }
      }

      // 1. Récupérer les sources
      // FIX 5: Format témoignage requis = désactiver sources news
      const requireCommunityTestimonial = true; // Format témoignage requis pour FlashVoyages
      const sources = await this.scraper.scrapeAllSources(requireCommunityTestimonial);
      
      // FIX 3: Ne plus throw si fixtures disponibles
      if (!sources || sources.length === 0) {
        // Vérifier si on a des fixtures Reddit disponibles
        const forceFixtures = process.env.FLASHVOYAGE_FORCE_FIXTURES === '1';
        if (forceFixtures || process.env.FLASHVOYAGE_DRY_RUN === '1') {
          console.log('⚠️ Aucune source réseau disponible, mais mode fixtures/DRY_RUN activé - skip silencieux');
          return null; // Retourner null au lieu de throw
        }
        throw new Error('Aucune source disponible');
      }

      // 2. Filtrer les articles rejetés par le scoring ET les destinations non-asiatiques
      // UNIQUEMENT les destinations de la liste officielle: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
      const asiaDestinations = [
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
      const nonAsiaDestinations = ['istanbul', 'turkey', 'turquie', 'portugal', 'spain', 'espagne', 'lisbon', 'lisbonne', 'barcelona', 'barcelone', 'greece', 'grèce', 'cyprus', 'france', 'paris', 'london', 'londres', 'italy', 'italie', 'rome', 'europe', 'america', 'usa', 'brazil', 'brésil', 'rio', 'mexico', 'mexique'];
      
      const isDryRun = process.env.FLASHVOYAGE_DRY_RUN === '1';
      const forceOffline = process.env.FORCE_OFFLINE === '1';
      
      const validSources = sources.filter(article => {
        const articleText = `${article.title || ''} ${article.content || ''} ${article.selftext || ''} ${article.source_text || ''}`.toLowerCase();
        const hasNonAsiaDestination = nonAsiaDestinations.some(dest => articleText.includes(dest));
        const hasAsiaDestination = asiaDestinations.some(dest => articleText.includes(dest));
        
        // FILTRE 0: UNIQUEMENT les articles Reddit (type: 'community' ou 'nomade') pour le format témoignage
        // Les sources non-Reddit (Skift, CNN, etc.) seront retravaillées plus tard dans un autre template
        if (article.type !== 'community' && article.type !== 'nomade') {
          console.log(`🚫 Article rejeté (source non-Reddit, format témoignage requis): ${article.title} (type: ${article.type})`);
          return false;
        }
        
        // D) Sélection d'article: éviter posts impossibles à extraire
        // En DRY_RUN/FORCE_OFFLINE, prioriser fixtures avec source_text long
        if ((isDryRun || forceOffline) && article.source_reliability !== undefined) {
          // Blacklister RSS sans selftext (source_reliability < 0.7) sauf si source_text > 400
          if (article.source_reliability < 0.7 && (!article.source_text || article.source_text.length < 400)) {
            console.log(`🚫 Article rejeté (source non fiable, source_text trop court): ${article.title} reliability=${article.source_reliability}`);
            return false;
          }
        }
        
        // FILTRE 1: Rejeter TOUS les articles qui mentionnent des destinations non-asiatiques
        // Même s'ils mentionnent aussi des destinations asiatiques, on veut uniquement des articles sur l'Asie
        if (hasNonAsiaDestination) {
          console.log(`🚫 Article rejeté (destination non-asiatique détectée): ${article.title}`);
          return false;
        }
        
        // FILTRE 2: Exiger qu'au moins une destination asiatique soit mentionnée
        if (!hasAsiaDestination) {
          console.log(`🚫 Article rejeté (aucune destination asiatique): ${article.title}`);
          return false;
        }
        
        // FILTRE 3: Ignorer les articles rejetés par le scoring
        if (article.smartDecision === 'reject') {
          console.log(`⚠️ Article rejeté ignoré: ${article.title}`);
          return false;
        }
        
        return true;
      });

      if (validSources.length === 0) {
        // FIX 5: Ne jamais throw une exception fatale
        console.log(`⚠️ NO_ARTICLE_AFTER_FILTERING: ${sources.length} sources, ${sources.length - validSources.length} rejetées`);
        
        // Relâcher UN SEUL cran: autoriser Reddit r/travel sans destination explicite
        const relaxedSources = sources.filter(article => {
          // Autoriser Reddit r/travel même sans destination explicite
          if (article.source === 'reddit' && (article.subreddit === 'travel' || article.subreddit === 'digitalnomad')) {
            console.log(`   ℹ️ RELAXED_FILTER: autorisation Reddit ${article.subreddit} sans destination explicite`);
            return true;
          }
          return false;
        });
        
        if (relaxedSources.length > 0) {
          console.log(`   ✅ ${relaxedSources.length} article(s) accepté(s) avec filtre relâché`);
          validSources = relaxedSources;
        } else {
          // Si toujours 0, log et skip silencieux (jamais throw)
          console.log(`   ❌ Aucun article même avec filtre relâché - skip silencieux`);
          return null; // Retourner null au lieu de throw
        }
      }

      // D) Prioriser fixtures avec source_reliability élevé en DRY_RUN/FORCE_OFFLINE
      if (isDryRun || forceOffline) {
        validSources.sort((a, b) => {
          const reliabilityA = a.source_reliability || 0;
          const reliabilityB = b.source_reliability || 0;
          const sourceTextA = (a.source_text || '').length;
          const sourceTextB = (b.source_text || '').length;
          
          // Priorité 1: source_reliability (fixtures = 1.0 > RSS = 0.6 > live 403 = 0.0)
          if (reliabilityA !== reliabilityB) {
            return reliabilityB - reliabilityA;
          }
          
          // Priorité 2: longueur source_text (plus long = mieux)
          return sourceTextB - sourceTextA;
        });
        
        console.log(`📊 Articles triés par fiabilité: ${validSources.map(a => `reliability=${a.source_reliability || 0} source_text_len=${(a.source_text || '').length}`).join(', ')}`);
      }

      const selectedArticle = validSources[0];
      console.log('📰 Article sélectionné:', selectedArticle.title);
      console.log('🔍 DEBUG: Author dans selectedArticle:', selectedArticle.author);
      console.log('📋 DEBUG: Source de l\'article sélectionné:', selectedArticle.source);
      console.log('📋 DEBUG: Type de l\'article:', selectedArticle.type);
      console.log('📋 DEBUG: Link de l\'article:', selectedArticle.link);

      // 3. Analyse intelligente du contenu
      console.log('🧠 Analyse intelligente du contenu...');
      console.log('🔍 DEBUG: selectedArticle.geo:', selectedArticle.geo);
      const analysis = await this.intelligentAnalyzer.analyzeContent(selectedArticle);
      // S'assurer que analysis.geo utilise les informations de l'article source Reddit
      if (!analysis.geo && selectedArticle.geo) {
        analysis.geo = selectedArticle.geo;
        console.log('✅ analysis.geo assigné depuis selectedArticle.geo:', analysis.geo);
      } else if (analysis.geo) {
        console.log('✅ analysis.geo déjà défini:', analysis.geo);
      } else {
        console.log('⚠️ analysis.geo non défini, selectedArticle.geo:', selectedArticle.geo);
      }
      
      console.log('✅ Analyse terminée:', analysis.type_contenu);

      // A. SOURCE OF TRUTH - Verrouillage destination + entités (AVANT génération)
      console.log('\n🔒 SOURCE OF TRUTH - Verrouillage destination');
      console.log('============================================\n');
      const sourceTruth = this.buildSourceTruth(selectedArticle, analysis);
      analysis.source_truth = sourceTruth;
      console.log(`✅ SOURCE_TRUTH_DESTINATION=${sourceTruth.destination || 'null'}`);
      if (sourceTruth.entities.length > 0) {
        console.log(`   Entités: ${sourceTruth.entities.join(', ')}`);
      }

      // 4. Génération de contenu intelligent
      console.log('🎯 Génération de contenu intelligent...');
      const generatedContent = await this.intelligentAnalyzer.generateIntelligentContent(selectedArticle, analysis);
      console.log('✅ Contenu généré:', generatedContent.title);

      // B. Validation post-génération: vérifier cohérence destination (AVANT amélioration)
      console.log('\n🔍 VALIDATION POST-GÉNÉRATION');
      console.log('=============================\n');
      
      // Extraire le contenu brut pour validation
      let contentToValidate = '';
      if (Array.isArray(generatedContent.content)) {
        contentToValidate = generatedContent.content.map(section => {
          if (typeof section === 'string') return section;
          if (section.content) return section.content;
          return JSON.stringify(section);
        }).join('\n\n');
      } else if (typeof generatedContent.content === 'string') {
        contentToValidate = generatedContent.content;
      } else {
        contentToValidate = JSON.stringify(generatedContent);
      }

      const initialValidation = this.validateDestinationConsistency(contentToValidate, analysis.source_truth);
      
      if (!initialValidation.consistent) {
        console.log(`   ❌ DESTINATION_MISMATCH: contenu généré parle de "${initialValidation.detected}" mais source_truth="${analysis.source_truth?.destination}"`);
        
        if (process.env.FLASHVOYAGE_DRY_RUN === '1') {
          console.log('   🔧 DRY_RUN: Tentative de régénération corrective...');
          const repairResult = await this.repairGeneration(selectedArticle, analysis, generatedContent);
          
          if (repairResult.success) {
            generatedContent.content = repairResult.content;
            generatedContent.title = repairResult.title || generatedContent.title;
            console.log('   ✅ DESTINATION_REPAIR_ATTEMPT=1 result=success');
          } else {
            console.log('   ❌ DESTINATION_REPAIR_ATTEMPT=1 result=fail');
            throw new Error(`DESTINATION_MISMATCH: Impossible de corriger la dérive de destination. Source: ${analysis.source_truth?.destination}, Généré: ${initialValidation.detected}`);
          }
        } else {
          throw new Error(`DESTINATION_MISMATCH: Le contenu généré ne correspond pas à la source. Source: ${analysis.source_truth?.destination}, Généré: ${initialValidation.detected}`);
        }
      } else {
        console.log(`   ✅ Destination cohérente: ${initialValidation.detected || 'non détectée'}`);
      }

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
      
      // B) Ajouter le lien source au début du contenu (variable selon la source: Reddit, CNN, Skift, etc.)
      // CORRECTION: Utiliser url si disponible, sinon link, sinon '#'
      const articleLink = selectedArticle.url || selectedArticle.link || '#';
      const articleTitle = selectedArticle.title || 'Article sans titre';
      
      // Détecter la source réelle depuis l'URL si la propriété source n'est pas fiable
      let sourceName = selectedArticle.source || 'Source inconnue';
      
      // Vérifier l'URL pour détecter la vraie source
      if (articleLink.includes('reddit.com')) {
        // C'est un article Reddit
        if (articleLink.includes('digitalnomad')) {
          sourceName = 'Reddit Digital Nomad';
        } else if (articleLink.includes('travel')) {
          sourceName = 'Reddit r/travel';
        } else {
          sourceName = 'Reddit';
        }
      } else if (articleLink.includes('skift.com')) {
        sourceName = 'Skift';
      } else if (articleLink.includes('cnn.com')) {
        sourceName = 'CNN Travel';
      }
      
      // Vérifier aussi le type et l'auteur pour confirmer Reddit
      if (selectedArticle.author && selectedArticle.type === 'community') {
        // Si l'article a un auteur et est de type community, c'est probablement Reddit
        if (!articleLink.includes('reddit.com') && !sourceName.includes('Reddit')) {
          // Corriger la source si elle est incorrecte
          sourceName = selectedArticle.source || 'Reddit';
        }
      }
      
      console.log('📋 DEBUG avant génération lien source:');
      console.log('   - sourceName (original):', selectedArticle.source);
      console.log('   - sourceName (corrigé):', sourceName);
      console.log('   - articleLink:', articleLink);
      console.log('   - articleTitle:', articleTitle);
      console.log('   - article.author:', selectedArticle.author);
      console.log('   - article.type:', selectedArticle.type);
      
      const sourceLink = `<p><strong>Source :</strong> <a href="${articleLink}" target="_blank" rel="noopener">${articleTitle}</a> - ${sourceName}</p>\n\n`;
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
        categories: await this.getCategoriesForContent(analysis, enhanced.content),
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

      // 6b. SOURCE OF TRUTH - Calcul de final_destination (AVANT enrichissement)
      console.log('\n🎯 CALCUL DE LA DESTINATION FINALE');
      console.log('===================================\n');
      
      // A) CALCUL DE LA DESTINATION FINALE avec priorités strictes
      let finalDestination = null;
      
      // PRIORITÉ 1: source_truth.destination (verrouillé depuis le post source)
      if (analysis.source_truth?.destination) {
        finalDestination = analysis.source_truth.destination;
        console.log(`   ✓ final_destination depuis source_truth: ${finalDestination}`);
      }
      // PRIORITÉ 2: analysis.final_destination (si défini par LLM)
      else if (analysis.final_destination && analysis.final_destination !== 'Asie') {
        finalDestination = analysis.final_destination;
        console.log(`   ✓ final_destination depuis analysis.final_destination: ${finalDestination}`);
      }
      // PRIORITÉ 3: analysis.geo.country (fallback depuis geo)
      else if (analysis.geo?.country) {
        finalDestination = analysis.geo.country;
        console.log(`   ✓ final_destination depuis analysis.geo.country: ${finalDestination}`);
      }
      // PRIORITÉ 4: analysis.main_destination UNIQUEMENT si has_minimum_signals === true
      else if (analysis.reddit_extraction?.quality?.has_minimum_signals === true && analysis.main_destination) {
        finalDestination = analysis.main_destination;
        console.log(`   ✓ final_destination depuis main_destination (has_minimum_signals=true): ${finalDestination}`);
      }
      // PRIORITÉ 5: Détection depuis titre + contenu source (PAS depuis contenu LLM)
      else if (!finalDestination) {
        const detectedDestinations = this.detectDestinationFromSource(selectedArticle, analysis);
        if (detectedDestinations.length > 0) {
          finalDestination = detectedDestinations[0];
          console.log(`   ✓ final_destination depuis source (titre/contenu): ${finalDestination}`);
        }
      }
      // PRIORITÉ 6: Fallback 'Asie'
      if (!finalDestination) {
        finalDestination = 'Asie';
        console.log(`   → final_destination fallback: ${finalDestination}`);
      }
      
      // B. Garde-fou: interdire divergence de source_truth
      if (analysis.source_truth?.destination && finalDestination !== analysis.source_truth.destination) {
        console.log(`   ⚠️ DESTINATION_DRIFT_IGNORED: scoring proposé "${finalDestination}" mais source_truth="${analysis.source_truth.destination}"`);
        finalDestination = analysis.source_truth.destination;
        console.log(`   ✓ final_destination corrigée depuis source_truth: ${finalDestination}`);
      }
      
      // Assigner final_destination à analysis
      analysis.final_destination = finalDestination;
      console.log(`\n✅ final_destination définie: ${finalDestination}\n`);
      
      // PATCH 1: Créer pipelineContext comme source unique de vérité
      const pipelineContext = {
        final_destination: finalDestination,
        geo: analysis.geo || selectedArticle.geo || {},
        source_truth: analysis.source_truth || null
      };
      
      // PHASE 2: Propager pattern dans pipelineContext si disponible
      if (analysis.pattern) {
        pipelineContext.pattern = analysis.pattern;
        console.log(`✅ Pattern propagé dans pipelineContext: story_type=${analysis.pattern.story_type} theme=${analysis.pattern.theme_primary}`);
      }
      
      // Recalculer catégories et tags avec final_destination
      finalArticle.categories = await this.getCategoriesForContent(analysis, finalArticle.content);
      finalArticle.tags = await this.getTagsForContent(analysis);
      
      console.log('📊 Article final construit:', {
        title: finalArticle.title,
        contentLength: finalArticle.content.length,
        categories: finalArticle.categories,
        tags: finalArticle.tags,
        final_destination: analysis.final_destination
      });

      // 7. Enrichissement avec liens internes et externes
      console.log('🔗 Enrichissement avec liens intelligents...');
      try {
        // Préparer le contexte pour filtrer les liens non-Asie (utiliser final_destination)
        const linkContext = {
          articleType: analysis.type || analysis.type_contenu || 'temoignage',
          destination: analysis.final_destination || ''
        };
        
        // Corriger : passer un objet avec content et title au lieu de 2 strings
        const linkingStrategyResult = await this.linkingStrategy.createStrategy(
          {
            content: finalArticle.content,
            title: finalArticle.title,
            id: null // Pas d'ID car nouvel article
          },
          5, // maxInternalLinks
          3, // maxExternalLinks
          linkContext
        );

        console.log(`✅ Stratégie de liens créée: ${linkingStrategyResult.total_links} liens suggérés`);
        console.log(`   - Liens internes: ${linkingStrategyResult.breakdown.internal}`);
        console.log(`   - Liens externes: ${linkingStrategyResult.breakdown.external}`);

        // Intégrer tous les liens
        // S'assurer que finalArticle.content est une string
        const contentToEnrich = typeof finalArticle.content === 'string' 
          ? finalArticle.content 
          : String(finalArticle.content || '');
        
        const enrichedContent = await this.linkingStrategy.integrateAllLinks(
          contentToEnrich,
          linkingStrategyResult,
          linkContext
        );

        // Mettre à jour le contenu avec les liens (s'assurer que c'est une string)
        finalArticle.content = typeof enrichedContent === 'string' 
          ? enrichedContent 
          : (enrichedContent?.content || String(enrichedContent || ''));
        finalArticle.enhancements.internalLinks = linkingStrategyResult.breakdown.internal;
        finalArticle.enhancements.externalLinks = linkingStrategyResult.breakdown.external;

        console.log('✅ Liens intégrés avec succès');
      } catch (linkError) {
        console.warn('⚠️ Erreur lors de l\'enrichissement des liens:', linkError.message);
        console.warn('   → Article publié sans enrichissement de liens');
      }

      // 8. Placement des widgets DÉPLACÉ vers article-finalizer pour éviter les doublons
      console.log('🎯 Placement des widgets géré dans article-finalizer...');
      // Le placement intelligent des widgets est maintenant centralisé dans article-finalizer.js
      // pour utiliser la logique corrigée et éviter les conflits

      // 8c. Finalisation de l'article (quote, FOMO, image)
      // PATCH 1: Passer pipelineContext à finalizeArticle
      const finalizedArticle = await this.articleFinalizer.finalizeArticle(finalArticle, analysis, pipelineContext);
      
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

      // 9. VALIDATION NON-ASIE (après finalisation et sanitizer)
      console.log('\n🔍 VALIDATION NON-ASIE (après finalisation)');
      console.log('==========================================\n');
      
      // Nettoyer le texte éditorial (retirer sections injectées, nettoyer liens)
      const editorialText = this.extractEditorialText(finalizedArticle);
      
      // Détecter les mentions non-asiatiques
      const validationResult = this.validateNonAsiaContent(editorialText, finalizedArticle.title);
      
      if (validationResult.hits.length > 0) {
        console.error('❌ ERREUR CRITIQUE: Destination non-asiatique détectée dans le contenu final !');
        console.error(`   Mentions détectées: ${validationResult.hits.length}`);
        validationResult.hits.slice(0, 5).forEach((h, i) => {
          console.error(`   [${i+1}] term="${h.term}" excerpt="...${h.excerpt}..."`);
        });
        throw new Error('ERREUR CRITIQUE: Destination non-asiatique détectée dans le contenu final. Article rejeté.');
      } else {
        console.log('✅ Validation non-Asie: aucune mention détectée');
      }

      // 10. Validation finale (autres critères) - FIX 1: UNE SEULE détection widgets APRÈS finalisation complète
      // PATCH: Déduplication widgets UNE SEULE FOIS, juste avant validation finale
      const articleFinalizerModule = await import('./article-finalizer.js');
      const ArticleFinalizer = articleFinalizerModule.default;
      const finalizer = new ArticleFinalizer();
      
      // PATCH: Dédupliquer widgets (max 1 par type) - UNE SEULE FOIS
      finalizedArticle.content = await finalizer.deduplicateWidgets(finalizedArticle.content, pipelineContext);
      
      // C'est la source de vérité officielle (même fonction que dans deduplicateWidgets)
      const detected = finalizer.detectRenderedWidgets(finalizedArticle.content);
      const widgetsRendered = detected.count;
      
      // C) Fix métrique: widgetsRendered doit venir du HTML final, point
      // Overwrite AVANT de logger (source de vérité)
      if (pipelineContext) {
        const pipelineRendered = pipelineContext.rendered || pipelineContext.widgets_rendered || pipelineContext.widgets_tracking?.rendered || 0;
        // Logger divergence uniquement si elle existe AVANT overwrite
        if (pipelineRendered !== widgetsRendered) {
          console.log(`⚠️ WIDGET_VALIDATION_DIVERGENCE (avant correction): pipelineContext.rendered=${pipelineRendered} vs detectRenderedWidgets=${widgetsRendered}`);
        }
        // Overwrite = source de vérité (après insertion + dédup)
        pipelineContext.rendered = widgetsRendered;
        pipelineContext.rendered_types = detected.types;
        pipelineContext.widgets_rendered = widgetsRendered; // Alias pour compatibilité
        if (pipelineContext.widgets_tracking) {
          pipelineContext.widgets_tracking.rendered = widgetsRendered;
        }
      }
      
      // Log officiel de détection (source de vérité unique) - doit matcher types_after de WIDGET_DEDUP
      console.log(`   📊 WIDGETS_DETECTED_HTML (FINAL): count=${widgetsRendered}, types=[${detected.types.join(', ')}]`);
      
      // FIX 3: Ne jamais invalider pour 0 lien interne (bonus SEO uniquement)
      const validation = this.validateFinalArticle(finalizedArticle, widgetsRendered);
      
      // FIX E: En DRY_RUN, ne pas throw sur widgets=0, seulement logger
      if (!validation.isValid) {
        if (process.env.FLASHVOYAGE_DRY_RUN === '1') {
          console.warn('⚠️ DRY_RUN_WARNING: Article invalide mais continuons (DRY_RUN mode)');
          console.warn(`   Erreurs: ${validation.errors.join(', ')}`);
          console.warn(`   widgetsRendered: ${widgetsRendered}`);
        } else {
        throw new Error(`Article invalide: ${validation.errors.join(', ')}`);
        }
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

      // 11. Mise à jour finale de la base de données (inclut le nouvel article)
      if (process.env.FLASHVOYAGE_DRY_RUN === '1') {
        console.log('🧪 DRY_RUN: écriture DB finale bloquée');
      } else {
      console.log('\n📚 Mise à jour finale de la base de données...');
      try {
        const { WordPressArticlesCrawler } = await import('./wordpress-articles-crawler.js');
        const crawler = new WordPressArticlesCrawler();
        await crawler.crawlAllArticles();
        crawler.saveToFile('articles-database.json'); // SAUVEGARDE EXPLICITE
        console.log('✅ Base de données mise à jour avec le nouvel article\n');
      } catch (error) {
        console.warn('⚠️ Impossible de mettre à jour la base:', error.message);
        console.warn('   → Relancez manuellement: node wordpress-articles-crawler.js\n');
        }
      }

      return publishedArticle;

    } catch (error) {
      console.error('❌ Erreur génération article amélioré:', error.message);
      throw error;
    }
  }

  // Obtenir UNE SEULE catégorie principale selon l'analyse
  // UTILISE final_destination comme source of truth
  async getCategoriesForContent(analysis, generatedContent = null) {
    // Utiliser final_destination si disponible (source of truth)
    if (analysis.final_destination && analysis.final_destination !== 'Asie') {
      const destinationCategory = this.getDestinationCategory(analysis.final_destination);
      console.log(`🏷️ Catégorie depuis final_destination: ${destinationCategory}`);
      return [destinationCategory]; // UNE SEULE catégorie
    }
    
    // Fallback vers les catégories par type de contenu
    const categoryMapping = {
      'TEMOIGNAGE_SUCCESS_STORY': 'Digital Nomades Asie',
      'TEMOIGNAGE_ECHEC_LEÇONS': 'Digital Nomades Asie',
      'TEMOIGNAGE_TRANSITION': 'Digital Nomades Asie',
      'TEMOIGNAGE_COMPARAISON': 'Digital Nomades Asie',
      'GUIDE_PRATIQUE': 'Digital Nomades Asie',
      'COMPARAISON_DESTINATIONS': 'Digital Nomades Asie',
      'ACTUALITE_NOMADE': 'Digital Nomades Asie',
      'CONSEIL_PRATIQUE': 'Digital Nomades Asie'
    };

    const mainCategory = categoryMapping[analysis.type_contenu] || 'Digital Nomades Asie';
    console.log(`🏷️ Catégorie par type: ${mainCategory}`);
    
    return [mainCategory]; // UNE SEULE catégorie
  }

  /**
   * A. Construit source_truth depuis le post source Reddit
   */
  buildSourceTruth(selectedArticle, analysis) {
    const sourceTruth = {
      destination: null,
      country: null,
      entities: [],
      source_url: selectedArticle.link || '',
      source_title: selectedArticle.title || ''
    };

    // PRIORITÉ 1: Extracteur Reddit si has_minimum_signals ET destination trouvée
    if (analysis.reddit_extraction?.quality?.has_minimum_signals === true && analysis.main_destination) {
      sourceTruth.destination = analysis.main_destination;
      sourceTruth.country = this.mapDestinationToCountry(analysis.main_destination);
      console.log(`   ✓ source_truth depuis extracteur Reddit: ${sourceTruth.destination}`);
    }
    // PRIORITÉ 2: Mapping d'entités connues (Magome/Nagiso/Nakasendo => Japan)
    else {
      const entityMap = {
        'magome': 'japan',
        'nagiso': 'japan',
        'nakasendo': 'japan',
        'tokyo': 'japan',
        'kyoto': 'japan',
        'osaka': 'japan',
        'bangkok': 'thailand',
        'chiang mai': 'thailand',
        'phuket': 'thailand',
        'hanoi': 'vietnam',
        'ho chi minh': 'vietnam',
        'bali': 'indonesia',
        'jakarta': 'indonesia',
        'seoul': 'korea',
        'manila': 'philippines'
      };

      const titleLower = (selectedArticle.title || '').toLowerCase();
      const contentLower = (analysis.reddit_extraction?.post?.text || '').toLowerCase();
      const combinedText = `${titleLower} ${contentLower}`;

      // Extraire entités connues
      for (const [entity, country] of Object.entries(entityMap)) {
        if (combinedText.includes(entity)) {
          sourceTruth.entities.push(entity);
          if (!sourceTruth.destination) {
            sourceTruth.destination = country;
            sourceTruth.country = country;
          }
        }
      }

      if (sourceTruth.destination) {
        console.log(`   ✓ source_truth depuis mapping entités: ${sourceTruth.destination} (${sourceTruth.entities.join(', ')})`);
      }
    }
    // PRIORITÉ 3: Classification light sur titre + contenu source
    if (!sourceTruth.destination) {
      const detected = this.detectDestinationFromSource(selectedArticle, analysis);
      if (detected.length > 0) {
        sourceTruth.destination = detected[0];
        sourceTruth.country = this.mapDestinationToCountry(detected[0]);
        console.log(`   ✓ source_truth depuis classification source: ${sourceTruth.destination}`);
      }
    }
    
    // A) PRIORITÉ 4: Fallback depuis geo.country si présent
    if (!sourceTruth.destination) {
      if (analysis.geo?.country) {
        sourceTruth.destination = analysis.geo.country;
        sourceTruth.country = analysis.geo.country;
        console.log(`   ✓ SOURCE_TRUTH_FALLBACK_FROM_GEO: country=${analysis.geo.country}`);
      } else if (selectedArticle.geo?.country) {
        sourceTruth.destination = selectedArticle.geo.country;
        sourceTruth.country = selectedArticle.geo.country;
        console.log(`   ✓ SOURCE_TRUTH_FALLBACK_FROM_GEO: country=${selectedArticle.geo.country}`);
      }
    }

    return sourceTruth;
  }

  /**
   * D. Détection destination depuis source (PAS depuis contenu LLM)
   */
  detectDestinationFromSource(selectedArticle, analysis) {
    const destinations = [];
    
    // Analyser UNIQUEMENT: titre, subreddit, contenu Reddit extrait
    const sourceText = [
      selectedArticle.title || '',
      selectedArticle.subreddit || '',
      analysis.reddit_extraction?.post?.text || '',
      analysis.reddit_extraction?.post?.signals?.locations?.join(' ') || ''
    ].join(' ').toLowerCase();

    const destinationKeywords = {
      'thailand': ['thailand', 'thaïlande', 'bangkok', 'chiang mai', 'phuket'],
      'vietnam': ['vietnam', 'hanoi', 'ho chi minh', 'saigon'],
      'indonesia': ['indonesia', 'indonésie', 'bali', 'jakarta', 'ubud'],
      'japan': ['japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'magome', 'nagiso', 'nakasendo'],
      'philippines': ['philippines', 'manila', 'cebu'],
      'korea': ['korea', 'corée', 'seoul', 'séoul'],
      'singapore': ['singapore', 'singapour']
    };

    const destinationScores = {};
    for (const [country, keywords] of Object.entries(destinationKeywords)) {
      let score = 0;
      keywords.forEach(keyword => {
        const matches = (sourceText.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      if (score > 0) {
        destinationScores[country] = score;
      }
    }

    if (Object.keys(destinationScores).length > 0) {
      const bestDestination = Object.entries(destinationScores)
        .sort(([,a], [,b]) => b - a)[0][0];
      destinations.push(bestDestination);
      console.log(`   🎯 GENERATED_DESTINATION_GUESS=${bestDestination} (depuis source)`);
    }

    return destinations;
  }

  /**
   * Mapping destination → country
   */
  mapDestinationToCountry(destination) {
    const countryMap = {
      'thailand': 'thailand',
      'vietnam': 'vietnam',
      'indonesia': 'indonesia',
      'japan': 'japan',
      'philippines': 'philippines',
      'korea': 'korea',
      'singapore': 'singapore'
    };
    return countryMap[destination] || destination;
  }

  /**
   * B. Validation post-génération: vérifier cohérence destination
   */
  validateDestinationConsistency(generatedContent, sourceTruth) {
    if (!sourceTruth?.destination) {
      return { consistent: true, detected: null };
    }

    // Extraire destination dominante du contenu généré
    const detectedDestinations = this.extractDestinationsFromContent(generatedContent);
    const detected = detectedDestinations.length > 0 ? detectedDestinations[0] : null;

    const consistent = !detected || detected === sourceTruth.destination;
    
    return {
      consistent,
      detected,
      expected: sourceTruth.destination
    };
  }

  /**
   * C. Régénération corrective (1 seule tentative)
   */
  async repairGeneration(selectedArticle, analysis, generatedContent) {
    try {
      console.log('   🔧 Construction prompt de correction...');
      
      const sourceTruth = analysis.source_truth;
      if (!sourceTruth?.destination) {
        return { success: false };
      }

      // Construire un prompt de correction pour le LLM
      const correctionInstructions = `CORRECTION OBLIGATOIRE:
- Tu DOIS écrire sur ${sourceTruth.destination} uniquement.
- Le post source parle de: ${sourceTruth.entities.join(', ') || sourceTruth.source_title}
- Interdit de mentionner ${this.getForbiddenDestinations(sourceTruth.destination)}.
- Le contenu actuel dérive vers une autre destination - corrige-le pour parler UNIQUEMENT de ${sourceTruth.destination}.`;

      // Ajouter les instructions de correction à l'analysis pour que le LLM les voie
      const analysisWithCorrection = {
        ...analysis,
        correctionInstructions
      };

      // Repasser seulement l'étape génération finale
      const repairedContent = await this.intelligentAnalyzer.generateIntelligentContent(
        selectedArticle,
        analysisWithCorrection
      );

      // Extraire le contenu pour validation
      let repairedContentText = '';
      if (Array.isArray(repairedContent.content)) {
        repairedContentText = repairedContent.content.map(section => {
          if (typeof section === 'string') return section;
          if (section.content) return section.content;
          return JSON.stringify(section);
        }).join('\n\n');
      } else if (typeof repairedContent.content === 'string') {
        repairedContentText = repairedContent.content;
      } else {
        repairedContentText = JSON.stringify(repairedContent);
      }

      // Re-valider
      const revalidation = this.validateDestinationConsistency(repairedContentText, sourceTruth);
      
      if (revalidation.consistent) {
        return {
          success: true,
          content: repairedContent.content,
          title: repairedContent.title
        };
      } else {
        console.log(`   ⚠️ Régénération toujours incohérente: ${revalidation.detected} vs ${sourceTruth.destination}`);
        return { success: false };
      }
    } catch (error) {
      console.error('   ❌ Erreur régénération corrective:', error.message);
      return { success: false };
    }
  }

  /**
   * Liste des destinations interdites pour un pays donné
   */
  getForbiddenDestinations(allowedDestination) {
    const allDestinations = ['thailand', 'vietnam', 'indonesia', 'japan', 'philippines', 'korea', 'singapore'];
    return allDestinations.filter(d => d !== allowedDestination).join(', ');
  }

  // Extraire les destinations du contenu généré
  // UNIQUEMENT les destinations asiatiques officielles: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
  // D. NE PAS UTILISER CETTE FONCTION POUR LE SCORING PRIMAIRE (utiliser detectDestinationFromSource)
  extractDestinationsFromContent(content) {
    const destinations = [];
    const contentToAnalyze = (content || '').toLowerCase();
    
    // UNIQUEMENT les destinations asiatiques officielles
    const destinationKeywords = {
      'thailand': ['thailand', 'thaïlande', 'bangkok', 'chiang mai', 'phuket', 'krabi', 'pattaya', 'pad thaï', 'tuk-tuk'],
      'vietnam': ['vietnam', 'hanoi', 'ho chi minh', 'saigon', 'da nang', 'hue', 'nha trang'],
      'indonesia': ['indonesia', 'indonésie', 'bali', 'jakarta', 'ubud', 'yogyakarta', 'bandung', 'canggu', 'seminyak', 'lombok'],
      'japan': ['japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'nagoya', 'fukuoka'],
      'philippines': ['philippines', 'manila', 'cebu', 'davao', 'boracay', 'palawan'],
      'korea': ['korea', 'corée', 'south korea', 'corée du sud', 'seoul', 'séoul', 'busan', 'pusan', 'jeju'],
      'singapore': ['singapore', 'singapour']
      // SUPPRIMÉ: 'spain', 'portugal', 'malaysia' - destinations non-asiatiques interdites
    };
    
    // Compter les mentions pour chaque destination
    const destinationScores = {};
    
    for (const [country, keywords] of Object.entries(destinationKeywords)) {
      let score = 0;
      keywords.forEach(keyword => {
        const matches = (contentToAnalyze.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      
      if (score > 0) {
        destinationScores[country] = score;
        console.log(`🎯 Destination détectée: ${country} (score: ${score})`);
      }
    }
    
    // Retourner la destination avec le score le plus élevé
    // VALIDATION: Rejeter les destinations non-asiatiques
    const nonAsiaDestinations = ['spain', 'portugal', 'france', 'italy', 'greece', 'turkey', 'europe', 'america', 'usa', 'brazil', 'mexico', 'malaysia'];
    if (Object.keys(destinationScores).length > 0) {
      const bestDestination = Object.entries(destinationScores)
        .filter(([dest]) => !nonAsiaDestinations.includes(dest.toLowerCase()))
        .sort(([,a], [,b]) => b - a)[0];
      
      if (bestDestination) {
        destinations.push(bestDestination[0]);
        console.log(`🏆 Destination principale: ${bestDestination[0]}`);
      } else {
        console.log(`⚠️ Aucune destination asiatique trouvée dans le contenu`);
      }
    }
    
    return destinations;
  }

  // Extraire les destinations de l'analyse
  extractDestinationsFromAnalysis(analysis) {
    const destinations = [];
    
    // Analyser le contenu ET le titre pour les destinations
    const contentToAnalyze = [
      analysis.contenu || '',
      analysis.titre || '',
      analysis.title || ''
    ].join(' ').toLowerCase();
    
    const destinationKeywords = {
      'thailand': ['thailand', 'thaïlande', 'bangkok', 'chiang mai', 'phuket', 'krabi', 'pattaya', 'pad thaï', 'tuk-tuk'],
      'vietnam': ['vietnam', 'hanoi', 'ho chi minh', 'saigon', 'da nang', 'hue', 'nha trang'],
      'indonesia': ['indonesia', 'indonésie', 'bali', 'jakarta', 'ubud', 'yogyakarta', 'bandung'],
      'japan': ['japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'nagoya', 'fukuoka'],
      'philippines': ['philippines', 'manila', 'cebu', 'davao', 'boracay', 'palawan'],
      'malaysia': ['malaysia', 'malaisie', 'kuala lumpur', 'penang', 'langkawi', 'johor'],
      'singapore': ['singapore', 'singapour'],
      'spain': ['spain', 'espagne', 'madrid', 'barcelona', 'barcelone', 'valencia', 'seville', 'bilbao', 'siesta'],
      'portugal': ['portugal', 'lisbon', 'lisbonne', 'porto', 'coimbra', 'faro', 'tage']
    };
    
    // Compter les mentions pour chaque destination
    const destinationScores = {};
    
    for (const [country, keywords] of Object.entries(destinationKeywords)) {
      let score = 0;
      keywords.forEach(keyword => {
        const matches = (contentToAnalyze.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      
      if (score > 0) {
        destinationScores[country] = score;
        console.log(`🎯 Destination détectée: ${country} (score: ${score})`);
      }
    }
    
    // Retourner la destination avec le score le plus élevé
    if (Object.keys(destinationScores).length > 0) {
      const bestDestination = Object.entries(destinationScores)
        .sort(([,a], [,b]) => b - a)[0][0];
      destinations.push(bestDestination);
      console.log(`🏆 Destination principale: ${bestDestination}`);
    }
    
    return destinations;
  }
  
  // Obtenir la catégorie de destination intelligente (UNE SEULE catégorie)
  getDestinationCategory(destination) {
    // Mapping vers les catégories WordPress existantes (TOUTES les sous-catégories)
    const destinationMapping = {
      // Sous-catégories spécifiques existantes (parent: 1)
      'vietnam': 'Vietnam', // ID: 59 (parent: 1)
      'thailand': 'Thaïlande', // ID: 60 (parent: 1)
      'japan': 'Japon', // ID: 61 (parent: 1)
      'singapore': 'Singapour', // ID: 62 (parent: 1)
      'korea': 'Corée du Sud', // ID: 63 (parent: 1)
      'philippines': 'Philippines', // ID: 64 (parent: 1)
      'indonesia': 'Indonésie', // ID: 182 (parent: 1)
      
      // Destinations sans sous-catégorie → catégorie principale "Destinations"
      'malaysia': 'Destinations',
      'taiwan': 'Destinations',
      'hong kong': 'Destinations',
      'spain': 'Destinations',
      'portugal': 'Destinations',
      'france': 'Destinations',
      'germany': 'Destinations',
      'italy': 'Destinations',
      'netherlands': 'Destinations',
      'china': 'Destinations',
      'india': 'Destinations',
      'australia': 'Destinations',
      'new zealand': 'Destinations',
      'brazil': 'Destinations',
      'mexico': 'Destinations'
    };
    
    return destinationMapping[destination] || 'Destinations';
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
  // UTILISE final_destination comme source of truth, purge les tags contradictoires
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
    
    // Tags par sous-catégorie
    if (analysis.sous_categorie) {
      tags.push(analysis.sous_categorie);
    }
    
    // Tags par destination - UTILISER final_destination UNIQUEMENT
    // Liste des destinations Asie pour purger les tags contradictoires
    const asiaDestinations = [
      'thailand', 'thaïlande', 'Thaïlande', 'Thailand',
      'vietnam', 'Vietnam',
      'indonesia', 'indonésie', 'Indonesia', 'Indonésie',
      'japan', 'japon', 'Japan', 'Japon',
      'korea', 'corée', 'Korea', 'Corée',
      'philippines', 'Philippines',
      'singapore', 'singapour', 'Singapore', 'Singapour',
      'bangkok', 'Bangkok',
      'bali', 'Bali',
      'tokyo', 'Tokyo'
    ];
    
    // Purger tous les tags destination existants
    const tagsWithoutDestinations = tags.filter(tag => 
      !asiaDestinations.some(dest => tag.toLowerCase().includes(dest.toLowerCase()))
    );
    
    // Ajouter UN SEUL tag destination depuis final_destination
    if (analysis.final_destination && analysis.final_destination !== 'Asie') {
      // Normaliser le nom de destination pour le tag
      const destinationTag = this.normalizeDestinationTag(analysis.final_destination);
      if (destinationTag) {
        tagsWithoutDestinations.push(destinationTag);
        console.log(`   ✓ Tag destination ajouté depuis final_destination: ${destinationTag}`);
      }
    }
    
    return tagsWithoutDestinations.slice(0, 8); // Limiter à 8 tags
  }
  
  /**
   * Normalise une destination en tag WordPress
   */
  normalizeDestinationTag(destination) {
    const mapping = {
      'thailand': 'Thaïlande',
      'thaïlande': 'Thaïlande',
      'vietnam': 'Vietnam',
      'indonesia': 'Indonésie',
      'indonésie': 'Indonésie',
      'japan': 'Japon',
      'japon': 'Japon',
      'korea': 'Corée du Sud',
      'corée': 'Corée du Sud',
      'philippines': 'Philippines',
      'singapore': 'Singapour',
      'singapour': 'Singapour',
      'bangkok': 'Thaïlande',
      'bali': 'Indonésie',
      'tokyo': 'Japon'
    };
    
    return mapping[destination.toLowerCase()] || destination;
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
  /**
   * Extrait le texte éditorial pur (sans sections injectées, sans attributs HTML)
   */
  extractEditorialText(finalizedArticle) {
    let html = `${finalizedArticle.title} ${finalizedArticle.content || ''}`;
    
    // 1. Retirer entièrement la section "Articles connexes"
    html = html.replace(/<h[2-6][^>]*>.*?Articles\s+connexes.*?<\/h[2-6]>.*?(?=<h[2-6]|$)/gis, '');
    
    // 2. Convertir les liens en texte simple (retirer hrefs et garder seulement le texte)
    html = html.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');
    
    // 3. Retirer toutes les balises HTML restantes pour obtenir le texte visible
    const textContent = html.replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return textContent.toLowerCase();
  }

  /**
   * Valide que le contenu ne contient pas de mentions non-asiatiques
   */
  validateNonAsiaContent(editorialText, title) {
    const finalNonAsiaDestinations = [
      'portugal','spain','espagne','lisbon','lisbonne','barcelona','barcelone','madrid','porto',
      'france','paris','italy','italie','rome','greece','grèce','turkey','turquie','istanbul',
      'europe','america','usa','brazil','brésil','mexico','mexique'
    ];

    // match word-boundary (évite des faux positifs bêtes)
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const hits = [];
    for (const term of finalNonAsiaDestinations) {
      const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
      const m = editorialText.match(re);
      if (m) {
        const idx = editorialText.search(re);
        const start = Math.max(0, idx - 80);
        const end = Math.min(editorialText.length, idx + 80);
        hits.push({
          term,
          excerpt: editorialText.slice(start, end).replace(/\s+/g, ' ')
        });
      }
    }

    return { hits };
  }

  validateFinalArticle(article, widgetsRendered = 0) {
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
    
    // FIX D: Utiliser widgets réellement rendus pour le scoring (pas de détection HTML)
    const widgetsScore = widgetsRendered >= 1 ? 100 : 0;
    if (widgetsRendered === 0) {
      // Ne pas pénaliser si widgets bloqués par policy (ex: family context)
      const hasFamilyBlock = article.content?.toLowerCase().includes('famille') && 
                            (article.content?.toLowerCase().includes('enfant') || 
                             article.content?.toLowerCase().includes('bébé'));
      if (!hasFamilyBlock) {
        errors.push(`Widgets insuffisants: ${widgetsRendered} rendu(s)`);
      }
    }
    
    console.log('📊 Validation article:', {
      titleLength: article.title?.length || 0,
      contentLength: contentLength,
      widgetsRendered: widgetsRendered,
      widgetsScore: widgetsScore,
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
    // GARDE DRY_RUN: Bloquer toute publication WordPress en mode test
    if (process.env.FLASHVOYAGE_DRY_RUN === '1') {
      console.log('🧪 DRY_RUN: publication WordPress bloquée');
      return {
        id: null,
        title: article.title,
        link: null,
        status: 'dry_run',
        enhancements: article.enhancements
      };
    }
    
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
