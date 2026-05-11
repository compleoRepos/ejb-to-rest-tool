# Tests E2E — EJB Client Modernizer v13.4

## Vue d'ensemble

Suite de tests End-to-End Playwright couvrant les 5 parcours utilisateur principaux,
9 captures visual regression, et 7 assertions de performance.

## Structure

```
tests/e2e/
├── README.md                          ← Ce fichier
├── fixtures/
│   └── test-data.ts                   ← Fixtures et mocks API (4 configurations)
├── parcours/
│   ├── 01-single-project-happy.spec.ts    ← P1: Pipeline complet sans erreur
│   ├── 02-single-project-partial.spec.ts  ← P2: Compilation partielle + TODOs
│   ├── 03-workspace-mode.spec.ts          ← P3: Multi-projets workspace
│   ├── 04-resilience-llm-down.spec.ts     ← P4: LLM indisponible
│   └── 05-resilience-workspace-partial.spec.ts ← P5: Workspace analyse partielle
├── visual/
│   ├── visual-regression.spec.ts      ← 9 captures de référence
│   └── golden/                        ← Screenshots de référence (auto-générés)
└── perf/
    └── performance.spec.ts            ← 7 métriques (FCP, TTI, CLS, heap, bundle)
```

## Prérequis

```bash
# Installer les dépendances
pnpm install

# Installer Chromium pour Playwright
npx playwright install chromium
```

## Exécution

```bash
# Tous les tests E2E
pnpm test:e2e

# Un parcours spécifique
npx playwright test tests/e2e/parcours/01-single-project-happy.spec.ts

# Visual regression uniquement
npx playwright test tests/e2e/visual/

# Performance uniquement
npx playwright test tests/e2e/perf/

# Mode UI (debug interactif)
npx playwright test --ui

# Mettre à jour les screenshots de référence
npx playwright test tests/e2e/visual/ --update-snapshots
```

## Fixtures et Mocks

Les tests utilisent des mocks API via `page.route()` pour isoler le frontend du backend.
4 configurations disponibles :

| Configuration | Fonction | Usage |
|---|---|---|
| `setupMockApi(page)` | LLM OK, pipeline complet | P1, P2, P3, VR, PERF |
| `setupLlmDownMockApi(page)` | LLM indisponible | P4 |
| `setupWorkspacePartialMockApi(page)` | Workspace analyse partielle | P5 |
| Custom overrides | Via `page.route()` dans le test | Cas spécifiques |

## Data-test Attributes

51 `data-test` attributes sont répartis dans l'IHM :

| Composant | Attributs clés |
|---|---|
| StatusBar | `status-bar`, `llm-status`, `app-version`, `active-sessions`, `rules-count`, `memory-usage` |
| DropZone | `drop-zone`, `file-input`, `git-url-input`, `git-clone-btn` |
| Compleo | `upload-title`, `generate-btn`, `download-zip`, `pipeline-stepper`, `result-files-count` |
| CompleoAgent | `agent-start`, `agent-download`, `agent-reset`, `source-zip`, `source-git` |
| WorkspaceAnalysis | `ws-analyze` |
| Workspace | `ws-create-btn` |
| AppLayout | `app-header`, `nav-*`, `tab-*` |
| Projects | `create-project-btn`, `filter-status` |

## Visual Regression

Les screenshots de référence (golden files) sont générés au premier run :

```bash
npx playwright test tests/e2e/visual/ --update-snapshots
```

Threshold : **0.2% de pixels différents** (0.5% pour les pages avec contenu dynamique).

Les golden files sont stockés dans `tests/e2e/visual/visual-regression.spec.ts-snapshots/`.

## Performance Budgets

| Métrique | Budget | Justification |
|---|---|---|
| FCP | < 2s | Core Web Vital |
| TTI | < 3s | Interactivité perçue |
| Navigation | < 1s | SPA client-side routing |
| Upload response | < 2s | UX feedback |
| Bundle JS | < 3MB raw (≈500KB gzip) | Bandwidth |
| CLS | < 0.1 | Core Web Vital |
| Heap growth | < 50% après 15 navigations | Memory leak detection |

## CI/CD

Le workflow `.github/workflows/e2e.yml` exécute les tests en 3 shards parallèles.
Les screenshots de diff sont uploadés comme artifacts en cas d'échec.

## Maintenance

- **Ajouter un test** : Créer un `.spec.ts` dans le dossier approprié
- **Mettre à jour les golden** : `--update-snapshots` après un changement UI intentionnel
- **Ajouter un data-test** : Convention `data-test="component-action"` (kebab-case)
- **Ajouter une fixture** : Étendre `test-data.ts` avec un nouveau mock
