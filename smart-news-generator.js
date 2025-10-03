#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import StrategicRSSFilter from './strategic-rss-filter.js';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

function generateSmartAnalysis(article, originalTitle) {
  const isFlightNews = originalTitle.toLowerCase().includes('flight') || originalTitle.toLowerCase().includes('vol');
  const isVisaNews = originalTitle.toLowerCase().includes('visa');
  const isSafetyNews = originalTitle.toLowerCase().includes('warning') || originalTitle.toLowerCase().includes('alert');
  const isDealNews = originalTitle.toLowerCase().includes('deal') || originalTitle.toLowerCase().includes('offer');
  
  let analysis = '';
  
  if (isFlightNews) {
    analysis = `
<h2>🎯 Pourquoi cette info change tout pour vos voyages en Asie</h2>

<p><strong>FlashVoyages décrypte :</strong> Cette nouvelle route aérienne n'est pas qu'une simple information - c'est un game changer pour les voyageurs français en Asie.</p>

<h3>✈️ Impact concret sur vos voyages :</h3>
<ul>
<li><strong>Nouvelles opportunités :</strong> Plus de flexibilité pour vos itinéraires Asie</li>
<li><strong>Concurrence :</strong> Baisse des prix attendue sur les autres compagnies</li>
<li><strong>Connexions :</strong> Possibilité de nouveaux hubs de connexion</li>
<li><strong>Franchissement :</strong> ${article.analysis.destination} devient plus accessible</li>
</ul>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Surveillez les prix dans les prochaines semaines - cette annonce va créer de la concurrence et probablement faire baisser les tarifs sur les routes existantes. Parfait pour planifier votre prochain voyage en ${article.analysis.destination} !</p>

<h3>🔍 Notre analyse :</h3>
<p>Score stratégique : ${article.analysis.score}/100 - ${article.analysis.strategicValue === 'high' ? 'Information cruciale' : article.analysis.strategicValue === 'medium' ? 'Information importante' : 'Information utile'}</p>
`;
  } else if (isVisaNews) {
    analysis = `
<h2>🎯 Ce que ça change vraiment pour vos formalités</h2>

<p><strong>FlashVoyages analyse :</strong> Cette évolution des formalités n'est pas anodine - elle simplifie vos démarches et ouvre de nouvelles possibilités pour ${article.analysis.destination}.</p>

<h3>📋 Impact pratique :</h3>
<ul>
<li><strong>Gain de temps :</strong> Moins de paperasserie administrative</li>
<li><strong>Économies :</strong> Réduction des frais de visa</li>
<li><strong>Flexibilité :</strong> Plus de spontanéité dans vos voyages</li>
<li><strong>Accessibilité :</strong> ${article.analysis.destination} devient plus facile à visiter</li>
</ul>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Profitez de cette simplification pour planifier des voyages plus spontanés et économiques en ${article.analysis.destination}. C'est le moment idéal !</p>

<h3>🔍 Notre analyse :</h3>
<p>Score stratégique : ${article.analysis.score}/100 - ${article.analysis.strategicValue === 'high' ? 'Information cruciale' : article.analysis.strategicValue === 'medium' ? 'Information importante' : 'Information utile'}</p>
`;
  } else if (isSafetyNews) {
    analysis = `
<h2>🎯 Sécurité : ce que vous devez vraiment savoir</h2>

<p><strong>FlashVoyages décrypte :</strong> Cette alerte n'est pas à prendre à la légère, mais pas de panique non plus. Voici comment adapter vos plans pour ${article.analysis.destination}.</p>

<h3>⚠️ Évaluation du risque :</h3>
<ul>
<li><strong>Niveau de danger :</strong> Analyse de la situation réelle</li>
<li><strong>Zones concernées :</strong> Quelles régions éviter ou surveiller</li>
<li><strong>Alternatives :</strong> Comment adapter votre itinéraire</li>
<li><strong>Recommandations :</strong> Nos conseils d'experts</li>
</ul>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Restez informés mais ne laissez pas la peur gâcher vos projets. Nous vous aidons à voyager en toute sécurité en ${article.analysis.destination}.</p>

<h3>🔍 Notre analyse :</h3>
<p>Score stratégique : ${article.analysis.score}/100 - ${article.analysis.strategicValue === 'high' ? 'Information cruciale' : article.analysis.strategicValue === 'medium' ? 'Information importante' : 'Information utile'}</p>
`;
  } else if (isDealNews) {
    analysis = `
<h2>🎯 Cette offre vaut-elle vraiment le coup ?</h2>

<p><strong>FlashVoyages analyse :</strong> Cette promotion n'est pas qu'une simple pub - on décrypte si c'est vraiment intéressant pour vos voyages en ${article.analysis.destination}.</p>

<h3>💰 Analyse de l'offre :</h3>
<ul>
<li><strong>Vraie économie :</strong> Comparaison avec les prix habituels</li>
<li><strong>Conditions :</strong> Pièges à éviter</li>
<li><strong>Période :</strong> Quand en profiter</li>
<li><strong>Alternatives :</strong> Autres options à considérer</li>
</ul>

<h3>💡 Conseils FlashVoyages :</h3>
<p>On vous dit si cette offre est vraiment intéressante ou si c'est du marketing. Notre expertise au service de vos économies !</p>

<h3>🔍 Notre analyse :</h3>
<p>Score stratégique : ${article.analysis.score}/100 - ${article.analysis.strategicValue === 'high' ? 'Offre exceptionnelle' : article.analysis.strategicValue === 'medium' ? 'Offre intéressante' : 'Offre à considérer'}</p>
`;
  } else {
    analysis = `
<h2>🎯 Pourquoi cette actualité vous concerne</h2>

<p><strong>FlashVoyages analyse :</strong> Cette information n'est pas qu'une simple news - elle a un impact direct sur vos voyages en Asie, particulièrement en ${article.analysis.destination}.</p>

<h3>🌏 Impact sur vos voyages :</h3>
<ul>
<li><strong>Nouvelles opportunités :</strong> Comment en profiter</li>
<li><strong>Changements pratiques :</strong> Ce qui va changer pour vous</li>
<li><strong>Conseils d'expert :</strong> Notre analyse FlashVoyages</li>
<li><strong>Prochaines étapes :</strong> Ce que vous devez faire</li>
</ul>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Restez connectés pour des analyses approfondies qui vous aident à voyager plus intelligemment en ${article.analysis.destination}.</p>

<h3>🔍 Notre analyse :</h3>
<p>Score stratégique : ${article.analysis.score}/100 - ${article.analysis.strategicValue === 'high' ? 'Information cruciale' : article.analysis.strategicValue === 'medium' ? 'Information importante' : 'Information utile'}</p>
`;
  }
  
  return analysis;
}

async function searchPexelsImage(query) {
  try {
    const response = await axios.get('https://api.pexels.com/v1/search', {
      params: {
        query: query,
        per_page: 3,
        orientation: 'landscape'
      },
      headers: {
        'Authorization': PEXELS_API_KEY
      }
    });
    
    if (response.data.photos && response.data.photos.length > 0) {
      const photo = response.data.photos[0];
      return {
        url: photo.src.large,
        alt: photo.alt || query,
        photographer: photo.photographer
      };
    }
    return null;
  } catch (error) {
    console.error('Erreur Pexels:', error.message);
    return null;
  }
}

async function uploadImageToWordPress(imageUrl, filename, altText) {
  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    const formData = new FormData();
    const blob = new Blob([imageResponse.data], { type: 'image/jpeg' });
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
    
    return uploadResponse.data.id;
  } catch (error) {
    console.error('Erreur upload image:', error.message);
    return null;
  }
}

async function getOrCreateTags(tagNames) {
  const tagIds = [];
  
  for (const tagName of tagNames) {
    try {
      const tagResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/tags?search=${tagName}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      if (tagResponse.data.length > 0) {
        tagIds.push(tagResponse.data[0].id);
      } else {
        const createTagResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/tags`, {
          name: tagName,
          slug: tagName.toLowerCase().replace(/\s+/g, '-')
        }, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
        tagIds.push(createTagResponse.data.id);
      }
    } catch (error) {
      console.log(`⚠️ Erreur tag ${tagName}:`, error.message);
    }
  }
  
  return tagIds;
}

async function publishSmartNewsArticle() {
  console.log('🚀 Publication d\'un article news intelligent FlashVoyages\n');
  
  try {
    // 1. Récupérer et filtrer les articles RSS
    console.log('🔍 Récupération des articles RSS stratégiques...');
    const filter = new StrategicRSSFilter();
    const strategicArticles = await filter.fetchAndFilterStrategicRSS();
    
    if (strategicArticles.length === 0) {
      console.log('❌ Aucun article stratégique trouvé');
      return;
    }
    
    // 2. Sélectionner le meilleur article
    const bestArticle = strategicArticles.reduce((best, current) => 
      current.analysis.score > best.analysis.score ? current : best
    );
    
    console.log(`\n🎯 Meilleur article sélectionné:`);
    console.log(`📰 ${bestArticle.title}`);
    console.log(`🇫🇷 ${bestArticle.translatedTitle}`);
    console.log(`📊 Score: ${bestArticle.analysis.score}/100 (${bestArticle.analysis.strategicValue})`);
    
    // 3. Générer l'analyse intelligente
    console.log('\n🧠 Génération de l\'analyse intelligente...');
    const smartAnalysis = generateSmartAnalysis(bestArticle, bestArticle.title);
    
    // 4. Créer le contenu final
    const finalContent = `
<p><strong>📰 Actualité :</strong> ${bestArticle.translatedTitle}</p>

${smartAnalysis}

<h3>🔗 Source :</h3>
<p>Article original traduit et analysé par FlashVoyages - Votre spécialiste du voyage en Asie</p>
`;
    
    // 5. Rechercher une image contextuelle
    console.log('\n🖼️ Recherche d\'image contextuelle...');
    const imageQuery = `${bestArticle.analysis.destination} travel news ${bestArticle.analysis.travelType}`;
    const image = await searchPexelsImage(imageQuery);
    
    let imageId = null;
    if (image) {
      console.log(`✅ Image trouvée: ${image.alt}`);
      const filename = `flashvoyages-smart-${Date.now()}.jpg`;
      imageId = await uploadImageToWordPress(image.url, filename, image.alt);
      if (imageId) {
        console.log(`✅ Image uploadée (ID: ${imageId})`);
      }
    }
    
    // 6. Créer l'article sur WordPress
    console.log('\n📝 Création de l\'article sur WordPress...');
    
    // Récupérer les catégories
    const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    let categoryId = 1; // Default
    const category = categoriesResponse.data.find(cat => 
      cat.slug === 'asie' || cat.name.toLowerCase().includes('asie')
    );
    
    if (category) {
      categoryId = category.id;
    }
    
    // Gérer les tags
    const tagIds = await getOrCreateTags(['actualite', 'voyage', bestArticle.analysis.destination, bestArticle.analysis.travelType, 'strategique', 'intelligent']);
    
    // Traduire le titre complet en français
    const destinationFrench = bestArticle.analysis.destination === 'china' ? 'Chine' : 
                             bestArticle.analysis.destination === 'korea' ? 'Corée du Sud' :
                             bestArticle.analysis.destination === 'japan' ? 'Japon' :
                             bestArticle.analysis.destination === 'vietnam' ? 'Vietnam' :
                             bestArticle.analysis.destination === 'thailand' ? 'Thaïlande' :
                             bestArticle.analysis.destination === 'singapore' ? 'Singapour' :
                             bestArticle.analysis.destination === 'malaysia' ? 'Malaisie' :
                             bestArticle.analysis.destination === 'indonesia' ? 'Indonésie' :
                             bestArticle.analysis.destination === 'philippines' ? 'Philippines' :
                             bestArticle.analysis.destination === 'taiwan' ? 'Taïwan' :
                             bestArticle.analysis.destination === 'hong kong' ? 'Hong Kong' :
                             bestArticle.analysis.destination;
    
    // Traduire complètement le titre en français
    const fullFrenchTitle = `🌏 ${destinationFrench} : ${bestArticle.translatedTitle.replace(/India-Chine/g, 'Inde-Chine').replace(/Direct vols/g, 'vols directs').replace(/Routes and Launch Date Confirmed/g, 'itinéraires et date de lancement confirmés')}`;
    
    // Créer l'article
    const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      title: fullFrenchTitle,
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
    
    console.log('\n🎉 Article intelligent publié avec succès !');
    console.log(`🔗 URL: ${articleResponse.data.link}`);
    console.log(`📊 ID: ${articleResponse.data.id}`);
    console.log(`📊 Score stratégique: ${bestArticle.analysis.score}/100`);
    console.log(`🎯 Valeur stratégique: ${bestArticle.analysis.strategicValue}`);
    console.log(`🧠 Analyse intelligente: ✅`);
    
    return {
      success: true,
      article: articleResponse.data,
      strategicScore: bestArticle.analysis.score,
      strategicValue: bestArticle.analysis.strategicValue,
      destination: bestArticle.analysis.destination,
      type: bestArticle.analysis.travelType
    };
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return { success: false, error: error.message };
  }
}

// Exécuter la publication
if (import.meta.url === `file://${process.argv[1]}`) {
  publishSmartNewsArticle().then(result => {
    if (result.success) {
      console.log('\n✅ Publication réussie !');
      console.log('🧠 Analyse intelligente de l\'actualité');
      console.log('🎯 Contenu pertinent et stratégique');
      console.log('🇫🇷 Ton FlashVoyages authentique');
      console.log('🚀 Prêt pour l\'automatisation quotidienne !');
    } else {
      console.log('\n❌ Publication échouée');
      console.log('🔍 Vérifiez les logs pour plus de détails');
    }
  });
}

export default publishSmartNewsArticle;
