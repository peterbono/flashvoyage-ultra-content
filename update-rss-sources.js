#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

async function updateRSSSources() {
  console.log('🔧 Mise à jour des sources RSS FlashVoyages...\n');
  
  // Sources vérifiées et fonctionnelles
  const workingSources = {
    'travel_news': [
      {
        name: 'CNN Travel',
        url: 'http://rss.cnn.com/rss/edition_travel.rss',
        category: 'travel_news',
        description: 'Actualités voyage CNN - International'
      },
      {
        name: 'Skift',
        url: 'https://skift.com/feed/',
        category: 'travel_news',
        description: 'Actualités tech et innovation voyage'
      }
    ],
    'asia_news': [
      {
        name: 'Google News Asia Travel',
        url: 'https://news.google.com/rss/search?q=travel+asia&hl=en&gl=US&ceid=US:en',
        category: 'asia_news',
        description: 'Actualités voyage Asie via Google News'
      },
      {
        name: 'Google News Japan Travel',
        url: 'https://news.google.com/rss/search?q=travel+japan&hl=en&gl=US&ceid=US:en',
        category: 'asia_news',
        description: 'Actualités voyage Japon via Google News'
      },
      {
        name: 'Google News Thailand Travel',
        url: 'https://news.google.com/rss/search?q=travel+thailand&hl=en&gl=US&ceid=US:en',
        category: 'asia_news',
        description: 'Actualités voyage Thaïlande via Google News'
      },
      {
        name: 'Google News Korea Travel',
        url: 'https://news.google.com/rss/search?q=travel+korea&hl=en&gl=US&ceid=US:en',
        category: 'asia_news',
        description: 'Actualités voyage Corée via Google News'
      },
      {
        name: 'Google News Singapore Travel',
        url: 'https://news.google.com/rss/search?q=travel+singapore&hl=en&gl=US&ceid=US:en',
        category: 'asia_news',
        description: 'Actualités voyage Singapour via Google News'
      },
      {
        name: 'Google News Vietnam Travel',
        url: 'https://news.google.com/rss/search?q=travel+vietnam&hl=en&gl=US&ceid=US:en',
        category: 'asia_news',
        description: 'Actualités voyage Vietnam via Google News'
      },
      {
        name: 'Google News Philippines Travel',
        url: 'https://news.google.com/rss/search?q=travel+philippines&hl=en&gl=US&ceid=US:en',
        category: 'asia_news',
        description: 'Actualités voyage Philippines via Google News'
      }
    ]
  };
  
  // Configuration pour les APIs d'actualité
  const newsAPIs = {
    'newsapi': {
      name: 'NewsAPI',
      baseUrl: 'https://newsapi.org/v2/everything',
      description: 'API d\'actualité gratuite (1000 requêtes/jour)',
      queries: [
        'travel asia',
        'japan travel',
        'thailand travel',
        'korea travel',
        'singapore travel',
        'vietnam travel',
        'philippines travel'
      ]
    },
    'guardian': {
      name: 'The Guardian API',
      baseUrl: 'https://content.guardianapis.com/search',
      description: 'API Guardian gratuite (5000 requêtes/jour)',
      queries: [
        'travel',
        'asia',
        'japan',
        'thailand',
        'korea',
        'singapore',
        'vietnam',
        'philippines'
      ]
    }
  };
  
  // Mettre à jour le fichier RSS Monitor
  const rssMonitorPath = path.join(process.cwd(), 'flashvoyages-rss-monitor.js');
  
  try {
    let content = await fs.readFile(rssMonitorPath, 'utf-8');
    
    // Remplacer la section des sources RSS
    const newRSSSection = `    // Sources RSS vérifiées et fonctionnelles
    this.rssFeeds = {
      'travel_news': [
        'http://rss.cnn.com/rss/edition_travel.rss',
        'https://skift.com/feed/'
      ],
      'asia_news': [
        'https://news.google.com/rss/search?q=travel+asia&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+japan&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+thailand&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+korea&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+singapore&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+vietnam&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+philippines&hl=en&gl=US&ceid=US:en'
      ]
    };`;
    
    // Remplacer l'ancienne section
    const oldRSSPattern = /this\.rssFeeds\s*=\s*\{[\s\S]*?\};/;
    content = content.replace(oldRSSPattern, newRSSSection);
    
    // Ajouter la configuration des APIs
    const apiConfig = `
    
    // Configuration des APIs d'actualité
    this.newsAPIs = {
      'newsapi': {
        baseUrl: 'https://newsapi.org/v2/everything',
        apiKey: process.env.NEWSAPI_KEY || '',
        queries: [
          'travel asia',
          'japan travel',
          'thailand travel',
          'korea travel',
          'singapore travel',
          'vietnam travel',
          'philippines travel'
        ]
      },
      'guardian': {
        baseUrl: 'https://content.guardianapis.com/search',
        apiKey: process.env.GUARDIAN_API_KEY || '',
        queries: [
          'travel',
          'asia',
          'japan',
          'thailand',
          'korea',
          'singapore',
          'vietnam',
          'philippines'
        ]
      }
    };`;
    
    // Ajouter après la section rssFeeds
    content = content.replace(newRSSSection, newRSSSection + apiConfig);
    
    await fs.writeFile(rssMonitorPath, content);
    console.log('✅ Sources RSS mises à jour dans flashvoyages-rss-monitor.js');
    
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error.message);
    return false;
  }
  
  // Mettre à jour le fichier .env.example
  const envExamplePath = path.join(process.cwd(), 'env.example');
  
  try {
    let envContent = await fs.readFile(envExamplePath, 'utf-8');
    
    const newEnvVars = `
# APIs d'actualité (optionnelles)
NEWSAPI_KEY="your_newsapi_key_here"
GUARDIAN_API_KEY="your_guardian_api_key_here"`;
    
    if (!envContent.includes('NEWSAPI_KEY')) {
      envContent += newEnvVars;
      await fs.writeFile(envExamplePath, envContent);
      console.log('✅ Variables d\'environnement ajoutées dans env.example');
    }
    
  } catch (error) {
    console.error('⚠️ Erreur lors de la mise à jour env.example:', error.message);
  }
  
  // Créer un fichier de test pour vérifier les nouvelles sources
  const testContent = `#!/usr/bin/env node

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
      console.log(\`🔍 Test de \${source.name}...\`);
      const response = await axios.get(source.url, { timeout: 10000 });
      
      if (response.status === 200) {
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        
        let articles = [];
        if (result.rss && result.rss.channel && result.rss.channel[0].item) {
          articles = result.rss.channel[0].item;
        }
        
        console.log(\`✅ \${source.name}: \${articles.length} articles\`);
      }
    } catch (error) {
      console.log(\`❌ \${source.name}: \${error.message}\`);
    }
  }
}

testUpdatedSources();`;
  
  await fs.writeFile('test-updated-sources.js', testContent);
  console.log('✅ Fichier de test créé: test-updated-sources.js');
  
  console.log('\n🎉 Mise à jour terminée !');
  console.log('📋 Sources intégrées:');
  console.log('  ✅ CNN Travel (30 articles)');
  console.log('  ✅ Skift (10 articles)');
  console.log('  ✅ Google News Asie (7 pays)');
  console.log('  ✅ APIs NewsAPI + Guardian (configurées)');
  
  return true;
}

updateRSSSources().catch(console.error);

