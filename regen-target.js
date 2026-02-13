#!/usr/bin/env node
/**
 * Regenerate a specific Reddit post through the full pipeline.
 * Usage: node regen-target.js <reddit_url>
 * 
 * Strategy: Monkey-patch the scraper to only return the target post,
 * then run the full, unmodified pipeline.
 */

import axios from 'axios';

const TARGET_URL = process.argv[2];
if (!TARGET_URL) {
  console.error('Usage: node regen-target.js <reddit_url>');
  process.exit(1);
}

console.log(`🎯 Target: ${TARGET_URL}\n`);

// 1. Fetch the target post from Reddit (or fixture fallback)
let targetPost = null;
try {
  const jsonUrl = TARGET_URL.replace(/\/?$/, '.json');
  const resp = await axios.get(jsonUrl, {
    headers: { 'User-Agent': 'FlashVoyage/1.0 (content generator)' },
    timeout: 15000
  });
  const post = resp.data[0]?.data?.children?.[0]?.data;
  if (!post) throw new Error('Post not found');
  
  targetPost = {
    title: post.title,
    link: `https://reddit.com${post.permalink}`,
    url: `https://reddit.com${post.permalink}`,
    source_text: post.selftext || '',
    author: post.author,
    score: post.score,
    num_comments: post.num_comments,
    subreddit: post.subreddit,
    created_utc: post.created_utc,
    source: 'reddit',
    source_reliability: 0.95,
    comments_snippets: []
  };
  
  // Extract top comments
  const commentChildren = resp.data[1]?.data?.children || [];
  for (const child of commentChildren) {
    if (child.kind === 't1' && child.data?.body) {
      targetPost.comments_snippets.push(child.data.body);
    }
  }
  console.log(`✅ Post fetched from Reddit: "${targetPost.title}"`);
  console.log(`   Score: ${targetPost.score} | Comments: ${targetPost.comments_snippets.length}\n`);
} catch (err) {
  console.log(`⚠️ Reddit fetch failed (${err.message}), trying fixtures...`);
  const { readFileSync, existsSync } = await import('fs');
  
  // Try to find in fixtures
  const fixtureFiles = [
    './data/fixtures/reddit-digitalnomad.json',
    './data/fixtures/reddit-travel.json'
  ];
  
  for (const file of fixtureFiles) {
    if (!existsSync(file)) continue;
    const fixtures = JSON.parse(readFileSync(file, 'utf-8'));
    const postId = TARGET_URL.split('/comments/')[1]?.split('/')[0];
    const match = fixtures.find(f => {
      const fUrl = f.link || f.url || '';
      return fUrl.includes(postId);
    });
    if (match) {
      targetPost = match;
      console.log(`✅ Post found in fixture: "${targetPost.title}"\n`);
      break;
    }
  }
  
  if (!targetPost) {
    console.error('❌ Post not found in Reddit API or fixtures');
    process.exit(1);
  }
}

// 2. Import the generator
const { default: EnhancedUltraGenerator } = await import('./enhanced-ultra-generator.js');
const generator = new EnhancedUltraGenerator();

// 3. Monkey-patch: make ALL scraper methods return ONLY our target post
const scraperMethods = [
  'scrapeReddit', 'scrapeRedditNomad', 'scrapeRedditSoloTravel', 'scrapeRedditBackpacking',
  'scrapeRedditThailand', 'scrapeRedditVietnam', 'scrapeRedditJapanTravel', 'scrapeRedditSoutheastAsia',
  'scrapeFallbackRSS', 'scrapeRedditOfficial', 'scrapeRedditViaProxy'
];

let firstCall = true;
for (const method of scraperMethods) {
  generator.scraper[method] = async () => {
    if (firstCall) {
      firstCall = false;
      console.log(`🎯 Injecting target post into scraper (via ${method})`);
      return [targetPost];
    }
    return []; // Other methods return empty
  };
}

// 4. Run the full, unmodified pipeline
generator.generateAndPublishEnhancedArticle()
  .then((result) => {
    if (result) {
      console.log('\n✅ Régénération terminée avec succès !');
    } else {
      console.log('\n⚠️ Aucun article publié');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur fatale:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
