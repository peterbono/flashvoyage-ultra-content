/**
 * MISE À JOUR DE L'ARTICLE AVEC LES VRAIS WIDGETS TRAVELPAYOUTS
 * Utilise la base de données réelle basée sur le CSV fourni
 */

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import { RealTravelpayoutsWidgetSelector } from './travelpayouts-real-widgets-database.js';

// Article ID à mettre à jour
const ARTICLE_ID = 879;

/**
 * Met à jour l'article avec les vrais widgets Travelpayouts
 */
async function updateArticleWithRealWidgets() {
  try {
    console.log('🔄 Mise à jour de l\'article avec les vrais widgets Travelpayouts...');
    
    // Initialiser le sélecteur de widgets
    const widgetSelector = new RealTravelpayoutsWidgetSelector();
    
    // Analyser le contenu de l'article pour sélectionner le bon widget
    const articleContent = `
      Comment Paul a doublé ses revenus en Thaïlande : une transformation complète
      
      Paul, un développeur français de 28 ans, a complètement transformé sa vie en s'installant en Thaïlande. 
      Après 3 ans de nomadisme digital, il a non seulement doublé ses revenus mais aussi découvert une nouvelle façon de vivre.
      
      Son parcours commence par un vol Paris-Bangkok qu'il a réservé il y a 3 ans. 
      Il cherchait un hébergement abordable et a trouvé un coliving parfait pour son budget.
      
      Aujourd'hui, il travaille depuis des espaces de coworking à Bangkok et voyage régulièrement en Asie du Sud-Est.
    `;
    
    // Sélectionner le widget le plus pertinent
    const selectedWidget = widgetSelector.selectWidget(articleContent, 'temoignage', 'thailande');
    
    console.log('🎯 Widget sélectionné:', selectedWidget.widget.type);
    console.log('📊 Récompense:', selectedWidget.widget.reward);
    console.log('💡 Raison:', selectedWidget.reason);
    
    // Créer le nouveau contenu avec le widget sélectionné
    const newContent = `
      <h2>Comment Paul a doublé ses revenus en Thaïlande : une transformation complète</h2>
      
      <p><strong>Paul, un développeur français de 28 ans, a complètement transformé sa vie en s'installant en Thaïlande.</strong> Après 3 ans de nomadisme digital, il a non seulement doublé ses revenus mais aussi découvert une nouvelle façon de vivre.</p>
      
      <h3>🚀 Le déclic : un vol Paris-Bangkok qui a tout changé</h3>
      <p>Son parcours commence par un vol Paris-Bangkok qu'il a réservé il y a 3 ans. "J'avais toujours rêvé de découvrir l'Asie, mais je ne savais pas par où commencer", confie Paul.</p>
      
      <h3>🏠 Trouver son premier hébergement en Thaïlande</h3>
      <p>Il cherchait un hébergement abordable et a trouvé un coliving parfait pour son budget. "Le coliving m'a permis de rencontrer d'autres nomades digitaux dès mon arrivée", explique-t-il.</p>
      
      <h3>💼 L'évolution professionnelle</h3>
      <p>Aujourd'hui, il travaille depuis des espaces de coworking à Bangkok et voyage régulièrement en Asie du Sud-Est. "Mon salaire a doublé grâce aux opportunités que j'ai trouvées ici", révèle Paul.</p>
      
      <h3>🎯 Ses conseils pour les futurs nomades</h3>
      <ul>
        <li>Commencez par réserver votre vol avec une compagnie fiable</li>
        <li>Prévoyez un hébergement temporaire pour les premiers jours</li>
        <li>Rejoignez des communautés de nomades digitaux</li>
        <li>Investissez dans une bonne connexion internet</li>
      </ul>
      
      <h3>🔗 Ressources utiles</h3>
      <p>Pour planifier votre voyage en Thaïlande, voici les outils que Paul recommande :</p>
      
      <!-- Widget Travelpayouts sélectionné intelligemment -->
      ${selectedWidget.widget.script}
      
      <h3>📈 Résultats concrets</h3>
      <p>En 3 ans, Paul a :</p>
      <ul>
        <li>Doublé son salaire (de 40k€ à 80k€/an)</li>
        <li>Voyagé dans 15 pays d'Asie</li>
        <li>Créé un réseau professionnel international</li>
        <li>Découvert sa passion pour l'entrepreneuriat</li>
      </ul>
      
      <p><em>Son histoire prouve qu'avec la bonne préparation et la bonne mentalité, le nomadisme digital peut transformer votre vie professionnelle et personnelle.</em></p>
    `;
    
    // Mettre à jour l'article
    const updateData = {
      content: newContent,
      status: 'publish'
    };
    
    const response = await axios.post(
      `${WORDPRESS_URL}/wp-json/wp/v2/posts/${ARTICLE_ID}`,
      updateData,
      {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      }
    );
    
    console.log('✅ Article mis à jour avec succès !');
    console.log('📝 ID:', response.data.id);
    console.log('🔗 URL:', response.data.link);
    console.log('🎯 Widget intégré:', selectedWidget.widget.type);
    console.log('💰 Récompense:', selectedWidget.widget.reward);
    
    return {
      success: true,
      articleId: response.data.id,
      url: response.data.link,
      widget: selectedWidget.widget,
      reason: selectedWidget.reason
    };
    
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error.message);
    if (error.response) {
      console.error('📊 Détails:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Vérifie l'intégration des widgets
 */
async function verifyWidgetIntegration() {
  try {
    console.log('🔍 Vérification de l\'intégration des widgets...');
    
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${ARTICLE_ID}`);
    const content = response.data.content.rendered;
    
    // Vérifications
    const checks = {
      'Widget Travelpayouts présent': content.includes('trpwdg.com'),
      'Partner ID 463418': content.includes('trs=463418'),
      'Marker 676421': content.includes('shmarker=676421'),
      'Script async': content.includes('<script async'),
      'Charset utf-8': content.includes('charset="utf-8"'),
      'Contenu article': content.includes('Paul a doublé ses revenus'),
      'Structure H2/H3': content.includes('<h2>') && content.includes('<h3>'),
      'Liste à puces': content.includes('<ul>') && content.includes('<li>')
    };
    
    const score = Object.values(checks).filter(Boolean).length;
    const percentage = Math.round((score / Object.keys(checks).length) * 100);
    
    console.log('📊 Résultats de vérification:');
    Object.entries(checks).forEach(([check, result]) => {
      console.log(`${result ? '✅' : '❌'} ${check}`);
    });
    
    console.log(`\n🎯 Score de conformité: ${score}/${Object.keys(checks).length} (${percentage}%)`);
    
    if (percentage >= 80) {
      console.log('🎉 Article parfaitement optimisé !');
    } else if (percentage >= 60) {
      console.log('⚠️ Article correct, quelques améliorations possibles');
    } else {
      console.log('❌ Article nécessite des corrections');
    }
    
    return { score, percentage, checks };
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error.message);
    return { error: error.message };
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 Mise à jour de l\'article avec les vrais widgets Travelpayouts');
  console.log('=' .repeat(60));
  
  // Mettre à jour l'article
  const updateResult = await updateArticleWithRealWidgets();
  
  if (updateResult.success) {
    console.log('\n' + '=' .repeat(60));
    
    // Vérifier l'intégration
    const verification = await verifyWidgetIntegration();
    
    if (verification.score) {
      console.log('\n🎯 RÉSUMÉ:');
      console.log(`📝 Article ID: ${updateResult.articleId}`);
      console.log(`🔗 URL: ${updateResult.url}`);
      console.log(`🎯 Widget: ${updateResult.widget.type}`);
      console.log(`💰 Récompense: ${updateResult.widget.reward}`);
      console.log(`📊 Score: ${verification.percentage}%`);
    }
  }
}

// Exécuter si appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { updateArticleWithRealWidgets, verifyWidgetIntegration };
