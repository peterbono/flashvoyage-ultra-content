import axios from 'axios';

const wpUrl = process.env.WORDPRESS_URL;
const wpUser = process.env.WORDPRESS_USERNAME;
const wpPass = process.env.WORDPRESS_APP_PASSWORD;

const content = [
  '<h2>Des témoignages réels, pas des articles génériques</h2>',
  '<p>Flash Voyage ne fonctionne pas comme un blog de voyage classique. Nos articles ne sont pas écrits par un seul auteur qui raconte son voyage — ils sont construits à partir de <strong>témoignages réels de voyageurs</strong>, partagés sur Reddit et d\'autres communautés.</p>',
  '<p>Pourquoi ? Parce qu\'un article de blog reflète <em>une</em> expérience. Un thread Reddit avec 30 commentaires, c\'est 30 points de vue différents — des budgets différents, des saisons différentes, des attentes différentes. C\'est plus fiable qu\'un avis isolé.</p>',
  '',
  '<h2>Notre processus en 5 étapes</h2>',
  '',
  '<h3>1. Identification des sujets à forte demande</h3>',
  '<p>Nous surveillons les communautés de voyageurs (r/travel, r/solotravel, r/digitalnomad, r/backpacking) pour identifier les questions qui génèrent le plus de discussions. Si 40 personnes débattent d\'un itinéraire en Indonésie, c\'est que le sujet mérite un article structuré.</p>',
  '',
  '<h3>2. Extraction et vérification des témoignages</h3>',
  '<p>Nous extrayons les informations factuelles du témoignage original et des commentaires : lieux visités, durées, coûts mentionnés, erreurs signalées, conseils donnés. Chaque information est tracée jusqu\'à sa source.</p>',
  '',
  '<h3>3. Enrichissement par données temps réel</h3>',
  '<p>Nous croisons les témoignages avec des données actualisées automatiquement : prix des vols (comparateurs), coût de la vie local, conditions de sécurité, taux de change, formalités de visa. Ces données sont mises à jour quotidiennement.</p>',
  '',
  '<h3>4. Structuration éditoriale</h3>',
  '<p>Le contenu brut est transformé en article structuré : arbitrages clairs, options d\'itinéraire comparées, erreurs fréquentes documentées, FAQ basée sur les vraies questions posées dans la discussion. L\'objectif : que tu prennes une meilleure décision, pas que tu lises un beau récit.</p>',
  '',
  '<h3>5. Contrôle qualité</h3>',
  '<p>Chaque article passe par un audit automatisé qui vérifie : aucun prix inventé, aucun lieu non sourcé, structure complète, liens internes pertinents, données à jour. Les articles qui n\'atteignent pas notre seuil de qualité ne sont pas publiés.</p>',
  '',
  '<h2>Ce que nous ne faisons pas</h2>',
  '<ul>',
  '<li><strong>Nous n\'inventons pas de prix.</strong> Si un coût n\'est pas dans la source, on ne le mentionne pas.</li>',
  '<li><strong>Nous ne prétendons pas être allés sur place.</strong> La source est toujours citée et liée.</li>',
  '<li><strong>Nous ne cachons pas les limites.</strong> Chaque article contient une section "Limites et biais" qui explique ce que l\'article ne couvre pas.</li>',
  '</ul>',
  '',
  '<h2>Pourquoi faire confiance à Flash Voyage ?</h2>',
  '<p>Notre crédibilité repose sur trois piliers :</p>',
  '<ul>',
  '<li><strong>Transparence</strong> — chaque article cite et lie sa source. Tu peux vérifier par toi-même.</li>',
  '<li><strong>Données vérifiables</strong> — les prix, les conditions de sécurité, les taux de change sont mis à jour automatiquement et datés.</li>',
  '<li><strong>Volume de perspectives</strong> — au lieu d\'un seul avis, nous croisons les retours de dizaines de voyageurs sur le même sujet.</li>',
  '</ul>',
  '<p>Des questions sur notre méthode ? <a href="mailto:contact@flashvoyage.com">Contacte-nous</a>.</p>'
].join('\n');

try {
  const res = await axios.post(wpUrl + '/wp-json/wp/v2/pages', {
    title: 'Notre méthode — Comment sont construits nos articles',
    content,
    status: 'publish',
    slug: 'notre-methode'
  }, {
    auth: { username: wpUser, password: wpPass }
  });
  console.log('Page créée:', res.data.link);
  console.log('ID:', res.data.id);
} catch (err) {
  console.error('Erreur:', err.response?.data?.message || err.message);
}
