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

// Articles FlashVoyages à créer
const FLASHVOYAGES_ARTICLES = [
  // ACTUALITÉS
  {
    title: '✈️ Air France lance un vol direct Paris-Bangkok dès 450€ A/R',
    content: `<!-- wp:paragraph -->
<p><strong>Envie de Thaïlande sans escale ?</strong> Air France vient d'ajouter une pépite à son programme hiver avec un nouveau vol direct Paris-Bangkok.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>📊 Ce qui change concrètement</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Prix :</strong> Dès 450€ A/R (au lieu de 600€+ habituellement)</li>
<li><strong>Dates :</strong> Départ tous les mardis et samedis</li>
<li><strong>Durée :</strong> 11h30 de vol direct</li>
<li><strong>Conditions :</strong> Valable jusqu'au 31 mars 2024</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>👉 Astuce voyageur FlashVoyages</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Réservez tôt le matin pour avoir les meilleures disponibilités. Les prix peuvent varier selon la saison, mais cette offre reste exceptionnelle pour un vol direct vers Bangkok.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>🎯 Contextualisation</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Cette annonce s'inscrit dans la tendance du boom du tourisme en Asie post-COVID. Les voyageurs francophones sont de plus en plus nombreux à se tourner vers cette région pour ses paysages exceptionnels et son excellent rapport qualité-prix.</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    category: 'actualites',
    tags: ['paris', 'bangkok', 'air-france', 'vol-direct', 'thailande'],
    excerpt: 'Air France lance un vol direct Paris-Bangkok dès 450€ A/R. Découvrez cette offre exceptionnelle et nos conseils pour réserver au meilleur prix.',
    status: 'publish'
  },
  {
    title: '🇯🇵 Nouveau visa électronique Japon : Plus simple et plus rapide',
    content: `<!-- wp:paragraph -->
<p><strong>Bonne nouvelle pour les amoureux du Japon !</strong> Le gouvernement japonais vient de simplifier drastiquement les démarches de visa pour les voyageurs français.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>📋 Ce qui change concrètement</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Délai :</strong> 24h au lieu de 5-7 jours</li>
<li><strong>Prix :</strong> 15€ au lieu de 25€</li>
<li><strong>Validité :</strong> 90 jours (inchangé)</li>
<li><strong>Démarche :</strong> 100% en ligne</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>👉 Astuce voyageur FlashVoyages</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Profitez de cette simplification pour planifier un voyage au Japon en dernière minute. Les prix des billets sont actuellement très attractifs, surtout en basse saison (janvier-mars).</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>🎯 Contextualisation</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Cette mesure s'inscrit dans la stratégie du Japon pour relancer le tourisme international. Le pays vise 40 millions de visiteurs en 2024, et la France fait partie des marchés prioritaires.</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    category: 'actualites',
    tags: ['japon', 'visa', 'simplification', 'voyage', 'actualite'],
    excerpt: 'Le Japon simplifie son visa électronique : 24h de délai au lieu de 5-7 jours, et 15€ au lieu de 25€. Une excellente nouvelle pour les voyageurs français !',
    status: 'publish'
  },
  {
    title: '🏨 Hôtels Bangkok dès 25€/nuit : Offre limitée jusqu\'à fin février',
    content: `<!-- wp:paragraph -->
<p><strong>Envie de découvrir Bangkok sans se ruiner ?</strong> On a repéré cette pépite avant tout le monde ! Des hôtels 4 étoiles à des prix défiant toute concurrence.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>🔥 L'offre en détail</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Prix :</strong> Dès 25€/nuit (au lieu de 80€ habituellement)</li>
<li><strong>Validité :</strong> Jusqu'au 28 février 2024</li>
<li><strong>Conditions :</strong> Séjour minimum 2 nuits</li>
<li><strong>Annulation :</strong> Gratuite jusqu'à 24h avant</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>🔗 Réservez maintenant</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><a href="#" target="_blank" rel="nofollow sponsored">Booking.com - Comparer les hôtels Bangkok</a></li>
<li><a href="#" target="_blank" rel="nofollow sponsored">Agoda - Meilleures offres Bangkok</a></li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>👉 Pourquoi c'est un bon plan ?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Cette offre représente une économie de 70% par rapport aux prix habituels. C'est l'occasion parfaite de découvrir Bangkok sans se ruiner, surtout en basse saison où la ville est moins touristique.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>⚡ Action rapide</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>⚠️ Attention : Cette offre est limitée dans le temps. Ne tardez pas à réserver pour profiter de ce bon plan !</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    category: 'bons_plans',
    tags: ['bangkok', 'hotel', 'bon-plan', 'promo', 'thailande'],
    excerpt: 'Hôtels Bangkok dès 25€/nuit : Offre limitée jusqu\'à fin février. Découvrez les meilleures offres hôtelières à Bangkok avec nos conseils d\'experts.',
    status: 'publish'
  },
  // GUIDES PRATIQUES
  {
    title: '📋 Guide complet visa Thaïlande 2024 : Tout ce qu\'il faut savoir',
    content: `<!-- wp:paragraph -->
<p><strong>Préparer son voyage en Thaïlande ?</strong> Voici tout ce qu'il faut savoir pour obtenir son visa sans stress et profiter pleinement de votre séjour.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>🎯 Pourquoi ce guide ?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Ce guide pratique vous accompagne étape par étape pour obtenir votre visa Thaïlande. Basé sur notre expérience terrain et les retours de la communauté FlashVoyages.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>📋 Étapes pratiques</h2>
<!-- /wp:heading -->

<!-- wp:list {"ordered":true} -->
<ol>
<li><strong>Vérifiez si vous avez besoin d'un visa :</strong> Les ressortissants français peuvent entrer en Thaïlande sans visa pour un séjour de moins de 30 jours</li>
<li><strong>Pour un séjour plus long :</strong> Demandez un visa touristique (60 jours) ou un visa non-immigrant (90 jours)</li>
<li><strong>Documents nécessaires :</strong> Passeport valide 6 mois, photos d'identité, formulaire de demande, justificatifs de voyage</li>
<li><strong>Dépôt de dossier :</strong> Ambassade de Thaïlande à Paris ou consulat</li>
<li><strong>Délai de traitement :</strong> 3-5 jours ouvrés</li>
</ol>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>💡 Conseils FlashVoyages</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Nos conseils d'experts pour optimiser votre expérience : réservez votre hôtel avant de demander le visa, gardez toujours vos documents à portée de main, et n'hésitez pas à contacter l'ambassade en cas de question.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>🔗 Ressources utiles</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><a href="https://paris.thaiembassy.org/" target="_blank">Site officiel Ambassade de Thaïlande Paris</a></li>
<li><a href="https://www.service-public.fr/" target="_blank">Service Public - Informations voyage</a></li>
<li><a href="https://flashvoyage.com/communaute" target="_blank">Communauté FlashVoyages</a></li>
</ul>
<!-- /wp:list -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    category: 'guides_pratiques',
    tags: ['thailande', 'visa', 'guide', 'pratique', 'voyage'],
    excerpt: 'Guide complet visa Thaïlande 2024 : étapes, documents, délais et conseils d\'experts. Tout ce qu\'il faut savoir pour voyager en Thaïlande sans stress.',
    status: 'publish'
  },
  {
    title: '💰 Budget voyage Japon 2024 : Combien ça coûte vraiment ?',
    content: `<!-- wp:paragraph -->
<p><strong>Rêvez-vous de découvrir le Japon mais vous vous demandez combien ça coûte ?</strong> Voici un budget détaillé basé sur notre expérience terrain pour vous aider à planifier votre voyage.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>🎯 Pourquoi ce guide budget ?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Le Japon a la réputation d'être cher, mais avec les bons conseils, on peut voyager sans se ruiner. Ce guide vous donne les vrais prix et nos astuces pour économiser.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>✈️ Transport</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Vol Paris-Tokyo :</strong> 600-1200€ A/R selon la saison</li>
<li><strong>Japan Rail Pass :</strong> 280€ (7 jours) - Indispensable !</li>
<li><strong>Métro local :</strong> 2-5€ par trajet</li>
<li><strong>Taxi :</strong> 15-30€ pour 5km (éviter si possible)</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>🏨 Hébergement</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Ryokan (auberge traditionnelle) :</strong> 80-150€/nuit</li>
<li><strong>Hôtel business :</strong> 60-100€/nuit</li>
<li><strong>Capsule hotel :</strong> 25-40€/nuit</li>
<li><strong>Airbnb :</strong> 40-80€/nuit</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>🍜 Nourriture</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Ramen :</strong> 8-15€</li>
<li><strong>Sushi :</strong> 20-50€ (midi) / 50-150€ (soir)</li>
<li><strong>Convenience store :</strong> 5-10€/repas</li>
<li><strong>Restaurant traditionnel :</strong> 30-80€</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>💡 Nos astuces pour économiser</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>1. <strong>Japan Rail Pass :</strong> Indispensable pour les longs trajets<br>
2. <strong>Convenience stores :</strong> Nourriture de qualité à prix imbattables<br>
3. <strong>Free Wi-Fi :</strong> Évitez les forfaits data chers<br>
4. <strong>Musées gratuits :</strong> Beaucoup d'activités culturelles gratuites<br>
5. <strong>Voyage en basse saison :</strong> Évitez avril (sakura) et novembre</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>📊 Budget total par personne</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Budget serré :</strong> 1500-2000€ (10 jours)</li>
<li><strong>Budget confort :</strong> 2500-3500€ (10 jours)</li>
<li><strong>Budget luxe :</strong> 4000€+ (10 jours)</li>
</ul>
<!-- /wp:list -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    category: 'guides_pratiques',
    tags: ['japon', 'budget', 'guide', 'prix', 'voyage'],
    excerpt: 'Budget voyage Japon 2024 : transport, hébergement, nourriture et activités. Nos conseils d\'experts pour voyager au Japon sans se ruiner.',
    status: 'publish'
  }
];

async function createFlashVoyagesArticles() {
  console.log('🚀 Création des articles FlashVoyages...');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const article of FLASHVOYAGES_ARTICLES) {
    try {
      console.log(`📝 Création: ${article.title}`);
      
      const postData = {
        title: article.title,
        content: article.content,
        status: article.status,
        categories: [CATEGORIES[article.category]],
        tags: article.tags,
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
      
      // Pause entre les créations pour éviter la surcharge
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
createFlashVoyagesArticles();

