import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function checkWidgetsAndSections() {
  console.log('🔍 Vérification des widgets et sections JNews...\n');
  
  try {
    // Vérifier les widgets
    console.log('📱 Vérification des widgets...');
    const widgetsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/widgets`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    console.log(`   Widgets trouvés: ${widgetsResponse.data.length}`);
    
    // Vérifier les menus
    console.log('\n📋 Vérification des menus...');
    const menusResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/menus`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    console.log(`   Menus trouvés: ${menusResponse.data.length}`);
    
    for (const menu of menusResponse.data) {
      console.log(`   - ${menu.name} (${menu.slug})`);
    }
    
    // Vérifier les options du thème
    console.log('\n⚙️ Vérification des options du thème...');
    const optionsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/options`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    console.log(`   Options trouvées: ${Object.keys(optionsResponse.data).length}`);
    
    // Vérifier les pages
    console.log('\n📄 Vérification des pages...');
    const pagesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/pages?per_page=100`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const pages = pagesResponse.data;
    console.log(`   Pages trouvées: ${pages.length}`);
    
    for (const page of pages) {
      console.log(`   - ${page.title.rendered} (${page.slug}) - Status: ${page.status}`);
      
      // Vérifier le contenu des pages pour des sections de démo
      if (page.content.rendered.includes('Featured Stories') || 
          page.content.rendered.includes('Popular Stories') ||
          page.content.rendered.includes('Business') ||
          page.content.rendered.includes('Techno') ||
          page.content.rendered.includes('Sports')) {
        console.log(`     ⚠️  Contient du contenu de démo !`);
      }
    }
    
    // Vérifier les posts pour des sections de démo
    console.log('\n📰 Vérification des posts...');
    const postsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=any`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const posts = postsResponse.data;
    console.log(`   Posts trouvés: ${posts.length}`);
    
    for (const post of posts) {
      if (post.content.rendered.includes('Featured Stories') || 
          post.content.rendered.includes('Popular Stories') ||
          post.content.rendered.includes('Business') ||
          post.content.rendered.includes('Techno') ||
          post.content.rendered.includes('Sports')) {
        console.log(`   ⚠️  Post "${post.title.rendered}" contient du contenu de démo !`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error.response?.data?.message || error.message);
  }
}

// Exécuter la vérification
checkWidgetsAndSections();

