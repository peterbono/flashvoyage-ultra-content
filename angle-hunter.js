/**
 * angle-hunter.js
 * 
 * Module pur, déterministe, zéro LLM.
 * Produit un angle éditorial stratégique à partir de extracted, pattern, story.
 * 
 * Consommé par le pipeline entre l'Editorial Router (Step 3.5) et le Generator (Step 4).
 * L'angle est injecté dans generatorInput pour orienter la génération.
 * 
 * @version 1.0
 */

// ─── Safe Accessors ───────────────────────────────────────────────────────────

const safe = (arr) => Array.isArray(arr) ? arr : [];
const safeLen = (arr) => safe(arr).length;
const safeStr = (val) => typeof val === 'string' ? val : '';
const safeNum = (val) => typeof val === 'number' ? val : 0;
const capitalize = (val) => {
  const s = safeStr(val);
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ANGLE_VERSION = '1.0';

const ANGLE_TYPES = {
  CONSENSUS_BREAKER: 'consensus_breaker',
  HIDDEN_RISK: 'hidden_risk',
  COST_ARBITRAGE: 'cost_arbitrage',
  LOGISTIC_DILEMMA: 'logistic_dilemma',
  TIMELINE_TENSION: 'timeline_tension'
};

/** Tie-breaker priority (higher index = lower priority) */
const TIEBREAKER_ORDER = [
  ANGLE_TYPES.CONSENSUS_BREAKER,
  ANGLE_TYPES.HIDDEN_RISK,
  ANGLE_TYPES.COST_ARBITRAGE,
  ANGLE_TYPES.LOGISTIC_DILEMMA,
  ANGLE_TYPES.TIMELINE_TENSION
];

const MODE_CAPS = { news: 1, evergreen: 3 };

// Removed "arbitrage" and "dilemme" from detection — we don't want to reward these words anywhere in the pipeline.
const CONFLICT_WORDS = /\b(vs|mais|risque|erreur|vraiment|coût|cout|perdre|gagner|choisir|ignorer|coûter|couter|différence|écart|surprise)\b/i;

const CONSEQUENCE_WORDS = /\b(coût|cout|temps|risque|confort|argent|jours|euros|heures|budget|perte|dépense|depense|nuit|semaine|mois)\b/i;

const CONSTRAINT_WORDS = /\b(visa|temps|sécurité|securite|santé|sante|délai|delai|limite|interdit|obligation|restriction|quarantaine|vaccination)\b/i;

const DECISION_WORDS = /\b(choisir|renoncer|arbitrer|décider|decider|opter|privilégier|privilegier|sacrifier)\b/i;

const BUDGET_KEYWORDS = /\b(budget|coût|cout|prix|argent|money|cheap|expensive|save|spend|afford|cost|dollar|euro|usd|eur|bahts?|rupee|yen|frais|tarif|dépense|depense)\b/i;

const TRADEOFF_KEYWORDS = /\b(worth|or\b|should\s+i|vs|better\s+to|instead|rather|trade-?off|dilemma|choice|decide|skip|keep|cut|add)\b/i;

/** Strict conflict pairs for contradiction detection in insights */
const CONFLICT_PAIRS = [
  [/\bworth\s*(it|the)\b/i, /\bnot\s+worth\b/i],
  [/\bsafe\b/i, /\b(unsafe|dangerous|risky)\b/i],
  [/\bcheap\b/i, /\b(expensive|overpriced|pricey)\b/i],
  [/\brecommend\b/i, /\b(avoid|skip|don'?t)\b/i],
  [/\bdo\s+it\b/i, /\b(don'?t|save\s+it\s+for|skip)\b/i],
  [/\byes\b/i, /\b(no|nah|nope)\b/i],
  [/\bgo\s+(for|to)\b/i, /\b(skip|avoid|don'?t\s+bother)\b/i]
];

/** Stopwords for anti-tautology check */
const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux',
  'et', 'ou', 'en', 'à', 'a', 'pour', 'par', 'sur', 'dans', 'avec',
  'que', 'qui', 'quoi', 'ce', 'cette', 'ces', 'son', 'sa', 'ses',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'est', 'sont', 'être',
  'the', 'a', 'an', 'to', 'of', 'in', 'for', 'is', 'and', 'or',
  'it', 'my', 'your', 'i', 'we', 'they', 'how', 'what', 'why',
  'not', 'no', 'do', 'does', 'did', 'be', 'have', 'has', 'had',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles',
  'ne', 'pas', 'plus', 'très', 'tres', 'bien', 'aussi',
  'day', 'days', 'trip', 'travel', 'worth', 'taking'
]);

/** Resolver mapping from business_vector.primary + context */
const RESOLVER_MAP = {
  cost_optimization: {
    _default: 'bank_card',
    atm: 'bank_card', bank: 'bank_card', retrait: 'bank_card', cash: 'bank_card',
    flight: 'flight', vol: 'flight', avion: 'flight', booking: 'flight',
    hotel: 'accommodation', hostel: 'accommodation', hébergement: 'accommodation', logement: 'accommodation'
  },
  insurance_necessity: { _default: 'insurance' },
  booking_urgency: { _default: 'flight' },
  connectivity_need: { _default: 'esim' },
  planning_tool: {
    _default: 'tours',
    gear: 'gear', équipement: 'gear', sac: 'gear', backpack: 'gear',
    tour: 'tours', excursion: 'tours', activité: 'tours'
  }
};

/** Competitive positioning templates per angle type */
const COMPETITOR_TEMPLATES = {
  consensus_breaker: {
    what_they_do: 'présentent un consensus rassurant',
    what_we_do: 'confronte les avis contradictoires pour forcer une décision éclairée'
  },
  hidden_risk: {
    what_they_do: 'minimisent les risques réels',
    what_we_do: 'expose les pièges concrets documentés par des voyageurs récents'
  },
  cost_arbitrage: {
    what_they_do: 'listent des prix moyens sans contexte',
    what_we_do: 'montre où l\'argent part vraiment, avec les chiffres d\'un voyageur qui vient de rentrer'
  },
  logistic_dilemma: {
    what_they_do: 'proposent un itinéraire type sans question',
    what_we_do: 'pose les questions que tu te poses la veille de partir et y répond avec un exemple concret'
  },
  timeline_tension: {
    what_they_do: 'annoncent un calendrier moyen sans nuance',
    what_we_do: 'détaille combien de jours suffisent vraiment, avec les retours de voyageurs récents'
  }
};

// ─── Signal Extraction Helpers ────────────────────────────────────────────────

/**
 * Extract all signal counts for source_facts and detectors.
 */
function extractSignals(extracted, pattern, story) {
  const costs = safe(extracted?.post?.evidence?.costs);
  const warnings = safe(extracted?.comments?.warnings);
  const contradictions = safe(extracted?.comments?.contradictions);
  const insights = safe(extracted?.comments?.insights);
  const problems = safe(extracted?.post?.signals?.problems);
  const openQuestions = safe(story?.story?.open_questions);
  const events = safeNum(pattern?.exploitable_events?.count);
  const dates = safe(extracted?.post?.signals?.dates);
  const lessons = safe(story?.story?.author_lessons);
  const consensus = safe(extracted?.comments?.consensus);
  const communityInsights = safe(story?.story?.community_insights);
  const emotionalLoad = pattern?.emotional_load || { score: 0, label: 'low' };
  const storyType = safeStr(pattern?.story_type);
  const themePrimary = safeStr(pattern?.theme_primary);
  const resolution = story?.story?.resolution || null;
  const criticalMoment = story?.story?.critical_moment || null;
  const title = safeStr(extracted?.source?.title || extracted?.title || '');
  const selftext = safeStr(extracted?.post?.clean_text || '');
  const destination = safeStr(extracted?._smart_destination || extracted?.destination || '');

  return {
    costs, warnings, contradictions, insights, problems,
    openQuestions, events, dates, lessons, consensus,
    communityInsights, emotionalLoad, storyType, themePrimary,
    resolution, criticalMoment, title, selftext, destination
  };
}

/**
 * Build source_facts audit array.
 */
function buildSourceFacts(signals) {
  return [
    `costs:${signals.costs.length}`,
    `warnings:${signals.warnings.length}`,
    `contradictions:${signals.contradictions.length}`,
    `insights:${signals.insights.length}`,
    `problems:${signals.problems.length}`,
    `open_questions:${signals.openQuestions.length}`,
    `events:${signals.events}`,
    `dates:${signals.dates.length}`,
    `lessons:${signals.lessons.length}`
  ];
}

// ─── Contradiction Detection (Strict Pairs) ──────────────────────────────────

/**
 * Detect strict conflict pairs in insights/comments.
 * Returns number of confirmed pairs.
 */
function detectConflictPairs(insights) {
  if (insights.length < 2) return 0;
  const texts = insights.map(i => safeStr(i.value || i.body || i.quote || '').toLowerCase());
  let pairsFound = 0;

  for (const [patternA, patternB] of CONFLICT_PAIRS) {
    let hasA = false, hasB = false;
    for (const text of texts) {
      if (patternA.test(text)) hasA = true;
      if (patternB.test(text)) hasB = true;
    }
    if (hasA && hasB) pairsFound++;
  }

  return pairsFound;
}

// ─── Detectors ────────────────────────────────────────────────────────────────

function detectContradiction(signals) {
  const structuredCount = signals.contradictions.length;
  const conflictPairs = detectConflictPairs(signals.insights);
  const rawScore = Math.min(structuredCount / 3, 1.0);
  const bonus = Math.min(conflictPairs * 0.2, 0.4);
  const score = Math.min(rawScore + bonus, 1.0);

  const debugSignals = [];
  if (structuredCount > 0) debugSignals.push(`contradictions:${structuredCount}`);
  if (conflictPairs > 0) debugSignals.push(`conflict_pairs:${conflictPairs}`);

  return { score, signals: debugSignals };
}

function detectRisk(signals) {
  const total = signals.warnings.length + signals.problems.length;
  let score = Math.min(total / 6, 1.0);
  const debugSignals = [];

  if (signals.warnings.length > 0) debugSignals.push(`warnings:${signals.warnings.length}`);
  if (signals.problems.length > 0) debugSignals.push(`problems:${signals.problems.length}`);

  if (signals.storyType === 'warning') {
    score = Math.min(score + 0.2, 1.0);
    debugSignals.push('story_type:warning');
  }

  return { score, signals: debugSignals };
}

function detectCostTension(signals) {
  let costSignals = signals.costs.length;
  const debugSignals = [];

  if (signals.costs.length > 0) debugSignals.push(`costs:${signals.costs.length}`);

  const lessonsWithBudget = signals.lessons.filter(l =>
    BUDGET_KEYWORDS.test(safeStr(l.lesson || l.value || ''))
  );
  costSignals += lessonsWithBudget.length;
  if (lessonsWithBudget.length > 0) debugSignals.push(`budget_lessons:${lessonsWithBudget.length}`);

  let score = Math.min(costSignals / 4, 1.0);

  if (signals.themePrimary === 'money') {
    score = Math.min(score + 0.2, 1.0);
    debugSignals.push('theme:money');
  }

  return { score, signals: debugSignals };
}

function detectDilemma(signals) {
  let dilemmaSignals = signals.openQuestions.length;
  const debugSignals = [];

  if (signals.openQuestions.length > 0) debugSignals.push(`open_questions:${signals.openQuestions.length}`);

  const combinedText = (signals.title + ' ' + signals.selftext).toLowerCase();
  const tradeoffMatches = combinedText.match(TRADEOFF_KEYWORDS);
  if (tradeoffMatches) {
    dilemmaSignals += 1;
    debugSignals.push(`tradeoff_in_text:${tradeoffMatches[0]}`);
  }

  const score = Math.min(dilemmaSignals / 3, 1.0);
  return { score, signals: debugSignals };
}

function detectTimeline(signals) {
  let temporalSignals = 0;
  const debugSignals = [];

  if (signals.events >= 1) {
    temporalSignals += Math.min(signals.events, 3);
    debugSignals.push(`events:${signals.events}`);
  }
  if (signals.dates.length > 0) {
    temporalSignals += signals.dates.length;
    debugSignals.push(`dates:${signals.dates.length}`);
  }

  let score = Math.min(temporalSignals / 4, 1.0);

  if (signals.storyType === 'update_thread') {
    score = Math.min(score + 0.3, 1.0);
    debugSignals.push('story_type:update_thread');
  }

  return { score, signals: debugSignals };
}

// ─── Hook / Tension / Stake Builders ──────────────────────────────────────────

/**
 * Get a safe destination label for templates.
 * NEVER fabricates — uses extracted destination or generic fallback.
 * Returns { name, forPrep } where forPrep is ready for "pour {forPrep}" usage.
 */
function getDestinationLabel(signals) {
  if (signals.destination) {
    const raw = signals.destination.trim();
    const dest = raw.charAt(0).toUpperCase() + raw.slice(1);
    return { name: dest, forPrep: `le ${dest}` };
  }
  return { name: 'cette destination', forPrep: 'cette destination' };
}

/**
 * Extract the most relevant budget string from cost evidence.
 * Picks the LARGEST amount (most likely total budget), not the first.
 * Returns null if none found.
 */
function extractBudgetStr(signals) {
  if (signals.costs.length === 0) return null;
  const withAmounts = signals.costs
    .filter(c => typeof c.amount === 'number' && c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (withAmounts.length > 0) {
    const best = withAmounts[0];
    return `${best.amount} ${best.currency || 'USD'}`;
  }
  const first = signals.costs[0];
  return safeStr(first.value || first.quote || '') || null;
}

/**
 * Determine hook_mode based on available data.
 */
function selectHookMode(signals) {
  if (signals.costs.length > 0) return 'chiffre';
  const allText = signals.warnings.map(w => safeStr(w.value || '')).join(' ') +
    ' ' + signals.problems.join(' ') +
    ' ' + signals.title + ' ' + signals.selftext;
  if (CONSTRAINT_WORDS.test(allText)) return 'contrainte';
  return 'decision';
}

/**
 * Build hook/tension/stake for a given angle type.
 * Returns { hook, hook_mode, tension, stake } or null if cannot build.
 */
function buildAngleContent(angleType, signals) {
  const destLabel = getDestinationLabel(signals);
  const dest = destLabel.name;       // "Vietnam", "Bali", "cette destination"
  const destFor = destLabel.forPrep; // "le Vietnam", "le Bali", "cette destination"
  const hookMode = selectHookMode(signals);
  const budget = extractBudgetStr(signals);

  const builders = {
    consensus_breaker: () => {
      const contradCount = signals.contradictions.length + detectConflictPairs(signals.insights);
      if (hookMode === 'chiffre' && budget) {
        return {
          hook: `Pour un budget de ${budget} vers ${dest}, les avis divergent radicalement : certains recommandent, d'autres mettent en garde contre des frais moins visibles`,
          tension: `Les voyageurs sont divisés sur ce choix — ${contradCount} points de friction identifiés vs le consensus apparent des guides classiques`,
          stake: `Suivre le mauvais avis peut coûter plusieurs centaines d'euros et des jours perdus sur place`
        };
      }
      if (hookMode === 'contrainte') {
        const constraint = findFirstConstraint(signals);
        return {
          hook: `Sur la question de ${constraint} pour ${destFor}, les retours terrain se contredisent frontalement — impossible de trancher sans analyser les deux camps`,
          tension: `Avis contradictoires sur ${constraint} : ${contradCount} points de désaccord identifiés parmi les voyageurs récents`,
          stake: `Choisir le mauvais camp sur ${constraint} peut transformer le voyage en source de stress permanent`
        };
      }
      return {
        hook: `Choisir entre les recommandations contradictoires des voyageurs vers ${dest} oblige à trancher entre ${contradCount} avis divergents`,
        tension: `Les retours terrain se contredisent sur des points cruciaux — impossible de suivre tous les conseils sans sacrifier quelque chose`,
        stake: `Chaque décision non arbitrée risque de coûter du temps, du confort ou de l'argent sur place`
      };
    },

    hidden_risk: () => {
      const riskCount = signals.warnings.length + signals.problems.length;
      if (hookMode === 'chiffre' && budget) {
        return {
          hook: `Avec un budget de ${budget} pour ${destFor}, ${riskCount} risques concrets identifiés par des voyageurs peuvent faire exploser le budget initial`,
          tension: `${riskCount} points sensibles documentés par des voyageurs récents vs le discours rassurant des guides classiques sur ${dest}`,
          stake: `Ignorer ces risques peut coûter entre 50 et 300 euros de frais imprévus par semaine`
        };
      }
      if (hookMode === 'contrainte') {
        const constraint = findFirstConstraint(signals);
        return {
          hook: `Les risques liés à ${constraint} vers ${dest} sont systématiquement sous-estimés par les guides — ${riskCount} alertes concrètes remontées par des voyageurs`,
          tension: `${riskCount} risques concrets documentés vs le discours rassurant des blogs voyage sur ${dest}`,
          stake: `Ignorer ces risques de ${constraint} peut transformer un voyage prévu serein en galère logistique`
        };
      }
      return {
        hook: `Partir vers ${dest} sans connaître les ${riskCount} points sensibles remontés par des voyageurs récents revient à choisir l'improvisation face au risque`,
        tension: `${riskCount} risques concrets identifiés par des voyageurs récents vs le discours rassurant des blogs voyage`,
        stake: `Chaque risque ignoré peut coûter du temps, du confort ou de l'argent sur place`
      };
    },

    cost_arbitrage: () => {
      const costCount = signals.costs.length;
      if (hookMode === 'chiffre' && budget) {
        return {
          hook: `Avec ${budget} pour ${destFor}, ${costCount} postes de dépense reviennent dans la plupart des témoignages — et les écarts réels entre voyageurs vont du simple au triple sur le même itinéraire`,
          tension: `Entre deux voyageurs avec le même budget affiché sur ${dest}, la différence se joue sur 3 ou 4 lignes précises qu'aucun comparateur ne détaille`,
          stake: `Mal calibrer ces postes peut décaler le budget de 10 à 30 % sur un séjour d'une semaine`
        };
      }
      if (hookMode === 'contrainte') {
        const constraint = findFirstConstraint(signals);
        return {
          hook: `${capitalize(constraint)} à ${dest} : l'écart entre ce que les guides annoncent et ce que les voyageurs paient sur place peut atteindre 40 %`,
          tension: `${capitalize(constraint)} est le poste où les chiffres officiels vieillissent le plus vite — un voyageur de mars 2026 et un de mars 2024 ne paient déjà plus la même chose`,
          stake: `Un chiffre périmé sur ce poste décale le budget total de plusieurs centaines d'euros`
        };
      }
      return {
        hook: `Combien ça coûte vraiment de passer ${budget || 'deux semaines'} à ${dest}, ligne par ligne — pas la moyenne des comparateurs mais le détail d'un voyageur rentré cette année`,
        tension: `La différence entre le budget "officiel" d'un guide et ce que paye un voyageur en 2026 se concentre sur 3-4 postes — les autres sont conformes aux chiffres annoncés`,
        stake: `Sur un séjour d'une semaine, l'écart peut représenter le prix de 2 nuits supplémentaires`
      };
    },

    logistic_dilemma: () => {
      const questionCount = signals.openQuestions.length;
      if (hookMode === 'chiffre' && budget) {
        return {
          hook: `Avec ${budget} et un temps limité vers ${dest}, ${questionCount || 'plusieurs'} questions reviennent dans la plupart des témoignages — chaque réponse a un coût concret en jours et en euros`,
          tension: `Chaque jour ajouté à une étape est un jour retiré à une autre : les voyageurs récents vers ${dest} ont répondu différemment selon leur profil`,
          stake: `Mal calibrer ces choix peut coûter des jours entiers et des dizaines d'euros en transports inutiles`
        };
      }
      if (hookMode === 'contrainte') {
        const constraint = findFirstConstraint(signals);
        return {
          hook: `Dans quelle ville commencer ton itinéraire ${dest} quand ${constraint} entre en jeu : 3 profils qui ont fait 3 choix différents`,
          tension: `${capitalize(constraint)} change complètement la logique de l'itinéraire — les retours terrain vers ${dest} le confirment sur plusieurs cas`,
          stake: `Partir sur le mauvais itinéraire peut coûter l'expérience la plus marquante du voyage`
        };
      }
      return {
        hook: `Quelle ville garder et laquelle retirer dans un itinéraire vers ${dest} : ce que les voyageurs récents ont choisi, et pourquoi ils le referaient pareil (ou pas)`,
        tension: `Chaque choix d'itinéraire vers ${dest} a des conséquences concrètes en jours, km et euros — les guides classiques ne donnent jamais ce détail`,
        stake: `Chaque décision mal calibrée risque de coûter une expérience irremplaçable ou des jours de transport inutiles`
      };
    },

    timeline_tension: () => {
      const eventCount = signals.events || signals.dates.length;
      if (hookMode === 'chiffre' && budget) {
        return {
          hook: `Avec ${budget} et ${eventCount} repères de calendrier vers ${dest}, chaque jour compte — un mauvais timing peut coûter une étape entière`,
          tension: `La pression du calendrier vers ${dest} oblige à choisir entre temps disponible et expérience souhaitée, avec un coût chiffré par jour raté`,
          stake: `Un retard d'un seul jour peut forcer à retirer une étape prévue et faire perdre des réservations non remboursables`
        };
      }
      if (hookMode === 'contrainte') {
        const constraint = findFirstConstraint(signals);
        return {
          hook: `Combien de jours à ${dest} avant que la routine s'installe quand ${constraint} impose son rythme : ce qu'en disent les voyageurs de 2 semaines vs 1 mois`,
          tension: `${capitalize(constraint)} vers ${dest} impose un calendrier serré — chaque retard a des conséquences en cascade sur le reste du voyage`,
          stake: `Ignorer ces contraintes de timing risque de faire perdre des étapes entières et des réservations`
        };
      }
      return {
        hook: `Combien de jours suffisent vraiment pour voir ${dest} sans courir : les retours des voyageurs de 2 semaines contre ceux d'un mois`,
        tension: `La pression du calendrier vers ${dest} transforme chaque étape en choix concret — les guides classiques ignorent cette réalité`,
        stake: `Chaque journée mal allouée risque de coûter une expérience irremplaçable ou des frais de transport supplémentaires`
      };
    }
  };

  const builder = builders[angleType];
  if (!builder) return null;

  const content = builder();
  return { ...content, hook_mode: hookMode };
}

/**
 * Find the first constraint word in warnings/problems/title.
 */
function findFirstConstraint(signals) {
  const sources = [
    ...signals.warnings.map(w => safeStr(w.value || '')),
    ...signals.problems.map(p => typeof p === 'string' ? p : safeStr(p.value || '')),
    signals.title,
    signals.selftext.substring(0, 500)
  ];

  for (const text of sources) {
    const match = text.match(CONSTRAINT_WORDS);
    if (match) return match[0].toLowerCase();
  }
  return 'logistique';
}

// ─── Emotional Vector ─────────────────────────────────────────────────────────

function deriveEmotionalVector(signals, angleType) {
  const isHighEmotion = signals.emotionalLoad.label === 'high' || signals.emotionalLoad.score > 60;
  const isUnresolved = signals.resolution?.status === 'unresolved' || signals.resolution?.status === 'ongoing';

  if (isHighEmotion && isUnresolved) return 'fear_to_confidence';
  if (angleType === ANGLE_TYPES.CONSENSUS_BREAKER) return 'doubt_to_decision';
  if (angleType === ANGLE_TYPES.COST_ARBITRAGE && !isUnresolved) return 'frustration_to_optimization';
  if (signals.openQuestions.length > 0) return 'confusion_to_clarity';
  return 'inertia_to_action';
}

// ─── Business Vector ──────────────────────────────────────────────────────────

function deriveBusinessPrimary(themePrimary) {
  const map = {
    money: 'cost_optimization',
    accommodation: 'cost_optimization',
    health: 'insurance_necessity',
    safety: 'insurance_necessity',
    scam: 'insurance_necessity',
    flights: 'booking_urgency',
    esim_connectivity: 'connectivity_need'
  };
  return map[themePrimary] || 'planning_tool';
}

/**
 * Determine affiliate resolver from business primary + context signals.
 */
function deriveResolver(businessPrimary, signals) {
  const resolverGroup = RESOLVER_MAP[businessPrimary] || { _default: 'none' };
  const allText = [
    ...signals.warnings.map(w => safeStr(w.value || '')),
    ...signals.problems.map(p => typeof p === 'string' ? p : safeStr(p.value || '')),
    ...signals.insights.map(i => safeStr(i.value || '')),
    signals.title,
    signals.selftext.substring(0, 500)
  ].join(' ').toLowerCase();

  for (const [keyword, resolver] of Object.entries(resolverGroup)) {
    if (keyword === '_default') continue;
    if (allText.includes(keyword)) return resolver;
  }

  return resolverGroup._default || 'none';
}

/**
 * Build 2-segment affiliate friction from the winning detector's signals.
 */
function buildAffiliateFriction(angleType, signals, resolver) {
  if (resolver === 'none') return null;

  const { name: dest } = getDestinationLabel(signals);
  const frictionBuilders = {
    bank_card: {
      moment: `au moment de retirer du cash ou payer par carte au ${dest}`,
      cost_of_inaction: `frais bancaires de 3-8% par transaction + taux de change défavorable`
    },
    insurance: {
      moment: `au moment de faire face à un problème de santé ou une annulation au ${dest}`,
      cost_of_inaction: `frais médicaux pouvant atteindre plusieurs milliers d'euros sans couverture`
    },
    esim: {
      moment: `au moment de chercher une connexion internet fiable au ${dest}`,
      cost_of_inaction: `dépendance au WiFi public + impossibilité de naviguer ou réserver en déplacement`
    },
    flight: {
      moment: `au moment de réserver les vols internes ou connexions au ${dest}`,
      cost_of_inaction: `prix qui doublent en dernière minute + itinéraire contraint par les disponibilités`
    },
    accommodation: {
      moment: `au moment de choisir un hébergement au ${dest}`,
      cost_of_inaction: `options saturées en haute saison + surcoût de 30-50% sur les réservations tardives`
    },
    vpn: {
      moment: `au moment d'accéder à ses services habituels depuis ${dest}`,
      cost_of_inaction: `services bancaires et réseaux sociaux inaccessibles sans protection`
    },
    tours: {
      moment: `au moment d'organiser les excursions et activités au ${dest}`,
      cost_of_inaction: `prix gonflés sur place + arnaques touristiques fréquentes sans réservation`
    },
    gear: {
      moment: `au moment de préparer son équipement pour ${dest}`,
      cost_of_inaction: `matériel inadapté + rachats sur place à prix touristique majoré`
    }
  };

  const friction = frictionBuilders[resolver];
  if (!friction) return null;

  // Enhance with specific data from evidence if available
  const enhanced = { ...friction, resolver };

  // Try to enrich moment/cost with real data
  if (resolver === 'bank_card' && signals.costs.length > 0) {
    const costStr = signals.costs.map(c => safeStr(c.value || `${c.amount} ${c.currency}`)).join(', ');
    if (costStr.length > 5) {
      enhanced.cost_of_inaction = `frais bancaires concrets identifiés : ${costStr.substring(0, 80)}`;
    }
  }

  return enhanced;
}

// ─── Competitive Positioning ──────────────────────────────────────────────────

function buildCompetitivePositioning(angleType) {
  const template = COMPETITOR_TEMPLATES[angleType] || COMPETITOR_TEMPLATES.logistic_dilemma;
  return `Contrairement aux guides classiques qui ${template.what_they_do}, cet article ${template.what_we_do} en s'appuyant sur des témoignages terrain.`;
}

// ─── SEO Intent ───────────────────────────────────────────────────────────────

function deriveSeoIntent(storyType, themePrimary) {
  if (storyType === 'question' && !['money', 'accommodation', 'flights'].includes(themePrimary)) {
    return 'informational';
  }
  if (['warning', 'guide'].includes(storyType) && ['money', 'accommodation'].includes(themePrimary)) {
    return 'commercial_investigation';
  }
  if (['list', 'guide'].includes(storyType) && ['gear', 'esim_connectivity'].includes(themePrimary)) {
    return 'transactional';
  }
  return 'informational';
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Tokenize a string for tautology check (lowercase, remove stopwords).
 */
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Check if tension is a tautology of the title (>60% token overlap).
 */
function isTautology(tension, title) {
  const titleTokens = tokenize(title);
  if (titleTokens.length === 0) return false;
  const tensionTokens = new Set(tokenize(tension));
  const overlap = titleTokens.filter(t => tensionTokens.has(t)).length;
  return (overlap / titleTokens.length) > 0.6;
}

/**
 * Validate a complete angle output.
 * Returns { valid: boolean, reasons: string[] }
 */
function validateAngle(angle, title) {
  const reasons = [];

  if (angle.primary_angle.tension.length < 40) {
    reasons.push(`tension trop courte: ${angle.primary_angle.tension.length} < 40`);
  }
  if (angle.primary_angle.stake.length < 30) {
    reasons.push(`stake trop court: ${angle.primary_angle.stake.length} < 30`);
  }
  if (angle.primary_angle.hook.length < 60) {
    reasons.push(`hook trop court: ${angle.primary_angle.hook.length} < 60`);
  }

  if (!CONFLICT_WORDS.test(angle.primary_angle.tension)) {
    reasons.push('tension sans mot de conflit');
  }

  if (!CONSEQUENCE_WORDS.test(angle.primary_angle.stake)) {
    reasons.push('stake sans mot de conséquence');
  }

  const mode = angle.primary_angle.hook_mode;
  if (mode === 'chiffre' && !/\d/.test(angle.primary_angle.hook)) {
    reasons.push('hook mode chiffre sans chiffre');
  }
  if (mode === 'contrainte' && !CONSTRAINT_WORDS.test(angle.primary_angle.hook)) {
    reasons.push('hook mode contrainte sans mot de contrainte');
  }
  if (mode === 'decision' && !DECISION_WORDS.test(angle.primary_angle.hook)) {
    reasons.push('hook mode decision sans mot de décision');
  }

  if (isTautology(angle.primary_angle.tension, title)) {
    reasons.push('tension est une tautologie du titre (>60% overlap)');
  }

  const friction = angle.business_vector.affiliate_friction;
  if (friction !== null) {
    if (!friction.moment || friction.moment.length < 15) {
      reasons.push(`friction.moment trop court: ${friction.moment?.length || 0} < 15`);
    }
    if (!friction.cost_of_inaction || friction.cost_of_inaction.length < 15) {
      reasons.push(`friction.cost_of_inaction trop court: ${friction.cost_of_inaction?.length || 0} < 15`);
    }
    if (friction.resolver === 'none') {
      reasons.push('friction non-null mais resolver=none');
    }
  }

  if (friction === null && angle.business_vector.max_placements > 0) {
    reasons.push('max_placements > 0 mais friction null');
  }

  return { valid: reasons.length === 0, reasons };
}

// ─── Main Hunt Function ───────────────────────────────────────────────────────

/**
 * @param {Object} extracted - Output from reddit-semantic-extractor
 * @param {Object} pattern - Output from reddit-pattern-detector
 * @param {Object} story - Output from reddit-story-compiler
 * @param {string} editorialMode - 'news' or 'evergreen'
 * @returns {Object} Angle hunter result
 */
function hunt(extracted, pattern, story, editorialMode = 'evergreen') {
  const signals = extractSignals(extracted, pattern, story);
  const sourceFacts = buildSourceFacts(signals);

  // Run all 5 detectors
  const detectors = {
    [ANGLE_TYPES.CONSENSUS_BREAKER]: detectContradiction(signals),
    [ANGLE_TYPES.HIDDEN_RISK]: detectRisk(signals),
    [ANGLE_TYPES.COST_ARBITRAGE]: detectCostTension(signals),
    [ANGLE_TYPES.LOGISTIC_DILEMMA]: detectDilemma(signals),
    [ANGLE_TYPES.TIMELINE_TENSION]: detectTimeline(signals)
  };

  // Sort by score, then by tiebreaker order
  const ranked = TIEBREAKER_ORDER
    .map(type => ({ type, ...detectors[type] }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return TIEBREAKER_ORDER.indexOf(a.type) - TIEBREAKER_ORDER.indexOf(b.type);
    });

  // Derive common vectors
  const businessPrimary = deriveBusinessPrimary(signals.themePrimary);
  const seoIntent = deriveSeoIntent(signals.storyType, signals.themePrimary);

  // Try each candidate in order until one passes validation
  for (const candidate of ranked) {
    if (candidate.score === 0) continue;

    const content = buildAngleContent(candidate.type, signals);
    if (!content) continue;

    const emotionalVector = deriveEmotionalVector(signals, candidate.type);
    const resolver = deriveResolver(businessPrimary, signals);
    const friction = buildAffiliateFriction(candidate.type, signals, resolver);

    const modeCap = MODE_CAPS[editorialMode] || 1;
    const rawPlacements = friction ? Math.min(Math.ceil(candidate.score * 3), 3) : 0;
    const minPlacements = editorialMode === 'evergreen' ? 1 : 0;
    const maxPlacements = Math.max(Math.min(rawPlacements, modeCap), minPlacements);

    const angle = {
      angle_version: ANGLE_VERSION,
      source_facts: sourceFacts,
      primary_angle: {
        type: candidate.type,
        hook: content.hook,
        hook_mode: content.hook_mode,
        tension: content.tension,
        stake: content.stake
      },
      emotional_vector: emotionalVector,
      business_vector: {
        primary: businessPrimary,
        affiliate_friction: friction ? { moment: friction.moment, cost_of_inaction: friction.cost_of_inaction, resolver: friction.resolver } : null,
        max_placements: friction === null ? 0 : maxPlacements
      },
      seo_intent: seoIntent,
      competitive_positioning: buildCompetitivePositioning(candidate.type),
      _debug: {
        detectors,
        winner: candidate.type,
        confidence: Math.round(candidate.score * 100) / 100,
        fallback: false
      }
    };

    const validation = validateAngle(angle, signals.title);
    if (validation.valid) {
      return angle;
    }

    // Log validation failure for debugging
    console.warn(`   ⚠️ ANGLE_HUNTER: ${candidate.type} rejeté (${validation.reasons.join(', ')})`);
  }

  // Fallback: logistic_dilemma from title
  console.warn('   ⚠️ ANGLE_HUNTER: fallback activé (aucun détecteur validé)');
  return buildFallback(signals, sourceFacts, detectors, businessPrimary, seoIntent, editorialMode);
}

/**
 * Build fallback angle when all detectors fail validation.
 */
function buildFallback(signals, sourceFacts, detectors, businessPrimary, seoIntent, editorialMode) {
  const { name: dest } = getDestinationLabel(signals);
  const fallbackMinPlacements = editorialMode === 'evergreen' ? 1 : 0;

  return {
    angle_version: ANGLE_VERSION,
    source_facts: sourceFacts,
    primary_angle: {
      type: ANGLE_TYPES.LOGISTIC_DILEMMA,
      hook: `Décider comment organiser son voyage vers ${dest} oblige à trancher entre des choix qui semblent tous raisonnables mais qui ont chacun un coût moins visible`,
      hook_mode: 'decision',
      tension: `Les choix logistiques vers ${dest} impliquent des renoncements que les guides classiques ne posent jamais`,
      stake: `Chaque décision non anticipée risque de coûter du temps ou du confort sur place`
    },
    emotional_vector: 'inertia_to_action',
    business_vector: {
      primary: businessPrimary,
      affiliate_friction: null,
      max_placements: fallbackMinPlacements
    },
    seo_intent: seoIntent,
    competitive_positioning: buildCompetitivePositioning(ANGLE_TYPES.LOGISTIC_DILEMMA),
    _debug: {
      detectors,
      winner: ANGLE_TYPES.LOGISTIC_DILEMMA,
      confidence: 0,
      fallback: true
    }
  };
}

// ─── Export ────────────────────────────────────────────────────────────────────

const AngleHunter = { hunt, ANGLE_VERSION };
export default AngleHunter;
export { hunt, ANGLE_VERSION };
