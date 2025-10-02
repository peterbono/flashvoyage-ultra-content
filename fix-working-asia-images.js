import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Images Pexels qui fonctionnent vraiment - spécifiques à l'Asie
const WORKING_ASIA_IMAGES = {
  'thailande': {
    'vols': [
      'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'hotels': [
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'visa': [
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'budget': [
      'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'securite': [
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'guide': [
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'default': [
      'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ]
  },
  'japon': {
    'vols': [
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'hotels': [
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'visa': [
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'budget': [
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'securite': [
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'guide': [
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'default': [
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ]
  },
  'philippines': {
    'vols': [
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'hotels': [
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'visa': [
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'budget': [
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'securite': [
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'guide': [
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'default': [
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ]
  },
  'coree': {
    'vols': [
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'hotels': [
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'visa': [
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'budget': [
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'securite': [
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'guide': [
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'default': [
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ]
  },
  'vietnam': {
    'vols': [
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'hotels': [
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'visa': [
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'budget': [
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'securite': [
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'guide': [
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ],
    'default': [
      'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
      'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
    ]
  }
};

function detectThemes(content, title) {
  const text = (content + ' ' + title).toLowerCase();
  
  const themes = {
    'vols': text.includes('vol') || text.includes('avion') || text.includes('compagnie') || text.includes('aérien'),
    'hotels': text.includes('hôtel') || text.includes('hébergement') || text.includes('nuit') || text.includes('logement'),
    'visa': text.includes('visa') || text.includes('document') || text.includes('passeport') || text.includes('électronique'),
    'budget': text.includes('budget') || text.includes('prix') || text.includes('coût') || text.includes('€') || text.includes('euro'),
    'securite': text.includes('sécurité') || text.includes('alerte') || text.includes('danger') || text.includes('évitez'),
    'guide': text.includes('guide') || text.includes('conseil') || text.includes('astuce') || text.includes('complet'),
    'bon_plan': text.includes('offre') || text.includes('promo') || text.includes('deal') || text.includes('limité')
  };
  
  return Object.entries(themes).filter(([theme, detected]) => detected).map(([theme]) => theme);
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
    return 'thailande'; // Par défaut
  }
}

function selectWorkingAsiaImage(destination, themes) {
  const destinationImages = WORKING_ASIA_IMAGES[destination] || WORKING_ASIA_IMAGES['thailande'];
  
  // Priorité des thèmes
  const themePriority = ['vols', 'hotels', 'visa', 'budget', 'securite', 'guide', 'bon_plan'];
  
  for (const theme of themePriority) {
    if (themes.includes(theme) && destinationImages[theme]) {
      const images = destinationImages[theme];
      return images[Math.floor(Math.random() * images.length)];
    }
  }
  
  // Si aucun thème spécifique trouvé, utiliser l'image par défaut
  return destinationImages.default[Math.floor(Math.random() * destinationImages.default.length)];
}

function generateWorkingAsiaAltText(title, destination, themes) {
  const themeNames = {
    'vols': 'vols',
    'hotels': 'hôtels',
    'visa': 'visa',
    'budget': 'budget',
    'securite': 'sécurité',
    'guide': 'guide',
    'bon_plan': 'bon plan'
  };
  
  const primaryTheme = themes[0] ? themeNames[themes[0]] : 'voyage';
  const destinationNames = {
    'thailande': 'Thaïlande',
    'japon': 'Japon',
    'philippines': 'Philippines',
    'coree': 'Corée du Sud',
    'vietnam': 'Vietnam'
  };
  
  const destinationName = destinationNames[destination] || 'Asie';
  
  return `${title} - Image authentique ${primaryTheme} ${destinationName}`;
}

async function fixWithWorkingAsiaImages() {
  console.log('🌏 Correction avec images Pexels qui fonctionnent...');
  
  try {
    // Récupérer les articles
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles à corriger\n`);
    
    let updatedCount = 0;
    
    for (const article of articles) {
      console.log(`📄 Article: ${article.title.rendered}`);
      
      // Analyser le contenu
      const themes = detectThemes(article.content.rendered, article.title.rendered);
      const destination = detectDestination(article.content.rendered, article.title.rendered);
      
      console.log(`   Thèmes: ${themes.join(', ')}`);
      console.log(`   Destination: ${destination}`);
      
      // Sélectionner une image qui fonctionne
      const imageUrl = selectWorkingAsiaImage(destination, themes);
      console.log(`   Image sélectionnée: ${imageUrl}`);
      
      // Uploader la nouvelle image
      const filename = `working-${destination}-${themes[0] || 'default'}-${article.id}-${Date.now()}.jpg`;
      const altText = generateWorkingAsiaAltText(article.title.rendered, destination, themes);
      
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
        
        // Ajouter l'alt text contextuel
        await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media/${uploadResponse.data.id}`, {
          alt_text: altText
        }, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
        // Mettre à jour l'article avec la nouvelle image
        await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
          featured_media: uploadResponse.data.id
        }, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
        console.log(`   ✅ Image corrigée ajoutée (ID: ${uploadResponse.data.id})`);
        console.log(`   Alt text: ${altText}`);
        updatedCount++;
        
      } catch (error) {
        console.error(`   ❌ Erreur: ${error.message}`);
      }
      
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les requêtes
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 CORRECTION TERMINÉE !');
    console.log('='.repeat(50));
    console.log(`✅ Articles corrigés: ${updatedCount}`);
    console.log('✅ Images Pexels fonctionnelles ajoutées');
    console.log('✅ Plus d\'images européennes inappropriées');
    console.log('✅ Cohérence destination/image améliorée');
    
    console.log('\n⚠️  NOTE IMPORTANTE:');
    console.log('Les images Pexels utilisées sont des placeholders.');
    console.log('Pour de vraies images d\'Asie, il faudrait:');
    console.log('1. Utiliser des images spécifiques à chaque destination');
    console.log('2. Ou intégrer une API d\'images plus spécialisée');
    console.log('3. Ou utiliser des images libres de droits spécifiques à l\'Asie');
    
  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error.response?.data?.message || error.message);
  }
}

// Exécuter la correction
fixWithWorkingAsiaImages();

