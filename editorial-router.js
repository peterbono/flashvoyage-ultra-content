/**
 * editorial-router.js
 * 
 * Routeur éditorial NEWS / EVERGREEN.
 * Décision prise après extraction + pattern + story, avant génération LLM.
 * 
 * 3 sorties possibles :
 *   - { mode: 'news',      reason, signals }
 *   - { mode: 'evergreen',  reason, signals }
 *   - { mode: 'skip',       reason, signals }
 * 
 * Le mode est propagé dans le pipeline puis conditionne :
 *   1. Le prompt LLM (longueur, ton, livrables)
 *   2. Le quality-analyzer (grille + seuil)
 */

// ─── Override env ───────────────────────────────────────────────────
const FORCE_EDITORIAL_MODE = process.env.FORCE_EDITORIAL_MODE || null; // 'news' | 'evergreen' | null

// ─── Constantes ─────────────────────────────────────────────────────

/** Seuil de recency : posts < N jours reçoivent un boost NEWS */
const RECENCY_DAYS_THRESHOLD = 10;

/** Mots-clés dans le titre Reddit qui signalent une actualité ponctuelle */
const NEWS_TITLE_PATTERNS = /\b(new|changed|now|since|effective|update|policy|announce|announced|breaking|just|recently|price\s+change|new\s+rule|fee\s+increas|rule\s+change|visa\s+change|mise\s+[àa]\s+jour|changement|nouveau|augment)/i;

/** Mots-clés meta/community qui déclenchent le veto */
const META_VETO_PATTERNS = /\b(mod\s+post|rule\s+change|subreddit|sidebar|flair|community\s+update|meta\s+post|moderator|moderation|announcement\s+from\s+mod)/i;

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Calcule l'âge du post en jours.
 * @param {number} createdUtc - timestamp Unix (secondes)
 * @returns {number} âge en jours (arrondi au dixième)
 */
function postAgeDays(createdUtc) {
  if (!createdUtc || createdUtc <= 0) return Infinity;
  return Math.round(((Date.now() / 1000) - createdUtc) / 86400 * 10) / 10;
}

/**
 * Détecte si les commentaires confirment un changement récent.
 * Signal : au moins 2 warnings/consensus mentionnant des mots temporels.
 */
function commentsConfirmChange(extracted) {
  const temporalPattern = /\b(just|recent|now|changed|new|since|update|effective|started|began|commence)/i;
  let hits = 0;

  // Vérifier les warnings des commentaires
  const warnings = extracted?.comments?.warnings || [];
  for (const w of warnings) {
    if (temporalPattern.test(w.value || '') || temporalPattern.test(w.quote || '')) hits++;
  }

  // Vérifier les consensus
  const consensus = extracted?.comments?.consensus || [];
  for (const c of consensus) {
    if (temporalPattern.test(c.value || '')) hits++;
  }

  return hits >= 2;
}

/**
 * Détecte si le thread est un processus réutilisable / guide durable.
 */
function isEvergreenProcess(pattern, extracted) {
  const evergreenTypes = ['guide', 'list', 'linear'];
  const evergreenThemes = ['itinerary', 'money', 'accommodation', 'gear', 'admin'];

  if (evergreenTypes.includes(pattern?.story_type)) return true;
  if (evergreenThemes.includes(pattern?.theme_primary)) return true;

  // Signal de stabilité : consensus communautaire fort (>= 3 consensus items)
  const consensusCount = extracted?.comments?.consensus?.length || 0;
  if (consensusCount >= 3) return true;

  return false;
}

/**
 * Détecte la densité de solutions pratiques (signal NEWS : beaucoup de solutions,
 * peu de récit = thread de discussion pratique).
 */
function highSolutionDensity(extracted, story) {
  const adviceCount = extracted?.post?.signals?.advice_explicit?.length || 0;
  const insightsCount = extracted?.comments?.insights?.length || 0;
  const warningsCount = extracted?.comments?.warnings?.length || 0;

  // Beaucoup de conseils/solutions directs + résolution rapide = NEWS
  const solutionSignals = adviceCount + insightsCount + warningsCount;
  const hasResolution = story?.story?.resolution?.status === 'resolved';

  return solutionSignals >= 5 && hasResolution;
}

// ─── Router principal ───────────────────────────────────────────────

/**
 * Détermine le mode éditorial d'un article.
 * 
 * @param {Object} extracted - Données extraites du post Reddit
 * @param {Object} pattern   - Pattern détecté (story_type, theme_primary, etc.)
 * @param {Object} story     - Story compilée (story, evidence, meta)
 * @returns {{ mode: 'news'|'evergreen'|'skip', reason: string, signals: string[] }}
 */
export function routeEditorialMode(extracted, pattern, story) {
  const signals = [];

  // ─── Override env (debug / QA / AB test) ──────────────────────
  if (FORCE_EDITORIAL_MODE === 'news' || FORCE_EDITORIAL_MODE === 'evergreen') {
    console.log(`📰 EDITORIAL_ROUTER: Mode forcé par env FORCE_EDITORIAL_MODE=${FORCE_EDITORIAL_MODE}`);
    return {
      mode: FORCE_EDITORIAL_MODE,
      reason: `Override env FORCE_EDITORIAL_MODE=${FORCE_EDITORIAL_MODE}`,
      signals: ['env_override']
    };
  }

  // ─── 1. Veto meta/community ──────────────────────────────────
  const title = extracted?.source?.title || extracted?.post?.title || '';
  const titleLower = title.toLowerCase();

  if (META_VETO_PATTERNS.test(titleLower)) {
    signals.push('meta_title_match');
  }

  // Posts meta + aucun événement exploitable = skip
  if (signals.includes('meta_title_match') &&
      (pattern?.exploitable_events?.count || 0) === 0) {
    return {
      mode: 'skip',
      reason: 'Meta/community post sans contenu voyage exploitable',
      signals
    };
  }

  // ─── 2. Signal recency ──────────────────────────────────────
  const createdUtc = extracted?.source?.created_utc || extracted?.post?.created_utc || 0;
  const ageDays = postAgeDays(createdUtc);

  if (ageDays < RECENCY_DAYS_THRESHOLD) {
    signals.push(`recency_${ageDays}d`);
  }

  // ─── 3. Signal nature du post (titre + story_type) ──────────
  if (NEWS_TITLE_PATTERNS.test(titleLower)) {
    signals.push('news_title_keywords');
  }

  if (pattern?.story_type === 'update_thread') {
    signals.push('update_thread_pattern');
  }

  if (pattern?.story_type === 'warning') {
    signals.push('warning_pattern');
  }

  // ─── 4. Commentaires confirment un changement ───────────────
  if (commentsConfirmChange(extracted)) {
    signals.push('comments_confirm_change');
  }

  // ─── 5. Densité solutions (signal NEWS additionnel) ─────────
  if (highSolutionDensity(extracted, story)) {
    signals.push('high_solution_density');
  }

  // ─── 6. Signaux evergreen ───────────────────────────────────
  if (isEvergreenProcess(pattern, extracted)) {
    signals.push('evergreen_process');
  }

  // Dates extraites du texte : s'il n'y en a pas, boost evergreen
  const extractedDates = extracted?.post?.evidence?.dates || [];
  if (extractedDates.length === 0) {
    signals.push('no_dates_in_text');
  }

  // ─── Décision finale ────────────────────────────────────────
  const newsSignals = signals.filter(s =>
    s.startsWith('recency_') ||
    s === 'news_title_keywords' ||
    s === 'update_thread_pattern' ||
    s === 'warning_pattern' ||
    s === 'comments_confirm_change' ||
    s === 'high_solution_density'
  );

  const evergreenSignals = signals.filter(s =>
    s === 'evergreen_process' ||
    s === 'no_dates_in_text'
  );

  // Seuil : >= 2 signaux NEWS pour classifier en NEWS
  if (newsSignals.length >= 2) {
    return {
      mode: 'news',
      reason: `${newsSignals.length} signaux NEWS détectés: ${newsSignals.join(', ')}`,
      signals
    };
  }

  // Default : EVERGREEN (c'est le cœur du média)
  return {
    mode: 'evergreen',
    reason: evergreenSignals.length > 0
      ? `Mode EVERGREEN (${evergreenSignals.join(', ')})`
      : 'Mode EVERGREEN par défaut (pas assez de signaux NEWS)',
    signals
  };
}
