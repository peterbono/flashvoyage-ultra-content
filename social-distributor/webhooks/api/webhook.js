import crypto from 'crypto';

const APP_SECRET = process.env.APP_SECRET || 'c936b60546cb3b47c54b053393b87424';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'flashvoyage_webhook_2024';
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PAGE_ID = '1068729919650308';
const IG_ID = '17841442283434789';
const GRAPH_API = 'https://graph.facebook.com/v21.0';
const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';

const TRIGGER_KEYWORDS = ['info', 'infos', 'lien', 'link'];

function isTrigger(text) {
  return TRIGGER_KEYWORDS.includes(text.trim().toLowerCase().replace(/[!?.]+$/, ''));
}

function verifySignature(body, signature) {
  if (!signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/** Fetch the IG post caption to find the article topic */
async function getPostCaption(mediaId) {
  const r = await fetch(`${GRAPH_API}/${mediaId}?fields=caption&access_token=${PAGE_TOKEN}`);
  const data = await r.json();
  return data.caption || '';
}

/** Search WP for an article matching keywords from the caption */
async function findArticleUrl(caption) {
  // Extract first meaningful line as search query
  const firstLine = caption.split('\n')[0].replace(/[#@🔥💰📊🇵🇭🤔👇🏨🍜🚗🎟️📱]/gu, '').trim();
  const query = firstLine.slice(0, 60);

  const r = await fetch(`${WP_API}/posts?search=${encodeURIComponent(query)}&per_page=1&_fields=link,title`);
  const posts = await r.json();

  if (posts.length > 0) {
    return { url: posts[0].link, title: posts[0].title?.rendered || query };
  }
  return { url: 'https://flashvoyage.com', title: 'Flash Voyage' };
}

/** Generate DM text — with Haiku if available, fallback otherwise */
async function generateDM(articleUrl, articleTitle, commentText) {
  if (!ANTHROPIC_API_KEY) {
    return `Salut ! 👋 Voici le lien vers l'article :\n${articleUrl}\nBonne lecture ! ✈️`;
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Tu es l'assistant Flash Voyage. Un utilisateur a commenté "${commentText}" sur notre post "${articleTitle}". Génère un DM court et friendly (max 3 phrases, tutoiement, pas commercial) avec ce lien : ${articleUrl}`,
      }],
    }),
  });
  const data = await r.json();
  return data.content?.[0]?.text?.trim() || `Salut ! Voici l'article :\n${articleUrl}`;
}

/** Send DM via IG Messaging API */
async function sendDM(userId, text) {
  const r = await fetch(`${GRAPH_API}/${PAGE_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: userId },
      message: { text },
      messaging_type: 'RESPONSE',
      access_token: PAGE_TOKEN,
    }),
  });
  const data = await r.json();
  if (data.error) throw new Error(`DM failed: ${data.error.message}`);
  return data;
}

export default async function handler(req, res) {
  // GET = Meta verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[WEBHOOK] Verification OK');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // POST = Comment event
  if (req.method === 'POST') {
    // Verify signature
    const rawBody = JSON.stringify(req.body);
    if (!verifySignature(rawBody, req.headers['x-hub-signature-256'])) {
      console.warn('[WEBHOOK] Invalid signature');
      return res.status(401).send('Invalid signature');
    }

    // Respond 200 immediately (Meta requires <20s)
    res.status(200).send('OK');

    const body = req.body;
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'comments') continue;

        const { text, from, media } = change.value || {};
        if (!text || !from?.id || !media?.id) continue;
        if (!isTrigger(text)) continue;

        console.log(`[WEBHOOK] Trigger "${text}" from ${from.id} on ${media.id}`);

        try {
          // 1. Get post caption
          const caption = await getPostCaption(media.id);

          // 2. Find matching article on WP
          const article = await findArticleUrl(caption);
          console.log(`[WEBHOOK] Article: ${article.title} -> ${article.url}`);

          // 3. Generate personalized DM
          const dmText = await generateDM(article.url, article.title, text);

          // 4. Send DM
          await sendDM(from.id, dmText);
          console.log(`[WEBHOOK] DM sent to ${from.id}`);
        } catch (err) {
          console.error(`[WEBHOOK] Error: ${err.message}`);
        }
      }
    }
    return;
  }

  res.status(405).send('Method not allowed');
}
