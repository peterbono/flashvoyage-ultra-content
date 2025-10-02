#!/usr/bin/env node

import dotenv from 'dotenv';
import axios from 'axios';

// Charger les variables d'environnement
dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://votre-site-wordpress.com';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || '';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || '';

async function testWordPressConnection() {
  console.log('🔍 Test de connexion à WordPress...');
  console.log(`URL: ${WORDPRESS_URL}`);
  console.log(`Utilisateur: ${WORDPRESS_USERNAME}`);
  
  try {
    // Test de l'API REST WordPress
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      params: {
        per_page: 1
      }
    });
    
    console.log('✅ Connexion réussie !');
    console.log(`Nombre d'articles trouvés: ${response.data.length}`);
    
    if (response.data.length > 0) {
      console.log('📄 Premier article:');
      console.log(`- Titre: ${response.data[0].title.rendered}`);
      console.log(`- ID: ${response.data[0].id}`);
      console.log(`- Statut: ${response.data[0].status}`);
    }
    
  } catch (error) {
    console.error('❌ Erreur de connexion:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Message: ${error.response.data?.message || error.message}`);
    } else {
      console.error(`Erreur: ${error.message}`);
    }
    
    console.log('\n💡 Vérifiez:');
    console.log('1. Que l\'URL WordPress est correcte');
    console.log('2. Que les identifiants sont corrects');
    console.log('3. Que l\'API REST est activée sur votre site');
    console.log('4. Que vous avez généré un mot de passe d\'application');
  }
}

// Exécuter le test
testWordPressConnection();


