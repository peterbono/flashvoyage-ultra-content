#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import { translate } from '@vitalets/google-translate-api';
import UltraFreshComplete from './_OBSOLETE_ultra-fresh-complete.js';
import ContentValidator from './content-validator.js';
// Templates supprimés - utilisation de l'analyseur intelligent
import RateLimitManager from './rate-limit-manager.js';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Vérification des variables d'environnement requises (sauf en mode FORCE_OFFLINE)
const FORCE_OFFLINE = process.env.FORCE_OFFLINE === '1';
if (!FORCE_OFFLINE && (!WORDPRESS_URL || !WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD || !PEXELS_API_KEY)) {
  console.error('❌ Variables d\'environnement manquantes. Vérifiez votre fichier .env');
  console.error('   (Ou utilisez FORCE_OFFLINE=1 pour le mode offline)');
  process.exit(1);
}

console.log('🎯 ULTRA-STRATEGIC GENERATOR - Positionnement FlashVoyages optimisé\n');

class UltraStrategicGenerator {
  constructor() {
    this.scraper = new UltraFreshComplete();
    this.publishedArticles = new Set();
    this.publishedRedditUrls = new Set(); // Track Reddit URLs to avoid duplicates
    this.redditUrlsCacheFile = './published-reddit-urls.json'; // Cache persistant
    this.validator = new ContentValidator();
    // Templates supprimés - utilisation de l'analyseur intelligent
    this.rateLimitManager = new RateLimitManager();
    
    // Initialiser l'analyseur intelligent IMMÉDIATEMENT (pas de lazy)
    // Import synchrone pour éviter les problèmes
    try {
      // Utiliser import() de manière synchrone dans le constructeur n'est pas possible
      // On va l'initialiser dans une méthode async appelée au démarrage
      this.intelligentAnalyzer = null;
      this._analyzerInitialized = false;
    } catch (error) {
      console.error('❌ Erreur initialisation analyseur intelligent:', error.message);
      throw error; // Ne pas continuer sans l'analyseur intelligent
    }
    
    // Cache local pour les articles publiés
    this.cacheFile = './published-articles-cache.json';
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 heures
    
    console.log('🧠 Mode intelligent activé par défaut');
  }
  
  // Initialiser l'analyseur intelligent - DOIT être appelé avant generateStrategicContent
  async initializeIntelligentAnalyzer() {
    if (this._analyzerInitialized && this.intelligentAnalyzer) {
      return this.intelligentAnalyzer;
    }
    
    try {
      const IntelligentContentAnalyzerOptimized = (await import('./intelligent-content-analyzer-optimized.js')).default;
      this.intelligentAnalyzer = new IntelligentContentAnalyzerOptimized();
      this._analyzerInitialized = true;
      console.log('✅ Analyseur intelligent initialisé');
      return this.intelligentAnalyzer;
    } catch (error) {
      console.error('❌ ERREUR CRITIQUE: Impossible d\'initialiser l\'analyseur intelligent:', error.message);
      throw new Error(`ANALYZER_INIT_FAILED: ${error.message}`);
    }
  }

  // Charger le cache local
  async loadCache() {
    try {
      const fs = await import('fs');
      if (fs.existsSync(this.cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
        const now = Date.now();
        
        if (now - cacheData.timestamp < this.cacheExpiry) {
          console.log('📚 Chargement du cache local...');
          this.publishedArticles = new Set(cacheData.articles);
          console.log(`✅ ${this.publishedArticles.size} articles chargés depuis le cache`);
          return true;
        }
      }
    } catch (error) {
      console.log('⚠️ Erreur chargement cache:', error.message);
    }
    return false;
  }

  // Sauvegarder le cache local
  async saveCache() {
    try {
      const fs = await import('fs');
      const cacheData = {
        timestamp: Date.now(),
        articles: Array.from(this.publishedArticles)
      };
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
      console.log('💾 Cache sauvegardé localement');
    } catch (error) {
      console.log('⚠️ Erreur sauvegarde cache:', error.message);
    }
  }

  // NOUVEAU: Charger le cache des URLs Reddit
  async loadRedditUrlsCache() {
    try {
      const fs = await import('fs');
      if (fs.existsSync(this.redditUrlsCacheFile)) {
        const urls = JSON.parse(fs.readFileSync(this.redditUrlsCacheFile, 'utf8'));
        this.publishedRedditUrls = new Set(urls);
        console.log(`📋 ${this.publishedRedditUrls.size} URLs Reddit chargées depuis le cache`);
        return true;
      }
    } catch (error) {
      console.log('⚠️ Erreur chargement cache URLs Reddit:', error.message);
    }
    return false;
  }

  // NOUVEAU: Sauvegarder le cache des URLs Reddit
  async saveRedditUrlsCache() {
    try {
      const fs = await import('fs');
      const urls = Array.from(this.publishedRedditUrls);
      fs.writeFileSync(this.redditUrlsCacheFile, JSON.stringify(urls, null, 2));
      console.log(`💾 ${urls.length} URLs Reddit sauvegardées dans le cache`);
    } catch (error) {
      console.log('⚠️ Erreur sauvegarde cache URLs Reddit:', error.message);
    }
  }

  // Charger les articles déjà publiés
  async loadPublishedArticles() {
    try {
      console.log('📚 Chargement des articles déjà publiés...');
      
      // Charger le cache des URLs Reddit
      await this.loadRedditUrlsCache();
      
      // Essayer d'abord le cache local des titres
      const cacheLoaded = await this.loadCache();
      
      // TOUJOURS crawler WordPress pour mettre à jour les URLs Reddit (même si cache existe)
      // Car les URLs Reddit peuvent changer ou être ajoutées
      console.log('📚 Crawl WordPress pour extraire les URLs Reddit (mise à jour)...');
      
      let allArticles = [];
      let page = 1;
      const perPage = 100;
      
      // Récupérer tous les articles (plusieurs pages)
      while (true) {
        try {
          // L'API WordPress est publique, pas besoin d'auth
          const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&status=publish&_fields=id,title,date,content`, {
            timeout: 15000,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'FlashVoyagesBot/1.0'
            }
          });
          
          if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            break;
          }
          
          allArticles = allArticles.concat(response.data);
          page++;
          
          // Limiter à 10 pages max (1000 articles) pour éviter les timeouts
          if (page > 10) break;
          
        } catch (error) {
          // Si erreur 400 (page inexistante), arrêter la pagination
          if (error.response?.status === 400 && error.response?.data?.code === 'rest_post_invalid_page_number') {
            console.log('✅ Fin des pages WordPress atteinte');
            break;
          }
          // Sinon, propager l'erreur
          throw error;
        }
      }
      
      // Analyser les titres et extraire les mots-clés
      allArticles.forEach(post => {
        if (post.title && post.title.rendered) {
        const title = post.title.rendered.toLowerCase().trim();
        this.publishedArticles.add(title);
          
          // Extraire les mots-clés principaux du titre
          const keywords = title.match(/\b(visa|nomade|asie|pays|top|guide|comment|où|quand|pourquoi)\b/g);
          if (keywords) {
            keywords.forEach(keyword => this.publishedArticles.add(keyword));
          }
        }
        
        // NOUVEAU: Extraire l'URL Reddit source depuis le contenu
        // Améliorer le regex pour gérer les guillemets encodés par WordPress
        if (post.content && post.content.rendered) {
          const content = post.content.rendered;
          // Pattern 1: href="https://reddit.com/..."
          let redditUrlMatch = content.match(/href=["'](https?:\/\/reddit\.com\/r\/\w+\/comments\/[\w\/]+)["']/i);
          if (!redditUrlMatch) {
            // Pattern 2: href=&quot;https://reddit.com/...&quot; (encodé)
            redditUrlMatch = content.match(/href=&quot;(https?:\/\/reddit\.com\/r\/\w+\/comments\/[\w\/]+)&quot;/i);
          }
          if (!redditUrlMatch) {
            // Pattern 3: https://reddit.com/... (sans href)
            redditUrlMatch = content.match(/(https?:\/\/reddit\.com\/r\/\w+\/comments\/[\w\/]+)/i);
          }
          if (redditUrlMatch) {
            const redditUrl = redditUrlMatch[1];
            this.publishedRedditUrls.add(redditUrl);
            console.log(`   📋 URL Reddit extraite: ${redditUrl.substring(0, 60)}...`);
          }
        }
      });
      
      console.log(`✅ ${allArticles.length} articles analysés, ${this.publishedArticles.size} titres uniques`);
      console.log(`   📋 ${this.publishedRedditUrls.size} URLs Reddit dans le cache`);
      
      // Sauvegarder le cache des URLs Reddit
      await this.saveRedditUrlsCache();
      
      // Sauvegarder le cache
      await this.saveCache();
    } catch (error) {
      console.warn('⚠️ Impossible de charger les articles existants:', error.message);
      
      // Essayer de charger le cache même en cas d'erreur
      await this.loadCache();
    }
  }

  // Forcer le rechargement des articles (ignorer le cache)
  async forceRefreshArticles() {
    try {
      console.log('🔄 Force refresh des articles publiés...');
      
      // Supprimer le cache
      const fs = await import('fs');
      if (fs.existsSync(this.cacheFile)) {
        fs.unlinkSync(this.cacheFile);
        console.log('🗑️ Cache supprimé');
      }
      
      // Recharger depuis WordPress
      await this.loadPublishedArticles();
    } catch (error) {
      console.error('❌ Erreur force refresh:', error.message);
    }
  }

  // Vérifier si l'article est déjà publié
  isArticleAlreadyPublished(title, redditUrl = null) {
    // Log pour debug
    console.log(`🔍 Vérification duplication: titre="${title}", URL="${redditUrl || 'N/A'}"`);
    console.log(`   Cache URLs: ${this.publishedRedditUrls.size} URLs`);
    console.log(`   Cache titres: ${this.publishedArticles.size} titres`);
    
    // PRIORITÉ 1: Vérifier l'URL Reddit source (plus fiable)
    if (redditUrl && this.publishedRedditUrls.has(redditUrl)) {
      console.log(`⚠️ Article Reddit déjà publié (URL): ${redditUrl}`);
      return true;
    }
    
    const normalizedTitle = title.toLowerCase().trim();
    
    // Vérification exacte du titre
    if (this.publishedArticles.has(normalizedTitle)) {
      console.log(`⚠️ Article déjà publié (titre exact): "${normalizedTitle}"`);
      return true;
    }
    
    // Vérification de similarité (éviter les variations du même sujet)
    const titleWords = normalizedTitle.split(/\s+/);
    const commonWords = ['visa', 'nomade', 'asie', 'pays', 'top', 'guide', 'comment', 'où', 'quand', 'pourquoi'];
    
    for (const publishedTitle of this.publishedArticles) {
      const publishedWords = publishedTitle.split(/\s+/);
      
      // Compter les mots en commun
      const commonCount = titleWords.filter(word => 
        publishedWords.includes(word) && commonWords.includes(word)
      ).length;
      
      // Si plus de 3 mots-clés en commun, considérer comme similaire
      if (commonCount >= 3) {
        console.log(`⚠️ Article similaire détecté: "${publishedTitle}" vs "${normalizedTitle}" (${commonCount} mots-clés en commun)`);
        return true;
      }
    }
    
    console.log(`   ✅ Article non publié - OK pour publication`);
    return false;
  }

  // Générer un contenu stratégique avec GPT-4
  // NOTE: Cette méthode utilise this.intelligentAnalyzer qui DOIT être initialisé
  // par la classe enfant (EnhancedUltraGenerator) dans son constructeur
  async generateStrategicContent(article) {
    try {
      console.log('🧠 Génération de contenu stratégique intelligente...');
      
      // Vérifier que l'analyseur intelligent est disponible (initialisé par la classe enfant)
      if (!this.intelligentAnalyzer) {
        throw new Error('ANALYZER_NOT_INITIALIZED: this.intelligentAnalyzer doit être initialisé par la classe enfant (EnhancedUltraGenerator)');
      }
      
      // Détecter si c'est une question de comparaison Vietnam/Indonésie
      const isVietnamIndonesiaQuestion = this.isVietnamIndonesiaQuestion(article);
      
      if (isVietnamIndonesiaQuestion) {
        console.log('🌴 Détection question Vietnam vs Indonésie - Utilisation analyseur intelligent');
        // Utiliser l'analyseur intelligent pour les questions de comparaison
        const intelligentAnalysis = await this.intelligentAnalyzer.analyzeContent(article);
        const llmContent = await this.intelligentAnalyzer.generateIntelligentContent(article, intelligentAnalysis);
        return this.normalizeLLMContent(llmContent, article);
      }
      
      // 1. Analyse intelligente avec LLM
      console.log('🧠 Analyse intelligente du contenu...');
      const intelligentAnalysis = await this.intelligentAnalyzer.analyzeContent(article);
      console.log(`📊 Analyse LLM: ${intelligentAnalysis.pertinence}/100`);
      console.log(`   Catégorie: ${intelligentAnalysis.categorie}`);
      console.log(`   Angle: ${intelligentAnalysis.angle}`);
      console.log(`   Recommandation: ${intelligentAnalysis.recommandation}`);
      console.log(`   Raison: ${intelligentAnalysis.raison}`);
      
      // 2. Générer le contenu selon la recommandation
      if (intelligentAnalysis.recommandation === 'generation_llm') {
        console.log('🤖 Génération intelligente avec LLM...');
        const llmContent = await this.intelligentAnalyzer.generateIntelligentContent(article, intelligentAnalysis);
        return this.normalizeLLMContent(llmContent, article);
      } else {
        console.log('📝 Utilisation des templates fixes...');
        return this.generateGenericContent(article, intelligentAnalysis.categorie, intelligentAnalysis);
      }

    } catch (error) {
      console.error('❌ ERREUR CRITIQUE génération intelligente:', error.message);
      // PAS DE FALLBACK - L'analyseur intelligent est OBLIGATOIRE
      throw new Error(`GENERATION_FAILED: ${error.message}`);
    }
  }

  // Détecter si c'est une question de comparaison Vietnam/Indonésie
  isVietnamIndonesiaQuestion(article) {
    const text = `${article.title} ${article.content}`.toLowerCase();
    return text.includes('vietnam') && text.includes('indonesia') && 
           (text.includes('november') || text.includes('novembre') || text.includes('choosing') || text.includes('choisir'));
  }

  // Normaliser le contenu LLM pour le format attendu
  normalizeLLMContent(llmContent, sourceArticle = null) {
    console.log('🔍 Contenu LLM brut:', Object.keys(llmContent));
    
    let finalContent = '';
    
    // Construire le contenu final en combinant toutes les parties
    if (llmContent.intro) {
      finalContent += llmContent.intro + '\n\n';
    }
    
    if (llmContent.content) {
      finalContent += llmContent.content + '\n\n';
    }
    
    if (llmContent.signature) {
      finalContent += llmContent.signature + '\n\n';
    }
    
    if (llmContent.cta && !finalContent.includes(llmContent.cta)) {
      finalContent += `<p><strong>👉 ${llmContent.cta}</strong></p>\n\n`;
    }
    
    // Si on n'a pas de contenu final, utiliser le contenu de base
    if (!finalContent.trim()) {
      finalContent = llmContent.content || 'Contenu non disponible';
    }
    
    console.log('✅ Contenu normalisé:', finalContent.substring(0, 100) + '...');
    
    // Valider le contenu si on a l'article source
    let validation = null;
    if (sourceArticle && this.intelligentAnalyzer && this.intelligentAnalyzer.validateGeneratedContent) {
      validation = this.intelligentAnalyzer.validateGeneratedContent(llmContent, sourceArticle);
    }
    
    // Validation critique avec ContentValidator
    const articleToValidate = {
      title: llmContent.title || 'Titre manquant',
      content: finalContent.trim()
    };
    
    const criticalValidation = this.validator.validateArticle(articleToValidate);
    
    // Si erreurs critiques, rejeter
    if (!criticalValidation.isValid) {
      console.error('❌ ERREURS CRITIQUES DÉTECTÉES:');
      criticalValidation.errors.forEach(error => console.error(`  - ${error}`));
      throw new Error(`Contenu rejeté: ${criticalValidation.errors.join(', ')}`);
    }
    
    // Si warnings, les afficher mais continuer
    if (criticalValidation.warnings.length > 0) {
      console.warn('⚠️ AVERTISSEMENTS DE QUALITÉ:');
      criticalValidation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    console.log(`✅ Validation réussie - Score: ${criticalValidation.score}/100`);
    
    return {
      ...llmContent,
      content: finalContent.trim(),
      validation: validation,
      qualityScore: criticalValidation.score
    };
  }

  // Générer du contenu générique avec templates adaptatifs
  generateGenericContent(article, templateName, relevanceAnalysis) {
    try {
      console.log(`📝 Génération de contenu générique avec template: ${templateName}`);
      
      // Utiliser les templates génériques
      const genericContent = this.genericTemplates.fillTemplate(templateName, article);
      
      // Valider le contenu généré
      const validation = this.validator.validateArticle({
        title: genericContent.title,
        content: genericContent.content,
        type: article.type
      });
      
      if (!validation.isValid) {
        console.warn('⚠️ Erreurs de validation détectées:', validation.errors);
      }
      
      return {
        title: genericContent.title,
        target_audience: genericContent.target_audience,
        ton: genericContent.ton,
        keywords: genericContent.keywords,
        cta: genericContent.cta,
        urgence: genericContent.urgence,
        destinations: genericContent.destinations,
        economic_value: this.getGenericEconomicValue(templateName, relevanceAnalysis),
        content: genericContent.content,
        expertise_score: this.getGenericExpertiseScore(relevanceAnalysis),
        validation: validation
      };

    } catch (error) {
      console.error('❌ ERREUR CRITIQUE génération générique:', error.message);
      // PAS DE FALLBACK - Utiliser l'analyseur intelligent
      throw new Error(`GENERIC_GENERATION_FAILED: ${error.message}`);
    }
  }

  // Obtenir la valeur économique pour les templates génériques
  getGenericEconomicValue(templateName, relevanceAnalysis) {
    const economicValues = {
      'voyage_general': 'Économies potentielles: 200-800€ par voyage',
      'asie_general': 'Économies potentielles: 300-1000€ par voyage en Asie',
      'general': 'Information utile pour optimiser vos voyages'
    };
    
    return economicValues[templateName] || 'Information utile pour vos voyages';
  }

  // Obtenir le score d'expertise pour les templates génériques
  getGenericExpertiseScore(relevanceAnalysis) {
    if (relevanceAnalysis.relevancePercentage > 80) return "9/10";
    if (relevanceAnalysis.relevancePercentage > 60) return "8/10";
    if (relevanceAnalysis.relevancePercentage > 40) return "7/10";
    return "6/10";
  }

  // Générer du contenu nomade Asie avec templates variés
  generateNomadeAsiaContent(article, templateName, relevanceAnalysis) {
    try {
      console.log(`🏠 Génération de contenu nomade Asie avec template: ${templateName}`);
      
      // Utiliser les templates nomades Asie variés
      const nomadeContent = this.nomadeAsiaTemplates.fillTemplate(templateName, article);
      
      // Valider le contenu généré
      const validation = this.validator.validateArticle({
        title: nomadeContent.title,
        content: nomadeContent.content,
        type: article.type
      });
      
      if (!validation.isValid) {
        console.warn('⚠️ Erreurs de validation détectées:', validation.errors);
      }
      
      return {
        title: nomadeContent.title,
        target_audience: nomadeContent.target_audience,
        economic_value: this.getNomadeAsiaEconomicValue(templateName, relevanceAnalysis),
        content: nomadeContent.content,
        cta: nomadeContent.cta,
        expertise_score: this.getNomadeAsiaExpertiseScore(relevanceAnalysis),
        validation: validation
      };

    } catch (error) {
      console.error('❌ ERREUR CRITIQUE génération nomade Asie:', error.message);
      // PAS DE FALLBACK - Utiliser l'analyseur intelligent
      throw new Error(`NOMADE_ASIA_GENERATION_FAILED: ${error.message}`);
    }
  }

  // Obtenir la valeur économique pour les templates nomades Asie
  getNomadeAsiaEconomicValue(templateName, relevanceAnalysis) {
    const economicValues = {
      'nomade_hebergement': 'Économies potentielles: 200-800€ par mois + communauté active',
      'nomade_visa': 'Économies potentielles: 100-500€ en frais administratifs + stabilité',
      'nomade_budget': 'Économies potentielles: 200-600€ par mois + qualité de vie',
      'nomade_communaute': 'Valeur ajoutée: Networking, opportunités, bien-être',
      'nomade_tech': 'Économies potentielles: 100-500€ vs Europe + innovation'
    };
    
    return economicValues[templateName] || 'Économies potentielles: 300-800€ par mois';
  }

  // Obtenir le score d'expertise pour les templates nomades Asie
  getNomadeAsiaExpertiseScore(relevanceAnalysis) {
    if (relevanceAnalysis.relevancePercentage > 80) return "9/10";
    if (relevanceAnalysis.relevancePercentage > 60) return "8/10";
    if (relevanceAnalysis.relevancePercentage > 40) return "7/10";
    return "6/10";
  }

  // Générer du contenu nomade spécialisé
  async generateNomadeContent(article, personaDetection) {
    try {
      console.log(`🏠 Génération de contenu nomade pour: ${personaDetection.persona}`);
      
      // Utiliser les templates nomades
      const nomadeContent = this.nomadeAsiaTemplates.fillTemplate(personaDetection.persona, article);
      
      // Valider le contenu généré
      const validation = this.validator.validateArticle({
        title: nomadeContent.title,
        content: nomadeContent.content,
        type: article.type
      });
      
      if (!validation.isValid) {
        console.warn('⚠️ Erreurs de validation détectées:', validation.errors);
      }
      
      return {
        title: nomadeContent.title,
        target_audience: nomadeContent.target_audience,
        economic_value: this.getNomadeEconomicValue(personaDetection.persona),
        content: nomadeContent.content,
        cta: nomadeContent.cta,
        expertise_score: "9/10"
      };

    } catch (error) {
      console.error('❌ ERREUR CRITIQUE génération nomade:', error.message);
      // PAS DE FALLBACK - Utiliser l'analyseur intelligent
      throw new Error(`NOMADE_GENERATION_FAILED: ${error.message}`);
    }
  }

  // Obtenir la valeur économique pour les nomades
  getNomadeEconomicValue(persona) {
    const economicValues = {
      'nomade_coliving_visa_asie': 'Économies potentielles: 500-1500€ par mois + visa simplifié',
      'nomade_coliving_asie': 'Économies potentielles: 300-800€ par mois + communauté active',
      'nomade_visa_asie': 'Économies potentielles: 200-500€ en frais administratifs + démarches simplifiées',
      'nomade_budget_asie': 'Économies potentielles: 200-600€ par mois + séjour prolongé possible'
    };
    
    return economicValues[persona] || 'Économies potentielles: 300-800€ par mois';
  }

  // Contenu de fallback si GPT-4 échoue
  generateFallbackContent(article) {
    try {
      // Utiliser les templates structurés
      const templateType = this.getTemplateType(article.type);
      const content = this.templates.generateContent(templateType, article);
      
      // Valider le contenu généré
      const validation = this.validator.validateArticle({
        title: content.title,
        content: content.content,
        type: article.type
      });
      
      if (!validation.isValid) {
        console.warn('⚠️ Erreurs de validation détectées:', validation.errors);
        // Utiliser le contenu malgré les erreurs, mais les logger
      }
      
      return {
        title: content.title,
        target_audience: "Voyageurs français passionnés d'Asie (budget 2000-5000€/voyage)",
        economic_value: content.economicValue,
        content: content.content,
        cta: "Réserve maintenant pour profiter de cette offre",
        expertise_score: "8/10",
        validation: validation
      };
    } catch (error) {
      console.error('❌ ERREUR CRITIQUE template:', error.message);
      // PAS DE FALLBACK - Utiliser l'analyseur intelligent
      throw new Error(`TEMPLATE_GENERATION_FAILED: ${error.message}`);
    }
  }

  // Fallback basique en cas d'erreur de template
  generateBasicFallback(article) {
    const validityPeriod = this.getValidityPeriod(article);
    
    return {
      title: `🔥 URGENT : ${article.title.replace(/^[🔥🚨⚡🎯]+/, '').trim()}`,
      target_audience: "Voyageurs français passionnés d'Asie (budget 2000-5000€/voyage)",
      economic_value: "Économies potentielles: 300-800€ par voyage",
      content: `
<p><strong>Source :</strong> <a href="${article.link}" target="_blank" rel="noopener">${article.title}</a> - ${article.source}</p>

<p>Si tu es un voyageur français qui rêve d'Asie, cette info va changer ton prochain voyage. Chez FlashVoyages, on déniche les bons plans qui valent le détour.</p>

<h5>Pourquoi cette info est cruciale pour toi</h5>
<p>Cette nouvelle sur ${article.type} en Asie, c'est pas juste une actualité de plus. C'est le genre d'info qui peut te faire économiser des centaines d'euros sur ton prochain voyage.</p>

<p>On suit ces évolutions de près parce qu'on sait que nos lecteurs comptent sur nous pour dénicher les vraies bonnes affaires.</p>

<h5>Ce qui change concrètement pour toi</h5>
<p>Voici ce que tu dois retenir :</p>

<ul>
<li><strong>${article.type} :</strong> ${article.content}</li>
<li><strong>Validité :</strong> ${validityPeriod}</li>
<li><strong>Pour qui :</strong> Voyageurs français passionnés d'Asie</li>
<li><strong>Économies :</strong> 300-800€ par voyage</li>
</ul>

<h5>Notre conseil FlashVoyages</h5>
<p>On te conseille d'agir rapidement. Ces offres sont souvent limitées dans le temps et partent vite.</p>

<p>On te recommande de réserver rapidement pour profiter des offres. C'est le genre de changement qu'on voit venir, et mieux vaut être préparé.</p>

<h5>Contexte Asie</h5>
<p>Cette évolution s'inscrit dans une tendance plus large : l'Asie se positionne comme une destination accessible avec des offres attractives.</p>

<p>C'est une bonne nouvelle pour les voyageurs français — ça signifie des économies importantes sur tes voyages.</p>

<h5>Notre analyse</h5>
<p><strong>Score FlashVoyages :</strong> ${article.relevance}/100 — Information cruciale</p>
<p><strong>Pourquoi c'est important :</strong> Changement concret dans tes économies de voyage</p>
<p><strong>Action recommandée :</strong> Profiter des offres rapidement</p>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — ton spécialiste du voyage en Asie.</em></p>
`,
      cta: "Réserve maintenant pour profiter de cette offre",
      expertise_score: "8/10"
    };
  }

  // Déterminer le type de template à utiliser
  getTemplateType(articleType) {
    const templateMapping = {
      'bon_plan': 'bon_plan',
      'formalites': 'formalites',
      'transport': 'transport',
      'safety': 'formalites',
      'tourism': 'bon_plan'
    };
    
    return templateMapping[articleType] || 'bon_plan';
  }

  // Méthodes utilitaires
  getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffHours < 1) {
      return `${diffMinutes} minutes`;
    } else if (diffHours < 24) {
      return `${diffHours} heures`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} jours`;
    }
  }

  // Générer une période de validité cohérente
  getValidityPeriod(article) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    // Templates de validité selon le type d'article
    const validityTemplates = {
      'bon_plan': `Offre valable jusqu'en décembre ${currentYear}`,
      'transport': `Disponible jusqu'en mars ${currentYear + 1}`,
      'formalités': `Règlement en vigueur jusqu'en juin ${currentYear + 1}`,
      'safety': `Mesures applicables jusqu'en décembre ${currentYear}`,
      'tourism': `Saison touristique ${currentYear}-${currentYear + 1}`
    };
    
    // Si c'est un bon plan en fin d'année, étendre à l'année suivante
    if (article.type === 'bon_plan' && currentMonth >= 10) {
      return `Offre valable jusqu'en mars ${currentYear + 1}`;
    }
    
    return validityTemplates[article.type] || `Valide jusqu'en décembre ${currentYear}`;
  }

  // Rechercher une image Pexels
  async searchPexelsImage(query) {
    try {
      const response = await axios.get('https://api.pexels.com/v1/search', {
        headers: {
          'Authorization': PEXELS_API_KEY
        },
        params: {
          query: query,
          per_page: 1,
          orientation: 'landscape'
        }
      });

      const photos = response.data.photos;
      if (photos && photos.length > 0) {
        return {
          url: photos[0].src.large,
          alt: photos[0].alt || query,
          photographer: photos[0].photographer
        };
      }
      return null;
    } catch (error) {
      console.warn('⚠️ Erreur Pexels:', error.message);
      return null;
    }
  }

  // Uploader une image sur WordPress
  async uploadImageToWordPress(imageUrl, altText) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer'
      });

      const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, imageResponse.data, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Disposition': `attachment; filename="strategic-${Date.now()}.jpg"`
        },
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      return uploadResponse.data.id;
    } catch (error) {
      console.warn('⚠️ Erreur upload image:', error.message);
      return null;
    }
  }

  // Créer ou récupérer un tag
  async getOrCreateTag(tagName) {
    try {
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      if (response.data.length > 0) {
        return response.data[0].id;
      }

      const createResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/tags`, {
        name: tagName,
        slug: tagName.toLowerCase().replace(/\s+/g, '-')
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      return createResponse.data.id;
    } catch (error) {
      console.warn(`⚠️ Erreur tag ${tagName}:`, error.message);
      return null;
    }
  }

  // Générer et publier un article stratégique
  async generateAndPublishStrategicArticle() {
    try {
      console.log('🎯 Génération d\'un article stratégique FlashVoyages...\n');

      // Charger les articles publiés
      await this.loadPublishedArticles();

      // Scraper les sources ultra-fraîches
      const articles = await this.scraper.scrapeAllSources();
      
      if (articles.length === 0) {
        console.log('❌ Aucun article ultra-fraîche trouvé');
        return;
      }

      // Filtrer les articles pertinents (filtrage simple basé sur les destinations asiatiques)
      console.log('🧠 Filtrage intelligent des articles...');
      
      // Filtrage basique : garder les articles avec destinations asiatiques
      const asiaDestinations = ['indonesia', 'indonésie', 'bali', 'vietnam', 'thailand', 'thaïlande', 'japan', 'japon', 'korea', 'corée', 'philippines', 'singapore', 'singapour'];
      const relevantArticles = articles.filter(article => {
        const titleLower = (article.title || '').toLowerCase();
        const contentLower = (article.content || article.source_text || '').toLowerCase();
        const text = `${titleLower} ${contentLower}`;
        return asiaDestinations.some(dest => text.includes(dest));
      });
      
      if (relevantArticles.length === 0) {
        console.log('❌ Aucun article pertinent trouvé');
        return;
      }
      
      console.log(`✅ ${relevantArticles.length} articles pertinents trouvés sur ${articles.length}`);

      console.log(`✅ ${relevantArticles.length} articles pertinents trouvés`);

      // Trouver le meilleur article non publié parmi les pertinents
      let bestArticle = null;
      for (const article of relevantArticles) {
        if (!this.isArticleAlreadyPublished(article.title)) {
          // Vérification supplémentaire : éviter les articles trop similaires
          const titleWords = article.title.toLowerCase().split(/\s+/);
          const commonWords = ['visa', 'nomade', 'asie', 'pays', 'top', 'guide', 'comment', 'où', 'quand', 'pourquoi', 'digital', 'nomad'];
          const hasCommonWords = commonWords.some(word => titleWords.includes(word));
          
          if (!hasCommonWords) {
          bestArticle = article;
          break;
          } else {
            console.log('⚠️ Article potentiellement similaire détecté, passage au suivant...');
          }
        }
      }

      if (!bestArticle) {
        console.log('❌ Tous les articles pertinents ont déjà été publiés');
        return;
      }

      console.log(`✅ Article sélectionné: ${bestArticle.title}`);
      console.log(`📊 Pertinence: ${bestArticle.relevance}/100`);
      console.log(`🏷️ Type: ${bestArticle.type}`);
      
      // Afficher l'analyse de pertinence
      if (bestArticle.relevanceAnalysis) {
        const analysis = bestArticle.relevanceAnalysis;
        console.log(`🧠 Analyse intelligente:`);
        console.log(`   Catégorie: ${analysis.category}`);
        console.log(`   Scores: Nomade(${analysis.nomadeScore}) Asie(${analysis.asiaScore}) Voyage(${analysis.travelScore})`);
        console.log(`   Pertinence: ${analysis.relevancePercentage.toFixed(1)}%`);
      }

      // Générer le contenu stratégique avec GPT-4
      const strategicContent = await this.generateStrategicContent(bestArticle);
      
      console.log(`🎯 Titre stratégique: ${strategicContent.title}`);
      console.log(`👥 Cible: ${strategicContent.target_audience}`);
      console.log(`💰 Valeur économique: ${strategicContent.economic_value}`);
      console.log(`🧠 Score d'expertise: ${strategicContent.expertise_score}`);

      // Rechercher une image
      console.log('🖼️ Recherche d\'image contextuelle...');
      const imageQuery = this.getImageQuery(bestArticle);
      const imageData = await this.searchPexelsImage(imageQuery);
      
      let imageId = null;
      if (imageData) {
        imageId = await this.uploadImageToWordPress(imageData.url, imageData.alt);
        if (imageId) {
          console.log(`✅ Image uploadée (ID: ${imageId})`);
        }
      }

      // Créer les tags
      const tagNames = ['actualite', 'voyage', 'Asie', bestArticle.type, 'strategique', 'expertise', 'bon-plan'];
      const tagIds = [];
      for (const tagName of tagNames) {
        const tagId = await this.getOrCreateTag(tagName);
        if (tagId) {
          tagIds.push(tagId);
          console.log(`✅ Tag trouvé: ${tagName} (ID: ${tagId})`);
        }
      }

      // Créer l'article
      console.log('📝 Création de l\'article stratégique sur WordPress...');
      // Guardrail: abort if editorial placeholders remain ([VERIFY], [TODO], [AFFILIATE:X], ...)
      const { assertNoPlaceholdersInPayload } = await import('./intelligence/content-guardrails.js');
      assertNoPlaceholdersInPayload({
        title: strategicContent.title,
        content: strategicContent.content,
      }, { context: 'ultra-strategic-generator:publish' });
      const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        title: strategicContent.title,
        content: strategicContent.content,
        status: 'publish',
        categories: [1], // Catégorie Asie
        tags: tagIds,
        featured_media: imageId
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      console.log('🎉 Article stratégique publié avec succès !');
      console.log(`🔗 URL: ${articleResponse.data.link}`);
      console.log(`📊 ID: ${articleResponse.data.id}`);
      console.log(`📂 Catégorie: Asie`);
      console.log(`🏷️ Tags: ${tagNames.join(', ')}`);
      console.log(`📊 Score stratégique: ${bestArticle.relevance}/100`);
      console.log(`🎯 Valeur stratégique: ${strategicContent.economic_value}`);
      console.log(`👥 Cible: ${strategicContent.target_audience}`);
      console.log(`🧠 Expertise: ${strategicContent.expertise_score}`);
      console.log(`🌏 Source: ${bestArticle.source}`);
      console.log(`🏷️ Type: ${bestArticle.type}`);
      console.log(`⚡ Urgence: ${bestArticle.urgency || strategicContent.urgence || 'non définie'}`);
      if (imageId) {
        console.log(`🖼️ Image: ${imageId}`);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la génération stratégique:', error.response ? error.response.data : error.message);
    }
  }

  // Générer une requête d'image
  getImageQuery(article) {
    const queries = {
      'bon_plan': 'thailand travel deal savings',
      'transport': 'asia airplane flight premium',
      'formalités': 'asia passport visa official',
      'safety': 'asia travel safety security',
      'tourism': 'asia luxury tourism attraction'
    };
    return queries[article.type] || 'asia luxury travel';
  }
}

// Fonction principale
// ATTENTION: Ce script ne devrait PAS être utilisé directement
// Utiliser enhanced-ultra-generator.js qui suit le plan du pipeline complet
async function main() {
  console.error('❌ ERREUR: ultra-strategic-generator.js ne suit pas le plan du pipeline complet');
  console.error('❌ Utilisez enhanced-ultra-generator.js pour le pipeline complet avec analyseur intelligent');
  console.error('❌ Arrêt du script pour éviter d\'utiliser le mauvais orchestrateur\n');
  process.exit(1);
}

// Exécution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Erreur fatale:', error.message);
    process.exit(1);
  });
}

export default UltraStrategicGenerator;
