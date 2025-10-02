import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function getCurrentContent() {
  try {
    console.log('📄 Récupération du contenu actuel FlashVoyages...');
    
    // Récupérer les articles
    const postsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD },
      params: { per_page: 20, status: 'publish' }
    });
    
    console.log(`📰 Articles trouvés: ${postsResponse.data.length}`);
    console.log('='.repeat(50));
    
    postsResponse.data.forEach((post, index) => {
      console.log(`${index + 1}. ${post.title.rendered} (ID: ${post.id})`);
      console.log(`   Statut: ${post.status}`);
      console.log(`   Date: ${post.date}`);
      console.log(`   URL: ${post.link}`);
      console.log(`   Extrait: ${post.excerpt.rendered.replace(/<[^>]*>/g, '').substring(0, 100)}...`);
      console.log('');
    });
    
    // Récupérer les pages
    const pagesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/pages`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD },
      params: { per_page: 10, status: 'publish' }
    });
    
    console.log(`📄 Pages trouvées: ${pagesResponse.data.length}`);
    console.log('='.repeat(50));
    
    pagesResponse.data.forEach((page, index) => {
      console.log(`${index + 1}. ${page.title.rendered} (ID: ${page.id})`);
      console.log(`   Statut: ${page.status}`);
      console.log(`   URL: ${page.link}`);
      console.log('');
    });
    
    // Récupérer les catégories
    const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD }
    });
    
    console.log(`📂 Catégories trouvées: ${categoriesResponse.data.length}`);
    console.log('='.repeat(50));
    
    categoriesResponse.data.forEach((category, index) => {
      console.log(`${index + 1}. ${category.name} (ID: ${category.id}) - ${category.count} articles`);
    });
    
    // Récupérer les tags
    const tagsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/tags`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD },
      params: { per_page: 20 }
    });
    
    console.log(`🏷️ Tags trouvés: ${tagsResponse.data.length}`);
    console.log('='.repeat(50));
    
    tagsResponse.data.forEach((tag, index) => {
      console.log(`${index + 1}. ${tag.name} (ID: ${tag.id}) - ${tag.count} articles`);
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error.response?.data?.message || error.message);
  }
}

getCurrentContent();

