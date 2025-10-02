import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function checkCategories() {
  console.log('📂 Vérification des catégories actuelles...\n');
  
  try {
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?per_page=100`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const categories = response.data;
    console.log(`📊 ${categories.length} catégories trouvées\n`);
    
    for (const category of categories) {
      console.log(`📁 ID: ${category.id}`);
      console.log(`   Nom: ${category.name}`);
      console.log(`   Slug: ${category.slug}`);
      console.log(`   Description: ${category.description || 'Aucune'}`);
      console.log(`   Nombre d'articles: ${category.count}`);
      console.log('   ' + '─'.repeat(40));
    }
    
    return categories;
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error.response?.data?.message || error.message);
    return [];
  }
}

checkCategories();

