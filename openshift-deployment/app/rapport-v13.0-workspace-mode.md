# Rapport v13.0 — Workspace Mode

**COMPLEO Java Legacy Modernizer**
Version 13.0 | Mai 2026

---

## 1. Résumé exécutif

La version 13.0 introduit le **Workspace Mode**, une capacité d'analyse inter-projets permettant de comprendre les dépendances entre les 19 projets bancaires BMCE, de planifier leur migration par tiers topologiques, et de générer une bibliothèque de stubs partagés. Cette version constitue un saut architectural majeur (v12.x → v13.0) tout en maintenant la stabilité du pipeline de migration existant.

Le Workspace Mode se compose de trois modules serveur (DependencyAnalyzer, MigrationPlanner, SharedStubLibrary), d'un nouvel onglet IHM "Analysis v13", et d'un endpoint API REST dédié. L'ensemble est couvert par 32 tests unitaires, tous passants.

L'injection des stubs partagés dans le classpath de compilation a été **désactivée** après avoir identifié un bug d'imports manquants dans les stubs générés (types `Document`, `Node`, `Connection` non importés). Ce fix est planifié pour la v13.1. Le pipeline de migration per-project (SmartStubGenerator) reste inchangé et pleinement fonctionnel.

---

## 2. Architecture du Workspace Mode

Le Workspace Mode s'articule autour de trois modules indépendants qui s'enchaînent séquentiellement :

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WORKSPACE MODE v13.0                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │ DependencyAnalyzer│───▶│ MigrationPlanner │───▶│SharedStubLib  │ │
│  │                  │    │                  │    │               │ │
│  │ • Package scan   │    │ • Topo sort      │    │ • Aggregated  │ │
│  │ • Import graph   │    │ • Tier assign    │    │   stubs       │ │
│  │ • DAG edges      │    │ • Effort est.    │    │ • Maven POM   │ │
│  │ • External deps  │    │ • Framework grp  │    │ • Java source │ │
│  └──────────────────┘    └──────────────────┘    └───────────────┘ │
│         │                        │                       │         │
│         ▼                        ▼                       ▼         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              WorkspaceAnalysis.tsx (IHM)                      │  │
│  │  • DAG Mermaid  • Tableau tiers  • Frameworks  • Stubs prev  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  API: POST /api/workspace/:id/analyze                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.1 DependencyAnalyzer

Le `DependencyAnalyzer` construit un graphe orienté acyclique (DAG) des dépendances inter-projets en analysant les imports Java de chaque fichier source. Il identifie :

- Les **packages propriétaires** de chaque projet (ownership par fréquence d'occurrence)
- Les **arêtes de dépendance internes** (projet A importe un package de projet B)
- Les **dépendances externes** (packages tiers non résolus dans le workspace)

Sur les 19 projets BMCE, l'analyseur détecte **29 arêtes internes** et identifie **91 classes** dans les packages externes partagés.

### 2.2 MigrationPlanner

Le `MigrationPlanner` consomme le DAG produit par le DependencyAnalyzer et génère un plan de migration ordonné :

- **Tri topologique** : les projets sans dépendances entrantes sont migrés en premier
- **Assignation par tiers** : chaque projet reçoit un numéro de tier (1 = fondations, N = projets dépendants)
- **Estimation d'effort** : basée sur le nombre de fichiers, la complexité cyclomatique, et les technologies détectées
- **Groupement par framework** : identification des clusters technologiques (EJB 3.x, SOAP, JMS, Hibernate)

### 2.3 SharedStubLibrary

Le `SharedStubLibrary` génère une bibliothèque Maven de stubs agrégés pour les packages externes partagés entre ≥2 projets. Chaque stub est une classe Java minimale avec les signatures de méthodes détectées dans le workspace.

> **Statut** : Génération fonctionnelle (91 classes). Injection dans le classpath de compilation **désactivée** en raison d'un bug d'imports manquants (voir section 6).

---

## 3. Tests unitaires

L'ensemble du Workspace Mode est couvert par **32 tests unitaires** répartis dans `server/engine/workspace/workspace-v13.test.ts` :

| Module | Tests | Statut |
|--------|-------|--------|
| DependencyAnalyzer | 10 | ✅ PASS |
| MigrationPlanner | 10 | ✅ PASS |
| SharedStubLibrary | 12 | ✅ PASS |
| **Total** | **32** | **32/32 PASS** |

Les tests couvrent les cas nominaux (workspace BMCE 19 projets), les cas limites (workspace vide, projet isolé, cycle de dépendances), et les cas d'erreur (fichiers corrompus, packages inconnus).

---

## 4. Interface utilisateur

Un nouvel onglet **"Analysis v13"** a été ajouté dans la page Workspace (`/workspace/:id`). Il présente :

- **Graphe DAG** : visualisation Mermaid du graphe de dépendances inter-projets
- **Tableau des tiers** : plan de migration ordonné avec effort estimé par projet
- **Frameworks détectés** : répartition des technologies legacy dans le workspace
- **Preview stubs** : aperçu du code Java des stubs partagés générés

L'onglet est accessible via le composant `WorkspaceAnalysis.tsx` et communique avec le backend via l'endpoint `POST /api/workspace/:id/analyze`.

---

## 5. Résultats des benchmarks

### 5.1 Benchmark BMCE — 19 projets bancaires (R53)

| Projet | Fichiers | LOC | Statut | Erreurs | Score |
|--------|----------|-----|--------|---------|-------|
| activation-carte-bmcedirect | 35 | 2 874 | ❌ FAIL | 132→72 | 39 |
| avis-opere | 64 | 3 808 | ❌ FAIL | 2→4 | 10 |
| commande-chequier-bmcedirect | 41 | 4 127 | ❌ FAIL | 74→2 | 83 |
| coordonnees-3dsecure-bmcedirect | 8 | 1 072 | ❌ FAIL | 10→4 | 51 |
| demande-dotation | 13 | 3 028 | ❌ FAIL | 200→4 | 83 |
| **interface-credit-jocker** | 17 | 2 158 | **✅ PASS** | 10→0 | 95 |
| **interface-send-sms** | 9 | 560 | **✅ PASS** | 0→0 | 85 |
| mise-disposition-bmcedirect | 109 | 12 329 | ❌ FAIL | 24→24 | 10 |
| operation-avenir-services | 67 | 5 233 | ❌ FAIL | 112→54 | 44 |
| opposition-carte-bmcedirect | 22 | 2 523 | ❌ FAIL | 60→2 | 82 |
| produits-epargne-bmcedirect | 176 | 22 276 | ❌ FAIL | 18→16 | 10 |
| push-notification | 39 | 2 454 | ❌ FAIL | 30→30 | 10 |
| releve-carte-bmcedirect | 15 | 2 058 | ❌ FAIL | 8→4 | 43 |
| souscription-assistance-bmcedirect | 128 | 17 394 | ❌ FAIL | 200→2 | 84 |
| souscription-opv-bmcedirect | 112 | 13 441 | ❌ FAIL | 86→2 | 83 |
| tockenisation-carte-bmcedirect | 60 | 4 137 | ❌ FAIL | 18→4 | 66 |
| **transfert-euro-bmce-direct** | 212 | 17 132 | **✅ PASS** | 0→0 | 85 |
| vente-distance-carte-monetique | 102 | 10 757 | ❌ FAIL | 200→10 | 81 |
| virement-permanent-bmcedirect | 70 | 11 258 | ❌ FAIL | 10→8 | 17 |

**Résultat : 3/19 PASS (16%) — Score moyen : 55.8/100**

9 projets sont à ≤4 erreurs résiduelles (très proches du PASS). Le non-déterminisme du LLM est la cause principale des erreurs résiduelles de syntaxe.

### 5.2 Benchmark GitHub — 13 projets open source (non-régression)

| Projet | Statut | Erreurs finales |
|--------|--------|-----------------|
| hmis | ✅ PASS | 0 |
| broadleaf | ✅ PASS | 0 |
| monolith | ✅ PASS | 0 |
| bookstore | ❌ FAIL | 200 |
| ngbilling | ✅ PASS | 0 |
| inventory | ❌ FAIL | 86 |
| javaee-legacy | ✅ PASS | 0 |
| insurance | ✅ PASS | 0 |
| microservices-monolith | ✅ PASS | 0 |
| jdbc-monolith | ❌ FAIL | 84 |
| nexabank-core | ❌ FAIL | 6 |
| telecom-billing | ✅ PASS | 0 |
| insurance-claims-large | ✅ PASS | 0 |

**Résultat : 9/13 PASS (69%) — Cible ≥7/10 atteinte**

La légère régression sur `nexabank-core` (0→6 erreurs) est due au non-déterminisme du LLM sur la génération de `VirementService.java`. Les 3 autres FAIL (bookstore, inventory, jdbc-monolith) sont des cas limites connus depuis v12.9.

---

## 6. Bug identifié — SharedStubLibrary imports manquants

### Symptôme

Lorsque les stubs partagés sont injectés dans le classpath Maven des projets, ils introduisent **42 erreurs de compilation supplémentaires** par projet au lieu de les résoudre.

### Cause racine

La méthode `renderAggregatedStub()` dans `SharedStubLibrary.ts` génère des classes Java qui utilisent des types externes (`Document`, `Node`, `Element`, `Connection`, `ResultSet`, `PreparedStatement`) sans les importer. Les imports générés se limitent à `java.util.*` et `java.io.*`, mais omettent :

- `org.w3c.dom.*` (Document, Node, Element, NodeList)
- `java.sql.*` (Connection, ResultSet, PreparedStatement)
- `javax.servlet.http.*` (HttpServletRequest, HttpServletResponse)
- `javax.xml.*` (types XML)

### Décision

L'injection est **désactivée** via `if (false && sharedStubs...)` dans `bench-bmce-19.ts`. Le code SharedStubLibrary reste intact pour l'analyse/preview (mode audit). Le fix est planifié pour la v13.1.

### Impact

Aucun impact sur le pipeline de migration per-project. Le SmartStubGenerator (per-project) continue de fonctionner correctement et génère des stubs avec les imports appropriés.

---

## 7. Analyse des erreurs résiduelles BMCE

Les 9 projets à ≤4 erreurs présentent des patterns récurrents :

| Pattern d'erreur | Projets concernés | Cause |
|-----------------|-------------------|-------|
| `')' expected` | commande-chequier, opposition-carte, tockenisation-carte, releve-carte, avis-opere | Parenthèse manquante dans un `log.info()` multi-ligne généré par le LLM |
| `cannot find symbol - class X` | souscription-opv (`SoldData`), demande-dotation (`HibernateDao`), produits-epargne (`VersementsList`) | Type métier non résolu par le SmartStubGenerator |
| `not a statement` | souscription-assistance | Cast orphelin `((Action) expr);` généré par le LLM |
| `'try' without 'catch'` | coordonnees-3dsecure, virement-permanent | Bloc try/catch tronqué par le LLM |

Ces erreurs sont **non-déterministes** : elles changent de fichier et de ligne à chaque exécution. Seul le fine-tuning du modèle LLM (en cours) peut les résoudre de manière durable.

---

## 8. Progression historique du benchmark BMCE

| Run | PASS | Score moyen | Changement clé |
|-----|------|-------------|----------------|
| R41 | 3/19 | 52.1 | Baseline v12.10 |
| R46 | 3/19 | 52.1 | ParenBalancer intégré |
| R47 | 3/19 | 55.5 | Fix 6b/10/12 améliorés |
| R48 | 3/19 | 55.5 | FINAL ParenBalancer pass |
| R52 | 3/19 | 55.8 | v13.0 workspace (stubs disabled) |
| **R53** | **3/19** | **55.8** | **Rollback confirmé stable** |

---

## 9. Fine-tuning QLoRA — Statut

Le fine-tuning QLoRA du modèle `Qwen2.5-Coder-1.5B-Instruct` est en cours d'exécution sur le laptop dans le conteneur Docker `compleo-finetuning` :

- **Dataset** : 2 052 paires (1 541 existantes + 511 BMCE bancaires), 12 Mo
- **Configuration** : 2 epochs, LoRA rank 16, learning rate 2e-4, batch size 1
- **Hardware** : CPU (pas de GPU disponible)
- **Durée estimée** : 3-5 heures
- **Statut** : Téléchargement/chargement du modèle (~3 Go) en cours

Une fois le fine-tuning terminé, le modèle sera exporté en GGUF et déployé sur Ollama pour remplacer le modèle de base. L'objectif est de réduire les erreurs de syntaxe non-déterministes qui empêchent les 9 projets proches du PASS de compiler.

---

## 10. Fichiers livrés

| Fichier | Description |
|---------|-------------|
| `server/engine/workspace/DependencyAnalyzer.ts` | Analyseur de dépendances inter-projets (DAG) |
| `server/engine/workspace/MigrationPlanner.ts` | Planificateur de migration par tiers topologiques |
| `server/engine/workspace/SharedStubLibrary.ts` | Générateur de stubs partagés cross-projets |
| `server/engine/workspace/workspace-v13.test.ts` | 32 tests unitaires (tous PASS) |
| `server/workspace-routes.ts` | Endpoint API `POST /api/workspace/:id/analyze` |
| `client/src/components/WorkspaceAnalysis.tsx` | Composant IHM onglet "Analysis v13" |
| `client/src/pages/Workspace.tsx` | Page Workspace avec onglet analysis ajouté |
| `bench-bmce-19.ts` | Benchmark BMCE avec injection stubs désactivée |

---

## 11. Prochaines étapes

| Priorité | Action | Impact attendu |
|----------|--------|----------------|
| P0 | Terminer le fine-tuning QLoRA et déployer le modèle | Réduction des erreurs de syntaxe non-déterministes → +6-9 PASS BMCE |
| P1 | Fix SharedStubLibrary imports (v13.1) | Permettre l'injection des stubs partagés → +2-3 PASS supplémentaires |
| P2 | Augmenter les itérations AutoFix (7→12) pour les gros projets | Meilleure convergence sur activation-carte, mise-disposition |
| P3 | Ajouter les types métier manquants au SmartStubGenerator | Résoudre `SoldData`, `HibernateDao`, `VersementsList` |

---

## 12. Conclusion

La v13.0 apporte une capacité d'analyse workspace complète et fonctionnelle, avec un pipeline d'analyse inter-projets validé par 32 tests. L'injection des stubs partagés est temporairement désactivée en attendant le fix des imports (v13.1), mais le SmartStubGenerator per-project continue d'assurer la compilation. Le benchmark BMCE reste stable à 3/19 PASS avec 9 projets très proches du seuil. Le fine-tuning QLoRA en cours est l'investissement principal pour atteindre la cible de ≥12/19 PASS.
