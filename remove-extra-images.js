import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

function removeExtraImages(content) {
  let cleanedContent = content;
  
  // Supprimer toutes les images dans le contenu (garder seulement l'image featured)
  cleanedContent = cleanedContent.replace(/<img[^>]*>/g, '');
  
  // Supprimer les divs vides qui restent
  cleanedContent = cleanedContent.replace(/<div[^>]*>\s*<\/div>/g, '');
  
  // Supprimer les paragraphes vides
  cleanedContent = cleanedContent.replace(/<p>\s*<\/p>/g, '');
  
  // Nettoyer les espaces multiples
  cleanedContent = cleanedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return cleanedContent.trim();
}

async function removeAllExtraImages() {
  console.log('🗑️ Suppression des images supplémentaires dans le contenu...\n');
  
  try {
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles à nettoyer\n`);
    
    let cleanedCount = 0;
    
    for (const article of articles) {
      console.log(`📄 Nettoyage: ${article.title.rendered}`);
      
      const originalContent = article.content.rendered;
      const cleanedContent = removeExtraImages(originalContent);
      
      // Vérifier si le contenu a changé
      if (cleanedContent !== originalContent) {
        try {
          await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
            content: cleanedContent
          }, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          
          console.log(`   ✅ Images supplémentaires supprimées`);
          cleanedCount++;
        } catch (error) {
          console.error(`   ❌ Erreur: ${error.message}`);
        }
      } else {
        console.log(`   ⏭️  Aucune image supplémentaire trouvée`);
      }
      
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les articles
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 NETTOYAGE TERMINÉ !');
    console.log('='.repeat(50));
    console.log(`✅ Articles nettoyés: ${cleanedCount}`);
    console.log('✅ Images supplémentaires supprimées');
    console.log('✅ Seule l\'image featured reste (celle du haut)');
    console.log('✅ Contenu propre et simple');
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error.response?.data?.message || error.message);
  }
}

// Exécuter le nettoyage
removeAllExtraImages();

