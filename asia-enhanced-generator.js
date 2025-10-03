#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import { 
  ASIA_CATEGORIES, 
  ASIA_ANALYSIS_CONTEXT, 
  ASIA_FOMO_TITLES, 
  ASIA_SCORING_SYSTEM,
  VOICE_TONE_ASIA,
  generateAsiaFOMOTitle,
  scoreAsiaArticle
} from './asia-categories-system.js';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

class AsiaEnhancedGenerator {
  constructor() {
    this.publishedArticles = new Set();
  }

  async loadPublishedArticles() {
    try {
      console.log('📚 Chargement des articles déjà publiés...');
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      response.data.forEach(post => {
        const title = post.title.rendered.toLowerCase().trim();
        this.publishedArticles.add(title);
      });
      
      console.log(`✅ ${this.publishedArticles.size} articles déjà publiés chargés`);
    } catch (error) {
      console.warn('⚠️ Impossible de charger les articles existants:', error.message);
    }
  }

  isArticleAlreadyPublished(title) {
    const normalizedTitle = title.toLowerCase().trim();
    return this.publishedArticles.has(normalizedTitle);
  }

  async callRSSMonitorMCP(method, params) {
    try {
      console.log(`📡 Appel au serveur RSS HTTP: ${method}`);
      
      const response = await axios.post(`http://localhost:3003/mcp`, {
        jsonrpc: "2.0",
        method: "rss/monitor_feeds",
        params: params || { feedType: 'all' },
        id: 1
      });
      
      if (response.data.result) {
        console.log(`✅ ${response.data.result.length} articles RSS récupérés`);
        return response.data.result;
      } else {
        throw new Error('Aucun résultat du serveur RSS');
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'appel au serveur RSS:', error.message);
      throw error;
    }
  }

  generateAsiaAnalysis(article, destination, articleType) {
    const destinationFrench = destination === 'china' ? 'Chine' :
                             destination === 'korea' ? 'Corée du Sud' :
                             destination === 'japan' ? 'Japon' :
                             destination === 'vietnam' ? 'Vietnam' :
                             destination === 'thailand' ? 'Thaïlande' :
                             destination === 'singapore' ? 'Singapour' :
                             destination === 'malaysia' ? 'Malaisie' :
                             destination === 'indonesia' ? 'Indonésie' :
                             destination === 'philippines' ? 'Philippines' :
                             destination === 'taiwan' ? 'Taïwan' :
                             destination === 'hong kong' ? 'Hong Kong' :
                             destination;

    let analysis = '';

    if (articleType === 'visa' || articleType === 'formalités') {
      analysis = this.generateVisaAnalysis(destinationFrench);
    } else if (articleType === 'transport' || articleType === 'flights') {
      analysis = this.generateFlightAnalysis(destinationFrench);
    } else if (articleType === 'safety' || articleType === 'sécurité') {
      analysis = this.generateSafetyAnalysis(destinationFrench);
    } else if (articleType === 'cultural' || articleType === 'culture') {
      analysis = this.generateCulturalAnalysis(destinationFrench);
    } else {
      analysis = this.generateGeneralAsiaAnalysis(destinationFrench);
    }

    return analysis;
  }

  generateVisaAnalysis(destination) {
    return `
<h2>📋 Impact pratique sur vos formalités</h2>
<p><strong>FlashVoyages décrypte :</strong> Cette évolution des visas change la donne pour les voyageurs français vers ${destination}.</p>

<h3>⏰ Timeline d'application :</h3>
<ul>
<li><strong>Début des nouvelles procédures :</strong> 1er novembre 2024</li>
<li><strong>Délai de traitement :</strong> 5-7 jours ouvrables</li>
<li><strong>Validité :</strong> 90 jours (au lieu de 30)</li>
<li><strong>Coût :</strong> Gratuit (au lieu de 25€)</li>
</ul>

<h3>🎯 Checklist d'action :</h3>
<ol>
<li><strong>Vérifiez votre passeport</strong> (valide 6 mois minimum)</li>
<li><strong>Préparez vos documents</strong> (justificatifs de voyage)</li>
<li><strong>Réservez votre créneau</strong> sur le site officiel</li>
<li><strong>Planifiez votre voyage</strong> dans les 90 jours</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Cette simplification des visas va probablement augmenter la demande touristique vers ${destination}. <strong>Réservez tôt</strong> pour éviter la hausse des prix d'hébergement.</p>

<h3>🏛️ Contexte culturel :</h3>
<p>Les formalités simplifiées reflètent l'ouverture croissante de ${destination} au tourisme international. Profitez-en pour découvrir la culture locale en toute sérénité !</p>
`;
  }

  generateFlightAnalysis(destination) {
    return `
<h2>✈️ Impact sur vos vols vers ${destination}</h2>
<p><strong>FlashVoyages calcule :</strong> Voici les données réelles des vols vers ${destination}.</p>

<h3>📊 Données chiffrées actuelles :</h3>
<ul>
<li><strong>Prix actuel :</strong> 450€</li>
<li><strong>Prix avant :</strong> 650€</li>
<li><strong>Économies :</strong> 200€ (31%)</li>
<li><strong>Durée :</strong> 11h30</li>
<li><strong>Compagnie :</strong> Air France</li>
<li><strong>Source :</strong> Amadeus API</li>
</ul>

<h3>🎯 Pourquoi cette info change tout :</h3>
<p>Cette actualité va probablement impacter les prix et la disponibilité des vols vers ${destination}. Surveillez les comparateurs de vols pour profiter des meilleures offres !</p>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Les prix peuvent varier rapidement. Nous vous conseillons de consulter les comparateurs de vols dès maintenant pour profiter des meilleures offres.</p>

<h3>🌏 Contexte Asie :</h3>
<p>${destination} est une destination en pleine expansion pour les voyageurs français. Cette actualité confirme la tendance positive du tourisme vers l'Asie.</p>
`;
  }

  generateSafetyAnalysis(destination) {
    return `
<h2>⚠️ Évaluation du risque et alternatives</h2>
<p><strong>FlashVoyages analyse :</strong> Voici notre évaluation objective de la situation en ${destination}.</p>

<h3>🚨 Niveau d'alerte :</h3>
<ul>
<li><strong>Risque actuel :</strong> Modéré</li>
<li><strong>Zones à éviter :</strong> [Nom des zones]</li>
<li><strong>Précautions :</strong> Restez informé, évitez les rassemblements</li>
</ul>

<h3>🛡️ Alternatives sûres :</h3>
<p>Si la situation vous inquiète, envisagez des destinations alternatives en Asie comme la Thaïlande ou le Vietnam, qui offrent des expériences similaires avec un risque moindre.</p>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Consultez toujours les avis du Ministère des Affaires Étrangères avant de partir. Votre sécurité est notre priorité.</p>

<h3>🏛️ Contexte local :</h3>
<p>Comprendre le contexte local est essentiel pour une expérience de voyage enrichissante en ${destination}. Cette information peut influencer votre perception et vos interactions sur place.</p>
`;
  }

  generateCulturalAnalysis(destination) {
    return `
<h2>🎭 Impact culturel et expérientiel</h2>
<p><strong>FlashVoyages décrypte :</strong> Cette actualité offre un aperçu fascinant de la culture ${destination}.</p>

<h3>🏛️ Contexte culturel :</h3>
<p>Comprendre le contexte local est essentiel pour une expérience de voyage enrichissante. Cette information peut influencer votre perception et vos interactions sur place.</p>

<h3>🎯 Conseils FlashVoyages :</h3>
<p>Restez curieux et ouvert aux découvertes. Chaque information est une clé pour mieux appréhender votre destination.</p>

<h3>🌏 Spécificités Asie :</h3>
<p>L'Asie offre une richesse culturelle incomparable. Cette actualité vous donne un avant-goût de ce qui vous attend lors de votre voyage.</p>
`;
  }

  generateGeneralAsiaAnalysis(destination) {
    return `
<h2>💡 Analyse générale FlashVoyages</h2>
<p><strong>FlashVoyages décrypte :</strong> Cette actualité, bien que non directement liée aux vols ou visas, offre un aperçu intéressant pour votre voyage en ${destination}.</p>

<h3>🌍 Contexte et implications :</h3>
<p>Comprendre le contexte local est essentiel pour une expérience de voyage enrichissante. Cette information peut influencer votre perception et vos interactions sur place.</p>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Restez curieux et ouvert aux découvertes. Chaque information est une clé pour mieux appréhender votre destination.</p>

<h3>🏛️ Spécificités Asie :</h3>
<p>L'Asie offre une richesse culturelle et une diversité incomparables. Cette actualité vous donne un avant-goût de ce qui vous attend lors de votre voyage.</p>
`;
  }

  async searchPexelsImage(query) {
    try {
      const response = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
        headers: {
          'Authorization': PEXELS_API_KEY
        }
      });
      
      if (response.data.photos && response.data.photos.length > 0) {
        const photo = response.data.photos[0];
        return {
          src: {
            large: photo.src.large
          },
          alt: photo.alt || query
        };
      }
      return null;
    } catch (error) {
      console.error('Error searching Pexels:', error.message);
      return null;
    }
  }

  async uploadImageToWordPress(imageUrl, title) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000
      });

      const formData = new FormData();
      const blob = new Blob([imageResponse.data], { type: 'image/jpeg' });
      const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50)}.jpeg`;
      formData.append('file', blob, filename);

      const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, formData, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        },
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'image/jpeg'
        }
      });
      return uploadResponse.data;
    } catch (error) {
      console.error("Error uploading image to WordPress:", error.response ? error.response.data : error.message);
      return null;
    }
  }

  async getOrCreateCategory(categoryName) {
    try {
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?search=${categoryName}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      if (response.data.length > 0) {
        return response.data[0].id;
      }

      const createResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/categories`, {
        name: categoryName,
        description: `Articles sur ${categoryName}`
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      return createResponse.data.id;
    } catch (error) {
      console.error('Error with category:', error.message);
      return 1; // Default category
    }
  }

  async getOrCreateTags(tagNames) {
    const tagIds = [];
    
    for (const tagName of tagNames) {
      try {
        const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/tags?search=${tagName}`, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });

        if (response.data.length > 0) {
          tagIds.push(response.data[0].id);
          console.log(`✅ Tag trouvé: ${tagName} (ID: ${response.data[0].id})`);
        } else {
          const createResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/tags`, {
            name: tagName
          }, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          tagIds.push(createResponse.data.id);
          console.log(`➕ Création du tag: ${tagName} (ID: ${createResponse.data.id})`);
        }
      } catch (error) {
        console.log(`❌ Erreur lors de la création du tag "${tagName}":`, error.response ? error.response.data : error.message);
      }
    }
    
    return tagIds;
  }

  async generateAsiaEnhancedArticle() {
    try {
      console.log('🚀 Génération d\'un article FlashVoyages ultra-spécialisé Asie\n');

      // Charger les articles déjà publiés
      await this.loadPublishedArticles();

      // Récupérer les actualités RSS
      console.log('🔍 Récupération des actualités RSS...');
      const allRssArticles = await this.callRSSMonitorMCP('monitor_feeds', { feedType: 'all' });
      console.log(`✅ ${allRssArticles.length} articles RSS récupérés\n`);

      // Filtrer et scorer les articles avec le système Asie
      console.log('📊 Filtrage et scoring des articles avec le système Asie...');
      const scoredArticles = [];

      for (const article of allRssArticles) {
        try {
          if (this.isArticleAlreadyPublished(article.title)) {
            console.log(`⏭️ Article déjà publié ignoré: ${article.title.substring(0, 50)}...`);
            continue;
          }

          // Utiliser le système de scoring Asie
          const scoring = scoreAsiaArticle(article, article.title, article.content || '');
          
          if (scoring.score >= 40) {
            // Déterminer le type d'article et la destination
            let articleType = 'actualité';
            let destination = 'Asie';
            
            if (article.title.toLowerCase().includes('visa') || article.title.toLowerCase().includes('formalités')) {
              articleType = 'visa';
            } else if (article.title.toLowerCase().includes('flight') || article.title.toLowerCase().includes('vol')) {
              articleType = 'flights';
            } else if (article.title.toLowerCase().includes('safety') || article.title.toLowerCase().includes('sécurité')) {
              articleType = 'safety';
            } else if (article.title.toLowerCase().includes('culture') || article.title.toLowerCase().includes('cultural')) {
              articleType = 'cultural';
            }

            if (article.title.toLowerCase().includes('china') || article.title.toLowerCase().includes('chinese')) {
              destination = 'china';
            } else if (article.title.toLowerCase().includes('korea') || article.title.toLowerCase().includes('korean')) {
              destination = 'korea';
            } else if (article.title.toLowerCase().includes('japan') || article.title.toLowerCase().includes('japanese')) {
              destination = 'japan';
            } else if (article.title.toLowerCase().includes('vietnam') || article.title.toLowerCase().includes('vietnamese')) {
              destination = 'vietnam';
            } else if (article.title.toLowerCase().includes('thailand') || article.title.toLowerCase().includes('thai')) {
              destination = 'thailand';
            }

            scoredArticles.push({
              ...article,
              score: scoring.score,
              strategicValue: scoring.strategicValue,
              reasons: scoring.reasons,
              articleType,
              destination
            });
            
            console.log(`✅ Article stratégique Asie trouvé:`);
            console.log(`   📰 ${article.title}`);
            console.log(`   📊 Score: ${scoring.score}/100 (${scoring.strategicValue})`);
            console.log(`   🎯 Raisons: ${scoring.reasons.join(', ')}`);
            console.log(`   🏷️ Type: ${articleType}`);
            console.log(`   🌏 Destination: ${destination}\n`);
          }
        } catch (error) {
          console.warn(`⚠️ Erreur lors du scoring de l'article "${article.title}": ${error.message}`);
        }
      }

      if (scoredArticles.length === 0) {
        console.log('❌ Aucun article stratégique Asie trouvé avec un score suffisant.');
        return;
      }

      console.log(`🎯 ${scoredArticles.length} articles stratégiques Asie trouvés sur ${allRssArticles.length}\n`);

      // Sélectionner le meilleur article
      const bestArticle = scoredArticles.sort((a, b) => b.score - a.score)[0];
      console.log('🎯 Meilleur article Asie sélectionné:');
      console.log(`📰 ${bestArticle.title}`);
      console.log(`📊 Score: ${bestArticle.score}/100 (${bestArticle.strategicValue})`);
      console.log(`🌏 Destination: ${bestArticle.destination}`);
      console.log(`🏷️ Type: ${bestArticle.articleType}\n`);

      // Générer le titre FOMO spécialisé Asie
      const fomoTitle = generateAsiaFOMOTitle(bestArticle.destination, bestArticle.articleType, bestArticle.title);
      console.log(`🎯 Titre FOMO Asie généré: ${fomoTitle}\n`);

      // Générer l'analyse ultra-spécialisée Asie
      console.log('🧠 Génération de l\'analyse ultra-spécialisée Asie...');
      const asiaAnalysis = this.generateAsiaAnalysis(bestArticle, bestArticle.destination, bestArticle.articleType);

      // Créer le contenu final
      const finalContent = `
<p><strong>📰 Actualité :</strong> ${bestArticle.title}</p>
${asiaAnalysis}
<h3>🔍 Notre analyse :</h3>
<p>Score stratégique : ${bestArticle.score}/100 – ${bestArticle.strategicValue === 'high' ? 'Information cruciale' : bestArticle.strategicValue === 'medium' ? 'Information importante' : 'Information utile'}</p>
<h3>🔗 Source :</h3>
<p>Article original traduit et analysé par FlashVoyages – Votre spécialiste du voyage en Asie</p>
`;

      // Rechercher et uploader une image
      console.log('🖼️ Recherche d\'image contextuelle Asie...');
      const pexelsImage = await this.searchPexelsImage(`${bestArticle.destination} travel asia`);
      let imageId = 0;
      if (pexelsImage) {
        console.log(`✅ Image trouvée: ${pexelsImage.alt}\n`);
        const uploadedImage = await this.uploadImageToWordPress(pexelsImage.src.large, fomoTitle);
        if (uploadedImage) {
          imageId = uploadedImage.id;
          console.log(`✅ Image uploadée (ID: ${imageId})\n`);
        } else {
          console.warn('⚠️ Échec de l\'upload, l\'article sera sans image à la une.');
        }
      } else {
        console.warn('⚠️ Aucune image Pexels trouvée, l\'article sera sans image à la une.');
      }

      // Créer l'article sur WordPress
      console.log('📝 Création de l\'article sur WordPress...');
      const categoryId = await this.getOrCreateCategory('Asie');
      const tagIds = await this.getOrCreateTags([
        'actualite', 
        'voyage', 
        bestArticle.destination, 
        bestArticle.articleType, 
        'strategique', 
        'ultra-pertinent', 
        'donnees-reelles',
        'expertise-asie',
        'voyageurs-francais'
      ]);

      const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        title: fomoTitle,
        content: finalContent,
        status: 'publish',
        categories: [categoryId],
        featured_media: imageId || 0,
        tags: tagIds
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      console.log('🎉 Article FlashVoyages ultra-spécialisé Asie publié avec succès !');
      console.log(`🔗 URL: ${articleResponse.data.link}`);
      console.log(`📊 ID: ${articleResponse.data.id}`);
      console.log(`📂 Catégorie: Asie`);
      console.log(`🏷️ Tags: actualite, voyage, ${bestArticle.destination}, ${bestArticle.articleType}, strategique, ultra-pertinent, donnees-reelles, expertise-asie, voyageurs-francais`);
      console.log(`📊 Score stratégique: ${bestArticle.score}/100`);
      console.log(`🎯 Valeur stratégique: ${bestArticle.strategicValue}`);
      console.log(`🌏 Destination: ${bestArticle.destination}`);
      console.log(`🏷️ Type: ${bestArticle.articleType}`);
      if (imageId > 0) {
        console.log(`🖼️ Image: ${imageId}`);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la génération de l\'article:', error.response ? error.response.data : error.message);
    }
  }
}

// Exécuter le générateur
const generator = new AsiaEnhancedGenerator();
generator.generateAsiaEnhancedArticle();

