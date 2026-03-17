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
  // Pre-compute server-side aggregates for tables (always show all data)
  const totalArticles = history.length;
  const totalCost = history.reduce((s, h) => s + (h.totalCostUSD || 0), 0);

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

  const sortedSteps = Object.entries(stepTotals).sort((a, b) => b[1].costUSD - a[1].costUSD);
  const outlierThreshold = totalArticles > 3 ? (totalCost / totalArticles) * 2 : Infinity;

  const stepTableRows = sortedSteps.map(([step, data]) => {
    const pct = totalCost > 0 ? ((data.costUSD / totalCost) * 100).toFixed(1) : '0';
    const barW = totalCost > 0 ? Math.max(2, (data.costUSD / totalCost) * 100) : 0;
    return `<tr><td class="al"><strong>${step}</strong></td><td>${data.calls}</td><td>${data.tokensIn.toLocaleString('fr-FR')}</td><td>${data.tokensOut.toLocaleString('fr-FR')}</td><td>$${data.costUSD.toFixed(4)}</td><td><div class="bar-cell"><div class="bar-fill" style="width:${barW.toFixed(0)}%"></div><span>${pct}%</span></div></td></tr>`;
  }).join('\n');

  const tableRows = [...history].reverse().map((h) => {
    const isOutlier = (h.totalCostUSD || 0) > outlierThreshold;
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

  // Serialize history for client-side filtering (strip heavy byStep/byModel to save bytes)
  const clientHistory = history.map(h => ({
    d: h.date || null,
    c: h.totalCostUSD || 0,
    t: h.totalTokens || 0,
    w: h.wordCount || 0,
    calls: h.totalCalls || 0,
    dur: h.durationMs || 0,
    models: h.byModel ? Object.entries(h.byModel).map(([m, v]) => ({ m, c: v.costUSD })) : [],
    steps: h.byStep ? Object.entries(h.byStep).map(([s, v]) => ({ s, c: v.costUSD })) : []
  }));

  return `<!-- wp:html -->
<script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet">
<style>
  .ga-dash * { box-sizing: border-box; margin: 0; padding: 0; }
  /* WP theme overrides */
  .ga-dash, .ga-dash * { max-width: none !important; }
  .entry-content, .post-content, .page-content, .wp-block-post-content, article .content, .site-content .content-area { max-width: none !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
  .ga-dash .ga-card, .ga-dash table { max-width: none !important; }

  .ga-dash { font-family: 'Google Sans', 'Roboto', -apple-system, sans-serif; max-width: 100% !important; width: 100% !important; margin: 0 auto; padding: 24px; color: #202124; background: #f8f9fa; min-height: 100vh; box-sizing: border-box; }

  .ga-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #dadce0; flex-wrap: wrap; gap: 12px; }
  .ga-header h1 { font-size: 22px; font-weight: 500; color: #202124; display: flex; align-items: center; gap: 10px; }
  .ga-header h1 .material-icons-outlined { font-size: 28px; color: #1a73e8; }
  .ga-header-right { display: flex; align-items: center; gap: 16px; }
  .ga-header .ga-meta { font-size: 13px; color: #5f6368; }

  /* Date range pills - GA4 style */
  .ga-pills { display: flex; gap: 0; background: #fff; border: 1px solid #dadce0; border-radius: 20px; overflow: hidden; }
  .ga-pill { padding: 6px 16px; font-size: 13px; font-weight: 500; color: #5f6368; cursor: pointer; border: none; background: transparent; transition: all 0.15s; white-space: nowrap; font-family: inherit; }
  .ga-pill:hover { background: #f1f3f4; color: #202124; }
  .ga-pill.active { background: #e8f0fe; color: #1a73e8; }
  .ga-pill + .ga-pill { border-left: 1px solid #dadce0; }

  .ga-kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-bottom: 20px; background: #fff; border-radius: 8px; border: 1px solid #dadce0; overflow: hidden; }
  .ga-kpi { padding: 20px 24px; border-right: 1px solid #dadce0; position: relative; cursor: default; transition: background 0.15s; }
  .ga-kpi:last-child { border-right: none; }
  .ga-kpi:hover { background: #f1f3f4; }
  .ga-kpi .kpi-label { font-size: 12px; color: #5f6368; font-weight: 500; margin-bottom: 8px; }
  .ga-kpi .kpi-value { font-size: 28px; font-weight: 500; color: #202124; line-height: 1.2; }
  .ga-kpi .kpi-sub { font-size: 11px; color: #80868b; margin-top: 4px; }
  .ga-kpi .kpi-trend { font-size: 12px; font-weight: 500; margin-top: 4px; }
  .ga-kpi .kpi-trend.up { color: #d93025; }
  .ga-kpi .kpi-trend.down { color: #1e8e3e; }
  .ga-kpi .kpi-trend.neutral { color: #80868b; }

  .ga-card { background: #fff; border: 1px solid #dadce0; border-radius: 8px; overflow: hidden; width: 100% !important; display: flex; flex-direction: column; }
  .ga-card-header { padding: 16px 20px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f3f4; }
  .ga-card-header h3 { font-size: 14px; font-weight: 500; color: #202124; }
  .ga-card-body { padding: 16px 20px 20px; flex: 1; display: flex; flex-direction: column; }

  .ga-charts { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 16px; }
  .ga-charts-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; align-items: stretch; }
  .chart-div { width: 100%; min-height: 300px; flex: 1; }

  .ga-tbl-wrap { overflow-x: auto; width: 100% !important; }
  .ga-tbl { width: 100% !important; min-width: 100% !important; border-collapse: collapse; font-size: 13px; table-layout: auto; }
  .ga-tbl thead th { background: #f8f9fa !important; color: #5f6368 !important; font-weight: 500 !important; font-size: 12px !important; padding: 12px 16px !important; text-align: right; border-bottom: 1px solid #dadce0 !important; white-space: nowrap; }
  .ga-tbl thead th.al { text-align: left; }
  .ga-tbl tbody td { padding: 12px 16px; text-align: right; border-bottom: 1px solid #f1f3f4; color: #202124; font-size: 13px; }
  .ga-tbl tbody td.al { text-align: left; }
  .ga-tbl tbody tr:hover { background: #f8f9fa; }
  .ga-tbl tbody tr.outlier { background: #fce8e6; }
  .ga-tbl a { color: #1a73e8; text-decoration: none; font-weight: 500; }
  .ga-tbl a:hover { text-decoration: underline; }

  .bar-cell { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
  .bar-fill { height: 8px; background: #1a73e8; border-radius: 4px; min-width: 2px; opacity: 0.7; }
  .bar-cell span { font-size: 12px; color: #5f6368; min-width: 36px; text-align: right; }

  .ga-section { margin-bottom: 24px; width: 100% !important; }
  .ga-section-title { font-size: 16px; font-weight: 500; color: #202124; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .ga-section-title .material-icons-outlined { font-size: 20px; color: #5f6368; }

  @media (max-width: 900px) {
    .ga-kpi-strip { grid-template-columns: repeat(2, 1fr); }
    .ga-kpi:nth-child(1), .ga-kpi:nth-child(2) { border-bottom: 1px solid #dadce0; }
    .ga-kpi:nth-child(2) { border-right: none; }
    .ga-charts, .ga-charts-row2 { grid-template-columns: 1fr; }
  }
</style>

<div class="ga-dash">

<div class="ga-header">
  <h1><span class="material-icons-outlined">analytics</span> LLM Cost Dashboard</h1>
  <div class="ga-header-right">
    <div class="ga-pills">
      <button class="ga-pill" data-range="7">7j</button>
      <button class="ga-pill" data-range="14">14j</button>
      <button class="ga-pill active" data-range="28">28j</button>
      <button class="ga-pill" data-range="90">90j</button>
      <button class="ga-pill" data-range="0">Tout</button>
    </div>
    <div class="ga-meta">${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  </div>
</div>

<div class="ga-kpi-strip">
  <div class="ga-kpi"><div class="kpi-label">Co\u00fbt total</div><div class="kpi-value" id="kpi-cost">--</div><div class="kpi-sub" id="kpi-cost-sub"></div></div>
  <div class="ga-kpi"><div class="kpi-label">Co\u00fbt moyen / article</div><div class="kpi-value" id="kpi-avg">--</div><div class="kpi-trend" id="kpi-trend"></div></div>
  <div class="ga-kpi"><div class="kpi-label">Tokens moyens</div><div class="kpi-value" id="kpi-tokens">--</div><div class="kpi-sub">par article</div></div>
  <div class="ga-kpi"><div class="kpi-label">Projection mensuelle</div><div class="kpi-value" id="kpi-proj">--</div><div class="kpi-sub" id="kpi-proj-sub"></div></div>
</div>

<div class="ga-charts">
  <div class="ga-card">
    <div class="ga-card-header"><h3>Co\u00fbt journalier</h3></div>
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
    <div class="ga-card-body"><div id="stepChart" class="chart-div" style="min-height:400px"></div></div>
  </div>
  <div class="ga-card">
    <div class="ga-card-header"><h3>Tokens journaliers</h3></div>
    <div class="ga-card-body"><div id="tokensChart" class="chart-div"></div></div>
  </div>
</div>

<div class="ga-section">
  <div class="ga-section-title"><span class="material-icons-outlined">account_tree</span> D\u00e9tail par \u00e9tape pipeline (cumul\u00e9)</div>
  <div class="ga-card"><div class="ga-tbl-wrap">
  <table class="ga-tbl">
  <thead><tr><th class="al">\u00c9tape</th><th>Appels</th><th>Tokens IN</th><th>Tokens OUT</th><th>Co\u00fbt USD</th><th>% du total</th></tr></thead>
  <tbody>${stepTableRows}</tbody>
  </table>
  </div></div>
</div>

<div class="ga-section">
  <div class="ga-section-title"><span class="material-icons-outlined">schedule</span> Historique des articles</div>
  <div class="ga-card"><div class="ga-tbl-wrap">
  <table class="ga-tbl">
  <thead><tr><th class="al">Date</th><th class="al">Article</th><th>Co\u00fbt</th><th>Tokens</th><th>Appels</th><th>Mots</th><th>Co\u00fbt/1k mots</th><th>Dur\u00e9e</th><th>LLM %</th></tr></thead>
  <tbody>${tableRows}</tbody>
  </table>
  </div></div>
</div>

</div>

<script type="text/javascript">
(function() {
  var RAW = ${JSON.stringify(clientHistory)};
  var gaColors = ['#1a73e8', '#ea4335', '#34a853', '#fbbc04', '#9334e6', '#e8710a', '#f439a0', '#24c1e0'];
  var currentRange = 28;

  google.charts.load('current', {packages: ['corechart']});
  google.charts.setOnLoadCallback(function() { render(currentRange); });

  // Pill click handlers
  document.querySelectorAll('.ga-pill').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.ga-pill').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentRange = parseInt(btn.dataset.range);
      render(currentRange);
    });
  });

  function filterByRange(data, days) {
    if (!days) return data;
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return data.filter(function(h) { return h.d && new Date(h.d) >= cutoff; });
  }

  function aggregateByDay(data) {
    var byDay = {};
    data.forEach(function(h) {
      if (!h.d) return;
      var key = new Date(h.d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      if (!byDay[key]) byDay[key] = { cost: 0, tokens: 0, count: 0 };
      byDay[key].cost += h.c;
      byDay[key].tokens += h.t;
      byDay[key].count++;
    });
    return Object.entries(byDay).map(function(e) { return { label: e[0], cost: e[1].cost, tokens: e[1].tokens, count: e[1].count }; });
  }

  function render(days) {
    var filtered = filterByRange(RAW, days);
    if (filtered.length === 0) filtered = RAW;
    var daily = aggregateByDay(filtered);

    // KPIs
    var totalCost = filtered.reduce(function(s, h) { return s + h.c; }, 0);
    var avgCost = filtered.length > 0 ? totalCost / filtered.length : 0;
    var avgTokens = filtered.length > 0 ? Math.round(filtered.reduce(function(s, h) { return s + h.t; }, 0) / filtered.length) : 0;

    document.getElementById('kpi-cost').textContent = '$' + totalCost.toFixed(2);
    document.getElementById('kpi-cost-sub').textContent = filtered.length + ' articles';
    document.getElementById('kpi-avg').textContent = '$' + avgCost.toFixed(4);
    document.getElementById('kpi-tokens').textContent = avgTokens.toLocaleString('fr-FR');
    document.getElementById('kpi-proj').textContent = '$' + (avgCost * 30).toFixed(2);
    document.getElementById('kpi-proj-sub').textContent = '30 art./mois';

    // Trend
    var trendEl = document.getElementById('kpi-trend');
    if (filtered.length >= 10) {
      var r5 = filtered.slice(-5).reduce(function(s, h) { return s + h.c; }, 0) / 5;
      var p5 = filtered.slice(-10, -5).reduce(function(s, h) { return s + h.c; }, 0) / 5;
      var pct = ((r5 - p5) / p5 * 100).toFixed(0);
      if (r5 < p5 * 0.9) { trendEl.textContent = '\u2193 ' + pct + '% vs 5 pr\u00e9c.'; trendEl.className = 'kpi-trend down'; }
      else if (r5 > p5 * 1.1) { trendEl.textContent = '\u2191 +' + pct + '% vs 5 pr\u00e9c.'; trendEl.className = 'kpi-trend up'; }
      else { trendEl.textContent = '\u2192 stable'; trendEl.className = 'kpi-trend neutral'; }
    } else { trendEl.textContent = ''; }

    // Cost area chart - aggregated by day
    var costRows = [['Jour', 'Co\u00fbt USD', 'Moyenne']];
    var dailyAvg = daily.length > 0 ? daily.reduce(function(s, d) { return s + d.cost; }, 0) / daily.length : 0;
    daily.forEach(function(d) { costRows.push([d.label, d.cost, dailyAvg]); });
    var costData = google.visualization.arrayToDataTable(costRows);
    new google.visualization.AreaChart(document.getElementById('costChart')).draw(costData, {
      colors: ['#1a73e8', '#ea4335'],
      legend: { position: 'top', textStyle: { fontSize: 12, color: '#5f6368' } },
      hAxis: { textStyle: { fontSize: 10, color: '#80868b' }, gridlines: { color: '#f1f3f4' }, slantedText: true, slantedTextAngle: 45 },
      vAxis: { format: '$#,##0.000', textStyle: { fontSize: 11, color: '#80868b' }, gridlines: { color: '#f1f3f4', count: 5 }, minValue: 0 },
      chartArea: { left: 65, right: 20, top: 40, height: '65%' },
      backgroundColor: 'transparent', areaOpacity: 0.08, lineWidth: 2,
      series: { 1: { lineWidth: 1.5, lineDashStyle: [4, 3], areaOpacity: 0 } },
      focusTarget: 'category', crosshair: { trigger: 'focus', orientation: 'vertical', color: '#dadce0', opacity: 0.8 },
      animation: { startup: true, duration: 400 }
    });

    // Model donut
    var modelNames = {
      'claude-haiku-4-5-20251001': 'Claude Haiku',
      'claude-3-5-haiku-20241022': 'Claude Haiku',
      'claude-3-haiku-20240307': 'Claude Haiku',
      'claude-sonnet-4-20250514': 'Claude Sonnet',
      'claude-3-5-sonnet-20241022': 'Claude Sonnet',
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-3.5-turbo': 'GPT-3.5'
    };
    var modelAgg = {};
    filtered.forEach(function(h) { h.models.forEach(function(m) { var name = modelNames[m.m] || m.m; modelAgg[name] = (modelAgg[name] || 0) + m.c; }); });
    var modelRows = [['Mod\u00e8le', 'Co\u00fbt USD']];
    Object.entries(modelAgg).sort(function(a, b) { return b[1] - a[1]; }).forEach(function(e) { modelRows.push([e[0], e[1]]); });
    var modelData = google.visualization.arrayToDataTable(modelRows);
    new google.visualization.PieChart(document.getElementById('modelChart')).draw(modelData, {
      pieHole: 0.5, colors: gaColors,
      legend: { position: 'bottom', alignment: 'center', textStyle: { fontSize: 12, color: '#5f6368' } },
      pieSliceText: 'percentage', pieSliceTextStyle: { fontSize: 13, color: '#fff', bold: true },
      chartArea: { width: '90%', height: '78%' }, backgroundColor: 'transparent',
      tooltip: { text: 'both', textStyle: { fontSize: 13 }, trigger: 'selection' },
      sliceVisibilityThreshold: 0, enableInteractivity: true, animation: { startup: true, duration: 400 }
    });

    // Step bar chart
    var stepAgg = {};
    filtered.forEach(function(h) { h.steps.forEach(function(s) { stepAgg[s.s] = (stepAgg[s.s] || 0) + s.c; }); });
    var stepRows = [['\\u00c9tape', 'Co\u00fbt USD']];
    Object.entries(stepAgg).sort(function(a, b) { return b[1] - a[1]; }).forEach(function(e) { stepRows.push([e[0], e[1]]); });
    var stepData = google.visualization.arrayToDataTable(stepRows);
    var stepH = Math.max(350, Object.keys(stepAgg).length * 26);
    document.getElementById('stepChart').style.minHeight = stepH + 'px';
    new google.visualization.BarChart(document.getElementById('stepChart')).draw(stepData, {
      colors: ['#1a73e8'], legend: { position: 'none' },
      hAxis: { format: '$#,##0.000', textStyle: { fontSize: 11, color: '#80868b' }, gridlines: { color: '#f1f3f4' } },
      vAxis: { textStyle: { fontSize: 11, color: '#202124' } },
      chartArea: { width: '55%', height: '88%' }, backgroundColor: 'transparent',
      bar: { groupWidth: '65%' }, animation: { startup: true, duration: 400 }
    });

    // Tokens column chart - aggregated by day
    var tokenRows = [['Jour', 'Tokens']];
    daily.forEach(function(d) { tokenRows.push([d.label, d.tokens]); });
    var tokenData = google.visualization.arrayToDataTable(tokenRows);
    new google.visualization.ColumnChart(document.getElementById('tokensChart')).draw(tokenData, {
      colors: ['#1a73e8'], legend: { position: 'none' },
      hAxis: { textStyle: { fontSize: 10, color: '#80868b' }, slantedText: true, slantedTextAngle: 45 },
      vAxis: { textStyle: { fontSize: 11, color: '#80868b' }, gridlines: { color: '#f1f3f4', count: 5 } },
      chartArea: { left: 65, right: 20, height: '72%' }, backgroundColor: 'transparent',
      bar: { groupWidth: '70%' }, animation: { startup: true, duration: 400 }
    });
  }
})();
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
