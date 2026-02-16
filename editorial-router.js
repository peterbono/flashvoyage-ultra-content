/**
 * editorial-router.js
 * 
 * Routeur éditorial NEWS / EVERGREEN.
 * Décision prise après extraction + pattern + story, avant génération LLM.
 * 
 * Sortie :
 *   {
 *     mode: 'news' | 'evergreen' | 'skip',
 *     editorial_mode: 'news' | 'evergreen' | 'skip',   // alias de mode
 *     confidence: number,       // 0..1
 *     reasons: string[],        // signaux ayant pesé
 *     scores: { news: number, evergreen: number },
 *     // Backward compat
 *     reason: string,
 *     signals: string[]
 *   }
 * 
 * Routing deterministe : memes inputs => meme output.
 * Si confidence < 0.55 => force evergreen + reason "low_confidence_fallback".
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

/** Seuil de confiance : en dessous, fallback evergreen */
const CONFIDENCE_THRESHOLD = 0.55;

/** Poids des signaux pour le scoring */
const SIGNAL_WEIGHTS = {
  // NEWS signals
  recency:                 0.30,
  news_title_keywords:     0.20,
  update_thread_pattern:   0.30,
  warning_pattern:         0.20,
  comments_confirm_change: 0.25,
  high_solution_density:   0.15,
  // EVERGREEN signals
  evergreen_process:       0.35,
  no_dates_in_text:        0.25
};

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
 * Construit le résultat standardisé du router.
 * Fournit les nouvelles clés (editorial_mode, confidence, reasons, scores)
 * et les anciennes (mode, reason, signals) pour backward compat.
 */
function buildResult(mode, confidence, reasons, scores, signals) {
  const reasonText = reasons.length > 0
    ? `${mode.toUpperCase()} (conf=${confidence.toFixed(2)}): ${reasons.join(', ')}`
    : `${mode.toUpperCase()} (conf=${confidence.toFixed(2)})`;

  console.log(`📰 EDITORIAL_ROUTER mode=${mode} conf=${confidence.toFixed(2)} news=${scores.news.toFixed(2)} evergreen=${scores.evergreen.toFixed(2)} reasons=[${reasons.join(', ')}]`);

  return {
    mode,
    editorial_mode: mode,
    confidence,
    reasons,
    scores,
    // Backward compat
    reason: reasonText,
    signals
  };
}

/**
 * Détermine le mode éditorial d'un article.
 * 
 * @param {Object} extracted - Données extraites du post Reddit
 * @param {Object} pattern   - Pattern détecté (story_type, theme_primary, etc.)
 * @param {Object} story     - Story compilée (story, evidence, meta)
 * @returns {{ mode: string, editorial_mode: string, confidence: number, reasons: string[], scores: { news: number, evergreen: number }, reason: string, signals: string[] }}
 */
export function routeEditorialMode(extracted, pattern, story) {
  const signals = [];

  // ─── Override env (debug / QA / AB test) ──────────────────────
  if (FORCE_EDITORIAL_MODE === 'news' || FORCE_EDITORIAL_MODE === 'evergreen') {
    console.log(`📰 EDITORIAL_ROUTER: Mode forcé par env FORCE_EDITORIAL_MODE=${FORCE_EDITORIAL_MODE}`);
    return buildResult(
      FORCE_EDITORIAL_MODE,
      1.0,
      ['env_override'],
      { news: FORCE_EDITORIAL_MODE === 'news' ? 1 : 0, evergreen: FORCE_EDITORIAL_MODE === 'evergreen' ? 1 : 0 },
      ['env_override']
    );
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
    return buildResult('skip', 1.0, ['meta_veto'], { news: 0, evergreen: 0 }, signals);
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

  // ─── Scoring pondéré ────────────────────────────────────────
  let newsScore = 0;
  let evergreenScore = 0;

  const newsSignals = [];
  const evergreenSignalsList = [];

  for (const s of signals) {
    if (s.startsWith('recency_')) {
      newsScore += SIGNAL_WEIGHTS.recency;
      newsSignals.push(s);
    } else if (s === 'news_title_keywords') {
      newsScore += SIGNAL_WEIGHTS.news_title_keywords;
      newsSignals.push(s);
    } else if (s === 'update_thread_pattern') {
      newsScore += SIGNAL_WEIGHTS.update_thread_pattern;
      newsSignals.push(s);
    } else if (s === 'warning_pattern') {
      newsScore += SIGNAL_WEIGHTS.warning_pattern;
      newsSignals.push(s);
    } else if (s === 'comments_confirm_change') {
      newsScore += SIGNAL_WEIGHTS.comments_confirm_change;
      newsSignals.push(s);
    } else if (s === 'high_solution_density') {
      newsScore += SIGNAL_WEIGHTS.high_solution_density;
      newsSignals.push(s);
    } else if (s === 'evergreen_process') {
      evergreenScore += SIGNAL_WEIGHTS.evergreen_process;
      evergreenSignalsList.push(s);
    } else if (s === 'no_dates_in_text') {
      evergreenScore += SIGNAL_WEIGHTS.no_dates_in_text;
      evergreenSignalsList.push(s);
    }
  }

  // ─── Confidence ─────────────────────────────────────────────
  const totalScore = newsScore + evergreenScore;
  const confidence = totalScore > 0
    ? Math.abs(newsScore - evergreenScore) / totalScore
    : 0;
  const clampedConfidence = Math.min(1, Math.max(0, confidence));

  const scores = {
    news: Math.round(newsScore * 100) / 100,
    evergreen: Math.round(evergreenScore * 100) / 100
  };

  // ─── Décision finale ────────────────────────────────────────
  let mode;
  let reasons;

  if (clampedConfidence < CONFIDENCE_THRESHOLD) {
    // Confiance trop basse : fallback evergreen (c'est le cœur du média)
    mode = 'evergreen';
    reasons = [...evergreenSignalsList, 'low_confidence_fallback'];
  } else if (newsScore > evergreenScore) {
    mode = 'news';
    reasons = newsSignals;
  } else {
    mode = 'evergreen';
    reasons = evergreenSignalsList.length > 0
      ? evergreenSignalsList
      : ['default_evergreen'];
  }

  return buildResult(mode, clampedConfidence, reasons, scores, signals);
}
