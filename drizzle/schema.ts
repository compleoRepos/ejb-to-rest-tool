import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

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
