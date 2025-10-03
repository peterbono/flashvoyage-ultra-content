#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function fixTitleTranslation(articleId) {
  try {
    // Récupérer l'article
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const currentTitle = response.data.title.rendered;
    console.log('Titre actuel:', currentTitle);
    
    // Traduire le titre en français
    const frenchTitle = '🌏 Chine : IndiGo reprend les vols directs Inde-Chine, itinéraires et date de lancement confirmés';
    
    // Mettre à jour l'article
    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      title: frenchTitle
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('✅ Titre traduit en français:', frenchTitle);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

// Corriger le titre de l'article 509
fixTitleTranslation(509);

