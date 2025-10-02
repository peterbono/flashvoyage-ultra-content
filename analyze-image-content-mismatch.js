import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function analyzeImageContentMismatch() {
  console.log('🔍 Analyse du problème de cohérence images/contenu...');
  
  try {
    // Récupérer les articles avec leurs images
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles analysés\n`);
    
    for (const article of articles) {
      console.log(`📄 Article: ${article.title.rendered}`);
      console.log(`   ID: ${article.id}`);
      
      // Analyser le contenu pour détecter le thème
      const content = article.content.rendered.toLowerCase();
      const title = article.title.rendered.toLowerCase();
      
      // Détecter les thèmes dans le contenu
      const themes = {
        'vols': content.includes('vol') || content.includes('avion') || content.includes('compagnie'),
        'hotels': content.includes('hôtel') || content.includes('hébergement') || content.includes('nuit'),
        'visa': content.includes('visa') || content.includes('document') || content.includes('passeport'),
        'budget': content.includes('budget') || content.includes('prix') || content.includes('coût'),
        'securite': content.includes('sécurité') || content.includes('alerte') || content.includes('danger'),
        'guide': content.includes('guide') || content.includes('conseil') || content.includes('astuce'),
        'bon_plan': content.includes('offre') || content.includes('promo') || content.includes('deal')
      };
      
      const detectedThemes = Object.entries(themes).filter(([theme, detected]) => detected);
      console.log(`   Thèmes détectés: ${detectedThemes.map(([theme]) => theme).join(', ')}`);
      
      // Détecter la destination
      const destinations = {
        'thailande': title.includes('thailande') || title.includes('bangkok') || content.includes('thaïlande'),
        'japon': title.includes('japon') || title.includes('tokyo') || content.includes('japon'),
        'philippines': title.includes('philippines') || title.includes('manille') || content.includes('philippines'),
        'coree': title.includes('coree') || title.includes('séoul') || content.includes('corée'),
        'vietnam': title.includes('vietnam') || title.includes('hanoi') || content.includes('vietnam')
      };
      
      const detectedDestination = Object.entries(destinations).find(([dest, detected]) => detected);
      console.log(`   Destination: ${detectedDestination ? detectedDestination[0] : 'Non détectée'}`);
      
      // Vérifier l'image actuelle
      if (article.featured_media > 0) {
        try {
          const mediaResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/media/${article.featured_media}`, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          
          const imageUrl = mediaResponse.data.source_url;
          const imageAlt = mediaResponse.data.alt_text || 'Pas d\'alt text';
          
          console.log(`   Image actuelle: ${imageUrl}`);
          console.log(`   Alt text: ${imageAlt}`);
          
          // Analyser la cohérence
          const imageFilename = imageUrl.split('/').pop().toLowerCase();
          const isImageRelevant = detectedDestination ? 
            imageFilename.includes(detectedDestination[0]) : false;
          
          if (isImageRelevant) {
            console.log(`   ✅ Image cohérente avec la destination`);
          } else {
            console.log(`   ❌ Image potentiellement incohérente`);
          }
          
        } catch (error) {
          console.log(`   ❌ Erreur récupération image: ${error.message}`);
        }
      } else {
        console.log(`   ⚠️  Pas d'image featured`);
      }
      
      console.log('   ' + '─'.repeat(50));
    }
    
    console.log('\n🎯 PROBLÈME IDENTIFIÉ:');
    console.log('='.repeat(50));
    console.log('1. Les images Pexels sont sélectionnées aléatoirement');
    console.log('2. Pas de correspondance avec le contenu spécifique');
    console.log('3. Alt text générique, pas contextuel');
    console.log('4. Images peuvent ne pas correspondre au thème (vols, hôtels, etc.)');
    
    console.log('\n💡 SOLUTIONS PROPOSÉES:');
    console.log('='.repeat(50));
    console.log('1. Créer une base d\'images thématiques spécifiques');
    console.log('2. Améliorer la détection de thème dans le contenu');
    console.log('3. Sélectionner des images selon le thème + destination');
    console.log('4. Générer des alt text contextuels');
    console.log('5. Utiliser des mots-clés Pexels plus spécifiques');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse:', error.response?.data?.message || error.message);
  }
}

// Exécuter l'analyse
analyzeImageContentMismatch();

