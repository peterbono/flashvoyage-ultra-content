const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || 'sbawruensgk4ecyb6v';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || 'g44D9aXwnasbJ4nDVdgZKCI9Bczjq5Yx';
const TIKTOK_REDIRECT_URI = 'https://webhooks-gamma-six.vercel.app/api/tiktok-callback';

export default async function handler(req, res) {
  const code = req.query.code;
  const error = req.query.error;

  if (error) {
    return res.status(400).send(`TikTok auth error: ${error} — ${req.query.error_description || ''}`);
  }
  if (!code) return res.status(400).send('Missing code parameter. Go to /api/tiktok-callback?code=AUTH_CODE');

  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: TIKTOK_REDIRECT_URI,
    }),
  });
  const tokenData = await tokenRes.json();

  res.setHeader('Content-Type', 'text/html');
  res.send(`<html><body style="font-family:monospace;padding:40px">
    <h1>FlashVoyage — TikTok OAuth</h1>
    <h2>${tokenData.access_token ? '✅ Success' : '❌ Error'}</h2>
    <pre>${JSON.stringify(tokenData, null, 2)}</pre>
  </body></html>`);
}
