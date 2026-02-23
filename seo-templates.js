/**
 * SEO Templates — Generateurs HTML pour les pages SEO programmatiques.
 *
 * Chaque template prend un objet `data` (destination + donnees live) et
 * retourne { title, slug, content, excerpt, metaDescription, schema }.
 */

// ─── HELPERS ────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function monthName(m) {
  return ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][m - 1] || '';
}

function currentMonth() {
  const d = new Date();
  return `${monthName(d.getMonth() + 1)} ${d.getFullYear()}`;
}

function budgetLabel(level) {
  return { low: 'Petit budget', mid: 'Budget moyen', high: 'Budget élevé' }[level] || 'Budget moyen';
}

function priceBlock(flight) {
  if (!flight) return '<p>Prix non disponible actuellement — consultez le widget ci-dessous pour les tarifs en temps réel.</p>';
  return `<p>Le vol aller-retour <strong>Paris → ${escHtml(flight.destination || '')}</strong> est disponible à partir de <strong>${flight.minPrice} €</strong> (moyenne ${flight.avgPrice} €, basé sur ${flight.sampleSize} vols récents).</p>`;
}

function costBlock(cost) {
  if (!cost) return '';
  const rows = [
    ['Repas économique', `${cost.mealCheap} €`],
    ['Repas restaurant mid-range', `${cost.mealMid} €`],
    ['Transport local (ticket)', `${cost.transport} €`],
    ['Hébergement budget/nuit', `${cost.hotelBudget} €`],
    ['Bière locale', `${cost.beer} €`],
  ];
  return `
<h2>Coût de la vie sur place</h2>
<table><thead><tr><th>Poste</th><th>Prix moyen</th></tr></thead><tbody>
${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('\n')}
</tbody></table>
<p>Budget quotidien estimé pour un voyageur solo : <strong>${cost.mealCheap * 3 + cost.transport * 2 + cost.hotelBudget} €/jour</strong> (mode backpacker).</p>`;
}

function safetyBlock(safety) {
  if (!safety) return '';
  return `<h2>Sécurité</h2>\n<p>Niveau de sécurité : <strong>${escHtml(safety.level)}</strong> (score ${safety.score}/5, Global Peace Index).</p>`;
}

function countryInfoBlock(info) {
  if (!info) return '';
  return `<h2>Infos pratiques</h2>
<ul>
<li><strong>Capitale</strong> : ${escHtml(info.capital)}</li>
<li><strong>Devise</strong> : ${escHtml(info.currencies)}</li>
<li><strong>Langues</strong> : ${escHtml(info.languages)}</li>
<li><strong>Fuseau horaire</strong> : ${escHtml(info.timezone)}</li>
</ul>`;
}

function affiliateWidget(type, dest) {
  return `[fv_widget type="${type}" destination="${escHtml(dest)}" /]`;
}

function faqSection(pairs) {
  return `<h2>Questions fréquentes</h2>\n` +
    pairs.map(([q, a]) => `<h3>${escHtml(q)}</h3>\n<p>${a}</p>`).join('\n');
}

function faqSchema(pairs, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') }
    }))
  };
}

// ─── TEMPLATE: VOLS ─────────────────────────────────────────────────

export function volsTemplate(dest, liveData) {
  const { flight, cost, safety, countryInfo } = liveData;
  const name = dest.displayName;
  const month = currentMonth();

  const title = `Vol Paris ${name} pas cher — Prix et bons plans (${month})`;
  const slug = `vol-paris-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const metaDescription = `Trouvez un vol Paris → ${name} au meilleur prix. Tarifs à partir de ${flight?.minPrice || '???'} €, comparateur, meilleures périodes et astuces.`;

  const faq = [
    [`Quel est le prix moyen d'un vol Paris ${name} ?`, `En ${month}, le prix moyen d'un vol aller-retour Paris → ${name} est d'environ <strong>${flight?.avgPrice || '500-800'} €</strong>. Les tarifs les plus bas descendent à <strong>${flight?.minPrice || '350'} €</strong> en réservant 2-3 mois à l'avance.`],
    [`Quelle est la meilleure période pour un vol pas cher vers ${name} ?`, `Les mois les moins chers sont généralement janvier, février et septembre-octobre (hors vacances scolaires). Évite les périodes de Noël et le Nouvel An chinois/japonais pour ${name}.`],
    [`Combien de temps dure le vol Paris ${name} ?`, `Le vol direct dure entre 10 et 13 heures selon la destination exacte. Avec escale, compte 14 à 20 heures.`],
  ];

  const content = `
<h2>Prix des vols Paris → ${escHtml(name)} en ${month}</h2>
${priceBlock(flight)}
<p>Les prix fluctuent selon la saison, la compagnie et le délai de réservation. Voici le comparateur en temps réel :</p>
${affiliateWidget('flights', name)}

<h2>Calendrier des prix — Meilleur mois pour partir</h2>
<p>Consulte le calendrier ci-dessous pour repérer les mois les moins chers pour ton vol vers ${escHtml(name)} :</p>
${affiliateWidget('flights_calendar', name)}

<h2>Astuces pour payer moins cher</h2>
<ul>
<li><strong>Réserve 8 à 12 semaines à l'avance</strong> — c'est la fenêtre optimale pour les vols long-courrier.</li>
<li><strong>Sois flexible sur les dates</strong> — un décalage de 2-3 jours peut faire économiser 100-200 €.</li>
<li><strong>Compare les aéroports</strong> — parfois un vol via une autre ville européenne (Amsterdam, Helsinki) est 30% moins cher.</li>
<li><strong>Active les alertes prix</strong> — les tarifs changent plusieurs fois par jour.</li>
</ul>

${costBlock(cost)}
${safetyBlock(safety)}
${countryInfoBlock(countryInfo)}

<h2>Prépare ton voyage</h2>
<p>Pense à souscrire une assurance voyage avant de partir :</p>
${affiliateWidget('insurance', name)}
<p>Et une eSIM pour rester connecté dès l'atterrissage :</p>
${affiliateWidget('esim', name)}

${crossLinks(dest, 'vols')}

${faqSection(faq)}
`.trim();

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description: metaDescription,
      url: `https://flashvoyage.com/${slug}/`
    },
    faqSchema(faq)
  ];

  return { title, slug, content, excerpt: metaDescription, metaDescription, schema };
}

// ─── TEMPLATE: BUDGET ───────────────────────────────────────────────

export function budgetTemplate(dest, liveData) {
  const { flight, cost, safety, countryInfo } = liveData;
  const name = dest.displayName;
  const month = currentMonth();
  const daily = cost ? cost.mealCheap * 3 + cost.transport * 2 + cost.hotelBudget : null;
  const weekly = daily ? daily * 7 : null;
  const monthly = daily ? daily * 30 : null;

  const title = `Budget voyage ${name} — Combien coûte un séjour ? (${month})`;
  const slug = `budget-voyage-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const metaDescription = `Budget détaillé pour un voyage en ${name} : hébergement, repas, transport, activités. À partir de ${daily || '30'} €/jour.`;

  const faq = [
    [`Quel budget prévoir pour 2 semaines en ${name} ?`, `Pour 2 semaines en mode backpacker en ${name}, prévois environ <strong>${daily ? daily * 14 : '500-700'} €</strong> sur place (hors vol). En mid-range, compte le double.`],
    [`${name} est-il cher pour un touriste français ?`, `${name} est considéré comme ${budgetLabel(dest.budgetLevel).toLowerCase()} pour un voyageur français. ${cost ? `Un repas local coûte environ ${cost.mealCheap} € et une nuit en auberge ${cost.hotelBudget} €.` : ''}`],
    [`Faut-il retirer sur place ou payer par carte ?`, `Les deux fonctionnent dans les grandes villes. En zone rurale, privilégie le cash. Les DAB facturent souvent 1-3 € de frais — une carte sans frais à l'étranger (Revolut, Wise) est recommandée.`],
  ];

  const content = `
<h2>Budget quotidien en ${escHtml(name)}</h2>
${cost ? `<p>En ${month}, voici les coûts moyens constatés pour un voyageur solo en ${escHtml(name)} :</p>` : `<p>Voici une estimation des coûts pour un séjour en ${escHtml(name)} :</p>`}

${costBlock(cost)}

${daily ? `
<h2>Budget par durée de séjour</h2>
<table><thead><tr><th>Durée</th><th>Backpacker</th><th>Mid-range</th><th>Confort</th></tr></thead><tbody>
<tr><td>1 semaine</td><td>${weekly} €</td><td>${Math.round(weekly * 1.8)} €</td><td>${Math.round(weekly * 3)} €</td></tr>
<tr><td>2 semaines</td><td>${daily * 14} €</td><td>${Math.round(daily * 14 * 1.8)} €</td><td>${Math.round(daily * 14 * 3)} €</td></tr>
<tr><td>1 mois</td><td>${monthly} €</td><td>${Math.round(monthly * 1.8)} €</td><td>${Math.round(monthly * 3)} €</td></tr>
</tbody></table>
<p><em>Hors vol aller-retour. Les tarifs mid-range incluent un hôtel 3*, restaurants et quelques activités. Le confort inclut hôtel 4*, excursions guidées et transport privé.</em></p>
` : ''}

<h2>Le poste le plus important : le vol</h2>
${priceBlock(flight)}
${affiliateWidget('flights', name)}

<h2>Hébergement — Où dormir sans exploser le budget</h2>
<p>${cost ? `Les auberges de jeunesse démarrent autour de ${cost.hotelBudget} €/nuit` : 'Les auberges de jeunesse offrent le meilleur rapport qualité/prix'}. Pour un séjour plus long, les appartements sur les plateformes de location courte durée sont souvent 30-50% moins chers qu'un hôtel.</p>

<h2>Transport local</h2>
<p>${cost ? `Un ticket de transport local coûte environ ${cost.transport} €` : 'Le transport local est généralement abordable'}. Les applications de VTC (Grab, Gojek) sont souvent moins chères que les taxis traditionnels.</p>

<h2>Comment économiser sur place</h2>
<ul>
<li><strong>Mange local</strong> — les warungs, gargottes et street food sont 3-5x moins chers que les restaurants touristiques.</li>
<li><strong>Négocie</strong> — dans les marchés et pour les taxis non-compteur, négocie toujours.</li>
<li><strong>Évite les zones ultra-touristiques</strong> — les prix doublent dès que tu t'approches d'un temple majeur.</li>
<li><strong>Utilise une carte sans frais</strong> — Revolut ou Wise t'épargnent 3-5% de frais bancaires.</li>
</ul>

${safetyBlock(safety)}
${countryInfoBlock(countryInfo)}

<h2>Assurance voyage</h2>
<p>Indispensable pour ${escHtml(name)} — une hospitalisation peut coûter des milliers d'euros :</p>
${affiliateWidget('insurance', name)}

${crossLinks(dest, 'budget')}

${faqSection(faq)}
`.trim();

  const schema = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: metaDescription },
    faqSchema(faq)
  ];

  return { title, slug, content, excerpt: metaDescription, metaDescription, schema };
}

// ─── TEMPLATE: VISA ─────────────────────────────────────────────────

export function visaTemplate(dest, liveData) {
  const { countryInfo } = liveData;
  const name = dest.displayName;
  const month = currentMonth();

  const visaLabel = {
    exempt_90: 'Exemption de visa (90 jours)',
    exempt_30: 'Exemption de visa (30 jours)',
    evisa_90: 'E-visa obligatoire (90 jours)',
    evisa_30: 'E-visa obligatoire (30 jours)',
    voa_30: 'Visa on Arrival (30 jours)',
    voa_90: 'Visa on Arrival (90 jours)',
    keta_90: 'K-ETA + exemption (90 jours)',
    eta_30: 'ETA obligatoire (30 jours)',
  }[dest.visaType] || dest.visaType;

  const title = `Visa ${name} pour les Français — Formalités ${new Date().getFullYear()}`;
  const slug = `visa-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-francais`;
  const metaDescription = `Tout savoir sur le visa ${name} pour les citoyens français : type de visa, durée, prix, démarches et pièges à éviter.`;

  const faq = [
    [`Ai-je besoin d'un visa pour ${name} ?`, `${dest.visaDetails}`],
    [`Combien coûte le visa pour ${name} ?`, `${dest.visaType.includes('exempt') ? `Le visa est gratuit — ${name} offre une exemption de visa pour les citoyens français.` : `Le coût varie entre 25 et 50 USD selon le type de visa et la durée. Voir les détails ci-dessus.`}`],
    [`Peut-on prolonger son visa sur place en ${name} ?`, `Dans la plupart des cas, oui. Renseigne-toi auprès du bureau d'immigration local dès ton arrivée. Certains pays facturent des frais de prolongation.`],
  ];

  const content = `
<h2>Visa ${escHtml(name)} — Règles pour les Français</h2>
<p><strong>Statut actuel (${month})</strong> : ${escHtml(visaLabel)}</p>
<p>${escHtml(dest.visaDetails)}</p>

<h2>Documents requis</h2>
<ul>
<li><strong>Passeport</strong> valide au moins 6 mois après la date d'entrée</li>
<li><strong>Billet retour</strong> ou preuve de continuation du voyage (souvent demandé)</li>
${dest.visaType.includes('evisa') || dest.visaType.includes('eta') || dest.visaType.includes('keta') ? '<li><strong>Formulaire en ligne</strong> à remplir avant le départ</li>' : ''}
<li><strong>Photo d'identité</strong> (format numérique pour les e-visas)</li>
<li><strong>Preuve de fonds</strong> (relevé bancaire, parfois demandé aux frontières)</li>
</ul>

<h2>Pièges à éviter</h2>
<ul>
<li><strong>Sites de visa non officiels</strong> — ne passe que par le site gouvernemental officiel. Les intermédiaires facturent 2-3x le prix réel.</li>
<li><strong>Passeport abîmé</strong> — certains pays refusent l'entrée si le passeport est endommagé, même si la date de validité est bonne.</li>
<li><strong>Overstay</strong> — dépasser la durée autorisée entraîne des amendes (parfois 500 $/jour) et une possible interdiction de retour.</li>
<li><strong>Pages vierges</strong> — vérifie que ton passeport a au moins 2 pages vierges disponibles.</li>
</ul>

${countryInfoBlock(countryInfo)}

<h2>Prépare ton vol</h2>
${affiliateWidget('flights', name)}

<h2>Assurance voyage — Parfois obligatoire</h2>
<p>Certains consulats exigent une preuve d'assurance voyage. Dans tous les cas, elle est fortement recommandée :</p>
${affiliateWidget('insurance', name)}

${crossLinks(dest, 'visa')}

${faqSection(faq)}
`.trim();

  const schema = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: metaDescription },
    faqSchema(faq)
  ];

  return { title, slug, content, excerpt: metaDescription, metaDescription, schema };
}

// ─── TEMPLATE: ESIM ─────────────────────────────────────────────────

export function esimTemplate(dest, liveData) {
  const { countryInfo } = liveData;
  const name = dest.displayName;
  const month = currentMonth();
  const providers = dest.esimProviders || ['Airalo'];

  const title = `eSIM ${name} — Comparatif et meilleur forfait (${month})`;
  const slug = `esim-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const metaDescription = `Comparatif des meilleures eSIM pour ${name} : ${providers.join(', ')}. Prix, couverture, data et activation.`;

  const faq = [
    [`Quelle est la meilleure eSIM pour ${name} ?`, `${providers[0]} est le choix le plus populaire pour ${name}, avec des forfaits à partir de 4-5 USD pour 1 Go/7 jours. ${providers.length > 1 ? `${providers[1]} offre souvent des forfaits illimités plus intéressants pour les séjours longs.` : ''}`],
    [`Comment activer une eSIM pour ${name} ?`, `L'activation se fait en 2 minutes : télécharge l'application du fournisseur, achète le forfait, scanne le QR code dans tes paramètres réseau. Tu peux le faire avant le départ.`],
    [`Mon téléphone est-il compatible eSIM ?`, `La plupart des smartphones récents (iPhone XS+, Samsung S20+, Google Pixel 3+) supportent l'eSIM. Vérifie dans Paramètres > Réseau mobile > Ajouter un forfait.`],
  ];

  const content = `
<h2>Pourquoi une eSIM pour ${escHtml(name)} ?</h2>
<p>Le roaming international coûte entre 5 et 15 €/jour chez les opérateurs français. Une eSIM locale pour ${escHtml(name)} revient à <strong>1-2 €/jour</strong> avec une bien meilleure couverture 4G/5G.</p>
<ul>
<li>Pas de carte SIM physique à acheter à l'aéroport</li>
<li>Activation instantanée — tu es connecté dès l'atterrissage</li>
<li>Tu gardes ton numéro français en parallèle</li>
<li>Rechargement en ligne si tu prolonges ton séjour</li>
</ul>

<h2>Comparatif des eSIM pour ${escHtml(name)}</h2>
<p>Voici les principaux fournisseurs avec couverture en ${escHtml(name)} :</p>

${affiliateWidget('esim', name)}

<h2>Nos conseils</h2>
<ul>
<li><strong>Achète avant de partir</strong> — installe l'eSIM à la maison sur ton WiFi, active-la à l'arrivée.</li>
<li><strong>Choisis un forfait avec hotspot</strong> — partage ta connexion avec ton compagnon de voyage.</li>
<li><strong>Prends un forfait suffisant</strong> — 1 Go/jour est confortable pour Maps, messages et photos. Le streaming vidéo consomme 3-5 Go/jour.</li>
${providers.length > 1 ? `<li><strong>Compare ${providers.join(' vs ')}</strong> — les prix varient de 20-30% selon les promotions en cours.</li>` : ''}
</ul>

${countryInfoBlock(countryInfo)}

${crossLinks(dest, 'esim')}

${faqSection(faq)}
`.trim();

  const schema = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: metaDescription },
    faqSchema(faq)
  ];

  return { title, slug, content, excerpt: metaDescription, metaDescription, schema };
}

// ─── CROSS-LINKS ────────────────────────────────────────────────────

function crossLinks(dest, currentTemplate) {
  const slug = dest.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const pages = [
    { id: 'vols', label: `Vol Paris → ${dest.displayName}`, slug: `vol-paris-${slug}` },
    { id: 'budget', label: `Budget ${dest.displayName}`, slug: `budget-voyage-${slug}` },
    { id: 'visa', label: `Visa ${dest.displayName}`, slug: `visa-${slug}-francais` },
    { id: 'esim', label: `eSIM ${dest.displayName}`, slug: `esim-${slug}` },
  ];
  const others = pages.filter(p => p.id !== currentTemplate);
  if (others.length === 0) return '';
  return `<h2>${dest.displayName} — Guides pratiques</h2>\n<ul>\n` +
    others.map(p => `<li><a href="https://flashvoyage.com/${p.slug}/">${escHtml(p.label)}</a></li>`).join('\n') +
    '\n</ul>';
}

// ─── REGISTRY ───────────────────────────────────────────────────────

export const SEO_TEMPLATES = {
  vols: volsTemplate,
  budget: budgetTemplate,
  visa: visaTemplate,
  esim: esimTemplate,
};
