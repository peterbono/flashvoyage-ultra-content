import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Articles FlashVoyages à restaurer
const ARTICLES_TO_RESTORE = [
  {
    title: '🛫 Nouveaux vols Paris-Séoul : Korean Air lance 4 vols/semaine',
    content: `
      <p>Excellente nouvelle pour les voyageurs ! Korean Air annonce le lancement de 4 vols par semaine entre Paris et Séoul à partir de mars 2024.</p>
      
      <h3>Détails de l'offre</h3>
      <p>Les vols seront opérés avec des Boeing 777-300ER et proposeront :</p>
      <ul>
        <li>Départ de Paris CDG les mardi, jeudi, samedi et dimanche</li>
        <li>Arrivée à Séoul ICN le lendemain</li>
        <li>Durée du vol : environ 11h30</li>
        <li>Service en classe économique et affaires</li>
      </ul>
      
      <h3>Tarifs promotionnels</h3>
      <p>Korean Air propose des tarifs de lancement dès 650€ A/R en classe économique, taxes incluses. Une offre limitée jusqu'à fin février 2024.</p>
      
      <h3>Pourquoi choisir Korean Air ?</h3>
      <p>La compagnie coréenne est reconnue pour son excellent service et sa cuisine à bord. Parfait pour découvrir la Corée du Sud en toute sérénité.</p>
      
      <p><strong>Réservation :</strong> Disponible sur le site Korean Air ou via les agences de voyage partenaires FlashVoyages.</p>
    `,
    categories: ['nouveaux-vols', 'coree-du-sud'],
    tags: ['korean air', 'séoul', 'vols', 'corée du sud', 'paris']
  },
  {
    title: '💰 Budget voyage Japon 2024 : Combien ça coûte vraiment ?',
    content: `
      <p>Le Japon fascine mais son coût de la vie peut faire peur. Voici un budget réaliste pour votre voyage au pays du soleil levant.</p>
      
      <h3>Hébergement</h3>
      <p>Les prix varient énormément selon le type d'hébergement :</p>
      <ul>
        <li><strong>Ryokan traditionnel :</strong> 150-300€/nuit pour 2 personnes</li>
        <li><strong>Hôtel business :</strong> 80-150€/nuit</li>
        <li><strong>Hostel/capsule :</strong> 30-60€/nuit</li>
        <li><strong>Airbnb :</strong> 50-100€/nuit</li>
      </ul>
      
      <h3>Transport</h3>
      <p>Le Japan Rail Pass reste la meilleure option :</p>
      <ul>
        <li>7 jours : 250€</li>
        <li>14 jours : 400€</li>
        <li>21 jours : 500€</li>
      </ul>
      
      <h3>Nourriture</h3>
      <p>On peut manger très bien sans se ruiner :</p>
      <ul>
        <li><strong>Convenience store :</strong> 5-10€/repas</li>
        <li><strong>Ramen :</strong> 8-15€</li>
        <li><strong>Restaurant local :</strong> 15-30€</li>
        <li><strong>Restaurant gastronomique :</strong> 50-100€+</li>
      </ul>
      
      <h3>Budget total recommandé</h3>
      <p>Pour 2 semaines au Japon :</p>
      <ul>
        <li><strong>Budget serré :</strong> 2000-2500€/personne</li>
        <li><strong>Budget confortable :</strong> 3000-4000€/personne</li>
        <li><strong>Budget luxe :</strong> 5000€+/personne</li>
      </ul>
      
      <p><strong>Conseil FlashVoyages :</strong> Réservez vos hébergements à l'avance, surtout pendant la haute saison (avril-mai, octobre-novembre).</p>
    `,
    categories: ['guides-pratiques', 'japon'],
    tags: ['japon', 'budget', 'voyage', 'coût', 'argent', 'guide']
  }
];

async function restoreArticles() {
  console.log('🔄 Restauration des articles FlashVoyages...\n');
  
  try {
    // Récupérer les catégories existantes
    const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?per_page=100`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const categories = categoriesResponse.data;
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.slug] = cat.id;
    });
    
    // Récupérer les tags existants
    const tagsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/tags?per_page=100`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const tags = tagsResponse.data;
    const tagMap = {};
    tags.forEach(tag => {
      tagMap[tag.slug] = tag.id;
    });
    
    let restoredCount = 0;
    
    for (const article of ARTICLES_TO_RESTORE) {
      console.log(`📄 Restauration: ${article.title}`);
      
      // Préparer les catégories
      const categoryIds = article.categories
        .map(slug => categoryMap[slug])
        .filter(id => id !== undefined);
      
      // Préparer les tags
      const tagIds = [];
      for (const tagName of article.tags) {
        const tagSlug = tagName.toLowerCase().replace(/\s+/g, '-');
        if (tagMap[tagSlug]) {
          tagIds.push(tagMap[tagSlug]);
        } else {
          // Créer le tag s'il n'existe pas
          try {
            const newTag = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/tags`, {
              name: tagName,
              slug: tagSlug
            }, {
              auth: {
                username: WORDPRESS_USERNAME,
                password: WORDPRESS_APP_PASSWORD
              }
            });
            tagIds.push(newTag.data.id);
            tagMap[tagSlug] = newTag.data.id;
          } catch (error) {
            console.error(`   ❌ Erreur création tag ${tagName}: ${error.message}`);
          }
        }
      }
      
      // Créer l'article
      try {
        const response = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
          title: article.title,
          content: article.content,
          status: 'publish',
          categories: categoryIds,
          tags: tagIds
        }, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
        console.log(`   ✅ Article restauré (ID: ${response.data.id})`);
        restoredCount++;
        
      } catch (error) {
        console.error(`   ❌ Erreur restauration: ${error.response?.data?.message || error.message}`);
      }
      
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les articles
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 RESTAURATION TERMINÉE !');
    console.log('='.repeat(50));
    console.log(`✅ Articles restaurés: ${restoredCount}`);
    console.log('✅ Vos articles FlashVoyages sont de retour');
    console.log('✅ Désolé pour l\'erreur !');
    
  } catch (error) {
    console.error('❌ Erreur lors de la restauration:', error.response?.data?.message || error.message);
  }
}

// Exécuter la restauration
restoreArticles();

