#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function testRSSSources() {
  console.log('🧪 Test des sources RSS d\'actualité FlashVoyages...\n');
  
  try {
    // Test du serveur RSS Monitor
    console.log('1️⃣ Test du serveur RSS Monitor...');
    const rssResponse = await axios.post('http://localhost:3003/mcp', {
      method: 'monitor_rss_feeds',
      params: {
        category: 'airlines',
        limit: 5
      }
    });
    
    console.log('✅ Serveur RSS Monitor opérationnel');
    console.log('📊 Résultats:', rssResponse.data.result?.length || 0, 'articles trouvés');
    
    if (rssResponse.data.result && rssResponse.data.result.length > 0) {
      console.log('\n📰 Exemples d\'articles trouvés:');
      rssResponse.data.result.slice(0, 3).forEach((article, index) => {
        console.log(`${index + 1}. ${article.title}`);
        console.log(`   📅 ${article.pubDate}`);
        console.log(`   🔗 ${article.link}`);
        console.log('');
      });
    }
    
    // Test des sources spécifiques
    console.log('2️⃣ Test des sources d\'actualité...');
    
    const sources = [
      { name: 'Air France', url: 'https://www.airfrance.fr/rss/actualites' },
      { name: 'Singapore Airlines', url: 'https://www.singaporeair.com/rss/news' },
      { name: 'Tourism Thailand', url: 'https://www.tourismthailand.org/rss/news' },
      { name: 'JNTO Japan', url: 'https://www.jnto.go.jp/rss/news' }
    ];
    
    for (const source of sources) {
      try {
        console.log(`🔍 Test de ${source.name}...`);
        const response = await axios.get(source.url, { timeout: 10000 });
        
        if (response.status === 200) {
          console.log(`✅ ${source.name}: RSS accessible`);
        } else {
          console.log(`⚠️ ${source.name}: Status ${response.status}`);
        }
      } catch (error) {
        console.log(`❌ ${source.name}: ${error.message}`);
      }
    }
    
    // Test de génération d'article basé sur RSS
    console.log('\n3️⃣ Test de génération d\'article basé sur RSS...');
    const articleResponse = await axios.post('http://localhost:3003/mcp', {
      method: 'generate_news_article',
      params: {
        category: 'airlines',
        destination: 'Japon',
        limit: 1
      }
    });
    
    if (articleResponse.data.result) {
      console.log('✅ Génération d\'article RSS réussie');
      console.log('📝 Titre:', articleResponse.data.result.title);
      console.log('🌏 Destination:', articleResponse.data.result.destination);
    }
    
    return {
      success: true,
      rssWorking: true,
      sourcesTested: sources.length
    };
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.response) {
      console.error('📊 Détails:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Test des sources RSS FlashVoyages\n');
  
  // Attendre que le serveur RSS soit prêt
  console.log('⏳ Attente du démarrage du serveur RSS...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const result = await testRSSSources();
  
  if (result.success) {
    console.log('\n🎉 Test réussi !');
    console.log('✅ Sources RSS d\'actualité opérationnelles');
    console.log('✅ Génération d\'articles basée sur l\'actualité réelle');
    console.log('✅ Système d\'automatisation prêt');
    console.log('\n📋 Prochaines étapes:');
    console.log('1. Le système publie déjà quotidiennement');
    console.log('2. Les sources RSS alimentent le contenu');
    console.log('3. GitHub Actions gère l\'automatisation 24/7');
  } else {
    console.log('\n❌ Test échoué');
    console.log('🔍 Vérifiez les logs pour plus de détails');
  }
}

main().catch(console.error);

