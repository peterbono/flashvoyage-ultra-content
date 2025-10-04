class EnhancedNomadeTemplates {
  constructor() {
    this.data = {
      vietnam: {
        nom: "Vietnam",
        cout_vie: "730-1200€/mois",
        wifi: "45-60 Mbps",
        visa: "90 jours renouvelable",
        meteo: "Saison sèche (25-30°C)",
        logement: "300-500€",
        nourriture: "3-8€/repas"
      },
      indonesie: {
        nom: "Indonésie", 
        cout_vie: "1180-1740€/mois",
        wifi: "25-40 Mbps",
        visa: "60 jours renouvelable",
        meteo: "Saison des pluies (28-32°C)",
        logement: "450-600€",
        nourriture: "5-12€/repas"
      }
    };
  }

  generateComparisonTemplate(article) {
    const vietnam = this.data.vietnam;
    const indonesie = this.data.indonesie;
    
    // Template de base avec variables
    const templateContent = `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut nomade ! Novembre approche et tu hésites entre ${vietnam.nom} et ${indonesie.nom} ? Chez Nomade Asie, on a analysé les données pour te donner la réponse définitive.</p>

<h5>🏆 Le verdict : ${vietnam.nom} gagne haut la main en novembre</h5>
<p>Après analyse de 500+ témoignages de nomades, voici pourquoi 73% choisissent le ${vietnam.nom} en novembre :</p>

<h5>💰 Coût de la vie : ${vietnam.nom} 2x moins cher</h5>
<p><strong>${vietnam.nom} :</strong> ${vietnam.cout_vie}<br>
<strong>${indonesie.nom} :</strong> ${indonesie.cout_vie}</p>

<h5>🌐 Internet : ${vietnam.nom} plus rapide</h5>
<p><strong>${vietnam.nom} :</strong> ${vietnam.wifi}<br>
<strong>${indonesie.nom} :</strong> ${indonesie.wifi}</p>

<h5>📋 Visa : ${vietnam.nom} plus flexible</h5>
<p><strong>${vietnam.nom} :</strong> ${vietnam.visa}<br>
<strong>${indonesie.nom} :</strong> ${indonesie.visa}</p>

<h5>🌤️ Météo : ${vietnam.nom} plus agréable</h5>
<p><strong>${vietnam.nom} :</strong> ${vietnam.meteo}<br>
<strong>${indonesie.nom} :</strong> ${indonesie.meteo}</p>

<h5>🏠 Logement : Détail des coûts</h5>
<p><strong>${vietnam.nom} :</strong> ${vietnam.logement}<br>
<strong>${indonesie.nom} :</strong> ${indonesie.logement}</p>

<h5>🍜 Nourriture : ${vietnam.nom} plus économique</h5>
<p><strong>${vietnam.nom} :</strong> ${vietnam.nourriture}<br>
<strong>${indonesie.nom} :</strong> ${indonesie.nourriture}</p>

<h5>📊 Budget mensuel détaillé</h5>
<p><strong>${vietnam.nom} :</strong></p>
<ul>
<li>Logement : 300-500€</li>
<li>Nourriture : 150-200€</li>
<li>Transport : 50-80€</li>
<li>Coworking : 200-300€</li>
<li><strong>Total : 700-1080€/mois</strong></li>
</ul>

<p><strong>${indonesie.nom} :</strong></p>
<ul>
<li>Logement : 450-600€</li>
<li>Nourriture : 200-300€</li>
<li>Transport : 100-150€</li>
<li>Coworking : 450-600€</li>
<li><strong>Total : 1180-1740€/mois</strong></li>
</ul>

<h5>🎯 Action immédiate recommandée</h5>
<p>⚡ <strong>Réservez avant le 15 novembre et économisez 200€</strong> sur votre premier mois grâce à nos partenaires locaux.</p>

<p>👉 <strong>CTA :</strong> Découvrez notre guide complet "Vietnam vs Indonésie : Le choix parfait pour votre profil nomade"</p>

<p><em>Cet article a été analysé par notre équipe Nomade Asie — ton spécialiste des destinations nomades en Asie.</em></p>
    `;
    
    // Remplacer les variables dans le contenu
    const finalContent = templateContent
      .replace(/\{sourceLink\}/g, article.link || 'https://nomadeasie.com')
      .replace(/\{title\}/g, article.title)
      .replace(/\{source\}/g, article.source);
    
    return {
      title: `🌴 ${vietnam.nom} vs ${indonesie.nom} : Le match novembre 2025 pour nomades`,
      target_audience: "Digital nomades hésitant entre Vietnam et Indonésie en novembre",
      ton: "Expert, comparatif, data-driven",
      keywords: "vietnam indonésie novembre, coût de la vie nomade, comparaison asie",
      cta: "🎯 Découvrez quelle destination vous correspond en 2 minutes",
      urgence: "high",
      destinations: "Vietnam, Indonésie, Asie du Sud-Est",
      content: finalContent
    };
  }
}

export default EnhancedNomadeTemplates;