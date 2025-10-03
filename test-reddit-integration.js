#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const REDDIT_CONTENT_PORT = 3007;

async function testRedditConnection() {
  console.log('🧪 Test de connexion Reddit API\n');
  
  try {
    // Test direct de l'API Reddit
    const response = await axios.get('https://www.reddit.com/r/japanlife/search.json', {
      params: {
        q: 'tokyo shibuya expat advice',
        sort: 'top',
        t: 'year',
        limit: 5,
        raw_json: 1
      },
      headers: {
        'User-Agent': 'FlashVoyages-Test/1.0'
      },
      timeout: 10000
    });
    
    const posts = response.data.data.children || [];
    console.log(`✅ Connexion Reddit réussie`);
    console.log(`📊 ${posts.length} posts trouvés pour r/japanlife`);
    
    if (posts.length > 0) {
      const firstPost = posts[0].data;
      console.log(`📝 Premier post: "${firstPost.title}"`);
      console.log(`⭐ Score: ${firstPost.score} upvotes`);
      console.log(`🔗 URL: https://reddit.com${firstPost.permalink}`);
    }
    
    return true;
  } catch (error) {
    console.log('❌ Erreur connexion Reddit:', error.message);
    return false;
  }
}

async function testRedditContentGenerator() {
  console.log('\n🔧 Test du générateur de contenu Reddit...');
  
  try {
    // Démarrer le générateur en arrière-plan
    const { spawn } = await import('child_process');
    const generator = spawn('node', ['reddit-enhanced-content-generator.js'], {
      detached: true,
      stdio: 'ignore'
    });
    
    // Attendre que le serveur démarre
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Tester la génération de contenu
    const response = await axios.post(`http://localhost:${REDDIT_CONTENT_PORT}/mcp`, {
      method: 'generate_quartier_guide',
      params: {
        destination: 'tokyo',
        quartier: 'shibuya',
        spots_count: 5
      }
    });
    
    const result = response.data.result;
    console.log('✅ Générateur de contenu Reddit fonctionne');
    console.log(`📝 Titre généré: ${result.title}`);
    console.log(`📊 Type: ${result.type}`);
    console.log(`🌏 Destination: ${result.destination}`);
    console.log(`🏘️ Quartier: ${result.quartier}`);
    
    // Arrêter le générateur
    generator.kill();
    
    return true;
  } catch (error) {
    console.log('❌ Erreur générateur Reddit:', error.message);
    return false;
  }
}

async function testRedditAdviceRetrieval() {
  console.log('\n🎯 Test de récupération de conseils Reddit...');
  
  try {
    const destinations = ['tokyo', 'bangkok', 'seoul'];
    const results = [];
    
    for (const destination of destinations) {
      const subredditMap = {
        'tokyo': 'japanlife',
        'bangkok': 'Thailand',
        'seoul': 'korea'
      };
      
      const subreddit = subredditMap[destination];
      const response = await axios.get(`https://www.reddit.com/r/${subreddit}/search.json`, {
        params: {
          q: `${destination} expat advice tips local`,
          sort: 'top',
          t: 'year',
          limit: 10,
          raw_json: 1
        },
        headers: {
          'User-Agent': 'FlashVoyages-Test/1.0'
        },
        timeout: 10000
      });
      
      const posts = response.data.data.children || [];
      const relevantPosts = posts
        .map(post => ({
          title: post.data.title,
          score: post.data.score,
          content: post.data.selftext.substring(0, 100) + '...'
        }))
        .filter(post => post.score >= 5)
        .slice(0, 3);
      
      results.push({
        destination,
        subreddit,
        posts: relevantPosts.length,
        topPost: relevantPosts[0]?.title || 'Aucun post trouvé'
      });
      
      console.log(`✅ ${destination} (r/${subreddit}): ${relevantPosts.length} conseils trouvés`);
    }
    
    return results;
  } catch (error) {
    console.log('❌ Erreur récupération conseils:', error.message);
    return [];
  }
}

async function testContentQuality() {
  console.log('\n📊 Test de qualité du contenu généré...');
  
  try {
    const response = await axios.post(`http://localhost:${REDDIT_CONTENT_PORT}/mcp`, {
      method: 'generate_quartier_guide',
      params: {
        destination: 'tokyo',
        quartier: 'shibuya',
        spots_count: 7
      }
    });
    
    const result = response.data.result;
    const content = result.content;
    
    // Analyser la qualité du contenu
    const hasRedditSource = content.includes('Conseils authentiques d\'expats');
    const hasSpotsSecrets = content.includes('Spots secrets');
    const hasTiming = content.includes('Meilleur timing');
    const hasBudget = content.includes('Budget local vs touristique');
    const hasErrors = content.includes('Erreurs à éviter');
    const hasItinerary = content.includes('Itinéraire parfait');
    
    const qualityScore = [hasRedditSource, hasSpotsSecrets, hasTiming, hasBudget, hasErrors, hasItinerary]
      .filter(Boolean).length;
    
    console.log(`✅ Qualité du contenu: ${qualityScore}/6 sections`);
    console.log(`🔗 Source Reddit: ${hasRedditSource ? 'Oui' : 'Non'}`);
    console.log(`📍 Spots secrets: ${hasSpotsSecrets ? 'Oui' : 'Non'}`);
    console.log(`⏰ Timing: ${hasTiming ? 'Oui' : 'Non'}`);
    console.log(`💰 Budget: ${hasBudget ? 'Oui' : 'Non'}`);
    console.log(`🚨 Erreurs: ${hasErrors ? 'Oui' : 'Non'}`);
    console.log(`🎯 Itinéraire: ${hasItinerary ? 'Oui' : 'Non'}`);
    
    return qualityScore >= 4;
  } catch (error) {
    console.log('❌ Erreur test qualité:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Test d\'intégration Reddit - FlashVoyages\n');
  
  const results = {
    redditConnection: await testRedditConnection(),
    contentGenerator: await testRedditContentGenerator(),
    adviceRetrieval: await testRedditAdviceRetrieval(),
    contentQuality: await testContentQuality()
  };
  
  console.log('\n📊 Résumé des tests:');
  console.log('==================');
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅' : '❌';
    const testName = {
      redditConnection: 'Connexion Reddit API',
      contentGenerator: 'Générateur de contenu',
      adviceRetrieval: 'Récupération conseils',
      contentQuality: 'Qualité du contenu'
    }[test];
    
    console.log(`${status} ${testName}`);
  });
  
  const allPassed = Object.values(results).every(result => 
    Array.isArray(result) ? result.length > 0 : result
  );
  
  if (allPassed) {
    console.log('\n🎉 Tous les tests sont passés !');
    console.log('✅ L\'intégration Reddit fonctionne parfaitement');
    console.log('\n📋 Prochaines étapes:');
    console.log('1. Mettre à jour le workflow GitHub Actions');
    console.log('2. Remplacer l\'ancien générateur par le nouveau');
    console.log('3. Tester la publication automatique');
    console.log('4. Votre contenu sera maintenant basé sur de vrais conseils d\'expats !');
  } else {
    console.log('\n⚠️ Certains tests ont échoué');
    console.log('❌ Vérifiez la configuration avant de continuer');
  }
  
  return allPassed;
}

// Exécuter les tests
runAllTests().catch(console.error);
