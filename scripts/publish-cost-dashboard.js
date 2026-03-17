#!/usr/bin/env node

/**
 * Publie/met à jour une page WordPress privée "LLM Cost Dashboard"
 * avec graphiques et tableaux de suivi des coûts par article.
 * 
 * Usage: node scripts/publish-cost-dashboard.js
 */

import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { LLMCostTracker, COST_HISTORY_PATH } from '../llm-cost-tracker.js';

dotenv.config();

const WP_URL = process.env.WORDPRESS_URL?.replace(/\/$/, '');
const WP_USER = process.env.WORDPRESS_USERNAME;
const WP_PASS = process.env.WORDPRESS_APP_PASSWORD;
const PAGE_SLUG = 'llm-cost-dashboard';

function buildDashboardHTML(history) {
  const totalArticles = history.length;
  const totalCost = history.reduce((s, h) => s + (h.totalCostUSD || 0), 0);
  const avgCost = totalArticles > 0 ? totalCost / totalArticles : 0;
  const totalTokens = history.reduce((s, h) => s + (h.totalTokens || 0), 0);
  const avgTokens = totalArticles > 0 ? Math.round(totalTokens / totalArticles) : 0;
  const avgDuration = totalArticles > 0 ? Math.round(history.reduce((s, h) => s + (h.durationMs || 0), 0) / totalArticles / 1000) : 0;
  const totalWords = history.reduce((s, h) => s + (h.wordCount || 0), 0);
  const costPerWord = totalWords > 0 ? (totalCost / totalWords) : 0;

  let trendIcon = '\u2192', trendClass = 'neutral';
  if (history.length >= 10) {
    const recent5 = history.slice(-5).reduce((s, h) => s + h.totalCostUSD, 0) / 5;
    const prev5 = history.slice(-10, -5).reduce((s, h) => s + h.totalCostUSD, 0) / 5;
    if (recent5 < prev5 * 0.9) { trendIcon = '\u2193'; trendClass = 'down'; }
    else if (recent5 > prev5 * 1.1) { trendIcon = '\u2191'; trendClass = 'up'; }
  }

  const stepTotals = {};
  for (const h of history) {
    if (!h.byStep) continue;
    for (const [step, data] of Object.entries(h.byStep)) {
      if (!stepTotals[step]) stepTotals[step] = { calls: 0, costUSD: 0, tokensIn: 0, tokensOut: 0 };
      stepTotals[step].calls += data.calls || 0;
      stepTotals[step].costUSD += data.costUSD || 0;
      stepTotals[step].tokensIn += data.tokensIn || 0;
      stepTotals[step].tokensOut += data.tokensOut || 0;
    }
  }

  const modelTotals = {};
  for (const h of history) {
    if (!h.byModel) continue;
    for (const [model, data] of Object.entries(h.byModel)) {
      if (!modelTotals[model]) modelTotals[model] = { calls: 0, costUSD: 0 };
      modelTotals[model].calls += data.calls || 0;
      modelTotals[model].costUSD += data.costUSD || 0;
    }
  }

  const chartRows = history.map((h, i) => {
    const label = h.date ? new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : `#${i + 1}`;
    return `['${label}', ${(h.totalCostUSD || 0).toFixed(4)}, ${avgCost.toFixed(4)}]`;
  }).join(',\n          ');

  const tokenRows = history.map((h, i) => {
    const label = h.date ? new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : `#${i + 1}`;
    return `['${label}', ${h.totalTokens || 0}]`;
  }).join(',\n          ');

  const sortedSteps = Object.entries(stepTotals).sort((a, b) => b[1].costUSD - a[1].costUSD);
  const stepRows = sortedSteps.map(([k, v]) => `['${k}', ${v.costUSD.toFixed(4)}]`).join(',\n          ');

  const modelLabels = Object.keys(modelTotals);
  const modelRows = modelLabels.map(m => `['${m}', ${modelTotals[m].costUSD.toFixed(4)}]`).join(',\n          ');

  const outlierThreshold = avgCost * 2;

  const tableRows = [...history].reverse().map((h) => {
    const isOutlier = (h.totalCostUSD || 0) > outlierThreshold && totalArticles > 3;
    const rowClass = isOutlier ? ' class="outlier"' : '';
    const dateStr = h.date ? new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';
    const title = h.title || '\u2014';
    const link = h.url ? `<a href="${h.url}" target="_blank">${title.substring(0, 55)}${title.length > 55 ? '\u2026' : ''}</a>` : title.substring(0, 55);
    const cost = `$${(h.totalCostUSD || 0).toFixed(4)}`;
    const tokens = (h.totalTokens || 0).toLocaleString('fr-FR');
    const calls = h.totalCalls || 0;
    const words = h.wordCount || '\u2014';
    const cpw = h.costPerWord ? `$${(h.costPerWord * 1000).toFixed(3)}/1k` : '\u2014';
    const dur = h.durationMs ? `${(h.durationMs / 60000).toFixed(1)}min` : '\u2014';
    const llmRatio = h.llmTimeRatio ? `${(h.llmTimeRatio * 100).toFixed(0)}%` : '\u2014';
    const alert = isOutlier ? ' \u26a0\ufe0f' : '';
    return `<tr${rowClass}><td>${dateStr}</td><td class="al">${link}</td><td>${cost}${alert}</td><td>${tokens}</td><td>${calls}</td><td>${words}</td><td>${cpw}</td><td>${dur}</td><td>${llmRatio}</td></tr>`;
  }).join('\n');

  const stepTableRows = sortedSteps.map(([step, data]) => {
    const pct = totalCost > 0 ? ((data.costUSD / totalCost) * 100).toFixed(1) : '0';
    const barW = totalCost > 0 ? Math.max(2, (data.costUSD / totalCost) * 100) : 0;
    return `<tr><td class="al"><strong>${step}</strong></td><td>${data.calls}</td><td>${data.tokensIn.toLocaleString('fr-FR')}</td><td>${data.tokensOut.toLocaleString('fr-FR')}</td><td>$${data.costUSD.toFixed(4)}</td><td><div class="bar-cell"><div class="bar-fill" style="width:${barW.toFixed(0)}%"></div><span>${pct}%</span></div></td></tr>`;
  }).join('\n');

  const PLANNED_ARTICLES_PER_MONTH = 30;
  const monthlyProjection = avgCost * PLANNED_ARTICLES_PER_MONTH;
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthArticles = history.filter(h => h.date && new Date(h.date) >= currentMonthStart);
  const thisMonthCost = thisMonthArticles.reduce((s, h) => s + (h.totalCostUSD || 0), 0);
  const thisMonthCount = thisMonthArticles.length;

  return `<!-- wp:html -->
<script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet">
<style>
  .ga-dash * { box-sizing: border-box; margin: 0; padding: 0; }
  .ga-dash { font-family: 'Google Sans', 'Roboto', -apple-system, sans-serif; max-width: 1300px; margin: 0 auto; padding: 24px; color: #202124; background: #f8f9fa; min-height: 100vh; }

  /* Header */
  .ga-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #dadce0; }
  .ga-header h1 { font-size: 22px; font-weight: 500; color: #202124; display: flex; align-items: center; gap: 10px; }
  .ga-header h1 .material-icons-outlined { font-size: 28px; color: #1a73e8; }
  .ga-header .ga-meta { font-size: 13px; color: #5f6368; }

  /* KPI strip - GA4 style metric cards */
  .ga-kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-bottom: 24px; background: #fff; border-radius: 8px; border: 1px solid #dadce0; overflow: hidden; }
  .ga-kpi { padding: 20px 24px; border-right: 1px solid #dadce0; position: relative; cursor: default; transition: background 0.15s; }
  .ga-kpi:last-child { border-right: none; }
  .ga-kpi:hover { background: #f1f3f4; }
  .ga-kpi .kpi-label { font-size: 12px; color: #5f6368; font-weight: 500; text-transform: none; letter-spacing: 0; margin-bottom: 8px; }
  .ga-kpi .kpi-value { font-size: 28px; font-weight: 500; color: #202124; line-height: 1.2; }
  .ga-kpi .kpi-sub { font-size: 11px; color: #80868b; margin-top: 4px; }
  .ga-kpi .kpi-trend { font-size: 12px; font-weight: 500; margin-top: 4px; }
  .ga-kpi .kpi-trend.up { color: #d93025; }
  .ga-kpi .kpi-trend.down { color: #1e8e3e; }
  .ga-kpi .kpi-trend.neutral { color: #80868b; }

  /* Cards */
  .ga-card { background: #fff; border: 1px solid #dadce0; border-radius: 8px; overflow: hidden; }
  .ga-card-header { padding: 16px 20px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f3f4; }
  .ga-card-header h3 { font-size: 14px; font-weight: 500; color: #202124; }
  .ga-card-body { padding: 16px 20px 20px; }

  /* Chart grid */
  .ga-charts { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 16px; }
  .ga-charts-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .chart-div { width: 100%; min-height: 300px; }

  /* Tables - GA4 style */
  .ga-tbl-wrap { overflow-x: auto; }
  .ga-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ga-tbl thead th { background: #f8f9fa !important; color: #5f6368 !important; font-weight: 500 !important; font-size: 12px !important; padding: 12px 16px !important; text-align: right; border-bottom: 1px solid #dadce0 !important; white-space: nowrap; text-transform: none; }
  .ga-tbl thead th.al { text-align: left; }
  .ga-tbl tbody td { padding: 12px 16px; text-align: right; border-bottom: 1px solid #f1f3f4; color: #202124; font-size: 13px; }
  .ga-tbl tbody td.al { text-align: left; }
  .ga-tbl tbody tr:hover { background: #f8f9fa; }
  .ga-tbl tbody tr.outlier { background: #fce8e6; }
  .ga-tbl tbody tr.outlier:hover { background: #f8d7da; }
  .ga-tbl a { color: #1a73e8; text-decoration: none; font-weight: 500; }
  .ga-tbl a:hover { text-decoration: underline; }

  /* Inline bar in table */
  .bar-cell { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
  .bar-fill { height: 8px; background: #1a73e8; border-radius: 4px; min-width: 2px; opacity: 0.7; }
  .bar-cell span { font-size: 12px; color: #5f6368; min-width: 36px; text-align: right; }

  /* Section titles */
  .ga-section { margin-bottom: 24px; }
  .ga-section-title { font-size: 16px; font-weight: 500; color: #202124; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .ga-section-title .material-icons-outlined { font-size: 20px; color: #5f6368; }

  @media (max-width: 900px) {
    .ga-kpi-strip { grid-template-columns: repeat(2, 1fr); }
    .ga-kpi:nth-child(2) { border-right: none; }
    .ga-kpi:nth-child(2) { border-bottom: 1px solid #dadce0; }
    .ga-kpi:nth-child(1) { border-bottom: 1px solid #dadce0; }
    .ga-charts, .ga-charts-row2 { grid-template-columns: 1fr; }
  }
</style>

<div class="ga-dash">

<div class="ga-header">
  <h1><span class="material-icons-outlined">analytics</span> LLM Cost Dashboard</h1>
  <div class="ga-meta">${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} &bull; ${totalArticles} articles</div>
</div>

<div class="ga-kpi-strip">
  <div class="ga-kpi">
    <div class="kpi-label">Co\u00fbt total</div>
    <div class="kpi-value">$${totalCost.toFixed(2)}</div>
    <div class="kpi-sub">${totalArticles} articles g\u00e9n\u00e9r\u00e9s</div>
  </div>
  <div class="ga-kpi">
    <div class="kpi-label">Co\u00fbt moyen / article</div>
    <div class="kpi-value">$${avgCost.toFixed(4)}</div>
    <div class="kpi-trend ${trendClass}">${trendIcon} vs 5 pr\u00e9c\u00e9dents</div>
  </div>
  <div class="ga-kpi">
    <div class="kpi-label">Tokens moyens</div>
    <div class="kpi-value">${avgTokens.toLocaleString('fr-FR')}</div>
    <div class="kpi-sub">par article</div>
  </div>
  <div class="ga-kpi">
    <div class="kpi-label">Projection mensuelle</div>
    <div class="kpi-value">$${monthlyProjection.toFixed(2)}</div>
    <div class="kpi-sub">${PLANNED_ARTICLES_PER_MONTH} art./mois &bull; ce mois: $${thisMonthCost.toFixed(2)} (${thisMonthCount})</div>
  </div>
</div>

<div class="ga-charts">
  <div class="ga-card">
    <div class="ga-card-header"><h3>Co\u00fbt par article</h3></div>
    <div class="ga-card-body"><div id="costChart" class="chart-div"></div></div>
  </div>
  <div class="ga-card">
    <div class="ga-card-header"><h3>R\u00e9partition par mod\u00e8le</h3></div>
    <div class="ga-card-body"><div id="modelChart" class="chart-div"></div></div>
  </div>
</div>

<div class="ga-charts-row2">
  <div class="ga-card">
    <div class="ga-card-header"><h3>Co\u00fbt par \u00e9tape pipeline</h3></div>
    <div class="ga-card-body"><div id="stepChart" class="chart-div" style="min-height:${Math.max(320, sortedSteps.length * 26)}px"></div></div>
  </div>
  <div class="ga-card">
    <div class="ga-card-header"><h3>Tokens par article</h3></div>
    <div class="ga-card-body"><div id="tokensChart" class="chart-div"></div></div>
  </div>
</div>

<div class="ga-section">
  <div class="ga-section-title"><span class="material-icons-outlined">account_tree</span> D\u00e9tail par \u00e9tape pipeline</div>
  <div class="ga-card">
    <div class="ga-tbl-wrap">
    <table class="ga-tbl">
    <thead><tr><th class="al">\u00c9tape</th><th>Appels</th><th>Tokens IN</th><th>Tokens OUT</th><th>Co\u00fbt USD</th><th>% du total</th></tr></thead>
    <tbody>${stepTableRows}</tbody>
    </table>
    </div>
  </div>
</div>

<div class="ga-section">
  <div class="ga-section-title"><span class="material-icons-outlined">schedule</span> Historique des articles</div>
  <div class="ga-card">
    <div class="ga-tbl-wrap">
    <table class="ga-tbl">
    <thead><tr><th class="al">Date</th><th class="al">Article</th><th>Co\u00fbt</th><th>Tokens</th><th>Appels</th><th>Mots</th><th>Co\u00fbt/1k mots</th><th>Dur\u00e9e</th><th>LLM %</th></tr></thead>
    <tbody>${tableRows}</tbody>
    </table>
    </div>
  </div>
</div>

</div>

<script type="text/javascript">
  google.charts.load('current', {packages: ['corechart']});
  google.charts.setOnLoadCallback(drawAllCharts);

  function drawAllCharts() {
    var gaColors = ['#1a73e8', '#ea4335', '#34a853', '#fbbc04', '#9334e6', '#e8710a', '#f439a0', '#24c1e0'];

    // Cost per article - area chart
    var costData = google.visualization.arrayToDataTable([
      ['Article', 'Co\u00fbt USD', 'Moyenne'],
      ${chartRows}
    ]);
    new google.visualization.AreaChart(document.getElementById('costChart')).draw(costData, {
      colors: ['#1a73e8', '#ea4335'],
      legend: { position: 'top', textStyle: { fontSize: 12, color: '#5f6368' } },
      hAxis: { textStyle: { fontSize: 10, color: '#80868b' }, gridlines: { color: '#f1f3f4' }, baselineColor: '#dadce0' },
      vAxis: { format: '$#,##0.000', textStyle: { fontSize: 11, color: '#80868b' }, gridlines: { color: '#f1f3f4', count: 5 }, baselineColor: '#dadce0', minValue: 0 },
      chartArea: { width: '85%', height: '72%', top: 40 },
      backgroundColor: 'transparent',
      areaOpacity: 0.08,
      lineWidth: 2,
      series: { 1: { lineWidth: 1.5, lineDashStyle: [4, 3], areaOpacity: 0 } },
      focusTarget: 'category',
      crosshair: { trigger: 'focus', orientation: 'vertical', color: '#dadce0', opacity: 0.8 },
      animation: { startup: true, duration: 600 }
    });

    // Model donut - GA4 style
    var modelData = google.visualization.arrayToDataTable([
      ['Mod\u00e8le', 'Co\u00fbt USD'],
      ${modelRows}
    ]);
    new google.visualization.PieChart(document.getElementById('modelChart')).draw(modelData, {
      pieHole: 0.55,
      colors: gaColors,
      legend: { position: 'labeled', textStyle: { fontSize: 12, color: '#5f6368' } },
      pieSliceText: 'percentage',
      pieSliceTextStyle: { fontSize: 12, color: '#fff' },
      chartArea: { width: '95%', height: '85%' },
      backgroundColor: 'transparent',
      tooltip: { text: 'both', textStyle: { fontSize: 13 } },
      animation: { startup: true, duration: 600 }
    });

    // Step horizontal bar
    var stepData = google.visualization.arrayToDataTable([
      ['\u00c9tape', 'Co\u00fbt USD'],
      ${stepRows}
    ]);
    new google.visualization.BarChart(document.getElementById('stepChart')).draw(stepData, {
      colors: ['#1a73e8'],
      legend: { position: 'none' },
      hAxis: { format: '$#,##0.000', textStyle: { fontSize: 11, color: '#80868b' }, gridlines: { color: '#f1f3f4' }, baselineColor: '#dadce0' },
      vAxis: { textStyle: { fontSize: 11, color: '#202124' } },
      chartArea: { width: '55%', height: '88%' },
      backgroundColor: 'transparent',
      bar: { groupWidth: '65%' },
      animation: { startup: true, duration: 600 }
    });

    // Tokens bar
    var tokenData = google.visualization.arrayToDataTable([
      ['Article', 'Tokens'],
      ${tokenRows}
    ]);
    new google.visualization.ColumnChart(document.getElementById('tokensChart')).draw(tokenData, {
      colors: ['#1a73e8'],
      legend: { position: 'none' },
      hAxis: { textStyle: { fontSize: 10, color: '#80868b' }, gridlines: { color: '#f1f3f4' } },
      vAxis: { textStyle: { fontSize: 11, color: '#80868b' }, gridlines: { color: '#f1f3f4', count: 5 }, baselineColor: '#dadce0' },
      chartArea: { width: '85%', height: '72%' },
      backgroundColor: 'transparent',
      bar: { groupWidth: '70%' },
      animation: { startup: true, duration: 600 }
    });
  }
</script>
<!-- /wp:html -->`;
}

async function main() {
  if (!WP_URL || !WP_USER || !WP_PASS) {
    console.error('❌ Variables WordPress manquantes (WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD)');
    process.exit(1);
  }

  const history = LLMCostTracker.loadHistory();
  console.log(`📊 ${history.length} article(s) dans l'historique des coûts`);

  if (history.length === 0) {
    console.log('ℹ️ Aucune donnée de coût. Lancez d\'abord un pipeline avec le tracking activé.');
    console.log('   Le dashboard sera publié avec des données vides.');
  }

  const html = buildDashboardHTML(history);
  const auth = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

  // Check if page already exists
  let existingPageId = null;
  try {
    const searchRes = await axios.get(`${WP_URL}/wp-json/wp/v2/pages?slug=${PAGE_SLUG}&status=private,draft,publish`, { headers });
    if (searchRes.data.length > 0) {
      existingPageId = searchRes.data[0].id;
      console.log(`📄 Page existante trouvée: id=${existingPageId}`);
    }
  } catch (e) {
    // ignore
  }

  const pageData = {
    title: 'LLM Cost Dashboard — FlashVoyage',
    content: html,
    status: 'private',
    slug: PAGE_SLUG
  };

  if (existingPageId) {
    await axios.post(`${WP_URL}/wp-json/wp/v2/pages/${existingPageId}`, pageData, { headers });
    console.log(`✅ Dashboard mis à jour: ${WP_URL}/?page_id=${existingPageId}`);
  } else {
    const res = await axios.post(`${WP_URL}/wp-json/wp/v2/pages`, pageData, { headers });
    console.log(`✅ Dashboard créé (privé): ${WP_URL}/?page_id=${res.data.id}`);
  }
}

main().catch(err => {
  console.error('❌ Erreur:', err.response?.data?.message || err.message);
  process.exit(1);
});
