#!/usr/bin/env node

/**
 * LIVE DATA ENRICHER
 * Injecte des donnees temps reel dans les articles :
 * - Prix vols (TravelPayouts/Aviasales API — deja en .env)
 * - Cout de la vie (dataset statique, maj trimestrielle)
 * - Niveau securite pays (Global Peace Index — dataset statique)
 * - Infos pays (REST Countries API — gratuite, sans cle)
 *
 * Toutes les donnees API sont cachees 24h sur disque dans data/live-cache/
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { DESTINATION_ALIASES, COUNTRY_DISPLAY_NAMES } from './destinations.js';

// Travel Advisory has a misconfigured SSL cert — allow it for this source only
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, 'data', 'live-cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const TRAVELPAYOUTS_TOKEN = process.env.TRAVELPAYOUTS_API_TOKEN || process.env.TRAVELPAYOUT_API || '';

const COUNTRY_ISO_MAP = {
  japan: 'JP', thailand: 'TH', vietnam: 'VN', indonesia: 'ID',
  korea: 'KR', philippines: 'PH', malaysia: 'MY', cambodia: 'KH',
  singapore: 'SG', laos: 'LA', myanmar: 'MM', taiwan: 'TW',
  india: 'IN', nepal: 'NP', 'sri lanka': 'LK', morocco: 'MA',
  turkey: 'TR', greece: 'GR', spain: 'ES', portugal: 'PT',
  italy: 'IT', croatia: 'HR', mexico: 'MX', colombia: 'CO',
  peru: 'PE', brazil: 'BR', argentina: 'AR', chile: 'CL',
  egypt: 'EG', kenya: 'KE', 'south africa': 'ZA', tanzania: 'TZ',
};


class LiveDataEnricher {
  constructor() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  // --- Cache layer ---

  _cacheKey(provider, query) {
    const safe = String(query).toLowerCase().replace(/[^a-z0-9]/g, '_');
    return path.join(CACHE_DIR, `${provider}_${safe}.json`);
  }

  _readCache(provider, query) {
    const file = this._cacheKey(provider, query);
    try {
      if (!fs.existsSync(file)) return null;
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Date.now() - raw._cachedAt > CACHE_TTL_MS) return null;
      return raw.data;
    } catch { return null; }
  }

  _writeCache(provider, query, data) {
    const file = this._cacheKey(provider, query);
    try {
      fs.writeFileSync(file, JSON.stringify({ _cachedAt: Date.now(), data }, null, 2));
    } catch (e) {
      console.warn(`⚠️ LIVE_DATA: cache write failed for ${provider}/${query}: ${e.message}`);
    }
  }

  // --- Safety data (Global Peace Index 2024 — static dataset) ---
  // Scale: 1 = very safe, 5 = very dangerous (lower is better)

  fetchSafetyScore(countryCode) {
    const SAFETY_SCORES = {
      JP: { score: 1.3, level: 'Tres sur' },
      SG: { score: 1.3, level: 'Tres sur' },
      MY: { score: 1.7, level: 'Sur' },
      TW: { score: 1.4, level: 'Tres sur' },
      KR: { score: 1.6, level: 'Tres sur' },
      VN: { score: 1.8, level: 'Sur' },
      TH: { score: 2.1, level: 'Precautions normales' },
      ID: { score: 2.0, level: 'Precautions normales' },
      LK: { score: 2.2, level: 'Precautions normales' },
      KH: { score: 2.1, level: 'Precautions normales' },
      LA: { score: 1.9, level: 'Sur' },
      NP: { score: 2.1, level: 'Precautions normales' },
      IN: { score: 2.6, level: 'Vigilance renforcee' },
      PH: { score: 2.5, level: 'Vigilance renforcee' },
      MM: { score: 3.4, level: 'Deconseille sauf raison imperative' },
      MA: { score: 2.0, level: 'Precautions normales' },
      TR: { score: 2.4, level: 'Precautions normales' },
      GR: { score: 1.6, level: 'Tres sur' },
      ES: { score: 1.6, level: 'Tres sur' },
      PT: { score: 1.3, level: 'Tres sur' },
      IT: { score: 1.6, level: 'Tres sur' },
      HR: { score: 1.5, level: 'Tres sur' },
      MX: { score: 2.9, level: 'Vigilance renforcee' },
      CO: { score: 2.7, level: 'Vigilance renforcee' },
      PE: { score: 2.3, level: 'Precautions normales' },
      BR: { score: 2.6, level: 'Vigilance renforcee' },
      AR: { score: 1.9, level: 'Sur' },
      CL: { score: 1.8, level: 'Sur' },
      EG: { score: 2.5, level: 'Vigilance renforcee' },
      KE: { score: 2.5, level: 'Vigilance renforcee' },
      ZA: { score: 2.7, level: 'Vigilance renforcee' },
      TZ: { score: 2.1, level: 'Precautions normales' },
    };
    if (!countryCode) return null;
    return SAFETY_SCORES[countryCode] || null;
  }

  // --- API: REST Countries (gratuite, sans cle) ---

  async fetchCountryInfo(countryCode) {
    if (!countryCode) return null;
    const cached = this._readCache('country', countryCode);
    if (cached) return cached;

    try {
      const resp = await axios.get(`https://restcountries.com/v3.1/alpha/${countryCode}?fields=name,currencies,languages,timezones,capital`, { timeout: 8000 });
      const d = resp.data;
      const currencies = d.currencies ? Object.values(d.currencies).map(c => `${c.name} (${c.symbol || ''})`).join(', ') : 'N/A';
      const languages = d.languages ? Object.values(d.languages).join(', ') : 'N/A';
      const result = {
        name: d.name?.common || '',
        capital: Array.isArray(d.capital) ? d.capital[0] : (d.capital || ''),
        currencies,
        languages,
        timezone: Array.isArray(d.timezones) ? d.timezones[0] : '',
      };
      this._writeCache('country', countryCode, result);
      return result;
    } catch (e) {
      console.warn(`⚠️ LIVE_DATA: REST Countries failed for ${countryCode}: ${e.message}`);
      return null;
    }
  }

  // --- API: TravelPayouts/Aviasales (token deja en .env) ---

  async fetchFlightPrice(destinationCity, countryCode) {
    if (!TRAVELPAYOUTS_TOKEN) return null;

    const IATA_MAP = {
      JP: 'TYO', TH: 'BKK', VN: 'HAN', ID: 'DPS', KR: 'SEL',
      PH: 'MNL', MY: 'KUL', KH: 'PNH', SG: 'SIN', LA: 'VTE',
      MM: 'RGN', TW: 'TPE', IN: 'DEL', NP: 'KTM', LK: 'CMB',
      MA: 'RAK', TR: 'IST', GR: 'ATH', ES: 'BCN', PT: 'LIS',
      IT: 'ROM', HR: 'ZAG', MX: 'MEX', CO: 'BOG', PE: 'LIM',
      BR: 'GIG', AR: 'BUE', CL: 'SCL', EG: 'CAI', KE: 'NBO',
      ZA: 'JNB', TZ: 'DAR',
    };
    const destIata = IATA_MAP[countryCode];
    if (!destIata) return null;

    const cacheQ = `par_${destIata}`;
    const cached = this._readCache('travelpayouts', cacheQ);
    if (cached) return cached;

    try {
      const resp = await axios.get('https://api.travelpayouts.com/aviasales/v3/prices_for_dates', {
        params: { origin: 'PAR', destination: destIata, currency: 'eur', token: TRAVELPAYOUTS_TOKEN },
        timeout: 10000,
      });
      const flights = resp.data?.data || [];
      if (flights.length === 0) return null;
      const prices = flights.map(f => f.price);
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      const min = Math.min(...prices);
      const result = { avgPrice: avg, minPrice: min, currency: 'EUR', sampleSize: flights.length, origin: 'Paris' };
      this._writeCache('travelpayouts', cacheQ, result);
      return result;
    } catch (e) {
      console.warn(`⚠️ LIVE_DATA: TravelPayouts flight API failed for ${destIata}: ${e.message}`);
      return null;
    }
  }

  // --- Cost of living (dataset statique, sources: Numbeo/Expatistan/backpacker indexes Q1 2026) ---
  // Prix en EUR. Mise a jour recommandee: 1x par trimestre.

  fetchCostOfLiving(city, country) {
    const key = (city || country || '').toLowerCase();

    const COST_DATA = {
      // Asie du Sud-Est
      bangkok:       { mealCheap: 3, mealMid: 15, transport: 0.8,  hotelBudget: 15, beer: 2.5 },
      'chiang mai':  { mealCheap: 2, mealMid: 10, transport: 0.6,  hotelBudget: 10, beer: 2 },
      bali:          { mealCheap: 3, mealMid: 12, transport: 0.5,  hotelBudget: 15, beer: 3 },
      ubud:          { mealCheap: 3, mealMid: 12, transport: 0.5,  hotelBudget: 15, beer: 3 },
      jakarta:       { mealCheap: 2, mealMid: 10, transport: 0.3,  hotelBudget: 12, beer: 3.5 },
      hanoi:         { mealCheap: 2, mealMid: 10, transport: 0.3,  hotelBudget: 12, beer: 1 },
      'ho chi minh': { mealCheap: 2, mealMid: 10, transport: 0.3,  hotelBudget: 12, beer: 1 },
      'da nang':     { mealCheap: 2, mealMid: 8,  transport: 0.3,  hotelBudget: 10, beer: 1 },
      'phnom penh':  { mealCheap: 2, mealMid: 8,  transport: 0.5,  hotelBudget: 10, beer: 1 },
      'siem reap':   { mealCheap: 2, mealMid: 7,  transport: 0.5,  hotelBudget: 8,  beer: 0.8 },
      manila:        { mealCheap: 2, mealMid: 10, transport: 0.3,  hotelBudget: 12, beer: 1.5 },
      cebu:          { mealCheap: 2, mealMid: 8,  transport: 0.3,  hotelBudget: 10, beer: 1 },
      singapore:     { mealCheap: 5, mealMid: 25, transport: 1.5,  hotelBudget: 40, beer: 8 },
      'kuala lumpur': { mealCheap: 2, mealMid: 10, transport: 0.6, hotelBudget: 15, beer: 4 },
      vientiane:     { mealCheap: 2, mealMid: 7,  transport: 0.5,  hotelBudget: 10, beer: 1.5 },
      // Asie de l'Est
      tokyo:         { mealCheap: 7, mealMid: 20, transport: 2.5,  hotelBudget: 30, beer: 4 },
      kyoto:         { mealCheap: 7, mealMid: 20, transport: 2,    hotelBudget: 25, beer: 4 },
      osaka:         { mealCheap: 6, mealMid: 18, transport: 2,    hotelBudget: 25, beer: 4 },
      seoul:         { mealCheap: 6, mealMid: 18, transport: 1.2,  hotelBudget: 25, beer: 4 },
      taipei:        { mealCheap: 4, mealMid: 15, transport: 0.5,  hotelBudget: 20, beer: 3 },
      // Asie du Sud
      delhi:         { mealCheap: 2, mealMid: 8,  transport: 0.3,  hotelBudget: 8,  beer: 2 },
      mumbai:        { mealCheap: 2, mealMid: 10, transport: 0.3,  hotelBudget: 10, beer: 2.5 },
      kathmandu:     { mealCheap: 2, mealMid: 6,  transport: 0.3,  hotelBudget: 8,  beer: 2 },
      colombo:       { mealCheap: 2, mealMid: 8,  transport: 0.3,  hotelBudget: 10, beer: 2 },
      goa:           { mealCheap: 2, mealMid: 8,  transport: 0.3,  hotelBudget: 10, beer: 1.5 },
      // Europe
      istanbul:      { mealCheap: 4, mealMid: 15, transport: 0.5,  hotelBudget: 20, beer: 3 },
      marrakech:     { mealCheap: 3, mealMid: 12, transport: 0.3,  hotelBudget: 15, beer: 3 },
      lisbon:        { mealCheap: 8, mealMid: 25, transport: 1.5,  hotelBudget: 35, beer: 2.5 },
      barcelona:     { mealCheap: 10, mealMid: 30, transport: 2,   hotelBudget: 40, beer: 3 },
      rome:          { mealCheap: 10, mealMid: 30, transport: 1.5, hotelBudget: 40, beer: 5 },
      // Ameriques
      'mexico city': { mealCheap: 3, mealMid: 12, transport: 0.3,  hotelBudget: 15, beer: 2 },
      bogota:        { mealCheap: 3, mealMid: 10, transport: 0.5,  hotelBudget: 12, beer: 1.5 },
      lima:          { mealCheap: 3, mealMid: 12, transport: 0.5,  hotelBudget: 15, beer: 2 },
      // Fallback par pays
      thailand:      { mealCheap: 3, mealMid: 12, transport: 0.7,  hotelBudget: 12, beer: 2 },
      vietnam:       { mealCheap: 2, mealMid: 9,  transport: 0.3,  hotelBudget: 11, beer: 1 },
      indonesia:     { mealCheap: 2, mealMid: 10, transport: 0.4,  hotelBudget: 12, beer: 3 },
      japan:         { mealCheap: 7, mealMid: 19, transport: 2.2,  hotelBudget: 28, beer: 4 },
      korea:         { mealCheap: 6, mealMid: 18, transport: 1.2,  hotelBudget: 25, beer: 4 },
      philippines:   { mealCheap: 2, mealMid: 9,  transport: 0.3,  hotelBudget: 11, beer: 1.2 },
      malaysia:      { mealCheap: 2, mealMid: 10, transport: 0.6,  hotelBudget: 15, beer: 4 },
      cambodia:      { mealCheap: 2, mealMid: 7,  transport: 0.5,  hotelBudget: 9,  beer: 0.8 },
      laos:          { mealCheap: 2, mealMid: 7,  transport: 0.5,  hotelBudget: 10, beer: 1.5 },
      india:         { mealCheap: 2, mealMid: 8,  transport: 0.3,  hotelBudget: 9,  beer: 2 },
      nepal:         { mealCheap: 2, mealMid: 6,  transport: 0.3,  hotelBudget: 8,  beer: 2 },
      'sri lanka':   { mealCheap: 2, mealMid: 8,  transport: 0.3,  hotelBudget: 10, beer: 2 },
      taiwan:        { mealCheap: 4, mealMid: 15, transport: 0.5,  hotelBudget: 20, beer: 3 },
      singapore:     { mealCheap: 5, mealMid: 25, transport: 1.5,  hotelBudget: 40, beer: 8 },
    };

    const data = COST_DATA[key] || COST_DATA[country?.toLowerCase()] || null;
    if (!data) return null;
    return { ...data, currency: 'EUR' };
  }

  // --- Extraction destination depuis le pipeline context ---

  extractDestination(pipelineContext) {
    const dest = pipelineContext?.final_destination
      || pipelineContext?.story?.story?.primary_destination
      || pipelineContext?.story?.extracted?.destination
      || pipelineContext?.geo?.destination
      || '';

    const destLower = dest.toLowerCase().trim();
    let country = null;
    let city = null;

    for (const [countryKey, aliases] of Object.entries(DESTINATION_ALIASES)) {
      if (aliases.includes(destLower)) {
        country = countryKey;
        if (destLower !== countryKey) city = destLower;
        break;
      }
    }

    if (!country && destLower) {
      country = destLower;
    }

    const countryCode = COUNTRY_ISO_MAP[country] || null;
    const displayName = COUNTRY_DISPLAY_NAMES?.[country] || dest || country || '';

    return { country, city, countryCode, displayName, raw: dest };
  }

  // --- Fetch all data for a destination ---

  async fetchAll(pipelineContext) {
    const dest = this.extractDestination(pipelineContext);
    if (!dest.country && !dest.city) {
      console.log('⚠️ LIVE_DATA: Pas de destination identifiee, skip enrichment');
      return null;
    }

    console.log(`📊 LIVE_DATA: Enrichissement pour ${dest.displayName} (${dest.countryCode || '?'})...`);

    const safety = this.fetchSafetyScore(dest.countryCode);

    const costOfLiving = this.fetchCostOfLiving(dest.city, dest.country);

    const [countryInfo, flightPrice] = await Promise.all([
      this.fetchCountryInfo(dest.countryCode),
      this.fetchFlightPrice(dest.city || dest.country, dest.countryCode),
    ]);

    const hasAnyData = safety || countryInfo || flightPrice || costOfLiving;
    if (!hasAnyData) {
      console.log('⚠️ LIVE_DATA: Aucune donnee live recuperee');
      return null;
    }

    return {
      destination: dest,
      safety,
      countryInfo,
      flightPrice,
      costOfLiving,
      fetchedAt: new Date().toISOString(),
    };
  }

  // --- Generate HTML block ---

  generateHtmlBlock(liveData) {
    if (!liveData) return '';

    const { destination, safety, countryInfo, flightPrice, costOfLiving, fetchedAt } = liveData;
    const date = new Date(fetchedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const lines = [];

    if (flightPrice) {
      lines.push(`<li>Vol Paris &rarr; ${destination.displayName} : <strong>${flightPrice.avgPrice} &euro;</strong> en moyenne (a/r, a partir de ${flightPrice.minPrice} &euro;)</li>`);
    }

    if (costOfLiving) {
      if (costOfLiving.mealCheap) {
        lines.push(`<li>Repas economique : <strong>~${costOfLiving.mealCheap} &euro;</strong></li>`);
      }
      if (costOfLiving.mealMid) {
        lines.push(`<li>Restaurant moyen (2 pers.) : <strong>~${costOfLiving.mealMid} &euro;</strong></li>`);
      }
      if (costOfLiving.transport) {
        lines.push(`<li>Transport local (ticket) : <strong>~${costOfLiving.transport} &euro;</strong></li>`);
      }
      if (costOfLiving.hotelBudget) {
        lines.push(`<li>Nuit en hotel budget : <strong>~${costOfLiving.hotelBudget} &euro;</strong></li>`);
      }
    }

    if (safety) {
      lines.push(`<li>Securite : <strong>${safety.score.toFixed(1)}/5</strong> (${safety.level})</li>`);
    }

    if (countryInfo) {
      if (countryInfo.currencies) {
        lines.push(`<li>Devise locale : ${countryInfo.currencies}</li>`);
      }
      if (countryInfo.languages) {
        lines.push(`<li>Langues : ${countryInfo.languages}</li>`);
      }
      if (countryInfo.timezone) {
        lines.push(`<li>Fuseau horaire : ${countryInfo.timezone}</li>`);
      }
    }

    if (lines.length === 0) return '';

    return `
<aside class="fv-live-data" style="background:#f0f7ff;border-left:4px solid #2563eb;padding:1.2em 1.5em;margin:2em 0;border-radius:8px;font-size:0.95em;">
<h4 style="margin:0 0 0.8em 0;color:#1e40af;font-size:1.05em;">Infos pratiques &mdash; ${destination.displayName} (maj : ${date})</h4>
<ul style="list-style:none;padding:0;margin:0;">
${lines.join('\n')}
</ul>
<p style="margin:0.8em 0 0 0;font-size:0.8em;color:#6b7280;font-style:italic;">Donnees mises a jour automatiquement. Les prix sont indicatifs et peuvent varier.</p>
</aside>`;
  }

  // --- Main entry: enrich article HTML ---

  async enrichArticle(html, pipelineContext) {
    try {
      const liveData = await this.fetchAll(pipelineContext);
      if (!liveData) return { html, liveData: null, enriched: false };

      const block = this.generateHtmlBlock(liveData);
      if (!block) return { html, liveData, enriched: false };

      // Inject before the last </article>, or before last H2 "Ce qu'il faut retenir" / "Nos recommandations", or at the end
      let injected = false;
      let enrichedHtml = html;

      const conclusionPattern = /<h2[^>]*>(?:Ce qu.il faut retenir|Nos recommandations|En r.sum.|Conclusion)[^<]*<\/h2>/i;
      const conclusionMatch = html.match(conclusionPattern);
      if (conclusionMatch) {
        const idx = html.indexOf(conclusionMatch[0]);
        enrichedHtml = html.slice(0, idx) + block + '\n' + html.slice(idx);
        injected = true;
      }

      if (!injected) {
        enrichedHtml = html + '\n' + block;
      }

      const dataCount = [liveData.flightPrice, liveData.costOfLiving, liveData.safety, liveData.countryInfo].filter(Boolean).length;
      console.log(`✅ LIVE_DATA: Bloc injecte (${dataCount} sources) pour ${liveData.destination.displayName}`);
      return { html: enrichedHtml, liveData, enriched: true };
    } catch (e) {
      console.error(`❌ LIVE_DATA: Erreur enrichissement: ${e.message}`);
      return { html, liveData: null, enriched: false };
    }
  }
}

export default LiveDataEnricher;
