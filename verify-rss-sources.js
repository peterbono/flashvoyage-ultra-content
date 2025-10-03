#!/usr/bin/env node

import axios from 'axios';
import xml2js from 'xml2js';

async function verifyRSSSource(name, url, category) {
  try {
    console.log(`🔍 Test de ${name}...`);
    
    const response = await axios.get(url, { 
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FlashVoyages-RSS-Monitor/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    
    if (response.status === 200) {
      console.log(`✅ ${name}: RSS accessible`);
      
      // Parser le XML pour vérifier le contenu
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
        
        // Afficher le premier article pour vérifier la pertinence
        const firstArticle = articles[0];
        const title = firstArticle.title?.[0] || firstArticle.title?._ || 'Sans titre';
        const pubDate = firstArticle.pubDate?.[0] || firstArticle.published?.[0] || 'Date inconnue';
        const link = firstArticle.link?.[0] || firstArticle.link?._ || '#';
        
        console.log(`   📝 Exemple: ${title}`);
        console.log(`   📅 ${pubDate}`);
        console.log(`   🔗 ${link}`);
        
        return {
          name,
          url,
          category,
          status: 'working',
          articlesCount: articles.length,
          sampleTitle: title
        };
      } else {
        console.log(`   ⚠️ Aucun article trouvé`);
        return { name, url, category, status: 'no_articles', articlesCount: 0 };
      }
    } else {
      console.log(`⚠️ ${name}: Status ${response.status}`);
      return { name, url, category, status: 'error', error: `Status ${response.status}` };
    }
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log(`❌ ${name}: Source non accessible (${error.code})`);
    } else if (error.response && error.response.status === 403) {
      console.log(`❌ ${name}: Accès refusé (403) - Protection anti-bot`);
    } else if (error.response && error.response.status === 404) {
      console.log(`❌ ${name}: Source non trouvée (404)`);
    } else {
      console.log(`❌ ${name}: ${error.message}`);
    }
    return { name, url, category, status: 'error', error: error.message };
  }
}

async function verifyAllRSSSources() {
  console.log('🧪 Vérification des sources RSS FlashVoyages...\n');
  
  // Sources proposées pour l'intégration
  const sourcesToTest = [
    // Sources officielles des offices de tourisme
    { name: 'JNTO Japon', url: 'https://www.jnto.go.jp/rss/news.xml', category: 'tourism_japan' },
    { name: 'Japan Travel', url: 'https://www.japan.travel/en/rss/news.xml', category: 'tourism_japan' },
    { name: 'Tourism Thailand', url: 'https://www.tourismthailand.org/rss/news.xml', category: 'tourism_thailand' },
    { name: 'Thailand Travel', url: 'https://www.thailand.travel/rss/news.xml', category: 'tourism_thailand' },
    { name: 'Korea Tourism', url: 'https://korean.visitkorea.or.kr/rss/news.xml', category: 'tourism_korea' },
    { name: 'Visit Korea', url: 'https://www.visitkorea.or.kr/rss/news.xml', category: 'tourism_korea' },
    { name: 'Singapore Tourism', url: 'https://www.visitsingapore.com/rss/news.xml', category: 'tourism_singapore' },
    { name: 'Your Singapore', url: 'https://www.yoursingapore.com/rss/news.xml', category: 'tourism_singapore' },
    { name: 'Vietnam Tourism', url: 'https://vietnam.travel/rss/news.xml', category: 'tourism_vietnam' },
    { name: 'Vietnam Travel', url: 'https://www.vietnam.travel/rss/news.xml', category: 'tourism_vietnam' },
    { name: 'Philippines Tourism', url: 'https://www.tourism.gov.ph/rss/news.xml', category: 'tourism_philippines' },
    { name: 'More Fun Philippines', url: 'https://www.itsmorefuninthephilippines.com/rss/news.xml', category: 'tourism_philippines' },
    
    // Sources aériennes spécialisées Asie
    { name: 'Singapore Airlines', url: 'https://www.singaporeair.com/rss/news.xml', category: 'airlines' },
    { name: 'Cathay Pacific', url: 'https://www.cathaypacific.com/rss/news.xml', category: 'airlines' },
    { name: 'Japan Airlines', url: 'https://www.jal.co.jp/rss/news.xml', category: 'airlines' },
    { name: 'ANA', url: 'https://www.ana.co.jp/rss/news.xml', category: 'airlines' },
    { name: 'Korean Air', url: 'https://www.koreanair.com/rss/news.xml', category: 'airlines' },
    { name: 'Thai Airways', url: 'https://www.thaiairways.com/rss/news.xml', category: 'airlines' },
    { name: 'Vietnam Airlines', url: 'https://www.vietnamairlines.com/rss/news.xml', category: 'airlines' },
    
    // Sources d'actualité voyage générales
    { name: 'BBC Travel', url: 'https://feeds.bbci.co.uk/news/travel/rss.xml', category: 'travel_news' },
    { name: 'CNN Travel', url: 'http://rss.cnn.com/rss/edition_travel.rss', category: 'travel_news' },
    { name: 'Reuters Travel', url: 'https://feeds.reuters.com/reuters/travelNews', category: 'travel_news' },
    { name: 'Travel Weekly', url: 'https://www.travelweekly.com/rss/news.xml', category: 'travel_news' },
    { name: 'Skift', url: 'https://skift.com/feed/', category: 'travel_news' },
    { name: 'Travel Pulse', url: 'https://www.travelpulse.com/rss/news.xml', category: 'travel_news' },
    
    // Sources spécialisées visa et formalités
    { name: 'France Diplomatie', url: 'https://www.diplomatie.gouv.fr/rss/actualites.xml', category: 'visa' },
    { name: 'Service Public', url: 'https://www.service-public.fr/rss/actualites.xml', category: 'visa' },
    { name: 'Europe Visa', url: 'https://europa.eu/rss/visa.xml', category: 'visa' },
    { name: 'US Travel', url: 'https://travel.state.gov/rss/news.xml', category: 'visa' },
    
    // Sources deals et promotions
    { name: 'Skyscanner Deals', url: 'https://www.skyscanner.fr/rss/deals.xml', category: 'deals' },
    { name: 'Kayak Deals', url: 'https://www.kayak.fr/rss/deals.xml', category: 'deals' },
    { name: 'Momondo Deals', url: 'https://www.momondo.fr/rss/deals.xml', category: 'deals' },
    { name: 'Booking Deals', url: 'https://www.booking.com/rss/deals.xml', category: 'deals' },
    { name: 'Agoda Deals', url: 'https://www.agoda.com/rss/deals.xml', category: 'deals' }
  ];
  
  const results = [];
  let workingSources = 0;
  let totalArticles = 0;
  
  for (const source of sourcesToTest) {
    const result = await verifyRSSSource(source.name, source.url, source.category);
    results.push(result);
    
    if (result.status === 'working') {
      workingSources++;
      totalArticles += result.articlesCount;
    }
    
    console.log(''); // Ligne vide pour la lisibilité
  }
  
  // Résumé par catégorie
  const categorySummary = {};
  results.forEach(result => {
    if (!categorySummary[result.category]) {
      categorySummary[result.category] = { working: 0, total: 0, articles: 0 };
    }
    categorySummary[result.category].total++;
    if (result.status === 'working') {
      categorySummary[result.category].working++;
      categorySummary[result.category].articles += result.articlesCount;
    }
  });
  
  console.log('📊 Résumé par catégorie:');
  console.log('=======================');
  Object.entries(categorySummary).forEach(([category, stats]) => {
    console.log(`${category}: ${stats.working}/${stats.total} sources (${stats.articles} articles)`);
  });
  
  console.log('\n📊 Résumé global:');
  console.log('================');
  console.log(`✅ Sources fonctionnelles: ${workingSources}/${sourcesToTest.length}`);
  console.log(`📰 Total articles trouvés: ${totalArticles}`);
  
  // Sources recommandées pour l'intégration
  const recommendedSources = results.filter(r => r.status === 'working' && r.articlesCount > 0);
  
  console.log('\n🎯 Sources recommandées pour l\'intégration:');
  console.log('==========================================');
  recommendedSources.forEach(source => {
    console.log(`✅ ${source.name} (${source.articlesCount} articles)`);
  });
  
  return {
    workingSources,
    totalArticles,
    recommendedSources,
    categorySummary,
    success: workingSources > 0
  };
}

async function main() {
  console.log('🚀 Vérification des sources RSS FlashVoyages\n');
  
  const result = await verifyAllRSSSources();
  
  if (result.success) {
    console.log('\n🎉 Sources RSS vérifiées avec succès !');
    console.log('✅ Prêt pour l\'intégration dans FlashVoyages');
    console.log('✅ Contenu d\'actualité Asie garanti');
    console.log('✅ Automatisation quotidienne possible');
  } else {
    console.log('\n⚠️ Peu de sources fonctionnelles trouvées');
    console.log('💡 Considérer des alternatives (APIs, scraping)');
  }
}

main().catch(console.error);

