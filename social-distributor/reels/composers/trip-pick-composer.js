/**
 * Trip Pick Composer — FlashVoyage Reels v2
 *
 * Generates a ~10.5s reel:
 *   - Title card (2s): country name + "5 SPOTS A NE PAS RATER" over aerial footage
 *   - 5 location clips (1.5s each = 7.5s): rank number + location name/detail
 *   - CTA card (1s): "ENREGISTRE CE REEL" over blurred first clip
 *
 * Silent audio track (Instagram requires an audio stream).
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate } from '../core/overlay-renderer.js';
import { prepareClip, concatClips } from '../core/clip-preparer.js';
import { fetchPexelsVideoBatch } from '../listicle-asset-fetcher.js';
import { pickMusicTrack } from '../asset-fetcher.js';
import { generateTripPickScript } from '../data/generators/trip-pick.js';
import { flushCosts } from '../cost-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

// ── Constants ───────────────────────────────────────────────────────────────

const TITLE_DURATION = 2;       // seconds
const LOCATION_DURATION = 1.5;  // seconds per spot
const CTA_DURATION = 1;         // seconds
const LOCATION_COUNT = 5;
const TOTAL_DURATION = TITLE_DURATION + (LOCATION_COUNT * LOCATION_DURATION) + CTA_DURATION; // ~10.5s

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
 * Add audio track (music or silent fallback) to a video.
 * @param {string} inputPath - Video without audio
 * @param {string} outputPath - Final video with audio
 * @param {number} duration - Total duration in seconds
 * @returns {Promise<string>} outputPath
 */
async function addAudioTrack(inputPath, outputPath, duration, destination = null) {
  // FV-FIX 2026-04-13: ASMR-first for trip-pick (5 spots / top destinations).
  // Viewer scans locations — ambient sound carries the travel mood without
  // competing. Fallback: asmr → chill → tropical.
  // Destination-aware: script.country is the single country the 5 spots belong to.
  const audioPath = pickMusicTrack('asmr', { destination }) || pickMusicTrack('chill') || pickMusicTrack('tropical');

  if (audioPath) {
    await ffmpeg([
      '-i', inputPath,
      '-i', audioPath,
      '-filter_complex', `[1:a]volume=0.18,atrim=0:${duration},afade=t=in:d=0.5,afade=t=out:st=${duration - 1}:d=1[aud]`,
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
 * Compose a Trip Pick Reel from a generated script.
 *
 * @param {Object} script - From trip-pick generator:
 *   { country: string, spots: [{name, detail, pexelsQuery}], caption: string, hashtags: string[] }
 * @param {Object} opts
 * @param {string} opts.outputPath - Where to write the final MP4
 * @returns {Promise<string>} Path to the final MP4
 */
export async function composeTripPickReel(script, opts = {}) {
  const ts = Date.now();
  const outputPath = opts.outputPath || join(TMP_DIR, `trip-pick-final-${ts}.mp4`);
  ensureTmpDir();

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const tempFiles = [];

  try {
    // ── 1. Build Pexels queries ─────────────────────────────────────────────
    const titleQuery = `${script.country} travel aerial`;
    const spotQueries = script.spots.map(s => s.pexelsQuery);
    const allQueries = [titleQuery, ...spotQueries]; // 6 total: 1 title + 5 locations

    const durations = [
      TITLE_DURATION,
      ...Array(LOCATION_COUNT).fill(LOCATION_DURATION),
    ];

    console.log(`[REEL/PICK] Fetching ${allQueries.length} Pexels clips for "${script.country}"...`);

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
      throw new Error(`[REEL/PICK] Only ${validClips.length} clips fetched — need at least 2. Aborting.`);
    }

    console.log(`[REEL/PICK] ${validClips.length}/${allQueries.length} clips fetched successfully`);

    // ── 3. Render overlay PNGs ──────────────────────────────────────────────

    // 3a. Title overlay
    const titleOverlayPath = join(TMP_DIR, `pick-title-overlay-${ts}.png`);
    // Use sub-format caption for subtitle (e.g. "5 astuces budget" instead of always "5 spots à ne pas rater")
    const subtitle = (script.subtitle || `${script.spots.length} spots à ne pas rater`).toUpperCase();
    await renderTemplate('trip-pick-title-overlay.html', {
      '{{COUNTRY_NAME}}': script.country,
      '{{COUNT}}': String(script.spots.length),
      '{{SUBTITLE}}': subtitle,
    }, titleOverlayPath);
    tempFiles.push(titleOverlayPath);
    console.log(`[REEL/PICK] Title overlay rendered`);

    // 3b. Location overlays (5 spots) — hard truncate to prevent text overflow
    const MAX_NAME = 30;
    const MAX_DETAIL = 50;
    const DANGLING = /\s+(?:en|de|du|d|à|au|aux|le|la|les|un|une|des|pour|par|sans|sur|avec|et|ou|qui|que|ne|se|ce)\s*$/i;
    const truncate = (s, max) => {
      if (!s || s.length <= max) return s;
      let t = s.slice(0, max).replace(/\s+\S*$/, ''); // cut at word boundary
      t = t.replace(DANGLING, '');                      // drop trailing preposition/article
      return t;
    };

    const locationOverlayPaths = [];
    for (let i = 0; i < LOCATION_COUNT; i++) {
      const spot = script.spots[i];
      const name = truncate(spot.name, MAX_NAME) || spot.name.slice(0, MAX_NAME);
      const detail = truncate(spot.detail, MAX_DETAIL) || spot.detail.slice(0, MAX_DETAIL);
      const overlayPath = join(TMP_DIR, `pick-loc-overlay-${i}-${ts}.png`);
      await renderTemplate('trip-pick-location-overlay.html', {
        '{{RANK_NUMBER}}': String(i + 1),
        '{{LOCATION_NAME}}': name,
        '{{LOCATION_DETAIL}}': detail,
      }, overlayPath);
      locationOverlayPaths.push(overlayPath);
      tempFiles.push(overlayPath);
    }
    console.log(`[REEL/PICK] ${locationOverlayPaths.length} location overlays rendered`);

    // 3c. CTA overlay
    const ctaOverlayPath = join(TMP_DIR, `pick-cta-overlay-${ts}.png`);
    await renderTemplate('trip-pick-cta-overlay.html', {}, ctaOverlayPath);
    tempFiles.push(ctaOverlayPath);
    console.log(`[REEL/PICK] CTA overlay rendered`);

    // ── 4. Prepare and overlay each scene ───────────────────────────────────
    const composedScenes = [];

    // 4a. Title scene (2s)
    const titleClipRaw = fetchResults[0]?.path;
    if (titleClipRaw) {
      const titlePrepared = join(TMP_DIR, `pick-title-prep-${ts}.mp4`);
      await prepareClip(titleClipRaw, titlePrepared, { duration: TITLE_DURATION });
      tempFiles.push(titlePrepared);

      const titleComposed = join(TMP_DIR, `pick-title-comp-${ts}.mp4`);
      await overlayPngOnClip(titlePrepared, titleOverlayPath, TITLE_DURATION, titleComposed);
      tempFiles.push(titleComposed);
      composedScenes.push(titleComposed);
      console.log(`[REEL/PICK] Title scene composed (${TITLE_DURATION}s)`);
    }

    // 4b. Location scenes (1.5s each)
    for (let i = 0; i < LOCATION_COUNT; i++) {
      const clipResult = fetchResults[i + 1]; // offset by 1 (title is index 0)
      // Fallback to title clip if a specific location clip failed
      const clipPath = clipResult?.path || titleClipRaw;

      if (!clipPath) {
        console.warn(`[REEL/PICK] No clip for location ${i + 1}, skipping`);
        continue;
      }

      const locPrepared = join(TMP_DIR, `pick-loc-prep-${i}-${ts}.mp4`);
      await prepareClip(clipPath, locPrepared, { duration: LOCATION_DURATION });
      tempFiles.push(locPrepared);

      const locComposed = join(TMP_DIR, `pick-loc-comp-${i}-${ts}.mp4`);
      await overlayPngOnClip(locPrepared, locationOverlayPaths[i], LOCATION_DURATION, locComposed);
      tempFiles.push(locComposed);
      composedScenes.push(locComposed);
      console.log(`[REEL/PICK] Location ${i + 1}/5 composed: "${script.spots[i].name}" (${LOCATION_DURATION}s)`);
    }

    // 4c. CTA scene (1s) — blurred first clip
    const ctaSourcePath = titleClipRaw || fetchResults.find(r => r?.path)?.path;
    if (ctaSourcePath) {
      const ctaBg = join(TMP_DIR, `pick-cta-bg-${ts}.mp4`);
      await prepareCtaBackground(ctaSourcePath, ctaBg);
      tempFiles.push(ctaBg);

      const ctaComposed = join(TMP_DIR, `pick-cta-comp-${ts}.mp4`);
      await overlayPngOnClip(ctaBg, ctaOverlayPath, CTA_DURATION, ctaComposed);
      tempFiles.push(ctaComposed);
      composedScenes.push(ctaComposed);
      console.log(`[REEL/PICK] CTA scene composed (${CTA_DURATION}s)`);
    }

    if (composedScenes.length === 0) {
      throw new Error('[REEL/PICK] No scenes were composed — cannot produce reel');
    }

    // ── 5. Concatenate all scenes ───────────────────────────────────────────
    const concattedPath = join(TMP_DIR, `pick-concat-${ts}.mp4`);
    await concatClips(composedScenes, concattedPath);
    tempFiles.push(concattedPath);
    console.log(`[REEL/PICK] ${composedScenes.length} scenes concatenated`);

    // ── 6. Add silent audio + final encode ──────────────────────────────────
    const actualDuration = composedScenes.length <= LOCATION_COUNT
      ? composedScenes.length * LOCATION_DURATION
      : TOTAL_DURATION;

    const beforeCtaPath = join(TMP_DIR, `pick-before-cta-${ts}.mp4`);
    // script.country = the single country the 5 spots are located in
    await addAudioTrack(concattedPath, beforeCtaPath, actualDuration, script.country || null);
    tempFiles.push(beforeCtaPath);

    // ── 7. Append global save CTA (+2.5s) to boost IG save rate ────────────
    const { appendSaveCtaScene } = await import('../core/save-cta.js');
    await appendSaveCtaScene(beforeCtaPath, outputPath, { variant: 'share' });

    console.log(`[REEL/PICK] Trip Pick reel complete: ${outputPath} (~${actualDuration + 2.5}s, ${composedScenes.length} scenes + save CTA)`);
    return outputPath;

  } finally {
    // ── Cleanup temp files ────────────────────────────────────────────────
    console.log(`[REEL/PICK] Cleaning up ${tempFiles.length} temp files...`);
    for (const f of new Set(tempFiles)) {
      if (f && f !== outputPath && existsSync(f)) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
    }
  }
}

// ── Convenience: generate from article ──────────────────────────────────────

/**
 * Generate a Trip Pick reel end-to-end from an article object.
 *
 * 1. Generates the script via Claude Haiku (trip-pick generator)
 * 2. Composes the reel via composeTripPickReel
 *
 * @param {Object} article - Article data { title, hook, rawText, ... }
 * @param {Object} opts
 * @param {string} [opts.outputPath] - Where to write the final MP4
 * @returns {Promise<{ videoPath: string, script: Object }>}
 */
export async function generateTripPickReelFromArticle(article, opts = {}) {
  console.log(`[REEL/PICK] Generating Trip Pick reel from article: "${(article.title || '').slice(0, 60)}..."`);

  // 1. Generate script via Haiku
  const script = await generateTripPickScript(article);
  console.log(`[REEL/PICK] Script ready: "${script.country}" — ${script.spots.length} spots`);

  // 2. Compose the reel
  const videoPath = await composeTripPickReel(script, opts);

  console.log(`[REEL/PICK] Trip Pick reel generated: ${videoPath}`);

  flushCosts({ format: 'trip-pick', destination: script.country || 'unknown' });

  return { videoPath, script };
}
