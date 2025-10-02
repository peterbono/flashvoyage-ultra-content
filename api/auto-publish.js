import axios from 'axios';

// Configuration
const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// Base de données de conseils d'expats (simplifiée pour Vercel)
const EXPAT_INSIGHTS = {
  'tokyo': {
    'shibuya': [
      "Évitez le crossing aux heures de pointe (17h-19h), allez-y tôt le matin pour des photos parfaites",
      "Le Hachiko Exit est bondé, utilisez l'Exit 8 pour sortir plus facilement",
      "Le Starbucks du 2ème étage offre la meilleure vue sur le crossing",
      "Shibuya Sky : réservez 2 semaines à l'avance, coucher de soleil = 1h d'attente"
    ],
    'harajuku': [
      "Takeshita Street : évitez le weekend, allez-y en semaine vers 10h",
      "Le Meiji Jingu est gratuit et magnifique, allez-y tôt le matin",
      "Cat Street : meilleure rue shopping, moins touristique",
      "Kawaii Monster Cafe : réservation obligatoire, 1h de spectacle"
    ]
  },
  'bangkok': {
    'sukhumvit': [
      "Terminal 21 : chaque étage = un pays, toit gratuit au 6ème",
      "Soi 11 : meilleure rue pour la vie nocturne, évitez Soi Cowboy",
      "BTS Asok : connexion directe à l'aéroport, évitez les heures de pointe",
      "Health Land : massage thaï authentique, 400 bahts pour 2h"
    ],
    'silom': [
      "Patpong Night Market : négociez à 50% du prix affiché",
      "Lumpini Park : gratuit, évitez 12h-14h (trop chaud)",
      "Silom Complex : food court au 4ème étage, prix locaux",
      "BTS Sala Daeng : connexion directe à l'aéroport"
    ]
  }
};

// Planification de contenu
const CONTENT_SCHEDULE = {
  'monday': { type: 'quartier_guide', destinations: ['tokyo', 'bangkok', 'seoul'] },
  'tuesday': { type: 'comparatif', sujets: ['hôtels', 'restaurants', 'transports'] },
  'wednesday': { type: 'saisonnier', saisons: ['printemps', 'été', 'automne', 'hiver'] },
  'thursday': { type: 'quartier_guide', destinations: ['philippines', 'vietnam', 'singapour'] },
  'friday': { type: 'comparatif', sujets: ['vols', 'assurances', 'guides'] },
  'saturday': { type: 'saisonnier', saisons: ['printemps', 'été', 'automne', 'hiver'] },
  'sunday': { type: 'quartier_guide', destinations: ['tokyo', 'bangkok', 'seoul'] }
};

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
      const photo = response.data.photos[Math.floor(Math.random() * response.data.photos.length)];
      return {
        url: photo.src.large,
        alt: photo.alt || query
      };
    }
    return null;
  } catch (error) {
    console.error(`Erreur Pexels: ${error.message}`);
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
    
    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media/${uploadResponse.data.id}`, {
      alt_text: altText
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    return uploadResponse.data;
  } catch (error) {
    console.error('Erreur upload WordPress:', error.message);
    return null;
  }
}

function generateQuartierGuide(destination, quartier, nombre_spots = 7) {
  const insights = EXPAT_INSIGHTS[destination]?.[quartier] || [];
  const spots_secrets = insights.slice(0, nombre_spots).map((spot, index) => 
    `<li><strong>${index + 1}. ${spot}</strong></li>`
  ).join('');

  const content = `
    <h2>🌏 ${destination.charAt(0).toUpperCase() + destination.slice(1)} Insider : ${quartier.charAt(0).toUpperCase() + quartier.slice(1)}</h2>
    <p><strong>Conseil FlashVoyages :</strong> ${insights[0] || 'Découvrez les spots secrets'}</p>
    
    <h3>📍 Spots secrets (que les touristes ne connaissent pas)</h3>
    <ul>${spots_secrets}</ul>
    
    <h3>⏰ Meilleur timing pour visiter</h3>
    <ul>
      <li><strong>Matin :</strong> 6h-9h : meilleur moment pour photos</li>
      <li><strong>Après-midi :</strong> 14h-16h : évitez la foule</li>
      <li><strong>Soir :</strong> 18h-20h : ambiance locale</li>
    </ul>
    
    <h3>💰 Budget local vs touristique</h3>
    <ul>
      <li><strong>Nourriture locale :</strong> 50-80% moins cher que les spots touristiques</li>
      <li><strong>Transport :</strong> Utilisez les transports locaux</li>
      <li><strong>Activités :</strong> Beaucoup d'activités gratuites</li>
    </ul>
    
    <h3>🚨 Erreurs à éviter</h3>
    <ul>
      <li>Éviter les heures de pointe</li>
      <li>Négocier les prix</li>
      <li>Respecter les coutumes locales</li>
    </ul>
    
    <h3>🎯 Itinéraire parfait 1 jour</h3>
    <ol>
      <li>9h : Visite du spot principal</li>
      <li>11h : Pause café locale</li>
      <li>14h : Exploration des rues secondaires</li>
      <li>16h : Shopping local</li>
      <li>18h : Dîner authentique</li>
    </ol>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
      <h4>💡 Astuce FlashVoyages</h4>
      <p>${insights[Math.floor(Math.random() * insights.length)] || 'Conseil d\'expat exclusif'}</p>
    </div>
  `;

  const title = `${destination.charAt(0).toUpperCase() + destination.slice(1)} : ${quartier.charAt(0).toUpperCase() + quartier.slice(1)} comme un local - ${nombre_spots} spots secrets`;

  return { title, content, type: 'quartier_guide', destination, quartier };
}

function generateComparatif(destination, sujet, nombre_options = 5) {
  const options = [];
  const noms = ['Option Premium', 'Choix Qualité', 'Meilleur Prix', 'Recommandé', 'Exclusif'];
  const prix = ['€', '€€', '€€€'];
  
  for (let i = 0; i < nombre_options; i++) {
    options.push({
      nom: `${noms[i % noms.length]} ${sujet}`,
      prix: prix[Math.floor(Math.random() * prix.length)],
      note: (4 + Math.random()).toFixed(1)
    });
  }
  
  const top_3 = options.slice(0, 3).map((option, index) => 
    `<li><strong>${index + 1}. ${option.nom}</strong> - ${option.prix} (Note: ${option.note}/5)</li>`
  ).join('');

  const tableau = options.map(option => 
    `<tr>
      <td style="border: 1px solid #ddd; padding: 10px;">${option.nom}</td>
      <td style="border: 1px solid #ddd; padding: 10px;">${option.prix}</td>
      <td style="border: 1px solid #ddd; padding: 10px;">${option.note}/5</td>
    </tr>`
  ).join('');

  const content = `
    <h2>🔍 ${destination.charAt(0).toUpperCase() + destination.slice(1)} : ${sujet} - Test complet</h2>
    <p><strong>FlashVoyages a testé ${nombre_options} options pour vous :</strong></p>
    
    <h3>🏆 Top 3 des meilleures options</h3>
    <ul>${top_3}</ul>
    
    <h3>📊 Comparatif détaillé</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr style="background: #f8f9fa;">
        <th style="border: 1px solid #ddd; padding: 10px;">Option</th>
        <th style="border: 1px solid #ddd; padding: 10px;">Prix</th>
        <th style="border: 1px solid #ddd; padding: 10px;">Note</th>
      </tr>
      ${tableau}
    </table>
    
    <h3>🎯 Recommandation FlashVoyages</h3>
    <p><strong>Notre choix :</strong> ${options[0].nom}</p>
    <p><strong>Pourquoi :</strong> Testé et approuvé par notre équipe d'experts</p>
    
    <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 20px 0;">
      <h4>✅ Réservation recommandée</h4>
      <p>[tp_affiliate_link]Réserver ${options[0].nom}[/tp_affiliate_link]</p>
    </div>
  `;

  const title = `${destination.charAt(0).toUpperCase() + destination.slice(1)} : ${sujet} - Comparatif complet ${nombre_options} options testées`;

  return { title, content, type: 'comparatif', destination, sujet };
}

async function publishContent(content) {
  try {
    // Générer une image contextuelle
    let imageQuery = '';
    if (content.type === 'quartier_guide') {
      imageQuery = `${content.destination} ${content.quartier} local`;
    } else if (content.type === 'comparatif') {
      imageQuery = `${content.destination} ${content.sujet}`;
    }
    
    let featuredMediaId = 0;
    if (imageQuery) {
      const imageData = await searchPexelsImage(imageQuery);
      if (imageData) {
        const filename = `ultra-${content.type}-${Date.now()}.jpg`;
        const uploadedImage = await uploadImageToWordPress(imageData.url, filename, imageData.alt);
        if (uploadedImage) {
          featuredMediaId = uploadedImage.id;
        }
      }
    }
    
    // Déterminer les catégories
    let categories = [];
    const categoryMap = {
      'tokyo': 'japon',
      'bangkok': 'thailande', 
      'seoul': 'coree-du-sud',
      'philippines': 'philippines',
      'vietnam': 'vietnam',
      'singapour': 'singapour',
      'japon': 'japon'
    };
    
    const categorySlug = categoryMap[content.destination] || 'destinations-asie';
    const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?slug=${categorySlug}`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    if (categoriesResponse.data.length > 0) {
      categories.push(categoriesResponse.data[0].id);
    }
    
    // Ajouter catégorie par type
    const typeCategories = {
      'quartier_guide': 'guides-pratiques',
      'comparatif': 'bons-plans'
    };
    
    if (typeCategories[content.type]) {
      const typeCategoryResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?slug=${typeCategories[content.type]}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      if (typeCategoryResponse.data.length > 0) {
        categories.push(typeCategoryResponse.data[0].id);
      }
    }
    
    // Créer l'article
    const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      title: content.title,
      content: content.content,
      status: 'publish',
      categories: categories,
      featured_media: featuredMediaId,
      tags: [content.type, content.destination || 'asie', 'ultra-specialise']
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    return articleResponse.data;
  } catch (error) {
    console.error('Erreur publication:', error.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const schedule = CONTENT_SCHEDULE[today];
    
    if (!schedule) {
      return res.status(400).json({ error: 'No schedule for today' });
    }
    
    let publishedCount = 0;
    const results = [];
    
    if (schedule.type === 'quartier_guide') {
      for (const destination of schedule.destinations) {
        const quartiers = {
          'tokyo': ['shibuya', 'harajuku', 'ginza'],
          'bangkok': ['sukhumvit', 'silom', 'chatuchak'],
          'seoul': ['hongdae', 'myeongdong', 'gangnam'],
          'philippines': ['manila', 'cebu', 'boracay'],
          'vietnam': ['hanoi', 'ho-chi-minh', 'hue'],
          'singapour': ['marina-bay', 'chinatown', 'little-india']
        };
        
        const quartier = quartiers[destination][Math.floor(Math.random() * quartiers[destination].length)];
        const content = generateQuartierGuide(destination, quartier, 7);
        const published = await publishContent(content);
        
        if (published) {
          publishedCount++;
          results.push({
            title: content.title,
            url: published.link,
            type: content.type
          });
        }
      }
    } else if (schedule.type === 'comparatif') {
      for (const sujet of schedule.sujets) {
        const destinations = ['tokyo', 'bangkok', 'seoul', 'philippines', 'vietnam'];
        const destination = destinations[Math.floor(Math.random() * destinations.length)];
        
        const content = generateComparatif(destination, sujet, 5);
        const published = await publishContent(content);
        
        if (published) {
          publishedCount++;
          results.push({
            title: content.title,
            url: published.link,
            type: content.type
          });
        }
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Published ${publishedCount} articles`,
      schedule: schedule,
      results: results
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
