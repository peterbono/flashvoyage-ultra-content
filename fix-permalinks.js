import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function fixPermalinks() {
  console.log('🔗 Correction des permalinks...\n');
  
  try {
    // 1. D'abord, mettre à jour la structure des permalinks
    console.log('⚙️ Mise à jour de la structure des permalinks...');
    
    const permalinkResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/settings`, {
      permalink_structure: '/%postname%/'
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('✅ Structure des permalinks mise à jour');
    
    // 2. Récupérer tous les articles
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles à vérifier\n`);
    
    let fixedCount = 0;
    
    for (const article of articles) {
      console.log(`📄 Article: ${article.title.rendered}`);
      console.log(`   ID: ${article.id}`);
      console.log(`   Slug actuel: ${article.slug}`);
      console.log(`   URL actuelle: ${article.link}`);
      
      // Nettoyer le slug
      let cleanSlug = article.title.rendered
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Supprimer les caractères spéciaux
        .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
        .replace(/-+/g, '-') // Supprimer les tirets multiples
        .replace(/^-|-$/g, ''); // Supprimer les tirets en début/fin
      
      // Raccourcir si trop long
      if (cleanSlug.length > 50) {
        cleanSlug = cleanSlug.substring(0, 50).replace(/-$/, '');
      }
      
      console.log(`   Slug nettoyé: ${cleanSlug}`);
      
      // Vérifier si le slug a changé
      if (cleanSlug !== article.slug) {
        try {
          // Mettre à jour l'article avec le nouveau slug
          await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
            slug: cleanSlug
          }, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          
          console.log(`   ✅ Slug corrigé`);
          fixedCount++;
          
          // Tester l'accès à la nouvelle URL
          const newUrl = `${WORDPRESS_URL}/${cleanSlug}/`;
          try {
            const testResponse = await axios.get(newUrl, { timeout: 5000 });
            if (testResponse.status === 200) {
              console.log(`   ✅ URL accessible: ${newUrl}`);
            } else {
              console.log(`   ⚠️  URL non accessible: ${newUrl}`);
            }
          } catch (error) {
            console.log(`   ⚠️  Erreur test URL: ${error.message}`);
          }
          
        } catch (error) {
          console.error(`   ❌ Erreur mise à jour: ${error.message}`);
        }
      } else {
        console.log(`   ⏭️  Slug déjà correct`);
      }
      
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les requêtes
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 CORRECTION DES PERMALINKS TERMINÉE !');
    console.log('='.repeat(50));
    console.log(`✅ Articles corrigés: ${fixedCount}`);
    console.log('✅ Slugs nettoyés et simplifiés');
    console.log('✅ Structure des permalinks mise à jour');
    console.log('✅ URLs devraient être accessibles maintenant');
    
    console.log('\n💡 Si le problème persiste :');
    console.log('1. Allez dans WordPress Admin > Réglages > Permaliens');
    console.log('2. Cliquez sur "Enregistrer les modifications"');
    console.log('3. Videz le cache si vous en avez un');
    
  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error.response?.data?.message || error.message);
  }
}

// Exécuter la correction
fixPermalinks();

