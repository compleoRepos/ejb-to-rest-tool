# Standards Coverage Matrix — COMPLEO v13.7

> Audit lecture seule — aucune modification du code source.
> Date : 12 mai 2026

## 1. Verticales sectorielles supportées

COMPLEO supporte **6 standards sectoriels** + 1 mode neutre (NONE). Chaque standard dispose d'un prompt LLM dédié, d'un dictionnaire statique de fallback, et d'un rapport de mapping généré.

| Standard | Nom complet | Secteur cible | Prompt LLM | Dict. statique | Rapport |
|----------|-------------|---------------|:----------:|:--------------:|:-------:|
| **BIAN** | Banking Industry Architecture Network v13 | Banque / Finance | Oui (30 SD référencés) | 42 domaines, 389 keywords (BianAutoMapper) + 8 domaines, 49 keywords (IndustryStandardMapper) | BIAN_MAPPING.md |
| **ACORD** | Association for Cooperative Operations Research and Development | Assurance | Oui (13 domaines référencés) | 17 domaines, 75 keywords | ACORD_MAPPING.md |
| **HL7_FHIR** | Health Level 7 / FHIR R4 | Santé / Médical | Oui (18 ressources FHIR référencées) | 11 domaines, 13 keywords | HL7_FHIR_MAPPING.md |
| **TMFORUM** | TM Forum Open APIs / eTOM / SID | Télécom | Oui (17 domaines TMF référencés) | 7 domaines, 31 keywords | TMFORUM_MAPPING.md |
| **DDD** | Domain-Driven Design | E-Commerce / Retail | Oui (bounded contexts) | 7 domaines, 33 keywords | DDD_MAPPING.md |
| **TOGAF** | The Open Group Architecture Framework | Entreprise généraliste | Oui (ADM phases) | 7 domaines, 31 keywords | TOGAF_MAPPING.md |

## 2. Pipeline de détection sectorielle

La détection du secteur est **automatique** via `DynamicOptionsResolver.detectDomain()` avec 3 sources pondérées :

| Source | Poids | Mécanisme |
|--------|:-----:|-----------|
| AI Insights (LLM) | x3 | Analyse sémantique des domaines métier détectés par le LLM |
| Class patterns (regex) | x2 | Matching des noms de classes contre des patterns sectoriels (ex: `AccountService`, `PolicyManager`) |
| Keyword frequency | x1 (max 20) | Comptage des mots-clés sectoriels dans le code source |

**Seuils de confiance** : score >= 15 → high, >= 8 → medium, >= 3 → low, < 3 → NONE.

**Keywords de détection par standard** :

| Standard | Keywords détection | Class patterns |
|----------|:-----------------:|:--------------:|
| BIAN | 30 | 6 regex |
| ACORD | 20 | 5 regex |
| HL7_FHIR | 19 | 5 regex |
| TMFORUM | 20 | 5 regex |
| DDD | 19 | 5 regex |
| TOGAF | 66 | 5 regex |

## 3. Technologies legacy supportées (Registry)

Le pipeline multi-technologies détecte et migre **18 types de composants** Java legacy :

| Technologie | Tier | Détecteur | Générateur |
|-------------|:----:|:---------:|:----------:|
| EJB 3.x Stateless | 1 | ejb3x-detector | spring-generator (principal) |
| EJB 3.x Stateful | 1 | ejb3x-detector | spring-generator (principal) |
| EJB 3.x Singleton | 1 | ejb3x-detector | spring-generator (principal) |
| EJB 3.x MDB | 1 | ejb3x-detector | spring-generator (principal) |
| EJB 2.x | 1 | ejb2x-detector | ejb2x-generator |
| Servlet | 1 | servlet-detector | servlet-generator |
| JSP | 2 | jsp-detector | — (détection seule) |
| Struts 1 | 1 | struts-detector | struts-generator |
| Struts 2 | 1 | struts-detector | struts-generator |
| SOAP / JAX-WS | 1 | soap-detector | soap-generator |
| JAX-RS | 1 | jaxrs-detector | — (déjà REST) |
| JDBC | 1 | jdbc-detector | jdbc-generator |
| Hibernate | 1 | hibernate-detector | hibernate-generator |
| JPA | 2 | jpa-detector | — (détection seule) |
| JMS | 1 | jms-detector | jms-generator |
| Batch | 1 | batch-detector | batch-generator |
| EAI Custom | 1 | eai-detector | eai-generator |
| SAGA | 1 | — (généré) | saga-generator |

## 4. Finetuning dataset

| Dataset | Exemples | Contenu |
|---------|:--------:|---------|
| finetuning-banking-projects.jsonl | 102 | Exemples de migration bancaire (messages LLM) |
| finetuning-standards-dataset.jsonl | 8 | Exemples de mapping multi-standards (2 BIAN, 2 ACORD, 1 HL7, 1 TMF, 1 DDD, 1 TOGAF) |

## 5. Post-migration checklist par standard

Le `PostMigrationChecklist` génère des items de validation spécifiques au standard détecté :

- **BIAN** : Valider le mapping des Service Domains, vérifier l'alignement des APIs REST avec les actions BIAN
- **ACORD** : Valider l'alignement sur le modèle de données ACORD, vérifier les transactions normalisées
- **HL7_FHIR** : Non mesuré (pas de checklist spécifique implémentée)
- **TMFORUM** : Non mesuré (pas de checklist spécifique implémentée)
- **DDD** : Non mesuré (pas de checklist spécifique implémentée)
- **TOGAF** : Non mesuré (pas de checklist spécifique implémentée)
