#!/usr/bin/env node
const CLIENT_KEY = 'sbawruensgk4ecyb6v';
const REDIRECT_URI = 'https://webhooks-gamma-six.vercel.app/api/tiktok-callback';
const scope = 'video.upload,video.publish';
const state = 'flashvoyage_sandbox_' + Date.now();

const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${CLIENT_KEY}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;

console.log('=== FlashVoyage TikTok Sandbox Demo ===\n');
console.log('OAuth URL:');
console.log(authUrl);
console.log('\nOuvre cette URL dans Chrome.');
