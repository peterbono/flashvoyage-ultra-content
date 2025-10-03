#!/usr/bin/env node

import express from 'express';
import axios from 'axios';
import xml2js from 'xml2js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3003;

app.use(express.json());

// Sources RSS pour l'Asie et le voyage
const rssFeeds = {
  'travel_news': [
    'http://rss.cnn.com/rss/edition_travel.rss',
    'https://skift.com/feed/'
  ],
  'asia_news': [
    'https://news.google.com/rss/search?q=travel+asia&hl=en&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=travel+japan&hl=en&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=travel+thailand&hl=en&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=travel+korea&hl=en&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=travel+singapore&hl=en&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=travel+vietnam&hl=en&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=travel+philippines&hl=en&gl=US&ceid=US:en'
  ]
};

class RSSMonitor {
  constructor() {
    this.parser = new xml2js.Parser();
  }

  async fetchRSSFeed(url) {
    try {
      console.log(`📡 Récupération de ${url}...`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FlashVoyagesRSSMonitor/1.0)'
        }
      });
      
      const result = await this.parser.parseStringPromise(response.data);
      return this.parseRSSData(result);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération de ${url}:`, error.message);
      return [];
    }
  }

  parseRSSData(xmlData) {
    const items = [];
    
    try {
      const channel = xmlData.rss?.channel?.[0];
      if (!channel) return items;

      const feedItems = channel.item || [];
      
      for (const item of feedItems) {
        const title = item.title?.[0] || 'Sans titre';
        const description = item.description?.[0] || item.summary?.[0] || '';
        const link = item.link?.[0] || '';
        const pubDate = item.pubDate?.[0] || new Date().toISOString();
        
        items.push({
          title: title.trim(),
          content: description.trim(),
          link: link.trim(),
          pubDate: pubDate.trim(),
          source: channel.title?.[0] || 'RSS Feed'
        });
      }
    } catch (error) {
      console.error('❌ Erreur lors du parsing RSS:', error.message);
    }
    
    return items;
  }

  async monitorFeeds(feedType = 'all') {
    console.log(`🔍 Surveillance des flux RSS (${feedType})...`);
    const allArticles = [];
    
    const feedsToCheck = feedType === 'all' 
      ? [...rssFeeds.travel_news, ...rssFeeds.asia_news]
      : rssFeeds[feedType] || [];
    
    for (const feedUrl of feedsToCheck) {
      const articles = await this.fetchRSSFeed(feedUrl);
      allArticles.push(...articles);
    }
    
    console.log(`✅ ${allArticles.length} articles récupérés`);
    return allArticles;
  }
}

const rssMonitor = new RSSMonitor();

// Endpoint MCP pour la compatibilité
app.post('/mcp', async (req, res) => {
  try {
    const { method, params } = req.body;
    
    if (method === 'rss/monitor_feeds') {
      const { feedType = 'all' } = params || {};
      const articles = await rssMonitor.monitorFeeds(feedType);
      
      res.json({
        jsonrpc: "2.0",
        result: articles,
        id: req.body.id || 1
      });
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32601, message: "Method not found" },
        id: req.body.id || 1
      });
    }
  } catch (error) {
    console.error('❌ Erreur MCP:', error.message);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal error" },
      id: req.body.id || 1
    });
  }
});

// Endpoint de test
app.get('/test', async (req, res) => {
  try {
    const articles = await rssMonitor.monitorFeeds('all');
    res.json({
      success: true,
      count: articles.length,
      articles: articles.slice(0, 5) // Afficher seulement les 5 premiers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur RSS HTTP démarré sur le port ${PORT}`);
  console.log(`🔗 Endpoint MCP: http://localhost:${PORT}/mcp`);
  console.log(`🧪 Endpoint test: http://localhost:${PORT}/test`);
});

