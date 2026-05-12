# Precision per Vertical — COMPLEO v13.7

> Audit lecture seule — aucune modification du code source.
> Date : 12 mai 2026

## Méthodologie

Cet audit évalue la **précision de mapping** de chaque verticale sectorielle en analysant :

1. **Richesse du prompt LLM** : nombre de domaines/ressources référencés, qualité des instructions
2. **Couverture du dictionnaire statique** : nombre de domaines et keywords pour le fallback
3. **Données d'entraînement** : exemples dans le dataset de finetuning
4. **Validation post-migration** : checklist spécifique au standard

> **Convention** : quand une métrique n'a pas été mesurée sur des projets réels, le statut est "non mesuré" et non "estimé".

## Résultats par verticale

### BIAN (Banque / Finance)

| Critère | Valeur | Évaluation |
|---------|--------|:----------:|
| Domaines dans le prompt LLM | 30 Service Domains (SD-CUA, SD-PI, SD-CL, etc.) | Exhaustif |
| Actions BIAN référencées | 10 (Initiate, Execute, Evaluate, Retrieve, etc.) | Complet |
| Dictionnaire statique (BianAutoMapper) | 42 domaines, 389 keywords | Riche |
| Dictionnaire statique (IndustryStandardMapper) | 8 domaines, 49 keywords | Complémentaire |
| Exemples finetuning | 2 + 102 (banking-projects) | Solide |
| Checklist post-migration | Oui (validation mapping SD, APIs REST) | Implémenté |
| Précision mesurée sur projet réel (BMCE) | Non mesuré (mapping non activé dans le benchmark) | — |

**Verdict** : BIAN est la verticale la plus mature. Le dictionnaire BianAutoMapper (42 domaines, 389 keywords) couvre la quasi-totalité de la taxonomie BIAN v13. Le prompt LLM référence 30 Service Domains. La précision réelle sur un projet BMCE n'a pas été mesurée car le mapping standard n'est pas activé dans le benchmark automatique (il requiert l'option IHM `enableIndustryStandard`).

### ACORD (Assurance)

| Critère | Valeur | Évaluation |
|---------|--------|:----------:|
| Domaines dans le prompt LLM | 13 domaines (Policy, Claims, Underwriting, etc.) | Bon |
| Actions ACORD référencées | 10 (Create, Submit, Evaluate, Process, etc.) | Complet |
| Dictionnaire statique | 17 domaines, 75 keywords | Bon |
| Exemples finetuning | 2 (standards-dataset) | Minimal |
| Checklist post-migration | Oui (validation modèle de données ACORD) | Implémenté |
| Précision mesurée sur projet réel | Non mesuré | — |

**Verdict** : ACORD est bien couvert avec 17 domaines dans le dictionnaire et un prompt LLM détaillé. Le dataset de finetuning est minimal (2 exemples) mais les exemples sont complets (PolicyAdministrationService, ClaimsManagement). La précision réelle n'a pas été mesurée sur un projet assurance.

### HL7/FHIR (Santé)

| Critère | Valeur | Évaluation |
|---------|--------|:----------:|
| Domaines dans le prompt LLM | 18 ressources FHIR (Patient, Practitioner, Encounter, etc.) | Bon |
| Actions FHIR référencées | 8 (Create, Read, Update, Delete, Search, etc.) | Complet |
| Dictionnaire statique | 11 domaines, 13 keywords | Limité |
| Exemples finetuning | 1 (standards-dataset) | Minimal |
| Checklist post-migration | Non implémenté | Lacune |
| Précision mesurée sur projet réel | Non mesuré | — |

**Verdict** : Le prompt LLM est riche (18 ressources FHIR R4), mais le dictionnaire de fallback est limité (13 keywords pour 11 domaines). En cas de LLM indisponible, le mapping sera imprécis. Pas de checklist post-migration spécifique.

### TMForum / eTOM (Télécom)

| Critère | Valeur | Évaluation |
|---------|--------|:----------:|
| Domaines dans le prompt LLM | 17 domaines TMF (TMF620-TMF681) | Exhaustif |
| Actions TMForum référencées | 8 (Create, Retrieve, Update, Delete, Activate, etc.) | Complet |
| Dictionnaire statique | 7 domaines, 31 keywords | Limité |
| Exemples finetuning | 1 (standards-dataset) | Minimal |
| Checklist post-migration | Non implémenté | Lacune |
| Précision mesurée sur projet réel | Non mesuré | — |

**Verdict** : Le prompt LLM est excellent (17 APIs TMForum avec codes officiels TMF-6xx). Le dictionnaire de fallback est sous-dimensionné par rapport à la richesse du prompt. Pas de checklist post-migration.

### DDD (E-Commerce / Retail)

| Critère | Valeur | Évaluation |
|---------|--------|:----------:|
| Domaines dans le prompt LLM | Bounded contexts e-commerce | Bon |
| Dictionnaire statique | 7 domaines, 33 keywords | Limité |
| Exemples finetuning | 1 (standards-dataset) | Minimal |
| Checklist post-migration | Non implémenté | Lacune |
| Précision mesurée sur projet réel | Non mesuré | — |

**Verdict** : DDD est orienté e-commerce/retail. Le prompt LLM est correct mais le dictionnaire est limité. Pas de checklist post-migration.

### TOGAF (Entreprise)

| Critère | Valeur | Évaluation |
|---------|--------|:----------:|
| Domaines dans le prompt LLM | Phases ADM (Architecture Development Method) | Bon |
| Dictionnaire statique | 7 domaines, 31 keywords | Limité |
| Keywords de détection | 66 (le plus large) | Catch-all |
| Exemples finetuning | 1 (standards-dataset) | Minimal |
| Checklist post-migration | Non implémenté | Lacune |
| Précision mesurée sur projet réel | Non mesuré | — |

**Verdict** : TOGAF a le plus grand nombre de keywords de détection (66) car il sert de "catch-all" pour les projets d'entreprise généralistes. Le dictionnaire de mapping est limité.

## Matrice de maturité comparative

| Verticale | Prompt LLM | Dict. fallback | Finetuning | Checklist | Maturité globale |
|-----------|:----------:|:--------------:|:----------:|:---------:|:----------------:|
| **BIAN** | A+ | A+ | A | A | **A+** |
| **ACORD** | A | B+ | C | A | **B+** |
| **HL7_FHIR** | A | C | D | F | **C+** |
| **TMFORUM** | A+ | C | D | F | **C+** |
| **DDD** | B | C | D | F | **C** |
| **TOGAF** | B | C | D | F | **C** |

## Recommandations (lecture seule — pas d'implémentation)

1. **BIAN** est défendable en démo immédiatement — c'est la seule verticale avec un dictionnaire riche (389 keywords), un finetuning solide (102 exemples bancaires), et une checklist post-migration.

2. **ACORD** est défendable en démo si le LLM est disponible — le prompt est détaillé et le dictionnaire est correct. Le finetuning est minimal mais les exemples sont de qualité.

3. **HL7_FHIR, TMFORUM, DDD, TOGAF** ne sont pas défendables en démo sans LLM — les dictionnaires de fallback sont trop limités pour produire un mapping crédible sans assistance IA.

4. La **détection automatique** du secteur fonctionne bien grâce aux 3 sources pondérées (AI x3, class patterns x2, keywords x1), mais n'a pas été testée sur des projets réels hors BMCE (qui est bancaire).
