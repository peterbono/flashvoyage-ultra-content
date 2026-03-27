const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'story-card.html');
const OUTPUT_DIR = '/tmp';

const posts = [
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

async function generateVisuals() {
  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

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
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1080 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

      const element = await page.$('.container');
      await element.screenshot({ path: outputPath, type: 'png' });
      await page.close();
      console.log(`  OK: ${outputPath}`);
    } catch (err) {
      console.error(`  FAILED for post ${post.id}:`, err.message);
    }
  }

  await browser.close();
  console.log('\nDone!');
}

generateVisuals().catch(console.error);
