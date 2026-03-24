# Guide d'Utilisation — EJB Client Modernizer

**Auteur** : Hamza NORDINE
**Version** : 1.0.0
**Date** : Mars 2026

---

## Table des matières

1. [Présentation de l'outil](#1-présentation-de-loutil)
2. [Prérequis](#2-prérequis)
3. [Installation et lancement](#3-installation-et-lancement)
4. [Interface utilisateur](#4-interface-utilisateur)
5. [Analyser du code Java legacy](#5-analyser-du-code-java-legacy)
6. [Générer les clients API REST](#6-générer-les-clients-api-rest)
7. [Télécharger le code généré](#7-télécharger-le-code-généré)
8. [Comprendre le rapport d'analyse](#8-comprendre-le-rapport-danalyse)
9. [Exemples de transformation](#9-exemples-de-transformation)
10. [FAQ et dépannage](#10-faq-et-dépannage)

---

## 1. Présentation de l'outil

EJB Client Modernizer est un outil de transformation automatique de code Java legacy. Il analyse le code source des applications clientes qui utilisent des appels EJB (Enterprise JavaBeans) et génère du code moderne utilisant Spring WebClient pour appeler des APIs REST.

L'outil prend en charge les patterns suivants du code legacy :

| Pattern Legacy | Description |
| :--- | :--- |
| `@EJB` injection | Injection de dépendance via l'annotation `@EJB` |
| JNDI Lookup | Résolution de service via `Context.lookup()` |
| `InitialContext` | Création d'un contexte JNDI avec `new InitialContext()` |
| Appels directs | Appels de méthodes sur les services EJB injectés |

Le code généré respecte les standards enterprise modernes : Java 21, Spring Boot 3, Spring WebFlux WebClient, Clean Architecture, principes SOLID, et utilise Lombok pour la réduction du boilerplate.

---

## 2. Prérequis

L'outil fonctionne entièrement dans le navigateur web. Aucune installation locale n'est nécessaire pour l'utiliser.

Pour exploiter le code généré dans un projet, les prérequis suivants sont nécessaires :

| Composant | Version minimale |
| :--- | :--- |
| Java JDK | 21 |
| Maven | 3.9+ |
| Spring Boot | 3.2+ |
| IDE recommandé | IntelliJ IDEA ou VS Code |

---

## 3. Installation et lancement

### Utilisation en ligne

L'outil est accessible directement via son URL de déploiement. Il suffit d'ouvrir l'URL dans un navigateur moderne (Chrome, Firefox, Edge) pour commencer à l'utiliser.

### Lancement en local (développement)

Pour exécuter l'outil en local, clonez le dépôt et lancez le serveur de développement :

```bash
# Cloner le projet
git clone <url-du-depot> ejb-client-modernizer
cd ejb-client-modernizer

# Installer les dépendances
pnpm install

# Lancer le serveur de développement
pnpm dev
```

L'application sera accessible sur `http://localhost:3000`.

---

## 4. Interface utilisateur

L'interface est divisée en plusieurs zones fonctionnelles.

### 4.1 Barre d'outils (Header)

La barre d'outils en haut de l'écran contient les éléments suivants :

| Élément | Fonction |
| :--- | :--- |
| **Charger un exemple** | Menu déroulant permettant de charger un des exemples prédéfinis |
| **Fichier** | Bouton pour uploader un fichier `.java` depuis votre ordinateur |
| **Dossier** | Bouton pour uploader un dossier complet contenant des fichiers Java |
| **Analyser** | Lance l'analyse du code legacy (détection des patterns EJB) |
| **Transformer** | Génère le code moderne à partir de l'analyse (disponible après analyse) |
| **Télécharger** | Télécharge l'ensemble du code généré (disponible après transformation) |

### 4.2 Panneau gauche — Code Java Legacy

Le panneau gauche contient un éditeur Monaco (le même éditeur que VS Code) dans lequel vous pouvez :

- Coller directement du code Java legacy
- Modifier le code chargé depuis un fichier ou un exemple
- Visualiser la coloration syntaxique Java

Après l'analyse, des badges apparaissent en haut du panneau indiquant le nombre d'injections `@EJB`, de lookups JNDI et d'éléments JMS/MQ détectés.

### 4.3 Panneau droit — Résultats

Le panneau droit comporte deux onglets :

**Onglet "Code Généré"** : Affiche l'arborescence des fichiers générés, organisés par catégorie (CLIENT, CONFIG, DTO, EXCEPTION, UTIL, TEST). Cliquez sur un fichier pour afficher son contenu dans l'éditeur de code en lecture seule.

**Onglet "Rapport"** : Affiche le rapport d'analyse en Markdown, incluant le résumé, les injections détectées, les appels de méthodes, les dépendances et le mapping REST proposé.

### 4.4 Barre de statut (Footer)

La barre de statut en bas de l'écran affiche en temps réel les indicateurs suivants : nombre de services détectés, nombre de dépendances, nombre de transactions, nombre de fichiers générés, et le dernier message de statut.

---

## 5. Analyser du code Java legacy

### Étape 1 : Charger le code

Trois méthodes sont disponibles pour charger du code Java :

**Méthode A — Coller du code** : Cliquez dans le panneau gauche et collez directement votre code Java legacy.

**Méthode B — Charger un fichier** : Cliquez sur le bouton "Fichier" dans la barre d'outils, puis sélectionnez un fichier `.java` sur votre ordinateur.

**Méthode C — Charger un dossier** : Cliquez sur le bouton "Dossier" dans la barre d'outils, puis sélectionnez un dossier contenant des fichiers Java. Tous les fichiers `.java` du dossier seront automatiquement concaténés.

### Étape 2 : Lancer l'analyse

Cliquez sur le bouton **"Analyser"** (icône play, couleur cyan). L'outil analyse le code et détecte automatiquement :

- Les injections `@EJB` et `@Inject`
- Les lookups JNDI (`Context.lookup()`, `InitialContext`)
- Les appels de méthodes sur les services EJB
- Les annotations de transaction (`@Transactional`, `@TransactionAttribute`)
- Les éléments JMS, MQ et Batch

### Étape 3 : Consulter le rapport

Après l'analyse, l'onglet "Rapport" s'active automatiquement et affiche le rapport complet en Markdown.

---

## 6. Générer les clients API REST

Après avoir analysé le code, cliquez sur le bouton **"Transformer"** (icône éclair, couleur orange). L'outil génère automatiquement un projet complet contenant :

| Type de fichier | Description |
| :--- | :--- |
| **ApiClient** | Clients API REST utilisant WebClient pour chaque service EJB détecté |
| **WebClientConfig** | Configuration centralisée du WebClient avec timeouts et logging |
| **DTOs** | Data Transfer Objects pour les requêtes et réponses |
| **ApiClientException** | Exception personnalisée pour la gestion d'erreurs |
| **ApiErrorHandler** | Utilitaire de gestion centralisée des erreurs |
| **Tests** | Structure de tests JUnit 5 pour chaque client API |
| **pom.xml** | Configuration Maven avec toutes les dépendances nécessaires |
| **application.yml** | Configuration Spring Boot |

Le code généré utilise les technologies suivantes : Java 21, Spring Boot 3, Spring WebFlux WebClient, Lombok, Jakarta Validation, et JUnit 5 avec Mockito pour les tests.

---

## 7. Télécharger le code généré

Après la transformation, le bouton **"Télécharger"** apparaît dans la barre d'outils. Cliquez dessus pour télécharger l'ensemble du code généré dans un fichier texte structuré.

Vous pouvez également copier le contenu d'un fichier individuel en cliquant sur l'icône de copie dans l'onglet "Code Généré".

---

## 8. Comprendre le rapport d'analyse

Le rapport d'analyse Markdown contient les sections suivantes :

**Résumé** : Tableau récapitulatif du nombre d'injections EJB, lookups JNDI, appels de méthodes, transactions et éléments JMS/MQ/Batch détectés.

**Injections EJB Détectées** : Liste détaillée de chaque injection `@EJB` avec le numéro de ligne et le code source.

**Lookups JNDI Détectés** : Liste des résolutions JNDI avec le nom JNDI et le type de service résolu.

**Appels de Méthodes Détectés** : Tableau des appels de méthodes sur les services EJB, incluant le service, la méthode, les paramètres, le type de retour et le numéro de ligne.

**Transactions Détectées** : Liste des annotations de transaction avec un avertissement concernant la nécessité de vérification manuelle lors de la migration.

**Éléments JMS / MQ / Batch** : Liste des éléments de messaging et de traitement par lots détectés.

**Graphe de Dépendances** : Tableau montrant les dépendances entre la classe analysée et les services EJB appelés.

**Mapping REST Proposé** : Tableau de correspondance entre les méthodes EJB et les endpoints REST proposés (verbe HTTP + chemin).

---

## 9. Exemples de transformation

### 9.1 Injection @EJB simple

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

### 9.2 Lookup JNDI

**Code legacy (entrée)** :

```java
Context ctx = new InitialContext();
TransferService service =
    (TransferService) ctx.lookup("java:global/bank/TransferService");
TransferResult result = service.transferMoney(request);
```

**Code moderne (sortie)** : Le même `TransferApiClient` est généré, car l'outil détecte que le service résolu via JNDI est le même `TransferService`.

### 9.3 Code complexe avec JMS et Transactions

L'outil détecte les éléments JMS et les transactions, et les signale dans le rapport d'analyse avec des avertissements appropriés pour une vérification manuelle.

---

## 10. FAQ et dépannage

**Q : L'outil modifie-t-il mon code source original ?**
R : Non. L'outil fonctionne en lecture seule sur le code legacy. Il génère un nouveau projet séparé contenant les clients API modernes.

**Q : Que faire si l'outil ne détecte pas certains patterns ?**
R : L'outil détecte les patterns les plus courants (`@EJB`, JNDI lookup, `InitialContext`). Pour des patterns très spécifiques ou personnalisés, une adaptation manuelle du code généré peut être nécessaire.

**Q : Le code généré est-il prêt pour la production ?**
R : Le code généré est structuré selon les bonnes pratiques enterprise et constitue une base solide. Il est recommandé de le compléter avec la logique métier spécifique, d'ajuster les DTOs aux types réels, et de compléter les tests unitaires avant le déploiement en production.

**Q : Comment gérer les transactions distribuées ?**
R : L'outil détecte les annotations `@Transactional` et `@TransactionAttribute` et les signale dans le rapport. La gestion des transactions distribuées dans un contexte REST nécessite une approche différente (pattern Saga, compensation) qui doit être conçue manuellement.

---

*EJB Client Modernizer — Développé par Hamza NORDINE*
