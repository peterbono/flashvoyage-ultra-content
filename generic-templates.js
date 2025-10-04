#!/usr/bin/env node

/**
 * Templates génériques pour différents types d'articles
 * Pas seulement pour les nomades
 */

class GenericTemplates {
  constructor() {
    this.templates = {
      // Template pour articles de voyage général
      voyage_general: {
        title: "✈️ {title} - FlashVoyages",
        target_audience: "Voyageurs passionnés",
        ton: "Informatif, pratique, enthousiaste",
        keywords: "voyage, conseils, astuces, bonnes pratiques",
        cta: "Découvrez nos conseils voyage",
        urgence: "Information utile",
        destinations: "Monde entier",
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut voyageur ! Si tu cherches des conseils pour améliorer tes voyages, cette info va t'intéresser. Chez FlashVoyages, on partage les meilleures astuces pour voyager malin.</p>

<h5>Pourquoi cette info est utile pour toi</h5>
<p>Cette information sur {type}, c'est le genre de conseil qui peut améliorer ton expérience de voyage et te faire économiser du temps et de l'argent.</p>

<p>On partage ces conseils parce qu'on sait que nos lecteurs aiment voyager intelligemment et découvrir de nouvelles façons d'optimiser leurs voyages.</p>

<h5>Ce que tu dois retenir</h5>
<p>Voici les points clés :</p>

<ul>
<li><strong>{type} :</strong> {content}</li>
<li><strong>Validité :</strong> {validityPeriod}</li>
<li><strong>Pour qui :</strong> Tous les voyageurs</li>
<li><strong>Bénéfices :</strong> Amélioration de l'expérience voyage</li>
</ul>

<h5>Notre conseil FlashVoyages</h5>
<p>On te recommande de tester ces conseils lors de ton prochain voyage. Chaque voyageur est différent, mais ces astuces fonctionnent généralement bien.</p>

<h5>Contexte voyage</h5>
<p>Ces conseils s'inscrivent dans une approche globale d'optimisation de l'expérience voyage. Plus on voyage, plus on apprend à voyager mieux.</p>

<h5>Notre analyse</h5>
<p><strong>Score FlashVoyages :</strong> {relevance}/100 — Information utile</p>
<p><strong>Pourquoi c'est important :</strong> Amélioration concrète de ton expérience voyage</p>
<p><strong>Action recommandée :</strong> Tester ces conseils</p>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — ton spécialiste du voyage.</em></p>
        `
      },

      // Template pour articles Asie général
      asie_general: {
        title: "🌏 {title} - Asie FlashVoyages",
        target_audience: "Voyageurs passionnés d'Asie",
        ton: "Expert, culturel, respectueux",
        keywords: "asie, culture, voyage, découverte",
        cta: "Découvrez l'Asie avec nous",
        urgence: "Information culturelle",
        destinations: "Asie",
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut voyageur d'Asie ! Si tu t'intéresses à la culture et aux traditions asiatiques, cette info va enrichir ta compréhension. Chez FlashVoyages, on adore partager notre passion pour l'Asie.</p>

<h5>Pourquoi cette info enrichit ton voyage</h5>
<p>Cette information sur {type} en Asie, c'est le genre de connaissance qui transforme un simple voyage en véritable expérience culturelle.</p>

<p>On partage ces informations parce qu'on croit que voyager, c'est aussi comprendre et respecter les cultures qu'on découvre.</p>

<h5>Ce que tu dois savoir</h5>
<p>Voici les éléments importants :</p>

<ul>
<li><strong>{type} :</strong> {content}</li>
<li><strong>Validité :</strong> {validityPeriod}</li>
<li><strong>Pour qui :</strong> Voyageurs curieux d'Asie</li>
<li><strong>Valeur :</strong> Enrichissement culturel</li>
</ul>

<h5>Notre conseil FlashVoyages</h5>
<p>On te conseille de garder ces informations en tête lors de ton prochain voyage en Asie. La compréhension culturelle enrichit énormément l'expérience.</p>

<h5>Contexte culturel asiatique</h5>
<p>Cette information s'inscrit dans la richesse culturelle de l'Asie. Chaque pays, chaque région a ses spécificités qu'il est passionnant de découvrir.</p>

<h5>Notre analyse</h5>
<p><strong>Score FlashVoyages :</strong> {relevance}/100 — Information culturelle</p>
<p><strong>Pourquoi c'est important :</strong> Enrichissement de ta compréhension de l'Asie</p>
<p><strong>Action recommandée :</strong> Approfondir cette connaissance</p>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — ton spécialiste de l'Asie.</em></p>
        `
      },

      // Template pour articles généraux
      general: {
        title: "📰 {title} - FlashVoyages",
        target_audience: "Lecteurs FlashVoyages",
        ton: "Informatif, neutre, factuel",
        keywords: "information, actualité, conseils",
        cta: "Restez informés avec FlashVoyages",
        urgence: "Information générale",
        destinations: "Divers",
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Bonjour ! Si tu cherches des informations utiles, cette actualité pourrait t'intéresser. Chez FlashVoyages, on partage des informations qui nous semblent pertinentes.</p>

<h5>Pourquoi cette info est intéressante</h5>
<p>Cette information sur {type}, c'est le genre de nouvelle qui peut avoir un impact sur tes décisions ou ta compréhension du monde.</p>

<p>On partage cette information parce qu'on pense qu'elle peut être utile à notre communauté de lecteurs.</p>

<h5>Les points clés</h5>
<p>Voici ce qu'il faut retenir :</p>

<ul>
<li><strong>{type} :</strong> {content}</li>
<li><strong>Validité :</strong> {validityPeriod}</li>
<li><strong>Pour qui :</strong> Tous nos lecteurs</li>
<li><strong>Intérêt :</strong> Information générale</li>
</ul>

<h5>Notre point de vue FlashVoyages</h5>
<p>On pense que cette information mérite d'être partagée. Chacun pourra en tirer ce qui lui semble utile.</p>

<h5>Contexte général</h5>
<p>Cette information s'inscrit dans l'actualité générale. Il est toujours intéressant de rester informé sur les évolutions du monde.</p>

<h5>Notre analyse</h5>
<p><strong>Score FlashVoyages :</strong> {relevance}/100 — Information générale</p>
<p><strong>Pourquoi c'est partagé :</strong> Information potentiellement utile</p>
<p><strong>Action recommandée :</strong> Se tenir informé</p>

<p><em>Cet article a été analysé par notre équipe FlashVoyages.</em></p>
        `
      }
    };
  }

  // Obtenir un template par nom
  getTemplate(templateName) {
    return this.templates[templateName] || this.templates.general;
  }

  // Remplir un template
  fillTemplate(templateName, article) {
    const template = this.getTemplate(templateName);
    
    // Nettoyer le titre pour éviter les doublons d'emojis
    const cleanTitle = article.title.replace(/^[🏠✈️💰👥📰🌏📰]+/, '').trim();
    
    return {
      title: template.title.replace('{title}', cleanTitle),
      target_audience: template.target_audience,
      ton: template.ton,
      keywords: template.keywords,
      cta: template.cta,
      urgence: template.urgence,
      destinations: template.destinations,
      content: template.content
        .replace(/\{sourceLink\}/g, article.link || 'https://example.com')
        .replace(/\{title\}/g, article.title)
        .replace(/\{source\}/g, article.source)
        .replace(/\{type\}/g, article.type || 'information')
        .replace(/\{content\}/g, article.content || article.title)
        .replace(/\{validityPeriod\}/g, this.getValidityPeriod(article))
        .replace(/\{relevance\}/g, article.relevance || 50)
    };
  }

  // Générer une période de validité appropriée
  getValidityPeriod(article) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    if (article.source.includes('Reddit')) {
      return 'Information récente - Source communautaire';
    } else if (article.type === 'news') {
      return `Actualité ${currentYear}`;
    } else {
      return `Information valide jusqu'en décembre ${currentYear}`;
    }
  }
}

export default GenericTemplates;
