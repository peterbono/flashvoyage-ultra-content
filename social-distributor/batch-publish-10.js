#!/usr/bin/env node

/**
 * Batch publish 10 viral posts to Facebook, Instagram, and Threads.
 *
 * 1. Fetches featured images from WP REST API
 * 2. Generates story-card visuals
 * 3. Uploads visuals to WP media library (for public URL)
 * 4. Publishes to FB, IG, Threads with proper captions
 */

import { writeFileSync, readFileSync } from 'fs';
import { generateStoryCard } from './visual-generator.js';

// ── Config ──────────────────────────────────────────────────────────────────

const WP_BASE = 'https://flashvoyage.com';
const WP_AUTH = 'Basic ' + Buffer.from('admin7817:GjLl 9W0k lKwf LSOT PXur RYGR').toString('base64');

const FB_PAGE_ID = '1068729919650308';
const IG_ID = '17841442283434789';
const THREADS_USER_ID = '26656054517311281';

const FB_TOKEN = process.env.FB_TOKEN;
const THREADS_TOKEN = process.env.THREADS_TOKEN;

// ── Article definitions ─────────────────────────────────────────────────────

const ARTICLES = [
  {
    id: 4250,
    headline1: "ESIM VIETNAM : LE COMPARATIF",
    headline2: "QUE LES BLOGS NE FONT JAMAIS",
    subtext: "Holafly, Airalo, Saily ou Viettel ? La v\u00e9rit\u00e9 sur les prix.",
    fbHook: "Tu pars au Vietnam et tu h\u00e9sites entre eSIM internationale et SIM locale ?\n\nOn a compar\u00e9 Holafly, Airalo, Saily et Viettel ligne par ligne : prix, d\u00e9bit, couverture, validit\u00e9. R\u00e9sultat : une SIM locale \u00e0 3\u20ac bat tous les eSIM \u00ab illimit\u00e9s \u00bb. Les chiffres parlent.\n\n\ud83d\udcac Tu utilises quelle solution pour tes donn\u00e9es au Vietnam ?",
    igHook: "Tu pars au Vietnam et tu h\u00e9sites entre eSIM internationale et SIM locale ?\n\nOn a compar\u00e9 Holafly, Airalo, Saily et Viettel ligne par ligne : prix, d\u00e9bit, couverture, validit\u00e9. R\u00e9sultat : une SIM locale \u00e0 3\u20ac bat tous les eSIM \u00ab illimit\u00e9s \u00bb.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#Vietnam #eSIM #VoyageVietnam #FlashVoyage #AsieduSudEst #Backpacking #Holafly #Airalo #VoyageAsie #NomadDigital",
    threadsHook: "eSIM Vietnam : Holafly, Airalo ou SIM locale ?\n\nUne SIM Viettel \u00e0 3\u20ac bat tous les eSIM internationaux en d\u00e9bit et en prix. Le comparatif complet \u2193\n\n\ud83d\udc49 flashvoyage.com/esim-vietnam-comparatif/",
    hashtags: ["#Vietnam", "#eSIM", "#VoyageVietnam", "#FlashVoyage", "#AsieduSudEst", "#Backpacking", "#Holafly", "#Airalo", "#VoyageAsie", "#NomadDigital"],
  },
  {
    id: 4252,
    headline1: "ASSURANCE VOYAGE VIETNAM",
    headline2: "CE QUE TON ASSUREUR TE CACHE",
    subtext: "Chapka, ACS, Heymondo \u2014 les franchises cach\u00e9es.",
    fbHook: "Ton assurance voyage couvre le Vietnam ? Vraiment ?\n\nOn a \u00e9pluch\u00e9 les contrats de Chapka, ACS et Heymondo. Franchises cach\u00e9es, exclusions moto, plafonds ridicules sur les bagages. Ce que les comparateurs ne te disent pas.\n\n\ud83d\udcac Tu as d\u00e9j\u00e0 eu un sinistre en Asie ? Raconte.",
    igHook: "Ton assurance voyage couvre le Vietnam ? Vraiment ?\n\nChapka, ACS, Heymondo \u2014 on a \u00e9pluch\u00e9 les contrats. Franchises cach\u00e9es, exclusions moto, plafonds bagages ridicules. Voici ce que les comparateurs oublient.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#AssuranceVoyage #Vietnam #Chapka #Heymondo #ACS #VoyageAsie #FlashVoyage #Backpacking #SanteVoyage #ConseilVoyage",
    threadsHook: "Assurance voyage Vietnam : Chapka, ACS ou Heymondo ?\n\nFranchises cach\u00e9es, exclusions moto, plafonds bagages ridicules. Le vrai comparatif.\n\n\ud83d\udc49 flashvoyage.com/assurance-voyage-vietnam-comparatif/",
    hashtags: ["#AssuranceVoyage", "#Vietnam", "#Chapka", "#Heymondo", "#ACS", "#VoyageAsie", "#FlashVoyage", "#Backpacking", "#SanteVoyage", "#ConseilVoyage"],
  },
  {
    id: 4253,
    headline1: "ESIM THA\u00cfLANDE : AIS, DTAC",
    headline2: "OU TRUE MOVE ? LE VRAI COMPARATIF",
    subtext: "Une SIM locale \u00e0 10\u20ac bat tous les eSIM internationaux.",
    fbHook: "eSIM en Tha\u00eflande : AIS, DTAC ou True Move ?\n\nOn a test\u00e9 les 3 op\u00e9rateurs locaux face aux eSIM internationaux. R\u00e9sultat : une SIM locale \u00e0 10\u20ac offre 5x plus de data que Holafly \u00e0 19\u20ac. D\u00e9bit, couverture \u00eeles, prix \u2014 tout est compar\u00e9.\n\n\ud83d\udcac AIS, DTAC ou True Move ? Tu choisis lequel ?",
    igHook: "eSIM Tha\u00eflande : AIS, DTAC ou True Move ?\n\nUne SIM locale \u00e0 10\u20ac offre 5x plus de data que les eSIM internationaux. On a tout compar\u00e9 : d\u00e9bit, couverture \u00eeles, prix r\u00e9els.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#Thailande #eSIM #AIS #TrueMove #DTAC #VoyageThailande #FlashVoyage #NomadDigital #VoyageAsie #Bangkok",
    threadsHook: "eSIM Tha\u00eflande : AIS, DTAC ou True Move ?\n\nUne SIM AIS \u00e0 10\u20ac bat Holafly \u00e0 19\u20ac sur tous les crit\u00e8res.\n\n\ud83d\udc49 flashvoyage.com/esim-thailande-comparatif/",
    hashtags: ["#Thailande", "#eSIM", "#AIS", "#TrueMove", "#DTAC", "#VoyageThailande", "#FlashVoyage", "#NomadDigital", "#VoyageAsie", "#Bangkok"],
  },
  {
    id: 4254,
    headline1: "BALI OU THA\u00cfLANDE ?",
    headline2: "LE COMPARATIF BRUTAL",
    subtext: "Budget, visa, plages, culture \u2014 ligne par ligne.",
    fbHook: "Bali ou Tha\u00eflande ? Le d\u00e9bat qui divise tous les voyageurs.\n\nOn a compar\u00e9 les deux destinations ligne par ligne : budget quotidien, visa, plages, street food, vie nocturne, temples. Spoiler : y'a pas de mauvais choix, mais y'a un choix plus malin selon ton profil.\n\n\ud83d\udcac Team Bali ou Team Tha\u00eflande ?",
    igHook: "Bali ou Tha\u00eflande ? Le d\u00e9bat qui divise tous les voyageurs.\n\nBudget, visa, plages, culture, street food \u2014 tout est compar\u00e9 ligne par ligne. Le bon choix d\u00e9pend de ton profil.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#Bali #Thailande #BaliVsThailande #VoyageAsie #FlashVoyage #Backpacking #Indonesie #AsieduSudEst #VoyageBudget #PlagesAsie",
    threadsHook: "Bali ou Tha\u00eflande ? Le comparatif brutal.\n\nBudget, visa, plages, culture \u2014 tout est compar\u00e9. Le bon choix d\u00e9pend de ton profil.\n\n\ud83d\udc49 flashvoyage.com/bali-ou-thailande-comparatif/",
    hashtags: ["#Bali", "#Thailande", "#BaliVsThailande", "#VoyageAsie", "#FlashVoyage", "#Backpacking", "#Indonesie", "#AsieduSudEst", "#VoyageBudget", "#PlagesAsie"],
  },
  {
    id: 4255,
    headline1: "CAMBODGE OU LAOS ?",
    headline2: "LE CHOIX QUE TU DOIS FAIRE",
    subtext: "Deux pays, deux ambiances. Budget et logistique compar\u00e9s.",
    fbHook: "Cambodge ou Laos ? Deux pays voisins, deux ambiances totalement diff\u00e9rentes.\n\nAngkor vs Luang Prabang, Siem Reap vs Vang Vieng, tuk-tuk vs slow boat. On a compar\u00e9 budget, transport, h\u00e9bergement et exp\u00e9riences. Le verdict est clair.\n\n\ud83d\udcac Tu as fait les deux ? Lequel tu as pr\u00e9f\u00e9r\u00e9 ?",
    igHook: "Cambodge ou Laos ? Deux pays, deux ambiances.\n\nAngkor vs Luang Prabang, budget, transport, h\u00e9bergement \u2014 le comparatif complet pour choisir selon ton style de voyage.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#Cambodge #Laos #CambodgeVsLaos #VoyageAsie #FlashVoyage #Backpacking #AngkorWat #LuangPrabang #AsieduSudEst #VoyageBudget",
    threadsHook: "Cambodge ou Laos ? Le choix que tu dois faire.\n\nAngkor vs Luang Prabang, budget et logistique compar\u00e9s. Le verdict.\n\n\ud83d\udc49 flashvoyage.com/cambodge-ou-laos-comparatif/",
    hashtags: ["#Cambodge", "#Laos", "#CambodgeVsLaos", "#VoyageAsie", "#FlashVoyage", "#Backpacking", "#AngkorWat", "#LuangPrabang", "#AsieduSudEst", "#VoyageBudget"],
  },
  {
    id: 4369,
    headline1: "VISA CAMBODGE 2026",
    headline2: "LES PI\u00c8GES QUE PERSONNE NE MENTIONNE",
    subtext: "E-visa, prix r\u00e9els, arnaques \u00e0 la fronti\u00e8re.",
    fbHook: "Visa Cambodge 2026 : tu crois que c'est simple ? Pas vraiment.\n\nE-visa, visa on arrival, prix officiels vs prix r\u00e9els, arnaques aux postes fronti\u00e8res, photos non conformes. On a document\u00e9 tous les pi\u00e8ges pour que tu ne te fasses pas avoir.\n\n\ud83d\udcac Tu as d\u00e9j\u00e0 eu un probl\u00e8me de visa au Cambodge ?",
    igHook: "Visa Cambodge 2026 : les pi\u00e8ges que personne ne mentionne.\n\nE-visa, prix r\u00e9els vs officiels, arnaques fronti\u00e8res \u2014 tout ce qu'il faut savoir avant de partir.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#Cambodge #VisaCambodge #VoyageCambodge #FlashVoyage #Backpacking #AsieduSudEst #Visa #ConseilVoyage #SiemReap #PhnomPenh",
    threadsHook: "Visa Cambodge 2026 : les pi\u00e8ges que personne ne mentionne.\n\nE-visa, arnaques fronti\u00e8res, prix r\u00e9els. Le guide complet.\n\n\ud83d\udc49 flashvoyage.com/visa-cambodge-guide/",
    hashtags: ["#Cambodge", "#VisaCambodge", "#VoyageCambodge", "#FlashVoyage", "#Backpacking", "#AsieduSudEst", "#Visa", "#ConseilVoyage", "#SiemReap", "#PhnomPenh"],
  },
  {
    id: 4370,
    headline1: "BALI + LOMBOK + GILI EN 10 JOURS",
    headline2: "L'ITIN\u00c9RAIRE QUE LES BLOGS CACHENT",
    subtext: "Fast boats, pi\u00e8ges, budget \u2014 jour par jour.",
    fbHook: "Bali, Lombok et les Gili en 10 jours \u2014 sans se ruiner.\n\nFast boats, pi\u00e8ges \u00e0 touristes, vrais prix des h\u00e9bergements, budget jour par jour. L'itin\u00e9raire qu'on aurait voulu avoir avant de partir.\n\n\ud83d\udcac Tu as fait ce circuit ? Des tips \u00e0 partager ?",
    igHook: "Bali + Lombok + Gili en 10 jours \u2014 l'itin\u00e9raire que les blogs cachent.\n\nFast boats, pi\u00e8ges, budget jour par jour \u2014 tout ce qu'il faut savoir pour ce circuit incontournable.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#Bali #Lombok #GiliIslands #VoyageBali #FlashVoyage #Indonesie #Backpacking #VoyageAsie #ItineraireVoyage #AsieduSudEst",
    threadsHook: "Bali + Lombok + Gili en 10 jours.\n\nFast boats, pi\u00e8ges, budget jour par jour. L'itin\u00e9raire complet.\n\n\ud83d\udc49 flashvoyage.com/bali-lombok-gili-10-jours/",
    hashtags: ["#Bali", "#Lombok", "#GiliIslands", "#VoyageBali", "#FlashVoyage", "#Indonesie", "#Backpacking", "#VoyageAsie", "#ItineraireVoyage", "#AsieduSudEst"],
  },
  {
    id: 4371,
    headline1: "PHILIPPINES EN 10 JOURS",
    headline2: "L'ITIN\u00c9RAIRE PLAGES ET BUDGET",
    subtext: "El Nido, Coron, Cebu, Bohol \u2014 les vrais prix 2026.",
    fbHook: "Philippines en 10 jours : El Nido, Coron, Cebu, Bohol.\n\nLe circuit parfait pour un premier voyage aux Philippines. Vols internes, island hopping, budget r\u00e9el jour par jour. Spoiler : c'est bien moins cher que Bali.\n\n\ud83d\udcac Tu as d\u00e9j\u00e0 fait les Philippines ? Quel \u00e9tait ton budget ?",
    igHook: "Philippines en 10 jours : El Nido, Coron, Cebu, Bohol.\n\nVols internes, island hopping, budget jour par jour \u2014 le circuit parfait pour un premier voyage. Moins cher que Bali.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#Philippines #ElNido #Coron #Cebu #Bohol #VoyagePhilippines #FlashVoyage #Backpacking #IslandHopping #VoyageAsie",
    threadsHook: "Philippines en 10 jours : El Nido, Coron, Cebu, Bohol.\n\nBudget r\u00e9el, vols internes, island hopping \u2014 moins cher que Bali.\n\n\ud83d\udc49 flashvoyage.com/philippines-10-jours-itineraire/",
    hashtags: ["#Philippines", "#ElNido", "#Coron", "#Cebu", "#Bohol", "#VoyagePhilippines", "#FlashVoyage", "#Backpacking", "#IslandHopping", "#VoyageAsie"],
  },
  {
    id: 4372,
    headline1: "ESIM PHILIPPINES : GLOBE VS SMART",
    headline2: "LE COMPARATIF EN FRAN\u00c7AIS",
    subtext: "Globe, Smart, Holafly, Airalo \u2014 couverture \u00eeles vs villes.",
    fbHook: "eSIM Philippines : Globe ou Smart ?\n\nOn a compar\u00e9 les deux op\u00e9rateurs locaux + Holafly et Airalo. Couverture sur les \u00eeles vs en ville, d\u00e9bit r\u00e9el, prix par Go. Le r\u00e9sultat va te surprendre si tu comptes aller \u00e0 El Nido.\n\n\ud83d\udcac Globe ou Smart ? Tu as test\u00e9 lequel aux Philippines ?",
    igHook: "eSIM Philippines : Globe vs Smart, le comparatif en fran\u00e7ais.\n\nCouverture \u00eeles vs villes, Holafly, Airalo \u2014 le vrai comparatif pour choisir ta data aux Philippines.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#Philippines #eSIM #Globe #Smart #VoyagePhilippines #FlashVoyage #Holafly #Airalo #ElNido #NomadDigital",
    threadsHook: "eSIM Philippines : Globe vs Smart.\n\nCouverture \u00eeles vs villes \u2014 le comparatif complet en fran\u00e7ais.\n\n\ud83d\udc49 flashvoyage.com/esim-philippines-comparatif/",
    hashtags: ["#Philippines", "#eSIM", "#Globe", "#Smart", "#VoyagePhilippines", "#FlashVoyage", "#Holafly", "#Airalo", "#ElNido", "#NomadDigital"],
  },
  {
    id: 4373,
    headline1: "JAPON EN COUPLE, 15 JOURS",
    headline2: "LE BUDGET TOUT COMPRIS",
    subtext: "JR Pass pour 2, ryokan, onsen \u2014 620\u20ac d'\u00e9conomie vs solo.",
    fbHook: "Japon en couple pendant 15 jours : combien \u00e7a co\u00fbte vraiment ?\n\nJR Pass, ryokan, onsen, temples, street food \u2014 on a calcul\u00e9 le budget ligne par ligne. R\u00e9sultat : voyager \u00e0 deux fait \u00e9conomiser 620\u20ac par rapport \u00e0 deux voyages solo.\n\n\ud83d\udcac Tu pr\u00e9vois le Japon en couple ? Quel est ton budget ?",
    igHook: "Japon en couple, 15 jours : le budget tout compris.\n\nJR Pass, ryokan, onsen, temples \u2014 620\u20ac d'\u00e9conomie vs solo. Le budget d\u00e9taill\u00e9 jour par jour.\n\nLien en bio \ud83d\udc49 flashvoyage.com\n\n#Japon #VoyageJapon #JRPass #Ryokan #Onsen #FlashVoyage #VoyageCouple #Tokyo #Kyoto #BudgetVoyage",
    threadsHook: "Japon en couple, 15 jours : le budget tout compris.\n\nJR Pass, ryokan, onsen \u2014 620\u20ac d'\u00e9conomie vs solo.\n\n\ud83d\udc49 flashvoyage.com/japon-couple-15-jours-budget/",
    hashtags: ["#Japon", "#VoyageJapon", "#JRPass", "#Ryokan", "#Onsen", "#FlashVoyage", "#VoyageCouple", "#Tokyo", "#Kyoto", "#BudgetVoyage"],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[${ts}] ERROR: ${msg}`);
}

// ── Step 1: Fetch featured image from WP ────────────────────────────────────

async function fetchFeaturedImage(postId) {
  const url = `${WP_BASE}/wp-json/wp/v2/posts/${postId}?_embed`;
  const res = await fetch(url, {
    headers: { 'Authorization': WP_AUTH },
  });
  if (!res.ok) throw new Error(`WP API ${res.status} for post ${postId}`);
  const data = await res.json();

  const slug = data.slug || `post-${postId}`;
  const link = data.link || `${WP_BASE}/${slug}/`;

  let imageUrl = null;
  try {
    imageUrl = data._embedded?.['wp:featuredmedia']?.[0]?.source_url;
  } catch { /* no featured image */ }

  if (!imageUrl) {
    // Fallback: generic travel image
    imageUrl = 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?auto=compress&cs=tinysrgb&w=1080';
    log(`  Post ${postId}: no featured image, using fallback`);
  }

  return { imageUrl, slug, link };
}

// ── Step 2: Generate visual ─────────────────────────────────────────────────

async function generateVisualForArticle(article, imageUrl) {
  const buffer = await generateStoryCard({
    imageUrl,
    headline1: article.headline1,
    headline2: article.headline2,
    subtext: article.subtext,
    brand: 'Flash Voyage',
  });

  const outPath = `/tmp/fv-social-${article.id}.png`;
  writeFileSync(outPath, buffer);
  log(`  Visual saved: ${outPath}`);
  return { buffer, path: outPath };
}

// ── Step 3: Upload visual to WP media library ───────────────────────────────

async function uploadToWPMedia(filePath, postId) {
  const imageBuffer = readFileSync(filePath);
  const filename = `fv-social-${postId}.png`;

  const res = await fetch(`${WP_BASE}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      'Authorization': WP_AUTH,
      'Content-Disposition': `attachment; filename=${filename}`,
      'Content-Type': 'image/png',
    },
    body: imageBuffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WP media upload failed ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const publicUrl = data.source_url;
  log(`  Uploaded to WP: ${publicUrl}`);
  return publicUrl;
}

// ── Step 4: Publish on Facebook ─────────────────────────────────────────────

async function publishFacebook(imageUrl, caption, articleLink) {
  // Step 1: Post photo with caption
  const postRes = await fetch(`https://graph.facebook.com/v21.0/${FB_PAGE_ID}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imageUrl,
      message: caption,
      access_token: FB_TOKEN,
    }),
  });

  if (!postRes.ok) {
    const err = await postRes.text();
    throw new Error(`FB post failed ${postRes.status}: ${err.slice(0, 300)}`);
  }

  const postData = await postRes.json();
  const postId = postData.post_id || postData.id;
  log(`  FB posted: ${postId}`);

  // Wait 2s then add link as first comment
  await sleep(2000);

  // For photo posts, the post_id format is "pageId_photoId" — we need the post ID for comments
  // Try commenting on the post
  const commentUrl = `https://graph.facebook.com/v21.0/${postId}/comments`;
  const commentRes = await fetch(commentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: articleLink,
      access_token: FB_TOKEN,
    }),
  });

  if (commentRes.ok) {
    log(`  FB comment added with link`);
  } else {
    const commentErr = await commentRes.text();
    logError(`  FB comment failed: ${commentErr.slice(0, 200)}`);
  }

  return postId;
}

// ── Step 5: Publish on Instagram ────────────────────────────────────────────

async function publishInstagram(imageUrl, caption) {
  // Step 1: Create media container
  const createRes = await fetch(`https://graph.facebook.com/v21.0/${IG_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption: caption,
      access_token: FB_TOKEN, // IG uses FB page token
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`IG media create failed ${createRes.status}: ${err.slice(0, 300)}`);
  }

  const createData = await createRes.json();
  const creationId = createData.id;
  log(`  IG container created: ${creationId}`);

  // Wait 5s for processing
  await sleep(5000);

  // Step 2: Publish
  const publishRes = await fetch(`https://graph.facebook.com/v21.0/${IG_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: FB_TOKEN,
    }),
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`IG publish failed ${publishRes.status}: ${err.slice(0, 300)}`);
  }

  const publishData = await publishRes.json();
  log(`  IG published: ${publishData.id}`);
  return publishData.id;
}

// ── Step 6: Publish on Threads ──────────────────────────────────────────────

async function publishThreads(imageUrl, caption) {
  // Step 1: Create thread container
  const createRes = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'IMAGE',
      image_url: imageUrl,
      text: caption,
      access_token: THREADS_TOKEN,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Threads create failed ${createRes.status}: ${err.slice(0, 300)}`);
  }

  const createData = await createRes.json();
  const creationId = createData.id;
  log(`  Threads container created: ${creationId}`);

  // Wait 3s
  await sleep(3000);

  // Step 2: Publish
  const publishRes = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: THREADS_TOKEN,
    }),
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Threads publish failed ${publishRes.status}: ${err.slice(0, 300)}`);
  }

  const publishData = await publishRes.json();
  log(`  Threads published: ${publishData.id}`);
  return publishData.id;
}

// ── Main Orchestrator ───────────────────────────────────────────────────────

async function main() {
  log('=== FLASHVOYAGE BATCH SOCIAL PUBLISH — 10 ARTICLES ===\n');

  if (!FB_TOKEN) { logError('FB_TOKEN not set!'); process.exit(1); }
  if (!THREADS_TOKEN) { logError('THREADS_TOKEN not set!'); process.exit(1); }

  const results = {
    visuals: { success: 0, fail: 0 },
    uploads: { success: 0, fail: 0 },
    facebook: { success: 0, fail: 0 },
    instagram: { success: 0, fail: 0 },
    threads: { success: 0, fail: 0 },
  };

  for (let i = 0; i < ARTICLES.length; i++) {
    const article = ARTICLES[i];
    log(`\n[${ i + 1}/10] Processing post #${article.id} — ${article.headline1}...`);

    let wpImageUrl = null;
    let visualPublicUrl = null;
    let articleSlug = '';
    let articleLink = '';

    // ── Fetch featured image from WP ──
    try {
      const wpData = await fetchFeaturedImage(article.id);
      wpImageUrl = wpData.imageUrl;
      articleSlug = wpData.slug;
      articleLink = wpData.link;
      log(`  Featured image: ${wpImageUrl.slice(0, 80)}...`);
      log(`  Article URL: ${articleLink}`);
    } catch (err) {
      logError(`  Fetch WP failed: ${err.message}`);
      wpImageUrl = 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?auto=compress&cs=tinysrgb&w=1080';
      articleLink = `${WP_BASE}/${articleSlug || 'article'}/`;
    }

    // ── Generate visual ──
    try {
      await generateVisualForArticle(article, wpImageUrl);
      results.visuals.success++;
    } catch (err) {
      logError(`  Visual generation failed: ${err.message}`);
      results.visuals.fail++;
      continue; // Skip this article if visual fails
    }

    // ── Upload visual to WP media ──
    try {
      visualPublicUrl = await uploadToWPMedia(`/tmp/fv-social-${article.id}.png`, article.id);
      results.uploads.success++;
    } catch (err) {
      logError(`  WP upload failed: ${err.message}`);
      results.uploads.fail++;
      continue; // Need public URL for social publishing
    }

    // ── Publish on Facebook ──
    try {
      const fbLinkComment = `\ud83d\udc49 L'article complet : ${articleLink}?utm_source=facebook&utm_medium=page`;
      await publishFacebook(visualPublicUrl, article.fbHook, fbLinkComment);
      results.facebook.success++;
    } catch (err) {
      logError(`  Facebook failed: ${err.message}`);
      results.facebook.fail++;
    }

    await sleep(5000); // Rate limit between platforms

    // ── Publish on Instagram ──
    try {
      await publishInstagram(visualPublicUrl, article.igHook);
      results.instagram.success++;
    } catch (err) {
      logError(`  Instagram failed: ${err.message}`);
      results.instagram.fail++;
    }

    await sleep(5000); // Rate limit

    // ── Publish on Threads ──
    try {
      await publishThreads(visualPublicUrl, article.threadsHook);
      results.threads.success++;
    } catch (err) {
      logError(`  Threads failed: ${err.message}`);
      results.threads.fail++;
    }

    // Wait between articles to respect rate limits
    if (i < ARTICLES.length - 1) {
      log(`  Waiting 5s before next article...`);
      await sleep(5000);
    }
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`Visuals generated: ${results.visuals.success}/10 (${results.visuals.fail} failed)`);
  console.log(`Uploaded to WP:    ${results.uploads.success}/10 (${results.uploads.fail} failed)`);
  console.log(`Facebook:          ${results.facebook.success}/10 (${results.facebook.fail} failed)`);
  console.log(`Instagram:         ${results.instagram.success}/10 (${results.instagram.fail} failed)`);
  console.log(`Threads:           ${results.threads.success}/10 (${results.threads.fail} failed)`);
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  logError(`Fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
