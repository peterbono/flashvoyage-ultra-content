#!/usr/bin/env node

import axios from 'axios';
import xml2js from 'xml2js';

async function testRealRSSSources() {
  console.log('🧪 Test des sources RSS réelles FlashVoyages...\n');
  
  const sources = [
    { 
      name: 'Air France Actualités', 
      url: 'https://www.airfrance.fr/rss/actualites',
      category: 'airlines'
    },
    { 
      name: 'Singapore Airlines News', 
      url: 'https://www.singaporeair.com/rss/news',
      category: 'airlines'
    },
    { 
      name: 'Tourism Thailand', 
      url: 'https://www.tourismthailand.org/rss/news',
      category: 'tourism'
    },
    { 
      name: 'JNTO Japan', 
      url: 'https://www.jnto.go.jp/rss/news',
      category: 'tourism'
    },
    { 
      name: 'Skyscanner Deals', 
      url: 'https://www.skyscanner.fr/rss/deals',
      category: 'deals'
    },
    { 
      name: 'Diplomatie Française', 
      url: 'https://www.diplomatie.gouv.fr/rss/actualites',
      category: 'visa'
    }
  ];
  
  let workingSources = 0;
  let totalArticles = 0;
  
  for (const source of sources) {
    try {
      console.log(`🔍 Test de ${source.name}...`);
      
      const response = await axios.get(source.url, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'FlashVoyages-RSS-Monitor/1.0'
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
          
          // Afficher les 2 premiers articles
          articles.slice(0, 2).forEach((article, index) => {
            const title = article.title?.[0] || article.title?._ || 'Sans titre';
            const pubDate = article.pubDate?.[0] || article.published?.[0] || 'Date inconnue';
            console.log(`   ${index + 1}. ${title}`);
            console.log(`      📅 ${pubDate}`);
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
  
  if (workingSources > 0) {
    console.log('\n🎉 Sources RSS opérationnelles !');
    console.log('✅ Le système peut récupérer de l\'actualité réelle');
    console.log('✅ Les articles peuvent être générés automatiquement');
  } else {
    console.log('\n⚠️ Aucune source RSS accessible');
    console.log('💡 Vérifiez la connectivité internet et les URLs');
  }
  
  return {
    workingSources,
    totalArticles,
    success: workingSources > 0
  };
}

async function main() {
  console.log('🚀 Test des sources RSS réelles FlashVoyages\n');
  
  const result = await testRealRSSSources();
  
  if (result.success) {
    console.log('\n🌏 FlashVoyages est prêt pour l\'automatisation !');
    console.log('📋 Le système peut maintenant:');
    console.log('1. Récupérer l\'actualité voyage en temps réel');
    console.log('2. Générer des articles basés sur cette actualité');
    console.log('3. Publier automatiquement quotidiennement');
  } else {
    console.log('\n🔧 Action requise:');
    console.log('1. Vérifiez la connectivité internet');
    console.log('2. Mettez à jour les URLs des sources RSS');
    console.log('3. Testez manuellement quelques sources');
  }
}

main().catch(console.error);

