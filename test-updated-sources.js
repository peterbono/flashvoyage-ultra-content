#!/usr/bin/env node

import axios from 'axios';
import xml2js from 'xml2js';

async function testUpdatedSources() {
  console.log('🧪 Test des sources mises à jour...\n');
  
  const sources = [
    { name: 'CNN Travel', url: 'http://rss.cnn.com/rss/edition_travel.rss' },
    { name: 'Skift', url: 'https://skift.com/feed/' },
    { name: 'Google News Asia', url: 'https://news.google.com/rss/search?q=travel+asia&hl=en&gl=US&ceid=US:en' },
    { name: 'Google News Japan', url: 'https://news.google.com/rss/search?q=travel+japan&hl=en&gl=US&ceid=US:en' }
  ];
  
  for (const source of sources) {
    try {
      console.log(`🔍 Test de ${source.name}...`);
      const response = await axios.get(source.url, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FlashVoyages-RSS-Monitor/1.0)'
        }
      });
      
      if (response.status === 200) {
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        
        let articles = [];
        if (result.rss && result.rss.channel && result.rss.channel[0].item) {
          articles = result.rss.channel[0].item;
        }
        
        console.log(`✅ ${source.name}: ${articles.length} articles`);
        
        if (articles.length > 0) {
          const firstArticle = articles[0];
          const title = firstArticle.title?.[0] || firstArticle.title?._ || 'Sans titre';
          console.log(`   📝 Exemple: ${title.substring(0, 80)}...`);
        }
      }
    } catch (error) {
      console.log(`❌ ${source.name}: ${error.message}`);
    }
    console.log('');
  }
  
  console.log('🎉 Test des sources terminé !');
}

testUpdatedSources().catch(console.error);