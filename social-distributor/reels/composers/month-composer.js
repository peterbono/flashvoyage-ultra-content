/**
 * Month Composer — FlashVoyage Reels v2
 *
 * Generates a ~10s reel: "OÙ PARTIR EN [MOIS]"
 *   - Scene 1 (2s): Hook — "OÙ PARTIR EN [MOIS]" over stunning aerial clip
 *   - Scenes 2-6 (1.3s each = 6.5s): 5 destination clips with location labels
 *   - Scene 7 (1.5s): CTA — "ENREGISTRE POUR [MOIS]" on blurred bg
 *
 * Total: ~10s
 *
 * Audio: tropical music at 18% volume with fade in/out.
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate, renderOverlay } from '../core/overlay-renderer.js';
import { prepareClip, concatClips } from '../core/clip-preparer.js';
import { fetchPexelsVideoBatch } from '../listicle-asset-fetcher.js';
import { pickMusicTrack } from '../asset-fetcher.js';
import { generateMonthScript } from '../data/generators/month-destinations.js';
import { flushCosts } from '../cost-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

// ── Constants ───────────────────────────────────────────────────────────────

const HOOK_DURATION = 2;            // seconds
const DESTINATION_DURATION = 1.3;   // seconds per destination
const CTA_DURATION = 1.5;           // seconds
const DESTINATION_COUNT = 5;
const TOTAL_DURATION = HOOK_DURATION + (DESTINATION_COUNT * DESTINATION_DURATION) + CTA_DURATION; // ~10s

const WIDTH = 1080;
const HEIGHT = 1920;

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Overlay a PNG onto a video clip.
 * @param {string} clipPath - Prepared video clip
 * @param {string} overlayPath - Transparent PNG overlay
 * @param {number} duration - Scene duration in seconds
 * @param {string} outputPath - Where to write the composited clip
 * @returns {Promise<string>} outputPath
 */
async function overlayPngOnClip(clipPath, overlayPath, duration, outputPath) {
  await ffmpeg([
    '-i', clipPath,
    '-i', overlayPath,
    '-filter_complex', `[1]scale=${WIDTH}:${HEIGHT}[ovl];[0][ovl]overlay=0:0`,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y',
    outputPath,
  ]);
  return outputPath;
}

/**
 * Prepare a blurred + darkened CTA background clip from a source clip.
 * @param {string} inputPath - Source clip (raw Pexels download)
 * @param {string} outputPath - Where to write the blurred clip
 * @returns {Promise<string>} outputPath
 */
async function prepareCtaBackground(inputPath, outputPath) {
  await ffmpeg([
    '-i', inputPath,
    '-vf', `crop=ih*${WIDTH}/${HEIGHT}:ih,scale=${WIDTH}:${HEIGHT},boxblur=20:20,eq=brightness=-0.3`,
    '-t', String(CTA_DURATION),
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y',
    outputPath,
  ]);
  return outputPath;
}

/**
 * Build inline CTA overlay HTML (no template file needed).
 * @param {string} month - Month name uppercase (e.g. "AVRIL")
 * @returns {string} Full HTML string
 */
function buildCtaOverlayHtml(month) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px;
    height: 1920px;
    overflow: hidden;
    font-family: 'Montserrat', sans-serif;
    background: transparent;
  }
  .container {
    position: relative;
    width: 1080px;
    height: 1920px;
  }
  .dark-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.80);
    z-index: 1;
  }
  .content-zone {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 100px;
    text-align: center;
    z-index: 2;
  }
  .cta-text {
    font-size: 44px;
    font-weight: 800;
    color: #FFFFFF;
    text-transform: uppercase;
    line-height: 1.2;
    letter-spacing: 1px;
    text-shadow:
      2px 2px 0 rgba(0, 0, 0, 0.5),
      0 3px 8px rgba(0, 0, 0, 0.6);
    margin-bottom: 15px;
  }
  .cta-month {
    color: #FFD700;
  }
  .gold-underline {
    width: 300px;
    height: 5px;
    background: #FFD700;
    border-radius: 3px;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
    margin-bottom: 20px;
  }
  .brand-url {
    font-size: 24px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.5px;
  }
</style>
</head>
<body>
<div class="container">
  <div class="dark-overlay"></div>
  <div class="content-zone">
    <div class="cta-text">ENREGISTRE POUR <span class="cta-month">${month}</span></div>
    <div class="gold-underline"></div>
    <div class="brand-url">flashvoyage.com</div>
  </div>
</div>
</body>
</html>`;
}

/**
 * Add audio track (music or silent fallback) to a video.
 * @param {string} inputPath - Video without audio
 * @param {string} outputPath - Final video with audio
 * @param {number} duration - Total duration in seconds
 * @returns {Promise<string>} outputPath
 */
async function addAudioTrack(inputPath, outputPath, duration, destination = null) {
  // FV-FIX 2026-04-13: ASMR-first for month-destination reels (seasonal guides).
  // Informational format — ambient sound > upbeat. Fallback: asmr → tropical → chill.
  // Destination: month reels list 5 destinations — no single topic destination,
  // so callers typically pass null. The function accepts it for symmetry /
  // future single-destination variants.
  const audioPath = pickMusicTrack('asmr', { destination }) || pickMusicTrack('tropical') || pickMusicTrack('chill');

  if (audioPath) {
    await ffmpeg([
      '-i', inputPath,
      '-i', audioPath,
      '-filter_complex', `[1:a]volume=0.18,atrim=0:${duration},afade=t=in:d=0.5,afade=t=out:st=${duration - 1.5}:d=1.5[aud]`,
      '-map', '0:v',
      '-map', '[aud]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', String(duration),
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);
  } else {
    // Silent stereo fallback (Instagram requires an audio stream)
    await ffmpeg([
      '-i', inputPath,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-map', '0:v',
      '-map', '1:a',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', String(duration),
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);
  }
  return outputPath;
}

// ── Main composer ───────────────────────────────────────────────────────────

/**
 * Compose an "Où Partir En [Mois]" Reel from a generated script.
 *
 * @param {Object} script - From month-destinations generator:
 *   { month, monthShort, destinations: [{name, country, reason, pexelsQuery}], caption, hashtags }
 * @param {Object} opts
 * @param {string} opts.outputPath - Where to write the final MP4
 * @returns {Promise<string>} Path to the final MP4
 */
export async function composeMonthReel(script, opts = {}) {
  const ts = Date.now();
  const outputPath = opts.outputPath || join(TMP_DIR, `month-final-${ts}.mp4`);
  ensureTmpDir();

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const tempFiles = [];

  try {
    // ── 1. Build Pexels queries ─────────────────────────────────────────────
    const hookQuery = 'tropical paradise aerial drone turquoise ocean stunning sunset';
    const destQueries = script.destinations.map(d => d.pexelsQuery);
    const allQueries = [hookQuery, ...destQueries]; // 6 total: 1 hook + 5 destinations

    const durations = [
      HOOK_DURATION,
      ...Array(DESTINATION_COUNT).fill(DESTINATION_DURATION),
    ];

    console.log(`[REEL/MONTH] Fetching ${allQueries.length} Pexels clips for "${script.month}"...`);

    // ── 2. Fetch video clips from Pexels ────────────────────────────────────
    const fetchResults = await fetchPexelsVideoBatch(allQueries, {
      outputDir: TMP_DIR,
      durations,
    });

    // Track downloaded files for cleanup
    for (const r of fetchResults) {
      if (r?.path) tempFiles.push(r.path);
    }

    // Validate we have enough clips
    const validClips = fetchResults.filter(Boolean);
    if (validClips.length < 2) {
      throw new Error(`[REEL/MONTH] Only ${validClips.length} clips fetched — need at least 2. Aborting.`);
    }

    console.log(`[REEL/MONTH] ${validClips.length}/${allQueries.length} clips fetched successfully`);

    // ── 3. Render overlay PNGs ──────────────────────────────────────────────

    // 3a. Hook overlay
    const hookOverlayPath = join(TMP_DIR, `month-hook-overlay-${ts}.png`);
    await renderTemplate('month-hook-overlay.html', {
      '{{MONTH_NAME}}': script.month,
    }, hookOverlayPath);
    tempFiles.push(hookOverlayPath);
    console.log(`[REEL/MONTH] Hook overlay rendered`);

    // 3b. Destination overlays (5) — hard truncate to prevent text overflow
    const MAX_LOCATION = 25;
    const MAX_REASON = 50;
    const DANGLING = /\s+(?:en|de|du|d|à|au|aux|le|la|les|un|une|des|pour|par|sans|sur|avec|et|ou|qui|que|ne|se|ce)\s*$/i;
    const truncate = (s, max) => {
      if (!s || s.length <= max) return s;
      let t = s.slice(0, max).replace(/\s+\S*$/, ''); // cut at word boundary
      t = t.replace(DANGLING, '');                      // drop trailing preposition/article
      return t || s.slice(0, max);                      // fallback: hard cut
    };

    const destOverlayPaths = [];
    for (let i = 0; i < DESTINATION_COUNT; i++) {
      const dest = script.destinations[i];
      const overlayPath = join(TMP_DIR, `month-dest-overlay-${i}-${ts}.png`);
      await renderTemplate('month-destination-overlay.html', {
        '{{RANK}}': String(i + 1),
        '{{MONTH_SHORT}}': script.monthShort,
        '{{LOCATION}}': truncate(dest.name, MAX_LOCATION),
        '{{REASON}}': truncate(dest.reason, MAX_REASON),
      }, overlayPath);
      destOverlayPaths.push(overlayPath);
      tempFiles.push(overlayPath);
    }
    console.log(`[REEL/MONTH] ${destOverlayPaths.length} destination overlays rendered`);

    // 3c. CTA overlay (inline HTML, no template file)
    const ctaOverlayPath = join(TMP_DIR, `month-cta-overlay-${ts}.png`);
    const ctaHtml = buildCtaOverlayHtml(script.month);
    await renderOverlay(ctaHtml, ctaOverlayPath);
    tempFiles.push(ctaOverlayPath);
    console.log(`[REEL/MONTH] CTA overlay rendered`);

    // ── 4. Prepare and overlay each scene ───────────────────────────────────
    const composedScenes = [];

    // 4a. Hook scene (2s)
    const hookClipRaw = fetchResults[0]?.path;
    if (hookClipRaw) {
      const hookPrepared = join(TMP_DIR, `month-hook-prep-${ts}.mp4`);
      await prepareClip(hookClipRaw, hookPrepared, { duration: HOOK_DURATION });
      tempFiles.push(hookPrepared);

      const hookComposed = join(TMP_DIR, `month-hook-comp-${ts}.mp4`);
      await overlayPngOnClip(hookPrepared, hookOverlayPath, HOOK_DURATION, hookComposed);
      tempFiles.push(hookComposed);
      composedScenes.push(hookComposed);
      console.log(`[REEL/MONTH] Hook scene composed (${HOOK_DURATION}s)`);
    }

    // 4b. Destination scenes (1.3s each)
    for (let i = 0; i < DESTINATION_COUNT; i++) {
      const clipResult = fetchResults[i + 1]; // offset by 1 (hook is index 0)
      // Fallback to hook clip if a specific destination clip failed
      const clipPath = clipResult?.path || hookClipRaw;

      if (!clipPath) {
        console.warn(`[REEL/MONTH] No clip for destination ${i + 1}, skipping`);
        continue;
      }

      const destPrepared = join(TMP_DIR, `month-dest-prep-${i}-${ts}.mp4`);
      await prepareClip(clipPath, destPrepared, { duration: DESTINATION_DURATION });
      tempFiles.push(destPrepared);

      const destComposed = join(TMP_DIR, `month-dest-comp-${i}-${ts}.mp4`);
      await overlayPngOnClip(destPrepared, destOverlayPaths[i], DESTINATION_DURATION, destComposed);
      tempFiles.push(destComposed);
      composedScenes.push(destComposed);
      console.log(`[REEL/MONTH] Destination ${i + 1}/5 composed: "${script.destinations[i].name}" (${DESTINATION_DURATION}s)`);
    }

    // 4c. CTA scene (1.5s) — blurred first clip
    const ctaSourcePath = hookClipRaw || fetchResults.find(r => r?.path)?.path;
    if (ctaSourcePath) {
      const ctaBg = join(TMP_DIR, `month-cta-bg-${ts}.mp4`);
      await prepareCtaBackground(ctaSourcePath, ctaBg);
      tempFiles.push(ctaBg);

      const ctaComposed = join(TMP_DIR, `month-cta-comp-${ts}.mp4`);
      await overlayPngOnClip(ctaBg, ctaOverlayPath, CTA_DURATION, ctaComposed);
      tempFiles.push(ctaComposed);
      composedScenes.push(ctaComposed);
      console.log(`[REEL/MONTH] CTA scene composed (${CTA_DURATION}s)`);
    }

    if (composedScenes.length === 0) {
      throw new Error('[REEL/MONTH] No scenes were composed — cannot produce reel');
    }

    // ── 5. Concatenate all scenes ───────────────────────────────────────────
    const concattedPath = join(TMP_DIR, `month-concat-${ts}.mp4`);
    await concatClips(composedScenes, concattedPath);
    tempFiles.push(concattedPath);
    console.log(`[REEL/MONTH] ${composedScenes.length} scenes concatenated`);

    // ── 6. Add audio track ──────────────────────────────────────────────────
    const actualDuration = composedScenes.length <= DESTINATION_COUNT
      ? composedScenes.length * DESTINATION_DURATION
      : TOTAL_DURATION;

    const beforeCtaPath = join(TMP_DIR, `month-before-cta-${ts}.mp4`);
    // TODO: month reels cover 5 destinations — no single topic. We pass null so
    // the picker uses the full generic ASMR pool. If the format ever becomes
    // single-destination, pass script.destinations[0]?.country here.
    await addAudioTrack(concattedPath, beforeCtaPath, actualDuration, null);
    tempFiles.push(beforeCtaPath);

    // ── 7. Append global save CTA (+2.5s) to boost IG save rate ────────────
    const { appendSaveCtaScene } = await import('../core/save-cta.js');
    await appendSaveCtaScene(beforeCtaPath, outputPath);

    console.log(`[REEL/MONTH] Month reel complete: ${outputPath} (~${actualDuration + 2.5}s, ${composedScenes.length} scenes + save CTA)`);
    return outputPath;

  } finally {
    // ── Cleanup temp files ────────────────────────────────────────────────
    console.log(`[REEL/MONTH] Cleaning up ${tempFiles.length} temp files...`);
    for (const f of new Set(tempFiles)) {
      if (f && f !== outputPath && existsSync(f)) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
    }
  }
}

// ── Convenience: generate from article ──────────────────────────────────────

/**
 * Generate an "Où Partir En [Mois]" reel end-to-end.
 * Ignores the article parameter — uses current/next month from static data.
 *
 * @param {Object} article - Article data (ignored — month is auto-detected)
 * @param {Object} opts
 * @param {string} [opts.outputPath] - Where to write the final MP4
 * @param {string} [opts.month] - Override month name (French lowercase, e.g. 'avril')
 * @returns {Promise<{ videoPath: string, script: Object }>}
 */
export async function generateMonthReelFromArticle(article, opts = {}) {
  const monthOverride = opts.month || null;

  console.log(`[REEL/MONTH] Generating Month reel (month: ${monthOverride || 'auto-detect'})...`);

  // 1. Generate script from static data + Haiku reasons
  const script = await generateMonthScript(monthOverride);
  console.log(`[REEL/MONTH] Script ready: "${script.month}" — ${script.destinations.length} destinations`);

  // 2. Compose the reel
  const videoPath = await composeMonthReel(script, opts);

  console.log(`[REEL/MONTH] Month reel generated: ${videoPath}`);

  flushCosts({ format: 'month-destinations', destination: script.month || 'unknown' });

  return { videoPath, script };
}
