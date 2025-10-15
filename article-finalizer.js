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

class ArticleFinalizer {
  constructor() {
    this.widgets = REAL_TRAVELPAYOUTS_WIDGETS;
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
    const widgetResult = this.replaceWidgetPlaceholders(finalContent, analysis);
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
   * Remplace les placeholders {{TRAVELPAYOUTS_XXX_WIDGET}} par les vrais widgets
   */
  replaceWidgetPlaceholders(content, analysis) {
    console.log('🔧 Remplacement des widgets Travelpayouts...');
    
    let updatedContent = content;
    let replacementCount = 0;

    // Détecter le contexte de l'article
    const context = this.analyzeArticleContext(content, analysis);

    // Remplacer FLIGHTS
    if (updatedContent.includes('{{TRAVELPAYOUTS_FLIGHTS_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_FLIGHTS_WIDGET}')) {
      const flightWidget = this.selectBestFlightWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_FLIGHTS_WIDGET\}\}?/g,
        flightWidget
      );
      replacementCount++;
      console.log('   ✅ Widget FLIGHTS remplacé');
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
    const { hotels } = this.widgets;

    // Si nomade digital, utiliser Hotellook
    if (context.hasNomad) {
      return hotels.hotellook.searchForm.script;
    }

    // Si budget/prix, utiliser Booking
    if (context.hasBudget) {
      return hotels.booking.searchForm.script;
    }

    // Par défaut, Hotellook
    return hotels.hotellook.searchForm.script;
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
   */
  async getFeaturedImage(article, analysis) {
    console.log('🖼️ Recherche d\'image featured...');

    try {
      const { PEXELS_API_KEY } = await import('./config.js');
      
      if (!PEXELS_API_KEY) {
        console.log('   ⚠️ Clé Pexels non disponible');
        return null;
      }

      // Construire la requête selon le contexte
      let query = 'digital nomad working laptop';
      
      if (analysis?.destinations) {
        const destination = analysis.destinations[0];
        if (destination) {
          query += ` ${destination}`;
        }
      }

      const response = await axios.get('https://api.pexels.com/v1/search', {
        headers: { 'Authorization': PEXELS_API_KEY },
        params: {
          query,
          per_page: 5,
          orientation: 'landscape'
        }
      });

      if (response.data.photos && response.data.photos.length > 0) {
        const image = response.data.photos[0];
        console.log(`   ✅ Image trouvée: ${image.alt}`);
        return {
          url: image.src.large,
          alt: image.alt,
          photographer: image.photographer
        };
      }

      console.log('   ⚠️ Aucune image trouvée');
      return null;
    } catch (error) {
      console.error('   ❌ Erreur recherche image:', error.message);
      return null;
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

      // Mapping manuel pour les catégories courantes
      const categoryMap = {
        'Actualités': 1,
        'Guides': 2,
        'Témoignages': 3,
        'Visa & Formalités': 4,
        'Budget & Finances': 5,
        'Destinations': 6
      };

      // Mapping manuel pour les tags courants (étendu)
      const tagMap = {
        'Actualité': 1,
        'Nouvelle': 2,
        'Tendance': 3,
        'Nomade Digital': 4,
        'Digital Nomad': 4, // Même ID que Nomade Digital
        'Visa': 6,
        'Budget': 7,
        'Débutant': 8,
        'Premier voyage': 8, // Même ID que Débutant
        'Expérimenté': 9,
        'Espagne': 10,
        'Thaïlande': 11,
        'Indonésie': 12,
        'Vietnam': 13,
        'Japon': 14,
        'Corée du Sud': 15,
        'Portugal': 16,
        'Témoignage': 17,
        'Guide': 18,
        'Conseil': 19,
        'Astuce': 20
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

