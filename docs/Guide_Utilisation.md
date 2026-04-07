# Guide d'Utilisation — Java Legacy Modernizer Platform

**Auteur** : Hamza NORDINE
**Version** : 3.0.0
**Date** : Avril 2026

---

## Table des matières

1. [Présentation de l'outil](#1-présentation-de-loutil)
2. [Prérequis](#2-prérequis)
3. [Installation et lancement](#3-installation-et-lancement)
4. [Interface utilisateur](#4-interface-utilisateur)
5. [Mode fichier unique](#5-mode-fichier-unique)
6. [Mode multi-fichiers (onglets)](#6-mode-multi-fichiers-onglets)
7. [Mode projet entier](#7-mode-projet-entier)
8. [Analyse multi-technologies](#8-analyse-multi-technologies)
9. [Transformation automatique](#9-transformation-automatique)
10. [Onglet Technologies](#10-onglet-technologies)
11. [Onglet Microservices](#11-onglet-microservices)
12. [Onglet Cloud](#12-onglet-cloud)
13. [Moteur IA interne (55+ règles)](#13-moteur-ia-interne)
14. [Export PDF du rapport IA](#14-export-pdf-du-rapport-ia)
15. [Export ZIP Maven](#15-export-zip-maven)
16. [Domain Events](#16-domain-events)
17. [Sécurité OAuth2 + OpenID Connect](#17-sécurité-oauth2--openid-connect)
18. [Comprendre le rapport d'analyse](#18-comprendre-le-rapport-danalyse)
19. [Exemples de transformation](#19-exemples-de-transformation)
20. [FAQ et dépannage](#20-faq-et-dépannage)

---

## 1. Présentation de l'outil

Java Legacy Modernizer Platform est une plateforme complète de modernisation de code Java legacy vers des architectures Spring Boot 3, Cloud-Native et Microservices. L'outil analyse le code source des applications Java utilisant des technologies obsolètes (EJB, Servlets, JSP, Struts, SOAP, JDBC brut, Hibernate legacy, JMS/MQ, Batch) et génère automatiquement du code moderne respectant les standards enterprise actuels.

L'outil prend en charge les technologies legacy suivantes :

| Technologie Legacy | Patterns détectés |
| :--- | :--- |
| **EJB** | `@EJB`, `@Stateless`, `@Stateful`, `@Remote`, `@Local`, JNDI lookups, `InitialContext` |
| **Servlets** | `HttpServlet`, `@WebServlet`, `doGet/doPost`, `HttpServletRequest/Response` |
| **JSP** | Scriptlets `<% %>`, directives, taglibs, JSTL |
| **Struts** | `ActionForm`, `ActionForward`, `struts-config.xml`, `DispatchAction` |
| **SOAP** | `@WebService`, `@WebMethod`, `@SOAPBinding`, WSDL, `javax.xml.ws` |
| **JDBC** | `DriverManager`, `PreparedStatement`, `ResultSet`, `Connection` |
| **Hibernate** | `SessionFactory`, `HQL`, `Criteria`, `@Entity`, `Session.save/update` |
| **JMS/MQ** | `@MessageDriven`, `JMSContext`, `Queue`, `Topic`, `MessageListener` |
| **Batch** | `@Schedule`, `TimerService`, boucles de traitement en masse |
| **Transactions** | `@TransactionAttribute`, `UserTransaction`, BMT/CMT |

La plateforme intègre un **moteur d'intelligence artificielle déterministe** (55+ règles issues de OWASP, SonarQube, SOLID, Clean Code, PMD, SpotBugs, Checkstyle et Refactoring Guru) qui évalue la qualité du code, détecte les anti-patterns et propose des optimisations contextuelles sans aucune hallucination.

Le code généré respecte les standards enterprise modernes : Java 21, Spring Boot 3, Spring WebFlux WebClient, Spring Data JPA, Spring Kafka, Clean Architecture, principes SOLID, et utilise Lombok pour la réduction du boilerplate.

---

## 2. Prérequis

L'outil fonctionne entièrement dans le navigateur web. Aucune installation locale n'est nécessaire pour l'utiliser. L'ensemble de l'analyse, de la génération de code et de l'analyse IA s'exécute côté client (dans le navigateur), ce qui garantit que votre code source ne quitte jamais votre poste de travail.

Pour exploiter le code généré dans un projet, les prérequis suivants sont nécessaires :

| Composant | Version minimale | Remarque |
| :--- | :--- | :--- |
| Java JDK | 21 | LTS recommandé |
| Maven | 3.9+ | Pour compiler le projet généré |
| Spring Boot | 3.3+ | Inclus dans le `pom.xml` généré |
| Docker | 24+ | Pour les Dockerfiles générés (optionnel) |
| Kubernetes | 1.28+ | Pour les manifests K8s générés (optionnel) |
| Helm | 3.14+ | Pour les Helm Charts générés (optionnel) |
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
| jsPDF | Génération de rapports PDF côté client |
| Framer Motion | Animations et micro-interactions |

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
| **Charger un exemple** | Menu déroulant | Charge un des 9 exemples prédéfinis (EJB, Servlet, SOAP, JDBC, Struts, Hibernate, JMS, Batch, Transactions) |
| **Fichier(s)** | Upload | Upload un ou plusieurs fichiers `.java` (chacun dans un onglet séparé) |
| **Dossier** | Dossier | Upload un dossier de fichiers Java (chaque fichier dans un onglet) |
| **Projet entier** | Package (vert) | Charge un projet complet, analyse et transforme automatiquement |
| **Analyser** | Play (cyan) | Lance l'analyse de tous les fichiers ouverts |
| **Transformer** | Éclair (orange) | Génère le code moderne + lance l'analyse IA |
| **ZIP Maven** | Archive (violet) | Exporte le projet généré en archive ZIP Maven |

### 4.2 Panneau gauche — Code Java Legacy

Le panneau gauche contient un éditeur Monaco (le même moteur que VS Code) avec un **système d'onglets** permettant de travailler sur plusieurs fichiers simultanément. Chaque onglet représente un fichier Java distinct.

| Fonctionnalité | Description |
| :--- | :--- |
| **Onglets de fichiers** | Chaque fichier ouvert dispose de son propre onglet avec son nom |
| **Bouton +** | Ajoute un nouvel onglet vide pour coller du code |
| **Bouton ×** | Ferme un onglet (le dernier onglet ne peut pas être fermé) |
| **Badges d'analyse** | Après analyse, chaque onglet affiche le nombre d'injections détectées |
| **Barre de résumé** | Sous les onglets, affiche le total des détections par technologie |
| **Coloration syntaxique** | Coloration Java complète avec numéros de ligne |

### 4.3 Panneau droit — Résultats

Le panneau droit comporte **six onglets** :

**Onglet "Code Généré"** : Affiche l'arborescence des fichiers générés, organisés par catégorie (CLIENT, CONFIG, DTO, EXCEPTION, UTIL, TEST, EVENT). Cliquez sur un fichier pour afficher son contenu dans l'éditeur de code en lecture seule.

**Onglet "Technologies"** : Affiche la cartographie détaillée des technologies legacy détectées dans le code, avec le nombre d'occurrences et les lignes concernées pour chaque pattern.

**Onglet "Microservices"** : Affiche les propositions d'extraction de microservices basées sur l'analyse des dépendances, les bounded contexts détectés, les APIs proposées et les événements de domaine.

**Onglet "Cloud"** : Affiche les artefacts cloud-native générés : Dockerfiles, manifests Kubernetes, Helm Charts, API Gateway, configuration OAuth2/OIDC, observabilité et pipeline CI/CD.

**Onglet "IA Interne"** : Affiche les résultats du moteur d'intelligence artificielle déterministe (55+ règles). Cet onglet est détaillé dans la section 13 de ce guide.

**Onglet "Rapport"** : Affiche le rapport d'analyse consolidé en Markdown, incluant le résumé, les technologies détectées, les dépendances et le mapping REST proposé.

### 4.4 Barre de statut (Footer)

La barre de statut en bas de l'écran affiche en temps réel :

| Indicateur | Description |
| :--- | :--- |
| **Version** | Numéro de version de l'outil (v3.0) |
| **Fichier(s)** | Nombre de fichiers ouverts dans les onglets |
| **Nom du projet** | Affiché en vert lorsque le mode projet entier est actif |
| **Service(s)** | Nombre de services legacy détectés (après analyse) |
| **Dép.** | Nombre de dépendances inter-services |
| **Fichier(s) générés** | Nombre de fichiers de code moderne générés |
| **Message de statut** | Dernier message d'action avec horodatage |

---

## 5. Mode fichier unique

Le mode fichier unique est le mode par défaut au lancement de l'outil. Un seul onglet est ouvert avec un exemple de code préchargé (`PaymentProcessor.java`).

**Étape 1** : Collez votre code Java legacy dans l'éditeur Monaco du panneau gauche, ou chargez un fichier via le bouton "Fichier(s)".

**Étape 2** : Cliquez sur **"Analyser"** pour détecter les technologies legacy.

**Étape 3** : Cliquez sur **"Transformer"** pour générer le code moderne et lancer l'analyse IA.

**Étape 4** : Consultez les résultats dans les six onglets du panneau droit.

---

## 6. Mode multi-fichiers (onglets)

Le mode multi-fichiers permet de travailler sur plusieurs fichiers Java simultanément. Chaque fichier est affiché dans un onglet distinct dans le panneau gauche.

### 6.1 Ajouter des fichiers

**Méthode A — Bouton +** : Cliquez sur le bouton **"+"** à droite du dernier onglet pour créer un nouvel onglet vide.

**Méthode B — Charger un exemple** : Sélectionnez un exemple dans le menu déroulant. L'exemple est automatiquement ouvert dans un nouvel onglet.

**Méthode C — Upload de fichiers** : Cliquez sur le bouton "Fichier(s)" et sélectionnez un ou plusieurs fichiers `.java`.

**Méthode D — Upload de dossier** : Cliquez sur le bouton "Dossier" et sélectionnez un dossier. Tous les fichiers `.java` sont chargés.

### 6.2 Analyse et transformation multi-fichiers

Lorsque vous cliquez sur **"Analyser"**, l'outil analyse **tous les fichiers ouverts** simultanément. Le rapport consolidé fusionne les résultats de tous les fichiers. La transformation génère le code moderne pour l'ensemble des services détectés.

---

## 7. Mode projet entier

Le mode projet entier est conçu pour traiter un projet Java complet en une seule opération. Cliquez sur le bouton vert **"Projet entier"** dans la barre d'outils et sélectionnez le dossier racine de votre projet Java.

L'outil effectue automatiquement :

| Phase | Description | Indicateur visuel |
| :--- | :--- | :--- |
| 1. Chargement | Scan récursif de tous les fichiers `.java` | Barre de progression |
| 2. Analyse | Analyse de chaque fichier pour détecter les technologies | Barre de progression |
| 3. Transformation | Génération du code moderne pour tous les services | Barre de progression |
| 4. IA | Analyse de qualité par le moteur IA déterministe | Badge de score |

---

## 8. Analyse multi-technologies

L'analyseur étendu détecte automatiquement 10 familles de technologies legacy dans le code Java. Pour chaque technologie détectée, l'outil identifie les patterns spécifiques, les lignes de code concernées et le niveau de complexité de migration.

| Technologie | Transformation cible | Complexité |
| :--- | :--- | :--- |
| EJB Client | Spring WebClient + Resilience4j | Moyenne |
| Servlets | Spring REST Controllers + `@GetMapping`/`@PostMapping` | Faible |
| Struts | Spring MVC Controllers + Thymeleaf | Moyenne |
| SOAP | REST API + OpenAPI 3.0 | Élevée |
| JDBC | Spring Data JPA + Repositories | Moyenne |
| Hibernate | Spring Data JPA | Faible |
| JMS/MQ | Spring Kafka + Event-Driven | Élevée |
| Batch | Spring Batch + `@Scheduled` | Moyenne |

---

## 9. Transformation automatique

Après l'analyse, cliquez sur **"Transformer"** pour générer le code moderne. Le générateur produit les fichiers suivants selon les technologies détectées :

| Type de fichier | Description |
| :--- | :--- |
| **Controllers** | REST Controllers Spring avec annotations OpenAPI |
| **Services** | Services Spring avec gestion transactionnelle |
| **Clients API** | WebClient avec retry, timeout et circuit-breaker |
| **DTOs** | Request/Response DTOs avec validation Jakarta |
| **Repositories** | Spring Data JPA Repositories |
| **Kafka** | Producers/Consumers Kafka pour JMS/MQ |
| **Batch** | Jobs Spring Batch pour les traitements en masse |
| **Domain Events** | Événements de domaine avec ApplicationEventPublisher |
| **Exceptions** | GlobalExceptionHandler + exceptions personnalisées |
| **Configuration** | `application.yml`, `pom.xml`, Dockerfile |
| **Tests** | Tests unitaires JUnit 5 + Mockito |

---

## 10. Onglet Technologies

L'onglet "Technologies" affiche une cartographie visuelle de toutes les technologies legacy détectées dans le code analysé. Chaque technologie est présentée avec un badge de couleur, le nombre d'occurrences et les lignes de code concernées.

---

## 11. Onglet Microservices

L'onglet "Microservices" affiche les résultats du moteur d'extraction de microservices. Il propose une décomposition du monolithe en microservices basée sur l'analyse des dépendances et les bounded contexts détectés (DDD).

Pour chaque microservice proposé, l'outil affiche :
- Le nom et le domaine fonctionnel
- Les APIs REST exposées
- Les événements de domaine publiés/consommés
- Les data stores recommandés
- Le niveau de couplage avec les autres services

---

## 12. Onglet Cloud

L'onglet "Cloud" affiche les artefacts cloud-native générés pour le déploiement des microservices :

| Artefact | Description |
| :--- | :--- |
| **Dockerfile** | Image multi-stage optimisée (build + runtime) |
| **Kubernetes Deployment** | Manifest de déploiement avec probes et resources |
| **Kubernetes Service** | Service ClusterIP pour l'exposition interne |
| **ConfigMap** | Configuration externalisée |
| **HPA** | Autoscaling horizontal basé sur CPU/mémoire |
| **Helm Chart** | Chart paramétrable avec `values.yaml` |
| **API Gateway** | Spring Cloud Gateway avec rate limiting |
| **SecurityConfig** | OAuth2 + OpenID Connect (Keycloak, Azure AD) |
| **Observabilité** | Prometheus, Grafana dashboards, ELK Stack |
| **Docker Compose** | Stack complète pour le développement local |
| **CI/CD** | Pipeline GitHub Actions (build, test, deploy) |

---

## 13. Moteur IA interne

Le moteur IA est **100% déterministe** et basé sur **55+ règles codées en dur** issues de 7 sources industrielles. Il n'utilise aucun modèle de langage (LLM), aucune API externe, et ne génère aucun texte libre. Chaque suggestion est traçable à une règle précise avec un identifiant unique.

### 13.1 Sources des règles

| Source | Catégorie | Nombre de règles |
| :--- | :--- | :--- |
| **OWASP** | Sécurité (injection SQL, XSS, CSRF, secrets, crypto) | 8+ |
| **SonarQube** | Code smells, bugs, vulnérabilités, dette technique | 10+ |
| **SOLID** | SRP, OCP, LSP, ISP, DIP | 5 |
| **Clean Code** | Nommage, méthodes longues, God classes, complexité | 8+ |
| **PMD** | Règles industrielles Java | 8+ |
| **SpotBugs** | Détection de bugs potentiels | 6+ |
| **Checkstyle** | Conventions de codage Java | 6+ |
| **Refactoring Guru** | Anti-patterns et code smells | 4+ |

### 13.2 Scores de qualité

L'onglet IA affiche deux scores sur 100 :

**Score Legacy** : Évalue la qualité du code legacy original. Le score est calculé en pondérant 6 critères : maintenabilité, sécurité, performance, résilience, testabilité et lisibilité.

**Score Modernisé** : Évalue la qualité du code généré. Ce score est toujours supérieur au score legacy car le code généré applique automatiquement les bonnes pratiques.

### 13.3 Métriques du moteur de règles

L'onglet IA affiche les métriques suivantes :

| Métrique | Description |
| :--- | :--- |
| **Règles totales** | Nombre total de règles dans le moteur (55+) |
| **Règles déclenchées** | Nombre de règles ayant détecté une violation |
| **Règles conformes** | Nombre de règles sans violation |
| **Répartition par catégorie** | Nombre de violations par source (OWASP, SonarQube, etc.) |

### 13.4 Optimisations

Le moteur IA vérifie et recommande 6 optimisations clés :

| Optimisation | Description |
| :--- | :--- |
| **Retry** | Mécanisme de retry automatique (Resilience4j) |
| **Circuit-Breaker** | Protection contre les cascades de pannes |
| **Timeout** | Limitation du temps d'attente des appels |
| **Logging** | Journalisation structurée (SLF4J/Logback) |
| **Error-Handling** | Gestion centralisée des erreurs |
| **Cache** | Mise en cache des résultats fréquents |

### 13.5 Suggestions

Chaque suggestion inclut :
- Un identifiant de règle traçable (ex: `OWASP-001`, `SOLID-SRP`, `PMD-007`)
- La sévérité (erreur, avertissement, info)
- Le numéro de ligne concerné
- La description du problème
- La référence à la source (lien vers la documentation OWASP, SonarQube, etc.)
- L'impact estimé

---

## 14. Export PDF du rapport IA

Le bouton **"Exporter le rapport IA en PDF"** (style amber) est disponible en bas de l'onglet IA Interne. Il génère un document PDF professionnel contenant :

- En-tête avec le nom de l'auteur (Hamza NORDINE) et la date
- Résumé exécutif (fichiers analysés, services détectés, technologies)
- Métriques du moteur de règles (total, déclenchées, conformes, par catégorie)
- Scores de qualité (Legacy vs Modernisé) avec détail par critère
- Liste des optimisations avec statut (appliquée/recommandée)
- Liste complète des suggestions avec sévérité, ligne et règle
- Risques identifiés et métriques de complexité

Le PDF est généré entièrement côté client via jsPDF. Aucune donnée n'est envoyée à un serveur.

---

## 15. Export ZIP Maven

Le bouton **"ZIP Maven"** (violet) dans la barre d'outils génère une archive ZIP contenant un projet Maven complet prêt à compiler :

```
modernized-project/
├── pom.xml                          # Dépendances Spring Boot 3.3
├── Dockerfile                       # Image multi-stage
├── .gitignore
├── README.md
├── src/
│   ├── main/
│   │   ├── java/com/bank/modern/
│   │   │   ├── controller/          # REST Controllers
│   │   │   ├── service/             # Services Spring
│   │   │   ├── client/              # WebClient API Clients
│   │   │   ├── dto/                 # Request/Response DTOs
│   │   │   ├── repository/          # Spring Data JPA
│   │   │   ├── event/               # Domain Events
│   │   │   ├── exception/           # Exception handlers
│   │   │   └── config/              # Configuration classes
│   │   └── resources/
│   │       └── application.yml      # Configuration Spring
│   └── test/java/                   # Tests JUnit 5
└── docs/
    └── analysis-report.md           # Rapport d'analyse
```

Pour compiler le projet généré :

```bash
unzip modernized-project.zip
cd modernized-project
mvn clean compile
```

---

## 16. Domain Events

L'outil génère automatiquement des **événements de domaine** (Domain Events) pour chaque service détecté. Les Domain Events permettent la communication asynchrone entre microservices via Spring `ApplicationEventPublisher` ou Kafka.

Pour chaque service, deux fichiers sont générés :

**`{Service}DomainEvent.java`** : Classe abstraite avec les événements concrets `CreatedEvent`, `UpdatedEvent` et `DeletedEvent`. Chaque événement contient un `eventId` (UUID), un `eventType`, un `occurredAt` (timestamp) et un `aggregateId`.

**`{Service}EventPublisher.java`** : Composant Spring qui publie les événements via `ApplicationEventPublisher`. Il peut être étendu pour publier sur Kafka pour la communication inter-services.

---

## 17. Sécurité OAuth2 + OpenID Connect

L'onglet Cloud génère une configuration de sécurité complète supportant OAuth2 Resource Server avec JWT et OpenID Connect (OIDC). La configuration inclut :

- **OAuth2 Resource Server** : Validation des tokens JWT pour les endpoints protégés
- **OpenID Connect Discovery** : Auto-configuration via le endpoint `.well-known/openid-configuration`
- **OIDC Logout** : RP-Initiated Logout avec redirection vers le provider (Keycloak, Azure AD, Okta)
- **ClientRegistrationRepository** : Gestion des clients OIDC enregistrés
- **JwtAuthenticationConverter** : Extraction des rôles depuis les claims JWT

La configuration est compatible avec les providers OIDC majeurs : Keycloak, Azure AD, Okta, Auth0.

---

## 18. Comprendre le rapport d'analyse

Le rapport d'analyse est affiché dans l'onglet "Rapport" et inclus dans l'export ZIP Maven. Il contient les sections suivantes :

| Section | Contenu |
| :--- | :--- |
| **Résumé** | Nom de la classe, technologies détectées, nombre de services |
| **Technologies** | Liste détaillée des technologies legacy avec occurrences |
| **Injections détectées** | Liste des `@EJB`, `@Inject`, JNDI lookups avec lignes |
| **Appels de méthodes** | Méthodes appelées sur les services injectés |
| **Dépendances** | Graphe des dépendances inter-services |
| **Mapping REST** | Correspondance proposée entre méthodes legacy et endpoints REST |
| **Avertissements** | Éléments nécessitant une attention manuelle (JMS, transactions distribuées) |

---

## 19. Exemples de transformation

### 19.1 EJB Client → WebClient

**Code legacy** :

```java
@EJB
private AccountService accountService;

public void processPayment(String accountId) {
    Account account = accountService.getAccount(accountId);
    accountService.debit(accountId, amount);
}
```

**Code moderne** :

```java
@Service
@Slf4j
@RequiredArgsConstructor
public class AccountApiClient {
    private final WebClient webClient;
    private static final Duration TIMEOUT = Duration.ofSeconds(30);

    public GetAccountResponseDTO getAccount(Object request) {
        log.info("Appel GET /api/v1/accounts");
        return webClient.post()
                .uri("/api/v1/accounts")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(GetAccountResponseDTO.class)
                .timeout(TIMEOUT)
                .block();
    }
}
```

### 19.2 Servlet → REST Controller

**Code legacy** :

```java
public class AccountServlet extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) {
        String id = req.getParameter("id");
        // ...
    }
}
```

**Code moderne** :

```java
@RestController
@RequestMapping("/api/v1/accounts")
@Tag(name = "Account", description = "API Account")
public class AccountController {
    @GetMapping("/{id}")
    public ResponseEntity<AccountDTO> getById(@PathVariable String id) {
        // ...
    }
}
```

### 19.3 SOAP → REST

**Code legacy** :

```java
@WebService
public class PaymentWebService {
    @WebMethod
    public PaymentResult processPayment(PaymentRequest request) { ... }
}
```

**Code moderne** :

```java
@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {
    @PostMapping("/process")
    @Operation(summary = "Process payment")
    public ResponseEntity<PaymentResultDTO> processPayment(@RequestBody PaymentRequestDTO request) { ... }
}
```

---

## 20. FAQ et dépannage

**Q : L'outil modifie-t-il mon code source original ?**
R : Non. L'outil fonctionne en lecture seule sur le code legacy. Il génère un nouveau projet séparé.

**Q : Mon code quitte-t-il mon poste de travail ?**
R : Non. L'ensemble de l'analyse s'exécute entièrement dans votre navigateur (côté client). Aucune donnée n'est envoyée à un serveur externe.

**Q : Quelles technologies sont détectées ?**
R : L'outil détecte 10 familles de technologies : EJB, Servlets, JSP, Struts, SOAP, JDBC, Hibernate, JMS/MQ, Batch et Transactions.

**Q : Le code généré est-il prêt pour la production ?**
R : Le code généré constitue une base solide respectant les bonnes pratiques enterprise. Il est recommandé d'ajuster les DTOs avec les types réels de votre domaine et de compléter les tests avant le déploiement.

**Q : Comment fonctionne le moteur IA ?**
R : Le moteur IA est 100% déterministe, basé sur 55+ règles codées en dur issues de 7 sources industrielles (OWASP, SonarQube, SOLID, Clean Code, PMD, SpotBugs, Checkstyle). Il n'utilise aucun LLM et ne génère aucune hallucination.

**Q : L'archive ZIP est-elle compilable directement ?**
R : Oui. L'archive contient un `pom.xml` complet. Exécutez `mvn clean compile` pour compiler.

**Q : Puis-je utiliser l'outil hors ligne ?**
R : Oui, si vous exécutez l'outil en local (`pnpm dev`). Aucune connexion internet n'est nécessaire.

**Q : Comment exporter le rapport IA en PDF ?**
R : Cliquez sur le bouton "Exporter le rapport IA en PDF" dans l'onglet IA Interne. Le PDF est généré côté client.

---

*Java Legacy Modernizer Platform v3.0 — Développé par Hamza NORDINE*
