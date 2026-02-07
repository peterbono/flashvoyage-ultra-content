#!/usr/bin/env node

/**
 * BUILD AIRPORTS DATABASE
 * Télécharge la base OpenFlights (7000+ aéroports) et génère un JSON compact
 * Source: https://github.com/jpatokal/openflights
 * 
 * Usage: node scripts/build-airports-db.js
 * Output: data/airports-iata.json
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '..', 'data', 'airports-iata.json');

const OPENFLIGHTS_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';

// Alias manuels pour les noms courants qui diffèrent des noms officiels OpenFlights
// + Overrides pour les aéroports internationaux principaux (OpenFlights liste parfois le domestique en premier)
const CITY_ALIASES = {
  // Overrides aéroports internationaux
  'bangkok': 'BKK',     // Suvarnabhumi (pas Don Muang DMK)
  'osaka': 'KIX',       // Kansai (pas Itami ITM)
  'tokyo': 'NRT',       // Narita (pas Haneda HND)
  'seoul': 'ICN',       // Incheon (pas Gimpo GMP)
  'shanghai': 'PVG',    // Pudong (pas Hongqiao SHA)
  'beijing': 'PEK',     // Capital (pas Daxing PKX)
  'taipei': 'TPE',      // Taoyuan (pas Songshan TSA)
  'kuala lumpur': 'KUL', // KLIA (pas Sultan Abdul Aziz Shah SZB)
  'jakarta': 'CGK',     // Soekarno-Hatta
  'mumbai': 'BOM',      // Chhatrapati Shivaji
  'delhi': 'DEL',       // Indira Gandhi
  'paris': 'CDG',       // Charles de Gaulle (pas Orly ORY)
  'london': 'LHR',      // Heathrow (pas Gatwick LGW)
  'new york': 'JFK',    // JFK (pas LaGuardia LGA)
  // Bali et sous-régions
  'bali': 'DPS',
  'phuket': 'HKT',
  'koh samui': 'USM',
  'koh phangan': 'USM',
  'koh tao': 'USM',
  'pai': 'CNX',
  'hoi an': 'DAD',
  'hội an': 'DAD',
  'sapa': 'HAN',
  'sa pa': 'HAN',
  'canggu': 'DPS',
  'ubud': 'DPS',
  'seminyak': 'DPS',
  'el nido': 'PPS',
  'coron': 'USU',
  'nusa penida': 'DPS',
  'kuta': 'DPS',
  'uluwatu': 'DPS',
  'sanur': 'DPS',
  'gili': 'LOP',
  'gili trawangan': 'LOP',
  'ninh binh': 'HAN',
  'ha long': 'HAN',
  'hạ long': 'HAN',
  'nha trang': 'CXR',
  'đà nẵng': 'DAD',
  'huế': 'HUI',
  'hồ chí minh': 'SGN',
  'hà nội': 'HAN',
  'séoul': 'ICN',
  'singapour': 'SIN',
  'thaïlande': 'BKK',
  'indonésie': 'DPS',
  'corée': 'ICN',
  'corée du sud': 'ICN',
  'japon': 'NRT',
  'vietnam': 'SGN',
  'viet nam': 'SGN',
  'philippine': 'MNL',
  'makati': 'MNL',
  'baguio': 'MNL',
  'boracay': 'KLO',
  'yokohama': 'NRT',
  'nara': 'KIX',
  'pattaya': 'BKK',
  'krabi': 'KBV',
};

// Pays → code IATA principal (pour lookup par nom de pays)
// Inclut les noms EN + FR pour une couverture bilingue complète
const COUNTRY_DEFAULTS = {
  // Asie - EN
  'thailand': 'BKK',
  'japan': 'NRT',
  'south korea': 'ICN',
  'korea': 'ICN',
  'indonesia': 'DPS',
  'philippines': 'MNL',
  'vietnam': 'SGN',
  'singapore': 'SIN',
  'malaysia': 'KUL',
  'cambodia': 'PNH',
  'myanmar': 'RGN',
  'laos': 'VTE',
  'taiwan': 'TPE',
  'china': 'PEK',
  'hong kong': 'HKG',
  'india': 'DEL',
  'sri lanka': 'CMB',
  'nepal': 'KTM',
  // Asie - FR
  'thailande': 'BKK',
  'thaïlande': 'BKK',
  'japon': 'NRT',
  'coree du sud': 'ICN',
  'corée du sud': 'ICN',
  'coree': 'ICN',
  'corée': 'ICN',
  'indonesie': 'DPS',
  'indonésie': 'DPS',
  'malaisie': 'KUL',
  'singapour': 'SIN',
  'cambodge': 'PNH',
  'birmanie': 'RGN',
  'chine': 'PEK',
  'inde': 'DEL',
  'taïwan': 'TPE',
  'viêtnam': 'SGN',
  'viêt nam': 'SGN',
  // Europe - EN
  'france': 'CDG',
  'spain': 'MAD',
  'portugal': 'LIS',
  'italy': 'FCO',
  'germany': 'FRA',
  'united kingdom': 'LHR',
  'turkey': 'IST',
  'greece': 'ATH',
  // Europe - FR
  'espagne': 'MAD',
  'italie': 'FCO',
  'allemagne': 'FRA',
  'royaume-uni': 'LHR',
  'turquie': 'IST',
  'grece': 'ATH',
  'grèce': 'ATH',
  // Amériques + Océanie
  'united states': 'JFK',
  'etats-unis': 'JFK',
  'états-unis': 'JFK',
  'australia': 'SYD',
  'australie': 'SYD',
  'new zealand': 'AKL',
  'nouvelle-zelande': 'AKL',
  'nouvelle-zélande': 'AKL',
};

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizeCity(city) {
  return city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('📥 Téléchargement de la base OpenFlights...');
  
  const response = await fetch(OPENFLIGHTS_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
  const csv = await response.text();
  const lines = csv.split('\n').filter(l => l.trim());
  
  console.log(`📊 ${lines.length} entrées trouvées`);
  
  // Parse CSV: ID, Name, City, Country, IATA, ICAO, Lat, Lon, Alt, TZ, DST, TZdb, Type, Source
  const cityToIata = {};   // normalized_city → { iata, city, country }
  const countryToIata = {}; // normalized_country → { iata, city, country }
  let validCount = 0;
  let skippedCount = 0;
  
  for (const line of lines) {
    const fields = parseCSVLine(line);
    if (fields.length < 5) continue;
    
    const [id, name, city, country, iata] = fields;
    
    // Skip si pas de code IATA valide
    if (!iata || iata === '\\N' || iata === 'N' || iata.length !== 3) {
      skippedCount++;
      continue;
    }
    
    const normalizedCity = normalizeCity(city);
    const normalizedCountry = normalizeCity(country);
    
    if (!normalizedCity) {
      skippedCount++;
      continue;
    }
    
    // Garder le premier aéroport trouvé pour chaque ville (souvent le principal)
    // Exception: préférer les aéroports internationaux majeurs
    if (!cityToIata[normalizedCity]) {
      cityToIata[normalizedCity] = {
        iata: iata,
        city: city,
        country: country
      };
      validCount++;
    }
    
    // Stocker aussi le mapping country → principal aéroport
    if (COUNTRY_DEFAULTS[normalizedCountry]) {
      countryToIata[normalizedCountry] = {
        iata: COUNTRY_DEFAULTS[normalizedCountry],
        city: city,
        country: country
      };
    }
  }
  
  // Ajouter les alias manuels (priorité sur OpenFlights pour ces cas spécifiques)
  for (const [alias, iata] of Object.entries(CITY_ALIASES)) {
    const normalized = normalizeCity(alias);
    cityToIata[normalized] = { iata, city: alias, country: 'alias' };
  }
  
  // Ajouter les country defaults
  for (const [country, iata] of Object.entries(COUNTRY_DEFAULTS)) {
    const normalized = normalizeCity(country);
    countryToIata[normalized] = { iata, city: country, country: 'default' };
  }
  
  // Construire le JSON compact: juste city → IATA
  const lookup = {};
  for (const [key, value] of Object.entries(cityToIata)) {
    lookup[key] = value.iata;
  }
  for (const [key, value] of Object.entries(countryToIata)) {
    lookup[key] = value.iata;
  }
  
  // Écrire le fichier JSON
  const output = {
    _meta: {
      source: 'OpenFlights (https://github.com/jpatokal/openflights)',
      generated: new Date().toISOString(),
      entries: Object.keys(lookup).length,
      description: 'Mapping ville/pays → code IATA aéroport. Normalisé en lowercase sans accents.'
    },
    lookup
  };
  
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  
  console.log(`\n✅ Base générée: ${OUTPUT_PATH}`);
  console.log(`   📊 ${validCount} aéroports OpenFlights + ${Object.keys(CITY_ALIASES).length} alias manuels`);
  console.log(`   📊 ${Object.keys(lookup).length} entrées totales dans le lookup`);
  console.log(`   ⏭️  ${skippedCount} entrées ignorées (pas de code IATA)`);
  
  // Vérification: tester quelques lookups
  const tests = ['cebu', 'bali', 'tokyo', 'manila', 'bangkok', 'ho chi minh', 'singapore', 'seoul', 'hanoi', 'ubud', 'el nido', 'phuket', 'chiang mai', 'osaka'];
  console.log('\n🧪 Tests de lookup:');
  for (const test of tests) {
    const normalized = normalizeCity(test);
    const result = lookup[normalized];
    console.log(`   ${test} → ${result || '❌ NON TROUVÉ'}`);
  }
}

main().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
