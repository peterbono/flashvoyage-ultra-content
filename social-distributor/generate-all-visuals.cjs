const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'story-card.html');
const OUTPUT_DIR = '/tmp';

const posts = [
  {
    id: 4250,
    headline1: 'ESIM VIETNAM 2026',
    headline2: 'Le comparatif que les blogs ne font jamais',
    subtext: 'Donn\u00e9es, prix r\u00e9els et notre verdict terrain',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/test-esim-vietnam.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4252,
    headline1: 'ASSURANCE VOYAGE VIETNAM',
    headline2: 'Ce que ton assureur ne te dit pas',
    subtext: 'Les pi\u00e8ges, les vrais prix et notre s\u00e9lection',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/assurance-voyage-vietnam-documents-1.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4253,
    headline1: 'ESIM THA\u00cfLANDE',
    headline2: 'AIS, DTAC ou True Move ?',
    subtext: 'Le comparatif terrain avec tests de d\u00e9bit',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/esim-thailande-tuk-tuk-bangkok-1.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4254,
    headline1: 'BALI OU THA\u00cfLANDE ?',
    headline2: 'Le comparatif brutal pour ton premier voyage',
    subtext: 'Budget, plages, culture, bouffe \u2014 on tranche',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/bali-vs-thailande-danse-kecak-uluwatu-1.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4255,
    headline1: 'CAMBODGE OU LAOS ?',
    headline2: 'Lequel choisir pour 2 semaines',
    subtext: 'Temples, nature, budget \u2014 le vrai comparatif',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/cambodge-vs-laos-angkor-wat-panorama.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4369,
    headline1: 'VISA CAMBODGE 2026',
    headline2: 'E-visa, prix r\u00e9els et arnaques',
    subtext: 'Tout ce qu\u2019il faut savoir avant de partir',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/visa-cambodge-temple-bayon-siem-reap.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4370,
    headline1: 'BALI + LOMBOK + GILI',
    headline2: '3 \u00eeles en 10 jours sans exploser ton budget',
    subtext: 'Itin\u00e9raire optimis\u00e9, budget d\u00e9taill\u00e9',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/featured-3082.jpg',
    brand: 'FLASH VOYAGE'
  },
  {
    id: 4371,
    headline1: 'PHILIPPINES 10 JOURS',
    headline2: 'El Nido, Coron, Cebu, Bohol',
    subtext: 'L\u2019itin\u00e9raire parfait pour un premier voyage',
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
    subtext: 'Tokyo, Kyoto, Osaka \u2014 le guide complet',
    imageUrl: 'https://flashvoyage.com/wp-content/uploads/2026/03/japon-couple-voyage-skyline.jpg',
    brand: 'FLASH VOYAGE'
  }
];

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function generateVisuals() {
  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  for (const post of posts) {
    const outputPath = path.join(OUTPUT_DIR, `fv-da-${post.id}.png`);
    console.log(`[${post.id}] Downloading background image...`);

    try {
      // Download image and convert to base64
      const imgBuffer = await downloadImage(post.imageUrl);
      const b64 = imgBuffer.toString('base64');
      const dataUri = `data:image/jpeg;base64,${b64}`;
      console.log(`  Image downloaded: ${(imgBuffer.length / 1024).toFixed(0)}KB`);

      const html = templateHtml
        .replace('{{IMAGE_URL}}', dataUri)
        .replace('{{HEADLINE_1}}', post.headline1)
        .replace('{{HEADLINE_2}}', post.headline2)
        .replace('{{SUBTEXT}}', post.subtext)
        .replace('{{BRAND}}', post.brand);

      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1080 });
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Wait for fonts to load and render
      await new Promise(r => setTimeout(r, 3000));

      const element = await page.$('.container');
      await element.screenshot({ path: outputPath, type: 'png' });
      await page.close();

      const fileSize = fs.statSync(outputPath).size;
      console.log(`  OK: ${outputPath} (${(fileSize / 1024).toFixed(0)}KB)`);
    } catch (err) {
      console.error(`  FAILED for post ${post.id}:`, err.message);
    }
  }

  await browser.close();
  console.log('\n=== All visuals generated ===');

  // List all files
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('fv-da-'));
  console.log(`\nGenerated ${files.length} files:`);
  files.forEach(f => {
    const size = fs.statSync(path.join(OUTPUT_DIR, f)).size;
    console.log(`  ${f} - ${(size / 1024).toFixed(0)}KB`);
  });
}

generateVisuals().catch(console.error);
