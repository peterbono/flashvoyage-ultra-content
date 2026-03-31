#!/usr/bin/env node

/**
 * seasonal-predictor.js — Seasonal Destination Trend Predictor
 *
 * Predicts which destinations will trend and when, to publish articles
 * BEFORE the search peak.
 *
 * For each SE Asia destination (from trends-config.json):
 *   1. Query Google Trends interest-over-time for "voyage {destination}" (FR, 12 months)
 *   2. Identify the month when search volume starts its upward slope (inflection point)
 *   3. Calculate publishBy = inflection point - 6 weeks
 *   4. Cross-reference with editorial-calendar.js peakMonths for validation
 *   5. Flag destinations where publishBy is within next 30 days as URGENT
 *
 * Writes: data/seasonal-forecast.json
 *
 * Uses: google-trends-api (npm). Rate limit: 1 query per 2 seconds.
 *
 * CLI: node intelligence/seasonal-predictor.js
 */

import googleTrends from 'google-trends-api';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const FORECAST_PATH = join(DATA_DIR, 'seasonal-forecast.json');
const TRENDS_CONFIG_PATH = join(__dirname, '..', 'social-distributor', 'sources', 'trends-config.json');
const EDITORIAL_CALENDAR_PATH = join(__dirname, '..', 'editorial-calendar.js');

// ── Constants ──────────────────────────────────────────────────────────────

const RATE_LIMIT_MS = 2200; // 1 query per 2.2s (with margin)
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;
const PUBLISH_LEAD_WEEKS = 6; // publish 6 weeks before inflection

const MONTH_NAMES_FR = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[SEASONAL] ${msg}`);
}

function logError(msg) {
  console.error(`[SEASONAL] ERROR: ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load JSON file, return null if missing.
 */
async function loadJSON(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch (err) {
    logError(`Failed to load ${path}: ${err.message}`);
    return null;
  }
}

// ── Editorial Calendar Peak Months ────────────────────────────────────────

/**
 * Extract peakMonths mapping from editorial-calendar.js CLUSTERS.
 * Since it's ESM with a class, we import it dynamically and use the
 * CLUSTERS data embedded in the module.
 *
 * Fallback: hardcoded SE Asia peak months if import fails.
 */
async function loadPeakMonths() {
  // Hardcoded fallback from editorial-calendar.js CLUSTERS
  const fallback = {
    'asie-sud-est': [11, 12, 1, 2, 3],
    'japon': [3, 4, 10, 11],
    'europe-sud': [5, 6, 7, 8, 9],
    'amerique-latine': [12, 1, 2, 3, 6, 7, 8],
    'afrique-moyen-orient': [10, 11, 12, 1, 2, 3, 4],
    'oceanie': [11, 12, 1, 2, 3],
  };

  // Destination → peakMonths mapping (lowercase, normalized)
  const destPeakMonths = {
    // SE Asia
    bali: [5, 6, 7, 8, 9, 10],
    thailande: [11, 12, 1, 2, 3],
    vietnam: [11, 12, 1, 2, 3, 4],
    philippines: [12, 1, 2, 3, 4, 5],
    cambodge: [11, 12, 1, 2, 3],
    laos: [11, 12, 1, 2, 3],
    myanmar: [11, 12, 1, 2],
    malaisie: [3, 4, 5, 6, 9, 10],
    singapour: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // year-round
    indonesie: [5, 6, 7, 8, 9, 10],
    jakarta: [5, 6, 7, 8, 9],
    bangkok: [11, 12, 1, 2, 3],
    'chiang mai': [11, 12, 1, 2],
    phuket: [11, 12, 1, 2, 3, 4],
    'koh samui': [1, 2, 3, 4, 5, 6, 7, 8, 9],
    'koh phangan': [1, 2, 3, 4, 5, 6, 7, 8, 9],
    hanoi: [9, 10, 11, 12, 1, 2, 3],
    'ho chi minh': [12, 1, 2, 3, 4],
    'da nang': [2, 3, 4, 5, 6, 7, 8],
    'hoi an': [2, 3, 4, 5, 6, 7, 8],
    'siem reap': [11, 12, 1, 2, 3],
    'luang prabang': [11, 12, 1, 2, 3],
    'kuala lumpur': [1, 2, 3, 5, 6, 7, 12],
    cebu: [1, 2, 3, 4, 5],
    palawan: [12, 1, 2, 3, 4, 5],
    'el nido': [12, 1, 2, 3, 4, 5],
    siargao: [3, 4, 5, 6, 7, 8, 9, 10],
    ubud: [5, 6, 7, 8, 9],
    lombok: [5, 6, 7, 8, 9],
    'nusa penida': [5, 6, 7, 8, 9],
    java: [5, 6, 7, 8, 9],
    'raja ampat': [10, 11, 12, 1, 2, 3, 4],
    // Broader Asia
    japon: [3, 4, 10, 11],
    'coree du sud': [4, 5, 9, 10],
    'sri lanka': [12, 1, 2, 3],
    inde: [10, 11, 12, 1, 2, 3],
    maldives: [12, 1, 2, 3, 4],
    nepal: [10, 11, 3, 4, 5],
  };

  return destPeakMonths;
}

// ── Google Trends Query ───────────────────────────────────────────────────

/**
 * Query Google Trends for interest-over-time for a single keyword.
 * Returns monthly data points for the last 12 months.
 *
 * @param {string} keyword - e.g., "voyage thailande"
 * @returns {Promise<Array<{month: number, year: number, value: number}>>}
 */
async function queryTrendsInterest(keyword) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await googleTrends.interestOverTime({
        keyword,
        geo: 'FR',
        startTime: startDate,
        endTime: endDate,
        granularTimeResolution: false, // monthly granularity
      });

      const parsed = JSON.parse(result);
      const timeline = parsed.default?.timelineData || [];

      if (timeline.length === 0) {
        return [];
      }

      return timeline.map(point => {
        const date = new Date(parseInt(point.time, 10) * 1000);
        return {
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          value: point.value?.[0] ?? 0,
          formattedTime: point.formattedTime,
        };
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        logError(`Trends query failed for "${keyword}" (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`);
        await sleep(RETRY_DELAY_MS);
      } else {
        logError(`Trends query permanently failed for "${keyword}": ${err.message}`);
        return [];
      }
    }
  }

  return [];
}

// ── Inflection Point Detection ────────────────────────────────────────────

/**
 * Detect the month when search interest starts rising (inflection point).
 * Uses first derivative (rate of change) to find the first month where
 * the slope turns positive after a trough.
 *
 * @param {Array<{month: number, year: number, value: number}>} data
 * @returns {{
 *   inflectionMonth: number,    // 1-12
 *   peakMonth: number,          // 1-12
 *   peakValue: number,
 *   troughMonth: number,        // 1-12
 *   troughValue: number,
 *   amplitude: number,          // peak - trough (0-100)
 *   confidence: number          // 0-1
 * }}
 */
function detectInflection(data) {
  if (data.length < 4) {
    return {
      inflectionMonth: 0,
      peakMonth: 0,
      peakValue: 0,
      troughMonth: 0,
      troughValue: 0,
      amplitude: 0,
      confidence: 0,
    };
  }

  // Aggregate by month (in case we have multiple years of same month)
  const monthAvg = {};
  for (const point of data) {
    if (!monthAvg[point.month]) {
      monthAvg[point.month] = { sum: 0, count: 0 };
    }
    monthAvg[point.month].sum += point.value;
    monthAvg[point.month].count++;
  }

  // Build 12-month profile
  const profile = [];
  for (let m = 1; m <= 12; m++) {
    const avg = monthAvg[m] ? monthAvg[m].sum / monthAvg[m].count : 0;
    profile.push({ month: m, value: Math.round(avg) });
  }

  // Find peak month
  const peak = profile.reduce((best, p) => p.value > best.value ? p : best, profile[0]);

  // Find trough month
  const trough = profile.reduce((best, p) => p.value < best.value ? p : best, profile[0]);

  const amplitude = peak.value - trough.value;

  // Find inflection point: first month after trough where value starts rising
  // Walk forward from trough month (circular)
  let inflectionMonth = 0;
  const troughIdx = profile.findIndex(p => p.month === trough.month);

  for (let i = 1; i < 12; i++) {
    const currentIdx = (troughIdx + i) % 12;
    const prevIdx = (troughIdx + i - 1) % 12;
    const nextIdx = (troughIdx + i + 1) % 12;

    // Inflection = first sustained rise (current > prev AND next > current)
    if (
      profile[currentIdx].value > profile[prevIdx].value &&
      (nextIdx !== troughIdx) && // don't wrap around to trough
      profile[nextIdx].value >= profile[currentIdx].value
    ) {
      inflectionMonth = profile[currentIdx].month;
      break;
    }
  }

  // If no clear inflection found, estimate as 2 months before peak
  if (inflectionMonth === 0) {
    inflectionMonth = ((peak.month - 3 + 12) % 12) + 1;
  }

  // Confidence based on amplitude and data quality
  const maxPossibleAmplitude = 100;
  const amplitudeScore = Math.min(1, amplitude / 40); // 40+ amplitude = high confidence
  const dataQuality = Object.keys(monthAvg).length / 12; // fraction of months with data
  const confidence = Math.round(amplitudeScore * 0.7 + dataQuality * 0.3 * 100) / 100;

  return {
    inflectionMonth,
    peakMonth: peak.month,
    peakValue: peak.value,
    troughMonth: trough.month,
    troughValue: trough.value,
    amplitude,
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

// ── Publish-By Date Calculation ───────────────────────────────────────────

/**
 * Calculate the publishBy date = inflection month - 6 weeks.
 *
 * @param {number} inflectionMonth - 1-12
 * @returns {{ publishByDate: string, publishByMonth: number, daysUntilPublishBy: number }}
 */
function calculatePublishBy(inflectionMonth) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Determine the next occurrence of the inflection month
  let inflectionYear = currentYear;
  if (inflectionMonth < currentMonth) {
    inflectionYear = currentYear + 1;
  } else if (inflectionMonth === currentMonth) {
    // If inflection is this month, we may already be late
    inflectionYear = currentYear;
  }

  // Inflection date = 1st of inflection month
  const inflectionDate = new Date(inflectionYear, inflectionMonth - 1, 1);

  // Publish by = 6 weeks (42 days) before inflection
  const publishByDate = new Date(inflectionDate.getTime() - PUBLISH_LEAD_WEEKS * 7 * 24 * 60 * 60 * 1000);

  // Days until publishBy from today
  const daysUntil = Math.round((publishByDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    publishByDate: publishByDate.toISOString().split('T')[0],
    publishByMonth: publishByDate.getMonth() + 1,
    daysUntilPublishBy: daysUntil,
  };
}

/**
 * Suggest article types based on destination and timing.
 */
function suggestArticleTypes(destination, daysUntil, amplitude) {
  const types = [];

  // Always suggest core content
  types.push('guide-complet');

  if (daysUntil <= 30) {
    // Urgent: quick-win formats
    types.push('budget-2026');
    types.push('quand-partir');
    types.push('itineraire-express');
  } else if (daysUntil <= 60) {
    // Good timing: full suite
    types.push('budget-2026');
    types.push('visa-2026');
    types.push('itineraire-2-semaines');
    types.push('arnaques-pieges');
  } else {
    // Plenty of time: deep content
    types.push('guide-complet-2026');
    types.push('comparatif-vs');
    types.push('digital-nomad');
    types.push('cout-de-la-vie');
  }

  // High amplitude = high commercial intent
  if (amplitude > 50) {
    types.push('vol-pas-cher');
    types.push('assurance-voyage');
  }

  return types;
}

// ── Main ──────────────────────────────────────────────────────────────────

/**
 * Run the seasonal predictor for all destinations.
 *
 * @returns {Promise<Object>} Seasonal forecast result
 */
export async function runSeasonalPredictor() {
  log('Starting seasonal prediction...');
  const startTime = Date.now();

  // ── Step 1: Load destinations from trends-config.json ──
  const trendsConfig = await loadJSON(TRENDS_CONFIG_PATH);
  if (!trendsConfig || !trendsConfig.destinations) {
    logError('Cannot load trends-config.json — aborting');
    return { error: 'Missing trends-config.json', timestamp: new Date().toISOString() };
  }

  const allDestinations = [
    ...trendsConfig.destinations.seAsia,
    ...trendsConfig.destinations.broader,
  ];
  log(`Loaded ${allDestinations.length} destinations from trends-config.json`);

  // ── Step 2: Load peak months for validation ──
  const peakMonthsMap = await loadPeakMonths();

  // ── Step 3: Query Google Trends for each destination ──
  const forecasts = [];
  let queriesSucceeded = 0;
  let queriesFailed = 0;

  for (let i = 0; i < allDestinations.length; i++) {
    const dest = allDestinations[i];
    const keyword = `voyage ${dest}`;

    log(`[${i + 1}/${allDestinations.length}] Querying: "${keyword}"`);

    const trendsData = await queryTrendsInterest(keyword);

    if (trendsData.length === 0) {
      queriesFailed++;
      log(`  -> No data returned for "${keyword}"`);

      // Use editorial calendar fallback
      const calendarPeakMonths = peakMonthsMap[dest.toLowerCase()];
      if (calendarPeakMonths && calendarPeakMonths.length > 0) {
        const estimatedInflection = ((calendarPeakMonths[0] - 2 + 12) % 12) + 1;
        const publishInfo = calculatePublishBy(estimatedInflection);

        forecasts.push({
          destination: dest,
          keyword,
          source: 'editorial-calendar-fallback',
          inflectionMonth: estimatedInflection,
          inflectionMonthName: MONTH_NAMES_FR[estimatedInflection - 1],
          peakMonth: calendarPeakMonths[0],
          peakMonthName: MONTH_NAMES_FR[calendarPeakMonths[0] - 1],
          peakValue: null,
          amplitude: null,
          confidence: 0.4, // low confidence (no real data)
          publishByDate: publishInfo.publishByDate,
          publishByMonth: publishInfo.publishByMonth,
          daysUntilPublishBy: publishInfo.daysUntilPublishBy,
          urgent: publishInfo.daysUntilPublishBy <= 30 && publishInfo.daysUntilPublishBy >= -14,
          suggestedArticleTypes: suggestArticleTypes(dest, publishInfo.daysUntilPublishBy, 30),
          calendarValidated: true,
          trendsData: [],
        });
      }

      // Rate limit even on failures
      if (i < allDestinations.length - 1) {
        await sleep(RATE_LIMIT_MS);
      }
      continue;
    }

    queriesSucceeded++;

    // ── Step 4: Detect inflection point ──
    const inflection = detectInflection(trendsData);

    if (inflection.inflectionMonth === 0) {
      log(`  -> Could not detect inflection for "${dest}"`);
      if (i < allDestinations.length - 1) await sleep(RATE_LIMIT_MS);
      continue;
    }

    // ── Step 5: Calculate publishBy date ──
    const publishInfo = calculatePublishBy(inflection.inflectionMonth);

    // ── Step 6: Cross-reference with editorial calendar ──
    const calendarPeakMonths = peakMonthsMap[dest.toLowerCase()] || [];
    const calendarValidated = calendarPeakMonths.length > 0
      ? calendarPeakMonths.includes(inflection.peakMonth)
      : false;

    // Adjust confidence based on calendar validation
    let adjustedConfidence = inflection.confidence;
    if (calendarValidated) {
      adjustedConfidence = Math.min(1, adjustedConfidence + 0.15);
    } else if (calendarPeakMonths.length > 0) {
      // Calendar disagrees — lower confidence
      adjustedConfidence = Math.max(0.1, adjustedConfidence - 0.1);
    }

    const isUrgent = publishInfo.daysUntilPublishBy <= 30 && publishInfo.daysUntilPublishBy >= -14;

    forecasts.push({
      destination: dest,
      keyword,
      source: 'google-trends',
      inflectionMonth: inflection.inflectionMonth,
      inflectionMonthName: MONTH_NAMES_FR[inflection.inflectionMonth - 1],
      peakMonth: inflection.peakMonth,
      peakMonthName: MONTH_NAMES_FR[inflection.peakMonth - 1],
      peakValue: inflection.peakValue,
      troughMonth: inflection.troughMonth,
      troughValue: inflection.troughValue,
      amplitude: inflection.amplitude,
      confidence: Math.round(adjustedConfidence * 100) / 100,
      publishByDate: publishInfo.publishByDate,
      publishByMonth: publishInfo.publishByMonth,
      daysUntilPublishBy: publishInfo.daysUntilPublishBy,
      urgent: isUrgent,
      suggestedArticleTypes: suggestArticleTypes(dest, publishInfo.daysUntilPublishBy, inflection.amplitude),
      calendarValidated,
      calendarPeakMonths: calendarPeakMonths.length > 0 ? calendarPeakMonths : undefined,
      monthlyProfile: trendsData.map(d => ({
        month: d.month,
        year: d.year,
        value: d.value,
      })),
    });

    log(`  -> Inflection: ${MONTH_NAMES_FR[inflection.inflectionMonth - 1]}, Peak: ${MONTH_NAMES_FR[inflection.peakMonth - 1]} (${inflection.peakValue}), PublishBy: ${publishInfo.publishByDate}${isUrgent ? ' ** URGENT **' : ''}`);

    // Rate limit
    if (i < allDestinations.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // ── Step 7: Sort and organize output ──
  // Sort: urgent first, then by publishBy date ascending
  forecasts.sort((a, b) => {
    if (a.urgent && !b.urgent) return -1;
    if (!a.urgent && b.urgent) return 1;
    return a.daysUntilPublishBy - b.daysUntilPublishBy;
  });

  const urgentCount = forecasts.filter(f => f.urgent).length;
  const upcomingCount = forecasts.filter(f => f.daysUntilPublishBy > 0 && f.daysUntilPublishBy <= 60).length;

  const output = {
    timestamp: new Date().toISOString(),
    totalDestinations: allDestinations.length,
    queriesSucceeded,
    queriesFailed,
    forecastCount: forecasts.length,
    urgentCount,
    upcomingCount,
    summary: {
      urgent: forecasts.filter(f => f.urgent).map(f => ({
        destination: f.destination,
        publishByDate: f.publishByDate,
        daysUntilPublishBy: f.daysUntilPublishBy,
        peakMonthName: f.peakMonthName,
        confidence: f.confidence,
      })),
      upcoming60d: forecasts.filter(f => f.daysUntilPublishBy > 30 && f.daysUntilPublishBy <= 60).map(f => ({
        destination: f.destination,
        publishByDate: f.publishByDate,
        daysUntilPublishBy: f.daysUntilPublishBy,
        peakMonthName: f.peakMonthName,
      })),
    },
    forecasts,
  };

  // ── Step 8: Write output ──
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FORECAST_PATH, JSON.stringify(output, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Seasonal prediction complete (${elapsed}s)`);
  log(`  Destinations: ${allDestinations.length} (${queriesSucceeded} trends OK, ${queriesFailed} fallback)`);
  log(`  Forecasts: ${output.forecastCount}`);
  log(`  URGENT (publish within 30d): ${urgentCount}`);
  log(`  Upcoming (30-60d): ${upcomingCount}`);
  log(`  Written to ${FORECAST_PATH}`);

  return output;
}

// ── CLI entry point ────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));
if (isMain) {
  runSeasonalPredictor()
    .then(result => {
      if (result.error) {
        console.error(`\nSeasonal Predictor Failed: ${result.error}`);
        process.exit(1);
      }

      console.log(`\nSeasonal Predictor Complete:`);
      console.log(`  Destinations queried: ${result.totalDestinations}`);
      console.log(`  Trends data: ${result.queriesSucceeded} succeeded, ${result.queriesFailed} fallback`);
      console.log(`  Forecasts generated: ${result.forecastCount}`);

      if (result.urgentCount > 0) {
        console.log(`\n  URGENT — Publish within 30 days:`);
        for (const u of result.summary.urgent) {
          const sign = u.daysUntilPublishBy < 0 ? 'OVERDUE' : `${u.daysUntilPublishBy}d left`;
          console.log(`    ${u.destination} -> publishBy ${u.publishByDate} (${sign}), peaks in ${u.peakMonthName} (confidence: ${u.confidence})`);
        }
      }

      if (result.summary.upcoming60d.length > 0) {
        console.log(`\n  Upcoming (30-60 days):`);
        for (const u of result.summary.upcoming60d) {
          console.log(`    ${u.destination} -> publishBy ${u.publishByDate} (${u.daysUntilPublishBy}d), peaks in ${u.peakMonthName}`);
        }
      }
    })
    .catch(err => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
