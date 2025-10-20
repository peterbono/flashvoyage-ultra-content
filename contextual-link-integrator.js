#!/usr/bin/env node

/**
 * INTÉGRATEUR CONTEXTUEL - INSÉRER LES LIENS INTELLIGEMMENT DANS L'ARTICLE
 */

class ContextualLinkIntegrator {
  constructor() {
    this.linkStyle = 'color: #dc2626; text-decoration: underline;';
    this.maxLinksPerArticle = 15;
  }

  /**
   * Intégrer les liens suggérés dans le contenu HTML
   */
  integrateLinks(htmlContent, suggestedLinks) {
    console.log('🔗 INTÉGRATION DES LIENS CONTEXTUELS');
    console.log('====================================\n');

    let updatedContent = htmlContent;
    let linksIntegrated = 0;
    let linksSkipped = 0;

    // Trier les liens par score de pertinence (du plus pertinent au moins pertinent)
    const sortedLinks = [...suggestedLinks].sort((a, b) => b.relevance_score - a.relevance_score);

    console.log(`📊 Liens à intégrer: ${sortedLinks.length}`);
    console.log(`🎯 Limite maximale: ${this.maxLinksPerArticle}\n`);

    for (const link of sortedLinks) {
      // Vérifier si on n'a pas dépassé la limite
      if (linksIntegrated >= this.maxLinksPerArticle) {
        console.log(`⚠️ Limite de ${this.maxLinksPerArticle} liens atteinte`);
        break;
      }

      // Vérifier si l'ancre existe dans le contenu
      const anchorText = link.anchor_text;
      const anchorRegex = new RegExp(`\\b${this.escapeRegex(anchorText)}\\b`, 'i');

      if (!updatedContent.match(anchorRegex)) {
        console.log(`⏭️ Ancre "${anchorText}" non trouvée - Lien ignoré`);
        linksSkipped++;
        continue;
      }

      // Vérifier si l'ancre n'est pas déjà dans un lien
      if (this.isAlreadyLinked(updatedContent, anchorText)) {
        console.log(`⏭️ "${anchorText}" déjà dans un lien - Ignoré`);
        linksSkipped++;
        continue;
      }

      // Créer le lien HTML
      // Support pour liens internes (article_url) et externes (url)
      const linkUrl = link.article_url || link.url;
      const linkTitle = link.article_title || link.anchor_text;
      const linkHtml = this.createLink(anchorText, linkUrl, linkTitle);

      // Remplacer la première occurrence de l'ancre par le lien
      const beforeLength = updatedContent.length;
      updatedContent = updatedContent.replace(anchorRegex, linkHtml);

      if (updatedContent.length !== beforeLength) {
        linksIntegrated++;
        const displayTitle = linkTitle.substring(0, 50);
        console.log(`✅ ${linksIntegrated}. "${anchorText}" → ${displayTitle}...`);
        if (link.relevance_score) {
          console.log(`   Score: ${link.relevance_score}/10`);
        }
      } else {
        linksSkipped++;
      }
    }

    console.log(`\n📊 RÉSUMÉ:`);
    console.log(`  - Liens intégrés: ${linksIntegrated}`);
    console.log(`  - Liens ignorés: ${linksSkipped}`);
    console.log(`  - Total de liens dans l'article: ${this.countLinks(updatedContent)}`);

    return {
      content: updatedContent,
      stats: {
        integrated: linksIntegrated,
        skipped: linksSkipped,
        total: this.countLinks(updatedContent)
      }
    };
  }

  /**
   * Créer un lien HTML avec le style approprié
   */
  createLink(anchorText, url, title) {
    // Déterminer si c'est un lien interne ou externe
    const isInternal = url.includes('flashvoyage.com');
    const target = isInternal ? '_self' : '_blank';
    const rel = isInternal ? '' : ' rel="noopener"';

    return `<a href="${url}" target="${target}"${rel} style="${this.linkStyle}">${anchorText}</a>`;
  }

  /**
   * Vérifier si le texte est déjà dans un lien
   */
  isAlreadyLinked(content, text) {
    // Chercher si le texte est entre <a> et </a>
    const linkPattern = new RegExp(`<a[^>]*>[^<]*${this.escapeRegex(text)}[^<]*</a>`, 'i');
    return linkPattern.test(content);
  }

  /**
   * Compter le nombre total de liens dans le contenu
   */
  countLinks(content) {
    const matches = content.match(/<a href=/g);
    return matches ? matches.length : 0;
  }

  /**
   * Échapper les caractères spéciaux pour regex
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Nettoie la section "Articles connexes" pour ne garder que les vrais liens
   */
  cleanRelatedArticlesSection(htmlContent, suggestedLinks = []) {
    // Trouver la section "Articles connexes"
    const relatedSectionStart = htmlContent.indexOf('<h3>Articles connexes</h3>');
    if (relatedSectionStart === -1) return htmlContent;

    // Trouver la fin de la section (prochaine balise h2, h3 ou fin de contenu)
    const nextSectionStart = htmlContent.indexOf('<h2>', relatedSectionStart);
    const nextH3Start = htmlContent.indexOf('<h3>', relatedSectionStart + 1);
    const endOfContent = htmlContent.length;
    
    const sectionEnd = Math.min(
      nextSectionStart !== -1 ? nextSectionStart : endOfContent,
      nextH3Start !== -1 ? nextH3Start : endOfContent
    );

    // Extraire la section
    const beforeSection = htmlContent.substring(0, relatedSectionStart);
    const afterSection = htmlContent.substring(sectionEnd);
    
    // Créer une nouvelle section propre avec seulement les vrais liens
    const cleanSection = `\n\n<h3>Articles connexes</h3>\n<ul>\n`;
    
    // Chercher les vrais liens dans la section existante
    const linkMatches = htmlContent.substring(relatedSectionStart, sectionEnd).match(/<li><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a><\/li>/g);
    
    if (linkMatches && linkMatches.length > 0) {
      // Garder seulement les 3 premiers vrais liens
      const limitedLinks = linkMatches.slice(0, 3);
      const cleanedLinks = limitedLinks.map(link => {
        return link.replace(/<li><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a><\/li>/, (match, url, title) => {
          // Nettoyer le titre
          let cleanTitle = title
            .replace(/&#8217;/g, "'")
            .replace(/Source\s*:\s*/gi, '')
            .replace(/\s*–\s*Reddit\s+Digital\s+Nomad.*$/gi, '')
            .replace(/\s*–\s*Guide\s+FlashVoyages.*$/gi, '')
            .replace(/🌏\s*/g, '') // Supprimer les emojis
            .trim();
          
          if (cleanTitle.length > 80) {
            cleanTitle = cleanTitle.substring(0, 77) + '...';
          }
          
          console.log(`✅ Lien nettoyé: ${cleanTitle.substring(0, 60)}...`);
          return `<li><a href="${url}" target="_self" style="${this.linkStyle}">${cleanTitle}</a></li>`;
        });
      });
      
      return beforeSection + cleanSection + cleanedLinks.join('\n') + '\n</ul>\n' + afterSection;
    }
    
    // Si pas de vrais liens, recréer la section avec les liens suggérés
    console.log('⚠️ Aucun vrai lien trouvé, recréation de la section avec liens suggérés');
    
    // Utiliser les liens suggérés pour recréer la section
    if (suggestedLinks && suggestedLinks.length > 0) {
      const uniqueLinks = [];
      const seenUrls = new Set();

      suggestedLinks.forEach(link => {
        if (!seenUrls.has(link.article_url)) {
          uniqueLinks.push(link);
          seenUrls.add(link.article_url);
        }
      });

      const topLinks = uniqueLinks
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, 3);

      if (topLinks.length > 0) {
        let newSection = `\n\n<h3>Articles connexes</h3>\n<ul>\n`;
        
        topLinks.forEach(link => {
          // Utiliser le vrai titre au lieu de l'excerpt
          let cleanTitle = link.title || link.article_title;
          
          // Nettoyer le titre
          cleanTitle = cleanTitle
            .replace(/&#8217;/g, "'")
            .replace(/Source\s*:\s*/gi, '')
            .replace(/\s*–\s*Reddit\s+Digital\s+Nomad.*$/gi, '')
            .replace(/\s*–\s*Guide\s+FlashVoyages.*$/gi, '')
            .replace(/🌏\s*/g, '') // Supprimer les emojis
            .trim();
          
          if (cleanTitle.length > 80) {
            cleanTitle = cleanTitle.substring(0, 77) + '...';
          }
          
          newSection += `<li><a href="${link.article_url}" target="_self" style="${this.linkStyle}">${cleanTitle}</a></li>\n`;
          console.log(`✅ Lien ajouté: ${cleanTitle.substring(0, 60)}...`);
        });
        
        newSection += `</ul>\n`;
        return beforeSection + newSection + afterSection;
      }
    }
    
    // Si vraiment aucun lien, supprimer la section
    console.log('⚠️ Aucun lien disponible, suppression de la section');
    return beforeSection + afterSection;
  }

  /**
   * Ajouter une section "Articles connexes" en fin d'article
   */
  addRelatedArticlesSection(htmlContent, suggestedLinks, maxDisplay = 3) {
    console.log('\n📚 AJOUT DE LA SECTION "ARTICLES CONNEXES"');
    console.log('==========================================\n');

    // Vérifier si une section existe déjà
    if (htmlContent.includes('<h3>Articles connexes</h3>')) {
      console.log('⚠️ Section "Articles connexes" déjà présente - Nettoyage...');
      
      // Nettoyer la section existante pour ne garder que les vrais liens
      htmlContent = this.cleanRelatedArticlesSection(htmlContent, suggestedLinks);
      return htmlContent;
    }

    // Éliminer les doublons par URL
    const uniqueLinks = [];
    const seenUrls = new Set();

    suggestedLinks.forEach(link => {
      if (!seenUrls.has(link.article_url)) {
        uniqueLinks.push(link);
        seenUrls.add(link.article_url);
      }
    });

    // Prendre les 3 meilleurs liens uniques
    const topLinks = uniqueLinks
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, maxDisplay);

    if (topLinks.length === 0) {
      console.log('⚠️ Aucun lien à ajouter\n');
      return htmlContent;
    }

    let relatedSection = `\n\n<h3>Articles connexes</h3>\n<ul>\n`;

    topLinks.forEach(link => {
      // Nettoyer le titre (enlever les HTML entities et les "Source :")
      let cleanTitle = link.article_title
        .replace(/&#8217;/g, "'")
        .replace(/Source\s*:\s*/gi, '') // Enlever "Source :"
        .replace(/\s*–\s*Reddit\s+Digital\s+Nomad.*$/gi, '') // Enlever "– Reddit Digital Nomad..."
        .replace(/\s*–\s*Guide\s+FlashVoyages.*$/gi, '') // Enlever "– Guide FlashVoyages..."
        .trim();
      
      // Limiter la longueur du titre
      if (cleanTitle.length > 80) {
        cleanTitle = cleanTitle.substring(0, 77) + '...';
      }
      
      relatedSection += `<li><a href="${link.article_url}" target="_self" style="${this.linkStyle}">${cleanTitle}</a></li>\n`;
      console.log(`✅ Ajouté: ${cleanTitle.substring(0, 60)}...`);
    });

    relatedSection += `</ul>\n`;

    // Insérer avant le dernier </p> ou à la fin
    const lastParagraph = htmlContent.lastIndexOf('</p>');
    if (lastParagraph !== -1) {
      return htmlContent.substring(0, lastParagraph + 4) + relatedSection + htmlContent.substring(lastParagraph + 4);
    } else {
      return htmlContent + relatedSection;
    }
  }

  /**
   * Valider que le contenu ne dépasse pas les limites
   */
  validateLinkDensity(content, wordCount) {
    const linkCount = this.countLinks(content);
    const linkDensity = (linkCount / wordCount) * 100;

    console.log(`\n📊 VALIDATION DE LA DENSITÉ DE LIENS:`);
    console.log(`====================================`);
    console.log(`  - Mots: ${wordCount}`);
    console.log(`  - Liens: ${linkCount}`);
    console.log(`  - Densité: ${linkDensity.toFixed(2)}%`);

    if (linkDensity > 3) {
      console.log(`  ⚠️ Densité élevée (>3%) - Peut affecter le SEO`);
      return false;
    } else if (linkDensity < 0.5) {
      console.log(`  ⚠️ Densité faible (<0.5%) - Opportunités manquées`);
      return false;
    } else {
      console.log(`  ✅ Densité optimale (0.5-3%)`);
      return true;
    }
  }
}

// Exporter la classe
export { ContextualLinkIntegrator };

// Test si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('⚠️ Pour tester, utilisez: node test-link-integrator.js');
}
