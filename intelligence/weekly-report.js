#!/usr/bin/env node

/**
 * Weekly CEO Report Generator — FlashVoyage Intelligence
 *
 * Auto-generates the Monday morning CEO report by combining all data sources:
 *   - GA4: sessions, pageviews, users, avg duration (7d + 30d), top 5 articles, traffic sources
 *   - GSC: impressions, clicks, avg position, avg CTR (7d), top 3 quick wins (pos 5-20)
 *   - IG: total plays, reach, engagement rate, save rate, share rate (7d), top reel, format ranking
 *   - Revenue: TP clicks, conversions, revenue (30d), balance
 *   - Content: articles published this week, refreshed, reels generated
 *   - Alerts: any triggered alerts from health-report.json
 *
 * Computes:
 *   - North Star RPS = revenue / sessions * 1000
 *   - Week-over-week deltas for all key metrics
 *   - Top performing format (from performance-weights.json)
 *
 * Output: intelligence/data/reports/weekly-{YYYY-MM-DD}.md
 *
 * CLI: node intelligence/weekly-report.js
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORTS_DIR = join(__dirname, 'data', 'reports');
const SOCIAL_DATA_DIR = join(ROOT, 'social-distributor', 'data');

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[CEO-REPORT] ${msg}`);
}

function logError(msg) {
  console.error(`[CEO-REPORT] ERROR: ${msg}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysAgoStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function mondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function sundayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function formatDelta(current, previous) {
  if (!previous || previous === 0) return current > 0 ? '+100%' : '0%';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function formatNumber(n) {
  if (n === null || n === undefined) return 'N/A';
  if (typeof n !== 'number') return String(n);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

function safeJsonRead(path) {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }
  } catch (err) {
    logError(`Failed to read ${path}: ${err.message}`);
  }
  return null;
}

// ── Data Fetchers (graceful — each returns null on failure) ────────────────

async function fetchGA4Data() {
  try {
    const { fetchSiteSummary, fetchTopArticles } = await import(
      join(ROOT, 'social-distributor', 'analytics', 'ga4-fetcher.js')
    );

    const [summary7d, summary30d, summary14d, topArticles] = await Promise.all([
      fetchSiteSummary(7).catch(() => null),
      fetchSiteSummary(30).catch(() => null),
      fetchSiteSummary(14).catch(() => null),   // for WoW: compare first 7d vs second 7d
      fetchTopArticles(7, 10).catch(() => []),
    ]);

    // WoW delta: compare this week (7d) vs implicit previous week from 14d-7d span
    // Approximation: previous week = summary14d - summary7d
    let previousWeek = null;
    if (summary14d && summary7d) {
      previousWeek = {
        totalPageviews: Math.max(0, summary14d.totalPageviews - summary7d.totalPageviews),
        totalSessions: Math.max(0, summary14d.totalSessions - summary7d.totalSessions),
        totalUsers: Math.max(0, summary14d.totalUsers - summary7d.totalUsers),
        avgSessionDuration: summary14d.avgSessionDuration, // rough
      };
    }

    return { summary7d, summary30d, previousWeek, topArticles };
  } catch (err) {
    logError(`GA4 fetch failed: ${err.message}`);
    return null;
  }
}

async function fetchGSCData() {
  try {
    const { fetchTopQueries, findLowHangingFruit } = await import(
      join(ROOT, 'social-distributor', 'analytics', 'search-console-fetcher.js')
    );

    const [queries, fruit] = await Promise.all([
      fetchTopQueries(7, 200).catch(() => []),
      findLowHangingFruit(28, { minPosition: 5, maxPosition: 20, minImpressions: 30 }).catch(() => []),
    ]);

    // Aggregate GSC summary
    const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0);
    const totalClicks = queries.reduce((s, q) => s + q.clicks, 0);
    const avgPosition = queries.length > 0
      ? queries.reduce((s, q) => s + q.position * q.impressions, 0) / totalImpressions
      : 0;
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    return {
      totalImpressions,
      totalClicks,
      avgPosition: Math.round(avgPosition * 10) / 10,
      avgCTR: Math.round(avgCTR * 100) / 100,
      queryCount: queries.length,
      topQuickWins: fruit.slice(0, 3),
    };
  } catch (err) {
    logError(`GSC fetch failed: ${err.message}`);
    return null;
  }
}

async function fetchIGData() {
  try {
    const { fetchRecentReelStats } = await import(
      join(ROOT, 'social-distributor', 'analytics', 'ig-stats-fetcher.js')
    );
    const { scoreReel, engagementRate } = await import(
      join(ROOT, 'social-distributor', 'analytics', 'performance-scorer.js')
    );

    const reels = await fetchRecentReelStats(7).catch(() => []);

    if (reels.length === 0) {
      return { totalPlays: 0, totalReach: 0, avgEngagementRate: 0, avgSaveRate: 0, avgShareRate: 0, reelCount: 0, topReel: null, formatRanking: [] };
    }

    const validReels = reels.filter(r => r.stats);
    const totalPlays = validReels.reduce((s, r) => s + (r.stats.plays || 0), 0);
    const totalReach = validReels.reduce((s, r) => s + (r.stats.reach || 0), 0);
    const totalSaves = validReels.reduce((s, r) => s + (r.stats.saved || 0), 0);
    const totalShares = validReels.reduce((s, r) => s + (r.stats.shares || 0), 0);
    const totalLikes = validReels.reduce((s, r) => s + (r.stats.likes || 0), 0);
    const totalComments = validReels.reduce((s, r) => s + (r.stats.comments || 0), 0);

    const totalInteractions = totalLikes + totalComments + totalSaves + totalShares;
    const avgEngagementRate = totalReach > 0
      ? Math.round((totalInteractions / totalReach) * 10000) / 100
      : 0;
    const avgSaveRate = totalReach > 0
      ? Math.round((totalSaves / totalReach) * 10000) / 100
      : 0;
    const avgShareRate = totalReach > 0
      ? Math.round((totalShares / totalReach) * 10000) / 100
      : 0;

    // Top reel by score
    const scoredReels = validReels.map(r => ({
      ...r,
      score: scoreReel(r.stats),
    })).sort((a, b) => b.score - a.score);

    const topReel = scoredReels[0] || null;

    // Format ranking
    const byFormat = {};
    for (const r of scoredReels) {
      const fmt = r.format || 'unknown';
      if (!byFormat[fmt]) byFormat[fmt] = { scores: [], plays: 0 };
      byFormat[fmt].scores.push(r.score);
      byFormat[fmt].plays += r.stats.plays || 0;
    }

    const formatRanking = Object.entries(byFormat)
      .map(([format, data]) => ({
        format,
        avgScore: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
        count: data.scores.length,
        totalPlays: data.plays,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    return {
      totalPlays,
      totalReach,
      avgEngagementRate,
      avgSaveRate,
      avgShareRate,
      reelCount: validReels.length,
      topReel: topReel ? {
        reelId: topReel.reelId,
        format: topReel.format,
        score: topReel.score,
        plays: topReel.stats.plays,
        caption: (topReel.stats.caption || '').slice(0, 80),
      } : null,
      formatRanking,
    };
  } catch (err) {
    logError(`IG fetch failed: ${err.message}`);
    return null;
  }
}

async function fetchRevenueData() {
  try {
    const { fetchSales, fetchBalance } = await import(
      join(ROOT, 'social-distributor', 'analytics', 'revenue-tracker.js')
    );

    const [sales30d, balance] = await Promise.all([
      fetchSales(30).catch(() => []),
      fetchBalance().catch(() => null),
    ]);

    const totalClicks = sales30d.filter(s => s.type === 'click' || s.clicks).length;
    const totalConversions = sales30d.filter(s => s.type === 'sale' || s.type === 'conversion' || s.commission).length;
    const totalRevenue = sales30d.reduce((s, sale) => {
      return s + (sale.commission || sale.revenue || sale.amount || 0);
    }, 0);

    return {
      clicks30d: totalClicks,
      conversions30d: totalConversions,
      revenue30d: Math.round(totalRevenue * 100) / 100,
      balance: balance?.balance ?? balance?.amount ?? 0,
      currency: balance?.currency ?? 'EUR',
      salesCount: sales30d.length,
    };
  } catch (err) {
    logError(`Revenue fetch failed: ${err.message}`);
    return null;
  }
}

async function fetchContentStats() {
  try {
    // Count articles published this week from WP REST API
    const weekStart = mondayOfWeek();
    const url = `https://flashvoyage.com/wp-json/wp/v2/posts?after=${weekStart}T00:00:00Z&per_page=100&_fields=id,title,slug,date,modified&status=publish`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`WP API returned ${res.status}`);

    const posts = await res.json();

    // Separate new from refreshed: compare date vs modified
    const newArticles = [];
    const refreshed = [];
    for (const post of posts) {
      const created = new Date(post.date);
      const modified = new Date(post.modified);
      // If modified > created + 1 day, it's a refresh
      if ((modified - created) > 86400000) {
        refreshed.push({ id: post.id, title: post.title?.rendered || post.slug, slug: post.slug });
      } else {
        newArticles.push({ id: post.id, title: post.title?.rendered || post.slug, slug: post.slug });
      }
    }

    // Count reels from reel-history.jsonl
    let reelsGenerated = 0;
    const reelHistoryPath = join(ROOT, 'social-distributor', 'data', 'reel-history.jsonl');
    if (existsSync(reelHistoryPath)) {
      const lines = readFileSync(reelHistoryPath, 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.date && entry.date >= weekStart) reelsGenerated++;
        } catch { /* skip malformed */ }
      }
    }

    return {
      newArticles,
      refreshedArticles: refreshed,
      reelsGenerated,
    };
  } catch (err) {
    logError(`Content stats fetch failed: ${err.message}`);
    return { newArticles: [], refreshedArticles: [], reelsGenerated: 0 };
  }
}

function loadAlerts() {
  const healthPath = join(SOCIAL_DATA_DIR, 'health-report.json');
  const report = safeJsonRead(healthPath);
  if (!report) return [];

  const alerts = [];
  if (report.alerts && Array.isArray(report.alerts)) {
    alerts.push(...report.alerts);
  }
  // Also check for any critical fields
  if (report.status === 'critical' || report.status === 'warning') {
    alerts.push({ level: report.status, message: report.message || `System health: ${report.status}` });
  }
  return alerts;
}

function loadPerformanceWeights() {
  const weightsPath = join(ROOT, 'social-distributor', 'reels', 'data', 'performance-weights.json');
  return safeJsonRead(weightsPath);
}

// ── Report Builder ─────────────────────────────────────────────────────────

function buildReportMarkdown(data) {
  const {
    ga4,
    gsc,
    ig,
    revenue,
    content,
    alerts,
    weights,
    weekStart,
    weekEnd,
  } = data;

  // ── North Star: RPS ──
  const sessions7d = ga4?.summary7d?.totalSessions || 0;
  const revenue30d = revenue?.revenue30d || 0;
  // Approximate weekly revenue = 30d revenue / 4.3
  const weeklyRevenue = revenue30d / 4.3;
  const rps = sessions7d > 0 ? (weeklyRevenue / sessions7d) * 1000 : 0;

  // WoW deltas
  const prevSessions = ga4?.previousWeek?.totalSessions || 0;
  const sessionsDelta = formatDelta(sessions7d, prevSessions);
  const prevPageviews = ga4?.previousWeek?.totalPageviews || 0;
  const pageviewsDelta = formatDelta(ga4?.summary7d?.totalPageviews || 0, prevPageviews);

  // Top performing format from weights (merged IG + TikTok)
  const topFormat = weights?.formatScores
    ? Object.entries(weights.formatScores)
        .sort(([, a], [, b]) => b - a)
        .filter(([, score]) => score > 0)[0]
    : null;

  // Platform-specific tops (debug side fields from performance-scorer v2 with TikTok merge).
  // Absent on older weights files → harmless, they fall through to null.
  const topFormatIG = weights?.igFormatScores
    ? Object.entries(weights.igFormatScores)
        .sort(([, a], [, b]) => b - a)
        .filter(([, score]) => score > 0)[0]
    : null;
  const topFormatTikTok = weights?.tiktokFormatScores
    ? Object.entries(weights.tiktokFormatScores)
        .sort(([, a], [, b]) => b - a)
        .filter(([, score]) => score > 0)[0]
    : null;
  const formatDiscrepancy = topFormatIG && topFormatTikTok && topFormatIG[0] !== topFormatTikTok[0];

  // ── Build Markdown ──
  const lines = [];

  lines.push(`# FLASHVOYAGE -- RAPPORT HEBDOMADAIRE`);
  lines.push(`## Semaine du ${weekStart} au ${weekEnd}`);
  lines.push(`> Genere le ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`);
  lines.push('');

  // ── NORTH STAR ──
  lines.push(`### NORTH STAR: RPS = ${rps.toFixed(2)} EUR`);
  lines.push(`> Revenue Per 1000 Sessions (semaine) = revenus estimes ${weeklyRevenue.toFixed(2)} EUR / ${formatNumber(sessions7d)} sessions`);
  lines.push('');

  // ── RESUME ──
  lines.push(`### RESUME`);
  const summaryBullets = [];

  if (ga4?.summary7d) {
    summaryBullets.push(`**Trafic**: ${formatNumber(ga4.summary7d.totalPageviews)} pages vues (${pageviewsDelta} WoW), ${formatNumber(sessions7d)} sessions (${sessionsDelta} WoW)`);
  }
  if (ig) {
    summaryBullets.push(`**Social**: ${ig.reelCount} reels publies, ${formatNumber(ig.totalPlays)} vues totales, ER moyen ${ig.avgEngagementRate}%`);
  }
  if (revenue) {
    summaryBullets.push(`**Revenus**: ${revenue.revenue30d.toFixed(2)} EUR (30j), solde ${revenue.balance} ${revenue.currency}`);
  }

  if (summaryBullets.length === 0) {
    summaryBullets.push('Aucune donnee disponible cette semaine. Verifier les connexions API.');
  }

  for (const bullet of summaryBullets) {
    lines.push(`- ${bullet}`);
  }
  lines.push('');

  // ── TRAFIC ──
  lines.push(`### TRAFIC`);
  if (ga4?.summary7d) {
    const s = ga4.summary7d;
    lines.push(`| Metrique | 7 jours | 30 jours | WoW |`);
    lines.push(`|----------|---------|----------|-----|`);
    lines.push(`| Sessions | ${formatNumber(s.totalSessions)} | ${formatNumber(ga4.summary30d?.totalSessions)} | ${sessionsDelta} |`);
    lines.push(`| Pages vues | ${formatNumber(s.totalPageviews)} | ${formatNumber(ga4.summary30d?.totalPageviews)} | ${pageviewsDelta} |`);
    lines.push(`| Utilisateurs | ${formatNumber(s.totalUsers)} | ${formatNumber(ga4.summary30d?.totalUsers)} | ${formatDelta(s.totalUsers, ga4.previousWeek?.totalUsers || 0)} |`);
    lines.push(`| Duree moy. session | ${formatDuration(s.avgSessionDuration)} | ${formatDuration(ga4.summary30d?.avgSessionDuration)} | - |`);
    lines.push('');

    // Top 5 articles
    if (ga4.topArticles && ga4.topArticles.length > 0) {
      lines.push(`**Top 5 articles (7j):**`);
      for (const [i, article] of ga4.topArticles.slice(0, 5).entries()) {
        lines.push(`${i + 1}. \`${article.pagePath}\` — ${formatNumber(article.pageviews)} PV, ${formatDuration(article.avgSessionDuration)} duree moy.`);
      }
      lines.push('');
    }
  } else {
    lines.push('*Donnees GA4 indisponibles.*');
    lines.push('');
  }

  // ── SEO ──
  lines.push(`### SEO`);
  if (gsc) {
    lines.push(`| Metrique | Valeur (7j) |`);
    lines.push(`|----------|-------------|`);
    lines.push(`| Impressions | ${formatNumber(gsc.totalImpressions)} |`);
    lines.push(`| Clics | ${formatNumber(gsc.totalClicks)} |`);
    lines.push(`| Position moyenne | ${gsc.avgPosition} |`);
    lines.push(`| CTR moyen | ${gsc.avgCTR}% |`);
    lines.push(`| Requetes uniques | ${gsc.queryCount} |`);
    lines.push('');

    if (gsc.topQuickWins.length > 0) {
      lines.push(`**Top 3 Quick Wins (pos 5-20, fort potentiel):**`);
      for (const [i, win] of gsc.topQuickWins.entries()) {
        lines.push(`${i + 1}. **"${win.query}"** — pos ${win.position}, ${formatNumber(win.impressions)} impressions, CTR ${win.ctr}% → Action: ${win.action}`);
      }
      lines.push('');
    }
  } else {
    lines.push('*Donnees GSC indisponibles.*');
    lines.push('');
  }

  // ── SOCIAL ──
  lines.push(`### SOCIAL`);
  if (ig && ig.reelCount > 0) {
    lines.push(`| Metrique | Valeur (7j) |`);
    lines.push(`|----------|-------------|`);
    lines.push(`| Reels publies | ${ig.reelCount} |`);
    lines.push(`| Vues totales | ${formatNumber(ig.totalPlays)} |`);
    lines.push(`| Portee totale | ${formatNumber(ig.totalReach)} |`);
    lines.push(`| Taux d'engagement | ${ig.avgEngagementRate}% |`);
    lines.push(`| Taux de sauvegarde | ${ig.avgSaveRate}% |`);
    lines.push(`| Taux de partage | ${ig.avgShareRate}% |`);
    lines.push('');

    if (ig.topReel) {
      lines.push(`**Meilleur reel:** ${ig.topReel.format} (score ${ig.topReel.score}) — ${formatNumber(ig.topReel.plays)} vues`);
      if (ig.topReel.caption) {
        lines.push(`> ${ig.topReel.caption}...`);
      }
      lines.push('');
    }

    if (ig.formatRanking.length > 0) {
      lines.push(`**Classement formats:**`);
      for (const [i, fmt] of ig.formatRanking.entries()) {
        const medal = i === 0 ? '(1er)' : i === 1 ? '(2e)' : i === 2 ? '(3e)' : '';
        lines.push(`${i + 1}. **${fmt.format}** ${medal} — score moy. ${fmt.avgScore}, ${fmt.count} reels, ${formatNumber(fmt.totalPlays)} vues`);
      }
      lines.push('');
    }

    // Cross-platform top-format comparison (IG vs TikTok vs merged)
    if (topFormat || topFormatIG || topFormatTikTok) {
      lines.push(`**Top format par plateforme:**`);
      if (topFormat) {
        lines.push(`- Global (merged): **${topFormat[0]}** (score ${topFormat[1]})`);
      }
      if (topFormatIG) {
        lines.push(`- IG seul: **${topFormatIG[0]}** (score ${topFormatIG[1]})`);
      }
      if (topFormatTikTok) {
        lines.push(`- TikTok seul: **${topFormatTikTok[0]}** (score ${topFormatTikTok[1]})`);
      }
      if (formatDiscrepancy) {
        lines.push(`- 🚨 Divergence IG / TikTok — les deux plateformes favorisent des formats différents, à arbitrer.`);
      }
      lines.push('');
    }
  } else {
    lines.push('*Aucun reel publie cette semaine.*');
    lines.push('');
  }

  // ── REVENUS ──
  lines.push(`### REVENUS`);
  if (revenue) {
    lines.push(`| Metrique | Valeur |`);
    lines.push(`|----------|--------|`);
    lines.push(`| Clics affilies (30j) | ${formatNumber(revenue.clicks30d)} |`);
    lines.push(`| Conversions (30j) | ${formatNumber(revenue.conversions30d)} |`);
    lines.push(`| Revenus (30j) | ${revenue.revenue30d.toFixed(2)} ${revenue.currency} |`);
    lines.push(`| Solde Travelpayouts | ${revenue.balance} ${revenue.currency} |`);
    lines.push('');
  } else {
    lines.push('*Donnees revenus indisponibles.*');
    lines.push('');
  }

  // ── CONTENU ──
  lines.push(`### CONTENU`);
  if (content) {
    lines.push(`| Type | Nombre |`);
    lines.push(`|------|--------|`);
    lines.push(`| Nouveaux articles | ${content.newArticles.length} |`);
    lines.push(`| Articles rafraichis | ${content.refreshedArticles.length} |`);
    lines.push(`| Reels generes | ${content.reelsGenerated} |`);
    lines.push('');

    if (content.newArticles.length > 0) {
      lines.push(`**Nouveaux articles:**`);
      for (const a of content.newArticles) {
        lines.push(`- ${a.title} (\`/${a.slug}/\`)`);
      }
      lines.push('');
    }
  }

  // ── ALERTES ──
  lines.push(`### ALERTES`);
  if (alerts.length > 0) {
    for (const alert of alerts) {
      const icon = alert.level === 'critical' ? '[CRITIQUE]' : alert.level === 'warning' ? '[ATTENTION]' : '[INFO]';
      lines.push(`- ${icon} ${alert.message}`);
    }
  } else {
    lines.push('Aucune alerte cette semaine.');
  }
  lines.push('');

  // ── PLAN SEMAINE PROCHAINE ──
  lines.push(`### PLAN SEMAINE PROCHAINE`);

  const plan = [];

  // SEO quick wins
  if (gsc?.topQuickWins?.length > 0) {
    plan.push(`- **SEO**: Optimiser les titres/meta pour "${gsc.topQuickWins[0].query}" (pos ${gsc.topQuickWins[0].position})`);
  }

  // Best format to double down on (merged score — IG + TikTok weighted)
  if (topFormat) {
    plan.push(`- **Social**: Augmenter la cadence du format "${topFormat[0]}" (score merged IG+TikTok: ${topFormat[1]})`);
  } else if (ig?.formatRanking?.length > 0) {
    plan.push(`- **Social**: Augmenter la cadence du format "${ig.formatRanking[0].format}" (meilleur score: ${ig.formatRanking[0].avgScore})`);
  }
  if (formatDiscrepancy) {
    plan.push(`- **Social**: IG préfère "${topFormatIG[0]}" mais TikTok préfère "${topFormatTikTok[0]}" — arbitrer par plateforme ou tester les deux en cross-post.`);
  }

  // Content gaps
  if (content?.newArticles?.length === 0) {
    plan.push(`- **Contenu**: Publier au moins 3 articles cette semaine (0 la semaine passee)`);
  }

  // Revenue
  if (revenue && revenue.revenue30d < 10) {
    plan.push(`- **Revenus**: Ajouter des widgets Travelpayouts aux 5 articles les plus vus`);
  }

  // Default fallback
  if (plan.length === 0) {
    plan.push(`- Continuer la cadence actuelle`);
    plan.push(`- Analyser les donnees audience (segments) pour affiner le calendrier`);
  }

  for (const p of plan) {
    lines.push(p);
  }
  lines.push('');

  // ── Footer ──
  lines.push('---');
  lines.push(`*Rapport genere automatiquement par FlashVoyage Intelligence Engine.*`);
  lines.push(`*Sources: GA4, GSC, IG Graph API, Travelpayouts, WP REST API*`);

  return lines.join('\n');
}

// ── Main Execution ─────────────────────────────────────────────────────────

async function generateWeeklyReport() {
  log('='.repeat(60));
  log('FLASHVOYAGE — Weekly CEO Report Generator');
  log('='.repeat(60));

  const startTime = Date.now();
  const weekStart = mondayOfWeek();
  const weekEnd = sundayOfWeek();

  log(`Generating report for week ${weekStart} to ${weekEnd}`);

  // ── Fetch all data in parallel ──
  log('Phase 1: Fetching all data sources...');

  const [ga4, gsc, ig, revenue, content] = await Promise.all([
    fetchGA4Data(),
    fetchGSCData(),
    fetchIGData(),
    fetchRevenueData(),
    fetchContentStats(),
  ]);

  const alerts = loadAlerts();
  const weights = loadPerformanceWeights();

  log(`Phase 1 complete. GA4: ${ga4 ? 'OK' : 'FAIL'}, GSC: ${gsc ? 'OK' : 'FAIL'}, IG: ${ig ? 'OK' : 'FAIL'}, Revenue: ${revenue ? 'OK' : 'FAIL'}`);

  // ── Build report ──
  log('Phase 2: Building report...');

  const report = buildReportMarkdown({
    ga4,
    gsc,
    ig,
    revenue,
    content,
    alerts,
    weights,
    weekStart,
    weekEnd,
  });

  // ── Write report ──
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const reportPath = join(REPORTS_DIR, `weekly-${today()}.md`);
  writeFileSync(reportPath, report, 'utf-8');
  log(`Report written to: ${reportPath}`);

  // ── Console summary ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('RESUME CEO — FlashVoyage');
  console.log('='.repeat(60));

  const sessions = ga4?.summary7d?.totalSessions || 0;
  const weeklyRev = (revenue?.revenue30d || 0) / 4.3;
  const rps = sessions > 0 ? (weeklyRev / sessions) * 1000 : 0;

  console.log(`  North Star RPS: ${rps.toFixed(2)} EUR`);
  console.log(`  Sessions 7j:    ${formatNumber(sessions)}`);
  console.log(`  Pages vues 7j:  ${formatNumber(ga4?.summary7d?.totalPageviews || 0)}`);
  console.log(`  Reels 7j:       ${ig?.reelCount || 0} (${formatNumber(ig?.totalPlays || 0)} vues)`);
  console.log(`  Revenue 30j:    ${(revenue?.revenue30d || 0).toFixed(2)} EUR`);
  console.log(`  Alertes:        ${alerts.length}`);
  console.log(`  Temps:          ${elapsed}s`);
  console.log('='.repeat(60));
  console.log(`  Rapport complet: ${reportPath}`);
  console.log('='.repeat(60) + '\n');

  return { reportPath, report };
}

// ── CLI entry ──────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('weekly-report')) {
  generateWeeklyReport().catch(err => {
    logError(`FATAL: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}

export { generateWeeklyReport };
