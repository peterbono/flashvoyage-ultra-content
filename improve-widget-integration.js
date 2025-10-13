/**
 * AMÉLIORATION DE L'INTÉGRATION DU WIDGET
 * Ajout d'un texte d'introduction pour le widget
 */

import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import axios from 'axios';

const ARTICLE_ID = 891;

/**
 * Widget avec texte d'introduction
 */
const improvedWidget = `
<div class="travelpayouts-widget" style="margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9; text-align: center;">
  <h3 style="margin-top: 0; color: #333; font-size: 18px;">Trouvez votre vol vers la Thaïlande</h3>
  <p style="margin-bottom: 15px; color: #666; font-size: 14px; line-height: 1.5;">
    <strong>Prêt à faire le grand saut ?</strong> Utilisez notre comparateur de vols pour trouver les meilleures offres vers Bangkok, Chiang Mai ou Phuket. 
    Que vous soyez en quête d'un vol direct depuis Paris ou d'une escale à Singapour, comparez les prix et réservez au meilleur tarif.
  </p>
  <script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&locale=fr&default_origin=PAR&default_destination=BKK&stops=any&show_hotels=true&powered_by=true&border_radius=0&plain=true&color_button=%2300A991&color_button_text=%23ffffff&promo_id=3414&campaign_id=111" charset="utf-8"></script>
  <p style="font-size: 12px; color: #999; margin-top: 10px; margin-bottom: 0;">
    Widget fourni par aviasales.com - Récompense : 40%
  </p>
</div>
`;

/**
 * Fonction principale d'amélioration
 */
async function improveWidgetIntegration() {
  console.log('🔧 AMÉLIORATION DE L\'INTÉGRATION DU WIDGET');
  console.log('=' .repeat(50));
  
  try {
    // === ÉTAPE 1 : RÉCUPÉRATION DE L'ARTICLE ===
    console.log('\n📥 ÉTAPE 1 : RÉCUPÉRATION DE L\'ARTICLE');
    console.log('-' .repeat(30));
    
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    
    const getResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${ARTICLE_ID}`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    console.log(`✅ Article récupéré : ${getResponse.data.title.rendered}`);
    
    // === ÉTAPE 2 : REMPLACEMENT DU WIDGET ===
    console.log('\n✏️ ÉTAPE 2 : AMÉLIORATION DU WIDGET');
    console.log('-' .repeat(30));
    
    const currentContent = getResponse.data.content.rendered;
    
    // Remplacer l'ancien widget par le nouveau avec texte d'introduction
    const improvedContent = currentContent.replace(
      /<div class="travelpayouts-widget"[^>]*>[\s\S]*?<\/div>/g,
      improvedWidget
    );
    
    console.log('✅ Widget amélioré :');
    console.log('   - Texte d\'introduction ajouté');
    console.log('   - Explication du comparateur');
    console.log('   - Call-to-action intégré');
    console.log('   - Design amélioré');
    
    // === ÉTAPE 3 : MISE À JOUR DE L'ARTICLE ===
    console.log('\n💾 ÉTAPE 3 : MISE À JOUR DE L\'ARTICLE');
    console.log('-' .repeat(30));
    
    const updateData = {
      content: improvedContent
    };
    
    const updateResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${ARTICLE_ID}`, updateData, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Article mis à jour avec succès !');
    console.log(`   - ID : ${updateResponse.data.id}`);
    console.log(`   - URL : ${updateResponse.data.link}`);
    console.log(`   - Date de modification : ${updateResponse.data.modified}`);
    
    // === ÉTAPE 4 : VÉRIFICATION ===
    console.log('\n🔍 ÉTAPE 4 : VÉRIFICATION');
    console.log('-' .repeat(30));
    
    const verifyResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${ARTICLE_ID}`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    const article = verifyResponse.data;
    const content = article.content.rendered;
    
    console.log('✅ Vérification terminée :');
    console.log(`   - Titre : ${article.title.rendered}`);
    console.log(`   - Statut : ${article.status}`);
    console.log(`   - Widget amélioré : ${content.includes('Prêt à faire le grand saut') ? '✅' : '❌'}`);
    console.log(`   - Partner ID : ${content.includes('463418') ? '✅' : '❌'}`);
    console.log(`   - Texte d'introduction : ${content.includes('comparateur de vols') ? '✅' : '❌'}`);
    
    return article;
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'amélioration :', error.response?.data || error.message);
    return null;
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 DÉMARRAGE DE L\'AMÉLIORATION');
  console.log('=' .repeat(50));
  
  const article = await improveWidgetIntegration();
  
  if (article) {
    console.log('\n🎉 AMÉLIORATION TERMINÉE AVEC SUCCÈS !');
    console.log(`📰 Article amélioré : ${article.link}`);
    console.log('🔧 Améliorations apportées :');
    console.log('   - Texte d\'introduction ajouté');
    console.log('   - Explication du comparateur');
    console.log('   - Call-to-action intégré');
    console.log('   - Design plus engageant');
  } else {
    console.log('\n❌ AMÉLIORATION ÉCHOUÉE');
  }
}

// Exécuter si appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { improveWidgetIntegration };
