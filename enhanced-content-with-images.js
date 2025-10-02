import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

// Templates HTML avec identité graphique FlashVoyages
const CONTENT_TEMPLATES = {
  intro: `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; margin: 20px 0; color: white;">
      <h2 style="color: white; margin: 0 0 10px 0; font-size: 1.5em;">🌏 FlashVoyages</h2>
      <p style="margin: 0; font-style: italic;">Votre guide expert pour l'Asie</p>
    </div>
  `,
  
  imageSection: (imageUrl, caption, alt) => `
    <div style="text-align: center; margin: 30px 0;">
      <img src="${imageUrl}" alt="${alt}" style="width: 100%; max-width: 800px; height: auto; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <p style="font-style: italic; color: #666; margin-top: 10px; font-size: 0.9em;">${caption}</p>
    </div>
  `,
  
  tipBox: (content) => `
    <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <h3 style="color: #667eea; margin: 0 0 15px 0;">💡 Astuce FlashVoyages</h3>
      <p style="margin: 0;">${content}</p>
    </div>
  `,
  
  warningBox: (content) => `
    <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 0 10px 10px 0;">
      <h3 style="color: #856404; margin: 0 0 15px 0;">⚠️ Attention</h3>
      <p style="margin: 0;">${content}</p>
    </div>
  `,
  
  ctaBox: (content) => `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 10px; margin: 30px 0; text-align: center; color: white;">
      <h3 style="color: white; margin: 0 0 15px 0;">🚀 Prêt pour l'aventure ?</h3>
      <p style="margin: 0 0 20px 0;">${content}</p>
      <a href="https://flashvoyage.com/contact" style="background: white; color: #667eea; padding: 12px 25px; border-radius: 25px; text-decoration: none; font-weight: bold; display: inline-block;">Contactez-nous</a>
    </div>
  `,
  
  footer: `
    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 30px 0; text-align: center;">
      <h3 style="color: #667eea; margin: 0 0 15px 0;">🌏 FlashVoyages</h3>
      <p style="margin: 0 0 15px 0; color: #666;">Votre spécialiste du voyage en Asie depuis 2024</p>
      <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
        <a href="https://flashvoyage.com/guides" style="color: #667eea; text-decoration: none;">📚 Guides</a>
        <a href="https://flashvoyage.com/bons-plans" style="color: #667eea; text-decoration: none;">💰 Bons Plans</a>
        <a href="https://flashvoyage.com/actualites" style="color: #667eea; text-decoration: none;">📰 Actualités</a>
      </div>
    </div>
  `
};

// Mots-clés pour images contextuelles
const IMAGE_KEYWORDS = {
  'thailande': {
    'culture': ['thailand temple', 'bangkok culture', 'thai tradition', 'buddhist temple'],
    'nourriture': ['thai street food', 'bangkok market', 'thai cuisine', 'pad thai'],
    'paysage': ['thailand beach', 'bangkok skyline', 'thai mountains', 'thailand nature'],
    'ville': ['bangkok city', 'thailand urban', 'bangkok street', 'thai city life']
  },
  'japon': {
    'culture': ['japan temple', 'tokyo culture', 'japanese tradition', 'buddhist temple'],
    'nourriture': ['japanese food', 'tokyo street food', 'sushi', 'ramen'],
    'paysage': ['japan mountain', 'tokyo skyline', 'japanese garden', 'mount fuji'],
    'ville': ['tokyo city', 'japan urban', 'tokyo street', 'japanese city life']
  },
  'philippines': {
    'culture': ['philippines culture', 'manila culture', 'filipino tradition', 'philippines church'],
    'nourriture': ['filipino food', 'manila street food', 'philippines cuisine', 'adobo'],
    'paysage': ['philippines islands', 'manila bay', 'philippines beach', 'philippines nature'],
    'ville': ['manila city', 'philippines urban', 'manila street', 'filipino city life']
  },
  'coree': {
    'culture': ['south korea culture', 'seoul culture', 'korean tradition', 'korean palace'],
    'nourriture': ['korean food', 'seoul street food', 'korean cuisine', 'kimchi'],
    'paysage': ['south korea mountain', 'seoul skyline', 'korean landscape', 'korean nature'],
    'ville': ['seoul city', 'korea urban', 'seoul street', 'korean city life']
  },
  'vietnam': {
    'culture': ['vietnam culture', 'hanoi culture', 'vietnamese tradition', 'vietnam temple'],
    'nourriture': ['vietnamese food', 'hanoi street food', 'vietnamese cuisine', 'pho'],
    'paysage': ['vietnam landscape', 'hanoi city', 'vietnam mountains', 'vietnam nature'],
    'ville': ['hanoi city', 'vietnam urban', 'hanoi street', 'vietnamese city life']
  }
};

async function searchPexelsImage(query) {
  try {
    const response = await axios.get('https://api.pexels.com/v1/search', {
      params: {
        query: query,
        per_page: 5,
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
        alt: photo.alt || query,
        photographer: photo.photographer
      };
    }
    return null;
  } catch (error) {
    console.error(`Erreur Pexels pour "${query}":`, error.message);
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

function detectDestination(content, title) {
  const text = (content + ' ' + title).toLowerCase();
  
  if (text.includes('thailande') || text.includes('bangkok') || text.includes('thaïlande')) {
    return 'thailande';
  } else if (text.includes('japon') || text.includes('tokyo') || text.includes('japon')) {
    return 'japon';
  } else if (text.includes('philippines') || text.includes('manille')) {
    return 'philippines';
  } else if (text.includes('coree') || text.includes('séoul') || text.includes('seoul')) {
    return 'coree';
  } else if (text.includes('vietnam') || text.includes('hanoi') || text.includes('ho chi minh')) {
    return 'vietnam';
  } else {
    return 'thailande';
  }
}

function detectContentType(content) {
  const text = content.toLowerCase();
  
  if (text.includes('temple') || text.includes('culture') || text.includes('tradition')) {
    return 'culture';
  } else if (text.includes('manger') || text.includes('cuisine') || text.includes('restaurant') || text.includes('nourriture')) {
    return 'nourriture';
  } else if (text.includes('montagne') || text.includes('plage') || text.includes('nature') || text.includes('paysage')) {
    return 'paysage';
  } else if (text.includes('ville') || text.includes('rue') || text.includes('urbain') || text.includes('centre')) {
    return 'ville';
  } else {
    return 'culture'; // Par défaut
  }
}

async function enhanceArticleWithImages(article) {
  console.log(`\n📄 Amélioration: ${article.title.rendered}`);
  
  const destination = detectDestination(article.content.rendered, article.title.rendered);
  const contentType = detectContentType(article.content.rendered);
  
  console.log(`   Destination: ${destination}, Type: ${contentType}`);
  
  let enhancedContent = article.content.rendered;
  let imagesAdded = 0;
  
  // 1. Ajouter l'intro FlashVoyages
  enhancedContent = CONTENT_TEMPLATES.intro + enhancedContent;
  
  // 2. Ajouter des images contextuelles
  const imageTypes = ['culture', 'nourriture', 'paysage', 'ville'];
  
  for (const imageType of imageTypes) {
    if (imagesAdded >= 3) break; // Limiter à 3 images par article
    
    const keywords = IMAGE_KEYWORDS[destination]?.[imageType] || ['travel'];
    const query = keywords[Math.floor(Math.random() * keywords.length)];
    
    console.log(`   🔍 Recherche image ${imageType}: "${query}"`);
    
    const imageData = await searchPexelsImage(query);
    
    if (imageData) {
      const filename = `enhanced-${destination}-${imageType}-${article.id}-${Date.now()}.jpg`;
      const uploadedImage = await uploadImageToWordPress(imageData.url, filename, imageData.alt);
      
      if (uploadedImage) {
        const imageSection = CONTENT_TEMPLATES.imageSection(
          uploadedImage.source_url,
          `Image ${imageType} - ${destination}`,
          imageData.alt
        );
        
        // Insérer l'image après le premier paragraphe
        const firstParagraphEnd = enhancedContent.indexOf('</p>');
        if (firstParagraphEnd !== -1) {
          enhancedContent = enhancedContent.slice(0, firstParagraphEnd + 4) + 
                          imageSection + 
                          enhancedContent.slice(firstParagraphEnd + 4);
        }
        
        imagesAdded++;
        console.log(`   ✅ Image ${imageType} ajoutée`);
      }
    }
    
    // Pause entre les requêtes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 3. Ajouter des boîtes contextuelles
  if (article.title.rendered.includes('budget') || article.title.rendered.includes('prix')) {
    enhancedContent += CONTENT_TEMPLATES.tipBox(
      `💡 <strong>Astuce FlashVoyages :</strong> Les prix peuvent varier selon la saison. Réservez à l'avance pour les meilleures offres !`
    );
  }
  
  if (article.title.rendered.includes('sécurité') || article.title.rendered.includes('alerte')) {
    enhancedContent += CONTENT_TEMPLATES.warningBox(
      `⚠️ <strong>Important :</strong> Restez informé des dernières actualités et consultez les conseils aux voyageurs officiels.`
    );
  }
  
  if (article.title.rendered.includes('guide') || article.title.rendered.includes('astuce')) {
    enhancedContent += CONTENT_TEMPLATES.tipBox(
      `💡 <strong>Conseil d'expert :</strong> N'hésitez pas à nous contacter pour des conseils personnalisés sur votre voyage en Asie !`
    );
  }
  
  // 4. Ajouter le CTA et footer
  enhancedContent += CONTENT_TEMPLATES.ctaBox(
    `Planifiez votre voyage en ${destination.charAt(0).toUpperCase() + destination.slice(1)} avec nos experts FlashVoyages !`
  );
  
  enhancedContent += CONTENT_TEMPLATES.footer;
  
  // 5. Mettre à jour l'article
  try {
    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
      content: enhancedContent
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log(`   ✅ Article enrichi avec ${imagesAdded} images et identité graphique`);
    
  } catch (error) {
    console.error(`   ❌ Erreur mise à jour: ${error.message}`);
  }
}

async function enhanceAllArticles() {
  console.log('🎨 Amélioration des articles avec identité graphique FlashVoyages...\n');
  
  try {
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles à enrichir\n`);
    
    for (const article of articles) {
      await enhanceArticleWithImages(article);
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les articles
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n🎉 ENRICHISSEMENT TERMINÉ !');
    console.log('='.repeat(50));
    console.log('✅ Identité graphique FlashVoyages ajoutée');
    console.log('✅ Images contextuelles intégrées');
    console.log('✅ Boîtes d\'astuces et avertissements');
    console.log('✅ Call-to-action et footer');
    console.log('✅ Mise en page professionnelle');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'enrichissement:', error.response?.data?.message || error.message);
  }
}

// Exécuter l'enrichissement
enhanceAllArticles();

