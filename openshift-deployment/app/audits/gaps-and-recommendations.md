# Gaps & Recommendations — COMPLEO v13.7

> Audit lecture seule — aucune modification du code source.
> Date : 12 mai 2026

## Gaps identifiés

### Gap 1 : Dictionnaires de fallback sous-dimensionnés (HL7, TMForum, DDD, TOGAF)

**Constat** : Le dictionnaire statique BianAutoMapper (42 domaines, 389 keywords) est 10x plus riche que les dictionnaires des autres standards (7-17 domaines, 13-75 keywords). Quand le LLM est indisponible, le mapping pour les verticales non-BIAN sera imprécis.

**Impact** : En démo sans connexion LLM (réseau client restreint, quota dépassé), seul BIAN produit un mapping crédible.

**Recommandation** : Créer des `XxxAutoMapper.ts` dédiés pour ACORD, HL7_FHIR, et TMFORUM avec au minimum 20 domaines et 100 keywords chacun. Priorité : ACORD (assurance = marché CGI).

### Gap 2 : Finetuning dataset minimal pour les standards non-BIAN

**Constat** : Le dataset `finetuning-standards-dataset.jsonl` contient seulement 8 exemples (2 BIAN, 2 ACORD, 1 par autre standard). Le dataset `finetuning-banking-projects.jsonl` contient 102 exemples mais uniquement pour le bancaire.

**Impact** : Le LLM n'a pas assez d'exemples pour apprendre les patterns spécifiques à chaque standard. La qualité du mapping dépend entièrement du prompt zero-shot.

**Recommandation** : Générer au minimum 10 exemples par standard dans le dataset de finetuning. Utiliser les projets open-source de chaque secteur comme source.

### Gap 3 : Pas de checklist post-migration pour 4 standards sur 6

**Constat** : Seuls BIAN et ACORD ont des items de checklist post-migration dans `PostMigrationChecklist.ts`. HL7_FHIR, TMFORUM, DDD, et TOGAF n'en ont pas.

**Impact** : Le rapport de migration pour ces standards ne contient pas de recommandations de validation spécifiques au secteur.

**Recommandation** : Ajouter des items de checklist pour chaque standard manquant. Exemples : "Valider la conformité FHIR R4 des ressources générées", "Vérifier l'alignement des APIs avec les Open APIs TMForum".

### Gap 4 : Mapping standard non activé dans le benchmark automatique

**Constat** : Le benchmark `bench-bmce-19.ts` ne passe pas `enableIndustryStandard: true` dans les options de migration. Le mapping standard n'est donc jamais testé automatiquement.

**Impact** : Impossible de mesurer la précision réelle du mapping sur les 19 projets BMCE. Le score de mapping est toujours "non mesuré".

**Recommandation** : Ajouter une option `--with-standard` au benchmark pour activer le mapping BIAN sur les projets BMCE et mesurer la précision.

### Gap 5 : Pas de tests unitaires pour les standards sectoriels

**Constat** : Aucun fichier `*.test.ts` ne couvre les classes `IndustryStandardMapper`, `BianAutoMapper`, ou `DynamicOptionsResolver.detectDomain()`.

**Impact** : Les régressions sur la détection sectorielle ou le mapping ne sont pas détectées automatiquement.

**Recommandation** : Créer `IndustryStandardMapper.test.ts` avec des tests pour chaque standard (dictionnaire, prompt, fallback).

### Gap 6 : TOGAF comme "catch-all" biaise la détection

**Constat** : TOGAF a 66 keywords de détection (2x plus que tout autre standard) incluant des termes très génériques ("auth", "login", "user", "role", "workflow", "process", "billing", "invoice"). Tout projet d'entreprise avec des patterns communs sera classé TOGAF par défaut.

**Impact** : Un projet bancaire avec peu de keywords BIAN mais beaucoup de patterns génériques (auth, workflow, billing) pourrait être classé TOGAF au lieu de BIAN.

**Recommandation** : Réduire les keywords TOGAF aux termes spécifiquement TOGAF (ADM, architecture capability, building block, etc.) et augmenter le seuil de détection pour TOGAF.

## Synthèse des priorités

| Priorité | Gap | Effort estimé | Impact démo |
|:--------:|-----|:-------------:|:-----------:|
| P0 | Gap 1 — Dictionnaire ACORD | 2h | Haut (marché CGI) |
| P1 | Gap 4 — Benchmark avec standard | 1h | Haut (mesure précision) |
| P1 | Gap 3 — Checklist HL7/TMF | 2h | Moyen (complétude rapport) |
| P2 | Gap 2 — Finetuning dataset | 4h | Moyen (qualité LLM) |
| P2 | Gap 5 — Tests unitaires | 3h | Moyen (CI/CD) |
| P3 | Gap 6 — TOGAF catch-all | 1h | Faible (edge case) |
