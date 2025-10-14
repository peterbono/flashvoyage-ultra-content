#!/usr/bin/env node

/**
 * Templates Témoignage Complets - 4 formats pour couvrir 40% du contenu
 * A. Success Story (15%) - B. Échec & Leçons (10%) - C. Transition (10%) - D. Comparaison (5%)
 */

class TemplatesTemoignageComplets {
  constructor() {
    this.templates = {
      
      // A. TEMPLATE SUCCESS STORY (15% du contenu)
      success_story: {
        title: "Comment {prenom} a {objectif} en {destination} : {resultat} (témoignage Reddit)",
        target_audience: "Digital nomades cherchant inspiration et motivation",
        ton: "Inspirant, motivant, authentique",
        keywords: "success story nomade, réussite asie, transformation lifestyle",
        cta: "Découvrez comment transformer votre vie de nomade",
        urgence: "Histoire inspirante à découvrir",
        destinations: "Asie, Vietnam, Thaïlande, Indonésie, Japon, Corée du Sud",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>{intro_fomo_curation}</p>

{quote_highlight}

<h2>Comment {prenom} a {objectif} en {destination} : {resultat}</h2>

<p><strong>Introduction (60-80 mots) :</strong></p>
<p>Je suis {prenom}, {age} ans, {profession}. Il y a {duree}, j'ai décidé de {decision_principale} en {destination}. Aujourd'hui, je {situation_actuelle} et je veux partager mon parcours pour inspirer d'autres nomades.</p>

<h3>Le défi initial</h3>
<p><strong>Situation de départ (100-120 mots) :</strong></p>
<p>{situation_depart}</p>
<p><strong>Objectifs fixés :</strong> {objectifs_specifiques}</p>
<p><strong>Obstacles identifiés :</strong> {obstacles_principaux}</p>

<h3>Ma stratégie d'action</h3>
<p><strong>Plan mis en place (120-150 mots) :</strong></p>
<p>Pour atteindre mes objectifs, j'ai d'abord {action_1}. J'ai ensuite {action_2} et {action_3}.</p>
<p>J'ai utilisé {outil_1} pour {objectif_1} et {outil_2} pour {objectif_2}. Ces outils m'ont permis de {benefice_1} et {benefice_2}.</p>
<p>Ma routine quotidienne incluait {routine_1}, {routine_2} et {routine_3}.</p>

<h3>Les résultats obtenus</h3>
<p><strong>Succès concrets (100-120 mots) :</strong></p>
<p>Après {duree_effort}, j'ai atteint {resultat_1}, {resultat_2} et {resultat_3}.</p>
<p><strong>Bénéfices mesurables :</strong> {benefices_chiffres}</p>
<p><strong>Impact sur ma vie :</strong> {impact_personnel}</p>

<h3>Mes conseils pour réussir</h3>
<p><strong>Stratégies gagnantes (3-5 points) :</strong></p>
<ul>
<li><strong>Commencez par {conseil_1} :</strong> {explication_conseil_1}</li>
<li><strong>Investissez dans {conseil_2} :</strong> {explication_conseil_2}</li>
<li><strong>Réseauz avec {conseil_3} :</strong> {explication_conseil_3}</li>
<li><strong>Persévérez malgré {conseil_4} :</strong> {explication_conseil_4}</li>
<li><strong>Célébrez {conseil_5} :</strong> {explication_conseil_5}</li>
</ul>

<h3>Outils qui m'ont aidé</h3>
<p><strong>Ressources recommandées :</strong></p>
<ul>
<li><strong>Productivité :</strong> {TRAVELPAYOUTS_PRODUCTIVITY_WIDGET}</li>
<li><strong>Hébergement :</strong> {TRAVELPAYOUTS_HOTELS_WIDGET}</li>
<li><strong>Transport :</strong> {TRAVELPAYOUTS_FLIGHTS_WIDGET}</li>
</ul>

<h3>Articles connexes</h3>
<p><strong>Liens internes :</strong></p>
<ul>
<li><a href="{lien_interne_1}">{titre_lien_1}</a> - {description_lien_1}</li>
<li><a href="{lien_interne_2}">{titre_lien_2}</a> - {description_lien_2}</li>
</ul>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie.</em></p>
        `
      },

      // B. TEMPLATE ÉCHEC & LEÇONS (10% du contenu)
      echec_lecons: {
        title: "Mon échec en {destination} : {erreur} et les leçons apprises (témoignage Reddit)",
        target_audience: "Digital nomades pour éviter les erreurs courantes",
        ton: "Humble, préventif, éducatif",
        keywords: "erreur nomade, leçon voyage, prévention asie",
        cta: "Évitez ces erreurs courantes de nomade",
        urgence: "Erreur à éviter absolument",
        destinations: "Asie, Vietnam, Thaïlande, Indonésie, Japon, Corée du Sud",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>{intro_fomo_curation}</p>

{quote_highlight}

<h2>Mon échec en {destination} : {erreur} et les leçons apprises</h2>

<p><strong>Introduction (50-70 mots) :</strong></p>
<p>Je suis {prenom}, {age} ans, {profession}. En {destination}, j'ai commis une erreur qui m'a coûté {cout_erreur}. Je partage cette expérience pour que d'autres nomades évitent cette situation.</p>

<h3>L'erreur commise</h3>
<p><strong>Description de l'erreur (100-120 mots) :</strong></p>
<p>{description_erreur_detaille}</p>
<p><strong>Contexte :</strong> {contexte_erreur}</p>
<p><strong>Signes avant-coureurs :</strong> {signes_avertissement}</p>

<h3>Les conséquences</h3>
<p><strong>Impact immédiat (80-100 mots) :</strong></p>
<p>Cette erreur a eu {consequence_1}, {consequence_2} et {consequence_3}.</p>
<p><strong>Coût financier :</strong> {cout_financier}</p>
<p><strong>Impact émotionnel :</strong> {impact_emotionnel}</p>

<h3>Comment j'ai géré la situation</h3>
<p><strong>Actions de récupération (100-120 mots) :</strong></p>
<p>Face à cette situation, j'ai d'abord {action_1}. J'ai contacté {contact_1} qui m'a conseillé de {conseil_1}.</p>
<p>J'ai utilisé {outil_1} pour {objectif_1} et {outil_2} pour {objectif_2}. Finalement, j'ai pu {resolution_finale}.</p>

<h3>Les leçons apprises</h3>
<p><strong>Conseils préventifs (3-5 points) :</strong></p>
<ul>
<li><strong>Vérifiez toujours {lecon_1} :</strong> {explication_lecon_1}</li>
<li><strong>Prévoyez {lecon_2} :</strong> {explication_lecon_2}</li>
<li><strong>Informez-vous sur {lecon_3} :</strong> {explication_lecon_3}</li>
<li><strong>Gardez {lecon_4} :</strong> {explication_lecon_4}</li>
<li><strong>Testez {lecon_5} :</strong> {explication_lecon_5}</li>
</ul>

<h3>Ressources de prévention</h3>
<p><strong>Outils recommandés :</strong></p>
<ul>
<li><strong>Assurance voyage :</strong> {TRAVELPAYOUTS_INSURANCE_WIDGET}</li>
<li><strong>Hébergement sécurisé :</strong> {TRAVELPAYOUTS_HOTELS_WIDGET}</li>
<li><strong>Transport fiable :</strong> {TRAVELPAYOUTS_FLIGHTS_WIDGET}</li>
</ul>

<h3>Articles connexes</h3>
<p><strong>Liens internes :</strong></p>
<ul>
<li><a href="{lien_interne_1}">{titre_lien_1}</a> - {description_lien_1}</li>
<li><a href="{lien_interne_2}">{titre_lien_2}</a> - {description_lien_2}</li>
</ul>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie.</em></p>
        `
      },

      // C. TEMPLATE TRANSITION (10% du contenu)
      transition: {
        title: "Ma transition de {situation_avant} à {situation_apres} en {destination} (témoignage Reddit)",
        target_audience: "Digital nomades en période de changement",
        ton: "Réfléchi, adaptatif, encourageant",
        keywords: "transition nomade, changement lifestyle, adaptation asie",
        cta: "Découvrez comment gérer vos transitions de nomade",
        urgence: "Transition réussie à partager",
        destinations: "Asie, Vietnam, Thaïlande, Indonésie, Japon, Corée du Sud",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>{intro_fomo_curation}</p>

{quote_highlight}

<h2>Ma transition de {situation_avant} à {situation_apres} en {destination}</h2>

<p><strong>Introduction (60-80 mots) :</strong></p>
<p>Je suis {prenom}, {age} ans, {profession}. Après {duree_avant} en {situation_avant}, j'ai décidé de {decision_transition} en {destination}. Voici comment j'ai géré cette transition.</p>

<h3>La situation d'avant</h3>
<p><strong>Contexte initial (100-120 mots) :</strong></p>
<p>{description_situation_avant}</p>
<p><strong>Avantages :</strong> {avantages_avant}</p>
<p><strong>Inconvénients :</strong> {inconvenients_avant}</p>
<p><strong>Déclencheur :</strong> {declencheur_changement}</p>

<h3>Le processus de transition</h3>
<p><strong>Étapes de changement (120-150 mots) :</strong></p>
<p>Pour effectuer cette transition, j'ai d'abord {etape_1}. J'ai ensuite {etape_2} et {etape_3}.</p>
<p>J'ai utilisé {outil_1} pour {objectif_1} et {outil_2} pour {objectif_2}. Ces outils m'ont permis de {benefice_1} et {benefice_2}.</p>
<p>Les défis rencontrés incluaient {defi_1}, {defi_2} et {defi_3}.</p>

<h3>La situation d'après</h3>
<p><strong>Résultat final (100-120 mots) :</strong></p>
<p>Après {duree_transition}, j'ai atteint {resultat_1}, {resultat_2} et {resultat_3}.</p>
<p><strong>Nouveaux avantages :</strong> {avantages_apres}</p>
<p><strong>Nouveaux défis :</strong> {defis_apres}</p>

<h3>Mes conseils pour une transition réussie</h3>
<p><strong>Stratégies d'adaptation (3-5 points) :</strong></p>
<ul>
<li><strong>Planifiez {conseil_1} :</strong> {explication_conseil_1}</li>
<li><strong>Adaptez {conseil_2} :</strong> {explication_conseil_2}</li>
<li><strong>Réseauz avec {conseil_3} :</strong> {explication_conseil_3}</li>
<li><strong>Testez {conseil_4} :</strong> {explication_conseil_4}</li>
<li><strong>Persévérez malgré {conseil_5} :</strong> {explication_conseil_5}</li>
</ul>

<h3>Outils de transition</h3>
<p><strong>Ressources utiles :</strong></p>
<ul>
<li><strong>Hébergement temporaire :</strong> {TRAVELPAYOUTS_HOTELS_WIDGET}</li>
<li><strong>Transport flexible :</strong> {TRAVELPAYOUTS_FLIGHTS_WIDGET}</li>
<li><strong>Assurance adaptée :</strong> {TRAVELPAYOUTS_INSURANCE_WIDGET}</li>
</ul>

<h3>Articles connexes</h3>
<p><strong>Liens internes :</strong></p>
<ul>
<li><a href="{lien_interne_1}">{titre_lien_1}</a> - {description_lien_1}</li>
<li><a href="{lien_interne_2}">{titre_lien_2}</a> - {description_lien_2}</li>
</ul>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie.</em></p>
        `
      },

      // D. TEMPLATE COMPARAISON D'EXPÉRIENCE (5% du contenu)
      comparaison_experience: {
        title: "{destination_a} vs {destination_b} : mon expérience comparative (témoignage Reddit)",
        target_audience: "Digital nomades hésitant entre plusieurs destinations",
        ton: "Comparatif, objectif, informatif",
        keywords: "comparaison nomade, destination asie, choix voyage",
        cta: "Découvrez quelle destination vous convient le mieux",
        urgence: "Comparaison détaillée disponible",
        destinations: "Asie, Vietnam, Thaïlande, Indonésie, Japon, Corée du Sud",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>{intro_fomo_curation}</p>

{quote_highlight}

<h2>{destination_a} vs {destination_b} : mon expérience comparative</h2>

<p><strong>Introduction (50-70 mots) :</strong></p>
<p>Je suis {prenom}, {age} ans, {profession}. J'ai vécu {duree_a} en {destination_a} et {duree_b} en {destination_b}. Voici ma comparaison détaillée pour vous aider à choisir.</p>

<h3>Critères de comparaison</h3>
<p><strong>Méthodologie (80-100 mots) :</strong></p>
<p>J'ai comparé ces destinations sur {critere_1}, {critere_2}, {critere_3}, {critere_4} et {critere_5}.</p>
<p>Chaque critère est noté sur 10, avec des explications détaillées basées sur mon expérience personnelle.</p>

<h3>{destination_a} - Mon expérience</h3>
<p><strong>Points forts (100-120 mots) :</strong></p>
<p>{points_forts_a}</p>
<p><strong>Points faibles :</strong> {points_faibles_a}</p>
<p><strong>Coût de vie :</strong> {cout_vie_a}</p>
<p><strong>Communauté nomade :</strong> {communaute_a}</p>
<p><strong>Note globale :</strong> {note_a}/10</p>

<h3>{destination_b} - Mon expérience</h3>
<p><strong>Points forts (100-120 mots) :</strong></p>
<p>{points_forts_b}</p>
<p><strong>Points faibles :</strong> {points_faibles_b}</p>
<p><strong>Coût de vie :</strong> {cout_vie_b}</p>
<p><strong>Communauté nomade :</strong> {communaute_b}</p>
<p><strong>Note globale :</strong> {note_b}/10</p>

<h3>Comparaison détaillée</h3>
<p><strong>Tableau comparatif :</strong></p>
<!-- wp:table -->
<figure class="wp-block-table">
<table class="has-fixed-layout">
<thead>
<tr>
<th>Critère</th>
<th>{destination_a}</th>
<th>{destination_b}</th>
</tr>
</thead>
<tbody>
<tr>
<td>Coût de vie</td>
<td>{note_cout_a}</td>
<td>{note_cout_b}</td>
</tr>
<tr>
<td>Qualité de vie</td>
<td>{note_qualite_a}</td>
<td>{note_qualite_b}</td>
</tr>
<tr>
<td>Communauté</td>
<td>{note_communaute_a}</td>
<td>{note_communaute_b}</td>
</tr>
<tr>
<td>Infrastructure</td>
<td>{note_infra_a}</td>
<td>{note_infra_b}</td>
</tr>
<tr>
<td>Opportunités</td>
<td>{note_opp_a}</td>
<td>{note_opp_b}</td>
</tr>
</tbody>
</table>
</figure>
<!-- /wp:table -->

<h3>Ma recommandation</h3>
<p><strong>Verdict final (100-120 mots) :</strong></p>
<p>Pour {profil_nomade}, je recommande {destination_recommandee} car {raison_principale}.</p>
<p><strong>Quand choisir {destination_a} :</strong> {cas_usage_a}</p>
<p><strong>Quand choisir {destination_b} :</strong> {cas_usage_b}</p>

<h3>Outils de comparaison</h3>
<p><strong>Ressources utiles :</strong></p>
<ul>
<li><strong>Vols vers {destination_a} :</strong> {TRAVELPAYOUTS_FLIGHTS_WIDGET}</li>
<li><strong>Vols vers {destination_b} :</strong> {TRAVELPAYOUTS_FLIGHTS_WIDGET}</li>
<li><strong>Hébergement comparé :</strong> {TRAVELPAYOUTS_HOTELS_WIDGET}</li>
</ul>

<h3>Articles connexes</h3>
<p><strong>Liens internes :</strong></p>
<ul>
<li><a href="{lien_interne_1}">{titre_lien_1}</a> - {description_lien_1}</li>
<li><a href="{lien_interne_2}">{titre_lien_2}</a> - {description_lien_2}</li>
</ul>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie.</em></p>
        `
      }
    };
  }

  /**
   * Génère un témoignage selon le type sélectionné
   */
  generateTemoignage(type, data) {
    const template = this.templates[type];
    if (!template) {
      throw new Error(`Template ${type} non trouvé`);
    }
    
    // Extraction des données selon le type
    const extractedData = this.extractDataByType(type, data);
    
    // Génération du contenu
    let content = template.content;
    for (const [key, value] of Object.entries(extractedData)) {
      content = content.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    
    return {
      title: template.title.replace(/{(\w+)}/g, (match, key) => extractedData[key] || match),
      target_audience: template.target_audience,
      ton: template.ton,
      keywords: template.keywords,
      cta: template.cta,
      urgence: template.urgence,
      destinations: template.destinations,
      content: content
    };
  }

  /**
   * Extraction des données selon le type de témoignage
   */
  extractDataByType(type, data) {
    const baseData = {
      sourceLink: data.permalink || '#',
      intro_fomo_curation: this.generateFomoCurationIntro(type, data),
      title: data.title || 'Témoignage',
      source: 'Reddit',
      prenom: this.extractPrenom(data.content),
      age: this.extractAge(data.content),
      profession: this.extractProfession(data.content),
      destination: this.extractDestination(data.content),
      TRAVELPAYOUTS_FLIGHTS_WIDGET: '{{TRAVELPAYOUTS_FLIGHTS_WIDGET}}',
      TRAVELPAYOUTS_HOTELS_WIDGET: '{{TRAVELPAYOUTS_HOTELS_WIDGET}}',
      TRAVELPAYOUTS_INSURANCE_WIDGET: '{{TRAVELPAYOUTS_INSURANCE_WIDGET}}',
      TRAVELPAYOUTS_PRODUCTIVITY_WIDGET: '{{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET}}',
      lien_interne_1: '#',
      titre_lien_1: 'Guide connexe',
      description_lien_1: 'Article complémentaire',
      lien_interne_2: '#',
      titre_lien_2: 'Ressource utile',
      description_lien_2: 'Information supplémentaire'
    };

    // Données spécifiques par type
    switch (type) {
      case 'success_story':
        return {
          ...baseData,
          objectif: this.extractObjectif(data.content),
          resultat: this.extractResultat(data.content),
          duree: this.extractDuree(data.content),
          situation_depart: this.extractSituationDepart(data.content),
          objectifs_specifiques: this.extractObjectifsSpecifiques(data.content),
          obstacles_principaux: this.extractObstaclesPrincipaux(data.content)
        };
      
      case 'echec_lecons':
        return {
          ...baseData,
          erreur: this.extractErreur(data.content),
          cout_erreur: this.extractCoutErreur(data.content),
          description_erreur_detaille: this.extractDescriptionErreur(data.content),
          contexte_erreur: this.extractContexteErreur(data.content),
          signes_avertissement: this.extractSignesAvertissement(data.content)
        };
      
      case 'transition':
        return {
          ...baseData,
          situation_avant: this.extractSituationAvant(data.content),
          situation_apres: this.extractSituationApres(data.content),
          duree_avant: this.extractDureeAvant(data.content),
          decision_transition: this.extractDecisionTransition(data.content)
        };
      
      case 'comparaison_experience':
        return {
          ...baseData,
          destination_a: this.extractDestinationA(data.content),
          destination_b: this.extractDestinationB(data.content),
          duree_a: this.extractDureeA(data.content),
          duree_b: this.extractDureeB(data.content)
        };
      
      default:
        return baseData;
    }
  }

  /**
   * Génère une intro FOMO + curation selon le type de témoignage
   */
  generateFomoCurationIntro(type, data) {
    const fomoIntros = {
      success_story: [
        "Pendant que vous hésitez, d'autres agissent. Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui montre comment un nomade a transformé sa vie en {destination}.",
        "Ce témoignage Reddit a retenu notre attention : un développeur français raconte comment il a {resultat} en {destination}. Chez FlashVoyages, nous l'avons analysé pour vous.",
        "Nous avons sélectionné ce témoignage Reddit pour vous : pendant que vous hésitez, un nomade a déjà {resultat} en {destination}.",
        "Chez FlashVoyages, nous avons analysé ce témoignage Reddit : un développeur français a {resultat} en {destination}. Voici ce que vous devez savoir."
      ],
      echec_lecons: [
        "Cette erreur coûteuse a retenu notre attention. Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit pour vous éviter les mêmes pièges en {destination}.",
        "Pendant que vous planifiez, d'autres apprennent de leurs erreurs. Nous avons analysé ce témoignage Reddit qui détaille les erreurs à éviter en {destination}.",
        "Ce témoignage Reddit nous a interpellés : un nomade raconte son échec en {destination}. Chez FlashVoyages, nous l'avons sélectionné pour vous.",
        "Nous avons sélectionné ce témoignage Reddit pour vous : un nomade partage les erreurs qui lui ont coûté cher en {destination}."
      ],
      transition: [
        "Cette transformation nous a marqués. Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui raconte une transition réussie vers le nomadisme en {destination}.",
        "Pendant que vous réfléchissez, d'autres transforment leur vie. Nous avons analysé ce témoignage Reddit d'une transition réussie en {destination}.",
        "Ce témoignage Reddit a retenu notre attention : une transition réussie vers le nomadisme en {destination}. Chez FlashVoyages, nous l'avons sélectionné pour vous.",
        "Nous avons sélectionné ce témoignage Reddit pour vous : une transition réussie vers le nomadisme en {destination}."
      ],
      comparaison_experience: [
        "Cette comparaison nous a interpellés. Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui compare {destination_a} et {destination_b}.",
        "Pendant que vous hésitez entre destinations, d'autres ont testé. Nous avons analysé ce témoignage Reddit qui compare {destination_a} et {destination_b}.",
        "Ce témoignage Reddit nous a marqués : une comparaison détaillée entre {destination_a} et {destination_b}. Chez FlashVoyages, nous l'avons sélectionné pour vous.",
        "Nous avons sélectionné ce témoignage Reddit pour vous : une comparaison détaillée entre {destination_a} et {destination_b}."
      ]
    };

    const intros = fomoIntros[type] || fomoIntros.success_story;
    const randomIntro = intros[Math.floor(Math.random() * intros.length)];
    
    // Remplacer les placeholders
    return randomIntro
      .replace(/{destination}/g, this.extractDestination(data.content) || 'Asie')
      .replace(/{destination_a}/g, this.extractDestinationA(data.content) || 'Vietnam')
      .replace(/{destination_b}/g, this.extractDestinationB(data.content) || 'Thaïlande')
      .replace(/{resultat}/g, this.extractResultat(data.content) || 'réussi sa transformation');
  }

  /**
   * Extraction des destinations pour les comparaisons
   */
  extractDestinationA(content) {
    const destinations = ['Vietnam', 'Thaïlande', 'Indonésie', 'Japon', 'Corée du Sud'];
    return destinations.find(dest => content.toLowerCase().includes(dest.toLowerCase())) || 'Vietnam';
  }

  extractDestinationB(content) {
    const destinations = ['Vietnam', 'Thaïlande', 'Indonésie', 'Japon', 'Corée du Sud'];
    const found = destinations.filter(dest => content.toLowerCase().includes(dest.toLowerCase()));
    return found.length > 1 ? found[1] : 'Thaïlande';
  }

  extractResultat(content) {
    if (content.includes('triplé') || content.includes('triple')) return 'triplé ses revenus';
    if (content.includes('doublé') || content.includes('double')) return 'doublé ses revenus';
    if (content.includes('réussi') || content.includes('succès')) return 'réussi sa transformation';
    return 'transformé sa vie';
  }

  // Méthodes d'extraction génériques
  extractPrenom(content) {
    const prenoms = ['Sarah', 'Marc', 'Emma', 'Thomas', 'Léa', 'Alex', 'Marie', 'Paul'];
    return prenoms[Math.floor(Math.random() * prenoms.length)];
  }

  extractAge(content) {
    const ages = ['28', '32', '25', '35', '29', '31', '27', '33'];
    return ages[Math.floor(Math.random() * ages.length)];
  }

  extractProfession(content) {
    const professions = [
      'développeur freelance', 'graphiste indépendant', 'consultant marketing',
      'rédacteur web', 'coach en ligne', 'photographe', 'traducteur'
    ];
    return professions[Math.floor(Math.random() * professions.length)];
  }

  extractDestination(content) {
    const lieux = ['Bali', 'Vietnam', 'Thaïlande', 'Japon', 'Corée du Sud', 'Singapour', 'Indonésie', 'Philippines'];
    for (const lieu of lieux) {
      if (content.toLowerCase().includes(lieu.toLowerCase())) {
        return lieu;
      }
    }
    return 'Asie';
  }

  extractDuree(content) {
    const durees = ['3 mois', '6 mois', '1 an', '2 ans', '8 mois', '4 mois'];
    return durees[Math.floor(Math.random() * durees.length)];
  }

  // Méthodes d'extraction spécifiques par type
  extractObjectif(content) {
    const objectifs = ['doublé ses revenus', 'trouvé l\'équilibre vie/travail', 'créé son business', 'découvert sa passion'];
    return objectifs[Math.floor(Math.random() * objectifs.length)];
  }

  extractResultat(content) {
    const resultats = ['un succès total', 'une transformation complète', 'une réussite inattendue', 'un changement de vie'];
    return resultats[Math.floor(Math.random() * resultats.length)];
  }

  extractSituationDepart(content) {
    return "J'étais dans une situation difficile avec des revenus instables et un manque de direction claire dans ma carrière de nomade.";
  }

  extractObjectifsSpecifiques(content) {
    return "Stabiliser mes revenus, améliorer ma productivité, et créer un réseau professionnel solide";
  }

  extractObstaclesPrincipaux(content) {
    return "Manque de structure, isolement professionnel, et difficultés de concentration";
  }

  extractErreur(content) {
    const erreurs = ['sous-estimé les coûts', 'mal géré mon visa', 'choisi le mauvais logement', 'négligé l\'assurance'];
    return erreurs[Math.floor(Math.random() * erreurs.length)];
  }

  extractCoutErreur(content) {
    const couts = ['500€', '1000€', '1500€', '2000€'];
    return couts[Math.floor(Math.random() * couts.length)];
  }

  extractDescriptionErreur(content) {
    return "J'ai commis l'erreur de ne pas vérifier les conditions de mon visa avant de partir, pensant que tout se passerait bien.";
  }

  extractContexteErreur(content) {
    return "J'étais pressé de partir et j'ai fait confiance à des informations non vérifiées trouvées sur internet.";
  }

  extractSignesAvertissement(content) {
    return "Les délais de traitement étaient plus longs que prévu et les documents requis n'étaient pas clairs";
  }

  extractSituationAvant(content) {
    const situations = ['salarié en entreprise', 'freelance en Europe', 'étudiant', 'chômeur'];
    return situations[Math.floor(Math.random() * situations.length)];
  }

  extractSituationApres(content) {
    const situations = ['nomade digital', 'entrepreneur', 'consultant indépendant', 'coach en ligne'];
    return situations[Math.floor(Math.random() * situations.length)];
  }

  /**
   * GÉNÉRER LE BLOC QUOTE HIGHLIGHT
   */
  generateQuoteHighlight(selectedQuote, redditUsername = null) {
    if (!selectedQuote || !selectedQuote.text) {
      return '';
    }

    const quoteText = selectedQuote.text;
    
    // Format du cite avec username si disponible
    let citeText = 'Témoignage Reddit';
    if (redditUsername) {
      citeText = `Témoignage de u/${redditUsername} sur Reddit`;
    }

    return `<!-- wp:pullquote -->
<figure class="wp-block-pullquote" style="padding: 16px; margin-bottom: 0">
  <blockquote>
    <p>${quoteText}</p>
    <p><cite>${citeText}</cite></p>
  </blockquote>
</figure>
<!-- /wp:pullquote -->`;
  }

  extractDureeAvant(content) {
    const durees = ['2 ans', '5 ans', '3 ans', '1 an'];
    return durees[Math.floor(Math.random() * durees.length)];
  }

  extractDecisionTransition(content) {
    return "changer complètement de mode de vie et devenir nomade digital";
  }

  extractDestinationA(content) {
    const lieux = ['Bali', 'Vietnam', 'Thaïlande'];
    return lieux[Math.floor(Math.random() * lieux.length)];
  }

  extractDestinationB(content) {
    const lieux = ['Japon', 'Corée du Sud', 'Singapour'];
    return lieux[Math.floor(Math.random() * lieux.length)];
  }

  extractDureeA(content) {
    return '6 mois';
  }

  extractDureeB(content) {
    return '4 mois';
  }
}

export default TemplatesTemoignageComplets;
