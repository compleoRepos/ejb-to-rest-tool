# Tests Compleo — Guide

## Structure

```
tests/
├── fixtures/           # Données de test (16 projets Java EE)
│   ├── index.ts        # Export ALL_FIXTURES
│   ├── baselines.json  # Scores minimum par projet
│   └── snapshots/      # Snapshots de référence (générés)
├── helpers/            # 5 helpers de test
│   └── index.ts        # parseFixture, compileCheck, scoreHelper, etc.
├── regression/         # 6 tests de régression
│   ├── 01-compilation.test.ts    # Syntaxe Java valide
│   ├── 02-snapshot.test.ts       # Stabilité des snapshots
│   ├── 03-score.test.ts          # Score >= baseline
│   ├── 04-no-regression.test.ts  # 10 bugs historiques
│   ├── 05-java-types.test.ts     # Couverture types Java
│   └── 06-cross-project.test.ts  # Invariants cross-projet
└── unit/               # 11 tests unitaires
    ├── parser/
    │   ├── 01-usecase-detection.test.ts
    │   ├── 02-datasource-detection.test.ts
    │   ├── 03-multitech-detection.test.ts
    │   └── 04-pipeline-integration.test.ts
    ├── generator/
    │   ├── 01-service-signature.test.ts
    │   ├── 02-url-generation.test.ts
    │   ├── 03-pom-generation.test.ts
    │   ├── 05-controller-generation.test.ts
    │   └── 07-config-generation.test.ts
    └── naming/
        ├── 01-class-naming.test.ts
        └── 02-domain-naming.test.ts
```

## Commandes

| Commande | Description | Durée |
|----------|-------------|-------|
| `pnpm test` | Tous les tests | ~5s |
| `pnpm test:unit` | Tests unitaires uniquement | ~3s |
| `pnpm test:regression` | Tests de régression uniquement | ~4s |
| `pnpm test:compile` | Compilation Java uniquement | ~2s |
| `pnpm test:no-regression` | Bugs historiques uniquement | ~2s |
| `pnpm test:score` | Score qualité uniquement | ~3s |
| `pnpm test:types` | Couverture types Java | ~2s |
| `pnpm test:watch` | Mode watch (développement) | continu |
| `pnpm test:init-fixtures` | Initialiser les fixtures | ~5s |
| `pnpm test:dashboard` | Générer DASHBOARD.md | ~1s |

## Ajouter un nouveau test

### Test unitaire

1. Créer un fichier dans `tests/unit/{parser|generator|naming}/XX-description.test.ts`
2. Importer les modules depuis les chemins relatifs (`../../../server/...`)
3. Utiliser `describe` et `it` de vitest
4. Lancer `pnpm test:unit` pour vérifier

### Test de régression pour un nouveau bug

1. Ouvrir `tests/regression/04-no-regression.test.ts`
2. Ajouter un `it("BUG-VXX-NNN : description", ...)` dans le `describe` approprié
3. Le test doit vérifier que le bug est corrigé (pas qu'il existe)
4. Convention de nommage : `BUG-V{version}-{numéro}`

### Nouvelle fixture

1. Ajouter les fichiers source dans `tests/fixtures/index.ts`
2. Suivre le pattern existant : `{ name, category, files, expected }`
3. Lancer `pnpm test:init-fixtures` pour régénérer les snapshots

## Bugs historiques

| ID | Description |
|----|-------------|
| BUG-V7A-001 | 0 UseCases sur vrais projets |
| BUG-V7B-001 | Slash dans nom de méthode Java |
| BUG-V7B-002 | Double slash dans @XxxMapping |
| BUG-V7C-001 | Void.builder() invalide |
| BUG-V7C-002 | Variable request non déclarée |
| BUG-V7C-003 | @GetMapping dupliqués |
| BUG-V7C-004 | SQL constants dans méthodes |
| BUG-V7C-005 | ReportingEJB → GeneralController |
| BUG-GEN-001 | public Object retour non typé |
| BUG-GEN-002 | EJB lifecycle dans Spring |

## CI/CD

Le workflow GitHub Actions (`.github/workflows/regression.yml`) est déclenché sur :
- Push sur `main`, `develop`, `feature/**`
- Pull Request vers `main`, `develop`

Jobs bloquants (la PR est bloquée si un de ces jobs échoue) :
- **unit-tests** : Tests unitaires
- **no-regression** : Bugs historiques
- **java-compilation** : Compilation du code Java généré

Jobs non-bloquants (indicatifs) :
- **quality-score** : Score qualité >= baselines
- **java-types** : Couverture des types Java
- **snapshot-stability** : Stabilité des snapshots
- **cross-project** : Invariants cross-projet
