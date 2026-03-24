# Guide d'Utilisation — EJB Client Modernizer

**Auteur** : Hamza NORDINE
**Version** : 2.0.0
**Date** : Mars 2026

---

## Table des matières

1. [Présentation de l'outil](#1-présentation-de-loutil)
2. [Prérequis](#2-prérequis)
3. [Installation et lancement](#3-installation-et-lancement)
4. [Interface utilisateur](#4-interface-utilisateur)
5. [Mode fichier unique](#5-mode-fichier-unique)
6. [Mode multi-fichiers (onglets)](#6-mode-multi-fichiers-onglets)
7. [Mode projet entier](#7-mode-projet-entier)
8. [Analyser du code Java legacy](#8-analyser-du-code-java-legacy)
9. [Générer les clients API REST](#9-générer-les-clients-api-rest)
10. [Moteur IA interne](#10-moteur-ia-interne)
11. [Export ZIP Maven](#11-export-zip-maven)
12. [Comprendre le rapport d'analyse](#12-comprendre-le-rapport-danalyse)
13. [Exemples de transformation](#13-exemples-de-transformation)
14. [FAQ et dépannage](#14-faq-et-dépannage)

---

## 1. Présentation de l'outil

EJB Client Modernizer est un outil de transformation automatique de code Java legacy. Il analyse le code source des applications clientes qui utilisent des appels EJB (Enterprise JavaBeans) et génère du code moderne utilisant Spring WebClient pour appeler des APIs REST. L'outil intègre un **moteur d'intelligence artificielle déterministe** qui évalue la qualité du code, détecte les anti-patterns et propose des optimisations contextuelles sans aucune hallucination.

L'outil prend en charge les patterns suivants du code legacy :

| Pattern Legacy | Description |
| :--- | :--- |
| `@EJB` injection | Injection de dépendance via l'annotation `@EJB` |
| `@Inject` injection | Injection CDI via l'annotation `@Inject` |
| JNDI Lookup | Résolution de service via `Context.lookup()` |
| `InitialContext` | Création d'un contexte JNDI avec `new InitialContext()` |
| Appels directs | Appels de méthodes sur les services EJB injectés |
| Transactions | Annotations `@Transactional` et `@TransactionAttribute` |
| JMS / MQ / Batch | Détection des éléments de messaging et traitement par lots |

Le code généré respecte les standards enterprise modernes : Java 21, Spring Boot 3, Spring WebFlux WebClient, Clean Architecture, principes SOLID, et utilise Lombok pour la réduction du boilerplate.

---

## 2. Prérequis

L'outil fonctionne entièrement dans le navigateur web. Aucune installation locale n'est nécessaire pour l'utiliser. L'ensemble de l'analyse, de la génération de code et de l'analyse IA s'exécute côté client (dans le navigateur), ce qui garantit que votre code source ne quitte jamais votre poste de travail.

Pour exploiter le code généré dans un projet, les prérequis suivants sont nécessaires :

| Composant | Version minimale | Remarque |
| :--- | :--- | :--- |
| Java JDK | 21 | LTS recommandé |
| Maven | 3.9+ | Pour compiler le projet généré |
| Spring Boot | 3.2+ | Inclus dans le `pom.xml` généré |
| IDE recommandé | IntelliJ IDEA ou VS Code | Avec extensions Java |
| Navigateur web | Chrome, Firefox ou Edge | Version récente |

---

## 3. Installation et lancement

### 3.1 Utilisation en ligne

L'outil est accessible directement via son URL de déploiement. Il suffit d'ouvrir l'URL dans un navigateur moderne (Chrome, Firefox, Edge) pour commencer à l'utiliser. Aucune inscription ni authentification n'est requise.

### 3.2 Lancement en local (développement)

Pour exécuter l'outil en local, clonez le dépôt GitHub et lancez le serveur de développement :

```bash
# Cloner le projet
git clone https://github.com/compleoRepos/ejb-client-modernizer.git
cd ejb-client-modernizer

# Installer les dépendances
pnpm install

# Lancer le serveur de développement
pnpm dev
```

L'application sera accessible sur `http://localhost:3000`.

### 3.3 Dépendances du projet

Le projet utilise les technologies suivantes côté frontend :

| Technologie | Rôle |
| :--- | :--- |
| React 19 | Framework UI |
| TypeScript | Typage statique |
| Tailwind CSS 4 | Stylisation |
| Monaco Editor | Éditeur de code (même moteur que VS Code) |
| JSZip | Génération d'archives ZIP côté client |
| FileSaver.js | Téléchargement de fichiers côté client |

### 3.4 Build de production

Pour générer un build de production :

```bash
pnpm build
```

Les fichiers statiques sont générés dans le dossier `dist/` et peuvent être servis par n'importe quel serveur HTTP statique (Nginx, Apache, CDN).

---

## 4. Interface utilisateur

L'interface adopte un design **Terminal Craft** inspiré des IDE professionnels, avec un thème sombre optimisé pour la lecture de code. Elle est divisée en plusieurs zones fonctionnelles.

### 4.1 Barre d'outils (Header)

La barre d'outils en haut de l'écran contient les éléments suivants :

| Élément | Icône | Fonction |
| :--- | :---: | :--- |
| **Charger un exemple** | Menu déroulant | Charge un des exemples prédéfinis dans un nouvel onglet |
| **Fichier(s)** | Upload | Upload un ou plusieurs fichiers `.java` (chacun dans un onglet séparé) |
| **Dossier** | Dossier | Upload un dossier de fichiers Java (chaque fichier dans un onglet) |
| **Projet entier** | Package (vert) | Charge un projet complet, analyse et transforme automatiquement |
| **Analyser** | Play (cyan) | Lance l'analyse de tous les fichiers ouverts |
| **Transformer** | Éclair (orange) | Génère le code moderne + lance l'analyse IA |
| **ZIP Maven** | Archive (violet) | Exporte le projet généré en archive ZIP Maven |

### 4.2 Panneau gauche — Code Java Legacy

Le panneau gauche contient un éditeur Monaco (le même moteur que VS Code) avec un **système d'onglets** permettant de travailler sur plusieurs fichiers simultanément. Chaque onglet représente un fichier Java distinct.

Les fonctionnalités du panneau gauche sont les suivantes :

| Fonctionnalité | Description |
| :--- | :--- |
| **Onglets de fichiers** | Chaque fichier ouvert dispose de son propre onglet avec son nom |
| **Bouton +** | Ajoute un nouvel onglet vide pour coller du code |
| **Bouton ×** | Ferme un onglet (le dernier onglet ne peut pas être fermé) |
| **Badges d'analyse** | Après analyse, chaque onglet affiche le nombre d'injections `@EJB` détectées |
| **Barre de résumé** | Sous les onglets, affiche le total des `@EJB`, lookups et appels détectés |
| **Coloration syntaxique** | Coloration Java complète avec numéros de ligne |

### 4.3 Panneau droit — Résultats

Le panneau droit comporte **trois onglets** :

**Onglet "Code Généré"** : Affiche l'arborescence des fichiers générés, organisés par catégorie (CLIENT, CONFIG, DTO, EXCEPTION, UTIL, TEST). Cliquez sur un fichier pour afficher son contenu dans l'éditeur de code en lecture seule. Un badge indique le nombre total de fichiers générés.

**Onglet "Rapport"** : Affiche le rapport d'analyse consolidé en Markdown, incluant le résumé, les injections détectées, les appels de méthodes, les dépendances et le mapping REST proposé. Pour le mode multi-fichiers, le rapport fusionne les résultats de tous les fichiers analysés.

**Onglet "IA Interne"** : Affiche les résultats du moteur d'intelligence artificielle déterministe. Cet onglet est détaillé dans la section 10 de ce guide.

### 4.4 Barre de statut (Footer)

La barre de statut en bas de l'écran affiche en temps réel :

| Indicateur | Description |
| :--- | :--- |
| **Version** | Numéro de version de l'outil |
| **Fichier(s)** | Nombre de fichiers ouverts dans les onglets |
| **Nom du projet** | Affiché en vert lorsque le mode projet entier est actif |
| **Service(s)** | Nombre de services EJB détectés (après analyse) |
| **Dép.** | Nombre de dépendances inter-services |
| **Fichier(s) générés** | Nombre de fichiers de code moderne générés |
| **Message de statut** | Dernier message d'action avec horodatage |

---

## 5. Mode fichier unique

Le mode fichier unique est le mode par défaut au lancement de l'outil. Un seul onglet est ouvert avec un exemple de code préchargé (`PaymentProcessor.java`).

**Étape 1** : Collez votre code Java legacy dans l'éditeur Monaco du panneau gauche, ou chargez un fichier via le bouton "Fichier(s)".

**Étape 2** : Cliquez sur **"Analyser"** pour détecter les patterns EJB.

**Étape 3** : Cliquez sur **"Transformer"** pour générer le code moderne et lancer l'analyse IA.

**Étape 4** : Consultez les résultats dans les trois onglets du panneau droit (Code Généré, Rapport, IA Interne).

---

## 6. Mode multi-fichiers (onglets)

Le mode multi-fichiers permet de travailler sur plusieurs fichiers Java simultanément. Chaque fichier est affiché dans un onglet distinct dans le panneau gauche.

### 6.1 Ajouter des fichiers

Il existe plusieurs méthodes pour ajouter des fichiers :

**Méthode A — Bouton +** : Cliquez sur le bouton **"+"** à droite du dernier onglet pour créer un nouvel onglet vide. Collez ensuite votre code Java dans l'éditeur.

**Méthode B — Charger un exemple** : Sélectionnez un exemple dans le menu déroulant "Charger un exemple". L'exemple est automatiquement ouvert dans un nouvel onglet, sans écraser les fichiers existants.

**Méthode C — Upload de fichiers** : Cliquez sur le bouton "Fichier(s)" et sélectionnez un ou plusieurs fichiers `.java`. Chaque fichier est ouvert dans un onglet séparé.

**Méthode D — Upload de dossier** : Cliquez sur le bouton "Dossier" et sélectionnez un dossier. Tous les fichiers `.java` du dossier sont chargés dans des onglets distincts.

### 6.2 Naviguer entre les fichiers

Cliquez sur un onglet pour afficher son contenu dans l'éditeur. L'onglet actif est mis en surbrillance avec une bordure cyan. Après l'analyse, chaque onglet affiche un badge indiquant le nombre d'injections `@EJB` détectées dans ce fichier.

### 6.3 Fermer un fichier

Cliquez sur le bouton **"×"** à droite du nom de l'onglet pour le fermer. Le dernier onglet restant ne peut pas être fermé (il doit toujours y avoir au moins un fichier ouvert).

### 6.4 Analyse et transformation multi-fichiers

Lorsque vous cliquez sur **"Analyser"**, l'outil analyse **tous les fichiers ouverts** simultanément. Le rapport consolidé fusionne les résultats de tous les fichiers. De même, la transformation génère le code moderne pour l'ensemble des services détectés dans tous les fichiers.

---

## 7. Mode projet entier

Le mode projet entier est conçu pour traiter un projet Java complet en une seule opération. Il combine le chargement, l'analyse et la transformation en un flux automatisé.

### 7.1 Lancer le mode projet entier

Cliquez sur le bouton vert **"Projet entier"** dans la barre d'outils. Un sélecteur de dossier s'ouvre. Sélectionnez le dossier racine de votre projet Java.

### 7.2 Traitement automatique

L'outil effectue automatiquement les opérations suivantes :

| Phase | Description | Indicateur visuel |
| :--- | :--- | :--- |
| **1. Chargement** | Scan récursif du dossier, chargement de tous les fichiers `.java` | Barre de progression + toast |
| **2. Analyse** | Analyse de chaque fichier pour détecter les patterns EJB | Barre de progression + badges |
| **3. Génération** | Génération du code moderne pour tous les services détectés | Barre de progression + arborescence |
| **4. Analyse IA** | Évaluation de la qualité et suggestions d'optimisation | Onglet IA Interne |

### 7.3 Résultats

Après le traitement, tous les fichiers du projet sont affichés dans des onglets distincts. Le nom du projet est détecté automatiquement à partir du chemin du dossier et affiché en vert dans la barre de statut. Le rapport consolidé et l'analyse IA couvrent l'ensemble du projet.

### 7.4 Cas d'usage recommandé

Le mode projet entier est particulièrement adapté pour :

- Évaluer rapidement l'ampleur de la migration d'un projet complet
- Générer en une passe tous les clients API REST nécessaires
- Obtenir un rapport consolidé et un score de qualité global pour le projet
- Exporter le projet modernisé complet en archive ZIP Maven

---

## 8. Analyser du code Java legacy

### 8.1 Lancer l'analyse

Cliquez sur le bouton **"Analyser"** (icône play, couleur cyan). L'outil analyse tous les fichiers ouverts et détecte automatiquement les éléments suivants :

| Élément détecté | Description |
| :--- | :--- |
| Injections `@EJB` | Champs annotés `@EJB` avec le type de service et le nom du champ |
| Injections `@Inject` | Champs annotés `@Inject` (CDI) |
| Lookups JNDI | Appels à `Context.lookup()` avec le nom JNDI résolu |
| `InitialContext` | Création de contextes JNDI via `new InitialContext()` |
| Appels de méthodes | Appels sur les services EJB (service, méthode, paramètres, type retour, ligne) |
| Transactions | Annotations `@Transactional` et `@TransactionAttribute` |
| JMS / MQ | Annotations et classes liées au messaging (`@MessageDriven`, `JMSContext`, etc.) |
| Batch | Annotations et classes liées au traitement par lots (`@BatchProperty`, `ItemReader`, etc.) |

### 8.2 Résultats de l'analyse

Après l'analyse, les éléments suivants sont mis à jour dans l'interface :

Les **badges** sur chaque onglet indiquent le nombre d'injections `@EJB` détectées dans le fichier correspondant. La **barre de résumé** sous les onglets affiche le total consolidé (nombre d'`@EJB`, lookups JNDI, appels de méthodes). La **barre de statut** affiche le nombre de services détectés et de dépendances. L'onglet **"Rapport"** s'active et affiche le rapport d'analyse Markdown complet.

---

## 9. Générer les clients API REST

### 9.1 Lancer la transformation

Après avoir analysé le code, cliquez sur le bouton **"Transformer"** (icône éclair, couleur orange). L'outil génère automatiquement un projet complet et lance simultanément l'analyse IA.

### 9.2 Fichiers générés

Le code généré comprend les fichiers suivants :

| Type de fichier | Catégorie | Description |
| :--- | :---: | :--- |
| **ApiClient** | CLIENT | Clients API REST utilisant WebClient pour chaque service EJB détecté |
| **WebClientConfig** | CONFIG | Configuration centralisée du WebClient avec timeouts, logging et retry |
| **pom.xml** | CONFIG | Configuration Maven avec toutes les dépendances (Spring Boot 3, WebFlux, Lombok, etc.) |
| **application.yml** | CONFIG | Configuration Spring Boot avec URLs des services et timeouts |
| **RequestDTO** | DTO | Data Transfer Objects pour les paramètres d'entrée de chaque méthode |
| **ResponseDTO** | DTO | Data Transfer Objects pour les réponses de chaque méthode |
| **ApiClientException** | EXCEPTION | Exception personnalisée pour la gestion d'erreurs HTTP |
| **ApiErrorHandler** | UTIL | Utilitaire de gestion centralisée des erreurs avec logging |
| **Tests** | TEST | Tests JUnit 5 + Mockito pour chaque client API généré |

### 9.3 Technologies du code généré

| Technologie | Version | Rôle |
| :--- | :--- | :--- |
| Java | 21 | Langage cible (LTS) |
| Spring Boot | 3.2+ | Framework applicatif |
| Spring WebFlux | 6.x | WebClient non-bloquant |
| Lombok | 1.18+ | Réduction du boilerplate |
| Jakarta Validation | 3.0 | Validation des DTOs |
| JUnit 5 | 5.10+ | Tests unitaires |
| Mockito | 5.x | Mocking pour les tests |
| SLF4J | 2.x | Logging structuré |

---

## 10. Moteur IA interne

### 10.1 Présentation

Le moteur IA interne est un système d'analyse **100% déterministe** qui s'exécute entièrement dans le navigateur. Il ne fait appel à aucun service externe, aucune API d'intelligence artificielle, et ne génère aucun texte libre. Chaque suggestion est le résultat d'une **règle codée en dur**, traçable et reproductible. Le bandeau de l'onglet IA confirme : *"Analyse déterministe — 100% basée sur des règles codées, aucune hallucination"*.

### 10.2 Accéder aux résultats IA

L'analyse IA est déclenchée automatiquement lors de la transformation (bouton "Transformer"). Les résultats sont affichés dans l'onglet **"IA Interne"** du panneau droit. Un badge numérique sur l'onglet indique le nombre de suggestions.

### 10.3 Scores de qualité

L'onglet IA affiche deux cartes de score côte à côte :

| Carte | Description |
| :--- | :--- |
| **Code Legacy** | Score global du code source original (sur 100) |
| **Code Modernisé** | Score global du code généré (sur 100) |

Chaque carte détaille quatre critères avec une barre de progression :

| Critère | Ce qu'il mesure |
| :--- | :--- |
| **Maintenabilité** | Qualité structurelle, respect des principes SOLID, lisibilité |
| **Sécurité** | Gestion des données sensibles, validation des entrées |
| **Performance** | Efficacité des appels, gestion des ressources |
| **Résilience** | Gestion des erreurs, retry, circuit-breaker, timeouts |

Le score du code legacy est généralement inférieur à celui du code modernisé, car le code généré intègre automatiquement les bonnes pratiques (retry, circuit-breaker, logging structuré, gestion d'erreurs typée).

### 10.4 Badges récapitulatifs

Sous les cartes de score, des badges colorés résument les résultats :

| Badge | Couleur | Signification |
| :--- | :---: | :--- |
| **Critique(s)** | Rouge | Anti-patterns graves nécessitant une correction immédiate |
| **Avertissement(s)** | Orange | Points d'attention importants |
| **Info(s)** | Bleu | Informations et bonnes pratiques |
| **Complexité** | Gris | Niveau de complexité estimé (faible, moyenne, élevée) |
| **Effort** | Gris | Estimation de l'effort de migration en jours |

### 10.5 Optimisations

La section "Optimisations" liste les améliorations appliquées ou recommandées par le moteur IA :

| Optimisation | Statut | Description |
| :--- | :---: | :--- |
| **Retry** | Appliqué | Politique de retry (3 tentatives, backoff exponentiel) pour les erreurs transitoires |
| **Circuit-Breaker** | Appliqué | Isolation des pannes via Resilience4j pour éviter les cascades d'erreurs |
| **Timeout** | Appliqué | Timeouts explicites (connect: 5s, read: 30s) sur tous les appels WebClient |
| **Logging** | Appliqué | Logging structuré (SLF4J) avec corrélation d'ID de requête |
| **Error-Handling** | Appliqué | Gestion d'erreurs typée (WebClientResponseException, TimeoutException, fallback) |
| **Cache** | Recommandé | Recommandation d'ajout de `@Cacheable` pour les méthodes de lecture (get/find/list) |

Le statut **"Appliqué"** signifie que l'optimisation est déjà intégrée dans le code généré. Le statut **"Recommandé"** signifie que l'optimisation est suggérée mais nécessite une implémentation manuelle.

### 10.6 Suggestions

La section "Suggestions" liste les recommandations contextuelles, chacune traçable à une règle précise :

| Champ | Description |
| :--- | :--- |
| **Titre** | Description courte de la suggestion |
| **Règle** | Identifiant de la règle (ex: AP-071) |
| **Catégorie** | Catégorie de la suggestion (EJB Legacy, Sécurité, Performance, etc.) |
| **Fichier:Ligne** | Emplacement exact dans le code source |
| **Description** | Explication détaillée du problème détecté |
| **Code** | Extrait de code concerné (si applicable) |
| **Correction** | Action recommandée pour résoudre le problème |

Les suggestions sont classées par sévérité : **critique** (rouge), **avertissement** (orange), **info** (bleu), **suggestion** (vert).

### 10.7 Règles de détection

Le moteur IA utilise un ensemble de règles codées couvrant les catégories suivantes :

| Catégorie | Exemples de règles |
| :--- | :--- |
| **EJB Legacy** | Détection de `@Stateless`, `@Stateful`, `@Singleton`, `@MessageDriven` |
| **JNDI** | Détection de `InitialContext`, `Context.lookup()`, noms JNDI hardcodés |
| **Couplage** | Nombre excessif d'injections `@EJB` (seuil : 5+) |
| **Transactions** | Détection de `@TransactionAttribute`, `UserTransaction` |
| **Sécurité** | Détection de credentials hardcodés, absence de validation |
| **Performance** | Appels synchrones bloquants, absence de cache |
| **JMS/MQ/Batch** | Détection de `@MessageDriven`, `JMSContext`, `@BatchProperty` |

---

## 11. Export ZIP Maven

### 11.1 Générer l'archive ZIP

Après la transformation, le bouton **"ZIP Maven"** (icône archive, couleur violet) apparaît dans la barre d'outils. Cliquez dessus pour générer et télécharger une archive ZIP contenant un projet Maven complet, prêt à être compilé et exécuté.

### 11.2 Structure de l'archive ZIP

L'archive ZIP contient la structure suivante :

```
ejb-client-modernized/
├── pom.xml                          # Configuration Maven complète
├── README.md                        # Documentation du projet généré
├── Dockerfile                       # Image Docker pour le déploiement
├── .gitignore                       # Fichiers à ignorer par Git
├── docs/
│   └── analysis-report.md           # Rapport d'analyse complet
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/bank/client/
│   │   │       ├── client/          # Clients API REST (WebClient)
│   │   │       ├── config/          # Configuration (WebClientConfig)
│   │   │       ├── dto/             # DTOs (Request/Response)
│   │   │       ├── exception/       # Exceptions personnalisées
│   │   │       └── util/            # Utilitaires (ErrorHandler)
│   │   └── resources/
│   │       └── application.yml      # Configuration Spring Boot
│   └── test/
│       └── java/
│           └── com/bank/client/
│               └── client/          # Tests JUnit 5 + Mockito
```

### 11.3 Compiler et exécuter le projet généré

Pour compiler le projet généré, extrayez l'archive ZIP et exécutez les commandes suivantes :

```bash
# Extraire l'archive
unzip ejb-client-modernized.zip
cd ejb-client-modernized

# Compiler le projet
mvn clean compile

# Lancer les tests
mvn test

# Packager en JAR exécutable
mvn clean package
```

### 11.4 Intégrer dans un projet existant

Pour intégrer le code généré dans un projet Spring Boot existant, copiez les packages suivants dans votre arborescence source :

1. Copiez le contenu de `src/main/java/com/bank/client/` dans votre projet
2. Ajoutez les dépendances manquantes dans votre `pom.xml` (Spring WebFlux, Lombok, etc.)
3. Ajoutez la configuration des URLs de services dans votre `application.yml`
4. Ajustez les DTOs aux types réels de votre domaine métier

---

## 12. Comprendre le rapport d'analyse

Le rapport d'analyse Markdown (onglet "Rapport") contient les sections suivantes :

**En-tête** : Nom du fichier analysé, auteur de l'outil (Hamza NORDINE), classe et package détectés.

**Résumé** : Tableau récapitulatif du nombre d'injections EJB, lookups JNDI, appels de méthodes, transactions et éléments JMS/MQ/Batch détectés.

**Injections EJB Détectées** : Liste détaillée de chaque injection `@EJB` avec le numéro de ligne et le code source correspondant.

**Lookups JNDI Détectés** : Liste des résolutions JNDI avec le nom JNDI et le type de service résolu.

**Appels de Méthodes Détectés** : Tableau des appels de méthodes sur les services EJB, incluant le service appelé, la méthode, les paramètres, le type de retour et le numéro de ligne.

**Transactions Détectées** : Liste des annotations de transaction avec un avertissement concernant la nécessité de vérification manuelle lors de la migration.

**Éléments JMS / MQ / Batch** : Liste des éléments de messaging et de traitement par lots détectés, avec un avertissement indiquant que ces éléments nécessitent une migration spécifique.

**Graphe de Dépendances** : Tableau montrant les dépendances entre la classe analysée et les services EJB appelés, avec la liste des méthodes appelées pour chaque service.

**Mapping REST Proposé** : Tableau de correspondance entre les méthodes EJB et les endpoints REST proposés (verbe HTTP + chemin). Le verbe HTTP est déterminé automatiquement selon le nom de la méthode (get/find → GET, create/save → POST, update → PUT, delete → DELETE).

---

## 13. Exemples de transformation

### 13.1 Injection @EJB simple

**Code legacy (entrée)** :

```java
@EJB
TransferService transferService;

transferService.transferMoney(request);
```

**Code moderne (sortie)** :

```java
@Service
@Slf4j
@RequiredArgsConstructor
public class TransferApiClient {

    private final WebClient webClient;
    private static final Duration TIMEOUT = Duration.ofSeconds(30);

    public TransferMoneyResponseDTO transferMoney(Object request) {
        log.info("Appel POST /api/v1/transfers");
        try {
            return webClient.post()
                    .uri("/api/v1/transfers")
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(TransferMoneyResponseDTO.class)
                    .timeout(TIMEOUT)
                    .block();
        } catch (WebClientResponseException e) {
            log.error("Erreur HTTP {} : {}", e.getStatusCode(), e.getMessage());
            throw new ApiClientException("Erreur lors de l'appel à transferMoney", e);
        }
    }
}
```

### 13.2 Lookup JNDI

**Code legacy (entrée)** :

```java
Context ctx = new InitialContext();
TransferService service =
    (TransferService) ctx.lookup("java:global/bank/TransferService");
TransferResult result = service.transferMoney(request);
```

**Code moderne (sortie)** : Le même `TransferApiClient` est généré, car l'outil détecte que le service résolu via JNDI est le même `TransferService`.

### 13.3 Code complexe avec JMS et Transactions

L'outil détecte les éléments JMS et les transactions, et les signale dans le rapport d'analyse avec des avertissements appropriés. Le moteur IA attribue une sévérité "avertissement" à ces éléments et recommande une migration manuelle spécifique (pattern Saga pour les transactions distribuées, Spring AMQP ou Spring JMS pour le messaging).

### 13.4 Projet multi-fichiers

Lorsque plusieurs fichiers sont analysés simultanément, l'outil fusionne les résultats et déduplique les services. Par exemple, si `PaymentProcessor.java` et `OrderProcessor.java` utilisent tous les deux `AccountService`, un seul `AccountApiClient` est généré, regroupant toutes les méthodes appelées dans les deux fichiers.

---

## 14. FAQ et dépannage

**Q : L'outil modifie-t-il mon code source original ?**
R : Non. L'outil fonctionne en lecture seule sur le code legacy. Il génère un nouveau projet séparé contenant les clients API modernes. Votre code source n'est jamais modifié.

**Q : Mon code quitte-t-il mon poste de travail ?**
R : Non. L'ensemble de l'analyse, de la génération de code et de l'analyse IA s'exécute entièrement dans votre navigateur (côté client). Aucune donnée n'est envoyée à un serveur externe.

**Q : Que faire si l'outil ne détecte pas certains patterns ?**
R : L'outil détecte les patterns les plus courants (`@EJB`, `@Inject`, JNDI lookup, `InitialContext`). Pour des patterns très spécifiques ou personnalisés, une adaptation manuelle du code généré peut être nécessaire. Vérifiez que votre code contient bien les annotations ou appels standards.

**Q : Le code généré est-il prêt pour la production ?**
R : Le code généré est structuré selon les bonnes pratiques enterprise et constitue une base solide. Il est recommandé de compléter les DTOs avec les types réels de votre domaine, d'ajuster les URLs des services dans `application.yml`, et de compléter les tests unitaires avant le déploiement en production.

**Q : Comment fonctionne le moteur IA ? Utilise-t-il ChatGPT ou un LLM ?**
R : Non. Le moteur IA est 100% déterministe et basé sur des règles codées en dur. Il n'utilise aucun modèle de langage, aucune API externe, et ne génère aucun texte libre. Chaque suggestion est traçable à une règle précise avec un identifiant (ex: AP-071). Il n'y a aucune hallucination possible.

**Q : Comment gérer les transactions distribuées ?**
R : L'outil détecte les annotations `@Transactional` et `@TransactionAttribute` et les signale dans le rapport. La gestion des transactions distribuées dans un contexte REST nécessite une approche différente (pattern Saga, compensation) qui doit être conçue manuellement. Le moteur IA signale ces cas avec une sévérité "avertissement".

**Q : Puis-je utiliser l'outil hors ligne ?**
R : Oui, si vous exécutez l'outil en local (voir section 3.2). L'outil ne nécessite aucune connexion internet pour fonctionner, car tout s'exécute dans le navigateur.

**Q : Comment exporter le rapport d'analyse ?**
R : Le rapport est affiché en Markdown dans l'onglet "Rapport". Vous pouvez le copier manuellement, ou utiliser l'export ZIP Maven qui inclut le rapport dans le dossier `docs/analysis-report.md`.

**Q : L'archive ZIP est-elle compilable directement ?**
R : Oui. L'archive contient un `pom.xml` complet avec toutes les dépendances nécessaires. Exécutez `mvn clean compile` pour compiler le projet. Les DTOs générés utilisent des types génériques (`Object`) qui devront être ajustés aux types réels de votre domaine.

---

*EJB Client Modernizer v2.0 — Développé par Hamza NORDINE*
