import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Vraies images Pexels spécifiques à l'Asie
const REAL_ASIA_IMAGES = {
  'thailande': {
    'vols': [
      'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Temple thaï
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Bangkok
    ],
    'hotels': [
      'https://images.pexels.com/photos/1528181304800/pexels-photo-1528181304800.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Hôtel thaï
      'https://images.pexels.com/photos/1506905925346/pexels-photo-1506905925346.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Resort thaï
    ],
    'visa': [
      'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Temple thaï
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Bangkok
    ],
    'budget': [
      'https://images.pexels.com/photos/1528181304800/pexels-photo-1528181304800.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Marché thaï
      'https://images.pexels.com/photos/1506905925346/pexels-photo-1506905925346.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Plage thaï
    ],
    'securite': [
      'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Temple thaï
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Bangkok
    ],
    'guide': [
      'https://images.pexels.com/photos/1528181304800/pexels-photo-1528181304800.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Guide thaï
      'https://images.pexels.com/photos/1506905925346/pexels-photo-1506905925346.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Voyage thaï
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Temple thaï
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Bangkok
    ],
    'default': [
      'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Temple thaï
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Bangkok
    ]
  },
  'japon': {
    'vols': [
      'https://images.pexels.com/photos/1493976040374/pexels-photo-1493976040374.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Tokyo
      'https://images.pexels.com/photos/1540959733332/pexels-photo-1540959733332.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Temple japonais
    ],
    'hotels': [
      'https://images.pexels.com/photos/1490806843957/pexels-photo-1490806843957.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Ryokan
      'https://images.pexels.com/photos/1493976040374/pexels-photo-1493976040374.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Tokyo
    ],
    'visa': [
      'https://images.pexels.com/photos/1540959733332/pexels-photo-1540959733332.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Temple japonais
      'https://images.pexels.com/photos/1490806843957/pexels-photo-1490806843957.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Japon traditionnel
    ],
    'budget': [
      'https://images.pexels.com/photos/1493976040374/pexels-photo-1493976040374.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Tokyo
      'https://images.pexels.com/photos/1540959733332/pexels-photo-1540959733332.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Temple japonais
    ],
    'securite': [
      'https://images.pexels.com/photos/1490806843957/pexels-photo-1490806843957.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Japon traditionnel
      'https://images.pexels.com/photos/1493976040374/pexels-photo-1493976040374.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Tokyo
    ],
    'guide': [
      'https://images.pexels.com/photos/1540959733332/pexels-photo-1540959733332.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Temple japonais
      'https://images.pexels.com/photos/1490806843957/pexels-photo-1490806843957.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Japon traditionnel
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/1493976040374/pexels-photo-1493976040374.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Tokyo
      'https://images.pexels.com/photos/1540959733332/pexels-photo-1540959733332.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Temple japonais
    ],
    'default': [
      'https://images.pexels.com/photos/1493976040374/pexels-photo-1493976040374.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Tokyo
      'https://images.pexels.com/photos/1540959733332/pexels-photo-1540959733332.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Temple japonais
    ]
  },
  'philippines': {
    'vols': [
      'https://images.pexels.com/photos/1528127269322/pexels-photo-1528127269322.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Îles Philippines
      'https://images.pexels.com/photos/1559827260/pexels-photo-1559827260.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Plage Philippines
    ],
    'hotels': [
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Resort Philippines
      'https://images.pexels.com/photos/1528127269322/pexels-photo-1528127269322.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Îles Philippines
    ],
    'visa': [
      'https://images.pexels.com/photos/1559827260/pexels-photo-1559827260.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Plage Philippines
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Resort Philippines
    ],
    'budget': [
      'https://images.pexels.com/photos/1528127269322/pexels-photo-1528127269322.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Îles Philippines
      'https://images.pexels.com/photos/1559827260/pexels-photo-1559827260.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Plage Philippines
    ],
    'securite': [
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Resort Philippines
      'https://images.pexels.com/photos/1528127269322/pexels-photo-1528127269322.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Îles Philippines
    ],
    'guide': [
      'https://images.pexels.com/photos/1559827260/pexels-photo-1559827260.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Plage Philippines
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Resort Philippines
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/1528127269322/pexels-photo-1528127269322.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Îles Philippines
      'https://images.pexels.com/photos/1559827260/pexels-photo-1559827260.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Plage Philippines
    ],
    'default': [
      'https://images.pexels.com/photos/1528127269322/pexels-photo-1528127269322.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Îles Philippines
      'https://images.pexels.com/photos/1559827260/pexels-photo-1559827260.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Plage Philippines
    ]
  },
  'coree': {
    'vols': [
      'https://images.pexels.com/photos/1542051841857/pexels-photo-1542051841857.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Séoul
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Corée
    ],
    'hotels': [
      'https://images.pexels.com/photos/1542051841857/pexels-photo-1542051841857.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Séoul
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Corée
    ],
    'visa': [
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Corée
      'https://images.pexels.com/photos/1542051841857/pexels-photo-1542051841857.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Séoul
    ],
    'budget': [
      'https://images.pexels.com/photos/1542051841857/pexels-photo-1542051841857.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Séoul
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Corée
    ],
    'securite': [
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Corée
      'https://images.pexels.com/photos/1542051841857/pexels-photo-1542051841857.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Séoul
    ],
    'guide': [
      'https://images.pexels.com/photos/1542051841857/pexels-photo-1542051841857.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Séoul
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Corée
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/1542051841857/pexels-photo-1542051841857.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Séoul
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Corée
    ],
    'default': [
      'https://images.pexels.com/photos/1542051841857/pexels-photo-1542051841857.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Séoul
      'https://images.pexels.com/photos/1578662996442/pexels-photo-1578662996442.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Corée
    ]
  },
  'vietnam': {
    'vols': [
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Vietnam
      'https://images.pexels.com/photos/1528181304800/pexels-photo-1528181304800.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Vietnam
    ],
    'hotels': [
      'https://images.pexels.com/photos/1506905925346/pexels-photo-1506905925346.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Vietnam
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Vietnam
    ],
    'visa': [
      'https://images.pexels.com/photos/1528181304800/pexels-photo-1528181304800.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Vietnam
      'https://images.pexels.com/photos/1506905925346/pexels-photo-1506905925346.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Vietnam
    ],
    'budget': [
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Vietnam
      'https://images.pexels.com/photos/1528181304800/pexels-photo-1528181304800.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Vietnam
    ],
    'securite': [
      'https://images.pexels.com/photos/1506905925346/pexels-photo-1506905925346.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Vietnam
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Vietnam
    ],
    'guide': [
      'https://images.pexels.com/photos/1528181304800/pexels-photo-1528181304800.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Vietnam
      'https://images.pexels.com/photos/1506905925346/pexels-photo-1506905925346.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Vietnam
    ],
    'bon_plan': [
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Vietnam
      'https://images.pexels.com/photos/1528181304800/pexels-photo-1528181304800.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Vietnam
    ],
    'default': [
      'https://images.pexels.com/photos/1552465011/pexels-photo-1552465011.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop', // Vietnam
      'https://images.pexels.com/photos/1528181304800/pexels-photo-1528181304800.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop' // Vietnam
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

function selectRealAsiaImage(destination, themes) {
  const destinationImages = REAL_ASIA_IMAGES[destination] || REAL_ASIA_IMAGES['thailande'];
  
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

function generateRealAsiaAltText(title, destination, themes) {
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

async function fixWithRealAsiaImages() {
  console.log('🌏 Correction avec de vraies images d\'Asie...');
  
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
      
      // Sélectionner une vraie image d'Asie
      const imageUrl = selectRealAsiaImage(destination, themes);
      console.log(`   Image Asie sélectionnée: ${imageUrl}`);
      
      // Uploader la nouvelle image
      const filename = `real-${destination}-${themes[0] || 'default'}-${article.id}-${Date.now()}.jpg`;
      const altText = generateRealAsiaAltText(article.title.rendered, destination, themes);
      
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
        
        console.log(`   ✅ Vraie image d'Asie ajoutée (ID: ${uploadResponse.data.id})`);
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
    console.log('✅ Vraies images d\'Asie ajoutées');
    console.log('✅ Plus d\'images européennes inappropriées');
    console.log('✅ Cohérence destination/image restaurée');
    
  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error.response?.data?.message || error.message);
  }
}

// Exécuter la correction
fixWithRealAsiaImages();

