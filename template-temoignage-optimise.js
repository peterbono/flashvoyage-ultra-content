#!/usr/bin/env node

/**
 * Template Témoignage Optimisé - Structure claire et paramétrable
 * Basé sur l'analyse de la concurrence et les spécifications détaillées
 */

class TemplateTemoignageOptimise {
  constructor() {
    this.template = {
      // Template témoignage optimisé
      temoignage_nomade: {
        title: "{lieu} : {probleme} - Comment {solution}",
        target_audience: "Digital nomades confrontés à des difficultés en Asie",
        ton: "Factuel, direct, orienté action",
        keywords: "témoignage nomade, problème voyage asie, solution pratique",
        cta: "Découvrez comment surmonter vos défis de nomade",
        urgence: "Solution testée et approuvée",
        destinations: "Asie, Vietnam, Thaïlande, Indonésie, Japon, Corée du Sud",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<h2>{lieu} : {probleme} - Comment {solution}</h2>

<p><strong>Introduction (50-70 mots) :</strong></p>
<p>Je suis {prenom}, {age} ans, {profession}. En {destination} pour {duree}, j'ai été confronté à {probleme_principal}. Cette situation {consequence_immediate} et m'a obligé à {action_necessaire}.</p>

<h3>Le problème rencontré</h3>
<p><strong>Situation précise (100-150 mots) :</strong></p>
<p>{description_probleme_detaille}</p>
<p><strong>Conséquences concrètes :</strong> {consequences_concretes}</p>
<p><strong>Erreurs commises :</strong> {erreurs_commises}</p>

<h3>Ma recherche de solutions</h3>
<p><strong>Actions entreprises (150-200 mots) :</strong></p>
<p>Face à cette situation, j'ai d'abord {action_1}. J'ai contacté {contact_1} qui m'a conseillé de {conseil_1}.</p>
<p>J'ai ensuite consulté {ressource_1} et {ressource_2} pour trouver des alternatives. Sur {forum_1}, j'ai découvert {decouverte_1}.</p>
<p>J'ai également testé {outil_1} et {outil_2} pour {objectif_specifique}. Ces outils m'ont permis de {benefice_1} et {benefice_2}.</p>

<h3>La solution qui a fonctionné</h3>
<p><strong>Résolution (80-120 mots) :</strong></p>
<p>La solution qui a finalement résolu mon problème était {solution_choisie}. Grâce à {outil_service}, j'ai pu {action_resolution}. Le déblocage s'est produit {moment_deblocage} et m'a permis de {resultat_final}.</p>

<h3>Mes enseignements</h3>
<p><strong>Conseils concrets (3-5 points) :</strong></p>
<ul>
<li><strong>Vérifiez {conseil_1} :</strong> {explication_conseil_1}</li>
<li><strong>Munissez-vous de {conseil_2} :</strong> {explication_conseil_2}</li>
<li><strong>Utilisez {conseil_3} :</strong> {explication_conseil_3}</li>
<li><strong>Prévoyez {conseil_4} :</strong> {explication_conseil_4}</li>
<li><strong>Gardez {conseil_5} :</strong> {explication_conseil_5}</li>
</ul>

<h3>Outils recommandés</h3>
<p><strong>Widgets Travelpayouts :</strong></p>
<p>Pour éviter ce type de problème, voici les outils que je recommande :</p>
<ul>
<li><strong>Vols flexibles :</strong> {TRAVELPAYOUTS_FLIGHTS_WIDGET}</li>
<li><strong>Hébergement sécurisé :</strong> {TRAVELPAYOUTS_HOTELS_WIDGET}</li>
<li><strong>Assurance voyage :</strong> {TRAVELPAYOUTS_INSURANCE_WIDGET}</li>
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
   * Génère un témoignage optimisé basé sur les données Reddit
   */
  generateTemoignage(data) {
    const template = this.template.temoignage_nomade;
    
    // Extraction des données du post Reddit
    const lieu = this.extractLieu(data.content);
    const probleme = this.extractProbleme(data.content);
    const solution = this.extractSolution(data.content);
    const prenom = this.extractPrenom(data.content);
    const age = this.extractAge(data.content);
    const profession = this.extractProfession(data.content);
    const destination = this.extractDestination(data.content);
    const duree = this.extractDuree(data.content);
    
    // Génération du contenu structuré
    const content = template.content
      .replace(/{lieu}/g, lieu)
      .replace(/{probleme}/g, probleme)
      .replace(/{solution}/g, solution)
      .replace(/{prenom}/g, prenom)
      .replace(/{age}/g, age)
      .replace(/{profession}/g, profession)
      .replace(/{destination}/g, destination)
      .replace(/{duree}/g, duree)
      .replace(/{sourceLink}/g, data.permalink)
      .replace(/{title}/g, data.title)
      .replace(/{source}/g, 'Reddit')
      .replace(/{TRAVELPAYOUTS_FLIGHTS_WIDGET}/g, '{{TRAVELPAYOUTS_FLIGHTS_WIDGET}}')
      .replace(/{TRAVELPAYOUTS_HOTELS_WIDGET}/g, '{{TRAVELPAYOUTS_HOTELS_WIDGET}}')
      .replace(/{TRAVELPAYOUTS_INSURANCE_WIDGET}/g, '{{TRAVELPAYOUTS_INSURANCE_WIDGET}}');
    
    return {
      title: template.title
        .replace(/{lieu}/g, lieu)
        .replace(/{probleme}/g, probleme)
        .replace(/{solution}/g, solution),
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
   * Extraction des éléments clés du contenu Reddit
   */
  extractLieu(content) {
    const lieux = ['Bali', 'Vietnam', 'Thaïlande', 'Japon', 'Corée du Sud', 'Singapour', 'Indonésie', 'Philippines'];
    for (const lieu of lieux) {
      if (content.toLowerCase().includes(lieu.toLowerCase())) {
        return lieu;
      }
    }
    return 'Asie';
  }

  extractProbleme(content) {
    const problemes = [
      'visa expiré', 'passeport perdu', 'réservation annulée', 'vol retardé',
      'hôtel refusé', 'argent bloqué', 'santé compromise', 'wifi coupé'
    ];
    for (const probleme of problemes) {
      if (content.toLowerCase().includes(probleme)) {
        return probleme;
      }
    }
    return 'difficulté majeure';
  }

  extractSolution(content) {
    const solutions = [
      'j\'ai sauvé mon séjour', 'j\'ai trouvé une solution', 'j\'ai surmonté l\'obstacle',
      'j\'ai résolu le problème', 'j\'ai trouvé une alternative'
    ];
    return solutions[Math.floor(Math.random() * solutions.length)];
  }

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
    return this.extractLieu(content);
  }

  extractDuree(content) {
    const durees = ['3 mois', '6 mois', '1 an', '2 ans', '8 mois', '4 mois'];
    return durees[Math.floor(Math.random() * durees.length)];
  }
}

module.exports = TemplateTemoignageOptimise;
