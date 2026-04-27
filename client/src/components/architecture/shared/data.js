/**
 * data.js — Données centralisées BMCE Digital Banking.
 * LEGACY[] : modules Java EE legacy
 * SPRING[] : services Spring Boot cibles
 * FLUX[]   : relations inter-modules
 * RESOURCES[] : ressources partagées (DS, JMS, APIs)
 *
 * @author Compleo
 */

// ─── LEGACY MODULES ────────────────────────────────────────────────────────

export const LEGACY = [
  {
    id: "auth",
    name: "AuthenticationServlet",
    type: "Servlet",
    icon: "🔐",
    color: "#06b6d4",
    methods: [
      { name: "doPost()", visibility: "protected", lines: 85, desc: "Login LDAP + session creation" },
      { name: "doGet()", visibility: "protected", lines: 32, desc: "Session validation check" },
    ],
    sql: ["SELECT * FROM USERS WHERE login=?", "UPDATE USERS SET last_login=SYSDATE WHERE id=?"],
    tables: ["USERS", "SESSIONS", "AUDIT_LOG"],
    endpoints: [],
    adapters: [],
    calledBy: [],
    calls: ["SessionManagerBean"],
    criticite: "ÉLEVÉ",
    dureeEstimeeJH: 20,
    statutMigration: "EN_ATTENTE",
    phase: 4,
    springTarget: "auth-service",
    description: "Servlet d'authentification LDAP avec gestion de sessions HTTP.",
  },
  {
    id: "session",
    name: "SessionManagerBean",
    type: "EJB_3X_STATELESS",
    icon: "🔑",
    color: "#8b5cf6",
    methods: [
      { name: "createSession()", visibility: "public", lines: 45, desc: "Crée une session utilisateur" },
      { name: "validateSession()", visibility: "public", lines: 28, desc: "Valide un token de session" },
      { name: "invalidateSession()", visibility: "public", lines: 15, desc: "Détruit une session" },
    ],
    sql: ["INSERT INTO SESSIONS (token, user_id, created_at) VALUES (?,?,SYSDATE)", "DELETE FROM SESSIONS WHERE token=?"],
    tables: ["SESSIONS", "USERS"],
    endpoints: [],
    adapters: [],
    calledBy: ["auth"],
    calls: [],
    criticite: "CRITIQUE",
    dureeEstimeeJH: 15,
    statutMigration: "EN_ATTENTE",
    phase: 1,
    springTarget: "auth-service",
    description: "EJB Stateless de gestion des sessions. Aucune dépendance sortante EJB.",
  },
  {
    id: "compte",
    name: "CompteEJB",
    type: "EJB_3X_STATELESS",
    icon: "🏦",
    color: "#10b981",
    methods: [
      { name: "consulterSolde()", visibility: "public", lines: 62, desc: "Retourne le solde d'un compte" },
      { name: "consulterHistorique()", visibility: "public", lines: 95, desc: "Historique des mouvements" },
      { name: "debiter()", visibility: "public", lines: 48, desc: "Débit avec FOR UPDATE NOWAIT" },
      { name: "crediter()", visibility: "public", lines: 42, desc: "Crédit avec vérification plafond" },
    ],
    sql: [
      "SELECT solde FROM COMPTES WHERE id=? FOR UPDATE NOWAIT",
      "SELECT * FROM MOUVEMENTS WHERE compte_id=? ORDER BY date_op DESC",
      "UPDATE COMPTES SET solde=solde-? WHERE id=?",
      "INSERT INTO MOUVEMENTS (compte_id, montant, type, date_op) VALUES (?,?,?,SYSDATE)",
    ],
    tables: ["COMPTES", "MOUVEMENTS", "PLAFONDS"],
    endpoints: [],
    adapters: [],
    calledBy: ["virement"],
    calls: ["CarteEJB"],
    criticite: "CRITIQUE",
    dureeEstimeeJH: 45,
    statutMigration: "EN_ATTENTE",
    phase: 3,
    springTarget: "compte-service",
    description: "EJB central de gestion des comptes bancaires. FOR UPDATE NOWAIT pour les débits.",
  },
  {
    id: "virement",
    name: "VirementEJB",
    type: "EJB_3X_STATELESS",
    icon: "💸",
    color: "#f97316",
    methods: [
      { name: "initierVirement()", visibility: "public", lines: 120, desc: "Orchestre un virement national" },
      { name: "initierVirementInternational()", visibility: "public", lines: 180, desc: "Virement SWIFT via SOAP GPI" },
      { name: "validerVirement()", visibility: "public", lines: 65, desc: "Validation réglementaire BAM" },
      { name: "annulerVirement()", visibility: "public", lines: 40, desc: "Annulation avant exécution" },
    ],
    sql: [
      "INSERT INTO VIREMENTS (id, src, dst, montant, statut) VALUES (?,?,?,?,?)",
      "UPDATE VIREMENTS SET statut=? WHERE id=?",
      "SELECT * FROM VIREMENTS WHERE id=? FOR UPDATE",
    ],
    tables: ["VIREMENTS", "COMPTES", "AUDIT_VIREMENTS"],
    endpoints: [],
    adapters: [
      { name: "SWIFT GPI SOAP", type: "SOAP", url: "https://swift.bmce.ma/gpi/v2" },
      { name: "BAM API REST", type: "REST", url: "https://api.bam.ma/v1/compliance" },
    ],
    calledBy: [],
    calls: ["CompteEJB"],
    criticite: "CRITIQUE",
    dureeEstimeeJH: 60,
    statutMigration: "EN_ATTENTE",
    phase: 4,
    springTarget: "virement-service",
    description: "Orchestrateur de virements. Appelle CompteEJB, SWIFT SOAP, BAM REST, JMS.",
  },
  {
    id: "carte",
    name: "CarteEJB",
    type: "EJB_3X_STATELESS",
    icon: "💳",
    color: "#ec4899",
    methods: [
      { name: "consulterCarte()", visibility: "public", lines: 35, desc: "Détails d'une carte bancaire" },
      { name: "bloquerCarte()", visibility: "public", lines: 28, desc: "Blocage immédiat de carte" },
      { name: "activerCarte()", visibility: "public", lines: 22, desc: "Activation après réception" },
      { name: "commanderCarte()", visibility: "public", lines: 55, desc: "Commande nouvelle carte via CMI" },
    ],
    sql: [
      "SELECT * FROM CARTES WHERE compte_id=?",
      "UPDATE CARTES SET statut='BLOQUEE' WHERE id=?",
      "INSERT INTO CARTES (compte_id, type, statut) VALUES (?,?,?)",
    ],
    tables: ["CARTES", "COMPTES"],
    endpoints: [],
    adapters: [
      { name: "CMI API REST", type: "REST", url: "https://api.cmi.co.ma/v1/cards" },
    ],
    calledBy: ["compte"],
    calls: ["ConfigCarteEJB"],
    criticite: "ÉLEVÉ",
    dureeEstimeeJH: 30,
    statutMigration: "EN_ATTENTE",
    phase: 2,
    springTarget: "carte-service",
    description: "Gestion des cartes bancaires. Intégration CMI pour commandes.",
  },
  {
    id: "configCarte",
    name: "ConfigCarteEJB",
    type: "EJB_3X_SINGLETON",
    icon: "⚙️",
    color: "#6366f1",
    methods: [
      { name: "getPlafondJournalier()", visibility: "public", lines: 12, desc: "Plafond journalier par type" },
      { name: "getTypesCartes()", visibility: "public", lines: 18, desc: "Liste des types disponibles" },
    ],
    sql: ["SELECT * FROM CONFIG_CARTES"],
    tables: ["CONFIG_CARTES"],
    endpoints: [],
    adapters: [],
    calledBy: ["carte"],
    calls: [],
    criticite: "FAIBLE",
    dureeEstimeeJH: 5,
    statutMigration: "EN_ATTENTE",
    phase: 1,
    springTarget: "carte-service",
    description: "Singleton de configuration des cartes. Cache en mémoire.",
  },
  {
    id: "reporting",
    name: "ReportingEJB",
    type: "EJB_3X_STATELESS",
    icon: "📊",
    color: "#14b8a6",
    methods: [
      { name: "genererReleveCompte()", visibility: "public", lines: 95, desc: "Relevé PDF mensuel" },
      { name: "genererRapportRisque()", visibility: "public", lines: 130, desc: "Rapport risque multi-source" },
      { name: "exporterDonnees()", visibility: "public", lines: 75, desc: "Export CSV/Excel" },
    ],
    sql: [
      "SELECT * FROM COMPTES c JOIN MOUVEMENTS m ON c.id=m.compte_id WHERE c.agence=?",
      "SELECT * FROM RISQUES@DB2_LINK WHERE date_eval > ?",
      "SELECT * FROM REPORTING_VIEWS WHERE period=?",
    ],
    tables: ["COMPTES", "MOUVEMENTS", "RISQUES@DB2", "REPORTING_VIEWS"],
    endpoints: [],
    adapters: [],
    calledBy: [],
    calls: [],
    criticite: "MOYEN",
    dureeEstimeeJH: 35,
    statutMigration: "EN_ATTENTE",
    phase: 2,
    springTarget: "reporting-service",
    description: "Reporting multi-datasource (Oracle DS1, DS2, DB2 via DB Link).",
  },
  {
    id: "arrete",
    name: "ArreteBatchJob",
    type: "Batch",
    icon: "⏰",
    color: "#f59e0b",
    methods: [
      { name: "executerArrete()", visibility: "public", lines: 200, desc: "Arrêté comptable quotidien" },
      { name: "calculerInterets()", visibility: "public", lines: 85, desc: "Calcul intérêts créditeurs" },
      { name: "genererEcritures()", visibility: "public", lines: 110, desc: "Écritures comptables auto" },
    ],
    sql: [
      "SELECT * FROM COMPTES WHERE statut='ACTIF'",
      "INSERT INTO ECRITURES_COMPTABLES (compte_id, montant, type, date_op) VALUES (?,?,?,SYSDATE)",
      "UPDATE COMPTES SET solde=solde+? WHERE id=?",
    ],
    tables: ["COMPTES", "ECRITURES_COMPTABLES", "PARAMETRES_TAUX"],
    endpoints: [],
    adapters: [],
    calledBy: [],
    calls: [],
    criticite: "ÉLEVÉ",
    dureeEstimeeJH: 40,
    statutMigration: "EN_ATTENTE",
    phase: 2,
    springTarget: "batch-service",
    description: "Batch d'arrêté comptable quotidien. Publie sur JMS après exécution.",
  },
  {
    id: "security",
    name: "SecurityFilter",
    type: "Filter",
    icon: "🛡️",
    color: "#64748b",
    methods: [
      { name: "doFilter()", visibility: "public", lines: 65, desc: "Filtre de sécurité HTTP" },
      { name: "checkPermission()", visibility: "private", lines: 40, desc: "Vérification RBAC" },
    ],
    sql: ["SELECT role FROM USER_ROLES WHERE user_id=?", "SELECT * FROM PERMISSIONS WHERE role=?"],
    tables: ["USER_ROLES", "PERMISSIONS"],
    endpoints: [],
    adapters: [],
    calledBy: [],
    calls: [],
    criticite: "CRITIQUE",
    dureeEstimeeJH: 15,
    statutMigration: "EN_ATTENTE",
    phase: 1,
    springTarget: "auth-service",
    description: "Filtre de sécurité RBAC. Aucune dépendance EJB sortante.",
  },
];

// ─── SPRING BOOT SERVICES ──────────────────────────────────────────────────

export const SPRING = [
  {
    id: "auth-service",
    name: "AuthService",
    icon: "🔐",
    color: "#06b6d4",
    modules: ["auth", "session", "security"],
    endpoints: [
      { method: "POST", path: "/api/v1/auth/login", desc: "Authentification JWT" },
      { method: "POST", path: "/api/v1/auth/logout", desc: "Déconnexion" },
      { method: "GET", path: "/api/v1/auth/me", desc: "Profil utilisateur courant" },
    ],
    description: "Service d'authentification et gestion de sessions JWT.",
  },
  {
    id: "compte-service",
    name: "CompteService",
    icon: "🏦",
    color: "#10b981",
    modules: ["compte"],
    endpoints: [
      { method: "GET", path: "/api/v1/comptes/{id}/solde", desc: "Consulter solde" },
      { method: "GET", path: "/api/v1/comptes/{id}/historique", desc: "Historique mouvements" },
      { method: "POST", path: "/api/v1/comptes/{id}/debit", desc: "Débiter un compte" },
      { method: "POST", path: "/api/v1/comptes/{id}/credit", desc: "Créditer un compte" },
    ],
    description: "Service de gestion des comptes bancaires.",
  },
  {
    id: "virement-service",
    name: "VirementService",
    icon: "💸",
    color: "#f97316",
    modules: ["virement"],
    endpoints: [
      { method: "POST", path: "/api/v1/virements", desc: "Initier un virement" },
      { method: "POST", path: "/api/v1/virements/international", desc: "Virement SWIFT" },
      { method: "PUT", path: "/api/v1/virements/{id}/valider", desc: "Valider un virement" },
      { method: "DELETE", path: "/api/v1/virements/{id}", desc: "Annuler un virement" },
    ],
    description: "Orchestration des virements nationaux et internationaux.",
  },
  {
    id: "carte-service",
    name: "CarteService",
    icon: "💳",
    color: "#ec4899",
    modules: ["carte", "configCarte"],
    endpoints: [
      { method: "GET", path: "/api/v1/cartes/{id}", desc: "Détails carte" },
      { method: "POST", path: "/api/v1/cartes/{id}/bloquer", desc: "Bloquer carte" },
      { method: "POST", path: "/api/v1/cartes/{id}/activer", desc: "Activer carte" },
      { method: "POST", path: "/api/v1/cartes", desc: "Commander nouvelle carte" },
    ],
    description: "Gestion des cartes bancaires avec intégration CMI.",
  },
  {
    id: "reporting-service",
    name: "ReportingService",
    icon: "📊",
    color: "#14b8a6",
    modules: ["reporting"],
    endpoints: [
      { method: "GET", path: "/api/v1/reporting/releve/{compteId}", desc: "Relevé de compte" },
      { method: "GET", path: "/api/v1/reporting/risque", desc: "Rapport de risque" },
      { method: "GET", path: "/api/v1/reporting/export", desc: "Export données" },
    ],
    description: "Reporting multi-datasource et génération de rapports.",
  },
  {
    id: "batch-service",
    name: "BatchService",
    icon: "⏰",
    color: "#f59e0b",
    modules: ["arrete"],
    endpoints: [
      { method: "POST", path: "/api/v1/batch/arrete", desc: "Lancer arrêté comptable" },
      { method: "GET", path: "/api/v1/batch/status", desc: "Statut du batch" },
    ],
    description: "Service batch pour arrêtés comptables et calculs d'intérêts.",
  },
];

// ─── FLUX (RELATIONS) ──────────────────────────────────────────────────────

export const FLUX = [
  // @EJB JNDI calls
  { from: "auth", to: "session", type: "EJB_JNDI", label: "java:global/SessionManagerBean", detail: "@EJB injection JNDI", criticite: "ÉLEVÉ", direction: "→" },
  { from: "compte", to: "carte", type: "EJB_JNDI", label: "java:global/CarteEJB", detail: "@EJB injection pour consultation cartes liées", criticite: "MOYEN", direction: "→" },
  { from: "virement", to: "compte", type: "EJB_JNDI", label: "java:global/CompteEJB", detail: "@EJB injection pour débit/crédit", criticite: "CRITIQUE", direction: "→" },
  { from: "carte", to: "configCarte", type: "EJB_JNDI", label: "java:global/ConfigCarteEJB", detail: "@EJB Singleton config", criticite: "FAIBLE", direction: "→" },

  // JMS Queue/Topic
  { from: "virement", to: "jms/queue/BMCE_VIREMENTS", type: "JMS", label: "jms/queue/BMCE_VIREMENTS", detail: "DeliveryMode.PERSISTENT, TTL 24h", criticite: "ÉLEVÉ", direction: "→" },
  { from: "virement", to: "jms/topic/BMCE_NOTIFS", type: "JMS", label: "jms/topic/BMCE_NOTIFS", detail: "Topic notification client", criticite: "MOYEN", direction: "→" },
  { from: "arrete", to: "jms/queue/BMCE_ARRETES", type: "JMS", label: "jms/queue/BMCE_ARRETES", detail: "Résultat batch arrêté", criticite: "ÉLEVÉ", direction: "→" },

  // SOAP
  { from: "virement", to: "SWIFT_GPI_SOAP", type: "SOAP", label: "SWIFT GPI SOAP", detail: "https://swift.bmce.ma/gpi/v2 — virements internationaux", criticite: "CRITIQUE", direction: "→" },

  // REST externe
  { from: "virement", to: "BAM_API_REST", type: "REST_EXT", label: "BAM API REST", detail: "https://api.bam.ma/v1/compliance — conformité réglementaire", criticite: "ÉLEVÉ", direction: "→" },
  { from: "carte", to: "CMI_API_REST", type: "REST_EXT", label: "CMI API REST", detail: "https://api.cmi.co.ma/v1/cards — commande cartes", criticite: "ÉLEVÉ", direction: "→" },

  // DataSource partagées
  { from: "compte", to: "jdbc/BMCE_CARTES_DS", type: "DATASOURCE", label: "jdbc/BMCE_CARTES_DS", detail: "DataSource Oracle partagée comptes/cartes", criticite: "CRITIQUE", direction: "↔" },
  { from: "carte", to: "jdbc/BMCE_CARTES_DS", type: "DATASOURCE", label: "jdbc/BMCE_CARTES_DS", detail: "DataSource Oracle partagée comptes/cartes", criticite: "CRITIQUE", direction: "↔" },
  { from: "reporting", to: "jdbc/BMCE_DS1", type: "DATASOURCE", label: "jdbc/BMCE_DS1", detail: "Oracle DataSource principale", criticite: "MOYEN", direction: "→" },
  { from: "reporting", to: "jdbc/BMCE_DS2", type: "DATASOURCE", label: "jdbc/BMCE_DS2", detail: "Oracle DataSource secondaire", criticite: "MOYEN", direction: "→" },
  { from: "reporting", to: "DB2_LINK", type: "DATASOURCE", label: "DB2 via DB Link", detail: "RISQUES@DB2_LINK — données risques", criticite: "ÉLEVÉ", direction: "→" },
  { from: "security", to: "jdbc/BMCE_AUTH_DS", type: "DATASOURCE", label: "jdbc/BMCE_AUTH_DS", detail: "DataSource authentification RBAC", criticite: "CRITIQUE", direction: "→" },

  // Migration EJB → Spring
  { from: "auth", to: "auth-service", type: "MIGRATION", label: "AuthServlet → AuthService", detail: "Migration servlet vers Spring Security + JWT", criticite: "ÉLEVÉ", direction: "→" },
  { from: "session", to: "auth-service", type: "MIGRATION", label: "SessionManager → AuthService", detail: "Sessions intégrées dans AuthService", criticite: "ÉLEVÉ", direction: "→" },
  { from: "security", to: "auth-service", type: "MIGRATION", label: "SecurityFilter → AuthService", detail: "RBAC intégré dans Spring Security", criticite: "CRITIQUE", direction: "→" },
  { from: "compte", to: "compte-service", type: "MIGRATION", label: "CompteEJB → CompteService", detail: "Migration EJB vers @Service Spring", criticite: "CRITIQUE", direction: "→" },
  { from: "virement", to: "virement-service", type: "MIGRATION", label: "VirementEJB → VirementService", detail: "Orchestrateur migré avec Kafka", criticite: "CRITIQUE", direction: "→" },
  { from: "carte", to: "carte-service", type: "MIGRATION", label: "CarteEJB → CarteService", detail: "Migration avec intégration CMI", criticite: "ÉLEVÉ", direction: "→" },
  { from: "configCarte", to: "carte-service", type: "MIGRATION", label: "ConfigCarteEJB → CarteService", detail: "Config intégrée dans CarteService", criticite: "FAIBLE", direction: "→" },
  { from: "reporting", to: "reporting-service", type: "MIGRATION", label: "ReportingEJB → ReportingService", detail: "Multi-datasource Spring", criticite: "MOYEN", direction: "→" },
  { from: "arrete", to: "batch-service", type: "MIGRATION", label: "ArreteBatch → BatchService", detail: "Migration vers Spring Batch", criticite: "ÉLEVÉ", direction: "→" },
];

// ─── RESOURCES (nœuds intermédiaires pour le graphe) ───────────────────────

export const RESOURCES = [
  { id: "jms/queue/BMCE_VIREMENTS", name: "BMCE_VIREMENTS", type: "JMS", subtype: "Queue", color: "#a855f7" },
  { id: "jms/topic/BMCE_NOTIFS", name: "BMCE_NOTIFS", type: "JMS", subtype: "Topic", color: "#a855f7" },
  { id: "jms/queue/BMCE_ARRETES", name: "BMCE_ARRETES", type: "JMS", subtype: "Queue", color: "#a855f7" },
  { id: "SWIFT_GPI_SOAP", name: "SWIFT GPI", type: "SOAP", subtype: "SOAP", color: "#f59e0b" },
  { id: "BAM_API_REST", name: "BAM API", type: "REST_EXT", subtype: "REST", color: "#f97316" },
  { id: "CMI_API_REST", name: "CMI API", type: "REST_EXT", subtype: "REST", color: "#f97316" },
  { id: "jdbc/BMCE_CARTES_DS", name: "Oracle CARTES", type: "DATASOURCE", subtype: "Oracle", color: "#ef4444" },
  { id: "jdbc/BMCE_DS1", name: "Oracle DS1", type: "DATASOURCE", subtype: "Oracle", color: "#ef4444" },
  { id: "jdbc/BMCE_DS2", name: "Oracle DS2", type: "DATASOURCE", subtype: "Oracle", color: "#ef4444" },
  { id: "DB2_LINK", name: "DB2 Risques", type: "DATASOURCE", subtype: "DB2", color: "#f97316" },
  { id: "jdbc/BMCE_AUTH_DS", name: "Oracle AUTH", type: "DATASOURCE", subtype: "Oracle", color: "#ef4444" },
];

// ─── HELPERS ───────────────────────────────────────────────────────────────

/** Tous les nœuds (legacy + spring + resources) */
export function getAllNodes() {
  return [
    ...LEGACY.map(m => ({ ...m, category: "legacy" })),
    ...SPRING.map(s => ({ ...s, category: "spring" })),
    ...RESOURCES.map(r => ({ ...r, category: "resource" })),
  ];
}

/** Trouver un module par ID (legacy ou spring) */
export function findModule(id) {
  return LEGACY.find(m => m.id === id) || SPRING.find(s => s.id === id) || RESOURCES.find(r => r.id === id);
}

/** Obtenir les flux entrants pour un module */
export function getIncomingFlux(moduleId) {
  return FLUX.filter(f => f.to === moduleId);
}

/** Obtenir les flux sortants pour un module */
export function getOutgoingFlux(moduleId) {
  return FLUX.filter(f => f.from === moduleId);
}

/** Obtenir tous les flux d'un module (entrants + sortants) */
export function getAllFluxForModule(moduleId) {
  return FLUX.filter(f => f.from === moduleId || f.to === moduleId);
}
