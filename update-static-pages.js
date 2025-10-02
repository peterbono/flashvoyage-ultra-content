import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Pages à mettre à jour
const PAGES_TO_UPDATE = [
  {
    id: 173, // À propos
    title: 'À propos de FlashVoyages',
    content: `<!-- wp:heading {"level":1} -->
<h1>À propos de FlashVoyages</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>FlashVoyages, c'est votre partenaire voyage pour découvrir l'Asie autrement.</strong> Nous sommes une équipe de passionnés qui partage la même vision : rendre le voyage en Asie accessible, authentique et mémorable pour tous les francophones.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>🎯 Notre mission</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Chez FlashVoyages, nous croyons que voyager en Asie ne devrait pas être compliqué. Notre mission est de vous accompagner dans la découverte de cette région fascinante en vous fournissant :</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul>
<li><strong>Des actualités voyage</strong> : Les dernières nouvelles qui impactent votre voyage</li>
<li><strong>Des guides pratiques</strong> : Tout ce qu'il faut savoir avant de partir</li>
<li><strong>Des bons plans</strong> : Les meilleures offres pour voyager sans se ruiner</li>
<li><strong>Des conseils d'experts</strong> : Basés sur notre expérience terrain</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>🌏 Notre expertise</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Nous nous concentrons exclusivement sur l'Asie, ce qui nous permet de vous offrir une expertise approfondie sur :</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul>
<li><strong>Thaïlande</strong> : Nos conseils pour découvrir Bangkok, Chiang Mai, les îles du Sud</li>
<li><strong>Japon</strong> : Tokyo, Kyoto, Osaka et les régions moins connues</li>
<li><strong>Vietnam</strong> : De Hanoi à Ho Chi Minh, en passant par la baie d'Halong</li>
<li><strong>Indonésie</strong> : Bali, Java, Sumatra et les 17 000 îles</li>
<li><strong>Philippines</strong> : Les plus belles îles et spots de plongée</li>
<li><strong>Corée du Sud</strong> : Séoul, Busan et la culture K-pop</li>
<li><strong>Malaisie & Singapour</strong> : Kuala Lumpur, Penang, Singapour</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>💡 Notre approche</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Nous écrivons comme si nous nous adressions à un ami qui prépare un voyage. Notre ton est :</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul>
<li><strong>Proche et complice</strong> : "Envie de Thaïlande sans escale ?"</li>
<li><strong>Malin et chasseur de bons plans</strong> : "On a repéré cette pépite avant tout le monde !"</li>
<li><strong>Expert et rassurant</strong> : "Voici ce que ça change pour vous"</li>
<li><strong>Authentique et local</strong> : Focus sur l'Asie avec ses spécificités culturelles</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>🤝 Notre communauté</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>FlashVoyages, c'est aussi une communauté de voyageurs francophones passionnés d'Asie. Rejoignez-nous pour :</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul>
<li>Partager vos expériences de voyage</li>
<li>Poser vos questions à nos experts</li>
<li>Découvrir les dernières tendances voyage</li>
<li>Bénéficier d'offres exclusives</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>📧 Contactez-nous</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Une question ? Un conseil ? Une suggestion ? N'hésitez pas à nous contacter :</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul>
<li><strong>Email :</strong> contact@flashvoyage.com</li>
<li><strong>Newsletter :</strong> Inscrivez-vous pour recevoir nos meilleurs conseils</li>
<li><strong>Réseaux sociaux :</strong> Suivez-nous pour des conseils quotidiens</li>
</ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p><em>L'équipe FlashVoyages vous souhaite de beaux voyages en Asie ! 🌏✈️</em></p>
<!-- /wp:paragraph -->`,
    excerpt: 'Découvrez FlashVoyages, votre partenaire voyage pour l\'Asie. Actualités, guides pratiques, bons plans et conseils d\'experts pour voyager en Asie autrement.'
  },
  {
    id: 175, // Contact
    title: 'Contact FlashVoyages',
    content: `<!-- wp:heading {"level":1} -->
<h1>Contact FlashVoyages</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Une question sur votre prochain voyage en Asie ?</strong> Notre équipe d'experts est là pour vous aider !</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>📧 Nous contacter</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Email général :</strong> contact@flashvoyage.com</li>
<li><strong>Questions voyage :</strong> conseils@flashvoyage.com</li>
<li><strong>Partenariats :</strong> partenariats@flashvoyage.com</li>
<li><strong>Presse :</strong> presse@flashvoyage.com</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>⏰ Nos horaires</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Notre équipe répond à vos emails du lundi au vendredi, de 9h à 18h (heure de Paris).</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>🌏 Questions fréquentes</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3>Visa et formalités</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Q : Ai-je besoin d'un visa pour la Thaïlande ?</strong><br>
R : Les ressortissants français peuvent entrer en Thaïlande sans visa pour un séjour de moins de 30 jours. Consultez notre guide complet sur les visas.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>Meilleure période pour voyager</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Q : Quand partir en Asie du Sud-Est ?</strong><br>
R : La meilleure période est généralement de novembre à mars (saison sèche). Évitez la mousson de mai à octobre.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>Budget voyage</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Q : Combien coûte un voyage de 2 semaines en Thaïlande ?</strong><br>
R : Comptez 800-1500€ par personne selon votre confort. Consultez notre guide budget détaillé.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>📱 Suivez-nous</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Restez connecté avec FlashVoyages :</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul>
<li><strong>Newsletter :</strong> Recevez nos meilleurs conseils chaque semaine</li>
<li><strong>Instagram :</strong> @flashvoyages - Photos et conseils quotidiens</li>
<li><strong>Facebook :</strong> FlashVoyages - Communauté et échanges</li>
<li><strong>YouTube :</strong> FlashVoyages - Guides vidéo et vlogs</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2>🤝 Rejoignez notre communauté</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Partagez vos expériences, posez vos questions et découvrez les conseils d'autres voyageurs dans notre communauté FlashVoyages.</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
    excerpt: 'Contactez FlashVoyages pour vos questions voyage en Asie. Notre équipe d\'experts vous accompagne dans la préparation de votre voyage.'
  }
];

async function updateStaticPages() {
  console.log('📄 Mise à jour des pages statiques FlashVoyages...');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const page of PAGES_TO_UPDATE) {
    try {
      console.log(`📝 Mise à jour: ${page.title}`);
      
      const pageData = {
        title: page.title,
        content: page.content,
        excerpt: page.excerpt
      };
      
      const response = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/pages/${page.id}`, pageData, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Mis à jour avec succès (ID: ${response.data.id})`);
      console.log(`   URL: ${response.data.link}`);
      console.log('');
      
      successCount++;
      
      // Pause entre les mises à jour
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Erreur pour "${page.title}":`, error.response?.data?.message || error.message);
      errorCount++;
    }
  }
  
  console.log('='.repeat(50));
  console.log(`📊 Résumé: ${successCount} pages mises à jour, ${errorCount} erreurs`);
}

// Exécuter la mise à jour
updateStaticPages();

