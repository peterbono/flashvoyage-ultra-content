#!/usr/bin/env node

/**
 * QUALITY DASHBOARD — FlashVoyage Quality Metrics
 * 
 * Reads pipeline reports and review data to produce a consolidated quality summary.
 * Run: node quality-dashboard.js
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Configuration ─────────────────────────────────────

const AGENT_WEIGHTS = {
  'seo-expert': { label: 'SEO', weight: 1.0 },
  'affiliation-expert': { label: 'Affiliation', weight: 1.0 },
  'editorial-expert': { label: 'Éditorial', weight: 1.5 },
  'ux-bugs-expert': { label: 'UX/Bugs', weight: 2.0 },
  'integrity-expert': { label: 'Intégrité', weight: 1.0 }
};

// ─── Data loaders ──────────────────────────────────────

function loadPipelineReport() {
  const path = join(__dirname, 'pipeline-report-output.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return null; }
}

function loadReviewReports() {
  const dataDir = join(__dirname, 'data');
  if (!existsSync(dataDir)) return [];
  
  const files = readdirSync(dataDir).filter(f => f.startsWith('post-publish-review-') && f.endsWith('.json'));
  const reports = [];
  
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
      reports.push(data);
    } catch { /* skip corrupted files */ }
  }
  
  return reports;
}

function loadCostHistory() {
  const path = join(__dirname, 'data', 'cost-history.jsonl');
  if (!existsSync(path)) return [];
  
  const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return entries;
}

// ─── Score computation ─────────────────────────────────

function computeWeightedScore(agentScores) {
  let totalWeighted = 0;
  let totalWeight = 0;
  
  for (const [agentId, data] of Object.entries(agentScores)) {
    const config = AGENT_WEIGHTS[agentId];
    if (!config) continue;
    const score = typeof data === 'number' ? data : (data?.score ?? 0);
    totalWeighted += score * config.weight;
    totalWeight += config.weight;
  }
  
  return totalWeight > 0 ? Math.round(totalWeighted / totalWeight * 10) / 10 : 0;
}

// ─── Trend analysis ────────────────────────────────────

function computeTrends(articles) {
  if (articles.length < 2) return null;
  
  const agentHistory = {};
  
  for (const article of articles) {
    const scores = article.agentScores || {};
    for (const [agentId, data] of Object.entries(scores)) {
      if (!agentHistory[agentId]) agentHistory[agentId] = [];
      const score = typeof data === 'number' ? data : (data?.score ?? 0);
      agentHistory[agentId].push(score);
    }
  }
  
  const trends = {};
  for (const [agentId, scores] of Object.entries(agentHistory)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const recentHalf = scores.slice(Math.floor(scores.length / 2));
    const olderHalf = scores.slice(0, Math.floor(scores.length / 2));
    
    const recentAvg = recentHalf.length > 0 ? recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length : avg;
    const olderAvg = olderHalf.length > 0 ? olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length : avg;
    const delta = recentAvg - olderAvg;
    
    trends[agentId] = {
      avg: Math.round(avg * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      count: scores.length
    };
  }
  
  return trends;
}

// ─── Recurring issues extraction ───────────────────────

function extractRecurringIssues(reviewReports, pipelineReport) {
  const issueMap = {};
  
  // From review reports (detailed)
  for (const report of reviewReports) {
    const iterations = report.iterations || [];
    // Use the last iteration's data
    const lastIter = iterations[iterations.length - 1];
    if (!lastIter) continue;
    
    // Issues may be embedded in scores or in the report itself
    // We track category + description combos
  }
  
  // From pipeline report (top recurring issues)
  if (pipelineReport?.topRecurringIssues) {
    for (const issue of pipelineReport.topRecurringIssues) {
      const key = issue.issueKey || '';
      const parts = key.split('|');
      const category = parts[0] || 'Unknown';
      const desc = (parts[1] || '').trim().substring(0, 80);
      const mapKey = `${category}: ${desc}`;
      issueMap[mapKey] = (issueMap[mapKey] || 0) + (issue.count || 1);
    }
  }
  
  // Sort by frequency
  return Object.entries(issueMap)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// ─── Build article history from all sources ────────────

function buildArticleHistory(pipelineReport, reviewReports, costHistory) {
  const articles = [];
  
  // From pipeline report (most recent)
  if (pipelineReport) {
    articles.push({
      title: pipelineReport.title || 'Unknown',
      weightedScore: pipelineReport.weightedScore || 0,
      approved: pipelineReport.approved || false,
      agentScores: pipelineReport.agentScores || {},
      timestamp: pipelineReport.timestamp || null,
      source: 'pipeline-report'
    });
  }
  
  // From review reports
  for (const report of reviewReports) {
    const lastIter = report.iterations?.[report.iterations.length - 1];
    if (!lastIter) continue;
    
    articles.push({
      title: report.title || 'Unknown',
      weightedScore: lastIter.weightedScore || 0,
      approved: report.finalDecision === 'APPROVED',
      agentScores: lastIter.scores || {},
      timestamp: report.startedAt || null,
      source: 'review-report'
    });
  }
  
  // From cost history (limited agent info, but has article titles)
  for (const entry of costHistory) {
    // Only add if not already present (by title match)
    const exists = articles.some(a => a.title === entry.title);
    if (!exists && entry.title) {
      articles.push({
        title: entry.title,
        weightedScore: null, // cost history doesn't have scores
        approved: null,
        agentScores: {},
        timestamp: entry.date || null,
        source: 'cost-history'
      });
    }
  }
  
  // Sort by timestamp descending
  articles.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });
  
  return articles;
}

// ─── Display helpers ───────────────────────────────────

function pad(str, len) {
  return String(str).padEnd(len);
}

function padStart(str, len) {
  return String(str).padStart(len);
}

function trendArrow(delta) {
  if (delta > 0) return `\u2191 +${delta}`;
  if (delta < 0) return `\u2193 ${delta}`;
  return '= 0.0';
}

function statusEmoji(approved) {
  if (approved === true) return 'APPROVED';
  if (approved === false) return 'REJECTED';
  return 'N/A';
}

function truncTitle(title, max = 50) {
  if (!title || title.length <= max) return title || 'Unknown';
  return title.substring(0, max - 3) + '...';
}

// ─── Main dashboard render ─────────────────────────────

function renderDashboard() {
  console.log('\n' + '='.repeat(70));
  console.log('  FlashVoyage Quality Dashboard');
  console.log('='.repeat(70));
  
  const pipelineReport = loadPipelineReport();
  const reviewReports = loadReviewReports();
  const costHistory = loadCostHistory();
  
  const articles = buildArticleHistory(pipelineReport, reviewReports, costHistory);
  const scoredArticles = articles.filter(a => a.weightedScore !== null);
  
  // ─── Last Run Summary ──────────────────────────────
  
  const latest = scoredArticles[0];
  
  if (latest) {
    const date = latest.timestamp ? new Date(latest.timestamp).toISOString().slice(0, 16).replace('T', ' ') : 'N/A';
    console.log(`\n  Last run: ${date}`);
    console.log(`  Article:  ${truncTitle(latest.title, 60)}`);
    console.log(`  Score:    ${latest.weightedScore} / 100 | Status: ${statusEmoji(latest.approved)}`);
    
    // Agent breakdown
    console.log('\n  Agent Scores:');
    const agentOrder = ['seo-expert', 'affiliation-expert', 'editorial-expert', 'ux-bugs-expert', 'integrity-expert'];
    
    for (const agentId of agentOrder) {
      const config = AGENT_WEIGHTS[agentId];
      if (!config) continue;
      
      const data = latest.agentScores[agentId];
      const score = data ? (typeof data === 'number' ? data : data.score) : '-';
      const verdict = data?.verdict || '-';
      const weightStr = `(weight ${config.weight})`;
      
      console.log(`    ${pad(config.label + ':', 15)} ${padStart(score, 3)}/100 ${pad(weightStr, 14)} [${verdict}]`);
    }
    
    console.log(`\n    Weighted:       ${padStart(latest.weightedScore, 5)}/100`);
  } else {
    console.log('\n  No scored articles found.');
  }
  
  // ─── Score History ─────────────────────────────────
  
  if (scoredArticles.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('  Score History (last 10 articles):');
    console.log('-'.repeat(70));
    
    const last10 = scoredArticles.slice(0, 10);
    for (const article of last10) {
      const status = statusEmoji(article.approved);
      const title = truncTitle(article.title, 45);
      console.log(`    ${pad(title, 47)} ${padStart(article.weightedScore, 5)} | ${status}`);
    }
  }
  
  // ─── Agent Trends ──────────────────────────────────
  
  const trends = computeTrends(scoredArticles);
  
  if (trends && Object.keys(trends).length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('  Agent Trends:');
    console.log('-'.repeat(70));
    
    for (const [agentId, trend] of Object.entries(trends)) {
      const config = AGENT_WEIGHTS[agentId];
      if (!config) continue;
      
      console.log(`    ${pad(config.label + ':', 15)} avg ${padStart(trend.avg, 5)} (${trendArrow(trend.delta)}) [${trend.count} articles]`);
    }
  }
  
  // ─── Recurring Issues ──────────────────────────────
  
  const recurring = extractRecurringIssues(reviewReports, pipelineReport);
  
  if (recurring.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('  Top Recurring Issues:');
    console.log('-'.repeat(70));
    
    for (let i = 0; i < recurring.length; i++) {
      const r = recurring[i];
      console.log(`    ${i + 1}. ${r.issue} (x${r.count})`);
    }
  }
  
  // ─── Cost Summary ──────────────────────────────────
  
  if (costHistory.length > 0) {
    const totalCost = costHistory.reduce((sum, e) => sum + (e.totalCostUSD || 0), 0);
    const avgCost = totalCost / costHistory.length;
    const totalArticles = costHistory.length;
    const last5 = costHistory.slice(-5);
    const recentAvgCost = last5.reduce((sum, e) => sum + (e.totalCostUSD || 0), 0) / last5.length;
    
    console.log('\n' + '-'.repeat(70));
    console.log('  Cost Summary:');
    console.log('-'.repeat(70));
    console.log(`    Total articles tracked:    ${totalArticles}`);
    console.log(`    Total cost:                $${totalCost.toFixed(2)} USD`);
    console.log(`    Avg cost/article:          $${avgCost.toFixed(4)} USD`);
    console.log(`    Recent avg (last 5):       $${recentAvgCost.toFixed(4)} USD`);
  }
  
  // ─── Iteration Efficiency ──────────────────────────
  
  if (pipelineReport?.iterationTelemetry?.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('  Iteration Telemetry (last pipeline run):');
    console.log('-'.repeat(70));
    
    for (const iter of pipelineReport.iterationTelemetry) {
      const ws = iter.panel?.weightedScore ?? '-';
      const crit = iter.panel?.criticalIssues ?? '-';
      const fixes = iter.rewrite?.requestedFixes ?? '-';
      const target = iter.stageTarget ?? '-';
      console.log(`    Iter ${iter.iteration}: score ${padStart(ws, 5)} | target ${target} | criticals ${crit} | fixes ${fixes}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`  Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`);
  console.log('='.repeat(70) + '\n');
}

// ─── Run ──────────────────────────────────────────────

renderDashboard();
