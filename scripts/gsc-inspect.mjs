import { google } from 'googleapis';
import { readFileSync } from 'fs';

const SA_PATH = '/Users/floriangouloubi/flashvoyage-content/ga4-service-account.json';
const SITE_URL = 'https://flashvoyage.com/';

const sa = JSON.parse(readFileSync(SA_PATH, 'utf-8'));
const auth = new google.auth.GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});

const searchconsole = google.searchconsole({ version: 'v1', auth });

// Sample URLs to inspect — mix of indexed + non-indexed
const TEST_URLS = [
  // Indexed (from impressions data)
  'https://flashvoyage.com/assurance-voyage-vietnam-rapatriement-frais-caches-2026/',
  'https://flashvoyage.com/esim-philippines-globe-smart-comparatif-2026/',
  // Probably NOT indexed (recent, low traffic)
  'https://flashvoyage.com/pourquoi-ton-premier-mois-en-coree-du-sud-te-coutera-plus-cher-que-prevu/',
  'https://flashvoyage.com/thailande-ou-vietnam-en-2026-larbitrage-qui-change-tout/',
  'https://flashvoyage.com/esim-japon-combien-ca-te-coute-vraiment/',
  // Category page
  'https://flashvoyage.com/category/destination/',
];

for (const url of TEST_URLS) {
  try {
    const resp = await searchconsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: url,
        siteUrl: SITE_URL,
      },
    });
    const result = resp.data.inspectionResult;
    const idx = result.indexStatusResult;
    const slug = url.replace(SITE_URL, '/').slice(0, 55);
    console.log(`${slug.padEnd(55)} | verdict: ${idx?.verdict || '?'} | coverage: ${idx?.coverageState || '?'} | robotsTxt: ${idx?.robotsTxtState || '?'} | indexing: ${idx?.indexingState || '?'} | lastCrawl: ${idx?.lastCrawlTime?.slice(0,10) || '?'}`);
  } catch (e) {
    console.log(`${url.slice(30,80).padEnd(55)} | ERROR: ${e.message.slice(0, 100)}`);
  }
}
