import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function checkArticles() {
  console.log('🔍 Vérification des articles...\n');
  
  try {
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles à vérifier\n`);
    
    for (const article of articles) {
      console.log(`📄 Article: ${article.title.rendered}`);
      console.log(`   ID: ${article.id}`);
      console.log(`   Slug: ${article.slug}`);
      console.log(`   Status: ${article.status}`);
      console.log(`   Featured Media: ${article.featured_media}`);
      
      // Vérifier le contenu
      const content = article.content.rendered;
      console.log(`   Contenu length: ${content.length} caractères`);
      
      // Vérifier les balises HTML
      const hasImages = content.includes('<img');
      const hasParagraphs = content.includes('<p>');
      const hasBreaks = content.includes('<br');
      
      console.log(`   Images: ${hasImages ? '✅' : '❌'}`);
      console.log(`   Paragraphes: ${hasParagraphs ? '✅' : '❌'}`);
      console.log(`   Sauts de ligne: ${hasBreaks ? '✅' : '❌'}`);
      
      // Vérifier les erreurs HTML
      const openP = (content.match(/<p>/g) || []).length;
      const closeP = (content.match(/<\/p>/g) || []).length;
      const openDiv = (content.match(/<div/g) || []).length;
      const closeDiv = (content.match(/<\/div>/g) || []).length;
      
      console.log(`   Balises <p>: ${openP} ouverts, ${closeP} fermés ${openP === closeP ? '✅' : '❌'}`);
      console.log(`   Balises <div>: ${openDiv} ouverts, ${closeDiv} fermés ${openDiv === closeDiv ? '✅' : '❌'}`);
      
      // Afficher un extrait du contenu
      const excerpt = content.substring(0, 200) + '...';
      console.log(`   Extrait: ${excerpt}`);
      
      console.log('   ' + '─'.repeat(50));
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error.response?.data?.message || error.message);
  }
}

checkArticles();

