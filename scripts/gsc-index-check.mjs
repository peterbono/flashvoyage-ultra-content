import { google } from 'googleapis';
import { readFileSync } from 'fs';

const SA_PATH = '/Users/floriangouloubi/flashvoyage-content/ga4-service-account.json';
const SITE_URL = 'https://flashvoyage.com/';
const SITE_URL_SC = 'sc-domain:flashvoyage.com';

const sa = JSON.parse(readFileSync(SA_PATH, 'utf-8'));
const auth = new google.auth.GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});

const searchconsole = google.searchconsole({ version: 'v1', auth });

// Try both site URL formats
for (const siteUrl of [SITE_URL, SITE_URL_SC]) {
  try {
    console.log(`\n=== Trying siteUrl: ${siteUrl} ===`);
    
    // Get indexed pages count via search analytics
    const resp = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: '2026-03-15',
        endDate: '2026-04-15',
        dimensions: ['page'],
        rowLimit: 500,
        type: 'web',
      },
    });
    
    const pages = resp.data.rows || [];
    console.log(`Pages with impressions: ${pages.length}`);
    
    // Sort by impressions desc
    pages.sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
    console.log('\nTop 10 pages by impressions:');
    for (const p of pages.slice(0, 10)) {
      const url = p.keys[0].replace('https://flashvoyage.com/', '/');
      console.log(`  ${String(Math.round(p.impressions)).padStart(5)} imp  ${String(Math.round(p.clicks)).padStart(3)} clk  pos ${p.position?.toFixed(1)}  ${url.slice(0, 70)}`);
    }
    
    // Pages with 0 clicks
    const zeroClicks = pages.filter(p => p.clicks === 0);
    console.log(`\nPages with impressions but 0 clicks: ${zeroClicks.length}`);
    
    // Check total impressions + clicks
    const totalImp = pages.reduce((s, p) => s + (p.impressions || 0), 0);
    const totalClk = pages.reduce((s, p) => s + (p.clicks || 0), 0);
    const avgPos = pages.reduce((s, p) => s + (p.position || 0), 0) / (pages.length || 1);
    console.log(`\nTotals: ${Math.round(totalImp)} impressions, ${Math.round(totalClk)} clicks, avg position ${avgPos.toFixed(1)}`);
    
    break; // success
  } catch (e) {
    console.log(`Failed: ${e.message}`);
  }
}
