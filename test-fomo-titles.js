#!/usr/bin/env node

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

// Codes aéroports pour les destinations asiatiques
const AIRPORT_CODES = {
  'china': { origin: 'CDG', destination: 'PEK', city: 'Pékin' },
  'japan': { origin: 'CDG', destination: 'NRT', city: 'Tokyo' },
  'korea': { origin: 'CDG', destination: 'ICN', city: 'Séoul' },
  'vietnam': { origin: 'CDG', destination: 'SGN', city: 'Ho Chi Minh' },
  'thailand': { origin: 'CDG', destination: 'BKK', city: 'Bangkok' },
  'singapore': { origin: 'CDG', destination: 'SIN', city: 'Singapour' },
  'malaysia': { origin: 'CDG', destination: 'KUL', city: 'Kuala Lumpur' },
  'indonesia': { origin: 'CDG', destination: 'CGK', city: 'Jakarta' },
  'philippines': { origin: 'CDG', destination: 'MNL', city: 'Manille' },
  'taiwan': { origin: 'CDG', destination: 'TPE', city: 'Taipei' },
  'hong kong': { origin: 'CDG', destination: 'HKG', city: 'Hong Kong' }
};

function generateFOMOTitle(originalTitle, destination, articleType) {
  const destinationFrench = destination === 'china' ? 'Chine' :
                           destination === 'korea' ? 'Corée du Sud' :
                           destination === 'japan' ? 'Japon' :
                           destination === 'vietnam' ? 'Vietnam' :
                           destination === 'thailand' ? 'Thaïlande' :
                           destination === 'singapore' ? 'Singapour' :
                           destination === 'malaysia' ? 'Malaisie' :
                           destination === 'indonesia' ? 'Indonésie' :
                           destination === 'philippines' ? 'Philippines' :
                           destination === 'taiwan' ? 'Taïwan' :
                           destination === 'hong kong' ? 'Hong Kong' :
                           destination;

  const fomoTemplates = {
    'transport': [
      `🚨 URGENT : Nouveaux vols vers ${destinationFrench} - Prix en chute libre !`,
      `✈️ ${destinationFrench} : Vols directs rétablis - Réservez MAINTENANT !`,
      `🔥 OFFRE LIMITÉE : Vols ${destinationFrench} à prix cassés !`,
      `⚡ ${destinationFrench} : Compagnies aériennes en guerre des prix !`,
      `🎯 ${destinationFrench} : Vols directs confirmés - Ne ratez pas ça !`
    ],
    'formalités': [
      `🎉 RÉVOLUTION : ${destinationFrench} simplifie les visas !`,
      `🚀 ${destinationFrench} : Visa gratuit pour les Français !`,
      `⚡ URGENT : Nouvelles règles visa ${destinationFrench} !`,
      `🔥 ${destinationFrench} : Formalités réduites de 50% !`,
      `🎯 ${destinationFrench} : Visa express en 24h !`
    ],
    'actualité': [
      `🚨 ${destinationFrench} : Changement MAJEUR pour les voyageurs !`,
      `⚡ URGENT : ${destinationFrench} modifie ses règles !`,
      `🔥 ${destinationFrench} : Nouvelle réglementation en vigueur !`,
      `🎯 ${destinationFrench} : Décision qui change tout !`,
      `🚀 ${destinationFrench} : Révolution pour le tourisme !`
    ]
  };

  const templates = fomoTemplates[articleType] || fomoTemplates['actualité'];
  const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
  
  return randomTemplate;
}

async function testFOMOTitles() {
  console.log('🎯 Test des titres FOMO FlashVoyages\n');

  const testCases = [
    { title: 'Japan, South Korea, and Australia See Flight Increases to China', destination: 'korea', type: 'formalités' },
    { title: 'IndiGo First to Resume India-China Direct Flights', destination: 'china', type: 'transport' },
    { title: 'Vietnam offers visa-free travel for French citizens', destination: 'vietnam', type: 'formalités' },
    { title: 'Thailand announces new tourism regulations', destination: 'thailand', type: 'actualité' }
  ];

  testCases.forEach((testCase, index) => {
    const fomoTitle = generateFOMOTitle(testCase.title, testCase.destination, testCase.type);
    console.log(`📰 Test ${index + 1}:`);
    console.log(`   Original: ${testCase.title}`);
    console.log(`   FOMO: ${fomoTitle}`);
    console.log(`   Destination: ${testCase.destination} | Type: ${testCase.type}\n`);
  });

  console.log('✅ Test des titres FOMO terminé !');
}

testFOMOTitles().catch(console.error);
