import { int, float, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

// ============================================================
// Users (from template — preserved)
// ============================================================

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// Projects (Workspace)
// ============================================================

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "archived", "completed"]).default("active").notNull(),
  technologies: json("technologies").$type<string[]>(),
  fileCount: int("fileCount").default(0).notNull(),
  totalLines: int("totalLines").default(0).notNull(),
  legacyScore: int("legacyScore"),
  modernScore: int("modernScore"),
  gitUrl: varchar("gitUrl", { length: 500 }),
  gitProvider: mysqlEnum("gitProvider", ["github", "gitlab", "bitbucket", "azure_devops"]),
  gitBranch: varchar("gitBranch", { length: 255 }),
  lastAnalyzedAt: timestamp("lastAnalyzedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ============================================================
// Project Files
// ============================================================

export const projectFiles = mysqlTable("project_files", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  filePath: varchar("filePath", { length: 500 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  content: text("content").notNull(),
  lineCount: int("lineCount").default(0).notNull(),
  technologies: json("technologies").$type<string[]>(),
  moduleName: varchar("moduleName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProjectFile = typeof projectFiles.$inferSelect;
export type InsertProjectFile = typeof projectFiles.$inferInsert;

// ============================================================
// Analysis Scans
// ============================================================

export const scans = mysqlTable("scans", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  scanType: mysqlEnum("scanType", ["full", "incremental", "quick"]).default("full").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  filesAnalyzed: int("filesAnalyzed").default(0).notNull(),
  technologies: json("technologies").$type<string[]>(),
  legacyScore: int("legacyScore"),
  modernScore: int("modernScore"),
  issuesCount: int("issuesCount").default(0).notNull(),
  criticalCount: int("criticalCount").default(0).notNull(),
  warningCount: int("warningCount").default(0).notNull(),
  durationMs: int("durationMs"),
  analysisResult: json("analysisResult"),
  microservicesResult: json("microservicesResult"),
  cloudResult: json("cloudResult"),
  aiResult: json("aiResult"),
  migrationPlan: json("migrationPlan"),
  architectureGraph: json("architectureGraph"),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Scan = typeof scans.$inferSelect;
export type InsertScan = typeof scans.$inferInsert;

// ============================================================
// Comments (Collaboration)
// ============================================================

export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  scanId: int("scanId"),
  authorName: varchar("authorName", { length: 255 }).notNull(),
  commentType: mysqlEnum("commentType", ["general", "review", "validation", "question"]).default("general").notNull(),
  content: text("content").notNull(),
  filePath: varchar("filePath", { length: 500 }),
  lineNumber: int("lineNumber"),
  validationStatus: mysqlEnum("validationStatus", ["pending", "approved", "rejected"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

// ============================================================
// Git Connections
// ============================================================

export const gitConnections = mysqlTable("git_connections", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  provider: mysqlEnum("provider", ["github", "gitlab", "bitbucket", "azure_devops"]).notNull(),
  repoUrl: varchar("repoUrl", { length: 500 }).notNull(),
  repoName: varchar("repoName", { length: 255 }).notNull(),
  defaultBranch: varchar("defaultBranch", { length: 255 }).default("main").notNull(),
  isMonorepo: boolean("isMonorepo").default(false).notNull(),
  detectedModules: json("detectedModules").$type<string[]>(),
  lastSyncAt: timestamp("lastSyncAt"),
  status: mysqlEnum("connectionStatus", ["connected", "disconnected", "error"]).default("connected").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GitConnection = typeof gitConnections.$inferSelect;
export type InsertGitConnection = typeof gitConnections.$inferInsert;

// ============================================================
// Shared Reports
// ============================================================

export const sharedReports = mysqlTable("shared_reports", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  scanId: int("scanId"),
  shareToken: varchar("shareToken", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt"),
  viewCount: int("viewCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SharedReport = typeof sharedReports.$inferSelect;
export type InsertSharedReport = typeof sharedReports.$inferInsert;

// ============================================================
// Learning Rules (Moteur d'apprentissage automatique)
// ============================================================

export const learningRules = mysqlTable("learning_rules", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 100 }).default("global").notNull(),
  ruleType: varchar("rule_type", { length: 50 }).notNull(),

  // Patterns de déclenchement
  patternClassName: varchar("pattern_class_name", { length: 200 }),
  patternMethodName: varchar("pattern_method_name", { length: 200 }),
  patternPackage: varchar("pattern_package", { length: 200 }),
  patternJavadoc: text("pattern_javadoc"),
  patternAnnotations: varchar("pattern_annotations", { length: 500 }),
  patternReturnType: varchar("pattern_return_type", { length: 200 }),
  patternParamTypes: varchar("pattern_param_types", { length: 500 }),

  // Choix de l'utilisateur
  chosenOption: varchar("chosen_option", { length: 100 }).default("").notNull(),
  chosenReason: text("chosen_reason"),

  // Statistiques d'apprentissage
  occurrenceCount: int("occurrence_count").default(1).notNull(),
  confidence: float("confidence").default(0.5).notNull(),
  isActive: boolean("is_active").default(true).notNull(),

  // Source du choix
  sourceProject: varchar("source_project", { length: 200 }),
  sourceSessionId: varchar("source_session_id", { length: 100 }),
  confirmedByUser: boolean("confirmed_by_user").default(true).notNull(),

  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LearningRule = typeof learningRules.$inferSelect;
export type InsertLearningRule = typeof learningRules.$inferInsert;

// ============================================================
// Compleo Sessions (Persistent pipeline sessions)
// ============================================================

export const compleoSessions = mysqlTable("compleo_sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  projectName: varchar("project_name", { length: 255 }).notNull(),
  status: mysqlEnum("status", [
    "uploaded", "analyzed", "waiting_choices", "generated", "error", "missing_deps"
  ]).default("uploaded").notNull(),

  // Pipeline data (JSON blobs)
  filesData: json("files_data").$type<{ path: string; content: string }[]>(),
  pomXml: text("pom_xml"),
  bianYml: text("bian_yml"),
  irData: json("ir_data"),
  ambiguitiesData: json("ambiguities_data"),
  userChoicesData: json("user_choices_data"),
  resolvedIrData: json("resolved_ir_data"),
  generationData: json("generation_data"),
  zipUrl: varchar("zip_url", { length: 500 }),

  // Multi-tech v3.0 fields
  pipelineResultData: json("pipeline_result_data"),
  detectedComponentsData: json("detected_components_data"),
  multiTechGenerationData: json("multi_tech_generation_data"),
  maturityScoreData: json("maturity_score_data"),
  technologiesDetected: json("technologies_detected").$type<string[]>(),

  // Debug events
  debugEventsData: json("debug_events_data").$type<any[]>(),

  // Missing dependencies (v5.6.1)
  missingDepsData: json("missing_deps_data"),

  // Error tracking
  errorMessage: text("error_message"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type CompleoSessionRow = typeof compleoSessions.$inferSelect;
export type InsertCompleoSession = typeof compleoSessions.$inferInsert;

// ============================================================
// Workspaces (Multi-module project groups)
// ============================================================

export const workspaces = mysqlTable("workspaces", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

// ============================================================
// Workspace Sessions (Projects within a workspace)
// ============================================================

export const workspaceSessions = mysqlTable("workspace_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull(),
  sessionId: varchar("session_id", { length: 128 }).notNull(),
  projectName: varchar("project_name", { length: 255 }),
  artifactId: varchar("artifact_id", { length: 255 }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  analysisStatus: mysqlEnum("analysis_status", [
    "PENDING", "ANALYZED", "LINKED"
  ]).default("PENDING").notNull(),
});

export type WorkspaceSession = typeof workspaceSessions.$inferSelect;
export type InsertWorkspaceSession = typeof workspaceSessions.$inferInsert;

// ============================================================
// Cross-Module Links (Dependencies between workspace projects)
// ============================================================

export const crossModuleLinks = mysqlTable("cross_module_links", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull(),
  sourceSessionId: varchar("source_session_id", { length: 128 }).notNull(),
  sourceClass: varchar("source_class", { length: 255 }).notNull(),
  targetSessionId: varchar("target_session_id", { length: 128 }),
  targetClass: varchar("target_class", { length: 255 }).notNull(),
  jndiPath: text("jndi_path"),
  status: mysqlEnum("status", [
    "UNRESOLVED", "RESOLVED", "NEWLY_RESOLVED", "STUB"
  ]).default("UNRESOLVED").notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export type CrossModuleLink = typeof crossModuleLinks.$inferSelect;
export type InsertCrossModuleLink = typeof crossModuleLinks.$inferInsert;
