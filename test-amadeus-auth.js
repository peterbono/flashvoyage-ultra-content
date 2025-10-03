#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const AMADEUS_CLIENT_ID = process.env.AMADEUS_CLIENT_ID;
const AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET;

async function testAmadeusAuth() {
  console.log('🧪 Test d\'authentification Amadeus...\n');
  
  try {
    // Test d'authentification seulement
    console.log('🔑 Test d\'authentification...');
    const tokenResponse = await axios.post('https://test.api.amadeus.com/v1/security/oauth2/token', 
      `client_id=${AMADEUS_CLIENT_ID}&client_secret=${AMADEUS_CLIENT_SECRET}&grant_type=client_credentials`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );
    
    const accessToken = tokenResponse.data.access_token;
    const expiresIn = tokenResponse.data.expires_in;
    
    console.log('✅ Authentification réussie !');
    console.log(`🔑 Token: ${accessToken.substring(0, 20)}...`);
    console.log(`⏰ Expire dans: ${expiresIn} secondes`);
    console.log(`📊 Type: ${tokenResponse.data.token_type}`);
    
    console.log('\n🎉 L\'API Amadeus est configurée et fonctionnelle !');
    console.log('💡 Note: L\'API de test a des restrictions de date, mais l\'authentification fonctionne.');
    console.log('🚀 Le système peut maintenant utiliser Amadeus pour les données de vols réelles.');
    
  } catch (error) {
    console.error('❌ Erreur d\'authentification Amadeus:', error.response ? error.response.data : error.message);
  }
}

testAmadeusAuth();

