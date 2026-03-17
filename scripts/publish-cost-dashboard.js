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

  // Trend: compare les 5 derniers articles avec les 5 d'avant
  let trendIcon = '→';
  if (history.length >= 10) {
    const recent5 = history.slice(-5).reduce((s, h) => s + h.totalCostUSD, 0) / 5;
    const prev5 = history.slice(-10, -5).reduce((s, h) => s + h.totalCostUSD, 0) / 5;
    if (recent5 < prev5 * 0.9) trendIcon = '↓ (baisse)';
    else if (recent5 > prev5 * 1.1) trendIcon = '↑ (hausse)';
  }

  // Aggregate step costs across all articles
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

  // Aggregate model costs
  const modelTotals = {};
  for (const h of history) {
    if (!h.byModel) continue;
    for (const [model, data] of Object.entries(h.byModel)) {
      if (!modelTotals[model]) modelTotals[model] = { calls: 0, costUSD: 0 };
      modelTotals[model].calls += data.calls || 0;
      modelTotals[model].costUSD += data.costUSD || 0;
    }
  }

  // Chart data
  const chartLabels = history.map((h, i) => h.date ? new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : `#${i + 1}`);
  const chartCosts = history.map(h => parseFloat((h.totalCostUSD || 0).toFixed(4)));
  const chartTokens = history.map(h => h.totalTokens || 0);
  const chartCalls = history.map(h => h.totalCalls || 0);

  // Step breakdown chart data (top 8 steps by cost)
  const sortedSteps = Object.entries(stepTotals).sort((a, b) => b[1].costUSD - a[1].costUSD);
  const stepLabels = sortedSteps.map(([k]) => k);
  const stepCosts = sortedSteps.map(([, v]) => parseFloat(v.costUSD.toFixed(4)));

  // Model pie chart data
  const modelLabels = Object.keys(modelTotals);
  const modelCosts = Object.values(modelTotals).map(v => parseFloat(v.costUSD.toFixed(4)));

  // Detect outliers (>2x average)
  const outlierThreshold = avgCost * 2;

  // Article table rows
  const tableRows = [...history].reverse().map((h, idx) => {
    const isOutlier = (h.totalCostUSD || 0) > outlierThreshold && totalArticles > 3;
    const rowClass = isOutlier ? 'outlier' : '';
    const dateStr = h.date ? new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const title = h.title || '—';
    const link = h.url ? `<a href="${h.url}" target="_blank">${title.substring(0, 50)}${title.length > 50 ? '…' : ''}</a>` : title.substring(0, 50);
    const cost = `$${(h.totalCostUSD || 0).toFixed(4)}`;
    const tokens = (h.totalTokens || 0).toLocaleString('fr-FR');
    const calls = h.totalCalls || 0;
    const words = h.wordCount || '—';
    const cpw = h.costPerWord ? `$${(h.costPerWord * 1000).toFixed(3)}/1k` : '—';
    const dur = h.durationMs ? `${(h.durationMs / 60000).toFixed(1)}min` : '—';
    const llmRatio = h.llmTimeRatio ? `${(h.llmTimeRatio * 100).toFixed(0)}%` : '—';
    const alert = isOutlier ? ' ⚠️' : '';
    return `<tr class="${rowClass}"><td>${dateStr}</td><td>${link}</td><td>${cost}${alert}</td><td>${tokens}</td><td>${calls}</td><td>${words}</td><td>${cpw}</td><td>${dur}</td><td>${llmRatio}</td></tr>`;
  }).join('\n');

  // Monthly projection based on editorial calendar (1 article/day = 30/month)
  const PLANNED_ARTICLES_PER_MONTH = 30;
  const monthlyProjection = avgCost * PLANNED_ARTICLES_PER_MONTH;

  // Current month spend
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthArticles = history.filter(h => h.date && new Date(h.date) >= currentMonthStart);
  const thisMonthCost = thisMonthArticles.reduce((s, h) => s + (h.totalCostUSD || 0), 0);
  const thisMonthCount = thisMonthArticles.length;

  // Dev LLM cost this month (calls made outside article generation — tracked via env)
  const devLlmCostPath = path.join(path.dirname(COST_HISTORY_PATH), 'dev-llm-cost.jsonl');
  let devCostThisMonth = 0;
  try {
    const devLines = fs.readFileSync(devLlmCostPath, 'utf-8').trim().split('\n').filter(Boolean);
    for (const line of devLines) {
      const entry = JSON.parse(line);
      if (entry.date && new Date(entry.date) >= currentMonthStart) {
        devCostThisMonth += entry.costUSD || 0;
      }
    }
  } catch (e) { /* no dev cost file yet */ }

  return `<!-- wp:html -->
<style>
  .fv-dash { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; color: #1a1a2e; }
  .fv-dash h1 { font-size: 28px; margin-bottom: 8px; }
  .fv-dash .subtitle { color: #666; margin-bottom: 24px; font-size: 14px; }
  .fv-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .fv-kpi { background: #f8f9fa; border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #e9ecef; }
  .fv-kpi .value { font-size: 28px; font-weight: 700; color: #0066cc; }
  .fv-kpi .label { font-size: 12px; color: #495057; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .fv-kpi.alert .value { color: #e63946; }
  .fv-charts { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 32px; }
  .fv-chart-box { background: #fff; border: 1px solid #e9ecef; border-radius: 12px; padding: 20px; }
  .fv-chart-box h3 { margin-top: 0; font-size: 16px; color: #1a1a2e; font-weight: 700; }
  .fv-table-wrap { overflow-x: auto; margin-bottom: 32px; }
  .fv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .fv-table th { background: #1a1a2e !important; color: #ffffff !important; padding: 12px 10px !important; text-align: left; font-weight: 700 !important; font-size: 14px !important; white-space: nowrap; letter-spacing: 0.3px; text-transform: uppercase; }
  .fv-table td { padding: 10px 10px; border-bottom: 1px solid #dee2e6; font-size: 13px; }
  .fv-table tr:nth-child(even) { background: #f8f9fa; }
  .fv-table tr:hover { background: #e8f0fe; }
  .fv-table tr.outlier { background: #fff3f3; }
  .fv-table tr.outlier:hover { background: #ffe0e0; }
  .fv-table a { color: #0066cc; text-decoration: none; }
  .fv-table a:hover { text-decoration: underline; }
  .fv-step-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 32px; }
  .fv-step-table th { background: #1a1a2e !important; color: #ffffff !important; padding: 12px 10px !important; text-align: left; font-weight: 700 !important; font-size: 14px !important; letter-spacing: 0.3px; text-transform: uppercase; }
  .fv-step-table td { padding: 10px 10px; border-bottom: 1px solid #dee2e6; font-size: 13px; }
  .fv-step-table tr:nth-child(even) { background: #f8f9fa; }
  .fv-step-table tr:hover { background: #e8f0fe; }
  @media (max-width: 768px) {
    .fv-charts { grid-template-columns: 1fr; }
    .fv-kpis { grid-template-columns: repeat(2, 1fr); }
  }
</style>

<div class="fv-dash">
<h1>💰 LLM Cost Dashboard</h1>
<p class="subtitle">Mis à jour : ${new Date().toLocaleString('fr-FR')} — ${totalArticles} article(s) tracké(s)</p>

<div class="fv-kpis">
  <div class="fv-kpi"><div class="value">$${totalCost.toFixed(2)}</div><div class="label">Coût total</div></div>
  <div class="fv-kpi"><div class="value">$${avgCost.toFixed(4)}</div><div class="label">Coût moyen / article</div></div>
  <div class="fv-kpi"><div class="value">${avgTokens.toLocaleString('fr-FR')}</div><div class="label">Tokens moyens / article</div></div>
  <div class="fv-kpi"><div class="value">${avgDuration}s</div><div class="label">Durée moyenne</div></div>
  <div class="fv-kpi"><div class="value">$${(costPerWord * 1000).toFixed(3)}</div><div class="label">Coût / 1000 mots</div></div>
  <div class="fv-kpi"><div class="value">$${monthlyProjection.toFixed(2)}</div><div class="label">Projection / mois (${PLANNED_ARTICLES_PER_MONTH} art.) ${trendIcon}</div></div>
  <div class="fv-kpi"><div class="value">$${thisMonthCost.toFixed(2)}</div><div class="label">Ce mois (${thisMonthCount} art.)</div></div>
  <div class="fv-kpi${devCostThisMonth > 0 ? '' : ''}"><div class="value">$${devCostThisMonth.toFixed(2)}</div><div class="label">Dev/LLM ce mois</div></div>
</div>

<div class="fv-charts">
  <div class="fv-chart-box">
    <h3>Coût par article (USD)</h3>
    <canvas id="costChart" height="200"></canvas>
  </div>
  <div class="fv-chart-box">
    <h3>Répartition par modèle</h3>
    <canvas id="modelChart" height="200"></canvas>
  </div>
</div>

<div class="fv-charts">
  <div class="fv-chart-box">
    <h3>Coût par étape pipeline (total)</h3>
    <canvas id="stepChart" height="200"></canvas>
  </div>
  <div class="fv-chart-box">
    <h3>Tokens par article</h3>
    <canvas id="tokensChart" height="200"></canvas>
  </div>
</div>

<h2>Détail par étape pipeline (cumulé)</h2>
<table class="fv-step-table">
<thead><tr><th>Étape</th><th>Appels</th><th>Tokens IN</th><th>Tokens OUT</th><th>Coût USD</th><th>% du total</th></tr></thead>
<tbody>
${sortedSteps.map(([step, data]) => {
    const pct = totalCost > 0 ? ((data.costUSD / totalCost) * 100).toFixed(1) : '0';
    return `<tr><td><strong>${step}</strong></td><td>${data.calls}</td><td>${data.tokensIn.toLocaleString('fr-FR')}</td><td>${data.tokensOut.toLocaleString('fr-FR')}</td><td>$${data.costUSD.toFixed(4)}</td><td>${pct}%</td></tr>`;
  }).join('\n')}
</tbody>
</table>

<h2>Historique des articles</h2>
<div class="fv-table-wrap">
<table class="fv-table">
<thead><tr><th>Date</th><th>Article</th><th>Coût</th><th>Tokens</th><th>Appels</th><th>Mots</th><th>Coût/1k mots</th><th>Durée</th><th>LLM %</th></tr></thead>
<tbody>
${tableRows}
</tbody>
</table>
</div>

</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2/dist/chartjs-plugin-datalabels.min.js"></script>
<script>
(function() {
  // Register datalabels plugin
  if (window.ChartDataLabels) Chart.register(ChartDataLabels);

  const colors = {
    blue: '#0066cc',
    lightBlue: 'rgba(0,102,204,0.15)',
    orange: '#ff6b35',
    lightOrange: 'rgba(255,107,53,0.15)',
    green: '#2ec4b6',
    purple: '#9b5de5',
    pink: '#f15bb5',
    yellow: '#fee440',
    gray: '#adb5bd'
  };
  const palette = [colors.blue, colors.orange, colors.green, colors.purple, colors.pink, colors.yellow, colors.gray, '#00bbf9'];

  // Cost per article line chart
  new Chart(document.getElementById('costChart'), {
    type: 'line',
    data: {
      labels: ${JSON.stringify(chartLabels)},
      datasets: [{
        label: 'Coût USD',
        data: ${JSON.stringify(chartCosts)},
        borderColor: colors.blue,
        backgroundColor: colors.lightBlue,
        fill: true,
        tension: 0.3,
        pointRadius: 4
      }, {
        label: 'Moyenne',
        data: Array(${totalArticles}).fill(${avgCost.toFixed(4)}),
        borderColor: colors.orange,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v.toFixed(3) } } } }
  });

  // Model pie chart
  new Chart(document.getElementById('modelChart'), {
    type: 'doughnut',
    data: {
      labels: ${JSON.stringify(modelLabels)},
      datasets: [{ data: ${JSON.stringify(modelCosts)}, backgroundColor: palette.slice(0, ${modelLabels.length}) }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        datalabels: {
          color: '#fff',
          font: { weight: 'bold', size: 13 },
          formatter: (value, ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = ((value / total) * 100).toFixed(0);
            return '$' + value.toFixed(2) + '\n(' + pct + '%)';
          },
          textAlign: 'center'
        }
      }
    }
  });

  // Step bar chart
  new Chart(document.getElementById('stepChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(stepLabels)},
      datasets: [{ label: 'Coût USD', data: ${JSON.stringify(stepCosts)}, backgroundColor: palette.slice(0, ${stepLabels.length}) }]
    },
    options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { callback: v => '$' + v.toFixed(3) } } } }
  });

  // Tokens per article
  new Chart(document.getElementById('tokensChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(chartLabels)},
      datasets: [{ label: 'Tokens', data: ${JSON.stringify(chartTokens)}, backgroundColor: colors.lightBlue, borderColor: colors.blue, borderWidth: 1 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
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
