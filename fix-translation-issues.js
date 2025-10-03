#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function fixTranslationIssues(articleId) {
  try {
    // Récupérer l'article
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    let content = response.data.content.rendered;
    
    // Corriger les traductions
    content = content.replace(/china/g, 'Chine');
    content = content.replace(/India-Chine/g, 'Inde-Chine');
    content = content.replace(/India-China/g, 'Inde-Chine');
    
    // Mettre à jour l'article
    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      content: content
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('✅ Traductions corrigées dans l\'article', articleId);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

// Corriger l'article 509
fixTranslationIssues(509);

