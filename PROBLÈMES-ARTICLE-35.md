# 🔴 PROBLÈMES IDENTIFIÉS - Article #35

**URL** : https://flashvoyage.com/temoignage-voyage-retours-et-lecons-35/

---

## ❌ PROBLÈMES CRITIQUES

### 1. 🔴 Blockquotes en anglais (NON TRADUITS)
**Lignes 100, 125, 127, 129, 131, 133** :
- "eSIM recommendations for traveling through Asia..."
- "I've heard about Airalo and Holafly..."
- "For Japan specifically, get a local eSIM..."

**Cause** : Les blockquotes générés par le LLM ne sont pas supprimés avant que editorial-enhancer n'ajoute les siens, OU editorial-enhancer ne traduit pas correctement

**Solution** : Vérifier que les blockquotes LLM sont bien supprimés et que editorial-enhancer traduit

---

### 2. 🔴 Section "Ce que la communauté apporte" en anglais
**Lignes 159, 160, 161** :
- "For Japan specifically, get a local eSIM..."
- "Airalo Asia Link is great..."
- "Holafly is more expensive..."

**Cause** : La traduction des insights communauté ne fonctionne pas

**Solution** : Vérifier que la traduction est bien appliquée dans intelligent-content-analyzer

---

### 3. 🔴 Structure inversée
**Ordre actuel** :
- Moment critique (ligne 151)
- Événement central (ligne 153)
- Contexte (ligne 155) ← Devrait être en premier !

**Cause** : Le post-processing ne fonctionne pas correctement

**Solution** : Vérifier le post-processing dans intelligent-content-analyzer

---

### 4. 🔴 Section "Questions encore ouvertes" au lieu de "Nos recommandations"
**Ligne 151** : "Questions encore ouvertes"

**Cause** : Le remplacement ne fonctionne pas

**Solution** : Vérifier le post-processing dans intelligent-content-analyzer et article-finalizer

---

### 5. 🔴 FAQ en anglais
**Lignes 179, 181, 184** :
- "Qu'en est-il de esim recommendations for traveling through asia?"
- "i'll be traveling through thailand, vietnam, indonesia, and japan over the next 3 months ?"

**Cause** : La traduction FAQ ne fonctionne pas

**Solution** : Vérifier que addFAQSection est bien async et traduit

---

### 6. 🔴 Widget flights parasite "PAR → DPS"
**Ligne 199** : Widget flights affiche "Paris → Denpasar (Bali)"

**Cause** : buildGeoDefaults reçoit toujours { country: 'thailand', city: 'Indonesia' }

**Solution** : Vérifier la construction de geo dans pipeline-runner

---

## 🎯 ACTIONS PRIORITAIRES

1. **URGENT** : Vérifier que editorial-enhancer traduit bien les blockquotes
2. **URGENT** : Vérifier que la traduction insights communauté fonctionne
3. **URGENT** : Vérifier que le post-processing structure fonctionne
4. **URGENT** : Vérifier que le remplacement "Questions ouvertes" fonctionne
5. **URGENT** : Vérifier que la FAQ est traduite
6. **URGENT** : Vérifier widget flights destination

