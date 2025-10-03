#!/usr/bin/env node

import axios from 'axios';
import xml2js from 'xml2js';

async function testWorkingRSSSources() {
  console.log('🧪 Test des sources RSS fonctionnelles FlashVoyages...\n');
  
  // Sources RSS réelles et fonctionnelles pour le voyage
  const sources = [
    { 
      name: 'BBC Travel', 
      url: 'https://feeds.bbci.co.uk/news/travel/rss.xml',
      category: 'travel_news'
    },
    { 
      name: 'CNN Travel', 
      url: 'http://rss.cnn.com/rss/edition_travel.rss',
      category: 'travel_news'
    },
    { 
      name: 'Lonely Planet', 
      url: 'https://www.lonelyplanet.com/news/rss',
      category: 'travel_guides'
    },
    { 
      name: 'Travel + Leisure', 
      url: 'https://www.travelandleisure.com/rss',
      category: 'travel_lifestyle'
    },
    { 
      name: 'National Geographic Travel', 
      url: 'https://www.nationalgeographic.com/travel/rss/',
      category: 'travel_destinations'
    },
    { 
      name: 'Reuters Travel', 
      url: 'https://feeds.reuters.com/reuters/travelNews',
      category: 'travel_news'
    }
  ];
  
  let workingSources = 0;
  let totalArticles = 0;
  const articlesByCategory = {};
  
  for (const source of sources) {
    try {
      console.log(`🔍 Test de ${source.name}...`);
      
      const response = await axios.get(source.url, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FlashVoyages-RSS-Monitor/1.0)'
        }
      });
      
      if (response.status === 200) {
        console.log(`✅ ${source.name}: RSS accessible`);
        
        // Parser le XML
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        
        // Extraire les articles
        let articles = [];
        if (result.rss && result.rss.channel && result.rss.channel[0].item) {
          articles = result.rss.channel[0].item;
        } else if (result.feed && result.feed.entry) {
          articles = result.feed.entry;
        }
        
        if (articles.length > 0) {
          console.log(`   📰 ${articles.length} articles trouvés`);
          totalArticles += articles.length;
          workingSources++;
          
          // Compter par catégorie
          if (!articlesByCategory[source.category]) {
            articlesByCategory[source.category] = 0;
          }
          articlesByCategory[source.category] += articles.length;
          
          // Afficher les 2 premiers articles
          articles.slice(0, 2).forEach((article, index) => {
            const title = article.title?.[0] || article.title?._ || 'Sans titre';
            const pubDate = article.pubDate?.[0] || article.published?.[0] || 'Date inconnue';
            const link = article.link?.[0] || article.link?._ || '#';
            console.log(`   ${index + 1}. ${title}`);
            console.log(`      📅 ${pubDate}`);
            console.log(`      🔗 ${link}`);
          });
        } else {
          console.log(`   ⚠️ Aucun article trouvé`);
        }
      } else {
        console.log(`⚠️ ${source.name}: Status ${response.status}`);
      }
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.log(`❌ ${source.name}: Source non accessible (${error.code})`);
      } else if (error.response && error.response.status === 403) {
        console.log(`❌ ${source.name}: Accès refusé (403) - Protection anti-bot`);
      } else if (error.response && error.response.status === 404) {
        console.log(`❌ ${source.name}: Source non trouvée (404)`);
      } else {
        console.log(`❌ ${source.name}: ${error.message}`);
      }
    }
    
    console.log(''); // Ligne vide pour la lisibilité
  }
  
  console.log('📊 Résumé des tests:');
  console.log('==================');
  console.log(`✅ Sources fonctionnelles: ${workingSources}/${sources.length}`);
  console.log(`📰 Total articles trouvés: ${totalArticles}`);
  
  if (Object.keys(articlesByCategory).length > 0) {
    console.log('\n📂 Articles par catégorie:');
    Object.entries(articlesByCategory).forEach(([category, count]) => {
      console.log(`   ${category}: ${count} articles`);
    });
  }
  
  if (workingSources > 0) {
    console.log('\n🎉 Sources RSS opérationnelles !');
    console.log('✅ Le système peut récupérer de l\'actualité voyage réelle');
    console.log('✅ Les articles peuvent être générés automatiquement');
    console.log('✅ FlashVoyages peut publier du contenu basé sur l\'actualité');
  } else {
    console.log('\n⚠️ Aucune source RSS accessible');
    console.log('💡 Les sources peuvent avoir des protections anti-bot');
    console.log('💡 Ou nécessiter des headers spécifiques');
  }
  
  return {
    workingSources,
    totalArticles,
    articlesByCategory,
    success: workingSources > 0
  };
}

async function main() {
  console.log('🚀 Test des sources RSS fonctionnelles FlashVoyages\n');
  
  const result = await testWorkingRSSSources();
  
  if (result.success) {
    console.log('\n🌏 FlashVoyages est prêt pour l\'automatisation !');
    console.log('📋 Le système peut maintenant:');
    console.log('1. Récupérer l\'actualité voyage en temps réel');
    console.log('2. Générer des articles basés sur cette actualité');
    console.log('3. Publier automatiquement quotidiennement');
    console.log('4. Utiliser GitHub Actions pour l\'automatisation 24/7');
  } else {
    console.log('\n🔧 Solutions alternatives:');
    console.log('1. Utiliser des APIs d\'actualité (NewsAPI, etc.)');
    console.log('2. Scraper des sites d\'actualité voyage');
    console.log('3. Utiliser des flux RSS alternatifs');
    console.log('4. Intégrer des sources d\'actualité spécialisées');
  }
}

main().catch(console.error);

