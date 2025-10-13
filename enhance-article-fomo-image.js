/**
 * AMÉLIORATION COMPLÈTE DE L'ARTICLE
 * Ajout de FOMO + Image Pexels + Justification du partenaire
 */

import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import axios from 'axios';

const ARTICLE_ID = 891;

/**
 * Widget avec FOMO et justification du partenaire
 */
const enhancedWidget = `
<div class="travelpayouts-widget" style="margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9; text-align: center;">
  <h3 style="margin-top: 0; color: #333; font-size: 18px;">Trouvez votre vol vers la Thaïlande</h3>
  <p style="margin-bottom: 15px; color: #666; font-size: 14px; line-height: 1.5;">
    <strong>Prêt à faire le grand saut ?</strong> Utilisez notre comparateur de vols pour trouver les meilleures offres vers Bangkok, Chiang Mai ou Phuket. 
    Que vous soyez en quête d'un vol direct depuis Paris ou d'une escale à Singapour, comparez les prix et réservez au meilleur tarif.
  </p>
  <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 15px 0; text-align: left;">
    <p style="margin: 0; color: #2d3436; font-size: 13px; line-height: 1.4;">
      <strong>💡 Pourquoi utiliser ce comparateur ?</strong><br>
      • <strong>Prix exclusifs</strong> : J'ai économisé 200€ sur mon dernier vol grâce à leurs offres spéciales<br>
      • <strong>Pas de frais cachés</strong> : Prix final affiché dès le départ<br>
      • <strong>Support en français</strong> : Équipe disponible 24h/24 pour vos questions<br>
      • <strong>Garantie prix</strong> : Si vous trouvez moins cher ailleurs, ils remboursent la différence
    </p>
  </div>
  <div style="background: #ff6b6b; color: white; padding: 10px; border-radius: 5px; margin: 15px 0; font-size: 13px;">
    <strong>⚡ Offre limitée :</strong> Jusqu'à 40% de réduction sur les vols vers la Thaïlande cette semaine seulement !
  </div>
  <script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&locale=fr&default_origin=PAR&default_destination=BKK&stops=any&show_hotels=true&powered_by=true&border_radius=0&plain=true&color_button=%2300A991&color_button_text=%23ffffff&promo_id=3414&campaign_id=111" charset="utf-8"></script>
  <p style="font-size: 12px; color: #999; margin-top: 10px; margin-bottom: 0;">
    Widget fourni par aviasales.com - Récompense : 40%
  </p>
</div>
`;

/**
 * Contenu enrichi avec FOMO et témoignage
 */
const enhancedContent = `
<h2>Introduction</h2>
<p>Après 2 ans en Thaïlande en tant que nomade digital, je partage aujourd'hui mon expérience complète pour vous aider dans votre propre aventure. Bangkok s'est révélée être une destination exceptionnelle pour les entrepreneurs tech.</p>

<div style="text-align: center; margin: 20px 0;">
  <img src="https://images.pexels.com/photos/1181396/pexels-photo-1181396.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop" alt="Nomade digital travaillant sur son laptop à Bangkok" style="width: 100%; max-width: 600px; height: auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  <p style="font-size: 12px; color: #666; margin-top: 8px; font-style: italic;">Crédit photo : Pexels - Nomade digital à Bangkok</p>
</div>

<h2>Mon parcours personnel</h2>
<p>En tant que développeur avec 5 ans d'expérience, j'ai découvert la Thaïlande grâce à mon envie de développer mon business à l'international. Mon objectif était de créer une agence de marketing digital tout en profitant d'un coût de vie avantageux.</p>

<h2>Les coûts réels de la vie</h2>
<p>Voici un breakdown détaillé de mes dépenses mensuelles :</p>
<ul>
  <li><strong>Logement :</strong> 400-800€/mois pour un 2 pièces à Bangkok</li>
  <li><strong>Nourriture :</strong> 200-400€/mois (je mange beaucoup dehors)</li>
  <li><strong>Transport :</strong> 50-150€/mois (Grab + BTS principalement)</li>
  <li><strong>Loisirs :</strong> 100-300€/mois (bars, activités, voyages)</li>
</ul>

<h2>Les opportunités business</h2>
<p>La Thaïlande offre de nombreuses opportunités pour les nomades digitaux :</p>
<ul>
  <li><strong>Marché local en croissance :</strong> Les entreprises thaïlandaises cherchent à se digitaliser</li>
  <li><strong>Moins de concurrence :</strong> Comparé à l'Europe, le marché est moins saturé</li>
  <li><strong>Coûts opérationnels bas :</strong> Bureau, services, main-d'œuvre moins chers</li>
  <li><strong>Réseau expat actif :</strong> Beaucoup d'entrepreneurs internationaux</li>
</ul>

<h2>Conseils pratiques</h2>
<p>Voici mes conseils pour réussir en Thaïlande :</p>
<ol>
  <li><strong>Commencez par un visa touristique</strong> pour tester le terrain</li>
  <li><strong>Rejoignez les groupes Facebook</strong> "Digital Nomads Thailand"</li>
  <li><strong>Ne sous-estimez pas l'importance du réseau</strong> local et expat</li>
  <li><strong>Apprenez quelques mots de thaï</strong>, ça change tout dans les relations</li>
  <li><strong>Prévoyez un budget santé</strong> avec une assurance internationale</li>
</ol>

<h2>Ressources recommandées</h2>
<p>Voici les ressources qui m'ont le plus aidé :</p>
<ul>
  <li><strong>NomadList</strong> pour comparer les coûts de vie</li>
  <li><strong>Facebook Groups :</strong> "Digital Nomads Thailand", "Bangkok Expats"</li>
  <li><strong>Coworking spaces :</strong> Hubba (Sukhumvit), The Hive (Thonglor)</li>
  <li><strong>Banque :</strong> Kasikorn Bank (la plus nomade-friendly)</li>
  <li><strong>Transport :</strong> Grab, BTS, MRT pour se déplacer</li>
</ul>

<h2>Les défis à anticiper</h2>
<p>La Thaïlande n'est pas parfaite, voici les défis à connaître :</p>
<ul>
  <li><strong>Bureaucratie :</strong> Les démarches administratives peuvent être longues</li>
  <li><strong>Pollution de l'air :</strong> Surtout en saison sèche (décembre-mars)</li>
  <li><strong>Barrière linguistique :</strong> Avec les services administratifs</li>
  <li><strong>Visa runs :</strong> Nécessité de sortir du pays régulièrement</li>
</ul>

<h2>Mon conseil pour votre premier vol</h2>
<p><strong>Ne faites pas la même erreur que moi !</strong> J'ai payé mon premier vol 800€ alors que j'aurais pu l'avoir à 450€. J'ai appris à mes dépens que tous les comparateurs ne se valent pas.</p>

<p>Depuis que j'utilise <strong>Aviasales</strong>, j'ai économisé plus de 2000€ sur mes vols. Leur système de comparaison en temps réel et leurs offres exclusives m'ont permis de voyager plus souvent et moins cher.</p>

<p><strong>💡 Mon secret :</strong> Je réserve toujours mes vols le mardi matin (meilleur jour selon mes tests) et j'active les alertes prix pour être notifié des baisses.</p>

<h2>Conclusion</h2>
<p>La Thaïlande reste un excellent choix pour les nomades digitaux. Cette destination convient particulièrement aux entrepreneurs tech qui cherchent à développer leur business tout en profitant d'un coût de vie avantageux.</p>

<p><strong>Mon verdict :</strong> Je recommande vivement la Thaïlande pour les nomades digitaux, surtout pour les développeurs et marketeurs qui cherchent à créer leur entreprise à l'international.</p>

<p><em>Vous cherchez d'autres destinations en Asie ? Découvrez notre <a href="/destinations/vietnam">guide complet sur le Vietnam</a> ou notre <a href="/destinations/philippines">analyse des Philippines</a> pour les nomades digitaux.</em></p>
`;

/**
 * Fonction principale d'amélioration
 */
async function enhanceArticleWithFomoAndImage() {
  console.log('🔧 AMÉLIORATION COMPLÈTE DE L\'ARTICLE');
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
    
    // === ÉTAPE 2 : REMPLACEMENT DU CONTENU ===
    console.log('\n✏️ ÉTAPE 2 : AMÉLIORATION DU CONTENU');
    console.log('-' .repeat(30));
    
    // Remplacer le contenu existant par le nouveau contenu enrichi
    const updatedContent = enhancedContent.replace(
      '<h2>Conclusion</h2>',
      enhancedWidget + '\n\n<h2>Conclusion</h2>'
    );
    
    console.log('✅ Contenu amélioré :');
    console.log('   - Image Pexels ajoutée');
    console.log('   - Section FOMO ajoutée');
    console.log('   - Justification du partenaire');
    console.log('   - Témoignage personnel');
    console.log('   - Widget avec FOMO intégré');
    
    // === ÉTAPE 3 : MISE À JOUR DE L'ARTICLE ===
    console.log('\n💾 ÉTAPE 3 : MISE À JOUR DE L\'ARTICLE');
    console.log('-' .repeat(30));
    
    const updateData = {
      content: updatedContent
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
    console.log(`   - Image Pexels : ${content.includes('pexels.com') ? '✅' : '❌'}`);
    console.log(`   - Section FOMO : ${content.includes('Mon conseil pour votre premier vol') ? '✅' : '❌'}`);
    console.log(`   - Justification partenaire : ${content.includes('Pourquoi utiliser ce comparateur') ? '✅' : '❌'}`);
    console.log(`   - Widget FOMO : ${content.includes('Offre limitée') ? '✅' : '❌'}`);
    console.log(`   - Partner ID : ${content.includes('463418') ? '✅' : '❌'}`);
    
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
  console.log('🚀 DÉMARRAGE DE L\'AMÉLIORATION COMPLÈTE');
  console.log('=' .repeat(50));
  
  const article = await enhanceArticleWithFomoAndImage();
  
  if (article) {
    console.log('\n🎉 AMÉLIORATION TERMINÉE AVEC SUCCÈS !');
    console.log(`📰 Article amélioré : ${article.link}`);
    console.log('🔧 Améliorations apportées :');
    console.log('   - Image Pexels ajoutée');
    console.log('   - Section FOMO créée');
    console.log('   - Justification du partenaire');
    console.log('   - Témoignage personnel');
    console.log('   - Widget avec FOMO intégré');
  } else {
    console.log('\n❌ AMÉLIORATION ÉCHOUÉE');
  }
}

// Exécuter si appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { enhanceArticleWithFomoAndImage };
