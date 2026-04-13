# FlashVoyage — Content Design System (HTML patterns for article bodies)

> **Objet :** canoniser les 4 blocs HTML autorisés dans le body des articles WordPress FlashVoyage.
> **Pourquoi :** semaine du 2026-04-07, 24 actions content-ops (R3 TL;DR, R2 H2 grafts, R5 H1 rewrites) ont généré
> des tables violettes, des headers navy et des callouts dark — aucun ne matchait la charte. Root cause : aucune
> spec écrite, chaque agent réinventait ses inline styles.
> **Installé le :** 2026-04-13.

---

## 📋 À qui s'adresse ce doc

Ce fichier est la **source de vérité** pour tout système qui génère ou modifie du HTML injecté dans un article
FlashVoyage WordPress :

1. **Haiku auto-apply MEDIUM tier** — génère TL;DR, intros, tables avant `PUT /wp-json/wp/v2/posts/{id}`
2. **Content-ops manuels** (R2/R3/R5 agents, finaliseurs, refresher) — modifient blocks existants
3. **LLM article generators** futurs (enhanced-ultra-generator, article-outline-builder, editorial-enhancer)
4. **Review agents** (review-agents.js, review-auto-fixers.js) — valident avant push

Règle d'or : **aucun inline style hors de cette liste**. Si un pattern manque, on agrandit ce doc, on ne freestyle pas.

---

## 🎨 Palette autorisée (source unique)

| Role | Hex | Usage |
|---|---|---|
| Accent "Histoires Vraies" | `#FFD700` | Link hover, emphasis. **JAMAIS en background de bloc** |
| Soft cream bg | `#fffbeb` | Background `.fv-faq-item` (TL;DR, callout, FAQ) |
| Border neutre | `#e5e7eb` | Border `.fv-faq-item` uniquement |
| Heading text | `#1f2937` | Text fort dans callouts (`font-weight:600`) |
| Body text | `#4b5563` | Text standard dans listes de callouts |

**Typographie :** Montserrat, héritée du thème JNews. **Ne jamais override** `font-family`, `font-size`, `line-height`
hors de ce qui est spec ci-dessous.

---

## 🚫 Forbidden patterns (zero tolerance)

Un agent qui génère un de ces patterns doit être rejeté avant PUT WordPress.

- ❌ **Inline `style=` sur `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`**
  → JNews gère le rendu table via son CSS de thème. Toute surcharge casse la cohérence mobile.
- ❌ **Dark-background callouts** : `background:#0a0a0b`, `#111827`, `#1f2937`, `#000`, `#000000`, `#0f172a`,
  ou tout hex dont la luminance < 40%.
- ❌ **Headers colorés** : pas de `<h2 style="color:#6d28d9">`, pas de purple/violet/navy (`#7c3aed`, `#6d28d9`,
  `#1e3a8a`, `#1e40af`, etc.). Les `<h1>`, `<h2>`, `<h3>` n'ont **jamais** d'attribut `style` — le thème s'en charge.
- ❌ **`<div>` avec `border-radius`** qui n'est ni `.fv-faq-item` ni `.fv-esim-widget`. Pas de "cartes maison".
- ❌ **Emoji-heavy blocks** avec couleurs clashantes (ex. emoji + `background:#ffe4e1` + `color:#9333ea`).
- ❌ **Colorisation de `<strong>`, `<em>`, `<span>`** hors `color:#1f2937` ou `#4b5563` déjà dans le callout.
- ❌ **`<style>` tags inline, `<script>`, `<iframe>`** hors widgets Travelpayouts déjà listés section Preservation.
- ❌ **Gradients** (`linear-gradient`, `radial-gradient`) sous toutes leurs formes.
- ❌ **Box-shadow custom** (`box-shadow:0 4px 12px rgba(...)`) — JNews gère ses ombres.
- ❌ **Width/max-width fixés** (`width:600px`, `max-width:80%`) — cassent le responsive.

---

## ✅ Canonical blocks (the only 4 allowed)

### Pattern 1 — Tables (JNews native)

**Quand :** comparatifs budget, prix, dates, itinéraires, données structurées.

**Règle :** HTML plain, **zero inline style**. JNews applique le rendu du thème (striped, responsive, Montserrat).

```html
<table>
  <thead>
    <tr><th>Col 1</th><th>Col 2</th></tr>
  </thead>
  <tbody>
    <tr><td>val</td><td>val</td></tr>
    <tr><td><strong>Total</strong></td><td><strong>X €</strong></td></tr>
  </tbody>
</table>
```

**À NE PAS utiliser pour :** un callout ou un TL;DR (utiliser Pattern 2). Pas de tableau à 1 colonne — c'est une liste.

---

### Pattern 2 — Callout / TL;DR / key info (`.fv-faq-item`)

**Quand :** TL;DR début d'article, encart "en bref", bloc FAQ, callout "à retenir".

**Règle :** la classe `fv-faq-item` est **la seule div cosmétique autorisée** dans le body. Les inline styles
ci-dessous sont **figés** — ne pas les modifier, ne pas en ajouter.

```html
<div class="fv-faq-item" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:1rem;padding:1rem 1.2rem;background:#fffbeb;">
  <p style="margin:0 0 0.5rem;color:#1f2937;font-weight:600;">⚡ TL;DR — En bref</p>
  <ul style="margin:0;padding-left:1.2rem;color:#4b5563;line-height:1.6;">
    <li><strong>Key point :</strong> value</li>
    <li><strong>Second point :</strong> value</li>
  </ul>
</div>
```

**Variants autorisés du titre `<p>` :**
- `⚡ TL;DR — En bref`
- `💡 À retenir`
- `📌 Info clé`
- `❓ FAQ — [question]`

**Structure interne :** `<ul>` avec 2 à 5 `<li>`. Pas de `<h3>` à l'intérieur. Pas d'image.

**À NE PAS utiliser pour :** un tableau de données (utiliser Pattern 1), un widget affilié (utiliser Pattern 4).

---

### Pattern 3 — Intro hook (teaser paragraph)

**Quand :** première ou deuxième phrase d'un article, avant un TL;DR explicite, pour hooker le lecteur avec un chiffre
ou une promesse concrète. Matches le style du flagship `voyage-thailande-pas-cher-2026-budget` (score 70).

**Règle :** `<p>` simple + `<strong>` sur la claim. **Aucun** `style=`. Aucune div wrapper. Le thème gère la typo.

```html
<p><strong>Hook question or claim ?</strong> Context answer en 1-2 phrases.</p>
<p>Spoiler : <strong>key numeric claim</strong>. Voici comment procéder …</p>
```

**Exemples valides :**
- `<p><strong>Thaïlande pas chère en 2026 ?</strong> Oui, et on a les chiffres.</p>`
- `<p>Spoiler : <strong>14 jours à 1 100 € tout compris</strong>, vols inclus.</p>`

**À NE PAS utiliser pour :** remplacer un TL;DR structuré (utiliser Pattern 2 si > 1 point). Pas de chaînage > 2 `<p>`
hook consécutifs — ça devient du spam.

---

### Pattern 4 — eSIM widget (auto-apply T1 canonical)

**Quand :** un seul par article, injecté par `contextual-widget-placer-v2.js` ou par Haiku auto-apply T1.

**Règle :** **ne jamais modifier, ne jamais dupliquer**. Si déjà présent, on skip. Si absent, seul le pipeline
`widget-plan-builder.js` peut l'ajouter.

```html
<!-- esim-widget -->
<div class="fv-esim-widget"><!-- Travelpayouts block --></div>
```

**À NE PAS utiliser pour :** autre chose que l'eSIM Travelpayouts. Pas de `.fv-esim-widget` pour un callout maison.

---

## 🌳 Decision tree (what pattern to use)

```
Je veux ajouter…

├─ un résumé en tête d'article (2-5 bullets)          → Pattern 2 (.fv-faq-item "⚡ TL;DR — En bref")
├─ un comparatif chiffré (prix, dates, durée)         → Pattern 1 (table plain)
├─ une phrase d'accroche avec un chiffre choc         → Pattern 3 (<p><strong>…</strong></p>)
├─ un encart FAQ "Q / R"                              → Pattern 2 (.fv-faq-item "❓ FAQ — …")
├─ un callout "à retenir" en milieu d'article         → Pattern 2 (.fv-faq-item "💡 À retenir")
├─ une donnée clé isolée (1 phrase)                   → Pattern 3 (<p><strong>…</strong></p>)
├─ un widget eSIM Travelpayouts                       → Pattern 4 (.fv-esim-widget), via pipeline uniquement
├─ un encart "carte", "bannière", "promo maison"      → ❌ INTERDIT, refuser la demande
└─ un tableau à 1 colonne                             → ❌ c'est une liste, utiliser <ul>
```

Si aucun cas ne matche : **ne pas générer de HTML custom**. Revenir au produit owner (ce doc) avant d'improviser.

---

## 🛡️ Preservation list (never touch if already in the article)

Ces blocs sont **immuables**. Un agent qui les détecte doit les laisser intacts, byte-pour-byte.

1. **`.fv-faq-item`** — toute div existante avec cette classe (FAQ historique, TL;DR déjà posés)
2. **`.fv-esim-widget`** — widget eSIM injecté par le pipeline auto-apply T1
3. **`.articles-connexes`** — widget related-articles (accent border-left + bg `#f8f9fa`), émis par le pipeline publication
4. **`.fv-byline`, `.fv-author-box`** — credit + author card blocks, émis par le pipeline
5. **Travelpayouts scripts et divs** — toute ligne contenant :
   - `shmarker=676421`
   - `trs=463418`
   - `travelpayouts.com`
   - widgets IDs `7879` (flights), `3947` (tours), `8588` (esim)
6. **ez-toc spans** — `<span class="ez-toc-section" id="…">`, `<span class="ez-toc-section-end">` (TOC auto-généré)
7. **WPCode Lite snippets** — commentaires HTML `<!-- wpcode … -->` ou `<!-- /wpcode -->`
8. **Rank Math schema JSON** — `<script type="application/ld+json">` déjà présents

Règle : si tu ne reconnais pas un bloc et qu'il n'est pas dans les Patterns 1-4 **et** pas Forbidden,
→ par défaut **preserve**, pas delete. Mieux vaut laisser un bloc legacy qu'effacer un widget rentable.

---

## 🔍 Verification snippet (reject before PUT)

Un pipeline qui génère du HTML à injecter DOIT passer cette regex avant `PUT /wp-json/wp/v2/posts/{id}`.
Si un match positif est détecté → **reject**, log, et ne pas envoyer.

### Node.js / JS (pour article-finalizer.js, review-auto-fixers.js, Haiku auto-apply)

```js
// content-design-system-validator.js
const FORBIDDEN_PATTERNS = [
  // Inline styles on table elements
  /<(table|thead|tbody|tr|th|td)[^>]*\sstyle\s*=/i,
  // Dark backgrounds (luminance < ~40%)
  /background\s*:\s*#(0[0-9a-f]|1[0-9a-f]|2[0-9a-f])/i,
  /background\s*:\s*(#000|#000000|#0a0a0b|#111827|#1f2937|#0f172a)/i,
  // Purple / violet / navy header colors
  /<h[1-6][^>]*\sstyle\s*=[^>]*color\s*:\s*#(6d28d9|7c3aed|8b5cf6|1e3a8a|1e40af|4c1d95)/i,
  // Rogue divs with border-radius not whitelisted
  /<div(?![^>]*class\s*=\s*["'][^"']*(fv-faq-item|fv-esim-widget))[^>]*border-radius/i,
  // Gradients
  /(linear-gradient|radial-gradient)\s*\(/i,
  // Box-shadow custom
  /box-shadow\s*:\s*[^;"]+\d+px/i,
  // Fixed widths
  /(max-)?width\s*:\s*\d+(px|%)/i,
  // Inline <style> or <script> (hors Travelpayouts / JNews)
  /<style[\s>]/i,
];

function validateContentHTML(html) {
  const violations = [];
  for (const re of FORBIDDEN_PATTERNS) {
    const match = html.match(re);
    if (match) violations.push({ rule: re.source, snippet: match[0].slice(0, 120) });
  }
  return { ok: violations.length === 0, violations };
}

module.exports = { validateContentHTML, FORBIDDEN_PATTERNS };
```

### grep one-liner (CI / spot-check local)

```bash
# Retourne les articles avec patterns interdits. Exit 1 si un match.
grep -nE '<(table|th|td|tr|thead|tbody)[^>]*style=|background:#(0[0-9a-f]|1[0-9a-f]|2[0-9a-f])|linear-gradient|radial-gradient' path/to/article.html
```

### Integration point

- `article-finalizer.js` : appeler `validateContentHTML(finalHTML)` **avant** le retour du finaliseur.
- `review-auto-fixers.js` : si violation détectée sur un article existant, passer en mode "strip + retry" avec
  patterns canoniques, sans jamais PUT le HTML non-conforme.
- Haiku auto-apply MEDIUM tier : valider la sortie Haiku avant `wp.posts.update({id, content})`. En cas de violation,
  fallback sur un TL;DR Pattern 2 minimal généré localement (pas de 2e call Haiku).

---

## 📏 Quick reference card (print this, pin it)

| Besoin | Pattern | Classe / structure |
|---|---|---|
| Tableau comparatif | 1 | `<table>` plain, zero style |
| TL;DR / callout / FAQ | 2 | `<div class="fv-faq-item" style="…">` (styles figés) |
| Hook d'intro | 3 | `<p><strong>…</strong> …</p>` zero style |
| Widget eSIM | 4 | `<div class="fv-esim-widget">` — pipeline only |
| Autre chose | — | ❌ Refuser, remonter au doc |

---

## 🔗 Related

- `AI-RULES-ABSOLUTES.md` — règles générales (no fake data, verify on prod)
- `docs/flashvoyage-seo-checklist.md` — SEO content rules (word count, E-E-A-T)
- `docs/TOP-1-PERCENT-TRAVEL-ARTICLE-CHECKLIST.md` — checklist éditoriale top 1%
- Flagship référence : `voyage-thailande-pas-cher-2026-budget` (score 70) — **DO NOT TOUCH**
- Pipelines concernés :
  - `article-finalizer.js`
  - `review-agents.js` + `review-auto-fixers.js`
  - `contextual-widget-placer-v2.js`
  - `enhanced-ultra-generator.js`
  - `editorial-enhancer.js`
  - Haiku auto-apply MEDIUM tier (external, consume via this spec)

---

**Dernière mise à jour :** 2026-04-13 — initial spec après incident tables violettes / headers navy (semaine 04-07).
**Owner :** content-ops. **Review cadence :** à chaque incident de charte, agrandir la section Forbidden ou Canonical
correspondante. Ne pas inventer un nouveau pattern sans PR.
