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

  let trendIcon = '\u2192';
  if (history.length >= 10) {
    const recent5 = history.slice(-5).reduce((s, h) => s + h.totalCostUSD, 0) / 5;
    const prev5 = history.slice(-10, -5).reduce((s, h) => s + h.totalCostUSD, 0) / 5;
    if (recent5 < prev5 * 0.9) trendIcon = '\u2193 (baisse)';
    else if (recent5 > prev5 * 1.1) trendIcon = '\u2191 (hausse)';
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

  // Chart data for Google Charts
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
    const link = h.url ? `<a href="${h.url}" target="_blank">${title.substring(0, 50)}${title.length > 50 ? '\u2026' : ''}</a>` : title.substring(0, 50);
    const cost = `$${(h.totalCostUSD || 0).toFixed(4)}`;
    const tokens = (h.totalTokens || 0).toLocaleString('fr-FR');
    const calls = h.totalCalls || 0;
    const words = h.wordCount || '\u2014';
    const cpw = h.costPerWord ? `$${(h.costPerWord * 1000).toFixed(3)}/1k` : '\u2014';
    const dur = h.durationMs ? `${(h.durationMs / 60000).toFixed(1)}min` : '\u2014';
    const llmRatio = h.llmTimeRatio ? `${(h.llmTimeRatio * 100).toFixed(0)}%` : '\u2014';
    const alert = isOutlier ? ' \u26a0\ufe0f' : '';
    return `<tr${rowClass}><td class="mdl-data-table__cell--non-numeric">${dateStr}</td><td class="mdl-data-table__cell--non-numeric">${link}</td><td>${cost}${alert}</td><td>${tokens}</td><td>${calls}</td><td>${words}</td><td>${cpw}</td><td class="mdl-data-table__cell--non-numeric">${dur}</td><td>${llmRatio}</td></tr>`;
  }).join('\n');

  const stepTableRows = sortedSteps.map(([step, data]) => {
    const pct = totalCost > 0 ? ((data.costUSD / totalCost) * 100).toFixed(1) : '0';
    return `<tr><td class="mdl-data-table__cell--non-numeric"><strong>${step}</strong></td><td>${data.calls}</td><td>${data.tokensIn.toLocaleString('fr-FR')}</td><td>${data.tokensOut.toLocaleString('fr-FR')}</td><td>$${data.costUSD.toFixed(4)}</td><td>${pct}%</td></tr>`;
  }).join('\n');

  const PLANNED_ARTICLES_PER_MONTH = 30;
  const monthlyProjection = avgCost * PLANNED_ARTICLES_PER_MONTH;
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthArticles = history.filter(h => h.date && new Date(h.date) >= currentMonthStart);
  const thisMonthCost = thisMonthArticles.reduce((s, h) => s + (h.totalCostUSD || 0), 0);
  const thisMonthCount = thisMonthArticles.length;

  return `<!-- wp:html -->
<link rel="stylesheet" href="https://code.getmdl.io/1.3.0/material.indigo-blue.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
<style>
  .fv-dash { max-width: 1260px; margin: 0 auto; padding: 16px; }
  .fv-dash h1 { font-size: 28px; font-weight: 500; color: #263238; margin-bottom: 4px; }
  .fv-dash .subtitle { color: #78909c; font-size: 14px; margin-bottom: 24px; }
  .fv-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .fv-kpi-card { min-height: 0; }
  .fv-kpi-card .mdl-card__title { padding: 16px 16px 8px; }
  .fv-kpi-card .kpi-value { font-size: 30px; font-weight: 700; color: #1a73e8; }
  .fv-kpi-card .kpi-label { font-size: 12px; color: #5f6368; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; margin-top: 4px; }
  .fv-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
  .fv-chart-card { min-height: 0; width: 100%; }
  .fv-chart-card .mdl-card__title { padding-bottom: 0; }
  .fv-chart-card .mdl-card__supporting-text { width: 100%; box-sizing: border-box; padding: 8px 16px 16px; }
  .chart-container { width: 100%; min-height: 280px; }
  .fv-table-section { margin-bottom: 32px; }
  .fv-table-section h2 { font-size: 20px; font-weight: 500; color: #263238; margin-bottom: 12px; }
  .fv-full-table { width: 100%; font-size: 13px; }
  .fv-full-table th { background: #263238 !important; color: #ffffff !important; font-weight: 600 !important; font-size: 13px !important; padding: 12px 12px !important; }
  .fv-full-table td { padding: 10px 12px !important; }
  .fv-full-table tr.outlier { background: #fce4ec !important; }
  .fv-full-table a { color: #1a73e8; text-decoration: none; }
  .fv-full-table a:hover { text-decoration: underline; }
  @media (max-width: 840px) {
    .fv-charts-grid { grid-template-columns: 1fr; }
    .fv-kpis { grid-template-columns: repeat(2, 1fr); }
  }
</style>

<div class="fv-dash">
<h1><i class="material-icons" style="vertical-align:middle;margin-right:8px;color:#1a73e8">analytics</i>LLM Cost Dashboard</h1>
<p class="subtitle">Mis \u00e0 jour : ${new Date().toLocaleString('fr-FR')} \u2014 ${totalArticles} article(s) track\u00e9(s)</p>

<div class="fv-kpis">
  <div class="mdl-card mdl-shadow--2dp fv-kpi-card"><div class="mdl-card__title"><div><div class="kpi-value">$${totalCost.toFixed(2)}</div><div class="kpi-label">Co\u00fbt total</div></div></div></div>
  <div class="mdl-card mdl-shadow--2dp fv-kpi-card"><div class="mdl-card__title"><div><div class="kpi-value">$${avgCost.toFixed(4)}</div><div class="kpi-label">Co\u00fbt moyen / article</div></div></div></div>
  <div class="mdl-card mdl-shadow--2dp fv-kpi-card"><div class="mdl-card__title"><div><div class="kpi-value">${avgTokens.toLocaleString('fr-FR')}</div><div class="kpi-label">Tokens moyens / article</div></div></div></div>
  <div class="mdl-card mdl-shadow--2dp fv-kpi-card"><div class="mdl-card__title"><div><div class="kpi-value">${avgDuration}s</div><div class="kpi-label">Dur\u00e9e moyenne</div></div></div></div>
  <div class="mdl-card mdl-shadow--2dp fv-kpi-card"><div class="mdl-card__title"><div><div class="kpi-value">$${(costPerWord * 1000).toFixed(3)}</div><div class="kpi-label">Co\u00fbt / 1000 mots</div></div></div></div>
  <div class="mdl-card mdl-shadow--2dp fv-kpi-card"><div class="mdl-card__title"><div><div class="kpi-value">$${monthlyProjection.toFixed(2)}</div><div class="kpi-label">Projection / mois (${PLANNED_ARTICLES_PER_MONTH} art.) ${trendIcon}</div></div></div></div>
  <div class="mdl-card mdl-shadow--2dp fv-kpi-card"><div class="mdl-card__title"><div><div class="kpi-value">$${thisMonthCost.toFixed(2)}</div><div class="kpi-label">Ce mois (${thisMonthCount} art.)</div></div></div></div>
</div>

<div class="fv-charts-grid">
  <div class="mdl-card mdl-shadow--2dp fv-chart-card">
    <div class="mdl-card__title"><h3 class="mdl-card__title-text">Co\u00fbt par article (USD)</h3></div>
    <div class="mdl-card__supporting-text"><div id="costChart" class="chart-container"></div></div>
  </div>
  <div class="mdl-card mdl-shadow--2dp fv-chart-card">
    <div class="mdl-card__title"><h3 class="mdl-card__title-text">R\u00e9partition par mod\u00e8le</h3></div>
    <div class="mdl-card__supporting-text"><div id="modelChart" class="chart-container"></div></div>
  </div>
</div>

<div class="fv-charts-grid">
  <div class="mdl-card mdl-shadow--2dp fv-chart-card">
    <div class="mdl-card__title"><h3 class="mdl-card__title-text">Co\u00fbt par \u00e9tape pipeline</h3></div>
    <div class="mdl-card__supporting-text"><div id="stepChart" class="chart-container" style="min-height:${Math.max(300, sortedSteps.length * 28)}px"></div></div>
  </div>
  <div class="mdl-card mdl-shadow--2dp fv-chart-card">
    <div class="mdl-card__title"><h3 class="mdl-card__title-text">Tokens par article</h3></div>
    <div class="mdl-card__supporting-text"><div id="tokensChart" class="chart-container"></div></div>
  </div>
</div>

<div class="fv-table-section">
<h2><i class="material-icons" style="vertical-align:middle;margin-right:6px;font-size:22px">layers</i>D\u00e9tail par \u00e9tape pipeline</h2>
<div style="overflow-x:auto">
<table class="mdl-data-table mdl-js-data-table fv-full-table">
<thead><tr><th class="mdl-data-table__cell--non-numeric">\u00c9tape</th><th>Appels</th><th>Tokens IN</th><th>Tokens OUT</th><th>Co\u00fbt USD</th><th>% du total</th></tr></thead>
<tbody>
${stepTableRows}
</tbody>
</table>
</div>
</div>

<div class="fv-table-section">
<h2><i class="material-icons" style="vertical-align:middle;margin-right:6px;font-size:22px">history</i>Historique des articles</h2>
<div style="overflow-x:auto">
<table class="mdl-data-table mdl-js-data-table fv-full-table">
<thead><tr><th class="mdl-data-table__cell--non-numeric">Date</th><th class="mdl-data-table__cell--non-numeric">Article</th><th>Co\u00fbt</th><th>Tokens</th><th>Appels</th><th>Mots</th><th>Co\u00fbt/1k mots</th><th class="mdl-data-table__cell--non-numeric">Dur\u00e9e</th><th>LLM %</th></tr></thead>
<tbody>
${tableRows}
</tbody>
</table>
</div>
</div>

</div>

<script type="text/javascript">
  google.charts.load('current', {packages: ['corechart', 'bar']});
  google.charts.setOnLoadCallback(drawAllCharts);

  function drawAllCharts() {
    // Cost per article
    var costData = google.visualization.arrayToDataTable([
      ['Article', 'Co\\u00fbt USD', 'Moyenne'],
      ${chartRows}
    ]);
    new google.visualization.ComboChart(document.getElementById('costChart')).draw(costData, {
      seriesType: 'area', series: {1: {type: 'line', lineDashStyle: [4, 4]}},
      colors: ['#1a73e8', '#ea4335'], legend: {position: 'bottom'},
      hAxis: {textStyle: {fontSize: 10}}, vAxis: {format: '$#,##0.000', textStyle: {fontSize: 11}},
      chartArea: {width: '85%', height: '70%'}, backgroundColor: 'transparent',
      areaOpacity: 0.15
    });

    // Model donut
    var modelData = google.visualization.arrayToDataTable([
      ['Mod\\u00e8le', 'Co\\u00fbt USD'],
      ${modelRows}
    ]);
    new google.visualization.PieChart(document.getElementById('modelChart')).draw(modelData, {
      pieHole: 0.45, colors: ['#1a73e8', '#ea4335', '#34a853', '#fbbc04', '#9334e6'],
      legend: {position: 'bottom', textStyle: {fontSize: 12}},
      pieSliceText: 'value', pieSliceTextStyle: {fontSize: 13, bold: true},
      chartArea: {width: '90%', height: '80%'}, backgroundColor: 'transparent',
      tooltip: {text: 'both'}
    });

    // Step bar chart
    var stepData = google.visualization.arrayToDataTable([
      ['\\u00c9tape', 'Co\\u00fbt USD'],
      ${stepRows}
    ]);
    new google.visualization.BarChart(document.getElementById('stepChart')).draw(stepData, {
      colors: ['#1a73e8'], legend: {position: 'none'},
      hAxis: {format: '$#,##0.000', textStyle: {fontSize: 11}},
      vAxis: {textStyle: {fontSize: 11}},
      chartArea: {width: '60%', height: '85%'}, backgroundColor: 'transparent',
      bar: {groupWidth: '70%'}
    });

    // Tokens per article
    var tokenData = google.visualization.arrayToDataTable([
      ['Article', 'Tokens'],
      ${tokenRows}
    ]);
    new google.visualization.ColumnChart(document.getElementById('tokensChart')).draw(tokenData, {
      colors: ['#1a73e8'], legend: {position: 'none'},
      hAxis: {textStyle: {fontSize: 10}}, vAxis: {textStyle: {fontSize: 11}},
      chartArea: {width: '85%', height: '70%'}, backgroundColor: 'transparent'
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
