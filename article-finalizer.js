#!/usr/bin/env node

/**
 * ARTICLE FINALIZER
 * Finalise l'article avant publication :
 * - Remplace les placeholders de widgets Travelpayouts
 * - Ajoute l'image featured
 * - Ajoute les catégories/tags
 * - Vérifie le quote highlight
 * - Vérifie l'intro FOMO
 */

import axios from 'axios';
import { REAL_TRAVELPAYOUTS_WIDGETS } from './travelpayouts-real-widgets-database.js';
import ContextualWidgetPlacer from './contextual-widget-placer-v2.js';
import WidgetPlanBuilder from './widget-plan-builder.js';

class ArticleFinalizer {
  constructor() {
    this.widgets = REAL_TRAVELPAYOUTS_WIDGETS;
    this.widgetPlacer = new ContextualWidgetPlacer();
    this.widgetPlanBuilder = new WidgetPlanBuilder();
  }

  /**
   * Finalise l'article complet
   */
  async finalizeArticle(article, analysis) {
    console.log('\n🎨 FINALISATION DE L\'ARTICLE');
    console.log('==============================\n');

    let finalContent = article.content;
    const enhancements = { ...article.enhancements };

    // 1. Remplacer les placeholders de widgets
    const widgetResult = await this.replaceWidgetPlaceholders(finalContent, analysis);
    finalContent = widgetResult.content;
    enhancements.widgetsReplaced = widgetResult.count;

    // 2. Vérifier et améliorer le quote highlight
    const quoteResult = this.ensureQuoteHighlight(finalContent, analysis);
    finalContent = quoteResult.content;
    enhancements.quoteHighlight = quoteResult.hasQuote ? 'Oui' : 'Non';

    // 3. Vérifier et améliorer l'intro FOMO
    const fomoResult = this.ensureFomoIntro(finalContent, analysis);
    finalContent = fomoResult.content;
    enhancements.fomoIntro = fomoResult.hasFomo ? 'Oui' : 'Non';

    console.log('✅ Finalisation terminée:');
    console.log(`   - Widgets remplacés: ${enhancements.widgetsReplaced}`);
    console.log(`   - Quote highlight: ${enhancements.quoteHighlight}`);
    console.log(`   - Intro FOMO: ${enhancements.fomoIntro}\n`);

    return {
      ...article,
      content: finalContent,
      enhancements
    };
  }

  /**
   * Compte les vrais widgets placés dans le contenu
   */
  countActualWidgets(content) {
    const widgetPatterns = [
      /Selon notre analyse de milliers de vols/gi,
      /D'après notre expérience avec des centaines de nomades/gi,
      /Notre partenaire Kiwi\.com/gi,
      /Notre outil compare les prix/gi,
      /Comparez les prix et réservez/gi,
      /Trouvez les meilleures offres/gi,
      /Notre partenaire Aviasales/gi,
      /Trouvez votre hébergement idéal/gi,
      /trpwdg\.com\/content/gi,
      /travelpayouts-widget/gi
    ];
    
    let count = 0;
    widgetPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        count += matches.length;
      }
    });
    
    console.log(`   📊 Widgets détectés: ${count}`);
    return count;
  }

  /**
   * Remplace les placeholders {{TRAVELPAYOUTS_XXX_WIDGET}} par les vrais widgets
   * NOUVELLE VERSION: Placement contextuel intelligent avec LLM
   */
  async replaceWidgetPlaceholders(content, analysis) {
    console.log('🔧 Remplacement des widgets Travelpayouts...');
    
    let updatedContent = content;
    let replacementCount = 0;

    // Détecter le contexte de l'article
    const context = this.analyzeArticleContext(content, analysis);
    
    // Vérifier s'il y a des placeholders à remplacer
    const hasPlaceholders = content.includes('{{TRAVELPAYOUTS') || content.includes('{TRAVELPAYOUTS');
    
    if (!hasPlaceholders) {
      console.log('   ℹ️ Pas de placeholders détectés, utilisation du placement intelligent\n');
      
      // Préparer les scripts de widgets (uniquement ceux qui existent réellement)
      const widgetScripts = {
        flights: this.selectBestFlightWidget(context),
        hotels: this.selectBestHotelWidget(context),
        // insurance: désactivé car pas de widgets d'assurance dans Travelpayouts
        // transport: this.selectBestTransportWidget(context)
      };
      
      // Créer un widgetPlan avec le WidgetPlanBuilder existant
      console.log('🔍 DEBUG article-finalizer: analysis.geo:', analysis.geo);
      const widgetPlan = this.widgetPlanBuilder.buildWidgetPlan(
        analysis.affiliateSlots || [],
        analysis.geo || {},
        {
          type: analysis?.type || 'Témoignage',
          destination: analysis?.destinations?.[0] || context.hasDestination || 'Asie',
          audience: analysis?.target_audience || 'Nomades digitaux'
        },
        `article_${Date.now()}`
      );
      console.log('🔍 DEBUG article-finalizer: widgetPlan.geo_defaults:', widgetPlan?.widget_plan?.geo_defaults);
      
      // Utiliser le placement contextuel intelligent AVEC VALIDATION
      const articleContext = {
        type: analysis?.type || 'Témoignage',
        destination: analysis?.destinations?.[0] || context.hasDestination || 'Asie',
        audience: analysis?.target_audience || 'Nomades digitaux'
      };
      
      const placementResult = await this.widgetPlacer.placeWidgetsIntelligently(
        updatedContent,
        articleContext,
        widgetPlan.widget_plan
      );
      
      // Compter les vrais widgets placés au lieu d'estimer
      const widgetCount = this.countActualWidgets(placementResult);
      
      return {
        content: placementResult,
        count: widgetCount
      };
    }
    
    // Sinon, remplacement classique des placeholders
    console.log('   ℹ️ Placeholders détectés, remplacement classique\n');

    // Créer un widgetPlan pour obtenir les destinations dynamiques
    const widgetPlan = this.widgetPlanBuilder.buildWidgetPlan(
      analysis.affiliateSlots || [],
      analysis.geo || {},
      {
        type: analysis?.type || 'Témoignage',
        destination: analysis?.destinations?.[0] || context.hasDestination || 'Asie',
        audience: analysis?.target_audience || 'Nomades digitaux'
      },
      `article_${Date.now()}`
    );

    // Remplacer FLIGHTS avec script dynamique
    if (updatedContent.includes('{{TRAVELPAYOUTS_FLIGHTS_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_FLIGHTS_WIDGET}')) {
      // Utiliser le script dynamique depuis widgetPlan.geo_defaults
      const dynamicFlightWidget = this.widgetPlacer.getWidgetScript('flights', widgetPlan.widget_plan);
      const flightWidget = dynamicFlightWidget || this.selectBestFlightWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_FLIGHTS_WIDGET\}\}?/g,
        flightWidget
      );
      replacementCount++;
      console.log('   ✅ Widget FLIGHTS remplacé (script dynamique)');
    }

    // Remplacer CONNECTIVITY (Airalo)
    if (updatedContent.includes('{{TRAVELPAYOUTS_CONNECTIVITY_WIDGET}}') ||
        updatedContent.includes('{TRAVELPAYOUTS_CONNECTIVITY_WIDGET}')) {
      const connectivityWidget = this.widgets.connectivity?.airalo?.esimSearch?.script || '';
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_CONNECTIVITY_WIDGET\}\}?/g,
        connectivityWidget
      );
      replacementCount++;
      console.log('   ✅ Widget CONNECTIVITY (Airalo) remplacé');
    }

    // Remplacer HOTELS
    if (updatedContent.includes('{{TRAVELPAYOUTS_HOTELS_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_HOTELS_WIDGET}')) {
      const hotelWidget = this.selectBestHotelWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_HOTELS_WIDGET\}\}?/g,
        hotelWidget
      );
      replacementCount++;
      console.log('   ✅ Widget HOTELS remplacé');
    }

    // Remplacer INSURANCE
    if (updatedContent.includes('{{TRAVELPAYOUTS_INSURANCE_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_INSURANCE_WIDGET}')) {
      const insuranceWidget = this.selectBestInsuranceWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_INSURANCE_WIDGET\}\}?/g,
        insuranceWidget
      );
      replacementCount++;
      console.log('   ✅ Widget INSURANCE remplacé');
    }

    // Remplacer PRODUCTIVITY
    if (updatedContent.includes('{{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET}')) {
      const productivityWidget = this.selectBestProductivityWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_PRODUCTIVITY_WIDGET\}\}?/g,
        productivityWidget
      );
      replacementCount++;
      console.log('   ✅ Widget PRODUCTIVITY remplacé');
    }

    // Remplacer TRANSPORT
    if (updatedContent.includes('{{TRAVELPAYOUTS_TRANSPORT_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_TRANSPORT_WIDGET}')) {
      const transportWidget = this.selectBestTransportWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_TRANSPORT_WIDGET\}\}?/g,
        transportWidget
      );
      replacementCount++;
      console.log('   ✅ Widget TRANSPORT remplacé');
    }

    // Remplacer ACTIVITIES
    if (updatedContent.includes('{{TRAVELPAYOUTS_ACTIVITIES_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_ACTIVITIES_WIDGET}')) {
      const activitiesWidget = this.selectBestActivitiesWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_ACTIVITIES_WIDGET\}\}?/g,
        activitiesWidget
      );
      replacementCount++;
      console.log('   ✅ Widget ACTIVITIES remplacé');
    }

    return {
      content: updatedContent,
      count: replacementCount
    };
  }

  /**
   * Analyse le contexte de l'article pour sélectionner les meilleurs widgets
   */
  analyzeArticleContext(content, analysis) {
    const lowerContent = content.toLowerCase();
    
    return {
      isTestimonial: analysis?.type?.includes('TEMOIGNAGE') || false,
      isGuide: lowerContent.includes('guide') || lowerContent.includes('comment'),
      isComparison: lowerContent.includes('comparaison') || lowerContent.includes('vs'),
      hasDestination: this.extractDestination(content),
      hasVisa: lowerContent.includes('visa') || lowerContent.includes('formalités'),
      hasBudget: lowerContent.includes('budget') || lowerContent.includes('coût') || lowerContent.includes('prix'),
      hasNomad: lowerContent.includes('nomade') || lowerContent.includes('digital nomad'),
      destinations: analysis?.destinations || []
    };
  }

  /**
   * Extrait la destination principale de l'article
   */
  extractDestination(content) {
    const destinations = {
      'thailand': ['thaïlande', 'thailand', 'bangkok', 'chiang mai', 'phuket'],
      'vietnam': ['vietnam', 'hanoi', 'ho chi minh', 'saigon', 'da nang'],
      'indonesia': ['indonésie', 'indonesia', 'bali', 'jakarta', 'ubud'],
      'japan': ['japon', 'japan', 'tokyo', 'kyoto', 'osaka'],
      'spain': ['espagne', 'spain', 'madrid', 'barcelona', 'valencia'],
      'portugal': ['portugal', 'lisbon', 'porto', 'lisbonne']
    };

    const lowerContent = content.toLowerCase();
    
    for (const [country, keywords] of Object.entries(destinations)) {
      if (keywords.some(keyword => lowerContent.includes(keyword))) {
        return country;
      }
    }
    
    return 'asia'; // Par défaut
  }

  /**
   * Sélectionne le meilleur widget de vols selon le contexte
   */
  selectBestFlightWidget(context) {
    const { flights } = this.widgets;

    // Si c'est un guide ou comparaison, utiliser le formulaire de recherche
    if (context.isGuide || context.isComparison) {
      return flights.kiwi.searchForm.script;
    }

    // Si c'est un témoignage, utiliser les routes populaires
    if (context.isTestimonial) {
      return flights.kiwi.popularRoutes.script;
    }

    // Par défaut, destinations populaires
    return flights.kiwi.popularDestinations.script;
  }

  /**
   * Sélectionne le meilleur widget d'hébergement selon le contexte
   */
  selectBestHotelWidget(context) {
    const { flights } = this.widgets;

    // HOTELLOOK SUPPRIMÉ - Utiliser Aviasales en remplacement
    return flights.aviasales.searchForm.script;
  }

  /**
   * Sélectionne le meilleur widget d'assurance selon le contexte
   */
  selectBestInsuranceWidget(context) {
    const { insurance } = this.widgets;

    // Si pas de widgets d'assurance disponibles, retourner un placeholder
    if (!insurance) {
      return `<!-- Widget assurance à ajouter -->`;
    }

    // Si nomade digital, utiliser SafetyWing
    if (context.hasNomad && insurance.safetyWing) {
      return insurance.safetyWing.banner?.script || `<!-- Widget SafetyWing à configurer -->`;
    }

    // Si visa, utiliser Insubuy
    if (context.hasVisa && insurance.insubuy) {
      return insurance.insubuy.banner?.script || `<!-- Widget Insubuy à configurer -->`;
    }

    // Par défaut, retourner le premier widget disponible ou placeholder
    if (insurance.safetyWing) {
      return insurance.safetyWing.banner?.script || `<!-- Widget SafetyWing à configurer -->`;
    }

    return `<!-- Widget assurance à ajouter -->`;
  }

  /**
   * Sélectionne le meilleur widget de productivité selon le contexte
   */
  selectBestProductivityWidget(context) {
    // Pour l'instant, retourner un widget générique ou vide
    // Tu peux ajouter des widgets de productivité dans la base de données
    return `<!-- Widget productivité à ajouter -->`;
  }

  /**
   * Sélectionne le meilleur widget de transport selon le contexte
   */
  selectBestTransportWidget(context) {
    const { transport } = this.widgets;

    // Si disponible, utiliser GetYourGuide pour le transport local
    if (transport && transport.getyourguide) {
      return transport.getyourguide.searchForm?.script || `<!-- Widget transport à ajouter -->`;
    }

    // Sinon, utiliser un widget de vols comme fallback
    return this.selectBestFlightWidget(context);
  }

  /**
   * Sélectionne le meilleur widget d'activités selon le contexte
   */
  selectBestActivitiesWidget(context) {
    const { activities } = this.widgets;

    // Si disponible, utiliser GetYourGuide pour les activités
    if (activities && activities.getyourguide) {
      return activities.getyourguide.searchForm?.script || `<!-- Widget activités à ajouter -->`;
    }

    // Sinon, retourner un placeholder
    return `<!-- Widget activités à ajouter -->`;
  }

  /**
   * Vérifie et améliore le quote highlight
   */
  ensureQuoteHighlight(content, analysis) {
    console.log('💬 Vérification du quote highlight...');

    // Vérifier si un quote existe déjà
    const hasQuote = content.includes('<!-- wp:pullquote') || 
                     content.includes('<blockquote class="wp-block-pullquote');

    if (hasQuote) {
      console.log('   ✅ Quote highlight déjà présent');
      return { content, hasQuote: true };
    }

    // Si pas de quote et qu'on a un témoignage Reddit, en créer un
    if (analysis?.reddit_quote && analysis?.reddit_username) {
      console.log('   ⚠️ Quote manquant - Ajout automatique');
      
      const quote = `
<!-- wp:pullquote -->
<figure class="wp-block-pullquote">
  <blockquote>
    <p>${analysis.reddit_quote}</p>
    <cite style="padding: 16px; margin-bottom: 0;">Témoignage de u/${analysis.reddit_username} sur Reddit</cite>
  </blockquote>
</figure>
<!-- /wp:pullquote -->
`;

      // Insérer après l'intro FOMO
      const introEnd = content.indexOf('</p>', content.indexOf('FlashVoyages'));
      if (introEnd > -1) {
        content = content.slice(0, introEnd + 4) + '\n' + quote + content.slice(introEnd + 4);
        console.log('   ✅ Quote ajouté après l\'intro');
        return { content, hasQuote: true };
      }
    }

    console.log('   ⚠️ Pas de quote disponible');
    return { content, hasQuote: false };
  }

  /**
   * Vérifie et améliore l'intro FOMO
   */
  ensureFomoIntro(content, analysis) {
    console.log('🔥 Vérification de l\'intro FOMO...');

    // Vérifier si une intro FOMO existe déjà
    const hasFomo = content.includes('Pendant que vous') || 
                    content.includes('FlashVoyages') ||
                    content.includes('nous avons sélectionné');

    if (hasFomo) {
      console.log('   ✅ Intro FOMO déjà présente');
      return { content, hasFomo: true };
    }

    console.log('   ⚠️ Intro FOMO manquante - Ajout automatique');

    // Créer une intro FOMO selon le type d'article
    let fomoIntro = '';
    
    if (analysis?.type?.includes('SUCCESS')) {
      fomoIntro = `<p><strong>Pendant que vous rêvez, d'autres agissent.</strong> Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui montre comment transformer sa vie de nomade digital.</p>\n\n`;
    } else if (analysis?.type?.includes('ECHEC')) {
      fomoIntro = `<p><strong>Pendant que vous hésitez, d'autres font des erreurs.</strong> Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit pour vous éviter les pièges courants.</p>\n\n`;
    } else if (analysis?.type?.includes('TRANSITION')) {
      fomoIntro = `<p><strong>Pendant que vous planifiez, d'autres sont déjà partis.</strong> Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui dévoile les étapes clés d'une transition réussie.</p>\n\n`;
    } else {
      fomoIntro = `<p><strong>Pendant que vous cherchez des informations, d'autres vivent l'expérience.</strong> Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit pour vous inspirer.</p>\n\n`;
    }

    // Insérer au début du contenu (après la source)
    const sourceEnd = content.indexOf('</p>', content.indexOf('Source :'));
    if (sourceEnd > -1) {
      content = content.slice(0, sourceEnd + 4) + '\n\n' + fomoIntro + content.slice(sourceEnd + 4);
      console.log('   ✅ Intro FOMO ajoutée');
      return { content, hasFomo: true };
    }

    console.log('   ⚠️ Impossible d\'ajouter l\'intro FOMO');
    return { content, hasFomo: false };
  }

  /**
   * Récupère l'image featured depuis Pexels
   * CORRECTION: Évite les images déjà utilisées dans d'autres articles
   */
  async getFeaturedImage(article, analysis) {
    console.log('🖼️ Recherche d\'image featured...');

    try {
      const { PEXELS_API_KEY } = await import('./config.js');
      
      if (!PEXELS_API_KEY) {
        console.log('   ⚠️ Clé Pexels non disponible');
        return null;
      }

      // CORRECTION: Charger les images déjà utilisées pour éviter les doublons
      const usedImages = await this.loadUsedPexelsImages();
      console.log(`   📋 ${usedImages.size} images déjà utilisées détectées`);

      // Construire la requête selon le contexte avec plus de variété
      const baseQueries = [
        'digital nomad working laptop',
        'remote work travel asia',
        'nomade digital coworking',
        'laptop beach sunset',
        'digital nomad lifestyle',
        'remote work coffee shop',
        'travel laptop backpack',
        'nomade digital asie'
      ];

      // Ajouter la destination si disponible
      let destination = '';
      if (analysis?.destinations && analysis.destinations.length > 0) {
        destination = analysis.destinations[0];
      }

      // Essayer plusieurs queries et pages pour trouver une image non utilisée
      let selectedImage = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (!selectedImage && attempts < maxAttempts) {
        // Sélectionner une query aléatoire
        const randomQuery = baseQueries[Math.floor(Math.random() * baseQueries.length)];
        let query = randomQuery;
        
        if (destination) {
          query += ` ${destination}`;
        }

        // Ajouter un paramètre de page aléatoire pour plus de diversité
        // Augmenter la page si on a déjà essayé plusieurs fois
        const randomPage = Math.floor(Math.random() * (3 + attempts)) + 1; // Pages 1-3, puis 1-4, etc.

        console.log(`   🔍 Query: "${query}" (page ${randomPage}, tentative ${attempts + 1}/${maxAttempts})`);

        const response = await axios.get('https://api.pexels.com/v1/search', {
          headers: { 'Authorization': PEXELS_API_KEY },
          params: {
            query,
            per_page: 20, // Plus d'images pour avoir plus de choix
            orientation: 'landscape',
            page: randomPage
          }
        });

        if (response.data.photos && response.data.photos.length > 0) {
          // Filtrer les images déjà utilisées
          const availableImages = response.data.photos.filter(photo => {
            const imageUrl = photo.src.large || photo.src.original;
            const imageId = photo.id;
            // Vérifier par URL ou ID Pexels
            return !usedImages.has(imageUrl) && !usedImages.has(imageId.toString());
          });

          if (availableImages.length > 0) {
            // Sélectionner une image aléatoire parmi celles disponibles
            const randomIndex = Math.floor(Math.random() * Math.min(availableImages.length, 10));
            selectedImage = availableImages[randomIndex];
            
            console.log(`   ✅ Image sélectionnée (${randomIndex + 1}/${availableImages.length} disponible, ${response.data.photos.length - availableImages.length} déjà utilisées): ${selectedImage.alt}`);
            
            // Stocker l'image utilisée pour éviter les futurs doublons
            await this.saveUsedPexelsImage(selectedImage);
            
            return {
              url: selectedImage.src.large,
              alt: selectedImage.alt,
              photographer: selectedImage.photographer,
              pexelsId: selectedImage.id, // Stocker l'ID Pexels pour référence future
              pexelsUrl: selectedImage.src.large
            };
          } else {
            console.log(`   ⚠️ Toutes les images de cette page sont déjà utilisées (${response.data.photos.length} images)`);
          }
        }

        attempts++;
      }

      if (!selectedImage) {
        console.log('   ⚠️ Aucune image non utilisée trouvée après plusieurs tentatives');
        // Fallback: retourner une image même si elle est déjà utilisée (mieux que pas d'image)
        console.log('   ⚠️ Utilisation d\'une image déjà utilisée (fallback)');
        const response = await axios.get('https://api.pexels.com/v1/search', {
          headers: { 'Authorization': PEXELS_API_KEY },
          params: {
            query: baseQueries[0],
            per_page: 10,
            orientation: 'landscape',
            page: Math.floor(Math.random() * 10) + 1 // Page plus élevée pour trouver des images différentes
          }
        });
        
        if (response.data.photos && response.data.photos.length > 0) {
          const randomIndex = Math.floor(Math.random() * response.data.photos.length);
          const image = response.data.photos[randomIndex];
          
          console.log(`   ✅ Image sélectionnée (fallback): ${image.alt}`);
          await this.saveUsedPexelsImage(image);
          
          return {
            url: image.src.large,
            alt: image.alt,
            photographer: image.photographer,
            pexelsId: image.id,
            pexelsUrl: image.src.large
          };
        }
      }

      console.log('   ⚠️ Aucune image trouvée');
      return null;
    } catch (error) {
      console.error('   ❌ Erreur recherche image:', error.message);
      return null;
    }
  }

  /**
   * Charge les URLs Pexels déjà utilisées depuis la base de données d'articles
   */
  async loadUsedPexelsImages() {
    const usedImages = new Set();
    
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Charger depuis articles-database.json
      const dbPath = path.join(process.cwd(), 'articles-database.json');
      if (fs.existsSync(dbPath)) {
        const dbContent = fs.readFileSync(dbPath, 'utf-8');
        const db = JSON.parse(dbContent);
        
        if (db.articles && Array.isArray(db.articles)) {
          for (const article of db.articles) {
            // Vérifier si l'article a une URL Pexels stockée
            if (article.pexels_url) {
              usedImages.add(article.pexels_url);
            }
            if (article.pexels_id) {
              usedImages.add(article.pexels_id.toString());
            }
            // Vérifier aussi dans featured_image si c'est une URL Pexels
            if (article.featured_image && article.featured_image.includes('pexels.com')) {
              usedImages.add(article.featured_image);
            }
          }
        }
      }
      
      // Charger aussi depuis un fichier dédié si existe
      const usedImagesPath = path.join(process.cwd(), 'used-pexels-images.json');
      if (fs.existsSync(usedImagesPath)) {
        const usedImagesContent = fs.readFileSync(usedImagesPath, 'utf-8');
        const usedImagesList = JSON.parse(usedImagesContent);
        if (Array.isArray(usedImagesList)) {
          usedImagesList.forEach(url => usedImages.add(url));
        }
      }
    } catch (error) {
      console.warn('   ⚠️ Erreur chargement images utilisées:', error.message);
    }
    
    return usedImages;
  }

  /**
   * Sauvegarde une URL Pexels utilisée pour éviter les doublons futurs
   */
  async saveUsedPexelsImage(image) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const usedImagesPath = path.join(process.cwd(), 'used-pexels-images.json');
      let usedImages = [];
      
      // Charger les images déjà stockées
      if (fs.existsSync(usedImagesPath)) {
        const content = fs.readFileSync(usedImagesPath, 'utf-8');
        usedImages = JSON.parse(content);
      }
      
      // Ajouter la nouvelle image (par URL et ID)
      const imageUrl = image.src.large || image.src.original;
      const imageId = image.id.toString();
      
      if (!usedImages.includes(imageUrl)) {
        usedImages.push(imageUrl);
      }
      if (!usedImages.includes(imageId)) {
        usedImages.push(imageId);
      }
      
      // Limiter à 500 images pour éviter un fichier trop gros
      if (usedImages.length > 500) {
        usedImages = usedImages.slice(-500); // Garder les 500 dernières
      }
      
      // Sauvegarder
      fs.writeFileSync(usedImagesPath, JSON.stringify(usedImages, null, 2));
      console.log(`   💾 Image sauvegardée dans used-pexels-images.json (${usedImages.length} images totales)`);
    } catch (error) {
      console.warn('   ⚠️ Erreur sauvegarde image utilisée:', error.message);
    }
  }

  /**
   * Mappe les catégories/tags vers les IDs WordPress
   */
  async getCategoriesAndTagsIds(categories, tags) {
    console.log('🏷️ Mapping des catégories et tags...');

    try {
      const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
      const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');

      // Mapping manuel pour les catégories courantes (IDs WordPress réels)
      const categoryMap = {
        'Destinations': 1, // ID réel WordPress
        'Digital Nomades Asie': 138, // ID réel WordPress
        
        // Sous-catégories de Destinations (parent: 1)
        'Vietnam': 59, // ID réel WordPress
        'Thaïlande': 60, // ID réel WordPress
        'Japon': 61, // ID réel WordPress
        'Singapour': 62, // ID réel WordPress
        'Corée du Sud': 63, // ID réel WordPress
        'Philippines': 64, // ID réel WordPress
        'Indonésie': 182, // ID réel WordPress
        
        // Autres catégories
        'Communauté & Réseau': 17,
        'Logement & Coliving': 140, // ID réel WordPress
        'Transport & Mobilité': 19,
        'Santé & Assurance': 20,
        'Finance & Fiscalité': 143, // ID réel WordPress
        'Travail & Productivité': 22,
        'Voyage & Découverte': 23,
        'Guides Pratiques': 165, // ID réel WordPress
        'Comparaisons': 167, // ID réel WordPress
        'Analyses': 168 // ID réel WordPress
      };

      // Mapping manuel pour les tags courants (IDs WordPress réels)
      const tagMap = {
        // Tags génériques
        'Asie': 172, // ID réel WordPress
        'Budget': 87, // ID réel WordPress
        'Débutant': 150, // ID réel WordPress
        
        // Tags par type de contenu
        'Témoignage': 155, // ID réel WordPress (Témoignages)
        'Témoignages': 155, // Même ID
        'Guide': 84, // ID réel WordPress
        'Guide Local': 106, // ID réel WordPress
        'Guides pratiques': 55, // ID réel WordPress
        'Nomadisme Digital': 176, // ID réel WordPress
        'Visa': 77, // ID réel WordPress
        
        // Tags par destination
        'Thaïlande': 75, // ID réel WordPress
        'Indonésie': 177, // ID réel WordPress
        'Vietnam': 95, // ID réel WordPress
        'Japon': 76, // ID réel WordPress
        
        // Tags par audience
        'communauté': 192, // ID à vérifier
        'voyage': 193, // ID à vérifier
        'travail': 194, // ID à vérifier
        'logement': 195, // ID à vérifier
        'finance': 196, // ID à vérifier
        'santé': 197, // ID à vérifier
        'transport': 198 // ID à vérifier
      };

      const categoryIds = categories
        .map(cat => categoryMap[cat])
        .filter(id => id !== undefined);

      const tagIds = tags
        .map(tag => tagMap[tag])
        .filter(id => id !== undefined);

      console.log(`   ✅ Catégories: ${categoryIds.length} IDs trouvés`);
      console.log(`   ✅ Tags: ${tagIds.length} IDs trouvés`);

      return {
        categories: categoryIds,
        tags: tagIds
      };
    } catch (error) {
      console.error('   ❌ Erreur mapping:', error.message);
      return { categories: [], tags: [] };
    }
  }
}

export default ArticleFinalizer;

