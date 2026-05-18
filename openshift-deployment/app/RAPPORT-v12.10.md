# COMPLEO v12.10 — Rapport de version

**Auteur :** Hamza NORDINE
**Date :** 10 mai 2026
**Baseline :** v12.9 (9/13 PASS)
**Résultat :** 10/13 PASS (+1 par rapport à v12.9)

---

## 1. Résumé exécutif

La version 12.10 de COMPLEO apporte six correctifs majeurs au pipeline de modernisation Java, un nouveau transformer EntityManager → Spring Data Repository, et une première campagne de validation sur des projets open-source à grande échelle (jusqu'à 527K LOC). Le score du benchmark Maven Compile passe de **9/13 à 10/13 PASS**, avec trois projets encore en échec sur des cas limites identifiés et documentés. Les trois projets open-source (Apache Roller, jPOS, Apache Fineract) ont été analysés et générés avec succès, sans crash, en moins de 33 secondes chacun et avec un pic mémoire inférieur à 135 MB.

---

## 2. Modifications apportées

### 2.1 Fix 1 — Suppression du javadoc des méthodes controllers

Le javadoc de classe est conservé, mais le javadoc des méthodes individuelles dans les controllers générés a été entièrement supprimé. Cette modification résout les erreurs de compilation `illegal start of type` provoquées par des commentaires javadoc mal formés dans les controllers de **bookstore** et **jdbc-monolith**.

**Fichier modifié :** `server/spring/controller-gen.ts` (suppression du bloc javadoc méthode, ligne 276).

### 2.2 Fix 2 — `@DateTimeFormat` pour les paramètres temporels

Les paramètres de type temporel (`LocalDateTime`, `LocalDate`, `ZonedDateTime`, `Instant`) dans les controllers générés reçoivent désormais automatiquement l'annotation `@DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)` à côté du `@RequestParam`. De plus, la branche `hasIdParam` sans `reqType` inclut maintenant les `legacyParams` dans la signature de la méthode, ce qui corrige le cas **telecom-billing** où les paramètres additionnels étaient ignorés.

**Fichiers modifiés :** `server/spring/controller-gen.ts` (détection temporelle + injection annotation + inclusion legacyParams).

### 2.3 Fix 3 — Transformer EntityManager → Spring Data Repository (T11)

Un nouveau transformer complet a été implémenté dans `BusinessLogicTransformer.ts` pour convertir les patterns JPA EntityManager en appels Spring Data Repository :

| Pattern legacy | Pattern Spring |
|---|---|
| `em.find(Entity.class, id)` | `repository.findById(id).orElse(null)` |
| `em.persist(entity)` | `repository.save(entity)` |
| `em.merge(entity)` | `repository.save(entity)` |
| `em.remove(entity)` | `repository.delete(entity)` |
| `em.createQuery(jpql).getResultList()` | Méthode `@Query` dans le repository |
| `em.createQuery(jpql).getSingleResult()` | Méthode dans le repository |
| `em.createNamedQuery(name)` | Méthode `@Query` dans le repository |
| `em.flush()` / `em.clear()` | Suppression (Spring gère) |
| Autres appels `em.xxx(...)` | `throw new UnsupportedOperationException("TODO: migrate")` |

Le transformer inclut également :

- **Détection automatique de l'entité** à partir des patterns `em.find`, `em.persist` et des déclarations de type dans le code source.
- **Génération du champ `@Autowired` repository** dans les services qui utilisent EntityManager.
- **Génération automatique des interfaces Repository** (`XxxRepository extends JpaRepository<Xxx, Long>`) avec les méthodes `@Query` extraites du JPQL.
- **Génération de stubs entity** si l'entité n'existe pas dans les fichiers générés.
- **Gestion des parenthèses imbriquées** dans les chaînes JPQL contenant `setParameter(...)`.

**Fichiers modifiés :** `server/engine/BusinessLogicTransformer.ts`, `server/spring/service-gen.ts`, `server/spring-generator.ts`.

### 2.4 Fix 4 — Types génériques dans les return types

Le traitement des types génériques comme `Map<String, CustomerOrder>` dans les return types des controllers a été corrigé. Le regex de nettoyage ne supprime plus les espaces à l'intérieur des chevrons, évitant ainsi la génération de `ResponseEntity<MapString,>` au lieu de `ResponseEntity<Map<String, CustomerOrder>>`.

**Fichier modifié :** `server/spring/controller-gen.ts`.

### 2.5 Fix 5 — Robustesse du regex dans LlmUseCaseDetector

Le `LlmUseCaseDetector` utilisait un `firstArg` non échappé dans un `new RegExp(...)`, ce qui provoquait un crash `Invalid regular expression: Unterminated group` lorsque l'argument contenait des parenthèses (ex. `new String(block2)`). Le fix valide que `firstArg` est un identifiant simple (`/^\w+$/`) avant de l'injecter dans le regex.

**Fichier modifié :** `server/engine/llm/LlmUseCaseDetector.ts`.

### 2.6 Fix 6 — Améliorations de l'auto-fixer

Plusieurs améliorations ont été apportées au `CompileAutoFixer` :

- **Détection JMS étendue** : ajout de `org.springframework.jms` en plus de `javax.jms` et `jakarta.jms` pour la détection des dépendances JMS.
- **Stub Manager enrichi** : les stubs de type `*Manager` incluent désormais des méthodes génériques (`fire`, `register`, `unregister`, `getListeners`).
- **Préservation des noms de champs** : les services injectés conservent leur nom de champ original au lieu d'être renommés automatiquement.
- **Vérification des variables locales** : avant d'ajouter un paramètre manquant à une méthode de service, le fixer vérifie que la variable n'est pas déjà déclarée localement dans le corps de la méthode.
- **Cast column-based amélioré** : le cast `(Type)` pour les erreurs `Object cannot be converted to X` utilise un scan arrière pour trouver le début de l'expression et un compteur de profondeur de parenthèses pour éviter de casser la syntaxe.
- **Post-loop fix** : une passe finale après la boucle d'autofix traite les erreurs `Object → X` persistantes avec un remplacement global.

**Fichier modifié :** `server/engine/validation/CompileAutoFixer.ts`.

---

## 3. Résultats du benchmark Maven Compile

### 3.1 Score global

| Version | Score | Progression |
|---------|-------|-------------|
| v12.9 (baseline) | 9/13 PASS | — |
| **v12.10** | **10/13 PASS** | **+1** |

### 3.2 Résultats détaillés par projet

| Projet | Fichiers | LOC | Statut | Erreurs | Compile | Total |
|--------|----------|-----|--------|---------|---------|-------|
| hmis | 50 | 18 103 | **PASS** | 0 | 8.1s | 44.7s |
| broadleaf | 50 | 4 463 | **PASS** | 0 | 3.3s | 17.0s |
| monolith | 102 | 5 119 | **PASS** | 0 | 5.8s | 24.9s |
| bookstore | 47 | 4 015 | FAIL | 4 | 4.2s | 39.2s |
| ngbilling | 59 | 6 770 | **PASS** | 0 | 3.1s | 12.2s |
| inventory | 27 | 3 402 | **PASS** | 0 | 4.1s | 17.6s |
| javaee-legacy | 7 | 255 | **PASS** | 0 | 3.1s | 9.8s |
| insurance | 9 | 742 | **PASS** | 0 | 3.1s | 16.8s |
| microservices-monolith | 51 | 2 213 | **PASS** | 0 | 4.3s | 29.3s |
| jdbc-monolith | 15 | 1 383 | FAIL | 2 | 4.0s | 40.8s |
| nexabank-core | 35 | 754 | FAIL | 6 | 2.6s | 26.4s |
| telecom-billing | 35 | 1 587 | **PASS** | 0 | 4.6s | 21.5s |
| insurance-claims-large | 35 | 1 603 | **PASS** | 0 | 4.5s | 22.6s |

### 3.3 Analyse des 3 projets FAIL restants

**bookstore (4 erreurs)** — La classe `EventManager` générée comme stub n'est pas retrouvée dans l'état final de la compilation. Le problème est lié au tracking du "best state" dans l'auto-fixer : les stubs générés aux itérations tardives ne sont pas correctement fusionnés dans l'état optimal. Ce problème est purement mécanique et ne concerne pas la qualité du code généré.

**jdbc-monolith (2 erreurs)** — L'erreur `Object cannot be converted to BigDecimal` persiste sur deux lignes du `BillingService`. Le cast column-based est appliqué mais ne résout pas l'erreur car la colonne pointée par le compilateur se trouve au milieu d'une expression chaînée (`map.getOrDefault(key, BigDecimal.ZERO).add(amount)`). Le fix post-loop n'est pas déclenché car un cast partiel existe déjà dans la ligne.

**nexabank-core (6 erreurs)** — L'erreur `';' expected` à la ligne 73 du `VirementService` est causée par l'auto-fixer qui ajoute un paramètre `Object order` à une méthode de service alors que `order` est déjà déclaré comme variable locale (`TransferOrder order = new TransferOrder()`). Le fix de vérification des variables locales a été implémenté mais n'est pas encore pleinement efficace sur ce cas spécifique.

---

## 4. Scale-Up — Projets open-source

### 4.1 Résultats

| Projet | URL | Commit | LOC | Fichiers | Générés | Erreurs | Analyse | Génération | Compile | Total | Mémoire |
|--------|-----|--------|-----|----------|---------|---------|---------|------------|---------|-------|---------|
| Apache Roller | github.com/apache/roller | `db3915a` | 86 713 | 550 | 52 | 28 | 13.4s | 1.0s | 2.9s | 17.3s | 55 MB |
| jPOS | github.com/jpos/jPOS | `f581f39` | 111 236 | 757 | 128 | 200 | 7.7s | 4.4s | 5.1s | 17.2s | 134 MB |
| Apache Fineract | github.com/apache/fineract | `800f6b0` | 527 547 | 5 087 | 817 | 92 | 20.1s | 3.6s | 8.9s | 32.6s | 76 MB |

### 4.2 Observations

Les trois projets ont été traités **sans crash** et dans des temps raisonnables. Le projet le plus volumineux, Apache Fineract (527K LOC, 5 087 fichiers), est analysé et généré en **32.6 secondes** avec un pic mémoire de seulement **76 MB** (heap). Le ratio erreurs/fichiers générés est le meilleur pour Fineract (92 erreurs / 817 fichiers = 11.3%), ce qui suggère que le pipeline se comporte mieux sur les projets bien structurés.

Le cas jPOS est le plus problématique (200 erreurs / 128 fichiers) en raison de son architecture atypique : jPOS utilise massivement des patterns non-standard (transactions ISO 8583, channels, multiplexeurs) qui ne correspondent à aucun pattern EJB/Servlet classique. Le nombre élevé d'erreurs reflète la difficulté de mapper ces abstractions vers Spring Boot.

Apache Roller présente un ratio intermédiaire (28 erreurs / 52 fichiers) avec des erreurs principalement liées aux dépendances JSF et aux stubs manquants pour les classes spécifiques au framework Roller.

---

## 5. Profiling CPU + Mémoire — Apache Fineract

### 5.1 Répartition du temps CPU

| Étape | Durée | % du total | Heap | RSS |
|-------|-------|------------|------|-----|
| File I/O (lecture 5 087 fichiers) | 0.18s | 0.6% | 55 MB | 178 MB |
| Analyse (parse + classify + AI) | 17.83s | 55.7% | 60 MB | 155 MB |
| Génération de code (Spring Boot) | 3.78s | 11.8% | 68 MB | 188 MB |
| Compilation Maven + Auto-fix | 10.21s | 31.9% | 76 MB | 176 MB |
| **TOTAL** | **32.00s** | **100%** | **76 MB** | **188 MB** |

### 5.2 Top 5 Hot Paths

| Rang | Hot Path | % CPU | Détail |
|------|----------|-------|--------|
| **1** | **Enrichissement IA (appel LLM)** | **49.5%** | L'appel API LLM domine la phase d'analyse. La latence réseau et le temps de réponse du modèle représentent la quasi-totalité de cette étape. |
| **2** | **Compilation Maven (mvn compile)** | **31.9%** | Processus JVM externe, principalement I/O bound. Inclut 3 itérations d'auto-fix avec recompilation. |
| **3** | **Génération de code (template rendering)** | **11.8%** | Rendu de 817 fichiers Spring Boot à partir de l'IR. Principalement CPU-bound (string concatenation). |
| **4** | **Parsing Java (regex-based)** | **6.3%** | Application de patterns regex sur 5 087 fichiers. Linéaire en nombre de fichiers. |
| **5** | **File I/O (lecture fichiers source)** | **0.6%** | Lecture de 527K LOC depuis le disque. Négligeable grâce au cache filesystem. |

### 5.3 Profil mémoire

Le pic de mémoire heap est atteint lors de la phase de compilation Maven + auto-fix (**76 MB**), ce qui reste très modéré pour un projet de 527K LOC. Le pic RSS (**188 MB**) est atteint lors de la génération de code, principalement en raison des buffers de strings pour les 817 fichiers générés. La mémoire est bien maîtrisée : aucune fuite détectée, et le garbage collector Node.js gère efficacement les allocations temporaires.

### 5.4 Recommandations d'optimisation

L'enrichissement IA (49.5% du temps total) est le goulot d'étranglement principal. Trois pistes d'optimisation sont envisageables :

1. **Cache LLM persistant** : le cache existe déjà mais est session-scoped. Un cache persistant sur disque réduirait le temps d'analyse à ~3s pour les projets déjà traités.
2. **Parallélisation de la compilation Maven** : les 3 itérations d'auto-fix sont séquentielles. Une approche incrémentale (recompiler uniquement les fichiers modifiés) réduirait le temps de compilation de 30-40%.
3. **Streaming de la génération** : les 817 fichiers sont générés séquentiellement. Une génération parallèle par domaine fonctionnel pourrait réduire cette étape de 50%.

---

## 6. Changements de code (changelog)

| Fichier | Insertions | Suppressions | Description |
|---------|------------|--------------|-------------|
| `server/engine/BusinessLogicTransformer.ts` | +77 | -1 | T11 EntityManager → Spring Data Repository |
| `server/engine/validation/CompileAutoFixer.ts` | +175 | -10 | Auto-fixer amélioré (JMS, stubs, casts, post-loop) |
| `server/spring-generator.ts` | +90 | -1 | Génération Repository + entity stubs |
| `server/spring/controller-gen.ts` | +53 | -8 | Javadoc, DateTimeFormat, types génériques |
| `server/spring/service-gen.ts` | +50 | -3 | Injection repository, préservation noms de champs |
| `server/engine/llm/LlmUseCaseDetector.ts` | +8 | -3 | Robustesse regex (échappement firstArg) |
| `server/compleo.test.ts` | +10 | -10 | Adaptation tests au nouveau comportement |
| `tests/regression/19-*.test.ts` | +2 | -2 | Adaptation test EAI |
| Snapshots (×17) | +17 | -17 | Mise à jour des snapshots |
| **Total** | **+451** | **-60** | **26 fichiers modifiés** |

---

## 7. Prochaines étapes (v12.11)

Les trois projets FAIL restants présentent des problèmes bien identifiés et isolés. Les corrections suivantes sont recommandées pour atteindre 13/13 :

1. **bookstore** : Refactoriser le tracking du "best state" dans l'auto-fixer pour garantir que les stubs générés aux itérations tardives sont toujours inclus dans l'état final retourné.
2. **jdbc-monolith** : Implémenter un fix spécifique pour les expressions chaînées de type `map.getOrDefault(key, default).method()` où le type de retour de `getOrDefault` est `Object` au lieu du type paramétré.
3. **nexabank-core** : Renforcer la détection des variables locales dans le corps des méthodes avant d'ajouter des paramètres de service, en utilisant un parsing plus robuste que le regex actuel.

Pour le scale-up, les pistes d'amélioration incluent :

- Réduire les erreurs jPOS en ajoutant des stubs pour les patterns ISO 8583 spécifiques.
- Améliorer la détection des dépendances pour les frameworks non-standard (Roller, jPOS).
- Implémenter le cache LLM persistant pour accélérer les analyses répétées.
