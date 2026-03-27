/**
 * FFmpeg Composer — FlashVoyage Reels Module
 *
 * Core module that composes a Reel video using ffmpeg:
 * 1. Trim/crop stock video to 9:16 (1080x1920)
 * 2. Generate text overlay PNGs via node-html-to-image
 * 3. Overlay text PNGs onto video with timing
 * 4. Mix background audio at 15% volume
 * 5. Final encode H.264+AAC movflags+faststart
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

// Chrome path for node-html-to-image (reuse existing setup)
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

// ── Text Overlay PNG Generation ──────────────────────────────────────────────

/**
 * Generate a transparent PNG text overlay for one scene.
 *
 * @param {string} text - The text to display
 * @param {number} index - Scene index (for unique filenames)
 * @returns {Promise<string>} Path to the generated PNG
 */
async function generateTextOverlay(text, index) {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const templatePath = join(TEMPLATES_DIR, 'reel-text-overlay.html');
  let html = readFileSync(templatePath, 'utf-8');

  // Adaptive font size: shorter text = bigger
  const len = text.length;
  let fontSize = 90;
  if (len > 60) fontSize = 70;
  if (len > 80) fontSize = 60;
  if (len > 100) fontSize = 50;
  if (len < 20) fontSize = 100;

  html = html.replaceAll('{{SCENE_TEXT}}', text);
  html = html.replaceAll('{{FONT_SIZE}}', String(fontSize));

  const outputPath = join(TMP_DIR, `overlay-${index}-${Date.now()}.png`);

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

  console.log(`[REEL/FFMPEG] Text overlay ${index}: "${text.slice(0, 40)}..." → ${outputPath}`);
  return outputPath;
}

// ── FFmpeg Helpers ────────────────────────────────────────────────────────────

async function ffmpeg(args) {
  console.log(`[REEL/FFMPEG] ffmpeg ${args.slice(0, 6).join(' ')}...`);
  try {
    const { stdout, stderr } = await execFile('ffmpeg', args, { timeout: 120_000 });
    return { stdout, stderr };
  } catch (err) {
    console.error(`[REEL/FFMPEG] ffmpeg error: ${err.stderr?.slice(-500) || err.message}`);
    throw err;
  }
}

async function ffprobe(args) {
  const { stdout } = await execFile('ffprobe', args, { timeout: 30_000 });
  return stdout.trim();
}

/**
 * Get video duration in seconds.
 */
async function getVideoDuration(videoPath) {
  try {
    const result = await ffprobe([
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath,
    ]);
    return parseFloat(result) || 20;
  } catch {
    return 20; // fallback
  }
}

// ── Main Compose Function ────────────────────────────────────────────────────

/**
 * Compose a Reel video from stock footage + text scenes + audio.
 *
 * @param {Object} params
 * @param {string} params.videoPath - Path to input video file
 * @param {Array} params.scenes - Array of { text, duration, style }
 * @param {string|null} params.audioPath - Path to background music (or null)
 * @param {string} params.outputPath - Where to save the final .mp4
 * @returns {Promise<string>} Path to the output video
 */
export async function composeReel({ videoPath, scenes, audioPath, outputPath }) {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 4), 0);
  console.log(`[REEL/FFMPEG] Composing reel: ${scenes.length} scenes, ${totalDuration}s total`);

  // ── Step 1: Trim & crop video to 9:16 (1080x1920) ───────────────────────
  const trimmedPath = join(TMP_DIR, `trimmed-${Date.now()}.mp4`);

  // Check source video duration
  const srcDuration = await getVideoDuration(videoPath);
  const useDuration = Math.min(totalDuration, srcDuration);

  await ffmpeg([
    '-i', videoPath,
    '-vf', 'crop=ih*9/16:ih,scale=1080:1920',
    '-t', String(useDuration),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-an',  // strip audio for now
    '-y',
    trimmedPath,
  ]);

  // If source video is shorter than needed, loop it
  let basePath = trimmedPath;
  if (srcDuration < totalDuration) {
    const loopedPath = join(TMP_DIR, `looped-${Date.now()}.mp4`);
    const loopCount = Math.ceil(totalDuration / srcDuration);
    await ffmpeg([
      '-stream_loop', String(loopCount),
      '-i', trimmedPath,
      '-t', String(totalDuration),
      '-c', 'copy',
      '-y',
      loopedPath,
    ]);
    basePath = loopedPath;
  }

  // ── Step 2: Generate text overlay PNGs ───────────────────────────────────
  const overlayPaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const path = await generateTextOverlay(scenes[i].text, i);
    overlayPaths.push(path);
  }

  // ── Step 3: Overlay text PNGs with timing ────────────────────────────────
  const overlaidPath = join(TMP_DIR, `overlaid-${Date.now()}.mp4`);

  if (overlayPaths.length > 0) {
    // Build filter_complex for timed overlays
    const inputs = ['-i', basePath];
    for (const op of overlayPaths) {
      inputs.push('-i', op);
    }

    let filterParts = [];
    let currentLabel = '0'; // start with video stream [0]
    let timeOffset = 0;

    for (let i = 0; i < overlayPaths.length; i++) {
      const duration = scenes[i].duration || 4;
      const startT = timeOffset;
      const endT = timeOffset + duration;
      const inputIdx = i + 1; // overlay inputs start at [1]
      const outLabel = `v${i}`;

      // Scale overlay to match video size
      filterParts.push(
        `[${inputIdx}]scale=1080:1920[ovl${i}]`
      );
      filterParts.push(
        `[${currentLabel}][ovl${i}]overlay=0:0:enable='between(t,${startT},${endT})'[${outLabel}]`
      );

      currentLabel = outLabel;
      timeOffset = endT;
    }

    const filterComplex = filterParts.join(';');

    await ffmpeg([
      ...inputs,
      '-filter_complex', filterComplex,
      '-map', `[${currentLabel}]`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-t', String(totalDuration),
      '-y',
      overlaidPath,
    ]);
  } else {
    // No overlays, just copy
    await ffmpeg(['-i', basePath, '-c', 'copy', '-y', overlaidPath]);
  }

  // ── Step 4: Mix audio ────────────────────────────────────────────────────
  let withAudioPath = overlaidPath;

  if (audioPath && existsSync(audioPath)) {
    withAudioPath = join(TMP_DIR, `with-audio-${Date.now()}.mp4`);
    await ffmpeg([
      '-i', overlaidPath,
      '-i', audioPath,
      '-filter_complex', '[1:a]volume=0.15[bg];[bg]atrim=0:' + totalDuration + '[bgtr]',
      '-map', '0:v',
      '-map', '[bgtr]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-y',
      withAudioPath,
    ]);
  } else {
    // Add silent audio track (IG requires audio)
    const silentAudioPath = join(TMP_DIR, `with-audio-${Date.now()}.mp4`);
    await ffmpeg([
      '-i', overlaidPath,
      '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
      '-map', '0:v',
      '-map', '1:a',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', String(totalDuration),
      '-y',
      silentAudioPath,
    ]);
    withAudioPath = silentAudioPath;
  }

  // ── Step 5: Final encode — H.264 + AAC + movflags faststart ──────────────
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

  console.log(`[REEL/FFMPEG] Reel composed: ${outputPath}`);

  // ── Cleanup temp files ───────────────────────────────────────────────────
  const tempFiles = [trimmedPath, basePath, overlaidPath, withAudioPath, ...overlayPaths];
  for (const f of new Set(tempFiles)) {
    if (f !== outputPath && existsSync(f)) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }

  return outputPath;
}
