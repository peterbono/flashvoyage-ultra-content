#!/usr/bin/env node
/**
 * Voyage Forum Daily Post — FlashVoyage Link-Building
 * Run daily via GitHub Actions cron: posts 1 reply on a queued thread (1/24h limit for new accounts)
 *
 * Usage: node scripts/linkbuilding/vf-daily-cron.js [--dry-run]
 *
 * Environment variables:
 *   VF_PASSWORD — Voyage Forum password for FloAsie account (required unless --dry-run)
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to repo root (two levels up from scripts/linkbuilding/)
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLAN_PATH = path.join(REPO_ROOT, 'data/linkbuilding-week-plan.json');
const LOG_PATH = path.join(REPO_ROOT, 'data/linkbuilding-log.jsonl');

const ACCOUNT = {
  username: 'FloAsie',
  password: process.env.VF_PASSWORD || '',
};

const DRY_RUN = process.argv.includes('--dry-run');

// Pre-written content for each queued post (HTML format for WYSIWYG editor)
const CONTENT_MAP = {
  'thailande-tdac-comment-ca-marche-d10775002': `<b>Retour d'exp\u00e9rience sur le TDAC</b><br><br>Alors pour faire simple, en tant que fran\u00e7ais tu as droit \u00e0 60 jours sans visa depuis mars 2024 (c'\u00e9tait 30 avant). Du coup le TDAC c'est juste le formulaire d'arriv\u00e9e num\u00e9rique qui remplace l'ancien papier qu'on remplissait dans l'avion.<br><br>Concr\u00e8tement :<br>- Tu remplis le formulaire en ligne AVANT ton vol<br>- Tu re\u00e7ois un QR code<br>- A l'arriv\u00e9e tu montres ton QR code + passeport<br>- C'est gratuit<br><br>Le pi\u00e8ge c'est qu'il y a des sites qui facturent 10-15 euros pour remplir le formulaire "\u00e0 ta place". Ne tombe pas dans le panneau, c'est le site officiel qui est gratuit.<br><br>En vrai le processus prend genre 5 minutes si tu as ton passeport et ton billet sous la main. Et si tu oublies de le faire avant, il y a encore des bornes \u00e0 l'a\u00e9roport.<br><br>Bon apr\u00e8s, perso j'ai eu z\u00e9ro question \u00e0 l'immigration. Passeport fran\u00e7ais, sourire, tampon, 30 secondes chrono.`,

  'quelle-situation-ambiance-suite-guerre-moyen-orient-d11466122': `<b>Pas d'impact en Asie du Sud-Est</b><br><br>Pour avoir \u00e9t\u00e9 en Tha\u00eflande et au Vietnam r\u00e9cemment, honn\u00eatement z\u00e9ro impact sur le terrain. L'Asie du Sud-Est est tr\u00e8s loin g\u00e9ographiquement et politiquement de ce qui se passe au Moyen-Orient.<br><br>Ce qui peut changer :<br>- Les prix des vols : si la situation s'aggrave, certaines compagnies d\u00e9routent et \u00e7a rallonge les trajets. Mais en pratique, les prix ont pas boug\u00e9 significativement.<br>- L'assurance voyage : v\u00e9rifie que ta police couvre les situations de force majeure, mais c'est standard.<br><br>Sur place en Tha\u00eflande, Vietnam, Bali... la vie continue normalement. Les touristes sont l\u00e0, les locaux sont accueillants comme d'habitude.<br><br>Mon conseil : ne te laisse pas freiner par l'actualit\u00e9 mondiale pour un voyage en Asie du Sud-Est. C'est une des r\u00e9gions les plus safe au monde pour les voyageurs. Le risque principal en Tha\u00eflande c'est de trop manger et de repartir avec 3 kilos en plus, pas la g\u00e9opolitique.<br><br>Bref, pars tranquille.`,

  'demande-conseils-projet-itineraire-thailande-laos-cambodge-d10779659': `<b>Mon retour sur un trip Tha\u00eflande-Laos-Cambodge</b><br><br>Salut ! J'ai fait un circuit similaire, du coup je me permets de donner mon avis.<br><br><b>Tha\u00eflande (10j)</b> : Bangkok 2j + train de nuit vers Chiang Mai (super exp\u00e9rience, billet \u00e0 12 euros en couchette). Chiang Mai 4j (temples, cours de cuisine \u00e0 8 euros, trek d'une journ\u00e9e). Puis bus vers Chiang Rai 2j, et fronti\u00e8re Laos \u00e0 Huay Xai.<br><br><b>Laos (7j)</b> : La slow boat sur le M\u00e9kong jusqu'\u00e0 Luang Prabang, 2 jours de navigation, c'est inoubliable. Luang Prabang 3j. Ensuite Van vers Vang Vieng 2j.<br><br><b>Cambodge (7j)</b> : Siem Reap 3j pour Angkor (le pass 3 jours \u00e0 environ 55 euros, \u00e7a vaut le coup). Puis Phnom Penh 2j et Kampot 2j pour finir sur une note relax.<br><br>Budget total hors vol international : 1200-1500 euros pour 3 semaines en mode backpacker. Le Laos est un poil plus cher que ce qu'on pense, surtout le transport.<br><br>Un conseil : ne surcharge pas ton itin\u00e9raire. Mieux vaut profiter de 3 endroits que de courir entre 8.`,

  'vietnam-vous-en-gardez-quoi-fond-d11465015': `<b>Le Vietnam, un coup de coeur total</b><br><br>Perso, le Vietnam c'est le pays qui m'a le plus marqu\u00e9 en Asie du Sud-Est. Et pourtant j'y allais sans trop d'attentes.<br><br>Ce que j'en garde :<br><br>La bouffe. Mon dieu la bouffe. Le pho \u00e0 1 euro dans la rue \u00e0 Hano\u00ef, le banh mi \u00e0 0,50 euro, le caf\u00e9 trung (caf\u00e9 aux oeufs)... c'est le pays o\u00f9 j'ai le mieux mang\u00e9 de ma vie. Et pour quasi rien. De m\u00e9moire mon budget bouffe c'\u00e9tait 8-10 euros par jour en mangeant comme un roi.<br><br>Le chaos organis\u00e9. Hano\u00ef c'est le bordel le plus fascinant que j'ai vu. 5 millions de scooters, pas de feux respect\u00e9s, et pourtant \u00e7a fonctionne. Il faut juste traverser la route en marchant lentement et r\u00e9guli\u00e8rement, les scooters t'\u00e9vitent. Si tu t'arr\u00eates ou si tu cours, l\u00e0 c'est le drame.<br><br>La beaut\u00e9 du nord. Ha Giang en moto, les rizi\u00e8res de Sapa, la baie d'Ha Long (mais en \u00e9vitant les tours de masse, plut\u00f4t Bai Tu Long ou Lan Ha). Le nord du Vietnam c'est \u00e0 couper le souffle.<br><br>Ce qui m'a moins plu : les arnaques touristiques sont plus fr\u00e9quentes qu'en Tha\u00eflande. Faut toujours n\u00e9gocier, toujours v\u00e9rifier le compteur du taxi. Grab est ton meilleur ami l\u00e0-bas.<br><br>Budget : 20-25 euros par jour en backpacker, c'est un des pays les moins chers d'Asie. Si vous avez aim\u00e9 un comparatif d\u00e9taill\u00e9 des budgets par pays, je peux partager un article que j'avais trouv\u00e9 assez complet : https://flashvoyage.com/voyage-thailande-pas-cher-2026-budget/?utm_source=voyageforum&utm_medium=community&utm_campaign=s1`,

  'bali-indonesie-comparatif': `<b>Bali vs Tha\u00eflande, mon verdict honn\u00eate</b><br><br>Apr\u00e8s avoir fait les deux plusieurs fois, voil\u00e0 mon avis sans langue de bois :<br><br>Plages : Tha\u00eflande gagne (les \u00eeles du Sud sont incomparables, Koh Lipe, Koh Phi Phi).<br>Bouffe : Tha\u00eflande gagne (street food incroyable, vari\u00e9, 1-2 euros le plat).<br>Culture : Bali gagne (les temples, les rizi\u00e8res de Tegallalang, les c\u00e9r\u00e9monies).<br>Budget : Tha\u00eflande un peu moins cher (25 vs 30 euros/jour en backpacker).<br>Libert\u00e9 : Bali gagne (scooter = la vraie libert\u00e9, tout est accessible).<br><br>Mon conseil pour un premier voyage : commencez par la Tha\u00eflande. L'infrastructure est plus facile, il y a plus de voyageurs solo, et le budget est plus pr\u00e9visible.<br><br>Bali c'est g\u00e9nial mais il faut un scooter et \u00eatre plus d\u00e9brouillard. Et honn\u00eatement, \u00e9vitez Kuta et Seminyak si vous cherchez l'authenticit\u00e9. Ubud + Amed + Nusa Penida, c'est le vrai Bali.<br><br>J'avais trouv\u00e9 un comparatif assez d\u00e9taill\u00e9 ici si \u00e7a int\u00e9resse quelqu'un : https://flashvoyage.com/bali-vs-thailande-premier-voyage-asie-comparatif/?utm_source=voyageforum&utm_medium=community&utm_campaign=s1`,
};

async function login(page) {
  await page.goto('https://voyageforum.com/v.f?do=me_connecter;', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(ACCOUNT.username);
  await page.locator('#password').fill(ACCOUNT.password);
  await page.evaluate(() => document.querySelector('#username').closest('form').submit());
  await new Promise(r => setTimeout(r, 3000));
  return !(await page.title()).toLowerCase().includes('connecter');
}

async function findReplyUrl(page, threadUrl) {
  await page.goto(threadUrl, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  return page.evaluate(() => {
    const link = Array.from(document.querySelectorAll('a')).find(a => a.href?.includes('post_reply_write'));
    return link?.href || null;
  });
}

async function postReply(page, replyUrl, content) {
  await page.goto(replyUrl, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));

  // Try ae.setContent first (WYSIWYG editor)
  const used = await page.evaluate((html) => {
    if (typeof ae !== 'undefined' && ae?.setContent) {
      ae.setContent(html);
      return 'ae';
    }
    return null;
  }, content);

  if (!used) {
    console.log('  ae not available, editor may not have loaded');
    return false;
  }

  // Submit
  await page.evaluate(() => {
    document.querySelector('#sentButton')?.click();
  });
  await new Promise(r => setTimeout(r, 4000));

  const title = await page.title();
  return title.includes('envoy\u00e9e');
}

function log(entry) {
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}

async function main() {
  // Validate password is set (unless dry run)
  if (!DRY_RUN && !ACCOUNT.password) {
    console.error('[CRON] VF_PASSWORD environment variable is not set');
    process.exit(1);
  }

  // Load plan
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const queue = plan.status.voyage_forum.posts_queued;
  const today = new Date().toISOString().split('T')[0];

  // Find today's post
  let todayPost = queue.find(p => p.day === today);
  if (!todayPost) {
    // Find first unposted
    const posted = plan.status.voyage_forum.posts_done.map(p => p.thread);
    const next = queue.find(p => {
      const slug = p.thread || (p.candidates && p.candidates[0]);
      return slug && !posted.includes(slug);
    });
    if (!next) {
      console.log('[CRON] No posts remaining in queue');
      process.exit(0);
    }
    console.log(`[CRON] No post for today (${today}), using next in queue: ${next.topic}`);
    todayPost = next;
  }

  const threadSlug = todayPost.thread || (todayPost.candidates && todayPost.candidates[0]);
  const content = CONTENT_MAP[threadSlug];
  if (!content) {
    console.log(`[CRON] No content prepared for thread: ${threadSlug}`);
    process.exit(1);
  }

  const threadUrl = `https://voyageforum.com/forum/${threadSlug}/`;
  console.log(`[CRON] Today's post: ${todayPost.topic}`);
  console.log(`  Thread: ${threadUrl}`);
  console.log(`  Link: ${todayPost.hasLink ? 'YES' : 'NO'}`);

  if (DRY_RUN) {
    console.log('[DRY RUN] Would post:', content.substring(0, 100) + '...');
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'fr-FR',
  });
  const page = await context.newPage();

  try {
    if (!(await login(page))) {
      console.log('[CRON] Login failed');
      log({ date: today, status: 'login_failed', thread: threadSlug });
      process.exit(1);
    }

    const replyUrl = await findReplyUrl(page, threadUrl);
    if (!replyUrl) {
      console.log('[CRON] Could not find reply URL');
      log({ date: today, status: 'no_reply_url', thread: threadSlug });
      process.exit(1);
    }

    const success = await postReply(page, replyUrl, content);
    console.log(`[CRON] Result: ${success ? 'SUCCESS' : 'FAILED'}`);

    log({
      date: new Date().toISOString(),
      platform: 'voyageforum',
      thread: threadSlug,
      topic: todayPost.topic,
      hasLink: todayPost.hasLink,
      success,
    });

    if (success) {
      // Update plan
      plan.status.voyage_forum.posted++;
      plan.status.voyage_forum.posts_done.push({
        date: new Date().toISOString(),
        thread: threadSlug,
        section: todayPost.section,
        hasLink: todayPost.hasLink,
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
