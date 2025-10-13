/**
 * SIMPLIFICATION DU WIDGET + IMAGE FEATURED
 * Suppression du blabla + Image featured WordPress
 */

import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import axios from 'axios';

const ARTICLE_ID = 891;

/**
 * Widget simplifié sans blabla
 */
const simplifiedWidget = `
<div class="travelpayouts-widget" style="margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9; text-align: center;">
  <h3 style="margin-top: 0; color: #333; font-size: 18px;">Trouvez votre vol vers la Thaïlande</h3>
  <p style="margin-bottom: 15px; color: #666; font-size: 14px; line-height: 1.5;">
    <strong>Prêt à faire le grand saut ?</strong> Comparez les prix et réservez au meilleur tarif.
  </p>
  <script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&locale=fr&default_origin=PAR&default_destination=BKK&stops=any&show_hotels=true&powered_by=true&border_radius=0&plain=true&color_button=%2300A991&color_button_text=%23ffffff&promo_id=3414&campaign_id=111" charset="utf-8"></script>
  <p style="font-size: 12px; color: #999; margin-top: 10px; margin-bottom: 0;">
    Widget fourni par aviasales.com - Récompense : 40%
  </p>
</div>
`;

/**
 * Contenu sans image dans le body
 */
const cleanContent = `
<h2>Introduction</h2>
<p>Après 2 ans en Thaïlande en tant que nomade digital, je partage aujourd'hui mon expérience complète pour vous aider dans votre propre aventure. Bangkok s'est révélée être une destination exceptionnelle pour les entrepreneurs tech.</p>

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
 * Fonction pour télécharger et uploader l'image featured
 */
async function uploadFeaturedImage() {
  try {
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    
    // URL de l'image Pexels
    const imageUrl = 'https://images.pexels.com/photos/1181396/pexels-photo-1181396.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop';
    
    // Télécharger l'image
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });
    
    // Upload vers WordPress
    const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, imageResponse.data, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'attachment; filename="nomade-digital-thailande.jpg"'
      }
    });
    
    return uploadResponse.data.id;
  } catch (error) {
    console.error('❌ Erreur upload image :', error.message);
    return null;
  }
}

/**
 * Fonction principale de simplification
 */
async function simplifyWidgetAndAddFeaturedImage() {
  console.log('🔧 SIMPLIFICATION DU WIDGET + IMAGE FEATURED');
  console.log('=' .repeat(50));
  
  try {
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    
    // === ÉTAPE 1 : RÉCUPÉRATION DE L'ARTICLE ===
    console.log('\n📥 ÉTAPE 1 : RÉCUPÉRATION DE L\'ARTICLE');
    console.log('-' .repeat(30));
    
    const getResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${ARTICLE_ID}`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    console.log(`✅ Article récupéré : ${getResponse.data.title.rendered}`);
    
    // === ÉTAPE 2 : UPLOAD DE L'IMAGE FEATURED ===
    console.log('\n📸 ÉTAPE 2 : UPLOAD DE L\'IMAGE FEATURED');
    console.log('-' .repeat(30));
    
    const featuredImageId = await uploadFeaturedImage();
    
    if (featuredImageId) {
      console.log(`✅ Image featured uploadée : ID ${featuredImageId}`);
    } else {
      console.log('⚠️ Échec upload image featured');
    }
    
    // === ÉTAPE 3 : SIMPLIFICATION DU CONTENU ===
    console.log('\n✏️ ÉTAPE 3 : SIMPLIFICATION DU CONTENU');
    console.log('-' .repeat(30));
    
    // Remplacer le contenu existant par le nouveau contenu simplifié
    const updatedContent = cleanContent.replace(
      '<h2>Conclusion</h2>',
      simplifiedWidget + '\n\n<h2>Conclusion</h2>'
    );
    
    console.log('✅ Contenu simplifié :');
    console.log('   - Widget simplifié (sans blabla)');
    console.log('   - Image retirée du body');
    console.log('   - Contenu nettoyé');
    
    // === ÉTAPE 4 : MISE À JOUR DE L'ARTICLE ===
    console.log('\n💾 ÉTAPE 4 : MISE À JOUR DE L\'ARTICLE');
    console.log('-' .repeat(30));
    
    const updateData = {
      content: updatedContent,
      featured_media: featuredImageId
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
    console.log(`   - Image featured : ${featuredImageId ? '✅' : '❌'}`);
    
    // === ÉTAPE 5 : VÉRIFICATION ===
    console.log('\n🔍 ÉTAPE 5 : VÉRIFICATION');
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
    console.log(`   - Widget simplifié : ${content.includes('Prêt à faire le grand saut') && !content.includes('Pourquoi utiliser') ? '✅' : '❌'}`);
    console.log(`   - Image retirée du body : ${!content.includes('pexels.com') ? '✅' : '❌'}`);
    console.log(`   - Image featured : ${article.featured_media ? '✅' : '❌'}`);
    console.log(`   - Partner ID : ${content.includes('463418') ? '✅' : '❌'}`);
    
    return article;
    
  } catch (error) {
    console.error('❌ Erreur lors de la simplification :', error.response?.data || error.message);
    return null;
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 DÉMARRAGE DE LA SIMPLIFICATION');
  console.log('=' .repeat(50));
  
  const article = await simplifyWidgetAndAddFeaturedImage();
  
  if (article) {
    console.log('\n🎉 SIMPLIFICATION TERMINÉE AVEC SUCCÈS !');
    console.log(`📰 Article simplifié : ${article.link}`);
    console.log('🔧 Améliorations apportées :');
    console.log('   - Widget simplifié (sans blabla)');
    console.log('   - Image retirée du body');
    console.log('   - Image featured ajoutée');
    console.log('   - Contenu nettoyé');
  } else {
    console.log('\n❌ SIMPLIFICATION ÉCHOUÉE');
  }
}

// Exécuter si appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { simplifyWidgetAndAddFeaturedImage };
