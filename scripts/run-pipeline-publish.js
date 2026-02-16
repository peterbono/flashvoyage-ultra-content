#!/usr/bin/env node
/**
 * run-pipeline-publish.js
 * 
 * Exécute le pipeline complet + publie l'article sur WordPress.
 * Bypasse le système de sélection/déduplication.
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import PipelineRunner from '../pipeline-runner.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const input = {
  post: {
    title: '30 day trip to Vietnam, worth taking a detour to Angkor Wat for 2-3 days?',
    selftext: `Planning a 30 day trip to Vietnam in March. Starting in Hanoi, heading south to Ho Chi Minh City. Budget is about $1500 for the whole trip not including flights. I've heard Angkor Wat is only a short flight from HCMC and wondering if it's worth the detour for 2-3 days.

Has anyone done this? How much extra would it add to the budget? I'm thinking maybe $200-300 for flights and entry fees? The temple complex looks incredible but I don't want to rush my Vietnam itinerary.

Currently my rough plan:
- Hanoi: 5 days (Ha Long Bay trip included)
- Ninh Binh: 2 days
- Hue: 2 days
- Hoi An: 4 days
- Da Nang: 2 days
- Dalat: 3 days
- HCMC: 5 days
- Mekong Delta: 2 days
- Phu Quoc: 3 days

That's already 28 days packed. Would love to hear thoughts on whether to squeeze in Angkor Wat or save it for a dedicated Cambodia trip later.`,
    author: 'backpacker_adventures',
    url: 'https://reddit.com/r/travel/comments/1o79miz/30_day_trip_to_vietnam_worth_taking_a_detour_to/',
    subreddit: 'travel',
    created_utc: (Date.now() / 1000) - 30 * 86400
  },
  comments: [
    { author: 'seasoned_traveler', body: 'Absolutely do Angkor Wat. I did a similar Vietnam trip and added 3 days in Siem Reap. Flights from HCMC are about $80-120 round trip with AirAsia. The $37 temple pass for 3 days is worth every penny. Just skip Phu Quoc - it\'s overrated and overpriced now.' },
    { author: 'budget_nomad', body: 'I\'d honestly save Cambodia for its own trip. You have an amazing Vietnam itinerary. Rushing to fit in Angkor Wat means you\'ll spend 2 travel days just getting there and back. That\'s 2 days less in Vietnam. I spent $45/day in Vietnam and $55/day in Cambodia, so budget-wise it adds up fast.' },
    { author: 'temple_fan', body: 'Did exactly this last year. Cost me about $250 extra total (flights $95, temple pass $37, 2 nights hotel $60, food and tuk-tuks $58). Sunrise at Angkor Wat was the highlight of my entire 6-week Asia trip. No regrets.' },
    { author: 'vietnam_expert', body: 'Your Vietnam itinerary is solid but too rushed. I\'d cut Dalat (nice but skippable for first-timers) and use those 3 days for Angkor Wat. Also, your HCMC budget should be about $30-40/day, Hanoi is slightly cheaper at $25-35/day.' },
    { author: 'frequent_flyer', body: 'Pro tip: book the HCMC to Siem Reap flight on VietJet, usually around $50 one way. And get the 3-day Angkor pass, not the 1-day. You WILL want more than one day there. The whole complex is massive - Ta Prohm alone took me 3 hours.' }
  ],
  geo: { country: 'vietnam', city: 'hanoi' },
  source: { subreddit: 'travel', url: 'https://reddit.com/r/travel/comments/1o79miz/30_day_trip_to_vietnam_worth_taking_a_detour_to/', source: 'Reddit r/travel' }
};

async function uploadFeaturedImage(auth, wpUrl, imageData) {
  if (!imageData?.url) return null;
  try {
    const imgResponse = await axios.get(imageData.url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(imgResponse.data);
    const filename = `featured-${Date.now()}.jpg`;

    const uploadResponse = await axios.post(`${wpUrl}/wp-json/wp/v2/media`, buffer, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

    const mediaId = uploadResponse.data.id;
    console.log(`🖼️ Image uploaded: ID=${mediaId} (${imageData.photographer || 'unknown'})`);

    // Set alt text
    if (imageData.alt) {
      await axios.post(`${wpUrl}/wp-json/wp/v2/media/${mediaId}`, {
        alt_text: imageData.alt
      }, {
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
      });
    }

    return mediaId;
  } catch (err) {
    console.warn(`⚠️ Image upload failed: ${err.message}`);
    return null;
  }
}

async function publishToWordPress(title, content, featuredImage) {
  const wpUrl = process.env.WORDPRESS_URL;
  const wpUser = process.env.WORDPRESS_USERNAME;
  const wpPass = process.env.WORDPRESS_APP_PASSWORD;
  
  if (!wpUrl || !wpUser || !wpPass) {
    console.error('❌ WordPress credentials manquantes (WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD)');
    return null;
  }

  const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');

  // Upload featured image if available
  let featuredMediaId = null;
  if (featuredImage) {
    featuredMediaId = await uploadFeaturedImage(auth, wpUrl, featuredImage);
  }

  // Build post data
  const postData = { title, content, status: 'draft' };
  if (featuredMediaId) {
    postData.featured_media = featuredMediaId;
  }

  const response = await axios.post(`${wpUrl}/wp-json/wp/v2/posts`, postData, {
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
  });

  const postId = response.data.id;
  const postLink = response.data.link;
  console.log(`📝 Draft créé: ID=${postId} URL=${postLink}`);

  // Now publish
  await axios.post(`${wpUrl}/wp-json/wp/v2/posts/${postId}`, {
    status: 'publish'
  }, {
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
  });

  console.log(`✅ Article publié: ${postLink}`);
  return postLink;
}

async function main() {
  console.log('🚀 Pipeline FlashVoyage — Publication test\n');

  process.env.ENABLE_MARKETING_PASS = 'false';

  const runner = new PipelineRunner();

  console.log(`📋 Input: ${input.post.title}`);
  console.log(`   ${input.comments.length} commentaires\n`);

  const report = await runner.runPipeline(input);

  console.log('\n📊 RÉSUMÉ:');
  console.log(`   Succès: ${report.success ? 'OUI' : 'NON'}`);
  console.log(`   Bloquant: ${report.blocking ? 'OUI' : 'NON'}`);
  console.log(`   Durée: ${report.metrics?.duration || 'N/A'}ms`);

  const finalArticle = report.finalArticle || report.article;
  if (!finalArticle?.content) {
    console.error('❌ Pas de contenu généré');
    process.exit(1);
  }

  console.log(`   Titre: ${finalArticle.title}`);
  console.log(`   Contenu: ${finalArticle.content.length} chars`);

  // Save locally
  writeFileSync('/tmp/last-generated-article.html', finalArticle.content);
  const reportPath = join(__dirname, '..', 'pipeline-report-output.json');
  const reportJson = typeof report.toJSON === 'function' ? report.toJSON() : JSON.stringify(report, null, 2);
  writeFileSync(reportPath, typeof reportJson === 'string' ? reportJson : JSON.stringify(reportJson, null, 2));
  console.log(`💾 Rapport: ${reportPath}`);

  // Publish with featured image
  const link = await publishToWordPress(finalArticle.title, finalArticle.content, finalArticle.featuredImage);
  if (link) {
    console.log(`\n🔗 ARTICLE EN LIGNE: ${link}`);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error.message);
  process.exit(1);
});
