#!/usr/bin/env node
/**
 * Genere un sitemap XML a partir des articles et pages publies sur WordPress,
 * et le pousse via l'API WordPress media ou l'ecrit localement.
 *
 * Usage:
 *   node scripts/generate-sitemap.js              # genere et affiche
 *   node scripts/generate-sitemap.js --submit     # genere + ping Google
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function fetchAllContent() {
  const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('../config.js');
  const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}` };

  const urls = [];

  // Homepage
  urls.push({ loc: WORDPRESS_URL + '/', priority: '1.0', changefreq: 'daily' });

  // Posts
  for (let page = 1; page <= 20; page++) {
    try {
      const resp = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        headers, params: { status: 'publish', per_page: 100, page, _fields: 'link,modified' },
      });
      for (const p of resp.data) {
        urls.push({ loc: p.link, lastmod: p.modified?.split('T')[0], priority: '0.8', changefreq: 'monthly' });
      }
      const total = parseInt(resp.headers['x-wp-totalpages'] || '1', 10);
      if (page >= total) break;
    } catch { break; }
  }

  // Pages
  for (let page = 1; page <= 10; page++) {
    try {
      const resp = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/pages`, {
        headers, params: { status: 'publish', per_page: 100, page, _fields: 'link,modified' },
      });
      for (const p of resp.data) {
        urls.push({ loc: p.link, lastmod: p.modified?.split('T')[0], priority: '0.6', changefreq: 'monthly' });
      }
      const total = parseInt(resp.headers['x-wp-totalpages'] || '1', 10);
      if (page >= total) break;
    } catch { break; }
  }

  return urls;
}

function buildSitemapXml(urls) {
  const entries = urls.map(u => {
    let entry = `  <url>\n    <loc>${u.loc}</loc>`;
    if (u.lastmod) entry += `\n    <lastmod>${u.lastmod}</lastmod>`;
    if (u.changefreq) entry += `\n    <changefreq>${u.changefreq}</changefreq>`;
    if (u.priority) entry += `\n    <priority>${u.priority}</priority>`;
    entry += `\n  </url>`;
    return entry;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;
}

async function main() {
  const args = process.argv.slice(2);

  console.log('🗺️  Generation du sitemap XML...\n');

  const urls = await fetchAllContent();
  console.log(`📊 ${urls.length} URLs collectees (${urls.filter(u => u.priority === '0.8').length} articles, ${urls.filter(u => u.priority === '0.6').length} pages)`);

  const xml = buildSitemapXml(urls);

  // Ecrire localement
  const outPath = path.join(__dirname, '..', 'sitemap.xml');
  fs.writeFileSync(outPath, xml);
  console.log(`✅ Sitemap ecrit: ${outPath} (${(xml.length / 1024).toFixed(1)} Ko)`);

  // Ping Google si --submit
  if (args.includes('--submit')) {
    const { WORDPRESS_URL } = await import('../config.js');
    const sitemapUrl = `${WORDPRESS_URL}/sitemap.xml`;
    try {
      await axios.get(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
      console.log(`📡 Google ping: ${sitemapUrl}`);
    } catch (err) {
      console.warn(`⚠️ Google ping echoue: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});
