/**
 * article-outline-builder.js
 *
 * Module pur, déterministe, zéro LLM.
 * Construit un plan d'article structuré (outline) à partir des données extraites,
 * du story compilé, de l'angle éditorial et du truth pack.
 *
 * Consommé par le pipeline entre Angle Hunter (Step 3.7) et Generator (Step 4).
 * L'outline est injecté dans generatorInput pour structurer la génération.
 *
 * @version 1.0
 */

// ─── Safe Accessors ───────────────────────────────────────────────────────────

const safe = (arr) => Array.isArray(arr) ? arr : [];
const safeStr = (val) => typeof val === 'string' ? val : '';
const safeNum = (val) => typeof val === 'number' ? val : 0;

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTLINE_VERSION = '1.0';

/**
 * Section templates per angle type.
 * Each template defines 4-6 sections with title pattern, key points focus,
 * and CTA slot eligibility.
 */
const ANGLE_SECTION_TEMPLATES = {
  consensus_breaker: [
    { titlePattern: 'Ce que les voyageurs disent vraiment sur {topic}', focus: 'contradictions', ctaSlot: false },
    { titlePattern: 'Pourquoi les avis divergent autant sur {topic}', focus: 'analysis', ctaSlot: false },
    { titlePattern: 'Les coûts réels que personne ne mentionne', focus: 'costs', ctaSlot: true },
    { titlePattern: 'Comment trancher entre les avis contradictoires', focus: 'decision', ctaSlot: true },
    { titlePattern: 'Le verdict terrain : ce qui fonctionne vraiment', focus: 'verdict', ctaSlot: false }
  ],
  hidden_risk: [
    { titlePattern: 'Les risques que les guides classiques ignorent sur {topic}', focus: 'warnings', ctaSlot: false },
    { titlePattern: 'Pourquoi ces pièges passent sous le radar', focus: 'analysis', ctaSlot: false },
    { titlePattern: 'Ce que ça coûte concrètement de ne pas anticiper', focus: 'costs', ctaSlot: true },
    { titlePattern: 'Comment éviter chaque piège identifié', focus: 'solutions', ctaSlot: true },
    { titlePattern: 'Le plan d\'action anti-galère', focus: 'action_plan', ctaSlot: false }
  ],
  cost_arbitrage: [
    { titlePattern: 'Le vrai budget pour {topic} : au-delà des chiffres annoncés', focus: 'costs', ctaSlot: false },
    { titlePattern: 'Les coûts cachés qui font déraper le budget', focus: 'hidden_costs', ctaSlot: true },
    { titlePattern: 'Comparer les options : où va ton argent', focus: 'comparison', ctaSlot: true },
    { titlePattern: 'Comment optimiser chaque poste de dépense', focus: 'optimization', ctaSlot: true },
    { titlePattern: 'Le budget réaliste et le plan pour s\'y tenir', focus: 'verdict', ctaSlot: false }
  ],
  logistic_dilemma: [
    { titlePattern: 'Le dilemme central : {topic}', focus: 'dilemma', ctaSlot: false },
    { titlePattern: 'Option A vs Option B : ce que chaque choix implique', focus: 'comparison', ctaSlot: false },
    { titlePattern: 'Les contraintes que personne ne t\'explique', focus: 'constraints', ctaSlot: true },
    { titlePattern: 'Comment décider sans regretter', focus: 'decision', ctaSlot: true },
    { titlePattern: 'Le plan logistique étape par étape', focus: 'action_plan', ctaSlot: false }
  ],
  timeline_tension: [
    { titlePattern: 'Le calendrier réel pour {topic}', focus: 'timeline', ctaSlot: false },
    { titlePattern: 'Les étapes qui prennent plus de temps que prévu', focus: 'delays', ctaSlot: false },
    { titlePattern: 'Comment optimiser chaque journée sur place', focus: 'optimization', ctaSlot: true },
    { titlePattern: 'Les arbitrages temporels inévitables', focus: 'tradeoffs', ctaSlot: true },
    { titlePattern: 'Le planning optimisé jour par jour', focus: 'action_plan', ctaSlot: false }
  ],

  // SEO-first templates: neutral, informational, keyword-optimized (used when ARTICLE_HINT is set)
  seo_informational: [
    { titlePattern: '{topic} : guide complet et conseils pratiques', focus: 'overview', ctaSlot: false },
    { titlePattern: 'Prix, options et comparatif détaillé', focus: 'comparison', ctaSlot: true },
    { titlePattern: 'Comment choisir : critères et recommandations', focus: 'decision', ctaSlot: true },
    { titlePattern: 'Questions fréquentes et réponses concrètes', focus: 'faq', ctaSlot: false },
    { titlePattern: 'Notre avis et verdict final', focus: 'verdict', ctaSlot: true }
  ],
  seo_comparison: [
    { titlePattern: '{topic} : tableau comparatif complet', focus: 'comparison_table', ctaSlot: false },
    { titlePattern: 'Prix et fonctionnalités côte à côte', focus: 'pricing', ctaSlot: true },
    { titlePattern: 'Avantages et inconvénients de chaque option', focus: 'pros_cons', ctaSlot: false },
    { titlePattern: 'Quel choix selon votre profil', focus: 'recommendation', ctaSlot: true },
    { titlePattern: 'FAQ et questions pratiques', focus: 'faq', ctaSlot: false }
  ],
  seo_budget: [
    { titlePattern: 'Budget détaillé pour {topic} : poste par poste', focus: 'breakdown', ctaSlot: false },
    { titlePattern: 'Hébergement, transport, nourriture : les vrais prix', focus: 'categories', ctaSlot: true },
    { titlePattern: 'Astuces pour réduire les coûts sans sacrifier l\'expérience', focus: 'tips', ctaSlot: true },
    { titlePattern: 'Budget par profil : backpacker, confort, luxe', focus: 'profiles', ctaSlot: false },
    { titlePattern: 'Récapitulatif et budget journalier moyen', focus: 'summary', ctaSlot: false }
  ],
};

// ─── Hook Suggestion Builder ──────────────────────────────────────────────────

/**
 * Build a hook suggestion based on extracted data and story.
 * Returns a structured hook object the LLM can use as starting point.
 */
function buildHookSuggestion(extracted, story) {
  const costs = safe(extracted?.post?.evidence?.costs || extracted?.post?.signals?.costs);
  const warnings = safe(extracted?.comments?.warnings);
  const title = safeStr(extracted?.source?.title || extracted?.title || '');
  const resolution = story?.story?.resolution || null;

  // Pick hook strategy based on available data
  if (costs.length > 0) {
    const firstCost = costs[0];
    const amount = firstCost?.amount || firstCost?.value || '';
    return {
      strategy: 'chiffre_choc',
      element: safeStr(typeof amount === 'number' ? `${amount} ${firstCost.currency || 'USD'}` : String(amount)),
      context: `Chiffre concret issu du témoignage : ${title.substring(0, 80)}`
    };
  }

  if (warnings.length > 0) {
    return {
      strategy: 'alerte_terrain',
      element: safeStr(warnings[0]?.value || warnings[0] || '').substring(0, 100),
      context: 'Avertissement remonté par des voyageurs récents'
    };
  }

  if (resolution?.status === 'unresolved' || resolution?.status === 'ongoing') {
    return {
      strategy: 'question_ouverte',
      element: safeStr(resolution?.summary || '').substring(0, 100),
      context: 'Situation non résolue qui interpelle le lecteur'
    };
  }

  return {
    strategy: 'tension_editoriale',
    element: title.substring(0, 100),
    context: 'Tension extraite du titre du témoignage'
  };
}

// ─── Quick Guide Builder ──────────────────────────────────────────────────────

/**
 * Build a deterministic quick guide from extracted data.
 * Returns 3-5 bullet points summarizing key takeaways.
 */
function buildQuickGuide(extracted) {
  const bullets = [];
  const costs = safe(extracted?.post?.evidence?.costs || extracted?.post?.signals?.costs);
  const warnings = safe(extracted?.comments?.warnings);
  const locations = safe(extracted?.post?.signals?.locations);
  const lessons = safe(extracted?.comments?.insights);
  const destination = safeStr(extracted?._smart_destination || extracted?.destination || '');

  if (destination) {
    bullets.push(`Destination principale : ${destination}`);
  }

  if (costs.length > 0) {
    const costSummary = costs.slice(0, 2).map(c => {
      if (typeof c === 'string') return c;
      return c?.value || (c?.amount ? `${c.amount} ${c.currency || ''}`.trim() : '');
    }).filter(Boolean).join(', ');
    if (costSummary) bullets.push(`Budget mentionné : ${costSummary}`);
  }

  if (warnings.length > 0) {
    bullets.push(`${warnings.length} point(s) de vigilance identifié(s) par les voyageurs`);
  }

  if (locations.length > 1) {
    const locs = locations.slice(0, 4).map(l => safeStr(typeof l === 'string' ? l : l?.value || '')).filter(Boolean);
    if (locs.length > 1) bullets.push(`Lieux mentionnés : ${locs.join(', ')}`);
  }

  if (lessons.length > 0) {
    const firstLesson = safeStr(lessons[0]?.value || lessons[0]?.insight || '');
    if (firstLesson) bullets.push(`Enseignement clé : ${firstLesson.substring(0, 80)}`);
  }

  // Ensure at least 3 bullets
  while (bullets.length < 3) {
    bullets.push('Analyse complète du témoignage ci-dessous');
  }

  return bullets.slice(0, 5);
}

// ─── FAQ Topics Extractor ─────────────────────────────────────────────────────

/**
 * Extract FAQ-worthy topics from extracted data and story.
 * Returns 3-5 question topics suitable for an FAQ section.
 */
function extractFaqTopics(extracted, story) {
  const topics = [];
  const openQuestions = safe(story?.story?.open_questions);
  const destination = safeStr(extracted?._smart_destination || extracted?.destination || '');
  const themePrimary = safeStr(extracted?.post?.signals?.theme_primary || '');
  const warnings = safe(extracted?.comments?.warnings);
  const costs = safe(extracted?.post?.evidence?.costs || extracted?.post?.signals?.costs);

  // Pull from open questions first (most relevant)
  for (const q of openQuestions.slice(0, 3)) {
    const text = safeStr(typeof q === 'string' ? q : q?.question || '');
    if (text.length > 10) topics.push(text);
  }

  // Generate FAQ topics from data signals
  if (costs.length > 0 && !topics.some(t => /budget|co[uû]t|prix/i.test(t))) {
    topics.push(`Quel budget prévoir pour ${destination || 'cette destination'} ?`);
  }

  if (warnings.length > 0 && !topics.some(t => /risque|danger|piège|éviter/i.test(t))) {
    topics.push(`Quels sont les pièges à éviter ${destination ? 'au ' + destination : ''} ?`);
  }

  if (destination && !topics.some(t => /quand|période|saison/i.test(t))) {
    topics.push(`Quelle est la meilleure période pour visiter ${destination} ?`);
  }

  // Cap at 5
  return topics.slice(0, 5);
}

// ─── Verdict Direction ────────────────────────────────────────────────────────

/**
 * Determine the editorial verdict direction from story data.
 * Returns a structured verdict suggestion (not the verdict itself).
 */
function determineVerdictDirection(story) {
  const resolution = story?.story?.resolution || {};
  const lessons = safe(story?.story?.author_lessons);
  const communityInsights = safe(story?.story?.community_insights);

  if (resolution.status === 'positive' || resolution.status === 'resolved') {
    return {
      tone: 'positive_nuance',
      direction: 'Expérience globalement positive avec réserves importantes',
      hasConditions: lessons.length > 0
    };
  }

  if (resolution.status === 'negative' || resolution.status === 'warning') {
    return {
      tone: 'cautious',
      direction: 'Expérience mitigée — faisable sous conditions strictes',
      hasConditions: true
    };
  }

  if (resolution.status === 'unresolved' || resolution.status === 'ongoing') {
    return {
      tone: 'open_question',
      direction: 'Situation dépend fortement du profil du voyageur',
      hasConditions: true
    };
  }

  // Default: balanced
  return {
    tone: 'balanced',
    direction: 'Plusieurs options valides selon les priorités du voyageur',
    hasConditions: communityInsights.length > 1
  };
}

// ─── Section Builder ──────────────────────────────────────────────────────────

/**
 * Build section outlines based on angle type and available data.
 * Each section includes title, keyPoints, evidence, truthPackNumbers, ctaSlot.
 */
function buildSections(extracted, story, angle, truthPack) {
  const angleType = safeStr(angle?.primary_angle?.type || 'logistic_dilemma');
  const templates = ANGLE_SECTION_TEMPLATES[angleType] || ANGLE_SECTION_TEMPLATES.logistic_dilemma;
  const destination = safeStr(extracted?._smart_destination || extracted?.destination || 'cette destination');
  const title = safeStr(extracted?.source?.title || extracted?.title || '');

  // Derive topic from title or destination
  const topic = title.length > 20 ? title.substring(0, 60) : destination;

  // Collect all evidence by type for assignment to sections
  const evidencePool = collectEvidence(extracted, story);
  const truthNumbers = safe(truthPack?.allowedNumbers);

  const sections = [];

  for (const template of templates) {
    const section = {
      title: template.titlePattern.replace(/\{topic\}/g, topic),
      keyPoints: buildKeyPoints(template.focus, evidencePool, story, extracted),
      evidence: assignEvidence(template.focus, evidencePool),
      truthPackNumbers: assignTruthNumbers(template.focus, truthNumbers, evidencePool),
      ctaSlot: template.ctaSlot
    };
    sections.push(section);
  }

  return sections;
}

/**
 * Collect all available evidence into typed pools for section assignment.
 */
function collectEvidence(extracted, story) {
  const costs = safe(extracted?.post?.evidence?.costs || extracted?.post?.signals?.costs);
  const warnings = safe(extracted?.comments?.warnings);
  const contradictions = safe(extracted?.comments?.contradictions);
  const insights = safe(extracted?.comments?.insights);
  const problems = safe(extracted?.post?.signals?.problems);
  const locations = safe(extracted?.post?.signals?.locations);
  const dates = safe(extracted?.post?.signals?.dates);
  const lessons = safe(story?.story?.author_lessons);
  const communityInsights = safe(story?.story?.community_insights);
  const openQuestions = safe(story?.story?.open_questions);
  const sourceSnippets = safe(story?.evidence?.source_snippets);

  return {
    costs: costs.map(c => typeof c === 'string' ? c : (c?.value || `${c?.amount || ''} ${c?.currency || ''}`.trim())).filter(Boolean),
    warnings: warnings.map(w => safeStr(w?.value || w || '')).filter(Boolean),
    contradictions: contradictions.map(c => safeStr(c?.value || c || '')).filter(Boolean),
    insights: insights.map(i => safeStr(i?.value || i?.insight || i || '')).filter(Boolean),
    problems: problems.map(p => typeof p === 'string' ? p : safeStr(p?.value || '')).filter(Boolean),
    locations: locations.map(l => safeStr(typeof l === 'string' ? l : l?.value || '')).filter(Boolean),
    dates: dates.map(d => safeStr(typeof d === 'string' ? d : d?.value || '')).filter(Boolean),
    lessons: lessons.map(l => safeStr(typeof l === 'string' ? l : l?.lesson || '')).filter(Boolean),
    communityInsights: communityInsights.map(c => safeStr(typeof c === 'string' ? c : c?.value || c?.insight || '')).filter(Boolean),
    openQuestions: openQuestions.map(q => safeStr(typeof q === 'string' ? q : q?.question || '')).filter(Boolean),
    sourceSnippets: sourceSnippets.map(s => safeStr(s?.snippet || '')).filter(Boolean).slice(0, 8)
  };
}

/**
 * Build 2-3 key points for a section based on its focus area.
 */
function buildKeyPoints(focus, evidencePool, story, extracted) {
  const points = [];

  switch (focus) {
    case 'contradictions':
      if (evidencePool.contradictions.length > 0) points.push('Confronter les avis divergents des voyageurs récents');
      if (evidencePool.insights.length > 0) points.push('Analyser pourquoi les expériences diffèrent');
      points.push('Identifier les facteurs qui influencent le résultat');
      break;

    case 'warnings':
      if (evidencePool.warnings.length > 0) points.push(`${evidencePool.warnings.length} risque(s) concret(s) documenté(s) par des voyageurs`);
      if (evidencePool.problems.length > 0) points.push('Problèmes récurrents identifiés dans les témoignages');
      points.push('Impact concret sur le budget et le confort');
      break;

    case 'costs':
    case 'hidden_costs':
      if (evidencePool.costs.length > 0) points.push(`${evidencePool.costs.length} poste(s) de dépense identifié(s)`);
      points.push('Comparer le budget annoncé vs le budget réel');
      points.push('Identifier les frais que les guides ne mentionnent pas');
      break;

    case 'comparison':
      points.push('Tableau comparatif des options disponibles');
      if (evidencePool.communityInsights.length > 0) points.push('Avis de la communauté sur chaque option');
      points.push('Critères de choix selon le profil du voyageur');
      break;

    case 'analysis':
      points.push('Analyser les causes profondes du phénomène');
      if (evidencePool.lessons.length > 0) points.push('Leçons tirées par les voyageurs expérimentés');
      points.push('Facteurs contextuels à prendre en compte');
      break;

    case 'decision':
    case 'solutions':
      points.push('Critères de décision concrets et actionnables');
      if (evidencePool.lessons.length > 0) points.push('Retour d\'expérience des voyageurs sur ce choix');
      points.push('Checklist de vérification avant de décider');
      break;

    case 'optimization':
      points.push('Stratégies concrètes pour optimiser le rapport qualité/prix');
      if (evidencePool.costs.length > 0) points.push('Postes de dépense où l\'optimisation est la plus rentable');
      points.push('Astuces terrain remontées par les voyageurs');
      break;

    case 'timeline':
    case 'delays':
      if (evidencePool.dates.length > 0) points.push(`${evidencePool.dates.length} repère(s) temporel(s) identifié(s)`);
      points.push('Durées réelles vs durées annoncées par les guides');
      points.push('Contraintes de calendrier à anticiper');
      break;

    case 'dilemma':
      if (evidencePool.openQuestions.length > 0) points.push('Les questions que chaque voyageur se pose');
      points.push('Les compromis inévitables de ce choix');
      points.push('Ce que chaque option implique concrètement');
      break;

    case 'constraints':
      points.push('Contraintes logistiques peu documentées');
      if (evidencePool.warnings.length > 0) points.push('Obstacles pratiques remontés du terrain');
      points.push('Impact sur l\'itinéraire et le planning');
      break;

    case 'tradeoffs':
      points.push('Les arbitrages temporels inévitables');
      points.push('Ce que tu sacrifies en choisissant chaque option');
      if (evidencePool.communityInsights.length > 0) points.push('Retours de la communauté sur ces compromis');
      break;

    case 'action_plan':
      points.push('Plan d\'action étape par étape');
      if (evidencePool.lessons.length > 0) points.push('Intégrer les leçons des voyageurs précédents');
      points.push('Checklist concrète avant le départ');
      break;

    case 'verdict':
      points.push('Synthèse des arguments pour et contre');
      points.push('Recommandation finale selon le profil');
      if (evidencePool.communityInsights.length > 0) points.push('Consensus (ou non) de la communauté');
      break;

    default:
      points.push('Analyse approfondie de ce point');
      points.push('Données terrain et retours d\'expérience');
      points.push('Recommandation concrète');
  }

  return points.slice(0, 3);
}

/**
 * Assign relevant evidence snippets to a section based on its focus.
 */
function assignEvidence(focus, evidencePool) {
  const evidence = [];

  const focusMapping = {
    contradictions: ['contradictions', 'insights'],
    warnings: ['warnings', 'problems'],
    costs: ['costs'],
    hidden_costs: ['costs', 'warnings'],
    comparison: ['communityInsights', 'insights'],
    analysis: ['insights', 'lessons'],
    decision: ['lessons', 'communityInsights'],
    solutions: ['lessons', 'communityInsights'],
    optimization: ['costs', 'lessons'],
    timeline: ['dates'],
    delays: ['dates', 'warnings'],
    dilemma: ['openQuestions', 'contradictions'],
    constraints: ['warnings', 'problems'],
    tradeoffs: ['openQuestions', 'communityInsights'],
    action_plan: ['lessons', 'communityInsights'],
    verdict: ['communityInsights', 'insights']
  };

  const sources = focusMapping[focus] || ['sourceSnippets'];

  for (const source of sources) {
    const pool = evidencePool[source] || [];
    for (const item of pool.slice(0, 2)) {
      if (item && item.length > 5) {
        evidence.push(item.substring(0, 150));
      }
    }
  }

  // Always add a source snippet if available and evidence is thin
  if (evidence.length < 2 && evidencePool.sourceSnippets.length > 0) {
    evidence.push(evidencePool.sourceSnippets[0].substring(0, 150));
  }

  return evidence.slice(0, 3);
}

/**
 * Assign truth pack numbers relevant to a section focus.
 */
function assignTruthNumbers(focus, truthNumbers, evidencePool) {
  if (truthNumbers.length === 0) return [];

  // Cost-focused sections get all numbers
  if (['costs', 'hidden_costs', 'optimization', 'comparison'].includes(focus)) {
    return truthNumbers.slice(0, 5);
  }

  // Timeline sections get date-related numbers
  if (['timeline', 'delays', 'tradeoffs'].includes(focus)) {
    return truthNumbers.filter(n => /\d+\s*(day|jour|week|semaine|month|mois|hour|heure)/i.test(n)).slice(0, 3);
  }

  // Other sections get at most 2 numbers
  return truthNumbers.slice(0, 2);
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

/**
 * Build a complete article outline from pipeline data.
 *
 * @param {Object} extracted - Output from reddit-semantic-extractor
 * @param {Object} story - Output from reddit-story-compiler
 * @param {Object} angle - Output from angle-hunter
 * @param {Object} truthPack - Output from buildPromptTruthPack (allowedNumbers, allowedLocations, isPoor)
 * @returns {Object} Structured article outline
 */
export function buildArticleOutline(extracted, story, angle, truthPack) {
  const angleType = safeStr(angle?.primary_angle?.type || 'logistic_dilemma');

  const outline = {
    outline_version: OUTLINE_VERSION,
    editorialAngle: angleType,
    hookSuggestion: buildHookSuggestion(extracted, story),
    sections: [],
    mandatoryElements: {
      quickGuide: buildQuickGuide(extracted),
      faqTopics: extractFaqTopics(extracted, story),
      verdictDirection: determineVerdictDirection(story)
    },
    _meta: {
      sectionCount: 0,
      ctaSlots: 0,
      evidenceItems: 0,
      truthPackNumbers: safeNum(truthPack?.allowedNumbers?.length)
    }
  };

  // Build sections based on angle type
  outline.sections = buildSections(extracted, story, angle, truthPack);

  // Populate meta
  outline._meta.sectionCount = outline.sections.length;
  outline._meta.ctaSlots = outline.sections.filter(s => s.ctaSlot).length;
  outline._meta.evidenceItems = outline.sections.reduce((sum, s) => sum + s.evidence.length, 0);

  return outline;
}

export { OUTLINE_VERSION };
export default { buildArticleOutline, OUTLINE_VERSION };
