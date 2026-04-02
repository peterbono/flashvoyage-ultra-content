#!/usr/bin/env node
/**
 * Quora FR Daily Post — FlashVoyage Link-Building
 * Posts 1 answer/day on Quora FR to relevant travel questions.
 * Run daily via GitHub Actions cron.
 *
 * Environment variables:
 *   QUORA_EMAIL    — Quora account email (Gmail)
 *   QUORA_PASSWORD — Quora account password
 */
import { chromium as playwrightChromium } from 'playwright';
import playwright from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const chromium = playwright.chromium || playwrightChromium;
try { chromium.use(StealthPlugin()); } catch { /* stealth not available, continue without */ }
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLAN_PATH = path.join(REPO_ROOT, 'data/linkbuilding-week-plan.json');
const CONTENT_PATH = path.join(REPO_ROOT, 'data/linkbuilding-content-ready.json');
const LOG_PATH = path.join(REPO_ROOT, 'data/linkbuilding-log.jsonl');

const QUORA_EMAIL = process.env.QUORA_EMAIL || '';
const QUORA_PASSWORD = process.env.QUORA_PASSWORD || '';
const DRY_RUN = process.argv.includes('--dry-run');

function log(entry) {
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}

async function loginQuora(page) {
  console.log('[QUORA] Navigating to login...');
  await page.goto('https://fr.quora.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check if already logged in
  const profileBtn = await page.$('[class*="profile"], [aria-label*="Profil"], a[href*="/profile/"]');
  if (profileBtn) {
    console.log('[QUORA] Already logged in');
    return true;
  }

  // Click email login
  console.log('[QUORA] Logging in with email...');
  const emailBtn = await page.$('text=E-mail') || await page.$('text=Adresse e-mail');
  if (emailBtn) await emailBtn.click();
  await page.waitForTimeout(1000);

  await page.fill('input[name="email"], input[type="email"]', QUORA_EMAIL);
  await page.fill('input[name="password"], input[type="password"]', QUORA_PASSWORD);
  await page.waitForTimeout(500);

  // Submit
  const loginBtn = await page.$('button:has-text("Connexion")') || await page.$('button[type="submit"]');
  if (loginBtn) await loginBtn.click();
  await page.waitForTimeout(5000);

  // Verify login
  const url = page.url();
  const isLoggedIn = !url.includes('login') && !url.includes('auth');
  console.log(`[QUORA] Login ${isLoggedIn ? 'OK' : 'FAILED'} (url: ${url})`);
  return isLoggedIn;
}

async function searchAndAnswer(page, searchQuery, answerContent) {
  // Search for the question
  console.log(`[QUORA] Searching: "${searchQuery}"`);
  await page.goto(`https://fr.quora.com/search?q=${encodeURIComponent(searchQuery)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Find first question link in results
  const questionLink = await page.$('a[href*="/unanswered/"], a[class*="question_link"], .q-text a');
  if (!questionLink) {
    // Try clicking first result that looks like a question
    const links = await page.$$('a');
    for (const link of links) {
      const text = await link.textContent().catch(() => '');
      const href = await link.getAttribute('href').catch(() => '');
      if (text.length > 20 && href && !href.includes('/search') && !href.includes('/topic/')) {
        console.log(`[QUORA] Found question: "${text.slice(0, 60)}"`);
        await link.click();
        await page.waitForTimeout(3000);
        break;
      }
    }
  } else {
    await questionLink.click();
    await page.waitForTimeout(3000);
  }

  // Click "Répondre" button
  console.log('[QUORA] Looking for answer button...');
  const answerBtn = await page.$('button:has-text("Répondre")') ||
    await page.$('button:has-text("Answer")') ||
    await page.$('[class*="answer_button"]');

  if (!answerBtn) {
    console.log('[QUORA] No answer button found');
    return false;
  }

  await answerBtn.click();
  await page.waitForTimeout(2000);

  // Find the contenteditable editor
  console.log('[QUORA] Filling answer...');
  const editor = await page.$('[contenteditable="true"].doc') ||
    await page.$('[contenteditable="true"]') ||
    await page.$('.ql-editor');

  if (!editor) {
    console.log('[QUORA] Editor not found');
    return false;
  }

  // Convert plain text to HTML paragraphs
  const htmlContent = answerContent
    .split('\n\n')
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  // Set content and trigger input event
  await page.evaluate(({ selector, html }) => {
    const el = document.querySelector(selector);
    if (el) {
      el.innerHTML = html;
      el.classList.remove('empty');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, {
    selector: '[contenteditable="true"].doc, [contenteditable="true"], .ql-editor',
    html: htmlContent,
  });

  await page.waitForTimeout(1000);

  // Click "Publier" / "Submit"
  console.log('[QUORA] Publishing...');
  const publishBtn = await page.$('button:has-text("Publier")') ||
    await page.$('button:has-text("Submit")') ||
    await page.$('button:has-text("Poster")');

  if (!publishBtn) {
    console.log('[QUORA] Publish button not found');
    return false;
  }

  await publishBtn.click();
  await page.waitForTimeout(5000);

  // Verify: URL should contain /answer/
  const finalUrl = page.url();
  const success = finalUrl.includes('/answer/') || finalUrl.includes('Florian-Gouloubi');
  console.log(`[QUORA] Publish ${success ? 'OK' : 'UNCERTAIN'} (url: ${finalUrl})`);
  return success;
}

async function main() {
  if (!DRY_RUN && (!QUORA_EMAIL || !QUORA_PASSWORD)) {
    console.error('[CRON] QUORA_EMAIL and QUORA_PASSWORD required');
    process.exit(1);
  }

  // Load content
  const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
  const quoraPosts = content.quora_fr;

  // Load plan
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!plan.status.quora_fr) {
    plan.status.quora_fr = { posted: 0, posts_done: [] };
  }

  // Find next unposted Quora answer
  const doneIds = plan.status.quora_fr.posts_done.map(p => p.id);
  const next = quoraPosts.find(p => p.status === 'ready' && !doneIds.includes(p.id));

  if (!next) {
    console.log('[CRON] No Quora posts remaining');
    process.exit(0);
  }

  console.log(`[CRON] Next Quora post: ${next.id} — search: "${next.search_query}"`);
  console.log(`  Has link: ${next.hasLink ? 'YES' : 'NO'}`);

  if (DRY_RUN) {
    console.log('[DRY RUN] Would post:', next.content.substring(0, 100) + '...');
    process.exit(0);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    if (!(await loginQuora(page))) {
      log({ date: new Date().toISOString(), platform: 'quora_fr', id: next.id, status: 'login_failed' });
      process.exit(1);
    }

    const success = await searchAndAnswer(page, next.search_query, next.content);

    log({
      date: new Date().toISOString(),
      platform: 'quora_fr',
      id: next.id,
      search: next.search_query,
      hasLink: next.hasLink,
      success,
    });

    if (success) {
      plan.status.quora_fr.posted++;
      plan.status.quora_fr.posts_done.push({
        date: new Date().toISOString(),
        id: next.id,
        search: next.search_query,
        hasLink: next.hasLink,
        status: 'published',
      });
      plan.total_posted = (plan.total_posted || 0) + 1;
      fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
      console.log('[CRON] Plan updated');
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('[CRON FATAL]', err.message);
  process.exit(1);
});
