/**
 * Budget Jour Composer — FlashVoyage Reels v2
 *
 * Generates a 15-18s reel:
 *   - Hook (3s): drone footage + destination name + "BUDGET VOYAGE" badge
 *   - 4 category scenes (2.5s each = 10s): dark bg + progressive budget reveal
 *   - Total scene (3s): dark bg + gold total + CTA
 *
 * Audio: chill lofi at 18% volume
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate } from '../core/overlay-renderer.js';
import { prepareClip, concatClips } from '../core/clip-preparer.js';
import { fetchPexelsVideo, downloadVideo, pickMusicTrack } from '../asset-fetcher.js';
import { generateBudgetJourScript } from '../data/generators/budget-jour.js';
import { flushCosts } from '../cost-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

// ── Constants ───────────────────────────────────────────────────────────────

const HOOK_DURATION = 2;        // seconds — drone footage + title (punchy)
const CATEGORY_DURATION = 1;    // seconds per budget category (rapid fire reveal)
const TOTAL_DURATION = 2;       // seconds — total + CTA
const CATEGORY_COUNT = 4;
const REEL_DURATION = HOOK_DURATION + (CATEGORY_COUNT * CATEGORY_DURATION) + TOTAL_DURATION; // ~8s

const WIDTH = 1080;
const HEIGHT = 1920;

const DARK_BG_COLOR = '0x0a0e1a'; // Deep editorial dark blue

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
 * Generate a solid dark background clip using ffmpeg color source.
 * No Pexels video needed — pure generated dark bg.
 *
 * @param {number} duration - Duration in seconds
 * @param {string} outputPath - Where to write the clip
 * @returns {Promise<string>} outputPath
 */
async function generateDarkBgClip(duration, outputPath) {
  await ffmpeg([
    '-f', 'lavfi',
    '-i', `color=c=${DARK_BG_COLOR}:s=${WIDTH}x${HEIGHT}:d=${duration}:r=30`,
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
 * Add ASMR budget audio: coin SFX at each category reveal + lofi background.
 * Coins/typewriter trigger at the start of each category scene for a satisfying "reveal" feel.
 * @param {string} inputPath - Video without audio
 * @param {string} outputPath - Final video with audio
 * @param {number} duration - Total duration in seconds
 * @returns {Promise<string>} outputPath
 */
async function addAudioTrack(inputPath, outputPath, duration) {
  const sfxDir = join(__dirname, '..', 'audio', 'sfx');
  const coinsSfx = join(sfxDir, 'sfx-coins.mp3');
  const cashSfx = join(sfxDir, 'sfx-cash-register.mp3');
  const bgMusic = pickMusicTrack('chill') || pickMusicTrack('tropical');

  const hasSfx = existsSync(coinsSfx) && existsSync(cashSfx);

  if (hasSfx && bgMusic) {
    // Layer: bg music (low) + coin SFX at each category start + cash register at total
    const cat1Start = HOOK_DURATION;
    const cat2Start = HOOK_DURATION + CATEGORY_DURATION;
    const cat3Start = HOOK_DURATION + CATEGORY_DURATION * 2;
    const cat4Start = HOOK_DURATION + CATEGORY_DURATION * 3;
    const totalStart = HOOK_DURATION + CATEGORY_DURATION * 4;

    await ffmpeg([
      '-i', inputPath,
      '-i', bgMusic,
      '-i', coinsSfx,
      '-i', cashSfx,
      '-filter_complex',
      `[1:a]volume=0.10,atrim=0:${duration},afade=t=in:d=0.5,afade=t=out:st=${duration - 1}:d=1[bg];` +
      `[2:a]volume=0.6[coin];` +
      `[3:a]volume=0.7[cash];` +
      `[coin]asplit=4[c1][c2][c3][c4];` +
      `[c1]adelay=${Math.round(cat1Start * 1000)}|${Math.round(cat1Start * 1000)}[d1];` +
      `[c2]adelay=${Math.round(cat2Start * 1000)}|${Math.round(cat2Start * 1000)}[d2];` +
      `[c3]adelay=${Math.round(cat3Start * 1000)}|${Math.round(cat3Start * 1000)}[d3];` +
      `[c4]adelay=${Math.round(cat4Start * 1000)}|${Math.round(cat4Start * 1000)}[d4];` +
      `[cash]adelay=${Math.round(totalStart * 1000)}|${Math.round(totalStart * 1000)}[dcash];` +
      `[bg][d1][d2][d3][d4][dcash]amix=inputs=6:duration=first:dropout_transition=0[aud]`,
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
  } else if (bgMusic) {
    await ffmpeg([
      '-i', inputPath,
      '-i', bgMusic,
      '-filter_complex', `[1:a]volume=0.15,atrim=0:${duration},afade=t=in:d=0.5,afade=t=out:st=${duration - 1}:d=1[aud]`,
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
    // Silent fallback
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

/**
 * Build the card overlay template replacements for a progressive reveal scene.
 *
 * @param {Object} script - Budget jour script
 * @param {number} revealUpTo - How many categories to show (1-4)
 * @param {boolean} showTotal - Whether to show total row + divider
 * @returns {Object} Replacements map for renderTemplate
 */
function buildCardReplacements(script, revealUpTo, showTotal = false) {
  const HIDDEN = 'display:none';
  const VISIBLE = '';

  const replacements = {
    '{{CARD_TITLE}}': script.destination,
    '{{DURATION_BADGE}}': script.durationLabel || 'PAR JOUR',
    '{{TOTAL_PRICE}}': script.totalPrice,
  };

  // Fill all 4 category lines
  for (let i = 0; i < CATEGORY_COUNT; i++) {
    const cat = script.categories[i];
    const lineNum = i + 1;
    const isVisible = i < revealUpTo;

    replacements[`{{LINE_${lineNum}_EMOJI}}`] = cat.emoji;
    replacements[`{{LINE_${lineNum}_LABEL}}`] = cat.label;
    replacements[`{{LINE_${lineNum}_PRICE}}`] = cat.price;
    replacements[`{{LINE_${lineNum}_STYLE}}`] = isVisible ? VISIBLE : HIDDEN;
  }

  // Total row + divider visibility
  replacements['{{DIVIDER_STYLE}}'] = showTotal ? VISIBLE : HIDDEN;
  replacements['{{TOTAL_STYLE}}'] = showTotal ? VISIBLE : HIDDEN;

  return replacements;
}

// ── Main composer ───────────────────────────────────────────────────────────

/**
 * Compose a Budget Jour Reel from a generated script.
 *
 * @param {Object} script - From budget-jour generator:
 *   { destination, durationLabel, pexelsQuery, categories: [{emoji, label, price}],
 *     totalPrice, caption, hashtags }
 * @param {Object} opts
 * @param {string} [opts.outputPath] - Where to write the final MP4
 * @returns {Promise<string>} Path to the final MP4
 */
export async function composeBudgetJourReel(script, opts = {}) {
  const ts = Date.now();
  const outputPath = opts.outputPath || join(TMP_DIR, `budget-jour-final-${ts}.mp4`);
  ensureTmpDir();

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const tempFiles = [];

  try {
    // ── 1. Fetch drone footage for hook scene ───────────────────────────────
    const pexelsQuery = script.pexelsQuery || `${script.destination} drone aerial travel`;
    console.log(`[REEL/BUDGET] Fetching Pexels drone footage: "${pexelsQuery}"`);

    const videoUrl = await fetchPexelsVideo(pexelsQuery, 'portrait');
    let hookClipRaw = null;

    if (videoUrl) {
      hookClipRaw = join(TMP_DIR, `budget-hook-raw-${ts}.mp4`);
      await downloadVideo(videoUrl, hookClipRaw);
      tempFiles.push(hookClipRaw);
      console.log(`[REEL/BUDGET] Hook footage downloaded`);
    } else {
      // Fallback: try generic travel query
      console.warn(`[REEL/BUDGET] No footage for "${pexelsQuery}", trying fallback...`);
      const fallbackUrl = await fetchPexelsVideo('travel aerial landscape drone', 'portrait');
      if (fallbackUrl) {
        hookClipRaw = join(TMP_DIR, `budget-hook-raw-${ts}.mp4`);
        await downloadVideo(fallbackUrl, hookClipRaw);
        tempFiles.push(hookClipRaw);
        console.log(`[REEL/BUDGET] Hook footage downloaded (fallback)`);
      }
    }

    // ── 2. Render hook title overlay ────────────────────────────────────────
    const hookOverlayPath = join(TMP_DIR, `budget-hook-overlay-${ts}.png`);
    await renderTemplate('budget-jour-title-overlay.html', {
      '{{DESTINATION}}': script.destination,
      '{{DURATION_LABEL}}': script.durationLabel || 'PAR JOUR',
    }, hookOverlayPath);
    tempFiles.push(hookOverlayPath);
    console.log(`[REEL/BUDGET] Hook overlay rendered`);

    // ── 3. Render 4 progressive card overlays ───────────────────────────────
    const cardOverlayPaths = [];
    for (let i = 0; i < CATEGORY_COUNT; i++) {
      const overlayPath = join(TMP_DIR, `budget-card-overlay-${i}-${ts}.png`);
      const replacements = buildCardReplacements(script, i + 1, false);
      await renderTemplate('budget-jour-card-overlay.html', replacements, overlayPath);
      cardOverlayPaths.push(overlayPath);
      tempFiles.push(overlayPath);
    }
    console.log(`[REEL/BUDGET] ${cardOverlayPaths.length} progressive card overlays rendered`);

    // ── 4. Render total scene overlay ───────────────────────────────────────
    const totalOverlayPath = join(TMP_DIR, `budget-total-overlay-${ts}.png`);
    const totalReplacements = buildCardReplacements(script, CATEGORY_COUNT, true);
    await renderTemplate('budget-jour-card-overlay.html', totalReplacements, totalOverlayPath);
    tempFiles.push(totalOverlayPath);
    console.log(`[REEL/BUDGET] Total overlay rendered`);

    // ── 5. Compose each scene ───────────────────────────────────────────────
    const composedScenes = [];

    // 5a. Hook scene (3s) — drone footage + title overlay
    if (hookClipRaw) {
      const hookPrepared = join(TMP_DIR, `budget-hook-prep-${ts}.mp4`);
      await prepareClip(hookClipRaw, hookPrepared, { duration: HOOK_DURATION });
      tempFiles.push(hookPrepared);

      const hookComposed = join(TMP_DIR, `budget-hook-comp-${ts}.mp4`);
      await overlayPngOnClip(hookPrepared, hookOverlayPath, HOOK_DURATION, hookComposed);
      tempFiles.push(hookComposed);
      composedScenes.push(hookComposed);
      console.log(`[REEL/BUDGET] Hook scene composed (${HOOK_DURATION}s)`);
    } else {
      // No drone footage available — use dark bg as fallback for hook
      console.warn(`[REEL/BUDGET] No drone footage, using dark bg for hook`);
      const hookBg = join(TMP_DIR, `budget-hook-bg-${ts}.mp4`);
      await generateDarkBgClip(HOOK_DURATION, hookBg);
      tempFiles.push(hookBg);

      const hookComposed = join(TMP_DIR, `budget-hook-comp-${ts}.mp4`);
      await overlayPngOnClip(hookBg, hookOverlayPath, HOOK_DURATION, hookComposed);
      tempFiles.push(hookComposed);
      composedScenes.push(hookComposed);
      console.log(`[REEL/BUDGET] Hook scene composed with dark bg fallback (${HOOK_DURATION}s)`);
    }

    // 5b. Category scenes (2.5s each) — dark bg + progressive card overlays
    for (let i = 0; i < CATEGORY_COUNT; i++) {
      const darkBgPath = join(TMP_DIR, `budget-dark-bg-${i}-${ts}.mp4`);
      await generateDarkBgClip(CATEGORY_DURATION, darkBgPath);
      tempFiles.push(darkBgPath);

      const catComposed = join(TMP_DIR, `budget-cat-comp-${i}-${ts}.mp4`);
      await overlayPngOnClip(darkBgPath, cardOverlayPaths[i], CATEGORY_DURATION, catComposed);
      tempFiles.push(catComposed);
      composedScenes.push(catComposed);
      console.log(`[REEL/BUDGET] Category ${i + 1}/4 composed: "${script.categories[i].label}" — ${script.categories[i].price} (${CATEGORY_DURATION}s)`);
    }

    // 5c. Total scene (3s) — dark bg + total card overlay
    const totalBgPath = join(TMP_DIR, `budget-total-bg-${ts}.mp4`);
    await generateDarkBgClip(TOTAL_DURATION, totalBgPath);
    tempFiles.push(totalBgPath);

    const totalComposed = join(TMP_DIR, `budget-total-comp-${ts}.mp4`);
    await overlayPngOnClip(totalBgPath, totalOverlayPath, TOTAL_DURATION, totalComposed);
    tempFiles.push(totalComposed);
    composedScenes.push(totalComposed);
    console.log(`[REEL/BUDGET] Total scene composed: ${script.totalPrice} (${TOTAL_DURATION}s)`);

    if (composedScenes.length === 0) {
      throw new Error('[REEL/BUDGET] No scenes were composed — cannot produce reel');
    }

    // ── 6. Concatenate all scenes ───────────────────────────────────────────
    const concattedPath = join(TMP_DIR, `budget-concat-${ts}.mp4`);
    await concatClips(composedScenes, concattedPath);
    tempFiles.push(concattedPath);
    console.log(`[REEL/BUDGET] ${composedScenes.length} scenes concatenated`);

    // ── 7. Add audio (chill lofi) + final encode ────────────────────────────
    const actualDuration = HOOK_DURATION + (composedScenes.length - 2) * CATEGORY_DURATION + TOTAL_DURATION;
    const beforeCtaPath = join(TMP_DIR, `budget-before-cta-${ts}.mp4`);
    await addAudioTrack(concattedPath, beforeCtaPath, actualDuration);
    tempFiles.push(beforeCtaPath);

    // ── 8. Append global save CTA (+2.5s) to boost IG save rate ────────────
    const { appendSaveCtaScene } = await import('../core/save-cta.js');
    await appendSaveCtaScene(beforeCtaPath, outputPath);

    console.log(`[REEL/BUDGET] Budget Jour reel complete: ${outputPath} (~${actualDuration + 2.5}s, ${composedScenes.length} scenes + save CTA)`);
    return outputPath;

  } finally {
    // ── Cleanup temp files ────────────────────────────────────────────────
    console.log(`[REEL/BUDGET] Cleaning up ${tempFiles.length} temp files...`);
    for (const f of new Set(tempFiles)) {
      if (f && f !== outputPath && existsSync(f)) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
    }
  }
}

// ── Convenience: generate from article ──────────────────────────────────────

/**
 * Generate a Budget Jour reel end-to-end from an article object.
 *
 * 1. Generates the script via Claude Haiku (budget-jour generator)
 * 2. Composes the reel via composeBudgetJourReel
 *
 * @param {Object} article - Article data { title, hook, rawText, ... }
 * @param {Object} opts
 * @param {string} [opts.outputPath] - Where to write the final MP4
 * @returns {Promise<{ videoPath: string, script: Object }>}
 */
export async function generateBudgetJourReelFromArticle(article, opts = {}) {
  console.log(`[REEL/BUDGET] Generating Budget Jour reel from article: "${(article.title || '').slice(0, 60)}..."`);

  // 1. Generate script via Haiku
  const script = await generateBudgetJourScript(article);
  console.log(`[REEL/BUDGET] Script ready: "${script.destination}" — ${script.categories.length} categories, total ${script.totalPrice}`);

  // 2. Compose the reel
  const videoPath = await composeBudgetJourReel(script, opts);

  console.log(`[REEL/BUDGET] Budget Jour reel generated: ${videoPath}`);

  flushCosts({ format: 'budget-jour', destination: script.destination || 'unknown' });

  return { videoPath, script };
}
