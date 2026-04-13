#!/usr/bin/env node
/**
 * Smoke test for lib/content-validator.js
 * Runs 3 fixtures through validateAndCleanContent() and prints the results.
 * No assertion framework — eyeball the output.
 *
 *   node scripts/test-content-validator.mjs
 */

import { validateAndCleanContent } from '../lib/content-validator.js';

const divider = (label) => `\n${'━'.repeat(78)}\n▶ ${label}\n${'━'.repeat(78)}`;

// ─────────────────────────────────────────────────────────────────────────
// Fixture 1 — dark-bg TL;DR (hallucinated by LLM, should be auto-stripped)
// Also has inline style on a <th> and purple bg on a <td>.
// ─────────────────────────────────────────────────────────────────────────
const fixture1 = `
<h1>Thaïlande 2026</h1>
<div style="background:#0a0a0b;color:#fff;padding:1rem;border-radius:12px;">
  <p><strong>TL;DR</strong></p>
  <ul><li>14 jours à 1100€</li></ul>
</div>
<table>
  <thead><tr><th style="background:#6d28d9;color:#fff;">Jour</th><th>Prix</th></tr></thead>
  <tbody>
    <tr><td style="background:#7c3aed;">J1</td><td>45€</td></tr>
    <tr><td>J2</td><td>38€</td></tr>
  </tbody>
</table>
`.trim();

// ─────────────────────────────────────────────────────────────────────────
// Fixture 2 — fake affiliate card (Booking URL, no Travelpayouts script)
// Should trigger warn:fake-affiliate-card (warning, no auto-strip).
// Plus a TODO placeholder to trigger the placeholder warning.
// ─────────────────────────────────────────────────────────────────────────
const fixture2 = `
<p>Voici les meilleurs hôtels.</p>
<div class="fv-callout" style="border:1px solid #e5e7eb;border-radius:8px;padding:1rem;background:#fffbeb;">
  <p><strong>Réserve ton hôtel maintenant</strong></p>
  <p><a href="https://www.booking.com/hotel/th/bangkok">Voir l'offre →</a></p>
</div>
<p>TODO: ajouter les détails du prix.</p>
`.trim();

// ─────────────────────────────────────────────────────────────────────────
// Fixture 3 — clean content using only preserved classes + Pattern 1/3.
// Should pass with 0 warnings.
// ─────────────────────────────────────────────────────────────────────────
const fixture3 = `
<p><strong>Thaïlande pas chère en 2026 ?</strong> Oui, et on a les chiffres.</p>
<div class="fv-faq-item" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:1rem;padding:1rem 1.2rem;background:#fffbeb;">
  <p style="margin:0 0 0.5rem;color:#1f2937;font-weight:600;">⚡ L'essentiel</p>
  <ul style="margin:0;padding-left:1.2rem;color:#4b5563;line-height:1.6;">
    <li><strong>Budget :</strong> 1100 € tout compris</li>
    <li><strong>Durée :</strong> 14 jours</li>
  </ul>
</div>
<table>
  <thead><tr><th>Poste</th><th>Prix</th></tr></thead>
  <tbody>
    <tr><td>Vols</td><td>620 €</td></tr>
    <tr><td>Hébergement</td><td>280 €</td></tr>
  </tbody>
</table>
<div class="fv-esim-widget"><!-- Travelpayouts block shmarker=676421 --></div>
`.trim();

function runFixture(label, html) {
  console.log(divider(label));
  console.log(`Input bytes: ${html.length}`);
  const { cleaned, warnings, errors } = validateAndCleanContent(html);
  console.log(`Output bytes: ${cleaned.length}`);
  console.log(`Warnings: ${warnings.length}`);
  for (const w of warnings) {
    console.log(`  - [${w.rule}] ${String(w.sample).slice(0, 120)}`);
  }
  console.log(`Errors: ${errors.length}`);
  for (const e of errors) {
    console.log(`  - [${e.rule}] ${String(e.sample).slice(0, 120)}`);
  }
  console.log('\n--- cleaned HTML ---');
  console.log(cleaned);

  // Idempotency check: run twice, the output should be stable.
  const { cleaned: cleanedTwice } = validateAndCleanContent(cleaned);
  console.log(`\nIdempotency: ${cleaned === cleanedTwice ? 'PASS (stable)' : 'FAIL (changed on 2nd run)'}`);
}

runFixture('Fixture 1 — dark-bg TL;DR + purple table cells (auto-strip)', fixture1);
runFixture('Fixture 2 — fake affiliate card + TODO (warnings, no strip)', fixture2);
runFixture('Fixture 3 — clean, preserved classes only (expect 0 warnings)', fixture3);

console.log(divider('DONE'));
