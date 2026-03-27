/**
 * Listicle Composer — FlashVoyage Reels
 *
 * Composes a listicle-style Reel from multiple clips + overlay PNGs + audio.
 * Steps:
 *  a. Prepare each clip: crop 9:16, scale 1080x1920, normalize fps=30, yuv420p
 *  b. Generate overlay PNGs for each scene (number + text + subtitle) via node-html-to-image
 *  c. Overlay PNGs on clips
 *  d. Concat all clips (demuxer, cut transitions)
 *  e. Mix audio at 20% volume with fade-out
 *  f. Final encode H.264+AAC movflags+faststart
 */

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import nodeHtmlToImage from 'node-html-to-image';

const require = createRequire(import.meta.url);
const execFile = promisify(execFileCb);
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');
const TMP_DIR = join(__dirname, 'tmp');
const LOGO_SVG_PATH = '/Users/floriangouloubi/Desktop/fv/logo/iconsolo.svg';

// ── Chrome path for node-html-to-image (same pattern as ffmpeg-composer.js) ──

function getChromePath() {
  try {
    const puppeteer = require('puppeteer');
    const p = puppeteer.executablePath();
    if (existsSync(p)) return p;
  } catch { /* ignore */ }
  const fallbacks = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const fb of fallbacks) {
    if (existsSync(fb)) return fb;
  }
  return undefined;
}

const CHROME_PATH = getChromePath();
const PUPPETEER_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox',
  '--disable-dev-shm-usage', '--disable-gpu',
  '--font-render-hinting=none',
];

// ── Logo SVG loader ──────────────────────────────────────────────────────────

let _logoSvg = null;
function getLogoSvg() {
  if (_logoSvg) return _logoSvg;
  try {
    if (existsSync(LOGO_SVG_PATH)) {
      _logoSvg = readFileSync(LOGO_SVG_PATH, 'utf-8');
      // Make all fills white for watermark usage
      _logoSvg = _logoSvg.replace(/fill="#[^"]+"/g, 'fill="white"');
      return _logoSvg;
    }
  } catch { /* ignore */ }
  // Fallback: inline SVG from existing template
  _logoSvg = `<svg viewBox="0 0 230 234" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M172.995 94.7653C172.175 87.4153 171.095 80.3853 169.515 75.4453C169.235 74.5653 161.415 73.9353 157.635 72.2953C156.005 71.5953 153.925 73.5353 153.145 74.2253L111.475 106.005L143.845 107.535L48.1554 178.125L87.1354 115.265L52.0154 113.785L117.695 68.5653C116.295 66.7853 111.675 64.5553 110.165 63.8553C108.145 62.8953 106.245 64.1953 105.795 64.4653L50.0254 94.0453C45.0554 75.9453 48.8154 59.2253 56.4454 45.1353C62.6254 47.4253 70.0554 60.4453 72.6154 68.5653C75.5554 59.9953 74.0654 53.3553 69.9354 46.5653C78.6654 48.4653 86.0654 52.0653 92.1754 57.7253C94.4854 55.7553 91.8754 46.2653 83.6454 41.6053C79.6854 39.6953 78.2654 38.6153 73.5954 37.3553C78.8454 35.1853 85.8954 33.1053 92.8454 31.9053C89.5054 29.1453 85.6954 26.9953 78.8654 27.1253C73.6654 27.2153 71.5154 28.6153 63.6154 30.5453C68.0954 24.0653 65.2654 11.8153 57.0454 5.95528C50.1054 0.955276 44.7954 0.735275 36.9554 0.855275C45.6554 9.52528 50.0854 20.3653 52.3554 28.7653C44.0054 22.4353 36.4754 20.3853 27.1254 20.2353C19.2654 21.1253 11.7654 22.5253 4.7054 30.4353C2.8354 33.0553 1.3654 35.1953 0.225402 37.3553C8.1454 35.2053 11.9554 33.3553 21.0554 33.4253C29.7854 33.4953 39.9554 35.7553 44.8054 37.8753C22.5954 43.3953 3.2954 61.4953 0.495402 88.8253C-1.0746 98.6053 1.1554 111.455 6.2154 124.555C14.9954 147.555 29.6454 168.165 47.7254 189.745C58.5654 202.005 72.7954 217.575 92.1754 233.705C116.045 210.855 150.175 177.235 167.355 132.205C171.015 122.225 173.355 110.435 172.995 94.7353V94.7653Z" fill="white"/>
    <path d="M228.795 12.1153C226.425 4.02528 216.205 0.0852758 208.675 0.00527581C193.965 -0.154724 183.195 3.29527 155.965 14.3553C154.875 14.8053 154.955 14.8153 153.035 14.0853C139.015 8.54527 125.845 6.03528 108.525 5.98528C97.8054 5.94528 93.8154 8.02527 87.4054 9.32527C102.775 10.2753 119.235 12.9253 138.615 21.0553C140.115 21.7553 138.975 22.7153 137.055 22.9853C126.005 23.6853 114.115 24.1353 107.595 29.6753C100.815 35.3353 108.165 41.4553 121.725 46.4453L129.625 49.1453C126.805 50.8253 119.355 51.0753 116.845 54.2153C114.805 56.8753 120.965 61.6553 128.605 64.7653C138.275 68.2253 144.075 66.1453 154.005 62.2753C156.985 61.2453 158.995 62.4253 161.165 63.5753C170.075 67.8753 178.195 70.0453 184.925 66.0253C190.875 62.5653 188.005 58.1253 183.035 52.5853C192.075 48.7453 202.055 44.2753 210.885 37.5453C220.775 31.1253 231.515 21.7853 228.795 12.1153Z" fill="white"/>
  </svg>`;
  return _logoSvg;
}

// ── FFmpeg helpers (same pattern as ffmpeg-composer.js) ───────────────────────

async function ffmpeg(args) {
  console.log(`[REEL/LISTICLE-COMP] ffmpeg ${args.slice(0, 6).join(' ')}...`);
  try {
    const { stdout, stderr } = await execFile('ffmpeg', args, { timeout: 180_000 });
    return { stdout, stderr };
  } catch (err) {
    console.error(`[REEL/LISTICLE-COMP] ffmpeg error: ${err.stderr?.slice(-500) || err.message}`);
    throw err;
  }
}

async function ffprobe(args) {
  const { stdout } = await execFile('ffprobe', args, { timeout: 30_000 });
  return stdout.trim();
}

async function getVideoDuration(videoPath) {
  try {
    const result = await ffprobe([
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath,
    ]);
    return parseFloat(result) || 10;
  } catch {
    return 10;
  }
}

// ── Overlay PNG generation ───────────────────────────────────────────────────

/**
 * Generate an item overlay PNG for a listicle scene.
 */
async function generateItemOverlay(number, text, subtitle, index) {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const templatePath = join(TEMPLATES_DIR, 'listicle-item-overlay.html');
  let html = readFileSync(templatePath, 'utf-8');

  html = html.replace('{{NUMBER}}', String(number));
  html = html.replace('{{ITEM_TEXT}}', text || '');
  html = html.replace('{{SUBTITLE}}', subtitle || '');
  html = html.replace('{{LOGO_SVG}}', getLogoSvg());

  const outputPath = join(TMP_DIR, `listicle-overlay-item-${index}-${Date.now()}.png`);

  await nodeHtmlToImage({
    output: outputPath,
    html,
    type: 'png',
    transparent: true,
    puppeteerArgs: {
      args: PUPPETEER_ARGS,
      ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {}),
    },
    waitUntil: 'networkidle0',
  });

  console.log(`[REEL/LISTICLE-COMP] Item overlay ${index}: #${number} "${text.slice(0, 30)}..." -> ${outputPath}`);
  return outputPath;
}

/**
 * Generate a hook overlay PNG (same as item but bigger number styling, or no number).
 */
async function generateHookOverlay(text, index) {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const templatePath = join(TEMPLATES_DIR, 'listicle-item-overlay.html');
  let html = readFileSync(templatePath, 'utf-8');

  // Hook: no number, just text
  html = html.replace('{{NUMBER}}', '');
  html = html.replace('{{ITEM_TEXT}}', text || '');
  html = html.replace('{{SUBTITLE}}', '');
  html = html.replace('{{LOGO_SVG}}', getLogoSvg());
  // Hide the number element for hook
  html = html.replace('.item-number {', '.item-number { display: none;');

  const outputPath = join(TMP_DIR, `listicle-overlay-hook-${index}-${Date.now()}.png`);

  await nodeHtmlToImage({
    output: outputPath,
    html,
    type: 'png',
    transparent: true,
    puppeteerArgs: {
      args: PUPPETEER_ARGS,
      ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {}),
    },
    waitUntil: 'networkidle0',
  });

  console.log(`[REEL/LISTICLE-COMP] Hook overlay: "${text.slice(0, 40)}..." -> ${outputPath}`);
  return outputPath;
}

/**
 * Generate a CTA overlay PNG.
 */
async function generateCtaOverlay(ctaText, saveText, index) {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const templatePath = join(TEMPLATES_DIR, 'listicle-cta-overlay.html');
  let html = readFileSync(templatePath, 'utf-8');

  html = html.replace('{{CTA_TEXT}}', ctaText || 'ENREGISTRE POUR TON PROCHAIN VOYAGE');
  html = html.replace('{{SAVE_TEXT}}', saveText || 'Commente INFO pour le guide complet');
  html = html.replace('{{LOGO_SVG}}', getLogoSvg());

  const outputPath = join(TMP_DIR, `listicle-overlay-cta-${index}-${Date.now()}.png`);

  await nodeHtmlToImage({
    output: outputPath,
    html,
    type: 'png',
    transparent: true,
    puppeteerArgs: {
      args: PUPPETEER_ARGS,
      ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {}),
    },
    waitUntil: 'networkidle0',
  });

  console.log(`[REEL/LISTICLE-COMP] CTA overlay: "${ctaText.slice(0, 40)}..." -> ${outputPath}`);
  return outputPath;
}

// ── Clip preparation ─────────────────────────────────────────────────────────

/**
 * Prepare a single clip: crop 9:16, scale 1080x1920, fps=30, yuv420p, trim to duration.
 */
async function prepareClip(inputPath, duration, index) {
  const outputPath = join(TMP_DIR, `listicle-prepared-${index}-${Date.now()}.mp4`);
  const srcDuration = await getVideoDuration(inputPath);

  // If clip is shorter than needed, loop it first
  let sourcePath = inputPath;
  if (srcDuration < duration) {
    const loopedPath = join(TMP_DIR, `listicle-looped-${index}-${Date.now()}.mp4`);
    const loopCount = Math.ceil(duration / srcDuration);
    await ffmpeg([
      '-stream_loop', String(loopCount),
      '-i', inputPath,
      '-t', String(duration),
      '-c', 'copy',
      '-y',
      loopedPath,
    ]);
    sourcePath = loopedPath;
  }

  // Crop to 9:16 then scale. Use min() to handle both landscape and portrait videos:
  // If video is wider than 9:16 → crop width to ih*9/16 (keep height)
  // If video is narrower than 9:16 → crop height to iw*16/9 (keep width)
  const cropFilter = "crop='if(gte(iw,ih*9/16),ih*9/16,iw)':'if(gte(iw,ih*9/16),ih,iw*16/9)'";
  await ffmpeg([
    '-i', sourcePath,
    '-vf', `${cropFilter},scale=1080:1920,fps=30`,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y',
    outputPath,
  ]);

  // Cleanup looped file if created
  if (sourcePath !== inputPath && existsSync(sourcePath)) {
    try { unlinkSync(sourcePath); } catch { /* ignore */ }
  }

  console.log(`[REEL/LISTICLE-COMP] Prepared clip ${index}: ${duration}s -> ${outputPath}`);
  return outputPath;
}

/**
 * Prepare CTA clip: blur + darken the hook clip.
 */
async function prepareCtaClip(hookClipPath, duration, index) {
  const outputPath = join(TMP_DIR, `listicle-cta-bg-${index}-${Date.now()}.mp4`);
  const srcDuration = await getVideoDuration(hookClipPath);

  // Loop if needed
  let sourcePath = hookClipPath;
  if (srcDuration < duration) {
    const loopedPath = join(TMP_DIR, `listicle-cta-looped-${index}-${Date.now()}.mp4`);
    const loopCount = Math.ceil(duration / srcDuration);
    await ffmpeg([
      '-stream_loop', String(loopCount),
      '-i', hookClipPath,
      '-t', String(duration),
      '-c', 'copy',
      '-y',
      loopedPath,
    ]);
    sourcePath = loopedPath;
  }

  // Blur + darken (same adaptive crop as prepareClip)
  const cropFilter = "crop='if(gte(iw,ih*9/16),ih*9/16,iw)':'if(gte(iw,ih*9/16),ih,iw*16/9)'";
  await ffmpeg([
    '-i', sourcePath,
    '-vf', `${cropFilter},scale=1080:1920,fps=30,boxblur=20:20,eq=brightness=-0.3`,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y',
    outputPath,
  ]);

  if (sourcePath !== hookClipPath && existsSync(sourcePath)) {
    try { unlinkSync(sourcePath); } catch { /* ignore */ }
  }

  console.log(`[REEL/LISTICLE-COMP] CTA background clip prepared: ${duration}s -> ${outputPath}`);
  return outputPath;
}

// ── Main compose function ────────────────────────────────────────────────────

/**
 * Compose a listicle Reel from script, clips, and audio.
 *
 * @param {Object} script - Listicle script { hook, items, cta, mood, ... }
 * @param {Array} clips - Array of { path } objects (1 per scene: hook + items)
 * @param {string|null} audioPath - Path to background music
 * @param {Object} options
 * @param {string} options.outputPath - Where to save the final video
 * @returns {Promise<string>} Path to the output video
 */
export async function composeListicleReel(script, clips, audioPath, options = {}) {
  const { outputPath } = options;
  if (!outputPath) throw new Error('outputPath is required');
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const allTempFiles = [];

  try {
    // ── Build scene list: hook + items + CTA ───────────────────────────────
    const scenes = [
      { type: 'hook', text: script.hook.text, duration: script.hook.duration || 2.5, clip: clips[0] },
      ...script.items.map((item, i) => ({
        type: 'item',
        number: item.number,
        text: item.text,
        subtitle: item.subtitle,
        duration: item.duration || 4,
        clip: clips[i + 1] || clips[0], // fallback to hook clip
      })),
      { type: 'cta', text: script.cta.text, duration: script.cta.duration || 3, clip: null },
    ];

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
    console.log(`[REEL/LISTICLE-COMP] Composing: ${scenes.length} scenes, ~${totalDuration}s total`);

    // ── Step a: Prepare each clip ──────────────────────────────────────────
    const preparedClips = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];

      if (scene.type === 'cta') {
        // CTA: blur + darken the hook clip
        const hookClip = clips[0]?.path || clips.find(c => c?.path)?.path;
        if (hookClip) {
          const ctaBg = await prepareCtaClip(hookClip, scene.duration, i);
          preparedClips.push(ctaBg);
          allTempFiles.push(ctaBg);
        } else {
          // Generate a black frame if no clip
          const blackPath = join(TMP_DIR, `listicle-black-${i}-${Date.now()}.mp4`);
          await ffmpeg([
            '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:d=${scene.duration}:r=30`,
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', blackPath,
          ]);
          preparedClips.push(blackPath);
          allTempFiles.push(blackPath);
        }
      } else {
        const clipPath = scene.clip?.path;
        if (clipPath && existsSync(clipPath)) {
          const prepared = await prepareClip(clipPath, scene.duration, i);
          preparedClips.push(prepared);
          allTempFiles.push(prepared);
        } else {
          // Generate a dark gradient frame as fallback
          const fallbackPath = join(TMP_DIR, `listicle-fallback-${i}-${Date.now()}.mp4`);
          await ffmpeg([
            '-f', 'lavfi', '-i', `color=c=0x1a1a2e:s=1080x1920:d=${scene.duration}:r=30`,
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', fallbackPath,
          ]);
          preparedClips.push(fallbackPath);
          allTempFiles.push(fallbackPath);
        }
      }
    }

    // ── Step b: Generate overlay PNGs ──────────────────────────────────────
    const overlayPaths = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      let overlayPath;

      if (scene.type === 'hook') {
        overlayPath = await generateHookOverlay(scene.text, i);
      } else if (scene.type === 'item') {
        overlayPath = await generateItemOverlay(scene.number, scene.text, scene.subtitle, i);
      } else if (scene.type === 'cta') {
        overlayPath = await generateCtaOverlay(
          scene.text,
          'Commente INFO pour le guide complet',
          i
        );
      }

      overlayPaths.push(overlayPath);
      allTempFiles.push(overlayPath);
    }

    // ── Step c: Overlay PNGs on clips (per scene) ──────────────────────────
    const overlaidClips = [];
    for (let i = 0; i < preparedClips.length; i++) {
      const overlaidPath = join(TMP_DIR, `listicle-overlaid-${i}-${Date.now()}.mp4`);

      await ffmpeg([
        '-i', preparedClips[i],
        '-i', overlayPaths[i],
        '-filter_complex', '[1]scale=1080:1920[ovl];[0][ovl]overlay=0:0',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-an',
        '-y',
        overlaidPath,
      ]);

      overlaidClips.push(overlaidPath);
      allTempFiles.push(overlaidPath);
    }

    // ── Step d: Concat all clips ───────────────────────────────────────────
    const concatListPath = join(TMP_DIR, `listicle-concat-${Date.now()}.txt`);
    const concatContent = overlaidClips.map(p => `file '${p}'`).join('\n');
    writeFileSync(concatListPath, concatContent);
    allTempFiles.push(concatListPath);

    const concattedPath = join(TMP_DIR, `listicle-concatted-${Date.now()}.mp4`);
    await ffmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-an',
      '-y',
      concattedPath,
    ]);
    allTempFiles.push(concattedPath);

    // ── Step e: Mix audio at 20% volume with fade-out ──────────────────────
    let withAudioPath = concattedPath;

    if (audioPath && existsSync(audioPath)) {
      withAudioPath = join(TMP_DIR, `listicle-audio-${Date.now()}.mp4`);
      // Audio at 20% volume, fade out last 2 seconds
      const fadeStart = Math.max(0, totalDuration - 2);
      await ffmpeg([
        '-i', concattedPath,
        '-i', audioPath,
        '-filter_complex',
        `[1:a]volume=0.20,atrim=0:${totalDuration},afade=t=out:st=${fadeStart}:d=2[bgm]`,
        '-map', '0:v',
        '-map', '[bgm]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-y',
        withAudioPath,
      ]);
      allTempFiles.push(withAudioPath);
    } else {
      // Add silent audio (IG requires it)
      const silentPath = join(TMP_DIR, `listicle-silent-${Date.now()}.mp4`);
      await ffmpeg([
        '-i', concattedPath,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-t', String(totalDuration),
        '-y',
        silentPath,
      ]);
      withAudioPath = silentPath;
      allTempFiles.push(silentPath);
    }

    // ── Step f: Final encode H.264+AAC movflags+faststart ──────────────────
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    await ffmpeg([
      '-i', withAudioPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);

    console.log(`[REEL/LISTICLE-COMP] Listicle Reel composed: ${outputPath}`);
    return outputPath;

  } finally {
    // ── Cleanup temp files ─────────────────────────────────────────────────
    for (const f of new Set(allTempFiles)) {
      if (f && f !== outputPath && existsSync(f)) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
    }
  }
}
