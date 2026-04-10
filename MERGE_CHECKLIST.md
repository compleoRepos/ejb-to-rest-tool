# Checklist avant merge → main

## Tests existants (obligatoires)

- [ ] `npm run test:regression` → 100% PASS
- [ ] `npm run test:unit` → 100% PASS
- [ ] `npm run test:compile` → BUILD SUCCESS
- [ ] `npx tsc --noEmit` → 0 erreur

## Tests microservices

- [ ] `npm run test:microservices` → 100% PASS
- [ ] Chaque service généré compile : `mvn compile -q` → SUCCESS
- [ ] `docker-compose -f docker/docker-compose.feature.yml up` → tous les services démarrent et répondent `/health`
- [ ] `MICROSERVICES_REPORT.md` généré et lisible

## ML

- [ ] ML désactivé par défaut (`ML_ENABLED` non défini = désactivé)
- [ ] Fallback propre si Ollama indisponible (code rule-based retourné)
- [ ] Aucune dépendance ML dans les chemins de code existants
- [ ] `FEATURE_MS_ML` absent de `.env` (uniquement dans `.env.feature`)

## Démo complète

- [ ] Upload d'un ZIP EJB legacy (ex: `bmce-digital-banking-legacy-final.zip`)
- [ ] Clic "Générer Microservices" → résultat en < 3 min
- [ ] 5-6 services générés avec confidence scores
- [ ] ZIP téléchargeable et fonctionnel

## Non-régression

- [ ] Mode migration simple (existant) fonctionne toujours
- [ ] Scores existants >= baselines (83, 88, 91, 92, 92)
- [ ] `.env` de main inchangé (pas de `FEATURE_MS_ML`)
- [ ] Aucun fichier de main modifié sauf `compleo-routes.ts` (feature flag uniquement)

## Revue de code

- [ ] Principes SOLID respectés (SRP, OCP, DIP)
- [ ] Pas de code mort ou de TODO non documentés
- [ ] Documentation à jour (README, JSDoc, types)
- [ ] Nommage cohérent avec le reste du projet
