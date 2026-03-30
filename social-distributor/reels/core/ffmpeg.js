/**
 * core/ffmpeg.js — FlashVoyage Reels v2
 *
 * Shared ffmpeg/ffprobe wrappers with logging.
 * All functions are named ESM exports with no circular dependencies.
 */

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

/**
 * Run an ffmpeg command with logging and a 2-minute timeout.
 *
 * @param {string[]} args - Arguments passed to ffmpeg
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function ffmpeg(args) {
  console.log(`[REEL/CORE] ffmpeg ${args.slice(0, 6).join(' ')}...`);
  try {
    const { stdout, stderr } = await execFile('ffmpeg', args, { timeout: 120_000 });
    return { stdout, stderr };
  } catch (err) {
    console.error(`[REEL/CORE] ffmpeg error: ${err.stderr?.slice(-500) || err.message}`);
    throw err;
  }
}

/**
 * Run an ffprobe command and return trimmed stdout.
 *
 * @param {string[]} args - Arguments passed to ffprobe
 * @returns {Promise<string>} Trimmed stdout
 */
export async function ffprobe(args) {
  console.log(`[REEL/CORE] ffprobe ${args.slice(0, 6).join(' ')}...`);
  try {
    const { stdout } = await execFile('ffprobe', args, { timeout: 30_000 });
    return stdout.trim();
  } catch (err) {
    console.error(`[REEL/CORE] ffprobe error: ${err.stderr?.slice(-500) || err.message}`);
    throw err;
  }
}

/**
 * Get video duration in seconds. Returns 20 as a safe fallback on error.
 *
 * @param {string} videoPath - Path to the video file
 * @returns {Promise<number>} Duration in seconds
 */
export async function getVideoDuration(videoPath) {
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
    console.warn(`[REEL/CORE] Could not read duration for ${videoPath}, defaulting to 20s`);
    return 20; // fallback
  }
}
