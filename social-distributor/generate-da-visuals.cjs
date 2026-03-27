const fs = require('fs');
const path = require('path');
const nodeHtmlToImage = require('node-html-to-image');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'story-card.html');
const OUTPUT_DIR = '/tmp';

const posts = [
  {
    id: 4250,
    headline1: 'ESIM VIETNAM 2026',
    headline2: 'Le comparatif que les blogs ne font jamais',
    subtext: 'Données, prix réels et notre verdict terrain',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/test-esim-vietnam.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4252,
    headline1: 'ASSURANCE VOYAGE VIETNAM',
    headline2: 'Ce que ton assureur ne te dit pas',
    subtext: 'Les pièges, les vrais prix et notre sélection',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/assurance-voyage-vietnam-documents-1.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4253,
    headline1: 'ESIM THAÏLANDE',
    headline2: 'AIS, DTAC ou True Move ?',
    subtext: 'Le comparatif terrain avec tests de débit',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/esim-thailande-tuk-tuk-bangkok-1.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4254,
    headline1: 'BALI OU THAÏLANDE ?',
    headline2: 'Le comparatif brutal pour ton premier voyage',
    subtext: 'Budget, plages, culture, bouffe — on tranche',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/bali-vs-thailande-danse-kecak-uluwatu-1.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4255,
    headline1: 'CAMBODGE OU LAOS ?',
    headline2: 'Lequel choisir pour 2 semaines',
    subtext: 'Temples, nature, budget — le vrai comparatif',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/cambodge-vs-laos-angkor-wat-panorama.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4369,
    headline1: 'VISA CAMBODGE 2026',
    headline2: 'E-visa, prix réels et arnaques',
    subtext: 'Tout ce qu\'il faut savoir avant de partir',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/visa-cambodge-temple-bayon-siem-reap.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4370,
    headline1: 'BALI + LOMBOK + GILI',
    headline2: '3 îles en 10 jours sans exploser ton budget',
    subtext: 'Itinéraire optimisé, budget détaillé',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/featured-3082.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4371,
    headline1: 'PHILIPPINES 10 JOURS',
    headline2: 'El Nido, Coron, Cebu, Bohol',
    subtext: 'L\'itinéraire parfait pour un premier voyage',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/philippines-10-jours-el-nido-palawan-lagon.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4372,
    headline1: 'ESIM PHILIPPINES',
    headline2: 'Globe vs Smart, le vrai comparatif',
    subtext: 'Tests terrain, prix et notre recommandation',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/esim-philippines-manila-ville.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4373,
    headline1: 'JAPON EN COUPLE',
    headline2: '15 jours, budget tout compris 2026',
    subtext: 'Tokyo, Kyoto, Osaka — le guide complet',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/japon-couple-voyage-skyline.jpg',
    brand: 'FLASH VOYAGE'
  }
];

async function generateVisuals() {
  console.log('Reading template...');
  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  for (const post of posts) {
    const outputPath = path.join(OUTPUT_DIR, `fv-da-${post.id}.png`);
    console.log(`Generating ${outputPath}...`);

    const html = templateHtml
      .replace('{{IMAGE_URL}}', post.imageUrl)
      .replace('{{HEADLINE_1}}', post.headline1)
      .replace('{{HEADLINE_2}}', post.headline2)
      .replace('{{SUBTEXT}}', post.subtext)
      .replace('{{BRAND}}', post.brand);

    try {
      await nodeHtmlToImage({
        output: outputPath,
        html: html,
        quality: 100,
        type: 'png',
        puppeteerArgs: {
          headless: 'new',
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        },
        content: {},
        waitUntil: 'networkidle0',
        selector: '.container',
        transparent: false
      });
      console.log(`  OK: ${outputPath}`);
    } catch (err) {
      console.error(`  FAILED for post ${post.id}:`, err.message);
    }
  }

  console.log('\nDone! All visuals saved to /tmp/fv-da-*.png');
}

generateVisuals().catch(console.error);
