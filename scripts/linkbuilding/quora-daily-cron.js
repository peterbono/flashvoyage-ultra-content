#!/usr/bin/env node
/**
 * Quora FR Daily Post — via Bright Data Scraping Browser
 * Runs on GitHub Actions with residential IP (bypasses Cloudflare).
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLAN_PATH = path.join(REPO_ROOT, 'data/linkbuilding-week-plan.json');
const CONTENT_PATH = path.join(REPO_ROOT, 'data/linkbuilding-content-ready.json');
const LOG_PATH = path.join(REPO_ROOT, 'data/linkbuilding-log.jsonl');

const SBR_AUTH = process.env.BRIGHTDATA_SBR_AUTH || '';
const QUORA_SESSION = process.env.QUORA_SESSION || ''; // m-b cookie
const DRY_RUN = process.argv.includes('--dry-run');

function log(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }

async function main() {
  if (!SBR_AUTH) { console.error('[QUORA] BRIGHTDATA_SBR_AUTH required'); process.exit(1); }
  if (!QUORA_SESSION) { console.error('[QUORA] QUORA_SESSION (m-b cookie) required'); process.exit(1); }

  const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!plan.status.quora_fr) plan.status.quora_fr = { posted: 0, posts_done: [] };

  const doneIds = plan.status.quora_fr.posts_done.map(p => p.id);
  const next = content.quora_fr.find(p => p.status === 'ready' && !doneIds.includes(p.id));
  if (!next) { console.log('[QUORA] No posts remaining'); return; }

  console.log(`[QUORA] Posting: ${next.id} — "${next.search_query}"`);
  if (DRY_RUN) { console.log('[DRY RUN]', next.content.slice(0, 100)); return; }

  // Connect to Bright Data Scraping Browser (residential IP, auto CF bypass)
  console.log('[QUORA] Connecting to Bright Data Scraping Browser...');
  const browser = await chromium.connectOverCDP(`wss://${SBR_AUTH}@brd.superproxy.io:9222`);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  try {
    // 1. Navigate first, then inject session cookie via JS
    console.log('[QUORA] Navigating to Quora...');
    await page.goto('https://fr.quora.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    console.log('[QUORA] Injecting session cookie via JS...');
    await page.evaluate((session) => {
      document.cookie = `m-b=${session}; domain=.quora.com; path=/; secure; max-age=31536000`;
      document.cookie = `m-b_lax=${session}; domain=.quora.com; path=/; secure; samesite=lax; max-age=31536000`;
    }, QUORA_SESSION);

    // Reload to apply cookie
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log(`[QUORA] Title: "${await page.title()}"`);

    // 2. Search for question
    console.log(`[QUORA] Searching: "${next.search_query}"`);
    await page.goto(`https://fr.quora.com/search?q=${encodeURIComponent(next.search_query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log(`[QUORA] Search page: "${await page.title()}"`);

    // 3. Find and navigate to a question
    const questionUrl = await page.evaluate(() => {
      const skip = ['condition','confidentialit','cookie','aide','about','press','career','contact'];
      const links = document.querySelectorAll('a');
      for (const a of links) {
        const t = a.textContent.trim();
        const h = a.href || '';
        if (t.length < 25 || t.length > 200) continue;
        if (!h.startsWith('http')) continue;
        if (['/search','/topic/','/profile/','/about','/terms','/privacy'].some(s => h.includes(s))) continue;
        if (skip.some(w => t.toLowerCase().includes(w))) continue;
        return { url: h, title: t.substring(0, 80) };
      }
      return null;
    });

    if (!questionUrl) { console.log('[QUORA] No question found'); return; }
    console.log(`[QUORA] Question: "${questionUrl.title}"`);

    await page.goto(questionUrl.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // 4. Click Répondre (use 'pondre' to avoid encoding issues with é)
    const clicked = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.includes('pondre')) { b.click(); return true; }
      }
      return false;
    });
    if (!clicked) { console.log('[QUORA] No answer button'); return; }
    console.log('[QUORA] Answer editor opened');
    await page.waitForTimeout(3000);

    // 5. Fill editor
    const htmlContent = next.content.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    await page.evaluate((html) => {
      const el = document.querySelector('[contenteditable="true"]');
      if (el) {
        el.innerHTML = html;
        el.classList.remove('empty');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, htmlContent);
    await page.waitForTimeout(1500);

    // 6. Publish (use 'ublier' to avoid encoding issues)
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.includes('ublier') || b.textContent.includes('ubmit')) { b.click(); return; }
      }
    });
    await page.waitForTimeout(6000);

    const finalUrl = page.url();
    const success = finalUrl.includes('/answer/') || finalUrl.includes('Florian');
    console.log(`[QUORA] ${success ? 'SUCCESS' : 'UNCERTAIN'} — ${finalUrl}`);

    log({ date: new Date().toISOString(), platform: 'quora_fr', id: next.id, search: next.search_query, hasLink: next.hasLink, success });

    if (success) {
      plan.status.quora_fr.posted++;
      plan.status.quora_fr.posts_done.push({ date: new Date().toISOString(), id: next.id, search: next.search_query, hasLink: next.hasLink, status: 'published' });
      plan.total_posted = (plan.total_posted || 0) + 1;
      fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
    }
  } finally {
    await page.close().catch(() => {});
    try { browser.disconnect(); } catch { await browser.close().catch(() => {}); }
  }
}

main().catch(err => { console.error('[QUORA FATAL]', err.message); process.exit(1); });
