import { eq, desc, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  projects, InsertProject,
  projectFiles, InsertProjectFile,
  scans, InsertScan,
  comments, InsertComment,
  gitConnections, InsertGitConnection,
  sharedReports, InsertSharedReport,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================
// Users (preserved from template)
// ============================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================
// Projects
// ============================================================

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values(data);
  const id = result[0].insertId;
  return (await db.select().from(projects).where(eq(projects.id, id)).limit(1))[0];
}

export async function listProjects() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(projects).orderBy(desc(projects.updatedAt));
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result[0] ?? null;
}

export async function updateProject(id: number, data: Partial<InsertProject>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(projects).set(data).where(eq(projects.id, id));
  return getProjectById(id);
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(comments).where(eq(comments.projectId, id));
  await db.delete(sharedReports).where(eq(sharedReports.projectId, id));
  await db.delete(scans).where(eq(scans.projectId, id));
  await db.delete(projectFiles).where(eq(projectFiles.projectId, id));
  await db.delete(gitConnections).where(eq(gitConnections.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
}

// ============================================================
// Project Files
// ============================================================

export async function addProjectFiles(files: InsertProjectFile[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (files.length === 0) return [];
  await db.insert(projectFiles).values(files);
  return db.select().from(projectFiles).where(eq(projectFiles.projectId, files[0].projectId));
}

export async function getProjectFiles(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(projectFiles).where(eq(projectFiles.projectId, projectId));
}

export async function deleteProjectFiles(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projectFiles).where(eq(projectFiles.projectId, projectId));
}

// ============================================================
// Scans
// ============================================================

export async function createScan(data: InsertScan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(scans).values(data);
  const id = result[0].insertId;
  return (await db.select().from(scans).where(eq(scans.id, id)).limit(1))[0];
}

export async function getScanById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(scans).where(eq(scans.id, id)).limit(1);
  return result[0] ?? null;
}

export async function listScans(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(scans).where(eq(scans.projectId, projectId)).orderBy(desc(scans.createdAt));
}

export async function updateScan(id: number, data: Partial<InsertScan>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(scans).set(data).where(eq(scans.id, id));
  return getScanById(id);
}

// ============================================================
// Comments
// ============================================================

export async function createComment(data: InsertComment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(comments).values(data);
  const id = result[0].insertId;
  return (await db.select().from(comments).where(eq(comments.id, id)).limit(1))[0];
}

export async function listComments(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(comments).where(eq(comments.projectId, projectId)).orderBy(desc(comments.createdAt));
}

export async function updateComment(id: number, data: Partial<InsertComment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(comments).set(data).where(eq(comments.id, id));
  const result = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  return result[0] ?? null;
}

export async function deleteComment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(comments).where(eq(comments.id, id));
}

// ============================================================
// Git Connections
// ============================================================

export async function createGitConnection(data: InsertGitConnection) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(gitConnections).values(data);
  const id = result[0].insertId;
  return (await db.select().from(gitConnections).where(eq(gitConnections.id, id)).limit(1))[0];
}

export async function getGitConnections(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(gitConnections).where(eq(gitConnections.projectId, projectId));
}

export async function deleteGitConnection(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(gitConnections).where(eq(gitConnections.id, id));
}

// ============================================================
// Shared Reports
// ============================================================

export async function createSharedReport(data: InsertSharedReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(sharedReports).values(data);
  const id = result[0].insertId;
  return (await db.select().from(sharedReports).where(eq(sharedReports.id, id)).limit(1))[0];
}

export async function getSharedReportByToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(sharedReports).where(eq(sharedReports.shareToken, token)).limit(1);
  if (result[0]) {
    await db.update(sharedReports).set({ viewCount: sql`${sharedReports.viewCount} + 1` }).where(eq(sharedReports.id, result[0].id));
  }
  return result[0] ?? null;
}

export async function listSharedReports(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(sharedReports).where(eq(sharedReports.projectId, projectId)).orderBy(desc(sharedReports.createdAt));
}
