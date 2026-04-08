#!/usr/bin/env node

/**
 * TikTok Telegram Batch — FlashVoyage Reels
 *
 * Runs daily at 06:00 UTC (13h BKK) via GitHub Actions.
 * Fetches reels published in the last 12 hours from the IG Graph API,
 * downloads each video, and sends them to Telegram with TikTok-ready
 * captions (CTA + hashtags) for manual TikTok reposting.
 *
 * Usage:
 *   node social-distributor/reels/tiktok-telegram-batch.js
 *
 * Env:
 *   FB_PAGE_TOKEN       — IG/FB page access token
 *   TELEGRAM_BOT_TOKEN  — Telegram bot token
 *   TELEGRAM_CHAT_ID    — Target Telegram chat
 */

const IG_ID = '17841442283434789';
const GRAPH_API = 'https://graph.facebook.com/v21.0';

// TikTok hashtags by format (detected from caption keywords)
const TIKTOK_HASHTAGS = {
  pick:        '#voyage #travel #spots #asiedusudest #pourtoi #fyp #flashvoyage',
  budget:      '#voyage #budget #budgetvoyage #coutdevie #pourtoi #fyp #flashvoyage',
  avantapres:  '#voyage #expectationvsreality #avantapres #travel #pourtoi #fyp #flashvoyage',
  'cost-vs':   '#voyage #coutdevie #expatlife #comparatif #pourtoi #fyp #flashvoyage',
  leaderboard: '#voyage #top10 #classement #travel #pourtoi #fyp #flashvoyage',
  humor:       '#voyage #humour #relatable #travel #pourtoi #fyp #flashvoyage',
  'best-time': '#voyage #quandpartir #travel #saison #pourtoi #fyp #flashvoyage',
  month:       '#voyage #oupartir #travel #destination #pourtoi #fyp #flashvoyage',
  _default:    '#voyage #travel #asiedusudest #pourtoi #fyp #flashvoyage',
};

// TikTok optimal posting times (BKK = UTC+7)
// Based on FR audience prime time analysis
const TIKTOK_SCHEDULE_BKK = [
  '13:30',  // = 08:30 Paris — morning commute scroll
  '18:00',  // = 13:00 Paris — lunch break peak
  '02:00',  // = 21:00 Paris — evening prime time (next day BKK)
];

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [TT-BATCH] ${msg}`);
}

/**
 * Detect reel format from IG caption keywords.
 */
function detectFormat(caption) {
  const c = (caption || '').toLowerCase();
  if (c.includes('spot') && (c.includes('rater') || c.includes('soirée'))) return 'pick';
  if (c.includes('budget') || c.includes('hébergement') || c.includes('daily budget')) return 'budget';
  if (c.includes('expectation') || c.includes('reality') || c.includes('avant') || c.includes('après')) return 'avantapres';
  if (c.includes('coût') || c.includes('vs france') || c.includes('cost')) return 'cost-vs';
  if (c.includes('top 10') || c.includes('classement') || c.includes('pays les moins')) return 'leaderboard';
  if (c.includes('quand partir') || c.includes('saison') || c.includes('en août')) return 'best-time';
  if (c.includes('ou partir') || c.includes('où partir')) return 'month';
  if (c.includes('quand tu') || c.includes('quand ton') || c.includes('conseil')) return 'humor';
  return '_default';
}

/**
 * Fetch recent reels from IG Graph API (last N hours).
 */
async function fetchRecentReels(token, hoursBack = 12) {
  const since = Math.floor((Date.now() - hoursBack * 3600 * 1000) / 1000);

  const url = `${GRAPH_API}/${IG_ID}/media?fields=id,media_url,caption,permalink,timestamp,media_type&limit=20&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.error) throw new Error(`IG API: ${data.error.message}`);

  const reels = (data.data || []).filter(m => {
    if (m.media_type !== 'VIDEO') return false;
    const ts = new Date(m.timestamp).getTime() / 1000;
    return ts >= since;
  });

  log(`Found ${reels.length} reels in the last ${hoursBack}h`);
  return reels;
}

/**
 * Download video from URL to Buffer.
 */
async function downloadVideo(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Send a single reel to Telegram with TikTok-ready caption.
 */
async function sendReelToTelegram(videoBuffer, reel, index, total) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const format = detectFormat(reel.caption);
  const hashtags = TIKTOK_HASHTAGS[format] || TIKTOK_HASHTAGS._default;
  const postTime = TIKTOK_SCHEDULE_BKK[index] || TIKTOK_SCHEDULE_BKK[0];

  // Strip IG hashtags — keep only the human text + CTA
  const captionLines = (reel.caption || 'Flash Voyage').split('\n');
  const textLines = [];
  for (const line of captionLines) {
    if (line.trim().startsWith('#')) break;
    textLines.push(line);
  }
  const cleanCaption = textLines.join('\n').trim();

  // Clean TikTok-ready text: caption + hashtags. Copy-paste as-is.
  const tgCaption = `⏰ ${postTime}\n\n${cleanCaption}\n\n${hashtags}`.slice(0, 1024);

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('video', new Blob([videoBuffer], { type: 'video/mp4' }), 'reel.mp4');
  form.append('caption', tgCaption);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, { method: 'POST', body: form });
  const data = await res.json();
  if (data.ok) log(`Sent reel ${index + 1}/${total} to Telegram (${format})`);
  else throw new Error(data.description || 'Telegram API error');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log('=== TikTok Telegram Batch ===');

  const token = process.env.FB_PAGE_TOKEN;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) { log('ERROR: FB_PAGE_TOKEN not set'); process.exit(1); }
  if (!botToken || !chatId) { log('ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set'); process.exit(1); }

  // Fetch reels from last N hours (default 14 to cover overnight crons with margin)
  const hoursBack = parseInt(process.env.HOURS_BACK, 10) || 14;
  const reels = await fetchRecentReels(token, hoursBack);

  if (reels.length === 0) {
    log('No reels to send. Done.');
    // Send a "nothing today" notification
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '📭 Aucun reel publié cette nuit — rien à poster sur TikTok aujourd\'hui.',
      }),
    });
    return;
  }

  // Send intro message
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `🎬 ${reels.length} reel(s) de la nuit — prêts pour TikTok !\n\nHoraires recommandés (BKK) :\n${TIKTOK_SCHEDULE_BKK.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`,
    }),
  });

  // Download and send each reel
  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    try {
      if (!reel.media_url) {
        log(`Reel ${i + 1}: no media_url, skipping`);
        continue;
      }
      log(`Downloading reel ${i + 1}/${reels.length}: ${reel.permalink || reel.id}`);
      const videoBuffer = await downloadVideo(reel.media_url);
      log(`Downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`);

      await sendReelToTelegram(videoBuffer, reel, i, reels.length);

      // Small delay between sends to avoid Telegram rate limit
      if (i < reels.length - 1) await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      log(`ERROR sending reel ${i + 1}: ${err.message}`);
    }
  }

  log(`Done — ${reels.length} reel(s) sent to Telegram.`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
