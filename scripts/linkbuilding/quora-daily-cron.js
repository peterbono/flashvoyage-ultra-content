#!/usr/bin/env node
/**
 * Quora FR Daily Post — Playwright + Bright Data Residential Proxy
 * Regular Playwright (no Scraping Browser) routed through residential IP.
 * No restrictions: password typing OK, cookies OK, no robots.txt block.
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

const PROXY_AUTH = process.env.BRIGHTDATA_RESIDENTIAL_AUTH || '';
const QUORA_EMAIL = process.env.QUORA_EMAIL || '';
const QUORA_PASSWORD = process.env.QUORA_PASSWORD || '';
const DRY_RUN = process.argv.includes('--dry-run');

function log(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }

async function main() {
  const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!plan.status.quora_fr) plan.status.quora_fr = { posted: 0, posts_done: [] };

  const doneIds = plan.status.quora_fr.posts_done.map(p => p.id);
  const next = content.quora_fr.find(p => p.status === 'ready' && !doneIds.includes(p.id));
  if (!next) { console.log('[QUORA] No posts remaining'); return; }

  console.log(`[QUORA] Posting: ${next.id} — "${next.search_query}"`);
  if (DRY_RUN) { console.log('[DRY RUN]', next.content.slice(0, 100)); return; }

  // Launch Playwright with residential proxy
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (PROXY_AUTH) {
    const [user, pass] = PROXY_AUTH.split(':');
    launchOptions.proxy = {
      server: 'http://brd.superproxy.io:22225',
      username: user,
      password: pass,
    };
    console.log('[QUORA] Using Bright Data residential proxy');
  } else {
    console.log('[QUORA] No proxy — using direct connection');
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // 1. Navigate to Quora
    console.log('[QUORA] Navigating...');
    await page.goto('https://fr.quora.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait for Cloudflare if needed
    for (let i = 0; i < 10; i++) {
      const title = await page.title();
      if (!title.includes('instant') && !title.includes('Cloudflare') && !title.includes('Vérification')) break;
      console.log(`[QUORA] CF... (${i + 1}/10)`);
      await page.waitForTimeout(5000);
    }
    console.log(`[QUORA] Title: "${await page.title()}"`);

    // 2. Login
    const needsLogin = await page.evaluate(() => !document.body.textContent.includes('Ajouter une question'));
    if (needsLogin && QUORA_EMAIL) {
      console.log('[QUORA] Logging in...');
      const emailBtn = await page.$('text=E-mail') || await page.$('text=Adresse e-mail');
      if (emailBtn) { await emailBtn.click(); await page.waitForTimeout(2000); }

      try {
        await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
        await page.fill('input[type="email"], input[name="email"]', QUORA_EMAIL);
        await page.waitForTimeout(500);
        await page.fill('input[type="password"]', QUORA_PASSWORD);
        await page.waitForTimeout(500);

        const btn = await page.$('button[type="submit"]') || await page.$('button:has-text("Connexion")');
        if (btn) await btn.click();
        await page.waitForTimeout(8000);
      } catch (e) {
        console.log(`[QUORA] Login issue: ${e.message.split('\n')[0]}`);
      }
      console.log(`[QUORA] After login: "${await page.title()}"`);
    }

    // 3. Search
    console.log(`[QUORA] Searching: "${next.search_query}"`);
    await page.goto(`https://fr.quora.com/search?q=${encodeURIComponent(next.search_query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // 4. Find question
    const questionUrl = await page.evaluate(() => {
      const skip = ['condition','confidentialit','cookie','aide','about','press','career','contact','publicité'];
      for (const a of document.querySelectorAll('a')) {
        const t = a.textContent.trim();
        const h = a.href || '';
        if (t.length < 25 || t.length > 200 || !h.startsWith('http')) continue;
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

    // 5. Click Répondre
    const clicked = await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent.includes('pondre')) { b.click(); return true; }
      }
      return false;
    });
    if (!clicked) { console.log('[QUORA] No answer button'); return; }
    console.log('[QUORA] Answer editor opened');
    await page.waitForTimeout(3000);

    // 6. Fill editor
    const htmlContent = next.content.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    await page.evaluate((html) => {
      const el = document.querySelector('[contenteditable="true"]');
      if (el) { el.innerHTML = html; el.classList.remove('empty'); el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, htmlContent);
    await page.waitForTimeout(1500);

    // 7. Publish
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
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
    await browser.close();
  }
}

main().catch(err => { console.error('[QUORA FATAL]', err.message); process.exit(1); });
