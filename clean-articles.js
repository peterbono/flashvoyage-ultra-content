import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

function cleanArticleContent(content) {
  let cleanedContent = content;
  
  // Supprimer l'intro FlashVoyages moche
  cleanedContent = cleanedContent.replace(
    /<div style="background: linear-gradient\(135deg, #667eea 0%, #764ba2 100%\); padding: 20px; border-radius: 10px; margin: 20px 0; color: white;">[\s\S]*?<\/div>/g,
    ''
  );
  
  // Supprimer les boîtes d'astuces
  cleanedContent = cleanedContent.replace(
    /<div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 0 10px 10px 0;">[\s\S]*?<\/div>/g,
    ''
  );
  
  // Supprimer les boîtes d'avertissement
  cleanedContent = cleanedContent.replace(
    /<div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 0 10px 10px 0;">[\s\S]*?<\/div>/g,
    ''
  );
  
  // Supprimer les CTA boxes
  cleanedContent = cleanedContent.replace(
    /<div style="background: linear-gradient\(135deg, #667eea 0%, #764ba2 100%\); padding: 25px; border-radius: 10px; margin: 30px 0; text-align: center; color: white;">[\s\S]*?<\/div>/g,
    ''
  );
  
  // Supprimer le footer FlashVoyages
  cleanedContent = cleanedContent.replace(
    /<div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 30px 0; text-align: center;">[\s\S]*?<\/div>/g,
    ''
  );
  
  // Nettoyer les images avec styles moches
  cleanedContent = cleanedContent.replace(
    /<div style="text-align: center; margin: 30px 0;">[\s\S]*?<\/div>/g,
    (match) => {
      // Garder seulement l'image, supprimer le div et le style
      const imgMatch = match.match(/<img[^>]*>/);
      if (imgMatch) {
        return imgMatch[0];
      }
      return '';
    }
  );
  
  // Nettoyer les images avec captions moches
  cleanedContent = cleanedContent.replace(
    /<p style="font-style: italic; color: #666; margin-top: 10px; font-size: 0.9em;">[\s\S]*?<\/p>/g,
    ''
  );
  
  // Supprimer les divs vides
  cleanedContent = cleanedContent.replace(/<div[^>]*>\s*<\/div>/g, '');
  
  // Supprimer les paragraphes vides
  cleanedContent = cleanedContent.replace(/<p>\s*<\/p>/g, '');
  
  // Nettoyer les espaces multiples
  cleanedContent = cleanedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return cleanedContent.trim();
}

async function cleanAllArticles() {
  console.log('🧹 Nettoyage des articles FlashVoyages...\n');
  
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
      const cleanedContent = cleanArticleContent(originalContent);
      
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
          
          console.log(`   ✅ Article nettoyé`);
          cleanedCount++;
        } catch (error) {
          console.error(`   ❌ Erreur: ${error.message}`);
        }
      } else {
        console.log(`   ⏭️  Aucun nettoyage nécessaire`);
      }
      
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les articles
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 NETTOYAGE TERMINÉ !');
    console.log('='.repeat(50));
    console.log(`✅ Articles nettoyés: ${cleanedCount}`);
    console.log('✅ Code HTML moche supprimé');
    console.log('✅ Images gardées (sans styles moches)');
    console.log('✅ Contenu propre et lisible');
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error.response?.data?.message || error.message);
  }
}

// Exécuter le nettoyage
cleanAllArticles();

