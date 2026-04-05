/**
 * Engagement Poll Composer — FlashVoyage Reels v2
 *
 * Two modes:
 *   - SPLIT-SCREEN (default when 2+ optionQueries): two Pexels clips side by side
 *   - SINGLE CLIP (fallback): one Pexels clip with dark overlay
 *
 * Pipeline: Pexels clips → split-screen or single → overlay PNG → mix audio → H.264
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate } from '../core/overlay-renderer.js';
import { prepareClip, loopClip } from '../core/clip-preparer.js';
import { fetchPexelsVideo, downloadVideo, pickMusicTrack } from '../asset-fetcher.js';
import { generatePollScript } from '../data/generators/engagement-poll.js';
import { flushCosts } from '../cost-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

const DURATION = 6;

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

function safeUnlink(filePath) {
  try {
    if (filePath && existsSync(filePath)) unlinkSync(filePath);
  } catch { /* ignore */ }
}

/**
 * Compose a poll reel with split-screen background when optionQueries are available.
 */
export async function composePollReel(script, opts = {}) {
  ensureTmpDir();

  const ts = Date.now();
  const outputPath = opts.outputPath || join(TMP_DIR, `poll-final-${ts}.mp4`);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const tempFiles = [];

  try {
    const optionQueries = script.optionQueries || [];
    const useSplitScreen = optionQueries.length >= 2;

    let bgVideoPath;

    if (useSplitScreen) {
      // ── SPLIT-SCREEN: fetch 2 clips, compose side by side ─────────────
      console.log(`[REEL/POLL] Split-screen mode: fetching 2 clips`);

      // Fetch clip A (left = option 1)
      const rawA = join(TMP_DIR, `poll-rawA-${ts}.mp4`);
      const prepA = join(TMP_DIR, `poll-prepA-${ts}.mp4`);
      const loopA = join(TMP_DIR, `poll-loopA-${ts}.mp4`);
      tempFiles.push(rawA, prepA, loopA);

      const urlA = await fetchPexelsVideo(optionQueries[0], 'portrait');
      if (urlA) {
        await downloadVideo(urlA, rawA);
        await prepareClip(rawA, prepA, { duration: DURATION, width: 540, height: 1920 });
        await loopClip(prepA, loopA, DURATION);
        console.log(`[REEL/POLL] Clip A (${script.options?.[0] || 'left'}): ready`);
      }

      // Fetch clip B (right = option 2)
      const rawB = join(TMP_DIR, `poll-rawB-${ts}.mp4`);
      const prepB = join(TMP_DIR, `poll-prepB-${ts}.mp4`);
      const loopB = join(TMP_DIR, `poll-loopB-${ts}.mp4`);
      tempFiles.push(rawB, prepB, loopB);

      const urlB = await fetchPexelsVideo(optionQueries[1], 'portrait');
      if (urlB) {
        await downloadVideo(urlB, rawB);
        await prepareClip(rawB, prepB, { duration: DURATION, width: 540, height: 1920 });
        await loopClip(prepB, loopB, DURATION);
        console.log(`[REEL/POLL] Clip B (${script.options?.[1] || 'right'}): ready`);
      }

      // Compose split-screen: A on left (0,0), B on right (540,0), thin white divider
      const splitPath = join(TMP_DIR, `poll-split-${ts}.mp4`);
      tempFiles.push(splitPath);

      if (existsSync(loopA) && existsSync(loopB)) {
        const labelA = script.options?.[0] || '1';
        const labelB = script.options?.[1] || '2';

        // Render split-screen labels as a PNG overlay (avoids ffmpeg drawtext encoding issues)
        const labelsOverlayPath = join(TMP_DIR, `poll-labels-${ts}.png`);
        tempFiles.push(labelsOverlayPath);

        const labelsHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1080px;height:1920px;background:transparent;font-family:'Montserrat',sans-serif}
  .container{position:relative;width:1080px;height:1920px}
  .label{position:absolute;bottom:280px;padding:14px 40px;background:rgba(0,0,0,0.7);border-radius:30px;font-size:36px;font-weight:900;color:#FFD700;text-transform:uppercase;letter-spacing:2px;text-shadow:0 2px 6px rgba(0,0,0,0.8)}
  .label-left{left:50px}
  .label-right{right:50px}
  .divider{position:absolute;top:0;left:538px;width:4px;height:100%;background:rgba(255,255,255,0.7)}
</style></head><body>
<div class="container">
  <div class="divider"></div>
  <div class="label label-left">${labelA}</div>
  <div class="label label-right">${labelB}</div>
</div></body></html>`;

        const { renderOverlay } = await import('../core/overlay-renderer.js');
        await renderOverlay(labelsHtml, labelsOverlayPath);
        console.log(`[REEL/POLL] Labels overlay rendered: ${labelA} vs ${labelB}`);

        // Compose split-screen + overlay labels
        await ffmpeg([
          '-i', loopA,
          '-i', loopB,
          '-i', labelsOverlayPath,
          '-filter_complex',
          '[0:v]scale=540:1920,setsar=1[left];' +
          '[1:v]scale=540:1920,setsar=1[right];' +
          '[left][right]hstack=inputs=2[split];' +
          '[2:v]scale=1080:1920[labels];' +
          '[split][labels]overlay=0:0[out]',
          '-map', '[out]',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-t', String(DURATION), '-an', '-y',
          splitPath,
        ]);
        bgVideoPath = splitPath;
        console.log(`[REEL/POLL] Split-screen composed: ${labelA} (left) vs ${labelB} (right)`);
      } else {
        // One clip failed — fallback to single
        console.warn(`[REEL/POLL] Split-screen failed, falling back to single clip`);
        bgVideoPath = existsSync(loopA) ? loopA : loopB;
      }
    }

    if (!bgVideoPath) {
      // ── SINGLE CLIP fallback ──────────────────────────────────────────
      console.log(`[REEL/POLL] Single clip mode`);
      const rawPath = join(TMP_DIR, `poll-raw-${ts}.mp4`);
      const prepPath = join(TMP_DIR, `poll-prep-${ts}.mp4`);
      const loopPath = join(TMP_DIR, `poll-loop-${ts}.mp4`);
      tempFiles.push(rawPath, prepPath, loopPath);

      const videoUrl = await fetchPexelsVideo(script.pexelsQuery || 'tropical beach sunset', 'portrait');
      if (!videoUrl) throw new Error('No Pexels video found');
      await downloadVideo(videoUrl, rawPath);
      await prepareClip(rawPath, prepPath, { duration: DURATION, width: 1080, height: 1920 });
      await loopClip(prepPath, loopPath, DURATION);
      bgVideoPath = loopPath;
    }

    // ── Render poll overlay PNG ───────────────────────────────────────────
    const overlayPath = join(TMP_DIR, `poll-overlay-${ts}.png`);
    tempFiles.push(overlayPath);

    const options = script.options || [];
    const replacements = {
      '{{QUESTION_TEXT}}': script.question || 'TA DESTINATION PRÉFÉRÉE ?',
      '{{OPTION_1}}': options[0] || 'OPTION 1',
      '{{OPTION_2}}': options[1] || 'OPTION 2',
      '{{OPTION_3}}': options[2] || 'OPTION 3',
      '{{OPTION_4}}': options[3] || '',
      '{{OPTION_4_HIDDEN}}': options.length < 4 ? 'hidden' : '',
    };

    await renderTemplate('engagement-poll-overlay.html', replacements, overlayPath);
    console.log(`[REEL/POLL] Overlay rendered`);

    // ── Overlay + audio + final encode ────────────────────────────────────
    const audioPath = pickMusicTrack('tropical') || pickMusicTrack('upbeat');
    const audioArgs = audioPath
      ? ['-i', audioPath, '-filter_complex', `[1]scale=1080:1920[ovl];[0][ovl]overlay=0:0[vid];[2:a]volume=0.18,atrim=0:${DURATION},afade=t=out:st=${DURATION - 1.5}:d=1.5,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aud]`, '-map', '[vid]', '-map', '[aud]']
      : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-filter_complex', '[1]scale=1080:1920[ovl];[0][ovl]overlay=0:0', '-shortest'];

    const beforeCtaPath = join(TMP_DIR, `poll-before-cta-${ts}.mp4`);
    tempFiles.push(beforeCtaPath);

    await ffmpeg([
      '-i', bgVideoPath,
      '-i', overlayPath,
      ...audioArgs,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-t', String(DURATION),
      '-movflags', '+faststart',
      '-y',
      beforeCtaPath,
    ]);

    console.log(`[REEL/POLL] Base reel encoded: ${beforeCtaPath}`);

    // Append global save CTA (+2.5s) to boost IG save rate
    const { appendSaveCtaScene } = await import('../core/save-cta.js');
    await appendSaveCtaScene(beforeCtaPath, outputPath);
    console.log(`[REEL/POLL] Final reel with save CTA: ${outputPath}`);
    return outputPath;

  } finally {
    console.log(`[REEL/POLL] Cleaning up ${tempFiles.length} temp files`);
    for (const f of tempFiles) safeUnlink(f);
  }
}

/**
 * Full pipeline: generate script + compose reel from article.
 */
export async function generatePollReelFromArticle(article, opts = {}) {
  console.log(`[REEL/POLL] Starting poll reel pipeline for: "${(article.title || '').slice(0, 60)}"`);

  const script = await generatePollScript(article);
  console.log(`[REEL/POLL] Script generated: "${script.question}" (${(script.options || []).length} options)`);

  if (script.optionQueries?.length >= 2) {
    console.log(`[REEL/POLL] Split-screen queries: "${script.optionQueries[0]}" vs "${script.optionQueries[1]}"`);
  }

  const videoPath = await composePollReel(script, opts);
  console.log(`[REEL/POLL] Poll reel complete: ${videoPath}`);

  flushCosts({ format: 'engagement-poll', destination: script.question || 'unknown' });

  return { videoPath, script };
}
