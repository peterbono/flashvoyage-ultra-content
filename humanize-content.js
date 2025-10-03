#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-openai-api-key-here';

class ContentHumanizer {
  constructor() {
    this.humanizationPrompt = `
<Objective>
Your primary objective is to function as a Human-Centric Content Transformer. You will analyze user-provided text, often formal or potentially AI-like, and meticulously rewrite it to possess a significantly more human, engaging, and conversational quality. This transformation involves applying advanced stylistic techniques to enhance readability, connection, and naturalness while strictly preserving the original core message. Following the rewrite, you will provide a detailed analysis of the changes and their impact.
</Objective>

<Persona>
Assume the persona of an expert Copywriting Analyst and AI Text Humanizer. You possess a deep understanding of linguistic patterns, audience psychology, conversational rhythms, and the subtle qualities that distinguish human writing from typical AI generation. You are skilled at identifying and mitigating robotic text characteristics (like excessive formality, repetitive structures, predictable vocabulary) and adept at infusing text with natural variance, relatable language, and authentic voice, targeting a high degree of perplexity and burstiness naturally. You target clarity, aiming for a Gunning Fog index around 8.
</Persona>

Provide the text requiring humanization and optional context:
* Original Text: {{Original_Text}}
* Target Audience (Optional: Describe who this text is intended for): {{Target_Audience}}
* Desired Tone (Optional: e.g., "Casual & Friendly," "Expert but Relatable," "Enthusiastic & Energetic," "Calm & Reassuring"): {{Desired_Tone}}

Execute the following methodology to humanize the text and provide analysis:

<Internal_Methodology>
1.  Analyze Input Text & Context: Thoroughly examine the {{Original_Text}} for areas of formality, jargon, repetitive sentence structures, predictable vocabulary, passive voice, and lack of conversational flow. Critically consider the {{Target_Audience}} and {{Desired_Tone}} if provided. Identify the core message that must be preserved.
2.  Craft Humanized Version: Rewrite the text into one "Humanized Version" by applying the following principles:
    * Adopt a Conversational Tone: Match the {{Desired_Tone}} (or assume a generally engaging, natural tone if none is provided). Use contractions where appropriate. Address the reader implicitly or explicitly where suitable.
    * Minimize Jargon & Formalisms: Replace overly formal words, corporate buzzwords, and unnecessary technical jargon with clearer, more common language. Actively avoid clichés and robotic-sounding phrases (like many of those commonly found in AI outputs, e.g., "it's important to note," "delve into," "in conclusion").
    * Vary Sentence Structure & Length (Burstiness): Intentionally mix short, impactful sentences with longer, more explanatory ones. Vary sentence beginnings and structures to create a more dynamic rhythm, mimicking natural human expression.
    * Enrich Vocabulary Naturally (Perplexity): Employ a diverse range of words appropriate for the context, but prioritize naturalness over forced complexity. Strategically rephrase common or bland verbs, nouns, and adjectives with more vivid or specific alternatives where it enhances meaning and flow. Use descriptive phrasing sometimes instead of single modifiers.
    * Incorporate Conversational Connectors: Judiciously use natural-sounding transitions and discourse markers (like 'so,' 'well,' 'you know,' 'kind of,' 'actually,' 'anyway' – but used sparingly and appropriately, not forced into every sentence) to improve flow and mimic speech patterns.
    * Use Modifiers Thoughtfully: Employ adjectives and adverbs only when they add necessary meaning, clarity, or emphasis. Rely on strong verbs and specific nouns where possible.
    * Target Readability: Aim for a Gunning Fog index around 8, indicating clarity suitable for a wide audience.
    * Preserve Core Meaning: Ensure all essential information and the fundamental message of the {{Original_Text}} remain intact.
3.  Conduct Readability Analysis: Evaluate the generated "Humanized Version" and provide:
    * Strengths: List exactly 3 specific positive attributes (e.g., "Successfully incorporates varied sentence lengths," "Replaces jargon '[original jargon]' with clearer term '[new term]'," "Establishes a more relatable tone through [specific example]").
    * Weaknesses: List exactly 3 potential areas for caution or further refinement (e.g., "Opening sentence might still feel slightly formal," "Use of [specific conversational marker] could be reduced slightly," "Ensure clarity of [specific concept] wasn't lost in simplification").
4.  Provide Tone Evaluation Scores: Rate the "Humanized Version" on a 1-10 scale for: Authenticity, Engagement, Connection, and Conversational Tone.
5.  Offer Writing Style Tips: Provide 5 specific, actionable tips for the user on how to maintain a more human-like writing style in general, drawing insights from the rewrite process (e.g., "Tip: Vary sentence beginnings to avoid monotony," "Tip: Read your writing aloud to catch unnatural phrasing").
</Internal_Methodology>

<Output_Structure>
Structure your response clearly using markdown. Present the output using the following main headings (##) and sub-headings (###) exactly as specified. End the response immediately after the fifth writing style tip.

## Humanized Version
[Generated humanized text, formatted for readability]

## Readability Analysis
### Strengths
1. [Generated Strength 1]
2. [Generated Strength 2]
3. [Generated Strength 3]
### Weaknesses
1. [Generated Weakness 1]
2. [Generated Weakness 2]
3. [Generated Weakness 3]

## Tone Evaluation
Authenticity: [Generated Score]/10
Engagement: [Generated Score]/10
Connection: [Generated Score]/10
Conversational: [Generated Score]/10

## Writing Style Tips
* [Generated Tip 1]
* [Generated Tip 2]
* [Generated Tip 3]
* [Generated Tip 4]
* [Generated Tip 5]
</Output_Structure>

<Quality_Criteria>
The generated output must meet the following standards (Target: 10/10 Excellence):
1.  Natural & Human-Like: The Humanized Version significantly reduces robotic or overly formal patterns and reads naturally.
2.  Stylistic Goals Met: Demonstrates varied sentence structure, natural vocabulary, conversational flow, and aims for high clarity (Gunning Fog ~8). Jargon and specified negative patterns minimized.
3.  Core Message Preservation: Essential meaning of the {{Original_Text}} is accurately retained.
4.  Insightful Analysis: Readability analysis (Strengths/Weaknesses) provides specific, constructive feedback. Tone scores are reasonably assigned.
5.  Actionable Tips: Writing style tips offer practical advice for the user.
6.  Contextual Adaptation: Tone and style consider the {{Target_Audience}} and {{Desired_Tone}} if provided.
7.  Format Adherence: Strictly follows the specified output structure, including the absence of a closing paragraph.
</Quality_Criteria>

---
Begin analyzing the provided text and context, then generate the humanized version and the detailed analysis, following all instructions precisely, especially the stylistic guidelines and output format.
`;
  }

  async humanizeContent(originalText, targetAudience = "Voyageurs français passionnés d'Asie", desiredTone = "Expert but Relatable") {
    try {
      console.log('🤖 Humanisation du contenu en cours...');
      
      const prompt = this.humanizationPrompt
        .replace('{{Original_Text}}', originalText)
        .replace('{{Target_Audience}}', targetAudience)
        .replace('{{Desired_Tone}}', desiredTone);

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert copywriting analyst and AI text humanizer specializing in travel content for French-speaking audiences.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const humanizedContent = response.data.choices[0].message.content;
      console.log('✅ Contenu humanisé généré avec succès');
      
      return humanizedContent;
    } catch (error) {
      console.error('❌ Erreur lors de l\'humanisation du contenu:', error.response ? error.response.data : error.message);
      
      // Fallback: retourner le contenu original avec quelques améliorations basiques
      console.log('🔄 Utilisation du mode fallback...');
      return this.basicHumanization(originalText);
    }
  }

  basicHumanization(text) {
    // Améliorations basiques sans API
    let humanized = text;
    
    // Remplacer quelques phrases trop formelles
    humanized = humanized.replace(/Il est important de noter que/g, 'Bon à savoir :');
    humanized = humanized.replace(/Il convient de souligner que/g, 'Ce qui est intéressant, c\'est que');
    humanized = humanized.replace(/En conclusion/g, 'Pour résumer');
    humanized = humanized.replace(/Par ailleurs/g, 'D\'ailleurs');
    humanized = humanized.replace(/Cependant/g, 'Mais');
    humanized = humanized.replace(/Néanmoins/g, 'Cependant');
    
    // Ajouter quelques connecteurs conversationnels
    humanized = humanized.replace(/\. /g, '. Alors, ');
    humanized = humanized.replace(/Alors, Alors/g, 'Alors');
    
    return humanized;
  }

  async testHumanization() {
    const testText = `
<p><strong>FlashVoyages calcule :</strong> Cette offre de 200 000 vols gratuits en Thaïlande représente une économie réelle de 300-800€ sur votre voyage.</p>

<h3>📊 Impact sur votre budget :</h3>
<ul>
<li><strong>Économies immédiates :</strong> 300-800€ par personne</li>
<li><strong>Période de validité :</strong> 6 mois (janvier-juin 2025)</li>
<li><strong>Conditions :</strong> Réservation rapide requise</li>
<li><strong>Disponibilité :</strong> 200 000 places seulement</li>
</ul>

<h3>🎯 Action immédiate recommandée :</h3>
<ol>
<li><strong>Vérifiez l'éligibilité</strong> sur le site officiel TAT</li>
<li><strong>Préparez vos documents</strong> de voyage</li>
<li><strong>Réservez dans les 48h</strong> pour garantir l'offre</li>
<li><strong>Planifiez vos dates</strong> de départ</li>
</ol>
`;

    console.log('🧪 Test de l\'humanisation du contenu...');
    const result = await this.humanizeContent(testText);
    console.log('📝 Résultat de l\'humanisation :');
    console.log(result);
  }
}

// Exécuter le test si le script est appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  const humanizer = new ContentHumanizer();
  humanizer.testHumanization();
}

export default ContentHumanizer;
