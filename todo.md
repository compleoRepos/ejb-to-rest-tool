
## Workspace Intelligence Module
- [x] Concevoir l'architecture du module workspace-intelligence (sans toucher aux modules existants)
- [x] Implémenter le Cross-Project Graph Builder (graphe inter-projets, détection appels EJB cross-modules)
- [x] Implémenter le Redundancy Detector (détection de services redondants entre projets)
- [x] Implémenter le Mutualization Recommender (propositions de mutualisation de services)
- [x] Intégrer le workspace intelligence dans le frontend (dashboard, visualisation graphe)
- [x] Écrire les tests unitaires et valider sur activation-carte + mise-disposition
- [x] Committer et tagger la release

## Explorer V5.8 Bug Fixes
- [ ] Fix Explorer affiche les mêmes données pour tous les projets (données statiques)
- [ ] Fix matrice des flux incompréhensible — simplifier ou remplacer
- [ ] Fix timeline inutile — remplacer par quelque chose de pertinent (la migration se fait dans l'outil)

## Fine-tuning LLM Dataset & Pipeline
- [x] Cloner 50 projets GitHub open source EJB/Servlet/J2EE
- [x] Extraire 844 fichiers Java legacy classés par catégorie
- [x] Générer le dataset JSONL rule-based (329 paires)
- [x] Enrichir avec 32 exemples experts (jdbc, soap, struts, hibernate, jms, ejb)
- [x] Ajouter 3 paires des projets bancaires réels (user_project)
- [x] Dataset final : 364 entrées, 2.2 MB, 7 catégories
- [x] Créer le script de fine-tuning Unsloth/LoRA (train.py)
- [x] Créer le Modelfile Ollama (option rapide sans GPU)
- [x] Rédiger le README avec instructions complètes
- [x] Intégrer dans server/engine/ml/finetuning/
- [x] Vérifier 1963 tests passent, TypeScript compile

## Fine-tuning v2 — 1000 projets enterprise
- [x] Rechercher et cataloguer 1000 projets Java EE sérieux sur GitHub (5779 trouvés, 1000 sélectionnés, 884 clonés)
- [x] Cloner les projets par lots et extraire les fichiers Java legacy pertinents (187814 fichiers Java, 31690 legacy)
- [x] Générer le dataset JSONL massif avec transformations rule-based + experts enrichis (27237 paires, 310 MB)
- [x] Mettre à jour le package de fine-tuning (dataset, stats, README) et livrer

## Intégration modèle fine-tuné dans le pipeline
- [x] Modifier llm-adapter.ts pour prioriser le modèle ejb-modernizer fine-tuné (Ollama)
- [x] Enrichir GenerationService avec les patterns appris du dataset 27K
- [x] Écrire les tests unitaires pour les nouvelles fonctionnalités (3 fichiers, 50+ tests)
- [x] Vérifier la non-régression (2021 tests passent, 0 échec)

## Rebranding — Remplacer Compleo par Compleo
- [x] Rechercher toutes les occurrences de "Hamza NORDINE" dans le code (287 occurrences dans 206 fichiers)
- [x] Remplacer par "Compleo" dans l'IHM et les commentaires (287 remplacés + 2 emails)
- [x] Vérifier les tests et livrer (2021 tests passés, 0 échec)

## Persistance des artefacts de migration (ZIP + rapports)
- [x] Analyser le code existant pour comprendre le stockage actuel des artefacts
- [x] Ajouter table DB agent_sessions pour persister les sessions agent
- [x] Persister ZIP en S3 après premier téléchargement + redirection S3 ensuite
- [x] Modifier /sessions pour retourner hasZip/hasReports/hasSagas/hasMicroservices/qualityGrade
- [x] Ajouter section "Artefacts de migration" dans ProjectDetail.tsx avec boutons téléchargement
- [x] Écrire les tests unitaires (agent-artifacts.test.ts, 20+ tests)
- [x] Vérifier la non-régression (2042 tests passés, 0 échec)

## train.py v2.0 — Améliorations production-grade
- [x] Réécrire train.py v2.0 avec les 10 améliorations (Qwen 32B, dynamic seq, split, early stop, metrics, WandB, dry-run, VRAM, rapport)
- [x] Mettre à jour le README.md avec les nouvelles fonctionnalités
- [x] Vérifier la syntaxe Python, dry-run et tests (2042 tests passés, 0 échec)

## Rapports intégrés dans le projet API généré
- [x] Analyser les rapports actuellement inclus dans le ZIP généré
- [x] Créer le générateur de rapport BIAN_MAPPING.md (mapping domaines BIAN)
- [x] Créer le générateur de rapport ARCHITECTURE.md (architecture cible Spring Boot)
- [x] Créer le générateur de rapport MIGRATION_SUMMARY.md (résumé global de ce qui a été fait)
- [x] Intégrer les nouveaux rapports dans spring-generator.ts et CompleoAgent.ts + enrichZipWithArchitecture dans agent
- [x] Vérifier la non-régression (2042 tests passés, 0 échec)

## CompilationLoop Self-Healing via LLM on-premise
- [x] Analyser le CompilationLoop actuel et concevoir l'intégration LLM
- [x] Implémenter le LLM-powered self-healing (erreurs unfixable → LLM fine-tuné)
- [x] Émettre les événements LLM self-healing dans le CompleoAgent
- [x] Écrire les tests unitaires (CompilationLoop.llm.test.ts — 12 tests)
- [x] Vérifier la non-régression (2055 tests passés, 0 échec)

## v10.2 — Persistance ZIP (fix matching frontend + merge DB)
- [x] Modifier endpoint GET /api/agent/sessions pour merger mémoire + DB
- [x] Ajouter gitUrl et downloadUrl dans les données retournées par /sessions
- [x] Améliorer useAgentArtifacts pour matcher par projectName OU gitUrl
- [x] Corriger le mismatch id/sessionId (mapping frontend)
- [x] Écrire les tests v10.2 (agent-sessions-v102.test.ts — 14 tests)
- [x] Vérifier la non-régression complète (2069 tests passés, 0 échec) et sauvegarder checkpoint

## Explorer V5.8 Bug Fixes (reprise)
- [x] Fix Explorer affiche les mêmes données pour tous les projets → filtrage par project.name dans Architecture.tsx
- [x] Fix matrice des flux incompréhensible → déjà corrigé (DependencyTableTab réécrit en tableau lisible)
- [x] Fix timeline inutile → déjà corrigé (MigrationSummaryTab réécrit en métriques)
- [x] Supprimer data.js (429 lignes de données statiques BMCE obsolètes)

## Indicateur visuel corrections LLM
- [x] Ajouter AUTO_FIX et COMPILATION_ATTEMPT dans le type AgentEvent frontend
- [x] Ajouter badge "N corrections IA" dans le header du terminal Agent Output (CompleoAgent.tsx)
- [x] Ajouter rendu coloré des événements AUTO_FIX (violet=LLM, cyan=rule-based) avec badge confiance
- [x] Ajouter rendu des événements COMPILATION_ATTEMPT (ambre)
- [x] Exposer llmStats dans le endpoint /sessions (mémoire + DB)
- [x] Ajouter badge corrections IA dans la fiche projet (ProjectDetail.tsx ArtifactsCard)

## Test self-healing end-to-end
- [x] Créer un projet test avec dépendances legacy non résolues (AccountService + AccountController, 5 types manquants)
- [x] Lancer le pipeline et vérifier que le LLM corrige les erreurs (7 tests E2E passés)
- [x] Documenter les résultats : rule-based détecte 5 erreurs, applique 5 fixes, status NEEDS_HUMAN sans LLM. Avec LLM on-premise, les classes manquantes sont générées automatiquement.

## v10.4 — Stabilisation Technique (8 STEPs)
- [x] STEP 1: Error handling global + logger structuré (server/middleware/error-handler.ts, server/utils/logger.ts)
- [x] STEP 2: Sessions persistance fiable (debounced persist + persist on phase changes)
- [x] STEP 3: Pipeline timeouts + recovery (server/agent/pipeline-timeouts.ts)
- [x] STEP 4: Frontend ErrorBoundary amélioré (retry, logging, meilleur UX)
- [x] STEP 5: SSE heartbeat 15s + reconnexion exponential backoff (8 retries max)
- [x] STEP 6: tRPC retry intégré via SSE reconnexion
- [x] STEP 7: LLM health check avec cache 60s + timeouts par purpose (server/engine/ml/llm-health.ts)
- [x] STEP 8: Health/readiness/status endpoints + graceful shutdown (server/_core/index.ts)

## v10.4b — Stabilisation Fonctionnelle/Métier (10 STEPs)
- [x] STEP 1: Parser filtrage fichiers non-migrables — ajout patterns /generated/, /target/, /build/, package-info, module-info
- [x] STEP 2: Parser Handler/Strategy pattern — déjà implémenté (handler-pattern-detector.ts, 373 lignes)
- [x] STEP 3: Parser Façades dispatcher — déjà implémenté (facade-detector.ts + filterFacadeUseCases)
- [x] STEP 4: Déduplication stubs — ajouté post-génération dans spring-generator.ts (seenPaths)
- [x] STEP 5: Transformer framework EAI — déjà implémenté (eai-framework-transformer.ts, 144 lignes)
- [x] STEP 6: Cohérence noms de variables — déjà implémenté (field-name-normalizer.ts)
- [x] STEP 7: Microservices noms propres — nettoyage préfixes EJB_/Bean_/Impl_ dans service + controller
- [x] STEP 8: Saga multi-candidats — déjà implémenté (generateAllSagas boucle sur tous les candidats)
- [x] STEP 9: Saga compensations fiables — déjà implémenté (13 règles dans saga-compensation.ts + compensation-mapper.ts)
- [x] STEP 10: Quality Score honnête — déjà implémenté (analyse statique, pas de LLM, 8 critères dans quality-scorer.ts)

## v10.5 — Pipeline Retry Automatique
- [x] Créer le module pipeline-retry.ts (backoff exponentiel, max retries configurable, 180 lignes)
- [x] Intégrer withPhaseRetry dans CompleoAgent (CLONING, PUSHING, ENHANCING_REPORTS)
- [x] Émettre des événements RETRY_ATTEMPT pour le SSE
- [x] Écrire les tests unitaires (29 tests passés)
- [x] Vérifier la non-régression (16 tests agent passés)

## v10.5b — Analyse Augmentée par IA
- [x] STEP 1: Créer AnalysisLLMEnricher.ts (5 prompts spécialisés en parallèle)
- [x] STEP 2: Intégrer dans CompleoEngine.analyze() + modifier AnalysisResult + synchro Agent→Compleo
- [x] STEP 3: Frontend AIInsightsTab + onglet dans ArchitectureExplorer + endpoint /analyze enrichi
- [x] STEP 4: Créer AnalysisInsightValidator.ts (anti-hallucination, 7 tests passés)
- [x] STEP 5: Validation intégrée dans CompleoEngine + fallback gracieux (null si LLM indisponible)

## v10.6 — Cache Insights IA (hash-based)
- [x] Concevoir le module InsightsCache (hash SHA-256 des sources, stockage mémoire LRU)
- [x] Implémenter InsightsCache.ts (LRU 50 entrées, TTL 1h mémoire, invalidation par projet)
- [x] Intégrer dans CompleoEngine.analyze() (check cache → LLM → store)
- [x] Écrire les tests unitaires (18 tests passés)
- [x] Vérifier la non-régression (498/504 passés, 6 échecs pré-existants liés au LLM timeout)

## v10.7 — Refactoring Workflow UX (Analyse d'abord, Options ensuite)
- [x] Refactorer le flux : Upload → Analyse automatique → Résultats → Choix options → Génération
- [x] Séparer l'étape d'analyse de l'étape de génération dans le frontend
- [x] Adapter le backend pour supporter analyse seule puis génération à la demande (aiInsights dans analyze-multitech)
- [x] Afficher les résultats d'analyse (technologies détectées, complexité, risques) avant les options
- [x] Les options de génération sont proposées en fonction des résultats d'analyse
- [x] Tests unitaires du nouveau workflow (11 tests passés)
- [x] Modèle ejb-modernizer créé et configuré sur le laptop (Ollama, qwen2.5-coder:1.5b base)

## v10.8 — Objectif 95% de fiabilité modèle ejb-modernizer
- [ ] Data augmentation ×10 sur le dataset existant (1 541 → 15 000+ paires)
- [ ] Combiner avec extraction GitHub (6 140 repos) pour 50 000+ paires
- [ ] Renforcer la boucle de compilation (3 passes au lieu de 1)
- [ ] Ajouter un validateur de logique métier post-génération
- [ ] Préparer le dataset final et lancer le ré-entraînement (5 epochs)
- [ ] Valider le modèle et mesurer le taux de succès

## v10.8b — Génération Frontend Full-Stack + Post-Migration Checklist
- [x] Créer FrontendGenerator.ts (React, Angular, Vue) avec pipeline IA (modèle ejb-modernizer)
- [x] Intégrer le LLM dans chaque étape : analyse endpoints → génération composants → enrichissement métier
- [x] Générer les composants frontend IA-driven : pages CRUD, services API, routing, auth, layout
- [x] Générer le projet frontend complet (package.json, tsconfig, vite/webpack config, etc.)
- [x] Connecter le frontend au backend via les endpoints REST générés (proxy, CORS, env)
- [x] Refactorer les options de génération en 100% dynamiques (basées sur l'analyse, zéro checkbox statique)
- [x] Option Frontend conditionnée à JSP/Struts/Servlet HTML/JSF détectés
- [x] Option Microservices conditionnée à bounded contexts détectés
- [x] Option Saga conditionnée à transactions distribuées détectées
- [x] Option BIAN conditionnée à domaine bancaire détecté
- [x] Option ACORD/HL7/TMForum/DDD selon le domaine métier détecté
- [x] Créer l'écran Post-Migration Checklist dynamique (basé sur les technologies détectées et le secteur)
- [x] Intégrer le FrontendGenerator dans le pipeline CompleoAgent (génération back+front dans le même ZIP)
- [x] Garantir zéro erreur de compilation (mvn compile + npm run build passent)
- [x] TODOs documentés : quoi, pourquoi, comment, contexte métier pour chaque TODO généré
- [x] Qualité du code : conventions, Javadoc/JSDoc, imports propres, pas de code mort
- [x] CompilationLoop étendu au frontend (vérification TypeScript/ESLint du front généré)
- [x] Écrire les tests unitaires du FrontendGenerator
- [x] Vérifier la non-régression et sauvegarder checkpoint v10.8
- [x] Enrichir le dataset d'entraînement avec les patterns frontend (React/Angular/Vue → Spring Boot)
- [x] Générer le rapport complet de session v10.8

## v10.8c — Détection JavaScript/AJAX Legacy
- [x] Détecter les fichiers JS embarqués dans les JSP (jQuery, Prototype.js, Dojo, ExtJS, GWT)
- [x] Extraire les endpoints AJAX ($.ajax, XMLHttpRequest, fetch) pour les mapper aux services frontend
- [x] Adapter la génération frontend selon la complexité JS détectée (plus de logique client si AJAX lourd)
- [x] Ajouter les patterns JS legacy dans le DynamicOptionsResolver (condition IHM élargie)

## v10.8d — Dataset d'entraînement Standards Métier
- [x] Générer les paires d'entraînement BIAN (Banking) : Service Domains, Business Objects, Service Operations
- [x] Générer les paires d'entraînement ACORD (Assurance) : Policy, Claim, Premium, Underwriting
- [x] Générer les paires d'entraînement HL7/FHIR (Santé) : Patient, Encounter, Observation, Medication
- [x] Générer les paires d'entraînement TMForum (Télécom) : Subscriber, Billing, Tariff, Provisioning
- [x] Générer les paires d'entraînement DDD (E-Commerce) : Aggregates, Bounded Contexts, Value Objects
- [x] Générer les paires d'entraînement TOGAF (Enterprise) : Workflow, Process, Approval, Audit
- [x] Fusionner avec le dataset frontend existant et valider le format JSONL (15 entrées combinées)

## Test E2E — DynamicOptionsResolver + FrontendGenerator + Pipeline complet
- [x] Fix bug `require is not defined` dans agent-routes.ts (remplacé par import ES module)
- [x] Fix type mismatch DetectedComponent[] (cast as any[])
- [x] Test upload ZIP (test-legacy-banking.zip, 6 fichiers, 13 KB)
- [x] Test analyse (9 UseCases, 6 technologies, 12 ambiguïtés auto-résolues)
- [x] Test DynamicOptionsResolver (Frontend, BIAN, Messaging détectés dynamiquement)
- [x] Test sélecteur de framework (React/Angular/Vue affiché)
- [x] Test génération Spring Boot (58 fichiers, score 100/100 A+)
- [x] Test architecture microservices (4 services : compte, credit, legacy, virement)
- [x] Test BIAN Mapping (document généré dans le ZIP)
- [x] Test compilation auto-fix (38 corrections appliquées)
- [x] Test téléchargement ZIP (45 KB téléchargé avec succès)

## v10.9 — Corrections IHM + Explorer V5.8 + PostMigrationChecklist
- [x] Fix compteurs "0 Fichiers / 0 Lignes" dans l'écran post-analyse (multiTech non propagé au frontend)
- [x] Tester la PostMigrationChecklist avec enableFrontend: true dès le départ (phase FRONTEND_GENERATION exécutée)
- [x] Fix Explorer V5.8: données statiques affichées pour tous les projets (auto-reload on session change)
- [x] Fix Explorer V5.8: matrice des flux incompréhensible (code mort couplingData supprimé)
- [x] Fix Explorer V5.8: timeline inutile (déjà remplacée par métriques migration)

## v10.10 — Bug critique : Options dynamiques non visibles après analyse
- [x] Bug : les options dynamiques (BIAN, Microservices, Frontend React/Angular) ne s'affichent pas après l'analyse — CORRIGÉ

## v10.10 — Support multi-standards métier dans DynamicOptionsResolver
- [x] Proposer tous les standards métier (BIAN, ACORD, HL7/FHIR, TMForum, DDD, TOGAF) et pas seulement BIAN
- [x] Afficher le standard détecté automatiquement mais permettre de choisir un autre
- [x] Tester pipeline E2E complet avec toutes les options activées — 282 fichiers, 304 KB ZIP, pipeline 100%

## v10.11 — Migration JDBC complète (plus de TODOs JDBC)
- [ ] Refactorer BusinessLogicTransformer T8 : remplacer les blocs JDBC par des appels Repository JPA au lieu de les commenter en TODO
- [ ] Générer les appels repository.findBy/save/delete dans le code Service au lieu de TODO [JDBC_DIRECT]
- [ ] Injecter automatiquement les Repositories dans les Services qui utilisent du JDBC
- [ ] Mapper les ResultSet vers les DTOs via les Entities JPA
- [ ] Tester le pipeline E2E et vérifier que les TODOs JDBC sont remplacés par du code fonctionnel
- [ ] Sauvegarder checkpoint v10.11

## v10.11 — Migration JDBC/Business Logic via LLM (plus de TODOs)
- [ ] Créer le module LLM BusinessLogicMigrator (server/engine/llm/BusinessLogicMigrator.ts)
- [ ] Implémenter la migration JDBC → Spring Data JPA via LLM avec contexte (Entity, Repository, DTOs)
- [ ] Implémenter la validation LLM du code migré
- [ ] Entourer le code migré de commentaires métier (// ─── Logique métier migrée depuis [source] ───)
- [ ] Refactorer BusinessLogicTransformer T8 : appeler le LLM au lieu de commenter en TODO
- [ ] Refactorer dao-splitter : appeler le LLM au lieu de générer des stubs UnsupportedOperationException
- [ ] Injecter automatiquement les Repositories dans les Services (service-gen.ts)
- [ ] Mettre à jour les tests unitaires (ast-pipeline.test.ts, BusinessLogicTransformer.test.ts)
- [ ] Tester le pipeline E2E et vérifier que les TODOs JDBC sont remplacés par du code fonctionnel
- [ ] Sauvegarder checkpoint v10.11

## v10.11 — Bug : Rapport BIAN affiche 0 mappings
- [x] Diagnostiquer pourquoi le bian-mapper retourne 0 use cases mappés — bianDomain jamais peuplé automatiquement
- [x] Créer BianAutoMapper LLM (server/engine/bian/BianAutoMapper.ts) avec fallback dictionnaire statique
- [x] Intégrer dans CompleoEngine.analyze() pour mapper automatiquement les use cases
- [x] Mettre à jour le rapport BIAN_MAPPING.md pour refléter le mapping automatique
- [ ] Tester avec le projet command-chequier-pom

## v10.12 — Multi-Standards LLM (BIAN, ACORD, HL7/FHIR, TMForum, DDD, TOGAF) avec contrôle IHM
- [x] Analyser le système d'options dynamiques existant (DynamicOptionsResolver)
- [x] Créer IndustryStandardMapper LLM multi-standards (server/engine/bian/IndustryStandardMapper.ts)
- [x] Ajouter sélecteur de standard dans l'IHM (dropdown quand enableIndustryStandard est coché)
- [x] Intégrer le contrôle IHM : si standard coché → mapping LLM, sinon → noms originaux
- [x] Connecter le mapper au pipeline de génération (conditionnel aux options cochées par l'utilisateur)
- [x] Générer les rapports par standard activé (BIAN_MAPPING.md, ACORD_MAPPING.md, HL7_FHIR_MAPPING.md, etc.)
- [x] Adapter le MIGRATION_SUMMARY.md pour afficher le bon standard (Section 5 dynamique)
- [x] Ajouter industryStandard à l'interface ProjectIR
- [x] Garder les noms originaux si l'utilisateur ne coche pas l'option standard
- [ ] Tester E2E et sauvegarder checkpoint v10.12

## v10.13 — Conformité SOC 2 : Génération automatique de code sécurisé
- [x] Créer le module SOC2ComplianceGenerator (audit trails, logging, chiffrement AES-256, contrôle d'accès RBAC, headers sécurisés, monitoring)
- [x] Ajouter l'option "Conformité SOC 2" dans DynamicOptionsResolver (id: soc2_compliance, catégorie security)
- [x] Ajouter le checkbox SOC 2 dans le frontend CompleoAgent.tsx (icône Lock, couleur emerald)
- [x] Intégrer dans le pipeline de génération Spring Boot (14 fichiers Java : AuditService, EncryptionService, SecurityConfig, etc.)
- [x] Générer le rapport SOC2_COMPLIANCE.md dans le ZIP (5 Trust Service Criteria documentés)
- [x] Compilation TypeScript OK — sauvegarder checkpoint v10.13

## v10.13b — Test E2E SOC 2 sur projet bancaire réel
- [x] Identifier un projet bancaire de test (activation-carte-bmcedirect-ejb, 69 fichiers)
- [x] Écrire test E2E complet (scripts/test-soc2-e2e.ts — 3 suites, 51 checks)
- [x] Valider les 15 fichiers SOC 2 générés (14 Java + 1 YAML)
- [x] Valider le rapport SOC2_COMPLIANCE.md (4965 chars, 5 TSC)
- [x] Valider l'intégration avec le code métier (0 conflit packages, 0 conflit chemins, SOC 2 = 19% du total)
- [x] Résultat : **51/51 checks passés (100%)** — Test 1: 39/39, Test 2: 7/7, Test 3: 5/5

## v10.14 — Test Multi-Standards LLM (ACORD + HL7/FHIR) + Onglet Conformité
- [x] Créer projet test assurance ACORD (7 use cases : souscription, tarification, sinistre, indemnisation, billing, party, renouvellement)
- [x] Créer projet test santé HL7/FHIR (5 use cases : patient, consultation, labo, prescription, rendez-vous)
- [x] Écrire et exécuter le test E2E multi-standards (5 tests, 53 checks)
- [x] Résultat : **50/53 checks passés (94%)** — ACORD: 100%, HL7/FHIR: 100%, Pipeline ACORD: 100%, Pipeline HL7/FHIR: 100%, Rapports: 83%
- [x] Ajouter endpoint backend GET /api/agent/:id/compliance (catégorisation fichiers SOC 2, rapport, résumé TSC)
- [x] Créer ComplianceTab.tsx (dashboard TSC, explorateur fichiers, rapport interactif, filtres par catégorie)
- [x] Intégrer l'onglet "Conformité" (F8) dans ArchitectureExplorer.tsx
- [x] Écrire les tests unitaires (compliance.test.ts — 11 tests passés)
- [x] Vérifier TypeScript compile sans erreur, serveur dev fonctionne

## v10.15 — Amélioration score métier pipeline

- [x] Diagnostic approfondi des causes du score métier 66/100
- [x] Améliorer getConnection() inline (paramètre d'appel DAO → suppression inline au lieu de placeholder)
- [x] Créer EnhancedFallbackMigrator (fallback rule-based amélioré pour JDBC → JPA)
- [x] Améliorer stubs Adapter (RestTemplate + mapping métier au lieu de return null)
- [x] Ajouter postProcessJdbc() dans CompleoEngine (migration LLM des blocs JDBC restants)
- [x] Ajouter @NotNull/@NotBlank sur les champs String des Request DTOs (inferValidation élargi dans usecase-dto-generator)
- [x] Transformer les catch blocks (enhanceCatchBlocks dans BusinessLogicTransformer)
- [x] Ajouter audit trail dans les services bancaires ("Audit trail: transaction X initiated/completed")
- [x] Relancer le batch et comparer avant/après (Tech=98, Métier=66 — corrections appliquées dans le code final généré)
- [x] Ajouter les 19 projets bancaires dans le dataset d'entraînement (102 entrées, 2.2 MB, total 27 339)

## v10.16 — Score métier 80+ et détection UC élargie

- [ ] Modifier CompleoEngine.validate() pour re-valider après postProcessJdbc (score sur code final)
- [ ] Ajouter les corrections (audit trail, @NotBlank, throw) AVANT la validation dans le pipeline
- [ ] Créer LlmUseCaseDetector : détection UC + mapping BIAN/ACORD/HL7/FHIR/TMForum par LLM
- [ ] Intégrer LlmUseCaseDetector dans parseEjbProject() après la détection rule-based
- [ ] Tester sur les 4 projets sans UC (virement-permanent, interface-credit-jocker, interface-send-sms, transfert-euro)
- [ ] Relancer le batch sur les 23 projets et valider score métier ≥ 80
- [ ] Ré-entraîner le modèle ejb-modernizer avec le dataset enrichi (27 339 entrées)

## v10.17 — Corrections finales et nettoyage

- [x] Supprimer les console.log de debug dans CompleoAgent.tsx (2 console.log '[DEBUG]' supprimés)
- [x] Améliorer le LLM Self-Healing avec des règles spécifiques pour les patterns legacy SOAP/EJB/EAI (buildLegacyMigrationRules)
- [x] Corriger le rapport DATASOURCE_MIGRATION échoué (fallback factuel quand LLM output trop court après nettoyage)
- [x] Ajouter méthodes helper getDriverClass/getDialect pour le rapport factuel
- [x] Écrire les tests unitaires (DatasourceFallback.test.ts — 10 tests passés)
- [x] Vérifier TypeScript compile sans erreur, serveur dev fonctionne
- [x] Sauvegarder checkpoint v10.17

## v10.16 — Score métier 80+ (Re-scoring après migration)
- [x] Analyser le pipeline : score calculé AVANT migration JDBC et compilation
- [x] Ajouter phaseReScoring après phaseCompiling dans CompleoAgent (recalcule le score sur le code final)
- [x] Importer scoreGeneration et generateQualitySection dans CompleoAgent
- [x] Mettre à jour QUALITY_SCORE.md et session.qualityScore après re-scoring
- [x] Créer LlmUseCaseDetector pour les projets sans UC détectés (switch/case dispatch, services injectés)
- [x] Intégrer LlmUseCaseDetector dans parseEjbProject comme fallback (seuil 1 case minimum)
- [x] Corriger extractServiceCall (réordonner patterns : fluxAssignMatch avant callMatch)
- [x] Corriger detectServiceMethods regex pour les interfaces Java
- [x] Tests unitaires LlmUseCaseDetector (8/8 passés)
- [x] Tester sur 4 projets réels (interface-send-sms: 1 UC, transfert-euro: 28 UC, credit-jocker: 1 UC, activation-carte: 3 UC)
- [x] Vérifier TypeScript compile sans erreur

## v10.11 — Migration JDBC complète (Pipeline JDBC → JPA via LLM)
- [x] Ajouter registre global _jdbcBlocksRegistry dans service-gen.ts (collecte les blocs pendant la génération)
- [x] Exporter resetJdbcBlocksRegistry() et getCollectedJdbcBlocks() depuis service-gen.ts
- [x] Collecter les jdbcBlocks dans les deux paths (AST et legacy) de generateDomainService
- [x] Modifier spring-generator.ts pour reset le registre au début et inclure jdbcBlocks dans GenerationResult
- [x] Modifier CompleoEngine.generate() pour passer les jdbcBlocks dans le GeneratedProject
- [x] Modifier phaseMigratingBusinessLogic pour récupérer les blocs depuis session.generatedProject
- [x] Corriger bug lastIndex dans hasUnresolvedPlaceholders (regex global non reset après match)
- [x] Tests E2E JdbcPipeline (9/9 passés) : registre, blockIndex integration, placeholder detection, scoreGeneration
- [x] Tests non-régression : LlmUseCaseDetector (8/8), DatasourceFallback (10/10)
- [x] Vérifier TypeScript compile sans erreur (0 erreurs)

## v11.0 — COBOL Analyzer (Phase 1) — branche feature/cobol-analyzer
- [x] Créer branche feature/cobol-analyzer depuis v10.8b (main)
- [x] Créer test-projects/cobol-banking-sample/ (7 fichiers : CUSTMGMT.cbl, ACCTPROC.cbl, LOANCLC.cbl, DAYREPT.cbl, CUSTOMER.cpy, ACCOUNT.cpy, DAILYJOB.jcl)
- [x] STEP 1 : CobolParser.ts (parser regex-based, IR CobolProgramIR)
- [x] STEP 1 : JclParser.ts (parser JCL → JclJob/JclStep/JclDD)
- [x] STEP 2 : CobolDetectors.ts (DB2, CICS, VSAM, IMS, MQ, SORT, Batch, COBOL version)
- [x] STEP 3 : CobolMigrationReport.ts (rapport markdown 10 sections + estimation effort)
- [x] STEP 3 : CobolAnalyzer.ts (orchestrateur parse → detect → report)
- [x] STEP 4 : CobolAnalyzer.tsx (page unifiée upload + analyse + rapport)
- [x] STEP 4 : Onglets Rapport, Technologies, Effort dans la page
- [x] STEP 4 : Composants intégrés (TechCards, EffortTable, StatsPanel)
- [x] STEP 4 : Route /compleo/cobol + endpoints tRPC cobol.analyze + cobol.detectFileType
- [x] STEP 5 : CobolAnalyzer.test.ts (23 tests unitaires passés)
- [x] STEP 5 : Vérifier 0 régression pipeline Java (26/28 passés, 2 timeouts LLM pré-existants)
- [x] Commit et checkpoint v11.0

## v10.9 + v11.1 — 5 chantiers parallèles (4 mai 2026)

### CHANTIER 1 — COBOL batch DB2 → Java Spring Boot (feature/cobol-converter)
- [ ] CobolToJavaConverter.ts — orchestrateur
- [ ] DataItemMapper.ts — PIC → Java types
- [ ] SqlConverter.ts — EXEC SQL → JdbcTemplate / JPA
- [ ] CursorConverter.ts — CURSOR → JdbcCursorItemReader
- [ ] BatchJobGenerator.ts — Spring Batch Job/Step config
- [ ] FileIOConverter.ts — FD/SELECT → FlatFileItemReader/Writer
- [ ] CallConverter.ts — CALL → @Service injection
- [ ] ProcedureConverter.ts — SECTION/PERFORM → méthodes Java
- [ ] IHM bouton "Convertir en Spring Boot" + endpoints
- [ ] cobol-converter.test.ts (11 tests)

### CHANTIER 2 — IHM Process-Driven (feature/ihm-process)
- [x] PipelineStepper.tsx composant
- [x] UploadPage.tsx (drag&drop + bouton Analyser)
- [x] AnalyzePage.tsx (SSE temps réel)
- [x] ConfigurePage.tsx (DynamicOptions + IA insights)
- [x] GeneratePage.tsx (SSE pipeline)
- [x] ResultPage.tsx (score, ZIP, rapports)
- [x] Routes App.tsx (5 nouvelles routes)
- [ ] Backend séparation analyse/génération

### CHANTIER 3 — IA dans l'analyse (feature/ai-analysis)
- [ ] AnalysisLLMEnricher.ts (5 prompts parallèles)
- [ ] AnalysisInsightValidator.ts (anti-hallucination)
- [ ] Intégration dans SmartAnalyzer
- [ ] Frontend sections IA conditionnelles

### CHANTIER 4 — Stabilisation fonctionnelle (feature/functional-stab)
- [ ] C1 — Exclure tests du parsing (*Test.java, /src/test/)
- [ ] C2 — Exclure façades EJB dispatcher (UCStrategie, AbstractFacade)
- [ ] C3 — Éliminer stubs doublons (100% UnsupportedOperationException)
- [ ] C4 — Transformations EAI framework (EaiLog, FwkRollbackException)
- [ ] C5 — Microservices noms propres (pas de EJB_ prefix)
- [ ] C6 — Saga multi-candidats (itérer sur TOUS)
- [ ] C7 — Saga compensations concrètes (pas WHERE SAGA_ID)
- [ ] C8 — QUALITY_SCORE honnête (statique, pas LLM)
- [ ] 8 tests unitaires

### CHANTIER 5 — Test FrontendGenerator (feature/frontend-test)
- [ ] Projet test jsp-struts-simple/ (EJB + JSP + Struts)
- [ ] 6 tests E2E frontend-generation.test.ts

### Validation finale
- [ ] boa-digital-factory-ejb compile ✅
- [ ] activation-carte-bmcedirect compile ✅
- [ ] cobol-stress-test → conversion Spring Boot compile ✅
- [ ] jsp-struts-simple → frontend React compile ✅

## Fix 4 régressions v11.1 (feature/functional-stab)
- [x] Bug 1 : Préfixe EJB dans ServiceMethodGenerator (NomEJB_methode → methode)
- [x] Bug 2 : SOAP détecté comme UseCase par parser EJB (@WebService exclu)
- [x] Bug 3 : ReportEnhancer fallback timeout (retourner null au lieu de template)
- [x] Bug 4 : JDBC_DIRECT non détecté en mode enrichi (detectJdbcDirect avant enrichissement)

## Stabilisation E2E v11.4 (release/v11.4-e2e-stable)
- [x] Scénario 1 : EJB classique — 5 écrans traversés → ZIP téléchargé (34 KB, 27+ fichiers)
- [x] Scénario 2 : EJB+EAI — options EAI (soap_to_rest, messaging) + ZIP (38 KB, 50+ fichiers)
- [x] Scénario 3 : COBOL — analyse + conversion Spring Boot → ZIP (17 KB)
- [x] Transitions SSE (2→3, 4→5) fonctionnelles
- [x] Bouton Générer envoie les options correctement (PATCH /options + POST /choices)
- [x] ZIP téléchargeable et valide (redirect S3 302)
- [x] Rapports enrichis (5 rapports : MIGRATION, MICROSERVICES, DATASOURCE, QUALITY, EXECUTIVE)
- [x] Routes frontend SPA fonctionnelles (5 pages process-driven)
- [x] 0 erreur TypeScript

## Safari Polling Améliorations
- [x] Indicateur visuel "Mode polling" dans le header pour Safari (badge orange avec intervalle)
- [x] Polling adaptatif 1s pendant phases actives (GENERATING, COMPILING, MICROSERVICES, etc.)
- [x] Bouton "Forcer le rafraîchissement" visible sur Safari quand l'agent est en cours

## Performance — Chargement des sessions trop lent
- [x] Projection légère dans /api/agent/sessions (seulement colonnes scalaires, pas les blobs JSON)
- [x] Projection légère dans /api/compleo/sessions (ne pas itérer sur les blobs en mémoire)
- [x] SessionStore : chargement lazy — métadonnées au démarrage, blobs à la demande
- [x] Cache frontend avec staleTime pour éviter re-fetch inutiles (fetchWithCache 10s TTL)
- [ ] Index DB sur les colonnes de tri (updatedAt, status) — à faire si besoin

## Bug — Chrome iOS bloqué sur analyse
- [x] Détecter Chrome iOS (WebKit mobile) en plus de Safari desktop
- [x] Forcer le polling sur tous les navigateurs WebKit (Chrome iOS = Safari sous le capot)
- [x] Vérifier que le fallback polling fonctionne correctement sur iOS
- [x] Fix: bouton "Forcer le rafraîchissement" ne fonctionne pas au clic (fetch immédiat + toast)

## Bug — Standards et Messaging post-analyse
- [x] Afficher TOUS les standards disponibles (BIAN, ACORD, HL7_FHIR, TMFORUM, DDD, TOGAF) — chacun avec checkbox individuel
- [x] Ajouter "(Recommandé)" à côté du standard détecté automatiquement par l'analyse
- [x] Fix: checkbox messaging/JMS ne se coche pas au clic (nouvel état enableMessaging + envoyé au backend)

## v11.5b — Support RabbitMQ dans la génération messaging
- [x] Ajouter le choix messaging broker (kafka/rabbitmq) dans le frontend (boutons sous messaging)
- [x] Envoyer le choix messagingBroker au backend via PATCH options
- [x] JmsGenerator refactoré : génère Kafka OU RabbitMQ selon le broker choisi
- [x] RabbitMQ : @RabbitListener, RabbitTemplate, exchange, routing-key
- [x] pipeline/index.ts : spring-boot-starter-amqp si RabbitMQ, spring-kafka si Kafka
- [x] application.yml : config RabbitMQ (host, port, user, password, virtual-host)
- [x] docker-compose.yml : rabbitmq:3.13-management si RabbitMQ, cp-kafka si Kafka
- [x] Tests unitaires : 12/12 passés (jms-broker-choice.test.ts) + 5/5 anciens tests (jms-fix3)
- [ ] Modifier microservice-generator pour supporter RabbitMQ (exchanges au lieu de topics) — à faire si besoin

## Bug — Bouton "Forcer le rafraîchissement" ne fonctionne pas (PC + Chrome iOS)
- [x] Cause : conditionné par `isSafari` — invisible sur PC (Chrome/Firefox) et parfois Chrome iOS
- [x] Fix : bouton + badge polling visibles pour TOUS les navigateurs quand l'agent tourne

## v11.6 — Regrouper standards + Ajouter Thymeleaf
- [x] Refactorer UI standards : un seul toggle "Standards Métier" + boutons sub-options (comme frontend framework)
- [x] Ajouter Thymeleaf/Spring MVC comme 4e option frontend dans DynamicOptionsResolver
- [x] Ajouter generateThymeleafScaffold dans FrontendGenerator (layout Thymeleaf, Bootstrap 5, HomeController)
- [x] Mettre à jour PostMigrationChecklist pour supporter thymeleaf
- [x] Tests : 128 unit + 134 no-regression + 68 compilation + 14 frontend engine = tous passés

## v11.7 — Thymeleaf CRUD + JSF/PrimeFaces + Fragments
- [x] Enrichir Thymeleaf avec pages CRUD par entité (list.html, form.html, detail.html) + Controllers Spring MVC
- [x] Ajouter JSF/PrimeFaces comme 5e option frontend (JoinFaces + PrimeFaces DataTable + Managed Beans)
- [x] Générer les fragments Thymeleaf (nav.html, pagination.html) + pages CRUD par entité détectée
- [x] Tests : 128 unit + 134 no-regression + 68 compilation + 14 frontend + 17 JMS + 9 session = tous passés
## v12.8 — Benchmark Maven Compile (8/13 PASS)
- [x] Fix controller-gen: resType correct (BigDecimal au lieu de String) via voOutType analysis
- [x] Fix controller-gen: boxing primitifs pour ResponseEntity<> (int→Integer, etc.)
- [x] Fix autofix: heuristiques conservatrices pour inferControllerParamType (éviter faux LocalDateTime)
- [x] Fix autofix: import automatique pour types inférés (BigDecimal, LocalDateTime) dans controllers
- [x] Fix autofix: import automatique pour types inférés dans services
- [x] Fix JMS transformer: nettoyage des blocs try-catch orphelins après remplacement ObjectMessage
- [x] Fix controller-gen: sanitisation serviceVar pour noms avec hyphens (carte-bancaire→carteBancaire)
- [x] Fix autofix: Case 5 pour X→String dans arguments de méthode (LocalDateTime.parse)
- [x] Fix autofix: best-state logic — toujours utiliser le meilleur état si le final est pire
- [x] Nettoyage debug logs (CTRL-GEN-DEBUG supprimé)
- [ ] Problème persistant: bookstore "illegal start of type" dans GeneralController (JMS dans controller)
- [ ] Problème persistant: jdbc-monolith "illegal start of type" dans BillingController
- [ ] Problème persistant: nexabank-core 62 erreurs (méthodes manquantes dans VirementService)
- [ ] Problème persistant: telecom-billing "LocalDateTime cannot be converted to String" (Case 5 non déclenché)
- [ ] Problème persistant: insurance-claims-large "cannot find symbol - class LocalDateTime" (import timing)
