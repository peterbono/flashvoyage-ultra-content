#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function cleanArticleCSS(articleId) {
  try {
    // Récupérer l'article
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    let content = response.data.content.rendered;
    
    // Supprimer les CSS dégueulasses
    content = content.replace(/<style[^>]*>.*?<\/style>/gis, '');
    content = content.replace(/style="[^"]*"/gi, '');
    content = content.replace(/class="[^"]*"/gi, '');
    content = content.replace(/<div[^>]*>\s*<\/div>/gi, '');
    content = content.replace(/<p[^>]*>\s*<\/p>/gi, '');
    
    // Nettoyer le HTML
    content = content.replace(/\s+/g, ' ').trim();
    
    // Mettre à jour l'article
    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      content: content
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('✅ CSS dégueulasses supprimées de l\'article', articleId);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

// Nettoyer l'article 503 (le dernier publié)
cleanArticleCSS(503);

