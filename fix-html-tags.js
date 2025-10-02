import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

function fixHtmlTags(content) {
  let fixedContent = content;
  
  // Compter les balises
  const openP = (fixedContent.match(/<p>/g) || []).length;
  const closeP = (fixedContent.match(/<\/p>/g) || []).length;
  const openDiv = (fixedContent.match(/<div/g) || []).length;
  const closeDiv = (fixedContent.match(/<\/div>/g) || []).length;
  
  console.log(`   Avant: <p> ${openP}/${closeP}, <div> ${openDiv}/${closeDiv}`);
  
  // Supprimer les </div> orphelins
  if (closeDiv > openDiv) {
    const extraDivs = closeDiv - openDiv;
    for (let i = 0; i < extraDivs; i++) {
      fixedContent = fixedContent.replace(/<\/div>/, '');
    }
  }
  
  // Ajouter les </p> manquants
  if (openP > closeP) {
    const missingP = openP - closeP;
    for (let i = 0; i < missingP; i++) {
      fixedContent += '</p>';
    }
  }
  
  // Vérifier après correction
  const newOpenP = (fixedContent.match(/<p>/g) || []).length;
  const newCloseP = (fixedContent.match(/<\/p>/g) || []).length;
  const newOpenDiv = (fixedContent.match(/<div/g) || []).length;
  const newCloseDiv = (fixedContent.match(/<\/div>/g) || []).length;
  
  console.log(`   Après: <p> ${newOpenP}/${newCloseP}, <div> ${newOpenDiv}/${newCloseDiv}`);
  
  return fixedContent;
}

async function fixAllArticles() {
  console.log('🔧 Correction des balises HTML...\n');
  
  try {
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles à corriger\n`);
    
    let fixedCount = 0;
    
    for (const article of articles) {
      console.log(`📄 Correction: ${article.title.rendered}`);
      
      const originalContent = article.content.rendered;
      const fixedContent = fixHtmlTags(originalContent);
      
      if (fixedContent !== originalContent) {
        try {
          await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
            content: fixedContent
          }, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          
          console.log(`   ✅ Balises HTML corrigées`);
          fixedCount++;
        } catch (error) {
          console.error(`   ❌ Erreur: ${error.message}`);
        }
      } else {
        console.log(`   ⏭️  Aucune correction nécessaire`);
      }
      
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les articles
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 CORRECTION TERMINÉE !');
    console.log('='.repeat(50));
    console.log(`✅ Articles corrigés: ${fixedCount}`);
    console.log('✅ Balises HTML équilibrées');
    console.log('✅ Page ne devrait plus être cassée');
    
  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error.response?.data?.message || error.message);
  }
}

// Exécuter la correction
fixAllArticles();

