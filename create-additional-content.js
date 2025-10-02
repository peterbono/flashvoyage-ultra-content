import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Configuration des catégories FlashVoyages
const CATEGORIES = {
  'actualites': 56,
  'bons_plans': 57,
  'guides_pratiques': 58,
  'destinations_asie': 1,
  'japon': 61,
  'coree_sud': 63,
  'philippines': 64,
  'nouveaux_vols': 65,
  'alertes': 66,
  'astuces_voyageur': 70
};

// Articles supplémentaires
const ADDITIONAL_ARTICLES = [
  // NOUVEAUX VOLS
  {
    title: '🛫 Nouveaux vols Paris-Séoul : Korean Air lance 4 vols/semaine',
    content: `<!-- wp:paragraph -->
<p><strong>Envie de découvrir la Corée du Sud ?</strong> Korean Air vient d'annoncer l'ouverture d'une nouvelle ligne directe Paris-Séoul avec 4 vols par semaine.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>✈️ Détails de la nouvelle ligne</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Fréquence :</strong> 4 vols par semaine (lundi, mercredi, vendredi, dimanche)</li>
<li><strong>Durée :</strong> 12h30 de vol direct</li>
<li><strong>Départ :</strong> 14h30 de Paris CDG</li>
<li><strong>Arrivée :</strong> 09h00+1 à Séoul ICN</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>💰 Tarifs promotionnels</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Économique :</strong> Dès 520€ A/R</li>
<li><strong>Business :</strong> Dès 1800€ A/R</li>
<li><strong>Validité :</strong> Jusqu'au 30 juin 2024</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>👉 Astuce voyageur FlashVoyages</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Les vols du mercredi et dimanche sont généralement moins chers. Réservez au moins 2 mois à l'avance pour avoir les meilleurs tarifs.</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    category: 'nouveaux_vols',
    excerpt: 'Korean Air lance 4 vols par semaine Paris-Séoul. Découvrez cette nouvelle ligne directe et nos conseils pour réserver au meilleur prix.',
    status: 'publish'
  },
  // ALERTES
  {
    title: '⚠️ Alerte sécurité : Évitez ces zones à Bangkok en ce moment',
    content: `<!-- wp:paragraph -->
<p><strong>Voyage prévu à Bangkok ?</strong> Voici les dernières informations de sécurité que tout voyageur doit connaître avant de partir.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>🚨 Zones à éviter actuellement</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Ratchaprasong :</strong> Manifestations sporadiques</li>
<li><strong>Sanam Luang :</strong> Rassemblements politiques</li>
<li><strong>Khao San Road :</strong> Forte présence policière</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>✅ Zones sûres recommandées</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Sukhumvit :</strong> Quartier touristique sécurisé</li>
<li><strong>Silom :</strong> Centre d'affaires calme</li>
<li><strong>Riverside :</strong> Hôtels de luxe protégés</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>📱 Numéros d'urgence</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Police :</strong> 191</li>
<li><strong>Ambulance :</strong> 1669</li>
<li><strong>Ambassade France :</strong> +66 2 657 5100</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>💡 Conseils FlashVoyages</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Restez informé via l'application "Thailand Travel" du gouvernement thaïlandais. Évitez les rassemblements et gardez toujours vos documents sur vous.</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    category: 'alertes',
    excerpt: 'Alerte sécurité Bangkok : zones à éviter et conseils de sécurité. Restez informé pour voyager en toute sécurité en Thaïlande.',
    status: 'publish'
  },
  // ASTUCES VOYAGEUR
  {
    title: '💡 10 astuces pour voyager pas cher en Asie du Sud-Est',
    content: `<!-- wp:paragraph -->
<p><strong>Rêvez-vous d'explorer l'Asie du Sud-Est sans vous ruiner ?</strong> Voici nos 10 astuces testées et approuvées par la communauté FlashVoyages.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>✈️ Transport</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>1. Vols low-cost :</strong> AirAsia, Jetstar, Scoot pour les trajets intra-Asie</li>
<li><strong>2. Bus de nuit :</strong> Économisez une nuit d'hôtel en voyageant la nuit</li>
<li><strong>3. Moto-taxi :</strong> 3x moins cher que le taxi dans les villes</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>🏨 Hébergement</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>4. Auberges de jeunesse :</strong> 5-15€/nuit avec petit-déjeuner inclus</li>
<li><strong>5. Guesthouses :</strong> Chambres privées à partir de 10€/nuit</li>
<li><strong>6. Couchsurfing :</strong> Gratuit et rencontres garanties</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>🍜 Nourriture</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>7. Street food :</strong> 1-3€ pour un repas complet</li>
<li><strong>8. Marchés locaux :</strong> Fruits et légumes à prix imbattables</li>
<li><strong>9. Évitez les restaurants touristiques :</strong> 3x plus chers</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>🎯 Activités</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>10. Activités gratuites :</strong> Temples, plages, randonnées, musées gratuits</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>💡 Bonus : Notre astuce secrète</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Voyagez en basse saison (mai-octobre) : moins de touristes, prix divisés par 2, et expérience plus authentique !</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    category: 'astuces_voyageur',
    excerpt: '10 astuces pour voyager pas cher en Asie du Sud-Est : transport, hébergement, nourriture et activités. Nos conseils d\'experts testés sur le terrain.',
    status: 'publish'
  },
  // DESTINATIONS ASIE
  {
    title: '🏝️ Philippines : 7 îles incontournables pour votre premier voyage',
    content: `<!-- wp:paragraph -->
<p><strong>Prêt à découvrir les plus belles îles des Philippines ?</strong> Voici notre sélection des 7 îles incontournables pour un premier voyage réussi.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>🏝️ Nos 7 îles coup de cœur</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3>1. Palawan - L'île paradisiaque</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Pourquoi :</strong> Lagons turquoise, falaises calcaires, plages de sable blanc. C'est le cliché parfait des Philippines !</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>À faire :</strong> Tour en bateau à El Nido, plongée à Coron, randonnée dans les rizières de Banaue</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>2. Boracay - La plage la plus célèbre</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Pourquoi :</strong> 4km de plage de sable blanc, eaux cristallines, ambiance festive</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>À faire :</strong> Kitesurf, plongée, soirées sur la plage, massage au coucher du soleil</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>3. Cebu - Le cœur des Philippines</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Pourquoi :</strong> Histoire, culture, plongée exceptionnelle avec les requins-baleines</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>À faire :</strong> Nager avec les requins-baleines, visiter les églises coloniales, randonnée dans les montagnes</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>4. Bohol - Nature et aventure</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Pourquoi :</strong> Collines de chocolat, tarsiers, rivière Loboc</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>À faire :</strong> Croisière sur la rivière Loboc, observation des tarsiers, randonnée dans les collines</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>5. Siargao - Le paradis des surfeurs</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Pourquoi :</strong> Vagues parfaites, îles désertes, ambiance décontractée</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>À faire :</strong> Surf, tour des îles, plongée, détente sur les plages sauvages</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>6. Camiguin - L'île volcanique</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Pourquoi :</strong> Volcans, sources chaudes, plages de sable noir</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>À faire :</strong> Ascension du volcan Hibok-Hibok, baignade dans les sources chaudes</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>7. Siquijor - L'île mystique</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Pourquoi :</strong> Plongée exceptionnelle, cascades, ambiance mystique</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>À faire :</strong> Plongée avec les tortues, visite des cascades, découverte de la culture locale</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>💡 Conseils FlashVoyages</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Meilleure période :</strong> Décembre à mai (saison sèche)<br>
<strong>Durée recommandée :</strong> 2-3 semaines minimum<br>
<strong>Budget :</strong> 30-50€/jour selon le confort</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    category: 'destinations_asie',
    excerpt: '7 îles incontournables des Philippines pour votre premier voyage : Palawan, Boracay, Cebu, Bohol, Siargao, Camiguin et Siquijor. Guide complet avec nos conseils d\'experts.',
    status: 'publish'
  }
];

async function createAdditionalArticles() {
  console.log('🚀 Création des articles supplémentaires FlashVoyages...');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const article of ADDITIONAL_ARTICLES) {
    try {
      console.log(`📝 Création: ${article.title}`);
      
      const postData = {
        title: article.title,
        content: article.content,
        status: article.status,
        categories: [CATEGORIES[article.category]],
        excerpt: article.excerpt
      };
      
      const response = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, postData, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Créé avec succès (ID: ${response.data.id})`);
      console.log(`   URL: ${response.data.link}`);
      console.log('');
      
      successCount++;
      
      // Pause entre les créations
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Erreur pour "${article.title}":`, error.response?.data?.message || error.message);
      errorCount++;
    }
  }
  
  console.log('='.repeat(50));
  console.log(`📊 Résumé: ${successCount} articles créés, ${errorCount} erreurs`);
}

// Exécuter la création
createAdditionalArticles();

