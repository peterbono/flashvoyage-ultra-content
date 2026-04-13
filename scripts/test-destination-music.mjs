#!/usr/bin/env node
/**
 * Sanity test for destination-aware ASMR music picker.
 *
 * Runs pickMusicTrack('asmr', { destination }) across 20 varied inputs and
 * prints the picks. No assertions — scan output for correctness:
 *   - 'Bali' should land on asmr-bali-rice-fields.mp3
 *   - 'Japan'/'Tokyo' should land on asmr-japan-* or asmr-tokyo-*
 *   - 'Vietnam (Sapa)' should land on asmr-vietnam-* or asmr-sapa-*
 *   - Unknown inputs should warn and fallback to generic ASMR
 *
 * Usage: node scripts/test-destination-music.mjs
 */

import { pickMusicTrack } from '../social-distributor/reels/asset-fetcher.js';
import { basename } from 'path';

const cases = [
  { mood: 'asmr', destination: 'Bali' },
  { mood: 'asmr', destination: 'Bali (Indonésie)' },
  { mood: 'asmr', destination: 'Indonesia' },
  { mood: 'asmr', destination: 'Thaïlande' },
  { mood: 'asmr', destination: 'Thailand' },
  { mood: 'asmr', destination: 'Bangkok' },
  { mood: 'asmr', destination: 'Phuket' },
  { mood: 'asmr', destination: 'Japon' },
  { mood: 'asmr', destination: 'Tokyo' },
  { mood: 'asmr', destination: 'Kyoto' },
  { mood: 'asmr', destination: 'Vietnam' },
  { mood: 'asmr', destination: 'Sapa, Vietnam' },
  { mood: 'asmr', destination: 'Sapa' },
  { mood: 'asmr', destination: 'Hanoi' },
  { mood: 'asmr', destination: 'Cambodge' },
  { mood: 'asmr', destination: 'Angkor Wat' },
  { mood: 'asmr', destination: 'Philippines' },
  { mood: 'asmr', destination: 'Palawan' },
  { mood: 'asmr', destination: 'Laos' },
  { mood: 'asmr', destination: 'Séoul' },
  { mood: 'asmr', destination: 'Korea' },
  // Unknown / fallback
  { mood: 'asmr', destination: 'Mars' },
  { mood: 'asmr', destination: 'Madagascar' },
  // No destination — should behave exactly like before
  { mood: 'asmr', destination: null },
  // Non-ASMR mood with destination — destination should be ignored
  { mood: 'chill', destination: 'Bali' },
];

console.log('── Destination-aware music picker sanity test ─────────────\n');

for (const { mood, destination } of cases) {
  const picked = pickMusicTrack(mood, { destination });
  const shortName = picked ? basename(picked) : '(none)';
  const label = destination === null ? '(no destination)' : `'${destination}'`;
  console.log(`  mood=${mood.padEnd(6)} dest=${label.padEnd(28)} → ${shortName}`);
}

console.log('\n── Done. Scan for correctness above. ─────────────────────');
