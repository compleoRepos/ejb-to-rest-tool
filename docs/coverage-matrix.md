# Matrice de couverture technologique — Compleo v3.0

> Auteur : Hamza NORDINE — Version 3.0.0

## Vue d'ensemble

Compleo v3.0 couvre l'intégralité du spectre Java legacy rencontré dans les systèmes d'information bancaires et assurantiels. Chaque technologie détectée génère du code Spring Boot moderne, testé et compilable.

## TIER 1 — Core Java EE (priorité maximale)

| Technologie | Patterns détectés | Output généré |
|---|---|---|
| **EJB 3.x Stateless** | `@Stateless`, `@Local`, `@Remote` | `@Service` + `@RestController` |
| **EJB 3.x Stateful** | `@Stateful` | `@Service` + `@Scope("session")` |
| **EJB 3.x Singleton** | `@Singleton` | `@Service` + `@Scope("singleton")` |
| **EJB 3.x MDB** | `@MessageDriven` | `@KafkaListener` |
| **EJB 2.x** | `ejbCreate()`, `ejbRemove()`, Home/Remote interfaces, `ejb-jar.xml` | `@Service` Spring + `@Bean` lifecycle |
| **Servlet** | `HttpServlet`, `doGet`/`doPost`, `@WebServlet`, `web.xml` | `@RestController` + `@GetMapping`/`@PostMapping` |
| **JSP** | `<jsp:useBean>`, scriptlets `<% %>`, JSTL `<c:forEach>`, EL `${expr}` | `@RestController` JSON + note frontend React |
| **Struts 1/2** | `Action.execute()`, `ActionForm`, `struts-config.xml`, `ActionSupport` | `@Controller` + `@Valid` DTO + `BindingResult` |
| **SOAP / JAX-WS** | `@WebService`, `@WebMethod`, `SOAPMessage`, WSDL | `@RestController` OpenAPI + adapter WSDL |
| **JDBC raw** | `DriverManager`, `PreparedStatement`, `ResultSet` | `@Entity` + `@Repository` Spring Data JPA |
| **Hibernate 3/4** | `SessionFactory`, HQL, Criteria API, `.hbm.xml` | Spring Data JPA + `Specification` pattern |
| **JMS** | `ConnectionFactory`, `MessageProducer`, `MessageListener`, `@MessageDriven` | `@KafkaListener` + `KafkaTemplate` + docker-compose Kafka |
| **Java Batch (JSR-352)** | `ItemReader`, `ItemWriter`, `@BatchProperty`, `JobOperator` | `@StepScope` Spring Batch + `JobLauncher` config |
| **JPA** | `EntityManager`, `@PersistenceContext`, `CriteriaBuilder` | Spring Data JPA (upgrade/clean) |
| **JAX-RS** | `@Path`, `@GET`/`@POST`, `@PathParam`, `@QueryParam`, `@Produces` | `@RestController` (mapping direct) + OpenAPI |
| **EAI / ESB custom** | `BaseUseCase`, `VoIn`/`VoOut`, `MagixService` | `@Service` + `@RestController` + `ServiceAdapter` stub |

## TIER 2 — Technologies fréquentes en banque/assurance

| Technologie | Mapping cible |
|---|---|
| **RMI** | REST `WebClient` adapter |
| **Corba IDL** | REST stub + note de migration |
| **XML / JAXB** | Jackson JSON équivalent |
| **Properties files** | `application.yml` |
| **Log4j / JUL** | Logback / SLF4J |
| **EhCache** | Spring Cache + Redis config |
| **Quartz Scheduler** | Spring `@Scheduled` |

## Architecture du moteur

Le moteur utilise le pattern **Registry + Strategy** pour supporter N technologies extensibles sans modifier le code existant à chaque ajout.

Chaque technologie est composée de :
- **1 Detector** : analyse le code source et produit un IR (Intermediate Representation)
- **1 Generator** : consomme l'IR et produit les fichiers Spring Boot

Ajouter une technologie = créer 2 fichiers + les enregistrer dans le Registry.

## Projets de test

| Projet | Technologie | Scénario |
|---|---|---|
| `tech-01-servlet` | Servlet + JSP | Portail agence BNP (CRUD, session, web.xml) |
| `tech-02-ejb2x` | EJB 2.x | Module virement Crédit Agricole (Home/Remote/Bean) |
| `tech-03-struts` | Struts 1 | Déclaration sinistre Wafa Assurance (ActionForm, validation) |
| `tech-04-soap` | SOAP / JAX-WS | Consultation compte SGMB (WSDL, @WebMethod) |
| `tech-05-jdbc-hibernate` | JDBC + Hibernate | Module épargne CIH Bank (PreparedStatement, HQL) |
| `tech-06-jms-batch` | JMS + Batch | Traitement batch nuit Attijariwafa (ItemReader/Writer, MDB) |
