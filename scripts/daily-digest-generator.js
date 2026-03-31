#!/usr/bin/env node

/**
 * Daily Digest Generator — FlashVoyage
 *
 * Generates a comprehensive morning email digest for the founder.
 * Aggregates data from all overnight automation runs:
 *   - Reel publications (reel-history.jsonl)
 *   - IG stats (ig-stats-fetcher.js)
 *   - GA4 site metrics (ga4-fetcher.js)
 *   - Revenue data (revenue-tracker.js)
 *   - Content intelligence (article-scores, content-gaps, competitor-report)
 *   - Seasonal forecast (seasonal-forecast.json)
 *   - LLM cost tracking (cost-history.jsonl)
 *   - A/B tests (ab-tests.json)
 *   - Token expiration (tokens.json)
 *
 * Schedule: 1h15 UTC = 8h15 Bangkok (founder reads at 8-9am GMT+7)
 *
 * Output: HTML email sent via Gmail API (or written to file for review)
 *
 * CLI:
 *   node scripts/daily-digest-generator.js              # Generate + output HTML to stdout
 *   node scripts/daily-digest-generator.js --file       # Write to data/daily-digest.html
 *   node scripts/daily-digest-generator.js --json       # Output raw data as JSON
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const SD_DATA = join(ROOT, 'social-distributor', 'data');
const REELS_DATA = join(ROOT, 'social-distributor', 'reels', 'data');
const INTEL_DATA = join(ROOT, 'intelligence', 'data');

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  console.error(`[DIGEST] ${msg}`);
}

function loadJSON(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    log(`WARN: Failed to load ${path}: ${err.message}`);
    return null;
  }
}

function loadJSONL(path) {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function daysAgo(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function isYesterday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return d.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function isLast24h(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return (Date.now() - d.getTime()) < 24 * 60 * 60 * 1000;
}

function formatDelta(current, previous, suffix = '') {
  if (previous === 0 || previous === undefined || previous === null) {
    return `<span style="color:#666">${current}${suffix}</span>`;
  }
  const delta = current - previous;
  const pct = Math.round((delta / previous) * 100);
  if (delta > 0) {
    return `<span style="color:#16a34a; font-weight:600">${current}${suffix}</span> <span style="color:#16a34a; font-size:11px">+${pct}%</span>`;
  } else if (delta < 0) {
    return `<span style="color:#dc2626; font-weight:600">${current}${suffix}</span> <span style="color:#dc2626; font-size:11px">${pct}%</span>`;
  }
  return `<span style="color:#666">${current}${suffix}</span> <span style="color:#666; font-size:11px">=</span>`;
}

function formatEUR(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatUSD(amount) {
  return `$${amount.toFixed(4)}`;
}

// ── Data Collection ──────────────────────────────────────────────────────────

function collectReelData() {
  const historyPath = join(SD_DATA, 'reel-history.jsonl');
  const allReels = loadJSONL(historyPath);
  const last24h = allReels.filter(r => isLast24h(r.date));
  const contentHistory = loadJSON(join(REELS_DATA, 'content-history.json')) || {};

  return {
    total: allReels.length,
    last24h,
    publishedToday: last24h.length,
    formats: last24h.map(r => r.type || 'unknown'),
    contentHistory,
  };
}

function collectArticleData() {
  const scores = loadJSON(join(DATA_DIR, 'article-scores.json'));
  if (!scores?.scores) return { total: 0, articles: [], newArticles: [], topPerformers: [], declining: [] };

  const articles = scores.scores || [];
  // Articles published in last 24h
  const newArticles = articles.filter(a => isLast24h(a.publishedAt));
  // Articles with declining traffic
  const declining = articles
    .filter(a => a.signals?.trafficTrend === 'declining' || (a.signals?.freshness && a.signals.freshness < 0.3))
    .sort((a, b) => (a.signals?.freshness || 0) - (b.signals?.freshness || 0))
    .slice(0, 5);
  // Top performers
  const topPerformers = [...articles]
    .sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0))
    .slice(0, 5);

  return {
    total: articles.length,
    newArticles,
    topPerformers,
    declining,
    articles,
  };
}

function collectGAData() {
  // Try to find the latest GA4 report
  const reportDir = join(ROOT, 'social-distributor', 'analytics', 'reports');
  const audiencePath = join(SD_DATA, 'audience-segments.json');
  const audience = loadJSON(audiencePath);

  return {
    audience,
    available: !!audience,
  };
}

function collectRevenueData() {
  const revenuePath = join(SD_DATA, 'revenue-report.json');
  const revenue = loadJSON(revenuePath);
  return revenue || { summary: { totalRevenue: 0, totalClicks: 0, balance: 0, pendingBalance: 0 } };
}

function collectIntelligenceData() {
  const gaps = loadJSON(join(DATA_DIR, 'content-gaps.json'));
  const competitor = loadJSON(join(DATA_DIR, 'competitor-report.json'));
  const forecast = loadJSON(join(DATA_DIR, 'seasonal-forecast.json'));
  const queue = loadJSON(join(DATA_DIR, 'next-articles-queue.json'));

  return { gaps, competitor, forecast, queue };
}

function collectCostData() {
  const costPath = join(DATA_DIR, 'cost-history.jsonl');
  const allCosts = loadJSONL(costPath);
  const last24h = allCosts.filter(c => isLast24h(c.timestamp || c.date));

  const totalCostToday = last24h.reduce((sum, c) => sum + (c.totalCost || c.costUSD || 0), 0);
  const totalTokensToday = last24h.reduce((sum, c) => sum + (c.totalTokens || 0), 0);

  return {
    totalCostToday,
    totalTokensToday,
    callsToday: last24h.length,
    allTimeEntries: allCosts.length,
  };
}

function collectTokenData() {
  const tokens = loadJSON(join(SD_DATA, 'tokens.json')) || {};
  const warnings = [];

  for (const [platform, data] of Object.entries(tokens)) {
    if (data.expiresAt && data.expiresAt !== 'never') {
      const daysLeft = daysAgo(data.expiresAt) * -1; // negative daysAgo = future
      if (daysLeft <= 14) {
        warnings.push({
          platform,
          expiresAt: data.expiresAt,
          daysLeft,
          urgent: daysLeft <= 3,
        });
      }
    }
  }

  return { tokens, warnings };
}

function collectABTestData() {
  const abTests = loadJSON(join(SD_DATA, 'ab-tests.json')) || { activeTests: [], completedTests: [] };
  return {
    active: abTests.activeTests || [],
    completed: abTests.completedTests || [],
    readyForDecision: (abTests.activeTests || []).filter(t => t.status === 'ready_for_decision'),
  };
}

// ── GitHub Actions Run Data ──────────────────────────────────────────────────

function collectWorkflowErrors() {
  // This would ideally parse GitHub Actions API, but for now we check
  // local log markers in data files
  const errors = [];

  // Check if key data files are stale (indicating workflow failures)
  const checkFiles = [
    { path: join(DATA_DIR, 'article-scores.json'), name: 'Content Intelligence' },
    { path: join(DATA_DIR, 'competitor-report.json'), name: 'Competitor Monitor' },
    { path: join(REELS_DATA, 'trend-priorities.json'), name: 'Trends Scanner' },
    { path: join(REELS_DATA, 'performance-weights.json'), name: 'Performance Scorer' },
  ];

  for (const { path, name } of checkFiles) {
    const data = loadJSON(path);
    if (data?.timestamp || data?.generatedAt || data?.fetchedAt) {
      const ts = data.timestamp || data.generatedAt || data.fetchedAt;
      const age = daysAgo(ts);
      if (age > 2) {
        errors.push({
          module: name,
          lastRun: ts,
          daysStale: age,
          severity: age > 7 ? 'critical' : 'warning',
        });
      }
    }
  }

  return errors;
}

// ── HTML Email Generator ─────────────────────────────────────────────────────

function generateDigestHTML(data) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const { reels, articles, ga, revenue, intel, costs, tokens, abTests, errors } = data;

  // Build sections
  const sections = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: OVERNIGHT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  let overnightHTML = '';

  // Reels published
  if (reels.publishedToday > 0) {
    const reelRows = reels.last24h.map(r => {
      const format = (r.type || 'unknown').toUpperCase();
      const dest = r.destination || r.postId || '?';
      return `<tr>
        <td style="padding:4px 8px; border-bottom:1px solid #f0f0f0"><span style="background:#FFF3CD; color:#856404; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600">${format}</span></td>
        <td style="padding:4px 8px; border-bottom:1px solid #f0f0f0; font-size:13px">${dest}</td>
        <td style="padding:4px 8px; border-bottom:1px solid #f0f0f0; font-size:11px; color:#666">${r.date ? new Date(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '?'}</td>
      </tr>`;
    }).join('');

    overnightHTML += `
      <div style="margin-bottom:12px">
        <div style="font-size:14px; font-weight:600; margin-bottom:6px">
          <span style="font-size:16px">&#127916;</span> ${reels.publishedToday} Reel${reels.publishedToday > 1 ? 's' : ''} publie${reels.publishedToday > 1 ? 's' : ''}
        </div>
        <table style="width:100%; border-collapse:collapse; font-family:monospace; font-size:13px">
          <tr style="background:#f8f9fa">
            <th style="text-align:left; padding:4px 8px; font-size:11px; color:#666">FORMAT</th>
            <th style="text-align:left; padding:4px 8px; font-size:11px; color:#666">SUJET</th>
            <th style="text-align:left; padding:4px 8px; font-size:11px; color:#666">HEURE</th>
          </tr>
          ${reelRows}
        </table>
      </div>`;
  } else {
    overnightHTML += `
      <div style="margin-bottom:12px">
        <div style="font-size:14px; color:#666">
          <span style="font-size:16px">&#127916;</span> Aucun reel publie (total historique : ${reels.total})
        </div>
      </div>`;
  }

  // New articles
  if (articles.newArticles.length > 0) {
    overnightHTML += `
      <div style="margin-bottom:12px">
        <div style="font-size:14px; font-weight:600">
          <span style="font-size:16px">&#128221;</span> ${articles.newArticles.length} article${articles.newArticles.length > 1 ? 's' : ''} publie${articles.newArticles.length > 1 ? 's' : ''}
        </div>
        ${articles.newArticles.map(a => `<div style="font-size:13px; padding:2px 0 2px 24px; color:#333">${a.title || a.slug}</div>`).join('')}
      </div>`;
  }

  // Errors / Stale workflows
  if (errors.length > 0) {
    overnightHTML += `
      <div style="margin-bottom:12px; background:#FEF2F2; border-radius:8px; padding:10px 12px">
        <div style="font-size:14px; font-weight:600; color:#DC2626">
          <span style="font-size:16px">&#9888;&#65039;</span> ${errors.length} alerte${errors.length > 1 ? 's' : ''} pipeline
        </div>
        ${errors.map(e => `
          <div style="font-size:12px; padding:3px 0 3px 24px; color:#991B1B">
            <strong>${e.module}</strong> — donne es vieilles de ${e.daysStale}j
            ${e.severity === 'critical' ? '<span style="background:#DC2626; color:white; padding:1px 5px; border-radius:3px; font-size:10px; margin-left:4px">CRITIQUE</span>' : ''}
          </div>`).join('')}
      </div>`;
  }

  sections.push({
    icon: '&#9881;&#65039;',
    title: 'Operations de la nuit',
    content: overnightHTML || '<div style="font-size:13px; color:#999">Aucune activite detectee</div>',
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: PERFORMANCE SNAPSHOT
  // ═══════════════════════════════════════════════════════════════════════════

  let perfHTML = '';

  // GA4 summary
  if (ga.available && ga.audience) {
    const a = ga.audience;
    perfHTML += `
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px">
        <div style="flex:1; min-width:80px; background:#f0fdf4; border-radius:8px; padding:10px; text-align:center">
          <div style="font-size:11px; color:#666; text-transform:uppercase; letter-spacing:0.5px">Top Pays</div>
          <div style="font-size:18px; font-weight:700; color:#16a34a">${a.byCountry?.[0]?.country || '?'}</div>
          <div style="font-size:10px; color:#888">${a.byCountry?.[0]?.percentage || 0}% du trafic</div>
        </div>
        <div style="flex:1; min-width:80px; background:#eff6ff; border-radius:8px; padding:10px; text-align:center">
          <div style="font-size:11px; color:#666; text-transform:uppercase; letter-spacing:0.5px">Top Canal</div>
          <div style="font-size:18px; font-weight:700; color:#2563eb">${a.byChannel?.[0]?.channel || '?'}</div>
          <div style="font-size:10px; color:#888">${a.byChannel?.[0]?.sessions || 0} sessions</div>
        </div>
        <div style="flex:1; min-width:80px; background:#fefce8; border-radius:8px; padding:10px; text-align:center">
          <div style="font-size:11px; color:#666; text-transform:uppercase; letter-spacing:0.5px">Mobile</div>
          <div style="font-size:18px; font-weight:700; color:#ca8a04">${a.byDevice?.find(d => d.device === 'mobile')?.percentage || '?'}%</div>
          <div style="font-size:10px; color:#888">du trafic</div>
        </div>
        <div style="flex:1; min-width:80px; background:#faf5ff; border-radius:8px; padding:10px; text-align:center">
          <div style="font-size:11px; color:#666; text-transform:uppercase; letter-spacing:0.5px">Retour</div>
          <div style="font-size:18px; font-weight:700; color:#7c3aed">${a.newVsReturning?.returningRate || 0}%</div>
          <div style="font-size:10px; color:#888">visiteurs fideles</div>
        </div>
      </div>`;
  } else {
    perfHTML += `
      <div style="font-size:13px; color:#999; margin-bottom:12px">
        <span style="font-size:14px">&#128202;</span> Donnees GA4 non disponibles (verifier le workflow daily-analytics)
      </div>`;
  }

  // Revenue
  const rev = revenue.summary || {};
  perfHTML += `
    <div style="background:#fefce8; border-radius:8px; padding:10px 12px; margin-bottom:12px">
      <div style="font-size:13px; font-weight:600; color:#854d0e; margin-bottom:4px">
        <span style="font-size:14px">&#128176;</span> Revenus Travelpayouts
      </div>
      <div style="display:flex; gap:16px; flex-wrap:wrap">
        <div>
          <span style="font-size:11px; color:#92400e">Solde</span>
          <div style="font-size:16px; font-weight:700; color:#854d0e">${formatEUR(rev.balance || 0)}</div>
        </div>
        <div>
          <span style="font-size:11px; color:#92400e">En attente</span>
          <div style="font-size:16px; font-weight:700; color:#ca8a04">${formatEUR(rev.pendingBalance || 0)}</div>
        </div>
        <div>
          <span style="font-size:11px; color:#92400e">Clics (30j)</span>
          <div style="font-size:16px; font-weight:700; color:#854d0e">${rev.totalClicks || 0}</div>
        </div>
        <div>
          <span style="font-size:11px; color:#92400e">Conversions</span>
          <div style="font-size:16px; font-weight:700; color:#854d0e">${rev.totalConversions || 0}</div>
        </div>
      </div>
    </div>`;

  // Content inventory
  perfHTML += `
    <div style="font-size:13px; color:#333">
      <span style="font-size:14px">&#128218;</span> <strong>${articles.total}</strong> articles | <strong>${reels.total}</strong> reels publies au total
    </div>`;

  sections.push({
    icon: '&#128200;',
    title: 'Snapshot Performance',
    content: perfHTML,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: INTELLIGENCE HIGHLIGHTS
  // ═══════════════════════════════════════════════════════════════════════════

  let intelHTML = '';

  // Content gaps
  if (intel.gaps?.gaps?.length > 0) {
    const topGaps = intel.gaps.gaps.slice(0, 3);
    intelHTML += `
      <div style="margin-bottom:12px">
        <div style="font-size:13px; font-weight:600; margin-bottom:4px">
          <span style="font-size:14px">&#128270;</span> Sujets manquants (content gaps)
        </div>
        ${topGaps.map(g => `
          <div style="font-size:12px; padding:3px 0 3px 24px; color:#333">
            <span style="background:#DBEAFE; color:#1E40AF; padding:1px 5px; border-radius:3px; font-size:10px">${g.type || g.category || 'gap'}</span>
            ${g.keyword || g.topic || g.query || '?'}
            ${g.monthlySearches ? `<span style="color:#888; font-size:11px">(~${g.monthlySearches} rech/mois)</span>` : ''}
          </div>`).join('')}
      </div>`;
  }

  // Competitor moves
  if (intel.competitor?.summary) {
    const s = intel.competitor.summary;
    if (s.totalNew > 0) {
      intelHTML += `
        <div style="margin-bottom:12px">
          <div style="font-size:13px; font-weight:600; margin-bottom:4px">
            <span style="font-size:14px">&#128373;&#65039;</span> Mouvements concurrents
          </div>
          <div style="font-size:12px; padding:3px 0 3px 24px; color:#333">
            <strong>${s.totalNew}</strong> nouveaux articles detectes
            ${s.contentGaps > 0 ? ` dont <span style="color:#DC2626; font-weight:600">${s.contentGaps} gaps P1</span>` : ''}
            ${s.staleRefreshes > 0 ? ` et <span style="color:#F59E0B; font-weight:600">${s.staleRefreshes} a rafraichir</span>` : ''}
          </div>
          ${(intel.competitor.newArticles || []).filter(a => a.priority === 'P1').slice(0, 3).map(a => `
            <div style="font-size:11px; padding:2px 0 2px 24px; color:#666">
              <span style="color:#DC2626; font-weight:600">P1</span> ${a.title} <span style="color:#999">(${a.competitor})</span>
            </div>`).join('')}
        </div>`;
    }
  }

  // Declining articles
  if (articles.declining.length > 0) {
    intelHTML += `
      <div style="margin-bottom:12px">
        <div style="font-size:13px; font-weight:600; margin-bottom:4px">
          <span style="font-size:14px">&#128308;</span> Articles en declin
        </div>
        ${articles.declining.slice(0, 3).map(a => `
          <div style="font-size:12px; padding:3px 0 3px 24px; color:#333">
            ${a.title || a.slug}
            <span style="color:#DC2626; font-size:11px">(fraicheur: ${((a.signals?.freshness || 0) * 100).toFixed(0)}%)</span>
          </div>`).join('')}
      </div>`;
  }

  // Seasonal forecast
  if (intel.forecast?.destinations) {
    const urgent = intel.forecast.destinations.filter(d => d.urgency === 'URGENT' || d.daysUntilPublish <= 30);
    if (urgent.length > 0) {
      intelHTML += `
        <div style="margin-bottom:12px; background:#FEF2F2; border-radius:8px; padding:10px 12px">
          <div style="font-size:13px; font-weight:600; color:#DC2626; margin-bottom:4px">
            <span style="font-size:14px">&#128197;</span> Alertes saisonnieres URGENTES
          </div>
          ${urgent.slice(0, 3).map(d => `
            <div style="font-size:12px; padding:3px 0 3px 24px; color:#991B1B">
              Publier <strong>${d.destination}</strong> avant le <strong>${d.publishBy || '?'}</strong>
              <span style="font-size:11px; color:#999">(pic en ${d.peakMonth || '?'})</span>
            </div>`).join('')}
        </div>`;
    }
  }

  if (!intelHTML) {
    intelHTML = '<div style="font-size:13px; color:#999">Aucune alerte intelligence aujourd\'hui</div>';
  }

  sections.push({
    icon: '&#129504;',
    title: 'Intelligence editoriale',
    content: intelHTML,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: COSTS
  // ═══════════════════════════════════════════════════════════════════════════

  let costsHTML = `
    <div style="display:flex; gap:12px; flex-wrap:wrap">
      <div style="flex:1; min-width:120px; background:#f8f9fa; border-radius:8px; padding:10px; text-align:center">
        <div style="font-size:11px; color:#666; text-transform:uppercase">LLM (24h)</div>
        <div style="font-size:20px; font-weight:700; color:#333">${formatUSD(costs.totalCostToday)}</div>
        <div style="font-size:10px; color:#888">${costs.callsToday} appels API</div>
      </div>
      <div style="flex:1; min-width:120px; background:#f8f9fa; border-radius:8px; padding:10px; text-align:center">
        <div style="font-size:11px; color:#666; text-transform:uppercase">Tokens (24h)</div>
        <div style="font-size:20px; font-weight:700; color:#333">${costs.totalTokensToday > 1000 ? `${(costs.totalTokensToday / 1000).toFixed(1)}k` : costs.totalTokensToday}</div>
        <div style="font-size:10px; color:#888">prompt + completion</div>
      </div>
    </div>`;

  sections.push({
    icon: '&#128184;',
    title: 'Couts (24h)',
    content: costsHTML,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: ACTION ITEMS
  // ═══════════════════════════════════════════════════════════════════════════

  let actionsHTML = '';
  const actionItems = [];

  // Token warnings
  for (const tw of tokens.warnings) {
    actionItems.push({
      priority: tw.urgent ? 'P0' : 'P1',
      icon: '&#128273;',
      text: `Token <strong>${tw.platform}</strong> expire dans <strong>${tw.daysLeft}j</strong> (${tw.expiresAt.slice(0, 10)})`,
      color: tw.urgent ? '#DC2626' : '#F59E0B',
    });
  }

  // A/B tests ready for decision
  for (const test of abTests.readyForDecision) {
    actionItems.push({
      priority: 'P1',
      icon: '&#9878;&#65039;',
      text: `A/B test <strong>${test.name || test.id}</strong> pret pour decision`,
      color: '#2563EB',
    });
  }

  // Competitor P1 gaps (manual review needed)
  const p1Gaps = (intel.competitor?.newArticles || []).filter(a => a.priority === 'P1').length;
  if (p1Gaps > 0) {
    actionItems.push({
      priority: 'P2',
      icon: '&#128221;',
      text: `<strong>${p1Gaps}</strong> gap${p1Gaps > 1 ? 's' : ''} concurrent${p1Gaps > 1 ? 's' : ''} P1 — valider le calendrier editorial`,
      color: '#F59E0B',
    });
  }

  // Stale data warnings
  const criticalErrors = errors.filter(e => e.severity === 'critical');
  for (const e of criticalErrors) {
    actionItems.push({
      priority: 'P0',
      icon: '&#128680;',
      text: `<strong>${e.module}</strong> en panne depuis ${e.daysStale}j — verifier GitHub Actions`,
      color: '#DC2626',
    });
  }

  if (actionItems.length > 0) {
    actionItems.sort((a, b) => a.priority.localeCompare(b.priority));
    actionsHTML = actionItems.map(item => `
      <div style="padding:6px 0; border-bottom:1px solid #f0f0f0; display:flex; align-items:flex-start; gap:8px">
        <span style="font-size:14px; flex-shrink:0">${item.icon}</span>
        <div>
          <span style="background:${item.color}; color:white; padding:1px 6px; border-radius:3px; font-size:10px; font-weight:600; margin-right:4px">${item.priority}</span>
          <span style="font-size:13px; color:#333">${item.text}</span>
        </div>
      </div>`).join('');
  } else {
    actionsHTML = `
      <div style="font-size:13px; color:#16a34a; text-align:center; padding:12px 0">
        <span style="font-size:20px">&#9989;</span><br>
        Aucune action manuelle requise.<br>
        <span style="font-size:12px; color:#999">Les bots gerent tout. Profite de Bangkok.</span>
      </div>`;
  }

  sections.push({
    icon: '&#9997;&#65039;',
    title: `Actions requises${actionItems.length > 0 ? ` (${actionItems.length})` : ''}`,
    content: actionsHTML,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: MOTIVATION / FUN
  // ═══════════════════════════════════════════════════════════════════════════

  let funHTML = '';

  // Milestones
  const milestones = [];
  if (reels.total === 1) milestones.push('Premier reel publie !');
  if (reels.total === 10) milestones.push('10 reels publies !');
  if (reels.total === 50) milestones.push('50 reels publies !');
  if (reels.total === 100) milestones.push('100 reels — triple chiffre !');
  if (articles.total === 100) milestones.push('100 articles publies !');
  if (articles.total === 150) milestones.push('150 articles — la machine tourne !');
  if (articles.total === 200) milestones.push('200 articles publies !');

  if (milestones.length > 0) {
    funHTML += milestones.map(m => `
      <div style="background:linear-gradient(135deg, #FFD700, #FFA500); border-radius:8px; padding:12px; text-align:center; margin-bottom:8px">
        <div style="font-size:20px; margin-bottom:4px">&#127881;</div>
        <div style="font-size:14px; font-weight:700; color:#333">${m}</div>
      </div>`).join('');
  }

  // Top article performance highlight
  if (articles.topPerformers.length > 0) {
    const top = articles.topPerformers[0];
    funHTML += `
      <div style="background:#f0fdf4; border-radius:8px; padding:10px 12px; text-align:center">
        <div style="font-size:11px; color:#16a34a; text-transform:uppercase; letter-spacing:0.5px">Meilleur article</div>
        <div style="font-size:14px; font-weight:600; color:#333; margin-top:4px">${top.title || top.slug}</div>
        <div style="font-size:12px; color:#16a34a; margin-top:2px">Score: ${(top.compositeScore || 0).toFixed(1)}/100</div>
      </div>`;
  }

  if (!funHTML) {
    // Motivational quote rotation
    const quotes = [
      'Le meilleur moment pour planter un arbre etait il y a 20 ans. Le deuxieme meilleur moment, c\'est maintenant.',
      'Chaque article publie est un actif qui travaille pour toi 24/7.',
      'La constance bat le talent quand le talent ne travaille pas.',
      'Un voyage de mille lieues commence par un seul pas.',
      'Les grandes choses se font par une serie de petites choses reunies.',
    ];
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    funHTML = `
      <div style="font-size:13px; font-style:italic; color:#666; text-align:center; padding:8px 12px">
        "${quote}"
      </div>`;
  }

  sections.push({
    icon: '&#128170;',
    title: 'Motivation du jour',
    content: funHTML,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSEMBLE FULL EMAIL
  // ═══════════════════════════════════════════════════════════════════════════

  const sectionHTML = sections.map((s, i) => `
    <div style="margin-bottom:${i < sections.length - 1 ? '20' : '0'}px">
      <div style="font-size:16px; font-weight:700; color:#1a1a2e; margin-bottom:10px; padding-bottom:6px; border-bottom:2px solid #FFD700">
        <span style="margin-right:6px">${s.icon}</span>${s.title}
      </div>
      ${s.content}
    </div>`).join('');

  const priorityStatusColor = actionItems.some(a => a.priority === 'P0')
    ? '#DC2626'
    : actionItems.some(a => a.priority === 'P1')
      ? '#F59E0B'
      : '#16a34a';

  const priorityStatusText = actionItems.some(a => a.priority === 'P0')
    ? 'ACTION REQUISE'
    : actionItems.some(a => a.priority === 'P1')
      ? 'A SURVEILLER'
      : 'TOUT EST OK';

  const emailHTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FlashVoyage Daily Digest</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing:antialiased">

  <!-- Preheader (hidden text for inbox preview) -->
  <div style="display:none; max-height:0; overflow:hidden">
    ${reels.publishedToday} reels | ${articles.total} articles | ${priorityStatusText} | ${formatEUR(rev.balance || 0)} TP balance
  </div>

  <div style="max-width:520px; margin:0 auto; padding:16px">

    <!-- HEADER -->
    <div style="background:linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius:12px 12px 0 0; padding:20px 20px 16px; text-align:center">
      <div style="font-size:24px; margin-bottom:4px">&#9889;</div>
      <div style="font-size:20px; font-weight:800; color:#FFD700; letter-spacing:0.5px; font-family:'Montserrat', sans-serif">FLASH VOYAGE</div>
      <div style="font-size:11px; color:#94a3b8; margin-top:2px; text-transform:uppercase; letter-spacing:1px">Daily Digest</div>
      <div style="font-size:12px; color:#cbd5e1; margin-top:6px">${dateStr}</div>
      <div style="margin-top:10px">
        <span style="background:${priorityStatusColor}; color:white; padding:4px 12px; border-radius:12px; font-size:11px; font-weight:700; letter-spacing:0.5px">${priorityStatusText}</span>
      </div>
    </div>

    <!-- QUICK STATS BAR -->
    <div style="background:#1e293b; padding:10px 16px; display:flex; justify-content:space-around; flex-wrap:wrap; gap:4px">
      <div style="text-align:center">
        <div style="font-size:18px; font-weight:700; color:#FFD700">${reels.publishedToday}</div>
        <div style="font-size:9px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px">Reels</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:18px; font-weight:700; color:#60a5fa">${articles.total}</div>
        <div style="font-size:9px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px">Articles</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:18px; font-weight:700; color:#34d399">${formatEUR(rev.balance || 0)}</div>
        <div style="font-size:9px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px">Revenue</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:18px; font-weight:700; color:#${costs.totalCostToday > 0.50 ? 'f87171' : 'a3e635'}">${formatUSD(costs.totalCostToday)}</div>
        <div style="font-size:9px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px">Couts</div>
      </div>
    </div>

    <!-- MAIN CONTENT -->
    <div style="background:white; padding:20px; border-radius:0 0 12px 12px; box-shadow:0 2px 8px rgba(0,0,0,0.06)">
      ${sectionHTML}
    </div>

    <!-- FOOTER -->
    <div style="text-align:center; padding:16px 0 8px; font-size:10px; color:#94a3b8">
      FlashVoyage Daily Digest — genere automatiquement a ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} (Bangkok)<br>
      <a href="https://flashvoyage.com" style="color:#FFD700; text-decoration:none">flashvoyage.com</a>
      &nbsp;|&nbsp;
      <a href="https://github.com/peterbono/flashvoyage-ultra-content/actions" style="color:#60a5fa; text-decoration:none">GitHub Actions</a>
    </div>
  </div>
</body>
</html>`;

  return emailHTML;
}

// ── Subject Line Generator ───────────────────────────────────────────────────

function generateSubject(data) {
  const { reels, articles, errors, tokens, costs } = data;

  // Priority indicator
  const hasP0 = tokens.warnings.some(t => t.urgent) || errors.some(e => e.severity === 'critical');
  const hasP1 = tokens.warnings.length > 0 || errors.length > 0;

  let prefix;
  if (hasP0) {
    prefix = '🔴';
  } else if (hasP1) {
    prefix = '🟡';
  } else {
    prefix = '🟢';
  }

  const dateShort = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const reelCount = reels.publishedToday;
  const costStr = costs.totalCostToday > 0 ? ` | ${formatUSD(costs.totalCostToday)}` : '';

  return `${prefix} FlashVoyage ${dateShort} — ${reelCount} reel${reelCount !== 1 ? 's' : ''}${costStr}`;
}

// ── Main Entry ───────────────────────────────────────────────────────────────

function collectAllData() {
  const reels = collectReelData();
  const articles = collectArticleData();
  const ga = collectGAData();
  const revenue = collectRevenueData();
  const intel = collectIntelligenceData();
  const costs = collectCostData();
  const tokens = collectTokenData();
  const abTests = collectABTestData();
  const errors = collectWorkflowErrors();

  return { reels, articles, ga, revenue, intel, costs, tokens, abTests, errors };
}

// CLI interface
const args = process.argv.slice(2);
const mode = args[0] || '--stdout';

const data = collectAllData();

if (mode === '--json') {
  console.log(JSON.stringify(data, null, 2));
} else if (mode === '--file') {
  const html = generateDigestHTML(data);
  const outPath = join(DATA_DIR, 'daily-digest.html');
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(outPath, html, 'utf-8');
  log(`Digest written to ${outPath}`);
  console.log(outPath);
} else if (mode === '--subject') {
  console.log(generateSubject(data));
} else {
  // Default: output full HTML to stdout
  const html = generateDigestHTML(data);
  console.log(html);
}

// Export for programmatic use
export { collectAllData, generateDigestHTML, generateSubject };
