# Rapport de monitoring hebdomadaire — ERP ESN

**Date** : 2026-04-13 à 07:09:04 UTC  
**Durée d'exécution** : 48.3 secondes  
**Score global** : 🔴 **CRITIQUE**

---

## Résumé

| Métrique | Frontend | API | Total |
|---|---|---|---|
| Routes testées | 62 | 19 | 81 |
| Succès | 62 | 6 | 68 |
| Échecs | 0 | 13 | 13 |
| Taux de succès | 100.0 % | 31.6 % | 84.0 % |
| Latence moyenne | 51 ms | 5 ms | — |
| Latence P95 | 345 ms | 19 ms | — |
| Endpoints lents | 2 | 0 | 2 |

### Seuils appliqués

| Paramètre | Valeur |
|---|---|
| Seuil latence frontend | 500 ms |
| Seuil latence API | 2000 ms |
| Taux de succès minimum | 95 % |
| Délai inter-requêtes API | 2.5 s |

---

## Alertes (15)

| Sévérité | Type | Détail |
|---|---|---|
| AVERTISSEMENT | Frontend | /compleo/agent — 685 ms (seuil 500 ms) |
| AVERTISSEMENT | Frontend | /compleo/workspace — 974 ms (seuil 500 ms) |
| ERREUR | API | [GET] tRPC Projects List — HTTP 500  |
| ERREUR | API | [GET] tRPC System Health — HTTP 400  |
| ERREUR | API | [GET] Learning Rules List — HTTP 500  |
| ERREUR | API | [GET] Learning Stats — HTTP 500  |
| ERREUR | API | [GET] Learning Rules Export — HTTP 500  |
| ERREUR | API | [GET] Auth Me — HTTP 401  |
| ERREUR | API | [GET] tRPC Files List — HTTP 500  |
| ERREUR | API | [GET] tRPC Scans List — HTTP 500  |
| ERREUR | API | [GET] tRPC Comments List — HTTP 500  |
| ERREUR | API | [GET] tRPC Git List — HTTP 500  |
| ERREUR | API | [GET] tRPC Sharing List — HTTP 500  |
| ERREUR | API | [GET] tRPC Project GetById — HTTP 500  |
| ERREUR | API | [GET] tRPC Scan GetById — HTTP 500  |

---

## Détail des routes frontend (62)

| Route | Statut | Latence | Résultat |
|---|---|---|---|
| `/` | ✅ OK | 39 ms | Succès |
| `/projects` | ✅ OK | 12 ms | Succès |
| `/compleo` | ✅ OK | 10 ms | Succès |
| `/compleo/agent` | ✅ OK | 685 ms ⚠️ | Succès |
| `/compleo/rules` | ✅ OK | 127 ms | Succès |
| `/compleo/workspace` | ✅ OK | 974 ms ⚠️ | Succès |
| `/compleo/architecture` | ✅ OK | 424 ms | Succès |
| `/api-docs` | ✅ OK | 345 ms | Succès |
| `/404` | ✅ OK | 32 ms | Succès |
| `/projects/1` | ✅ OK | 14 ms | Succès |
| `/projects/2` | ✅ OK | 10 ms | Succès |
| `/projects/3` | ✅ OK | 10 ms | Succès |
| `/projects/4` | ✅ OK | 9 ms | Succès |
| `/projects/5` | ✅ OK | 9 ms | Succès |
| `/projects/6` | ✅ OK | 9 ms | Succès |
| `/projects/7` | ✅ OK | 8 ms | Succès |
| `/projects/8` | ✅ OK | 15 ms | Succès |
| `/projects/9` | ✅ OK | 12 ms | Succès |
| `/projects/10` | ✅ OK | 11 ms | Succès |
| `/architecture/1` | ✅ OK | 20 ms | Succès |
| `/architecture/2` | ✅ OK | 9 ms | Succès |
| `/architecture/3` | ✅ OK | 9 ms | Succès |
| `/architecture/4` | ✅ OK | 9 ms | Succès |
| `/architecture/5` | ✅ OK | 9 ms | Succès |
| `/architecture/6` | ✅ OK | 8 ms | Succès |
| `/architecture/7` | ✅ OK | 8 ms | Succès |
| `/architecture/8` | ✅ OK | 9 ms | Succès |
| `/architecture/9` | ✅ OK | 13 ms | Succès |
| `/architecture/10` | ✅ OK | 10 ms | Succès |
| `/migration/1` | ✅ OK | 8 ms | Succès |
| `/migration/2` | ✅ OK | 8 ms | Succès |
| `/migration/3` | ✅ OK | 8 ms | Succès |
| `/migration/4` | ✅ OK | 6 ms | Succès |
| `/migration/5` | ✅ OK | 9 ms | Succès |
| `/migration/6` | ✅ OK | 14 ms | Succès |
| `/migration/7` | ✅ OK | 8 ms | Succès |
| `/migration/8` | ✅ OK | 8 ms | Succès |
| `/migration/9` | ✅ OK | 7 ms | Succès |
| `/migration/10` | ✅ OK | 8 ms | Succès |
| `/collaboration/1` | ✅ OK | 8 ms | Succès |
| `/collaboration/2` | ✅ OK | 9 ms | Succès |
| `/collaboration/3` | ✅ OK | 9 ms | Succès |
| `/collaboration/4` | ✅ OK | 14 ms | Succès |
| `/collaboration/5` | ✅ OK | 10 ms | Succès |
| `/collaboration/6` | ✅ OK | 10 ms | Succès |
| `/collaboration/7` | ✅ OK | 9 ms | Succès |
| `/collaboration/8` | ✅ OK | 9 ms | Succès |
| `/collaboration/9` | ✅ OK | 9 ms | Succès |
| `/collaboration/10` | ✅ OK | 8 ms | Succès |
| `/?tab=overview` | ✅ OK | 13 ms | Succès |
| `/projects?sort=name` | ✅ OK | 10 ms | Succès |
| `/projects?sort=date` | ✅ OK | 10 ms | Succès |
| `/compleo?view=grid` | ✅ OK | 8 ms | Succès |
| `/compleo?view=list` | ✅ OK | 12 ms | Succès |
| `/compleo/agent?mode=auto` | ✅ OK | 12 ms | Succès |
| `/compleo/rules?filter=active` | ✅ OK | 12 ms | Succès |
| `/compleo/rules?filter=all` | ✅ OK | 13 ms | Succès |
| `/compleo/workspace?layout=split` | ✅ OK | 9 ms | Succès |
| `/api-docs?section=auth` | ✅ OK | 8 ms | Succès |
| `/api-docs?section=projects` | ✅ OK | 9 ms | Succès |
| `/api-docs?section=compleo` | ✅ OK | 8 ms | Succès |
| `/api-docs?section=agent` | ✅ OK | 8 ms | Succès |

---

## Détail des endpoints API (19)

| Endpoint | Méthode | Statut | Latence | Résultat |
|---|---|---|---|---|
| Health Check | GET | ✅ OK | 2 ms | Succès |
| tRPC Projects List | GET | ❌ 500 | 19 ms | Échec |
| tRPC System Health | GET | ❌ 400 | 11 ms | Échec |
| Learning Rules List | GET | ❌ 500 | 3 ms | Échec |
| Learning Stats | GET | ❌ 500 | 3 ms | Échec |
| Learning Rules Export | GET | ❌ 500 | 2 ms | Échec |
| Intelligence Stats | GET | ✅ OK | 3 ms | Succès |
| Workspace List | GET | ✅ OK | 2 ms | Succès |
| Agent Sessions | GET | ✅ OK | 2 ms | Succès |
| Compleo Sessions | GET | ✅ OK | 3 ms | Succès |
| Auth Me | GET | ❌ 401 | 2 ms | Échec |
| tRPC Files List | GET | ❌ 500 | 5 ms | Échec |
| tRPC Scans List | GET | ❌ 500 | 4 ms | Échec |
| tRPC Comments List | GET | ❌ 500 | 4 ms | Échec |
| tRPC Git List | GET | ❌ 500 | 4 ms | Échec |
| tRPC Sharing List | GET | ❌ 500 | 4 ms | Échec |
| tRPC Project GetById | GET | ❌ 500 | 4 ms | Échec |
| tRPC Scan GetById | GET | ❌ 500 | 5 ms | Échec |
| tRPC Auth Me | GET | ✅ OK | 4 ms | Succès |

---

## Actions correctives recommandées

### Erreurs critiques (13)

- **[GET] tRPC Projects List — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] tRPC System Health — HTTP 400 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] Learning Rules List — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] Learning Stats — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] Learning Rules Export — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] Auth Me — HTTP 401 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] tRPC Files List — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] tRPC Scans List — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] tRPC Comments List — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] tRPC Git List — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] tRPC Sharing List — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] tRPC Project GetById — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.
- **[GET] tRPC Scan GetById — HTTP 500 ** : Vérifier que le endpoint est correctement implémenté et que la base de données est accessible.

### Avertissements de performance (2)

- **/compleo/agent — 685 ms (seuil 500 ms)** : Optimiser les requêtes ou ajouter du cache.
- **/compleo/workspace — 974 ms (seuil 500 ms)** : Optimiser les requêtes ou ajouter du cache.


---

*Rapport généré automatiquement par `monitoring/health-check.js`*  
*Prochaine exécution prévue : semaine du 2026-04-20*
