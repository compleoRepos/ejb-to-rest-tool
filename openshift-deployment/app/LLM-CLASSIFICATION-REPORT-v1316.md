# LLM Classification Report — v13.16

**Version** : 13.16  
**Date** : 13 mai 2026  
**Auteur** : Hamza NORDINE — Compleo  
**Composant** : `LlmFieldClassifier` + intégration `SchemaReverseEngineer` Phase 5b

---

## 1. Objectif

La v13.16 introduit un module de classification LLM pour les champs restés **UNKNOWN** après la classification rule-based (v13.15). Le LLM reçoit le contexte complet de chaque champ (nom, type Java, variable, usages dans le code) et retourne une catégorie, un sous-concept, un niveau de sensibilité et un raisonnement explicatif.

L'objectif est de porter le taux de classification du glossaire métier de ~30% (rule-based seul) à **90%+** (rule-based + LLM).

---

## 2. Architecture du LlmFieldClassifier

Le module `LlmFieldClassifier` est conçu pour être robuste en production :

| Caractéristique | Implémentation |
|----------------|----------------|
| **Batch size** | 15 champs par appel LLM (optimum coût/latence) |
| **Concurrence** | 2 batches max en parallèle |
| **Cache disque** | Hash SHA-256 du contexte → fichier JSON persistant |
| **Timeout** | 30s par batch, fallback gracieux si dépassé |
| **Fallback** | Si LLM indisponible (429, timeout, erreur) → champ reste UNKNOWN |
| **Validation** | Catégorie normalisée, confiance clampée [60-99], sensibilité validée |
| **Mode séquentiel** | Activé automatiquement si > 50 champs (évite surcharge) |

Le prompt est structuré pour forcer le LLM à retourner un JSON strict avec les champs : `category`, `subConcept`, `sensitivity`, `confidence`, `reasoning`.

---

## 3. Intégration dans la pipeline

Le `LlmFieldClassifier` est exécuté en **Phase 5b** du `SchemaReverseEngineer`, après la classification rule-based (Phase 5a) :

```
Phase 1: Extraction des champs (FieldUsageAnalyzer)
Phase 2: Inférence sémantique (SemanticInferenceEngine)
Phase 3: Détection des orphelins
Phase 4: Corrélation inter-projets
Phase 5a: Classification rule-based (BusinessConceptClassifier)
Phase 5b: Classification LLM (LlmFieldClassifier) ← NOUVEAU
Phase 6: Génération du glossaire (GlossaryGenerator)
```

Le GlossaryGenerator a été enrichi avec deux nouvelles colonnes :
- **Source** : `rule-based` ou `llm` — indique la méthode de classification
- **Reasoning** : explication textuelle du LLM pour les champs classifiés par IA

---

## 4. Résultats E2E — 3 projets BMCE

### 4.1 Synthèse

| Projet | Fichiers | Entries | Rule-based | LLM | Unknown | Taux v13.15 | Taux v13.16 | Gain |
|--------|----------|---------|------------|-----|---------|-------------|-------------|------|
| interface-send-sms | 9 | 8 | 4 (50%) | 4 (50%) | 0 | 50% | **100%** | +50 pts |
| commande-chequier | 41 | 24 | 7 (29%) | 15 (63%) | 2 (8%) | 29% | **92%** | +63 pts |
| interface-credit-jocker | 89 | 16 | 0 (0%) | 15 (94%) | 1 (6%) | 0% | **94%** | +94 pts |
| **TOTAL** | **139** | **48** | **11 (23%)** | **34 (71%)** | **3 (6%)** | **23%** | **94%** | **+71 pts** |

### 4.2 Analyse par catégorie (LLM)

| Catégorie | Occurrences | Confiance moyenne |
|-----------|-------------|-------------------|
| STATUS | 12 | 93 |
| MONETARY | 4 | 90 |
| CONTACT | 4 | 95 |
| SYSTEM | 8 | 88 |
| IDENTITY | 3 | 90 |
| TIME | 2 | 85 |
| DOCUMENT | 1 | 85 |

### 4.3 Exemples de classifications LLM

| Champ | Catégorie | Sous-concept | Conf. | Reasoning (extrait) |
|-------|-----------|--------------|-------|---------------------|
| MESSAGE (SMS) | CONTACT | SMS Content | 95 | "Le champ 'message' est clairement le contenu textuel d'un SMS" |
| CODE (réponse) | STATUS | Response Code | 95 | "Le champ 'code' dans un objet de réponse indique un code retour" |
| MntDisponible | MONETARY | Available Amount | 90 | "Le préfixe 'Mnt' indique un montant et 'Disponible' spécifie la disponibilité" |
| MntEcheance | MONETARY | Installment Amount | 90 | "Le préfixe 'Mnt' indique un montant et 'Echeance' fait référence à une échéance" |
| NB_VIGNETTES | SYSTEM | Voucher Count | 90 | "Indique le nombre de vignettes dans un chéquier" |

---

## 5. Tests unitaires

**22 tests** couvrent le `LlmFieldClassifier` :

| Catégorie de test | Nombre | Description |
|-------------------|--------|-------------|
| Cache hit/miss | 3 | Vérification du cache disque (hit, miss, export/import) |
| Batch splitting | 2 | Découpage correct en batches de 15 |
| Fallback gracieux | 4 | LLM null, erreur, non-array, timeout |
| Validation | 3 | Catégorie invalide, sensibilité invalide, confiance hors bornes |
| Seuil confiance | 1 | Rejet des classifications < 60 |
| Mode séquentiel | 1 | Activation automatique > 50 champs |
| Réponse partielle | 1 | Gestion des réponses incomplètes |
| Stats | 2 | Compteurs LLM classifiés, cache hits |
| Intégration | 5 | Pipeline complète avec mock LLM |

**Total tests decoder** : 123/123 passent (22 LlmFieldClassifier + 65 BusinessConceptClassifier + 20 SchemaReverseEngineer + 16 SchemaDecoder).

---

## 6. Gestion du rate limiting

Lors du E2E, la compilation LLM de `commande-chequier` (41 fichiers) a déclenché des erreurs **429 Too Many Requests** sur l'API LLM Manus. Le système a géré la situation correctement :

- La `CompilationLoop` a attendu le backoff et repris automatiquement
- Le `LlmFieldClassifier` (Phase 5b) a bénéficié du cache pour les appels déjà réussis
- Le fallback gracieux a laissé 2 champs en UNKNOWN plutôt que de crasher

La durée totale de `commande-chequier` est passée de ~40s (v13.15 sans LLM) à ~12 minutes (v13.16 avec LLM + rate limiting). En conditions normales (sans 429), la durée estimée est de ~90s.

---

## 7. Projets non testés

| Projet | Fichiers | Raison |
|--------|----------|--------|
| avis-opere | 64 | OOM sandbox (mémoire limitée) |
| transfert-euro-bmce-direct | 212 | OOM sandbox (mémoire limitée) |

Ces projets nécessitent le **chunking de la CompilationLoop** (v13.17 planifiée) pour être traités dans la sandbox.

---

## 8. Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `server/engine/decoder/LlmFieldClassifier.ts` | **NOUVEAU** — Module de classification LLM |
| `server/engine/decoder/LlmFieldClassifier.test.ts` | **NOUVEAU** — 22 tests unitaires |
| `server/engine/decoder/SchemaReverseEngineer.ts` | Ajout Phase 5b |
| `server/engine/decoder/GlossaryGenerator.ts` | Colonnes Source + Reasoning (HTML/CSV/JSON) |
| `server/engine/decoder/SchemaReverseEngineer.test.ts` | Ajout `useLlmForUnknown: false` |

---

## 9. Prochaines étapes

1. **v13.17 — Chunking CompilationLoop** : traitement par lots de 30 fichiers max pour supporter avis-opere et transfert-euro sans OOM.
2. **Cache LLM partagé** : mutualiser le cache entre sessions pour éviter les appels redondants sur les mêmes patterns de champs.
3. **Dictionnaire métier BMCE** : pré-classifier les termes bancaires récurrents (TYPECHEQUIER, MOTIF_REJET, COD_AGENCE) en rule-based pour réduire la dépendance au LLM.
4. **Métriques de qualité** : dashboard de suivi du taux de classification par projet et par catégorie.
