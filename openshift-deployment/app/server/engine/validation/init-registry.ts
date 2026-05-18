/**
 * init-registry.ts — Initialise le ProjectRegistry avec les projets de référence.
 *
 * Les projets REFERENCE sont les projets réels existants dans test-projects/.
 * Chaque projet a des assertions structurelles basées sur sa complexité connue.
 *
 * @since v8.7
 */

import { ProjectRegistry, type TestProject, type ProjectAssertion } from "./ProjectRegistry";

// ─── Projets de référence ───────────────────────────────────────────────────

const REFERENCE_PROJECTS: TestProject[] = [
  {
    id: "boa-realistic",
    name: "BOA Realistic EJB (activation-carte)",
    type: "REFERENCE",
    sourcePath: "test-projects/boa-realistic-ejb-project",
    testedPatterns: [
      "EJB_STATELESS",
      "JNDI_LOOKUP",
      "HIBERNATE",
      "JPA",
      "VALIDATION",
      "MULTI_MODULE",
      "HANDLER_PATTERN",
    ],
    assertions: [
      { type: "MIN_SERVICES", expected: 3, description: "Au moins 3 services Spring générés" },
      { type: "MIN_DTOS", expected: 5, description: "Au moins 5 DTOs générés" },
      { type: "MIN_CONTROLLERS", expected: 2, description: "Au moins 2 controllers REST" },
      { type: "PATTERN_ABSENT", expected: "InitialContext", description: "Pas de JNDI InitialContext dans le code généré" },
      { type: "PATTERN_ABSENT", expected: "EaiLog", description: "Pas de EaiLog dans le code généré" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Le projet doit compiler" },
    ],
    history: [],
  },
  {
    id: "projet1-ejb-bancaire",
    name: "Projet 1 — EJB Bancaire",
    type: "REFERENCE",
    sourcePath: "test-projects/projet1-ejb-bancaire",
    testedPatterns: ["EJB_STATELESS", "EJB_STATEFUL", "JNDI_LOOKUP", "DAO"],
    assertions: [
      { type: "MIN_SERVICES", expected: 2, description: "Au moins 2 services Spring" },
      { type: "MIN_DTOS", expected: 2, description: "Au moins 2 DTOs" },
      { type: "PATTERN_ABSENT", expected: "InitialContext", description: "Pas de JNDI" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    history: [],
  },
  {
    id: "projet2-servlet-jsp",
    name: "Projet 2 — Servlet/JSP",
    type: "REFERENCE",
    sourcePath: "test-projects/projet2-servlet-jsp",
    testedPatterns: ["SERVLET", "JSP", "HTTP_SESSION"],
    assertions: [
      { type: "MIN_CONTROLLERS", expected: 1, description: "Au moins 1 controller REST" },
      { type: "PATTERN_ABSENT", expected: "HttpServlet", description: "Pas de HttpServlet dans le code généré" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    history: [],
  },
  {
    id: "projet3-struts",
    name: "Projet 3 — Struts",
    type: "REFERENCE",
    sourcePath: "test-projects/projet3-struts",
    testedPatterns: ["STRUTS", "ACTION_FORM", "STRUTS_CONFIG"],
    assertions: [
      { type: "MIN_CONTROLLERS", expected: 1, description: "Au moins 1 controller REST" },
      { type: "PATTERN_ABSENT", expected: "ActionForm", description: "Pas de ActionForm Struts" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    history: [],
  },
  {
    id: "projet4-soap",
    name: "Projet 4 — SOAP WebService",
    type: "REFERENCE",
    sourcePath: "test-projects/projet4-soap-webservice",
    testedPatterns: ["SOAP", "WSDL", "JAX_WS"],
    assertions: [
      { type: "MIN_SERVICES", expected: 1, description: "Au moins 1 service Spring" },
      { type: "MIN_CONTROLLERS", expected: 1, description: "Au moins 1 controller REST" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    history: [],
  },
  {
    id: "projet5-jdbc",
    name: "Projet 5 — JDBC",
    type: "REFERENCE",
    sourcePath: "test-projects/projet5-jdbc",
    testedPatterns: ["JDBC", "DATASOURCE", "CONNECTION_POOL"],
    assertions: [
      { type: "MIN_SERVICES", expected: 1, description: "Au moins 1 service Spring" },
      { type: "PATTERN_ABSENT", expected: "DriverManager", description: "Pas de DriverManager JDBC" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    history: [],
  },
  {
    id: "projet6-hibernate",
    name: "Projet 6 — Hibernate",
    type: "REFERENCE",
    sourcePath: "test-projects/projet6-hibernate",
    testedPatterns: ["HIBERNATE", "HQL", "SESSION_FACTORY"],
    assertions: [
      { type: "MIN_SERVICES", expected: 1, description: "Au moins 1 service Spring" },
      { type: "PATTERN_ABSENT", expected: "SessionFactory", description: "Pas de SessionFactory Hibernate" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    history: [],
  },
  {
    id: "projet7-jms",
    name: "Projet 7 — JMS",
    type: "REFERENCE",
    sourcePath: "test-projects/projet7-jms",
    testedPatterns: ["JMS", "MESSAGE_DRIVEN_BEAN", "QUEUE"],
    assertions: [
      { type: "MIN_SERVICES", expected: 1, description: "Au moins 1 service Spring" },
      { type: "PATTERN_PRESENT", expected: "@JmsListener", description: "Présence de @JmsListener" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    history: [],
  },
  {
    id: "projet8-batch",
    name: "Projet 8 — Batch Bancaire",
    type: "REFERENCE",
    sourcePath: "test-projects/projet8-batch-bancaire",
    testedPatterns: ["BATCH", "SCHEDULED", "CRON"],
    assertions: [
      { type: "MIN_SERVICES", expected: 1, description: "Au moins 1 service Spring" },
      { type: "PATTERN_PRESENT", expected: "@Scheduled", description: "Présence de @Scheduled" },
      { type: "BUILD_SUCCESS", expected: 1, description: "Compilation réussie" },
    ],
    history: [],
  },
];

// ─── Initialisation ─────────────────────────────────────────────────────────

/**
 * Initialise le registre avec les projets de référence.
 * Si le registre a déjà été persisté, charge les données existantes
 * puis met à jour les définitions des projets de référence.
 */
export function initializeRegistry(
  persistPath?: string
): ProjectRegistry {
  const registry = new ProjectRegistry(persistPath);

  // Charger les données existantes (historique, résultats)
  registry.load();

  // Enregistrer/mettre à jour les projets de référence
  for (const project of REFERENCE_PROJECTS) {
    registry.register(project);
  }

  return registry;
}

/**
 * Retourne la liste des projets de référence (pour les tests).
 */
export function getReferenceProjects(): TestProject[] {
  return REFERENCE_PROJECTS.map((p) => ({ ...p }));
}
