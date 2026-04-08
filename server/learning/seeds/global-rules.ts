/**
 * 50 Règles globales de seed pour le moteur d'apprentissage.
 *
 * Ces règles représentent les patterns les plus courants dans les projets
 * Java legacy (EJB, Servlets, JSP, Struts, SOAP, JDBC, Hibernate, JMS, Batch).
 *
 * Chaque règle a une confiance initiale de 0.85 (seuil d'auto-résolution)
 * et un occurrenceCount de 5 (minimum pour auto-résolution).
 *
 * @author Hamza NORDINE
 */

import type { InsertLearningRule } from "../../../drizzle/schema";

const GLOBAL_TENANT = "global";
const SEED_CONFIDENCE = 0.85;
const SEED_OCCURRENCES = 5;

export const globalSeedRules: InsertLearningRule[] = [
  // ═══════════════════════════════════════════════════════════════
  // HTTP VERB AMBIGUOUS — 15 règles
  // ═══════════════════════════════════════════════════════════════

  // 1. Classe *UC + méthode execute → POST
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternClassName: ".*UC$",
    patternMethodName: "^execute$",
    chosenOption: "POST",
    chosenReason: "Les Use Cases (UC) avec execute() sont des opérations métier → POST",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 2. Méthode get* → GET
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^get.*",
    chosenOption: "GET",
    chosenReason: "Les méthodes get* sont des lectures → GET",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // TRANSACTION_AMBIGUOUS — 5 règles
  // ═══════════════════════════════════════════════════════════════

  // T1. Classe *UC + execute → @Transactional (readWrite)
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "TRANSACTION_AMBIGUOUS",
    patternClassName: ".*UC$",
    patternMethodName: "^execute$",
    chosenOption: "A",
    chosenReason: "Les Use Cases d'écriture bancaires nécessitent une transaction complète avec rollback",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // T2. Classe *Maj* → @Transactional (readWrite)
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "TRANSACTION_AMBIGUOUS",
    patternClassName: ".*Maj.*",
    chosenOption: "A",
    chosenReason: "Les mises à jour (Maj) sont des opérations d'écriture → transaction complète",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // T3. Classe *Envoyer* → @Transactional (readWrite)
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "TRANSACTION_AMBIGUOUS",
    patternClassName: ".*Envoyer.*",
    chosenOption: "A",
    chosenReason: "L'envoi de notifications/messages est une opération d'écriture",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // T4. Classe *Generer* → @Transactional (readWrite)
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "TRANSACTION_AMBIGUOUS",
    patternClassName: ".*Generer.*",
    chosenOption: "A",
    chosenReason: "La génération de documents est une opération d'écriture",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // T5. Classe *Simuler* → Pas de transaction
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "TRANSACTION_AMBIGUOUS",
    patternClassName: ".*Simuler.*",
    chosenOption: "C",
    chosenReason: "Les simulations sont des calculs sans effet de bord",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // URL_STRUCTURE_AMBIGUOUS — 5 règles
  // ═══════════════════════════════════════════════════════════════

  // U1. Classe *Activer* → /resource/{id}/action
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "URL_STRUCTURE_AMBIGUOUS",
    patternClassName: ".*Activer.*",
    chosenOption: "A",
    chosenReason: "Les opérations d'activation utilisent le pattern REST /resource/{id}/action",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // U2. Classe *Bloquer* → /resource/{id}/action
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "URL_STRUCTURE_AMBIGUOUS",
    patternClassName: ".*Bloquer.*",
    chosenOption: "A",
    chosenReason: "Les opérations de blocage utilisent le pattern REST /resource/{id}/action",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // U3. Classe *Charger* → /resource/{id}/action
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "URL_STRUCTURE_AMBIGUOUS",
    patternClassName: ".*Charger.*",
    chosenOption: "A",
    chosenReason: "Le chargement de données utilise le pattern REST /resource/{id}/action",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // U4. Classe *Valider* → /resource/{id}/action
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "URL_STRUCTURE_AMBIGUOUS",
    patternClassName: ".*Valider.*",
    chosenOption: "A",
    chosenReason: "Les validations utilisent le pattern REST /resource/{id}/action",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // U5. Classe *Annuler* → /resource/{id}/action
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "URL_STRUCTURE_AMBIGUOUS",
    patternClassName: ".*Annuler.*",
    chosenOption: "A",
    chosenReason: "Les annulations utilisent le pattern REST /resource/{id}/action",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 3. Méthode find* → GET
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^find.*",
    chosenOption: "GET",
    chosenReason: "Les méthodes find* sont des recherches → GET",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 4. Méthode list* → GET
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^list.*",
    chosenOption: "GET",
    chosenReason: "Les méthodes list* sont des lectures de collections → GET",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 5. Méthode create* → POST
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^create.*",
    chosenOption: "POST",
    chosenReason: "Les méthodes create* sont des créations → POST",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 6. Méthode update* → PUT
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^update.*",
    chosenOption: "PUT",
    chosenReason: "Les méthodes update* sont des mises à jour complètes → PUT",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 7. Méthode delete* → DELETE
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^delete.*",
    chosenOption: "DELETE",
    chosenReason: "Les méthodes delete* sont des suppressions → DELETE",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 8. Méthode remove* → DELETE
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^remove.*",
    chosenOption: "DELETE",
    chosenReason: "Les méthodes remove* sont des suppressions → DELETE",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 9. Méthode save* → POST
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^save.*",
    chosenOption: "POST",
    chosenReason: "Les méthodes save* sont des opérations de persistance → POST",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 10. Méthode search* → GET
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^search.*",
    chosenOption: "GET",
    chosenReason: "Les méthodes search* sont des recherches → GET",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 11. Classe *Action + doPost → POST
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternClassName: ".*Action$",
    patternMethodName: "^(doPost|execute)$",
    chosenOption: "POST",
    chosenReason: "Les Struts Actions avec doPost/execute sont des opérations → POST",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 12. Classe *Servlet + doGet → GET
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternClassName: ".*Servlet$",
    patternMethodName: "^doGet$",
    chosenOption: "GET",
    chosenReason: "Les Servlets avec doGet sont des lectures → GET",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 13. Méthode traiter* → POST
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^traiter.*",
    chosenOption: "POST",
    chosenReason: "Les méthodes traiter* sont des traitements métier → POST",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 14. Méthode valider* → POST
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^valider.*",
    chosenOption: "POST",
    chosenReason: "Les méthodes valider* sont des validations métier → POST",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 15. Méthode consulter* → GET
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "HTTP_VERB_AMBIGUOUS",
    patternMethodName: "^consulter.*",
    chosenOption: "GET",
    chosenReason: "Les méthodes consulter* sont des consultations → GET",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // SCOPE_UNCLEAR — 10 règles
  // ═══════════════════════════════════════════════════════════════

  // 16. Package *usecases* → MICROSERVICE
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternPackage: ".*usecases.*",
    chosenOption: "MICROSERVICE",
    chosenReason: "Les use cases dans un package dédié → microservice autonome",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 17. Package *common* → SHARED_LIB
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternPackage: ".*common.*",
    chosenOption: "SHARED_LIB",
    chosenReason: "Les packages common sont des bibliothèques partagées",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 18. Package *utils* → SHARED_LIB
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternPackage: ".*utils.*",
    chosenOption: "SHARED_LIB",
    chosenReason: "Les packages utils sont des bibliothèques partagées",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 19. Classe *Service → MICROSERVICE
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternClassName: ".*Service$",
    chosenOption: "MICROSERVICE",
    chosenReason: "Les classes Service sont des candidats microservice",
    confidence: 0.75,
    occurrenceCount: 3,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 20. Classe *Facade → API_GATEWAY
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternClassName: ".*Facade$",
    chosenOption: "API_GATEWAY",
    chosenReason: "Les Facades sont des points d'entrée → API Gateway",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 21. Package *domain* → MICROSERVICE
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternPackage: ".*domain.*",
    chosenOption: "MICROSERVICE",
    chosenReason: "Les packages domain contiennent la logique métier → microservice",
    confidence: 0.80,
    occurrenceCount: 4,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 22. Package *batch* → BATCH_SERVICE
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternPackage: ".*batch.*",
    chosenOption: "BATCH_SERVICE",
    chosenReason: "Les packages batch sont des traitements par lots → service batch",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 23. Package *jms* → EVENT_SERVICE
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternPackage: ".*jms.*",
    chosenOption: "EVENT_SERVICE",
    chosenReason: "Les packages JMS sont des services événementiels",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 24. Package *soap* → API_ADAPTER
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternPackage: ".*soap.*",
    chosenOption: "API_ADAPTER",
    chosenReason: "Les packages SOAP sont des adaptateurs d'API legacy",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 25. Classe *DAO → DATA_SERVICE
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SCOPE_UNCLEAR",
    patternClassName: ".*DAO$",
    chosenOption: "DATA_SERVICE",
    chosenReason: "Les DAOs sont des couches d'accès aux données → service de données",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // NAMING_CONVENTION — 8 règles
  // ═══════════════════════════════════════════════════════════════

  // 26. Classe *Bean → *Service
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "NAMING_CONVENTION",
    patternClassName: ".*Bean$",
    chosenOption: "RENAME_SERVICE",
    chosenReason: "Les EJB Beans deviennent des Services Spring → renommer *Bean en *Service",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 27. Classe *EJB → *Service
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "NAMING_CONVENTION",
    patternClassName: ".*EJB$",
    chosenOption: "RENAME_SERVICE",
    chosenReason: "Les classes EJB deviennent des Services → renommer *EJB en *Service",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 28. Classe *Impl → garder
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "NAMING_CONVENTION",
    patternClassName: ".*Impl$",
    chosenOption: "KEEP_NAME",
    chosenReason: "Les classes *Impl suivent le pattern interface/implémentation → garder",
    confidence: 0.75,
    occurrenceCount: 3,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 29. Classe *VO → *DTO
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "NAMING_CONVENTION",
    patternClassName: ".*VO$",
    chosenOption: "RENAME_DTO",
    chosenReason: "Les Value Objects (VO) deviennent des DTOs → renommer *VO en *DTO",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 30. Classe *VoIn → *RequestDTO
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "NAMING_CONVENTION",
    patternClassName: ".*VoIn$",
    chosenOption: "RENAME_REQUEST_DTO",
    chosenReason: "Les VoIn (input) deviennent des RequestDTO",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 31. Classe *VoOut → *ResponseDTO
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "NAMING_CONVENTION",
    patternClassName: ".*VoOut$",
    chosenOption: "RENAME_RESPONSE_DTO",
    chosenReason: "Les VoOut (output) deviennent des ResponseDTO",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 32. Classe *Helper → *Utils
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "NAMING_CONVENTION",
    patternClassName: ".*Helper$",
    chosenOption: "RENAME_UTILS",
    chosenReason: "Les Helpers deviennent des Utils → convention moderne",
    confidence: 0.70,
    occurrenceCount: 3,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 33. Classe *Manager → *Service
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "NAMING_CONVENTION",
    patternClassName: ".*Manager$",
    chosenOption: "RENAME_SERVICE",
    chosenReason: "Les Managers deviennent des Services → convention Spring",
    confidence: 0.80,
    occurrenceCount: 4,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // DEPENDENCY_REPLACEMENT — 10 règles
  // ═══════════════════════════════════════════════════════════════

  // 34. EJB @Stateless → Spring @Service
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternAnnotations: "@Stateless",
    chosenOption: "SPRING_SERVICE",
    chosenReason: "@Stateless EJB → @Service Spring Boot",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 35. EJB @Stateful → Spring @Component + @Scope("session")
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternAnnotations: "@Stateful",
    chosenOption: "SPRING_SESSION_SCOPED",
    chosenReason: "@Stateful EJB → @Component @Scope(\"session\") Spring",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 36. EJB @Singleton → Spring @Component + @Scope("singleton")
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternAnnotations: "@Singleton",
    chosenOption: "SPRING_SINGLETON",
    chosenReason: "@Singleton EJB → @Component (singleton par défaut en Spring)",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 37. @MessageDriven → Spring @JmsListener
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternAnnotations: "@MessageDriven",
    chosenOption: "SPRING_JMS_LISTENER",
    chosenReason: "@MessageDriven EJB → @JmsListener Spring",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 38. @WebService → Spring @RestController
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternAnnotations: "@WebService",
    chosenOption: "SPRING_REST_CONTROLLER",
    chosenReason: "@WebService SOAP → @RestController Spring",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 39. @WebServlet → Spring @Controller
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternAnnotations: "@WebServlet",
    chosenOption: "SPRING_CONTROLLER",
    chosenReason: "@WebServlet → @Controller Spring MVC",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 40. Hibernate Session → Spring Data JPA
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternPackage: ".*hibernate.*",
    chosenOption: "SPRING_DATA_JPA",
    chosenReason: "Hibernate Session directe → Spring Data JPA Repository",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 41. JDBC direct → Spring JdbcTemplate
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternPackage: ".*jdbc.*",
    chosenOption: "SPRING_JDBC_TEMPLATE",
    chosenReason: "JDBC direct → Spring JdbcTemplate",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 42. Struts Action → Spring @Controller
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternClassName: ".*Action$",
    patternPackage: ".*struts.*",
    chosenOption: "SPRING_CONTROLLER",
    chosenReason: "Struts Action → Spring @Controller",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 43. JSP → Thymeleaf ou API REST
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "DEPENDENCY_REPLACEMENT",
    patternPackage: ".*jsp.*",
    chosenOption: "REST_API_FRONTEND",
    chosenReason: "JSP → API REST + frontend séparé (React/Angular)",
    confidence: 0.80,
    occurrenceCount: 4,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // TRANSACTION_BOUNDARY — 4 règles
  // ═══════════════════════════════════════════════════════════════

  // 44. @TransactionAttribute(REQUIRED) → @Transactional
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "TRANSACTION_BOUNDARY",
    patternAnnotations: "@TransactionAttribute",
    chosenOption: "SPRING_TRANSACTIONAL",
    chosenReason: "EJB @TransactionAttribute → Spring @Transactional",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 45. UserTransaction → @Transactional(propagation=REQUIRES_NEW)
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "TRANSACTION_BOUNDARY",
    patternClassName: ".*UserTransaction.*",
    chosenOption: "SPRING_TRANSACTIONAL_NEW",
    chosenReason: "UserTransaction manuelle → @Transactional(propagation=REQUIRES_NEW)",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 46. Méthode avec try/catch + rollback → @Transactional(rollbackFor)
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "TRANSACTION_BOUNDARY",
    patternJavadoc: "rollback|transaction|commit",
    chosenOption: "SPRING_TRANSACTIONAL_ROLLBACK",
    chosenReason: "Gestion manuelle des transactions → @Transactional(rollbackFor=Exception.class)",
    confidence: 0.75,
    occurrenceCount: 3,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 47. Batch avec transaction → @Transactional + chunk processing
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "TRANSACTION_BOUNDARY",
    patternPackage: ".*batch.*",
    patternJavadoc: "traitement|batch|lot",
    chosenOption: "SPRING_BATCH_CHUNK",
    chosenReason: "Batch avec transactions → Spring Batch chunk processing",
    confidence: 0.80,
    occurrenceCount: 4,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // SECURITY_PATTERN — 3 règles
  // ═══════════════════════════════════════════════════════════════

  // 48. @RolesAllowed → Spring @PreAuthorize
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SECURITY_PATTERN",
    patternAnnotations: "@RolesAllowed",
    chosenOption: "SPRING_SECURITY_PREAUTHORIZE",
    chosenReason: "EJB @RolesAllowed → Spring Security @PreAuthorize",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 49. @RunAs → Spring @Secured
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SECURITY_PATTERN",
    patternAnnotations: "@RunAs",
    chosenOption: "SPRING_SECURITY_SECURED",
    chosenReason: "EJB @RunAs → Spring Security @Secured",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },

  // 50. JAAS LoginModule → Spring Security AuthenticationProvider
  {
    tenantId: GLOBAL_TENANT,
    ruleType: "SECURITY_PATTERN",
    patternClassName: ".*LoginModule$",
    chosenOption: "SPRING_AUTH_PROVIDER",
    chosenReason: "JAAS LoginModule → Spring Security AuthenticationProvider",
    confidence: SEED_CONFIDENCE,
    occurrenceCount: SEED_OCCURRENCES,
    isActive: true,
    sourceProject: "seed",
    confirmedByUser: false,
  },
];
