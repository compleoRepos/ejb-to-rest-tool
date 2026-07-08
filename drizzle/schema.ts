import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
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

/**
 * EJB projects uploaded by users.
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  originalFileName: varchar("originalFileName", { length: 500 }),
  status: mysqlEnum("status", ["uploaded", "parsed", "error"]).default("uploaded").notNull(),
  /** JSON metadata from parsing (EJB count, method count, etc.) */
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Parsed EJB/WebService endpoints from each project.
 */
export const ejbEndpoints = mysqlTable("ejb_endpoints", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  /** EJB or WebService class name */
  className: varchar("className", { length: 255 }).notNull(),
  /** Type: STATELESS, STATEFUL, WEBSERVICE */
  ejbType: varchar("ejbType", { length: 50 }).notNull(),
  /** Method name */
  methodName: varchar("methodName", { length: 255 }).notNull(),
  /** HTTP verb inferred (GET, POST, PUT, DELETE) */
  httpMethod: varchar("httpMethod", { length: 10 }).notNull(),
  /** REST path inferred */
  restPath: varchar("restPath", { length: 500 }),
  /** Input fields as JSON array */
  inputFields: json("inputFields"),
  /** Output fields as JSON array */
  outputFields: json("outputFields"),
  /** Method body extracted from implementation */
  methodBody: text("methodBody"),
  /** BIAN Service Domain mapping */
  bianServiceDomain: varchar("bianServiceDomain", { length: 255 }),
  /** BIAN Action Term */
  bianActionTerm: varchar("bianActionTerm", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EjbEndpoint = typeof ejbEndpoints.$inferSelect;
export type InsertEjbEndpoint = typeof ejbEndpoints.$inferInsert;

/**
 * Generation runs (Adapter WAR or BIAN Wrapper).
 */
export const generations = mysqlTable("generations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId").notNull(),
  /** Generation mode */
  mode: mysqlEnum("mode", ["adapter", "bian"]).notNull(),
  status: mysqlEnum("status", ["pending", "generating", "completed", "error"]).default("pending").notNull(),
  /** S3 key for the generated ZIP */
  zipStorageKey: varchar("zipStorageKey", { length: 500 }),
  /** S3 URL for download */
  zipUrl: text("zipUrl"),
  /** Generation stats (files count, endpoints count, etc.) */
  stats: json("stats"),
  /** Error message if failed */
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type Generation = typeof generations.$inferSelect;
export type InsertGeneration = typeof generations.$inferInsert;
