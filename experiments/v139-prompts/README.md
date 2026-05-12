# Expérimentation v13.9 — Re-prompt LLM forcé

## Objectif

Tester si un prompt LLM ciblé peut transformer les méthodes stub (`throw new CompleoUnvalidatedMethodException`) en blocs `MIGRATED LOGIC` commentés contenant une traduction best-effort du code legacy.

## Échantillon

10 méthodes extraites des projets BMCE (interface-credit-jocker + avis-opere) :

| ID | Méthode | Projet | Catégorie | Complexité |
|----|---------|--------|-----------|------------|
| icj-01 | getLigneDeclicGAB | interface-credit-jocker | A (logique réelle) | Haute |
| icj-02 | simulationTirageGAB | interface-credit-jocker | A (logique réelle) | Haute |
| icj-03 | BlocageJoker | interface-credit-jocker | B (pass-through) | Moyenne |
| icj-04 | traitementDECLICGAB | interface-credit-jocker | A (logique réelle) | Haute |
| icj-05 | selectTirageDECLIC | interface-credit-jocker | C (quasi-vide) | Basse |
| icj-06 | Traitement | interface-credit-jocker | A (logique réelle) | Très haute |
| avo-01 | getReqTypeAvis | avis-opere | A (logique réelle) | Moyenne |
| avo-02 | appelDocubase | avis-opere | A (logique réelle) | Haute |
| avo-03 | getReqCat | avis-opere | A (logique réelle) | Moyenne |
| avo-04 | SearchTypes | avis-opere | B (repository) | Basse |
| avo-05 | SearchTypes(nature) | avis-opere | B (repository) | Moyenne |
| avo-06 | getListTypes | avis-opere | C (quasi-vide) | Basse |
| avo-07 | process | avis-opere | C (quasi-vide) | Basse |

**Distribution** : 6 type A (logique réelle), 4 type B (pass-through/repository), 3 type C (quasi-vide)

## Variants testés

- **A** : Minimal (baseline)
- **B** : Avec source legacy complète
- **C** : Avec contexte SOAP explicite
- **D** : Best-effort explicite avec rationale
- **E** : Avec domain keywords (sectoriel)

## Critères de succès

Un variant est VIABLE si simultanément :
- `n_produced_non_stub / n_methods ≥ 0.5`
- `n_syntactically_valid / n_methods ≥ 0.9`
- `n_meaningful_logic / n_methods ≥ 0.3`
- `avg_quality ≥ 0.4`

## Date

12 mai 2026
