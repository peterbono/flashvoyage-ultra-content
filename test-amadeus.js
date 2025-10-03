#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const AMADEUS_CLIENT_ID = process.env.AMADEUS_CLIENT_ID;
const AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET;

async function testAmadeusAPI() {
  console.log('🧪 Test de l\'API Amadeus...\n');
  
  try {
    // 1. Obtenir le token d'accès
    console.log('🔑 Récupération du token Amadeus...');
    const tokenResponse = await axios.post('https://test.api.amadeus.com/v1/security/oauth2/token', 
      `client_id=${AMADEUS_CLIENT_ID}&client_secret=${AMADEUS_CLIENT_SECRET}&grant_type=client_credentials`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );
    
    const accessToken = tokenResponse.data.access_token;
    console.log('✅ Token obtenu avec succès\n');
    
    // 2. Rechercher des vols Paris -> Tokyo
    console.log('✈️ Recherche de vols Paris -> Tokyo...');
    const flightResponse = await axios.get('https://test.api.amadeus.com/v2/shopping/flight-offers', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      params: {
        originLocationCode: 'CDG',
        destinationLocationCode: 'NRT',
        departureDate: '2025-06-15',
        adults: 1,
        max: 5
      }
    });
    
    const flights = flightResponse.data.data;
    console.log(`✅ ${flights.length} vols trouvés\n`);
    
    // 3. Afficher les résultats
    flights.forEach((flight, index) => {
      const price = flight.price.total;
      const currency = flight.price.currency;
      const segments = flight.itineraries[0].segments;
      const departure = segments[0].departure.iataCode;
      const arrival = segments[segments.length - 1].arrival.iataCode;
      const duration = flight.itineraries[0].duration;
      
      console.log(`✈️ Vol ${index + 1}:`);
      console.log(`   💰 Prix: ${price} ${currency}`);
      console.log(`   🛫 Départ: ${departure}`);
      console.log(`   🛬 Arrivée: ${arrival}`);
      console.log(`   ⏱️ Durée: ${duration}`);
      console.log(`   🏢 Compagnie: ${segments[0].carrierCode}`);
      console.log('');
    });
    
    console.log('🎉 Test Amadeus réussi ! L\'API fonctionne parfaitement.');
    
  } catch (error) {
    console.error('❌ Erreur lors du test Amadeus:', error.response ? error.response.data : error.message);
  }
}

testAmadeusAPI();
