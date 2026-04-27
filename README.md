# Java Legacy Modernizer Platform

**Auteur : Compleo**

Plateforme web complète de modernisation de code Java legacy vers des architectures Spring Boot 3 / Cloud-Native / Microservices.

---

## Fonctionnalités

### Analyse multi-technologies
- **EJB** : `@EJB`, `@Stateless`, `@Stateful`, `@Remote`, `@Local`, JNDI lookups, `InitialContext`
- **Servlets** : `HttpServlet`, `@WebServlet`, `doGet/doPost`, `HttpServletRequest/Response`
- **JSP** : Scriptlets `<% %>`, directives, taglibs, JSTL
- **Struts** : `ActionForm`, `ActionForward`, `struts-config.xml`, `DispatchAction`
- **SOAP** : `@WebService`, `@WebMethod`, `@SOAPBinding`, WSDL, `javax.xml.ws`
- **JDBC** : `DriverManager`, `PreparedStatement`, `ResultSet`, `Connection`
- **Hibernate** : `SessionFactory`, `HQL`, `Criteria`, `@Entity`, `Session.save/update`
- **JMS/MQ** : `@MessageDriven`, `JMSContext`, `Queue`, `Topic`, `MessageListener`
- **Batch** : `@Schedule`, `TimerService`, boucles de traitement en masse
- **Transactions** : `@TransactionAttribute`, `UserTransaction`, `BMT/CMT`

### Transformation automatique
| Technologie Legacy | Technologie Moderne |
|---|---|
| EJB Client (`@EJB`, JNDI) | Spring WebClient + Resilience4j |
| Servlets | Spring REST Controllers |
| Struts Actions | Spring MVC Controllers |
| SOAP Web Services | REST API + OpenAPI 3.0 |
| JDBC brut | Spring Data JPA + Repositories |
| Hibernate Session | Spring Data JPA |
| JMS/MQ | Spring Kafka + Event-Driven |
| Batch EJB Timer | Spring Batch |

### Moteur IA déterministe (55+ règles)
- **OWASP** : Injection SQL, XSS, CSRF, secrets en dur, crypto faible
- **SonarQube** : Code smells, bugs, vulnérabilités, dette technique
- **SOLID** : SRP, OCP, LSP, ISP, DIP
- **Clean Code** : Nommage, méthodes longues, classes God, complexité cyclomatique
- **PMD / SpotBugs / Checkstyle** : Règles industrielles Java
- **Refactoring Guru** : Anti-patterns, code smells, refactoring suggestions

### Extraction de microservices
- Graphe de dépendances entre services
- Détection de bounded contexts (DDD)
- Propositions de microservices avec APIs, events et data stores
- Matrice de dépendances et analyse de couplage

### Génération cloud-native
- **Docker** : Dockerfiles multi-stage optimisés
- **Kubernetes** : Deployments, Services, ConfigMaps, HPA
- **Helm Charts** : Charts paramétrables par microservice
- **API Gateway** : Spring Cloud Gateway avec rate limiting
- **Sécurité** : OAuth2 + OpenID Connect (Keycloak, Azure AD)
- **Observabilité** : Prometheus, Grafana, ELK Stack
- **CI/CD** : GitHub Actions pipelines
- **Domain Events** : Spring ApplicationEventPublisher + Kafka

### Export
- **ZIP Maven** : Projet Maven complet prêt à compiler (`mvn clean package`)
- **PDF** : Rapport d'analyse IA professionnel avec scores et recommandations

---

## Interface Web

L'interface utilise un design **Terminal Craft** (IDE-like) avec :
- **Panneau gauche** : Monaco Editor avec onglets multi-fichiers
- **Panneau droit** : 6 onglets (Code, Technologies, Microservices, Cloud, IA, Rapport)
- **Barre d'outils** : Upload fichier/dossier, projet entier, exemples, analyse, transformation
- **Barre de statut** : Métriques en temps réel

---

## Stack technique

| Composant | Technologie |
|---|---|
| Frontend | React 19 + TypeScript |
| Éditeur | Monaco Editor |
| UI | Tailwind CSS 4 + shadcn/ui |
| Analyse | Moteur TypeScript côté client (AST-like) |
| PDF | jsPDF |
| ZIP | JSZip + FileSaver |
| Animations | Framer Motion |

---

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/compleoRepos/ejb-client-modernizer.git
cd ejb-client-modernizer

# Installer les dépendances
pnpm install

# Lancer en développement
pnpm dev
```

L'application est accessible sur `http://localhost:3000`.

---

## Utilisation rapide

1. **Charger du code** : Coller du code Java legacy ou utiliser les exemples intégrés
2. **Analyser** : Cliquer sur "Analyser" pour détecter les technologies legacy
3. **Transformer** : Cliquer sur "Transformer" pour générer le code moderne
4. **Explorer** : Naviguer dans les onglets (Code, Technologies, Microservices, Cloud, IA)
5. **Exporter** : Télécharger le ZIP Maven ou le rapport PDF

Pour un projet entier, utiliser le bouton **"Projet entier"** pour charger un dossier complet.

---

## Documentation

| Document | Description |
|---|---|
| [Guide d'Utilisation](docs/Guide_Utilisation.md) | Manuel complet d'installation et d'utilisation |
| [Document d'Architecture](docs/Document_Architecture.md) | Architecture de modernisation pour DSI/CTO |
| [Plan d'Industrialisation](docs/Plan_Industrialisation.md) | Stratégie de migration de 350 services |
| [Roadmap](docs/Roadmap.md) | Feuille de route des évolutions futures |

---

## Licence

Projet propriétaire — Usage interne uniquement.

**Auteur : Compleo** | Compleo
