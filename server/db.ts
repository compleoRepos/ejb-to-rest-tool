import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, projects, ejbEndpoints, generations, type InsertProject, type InsertEjbEndpoint, type InsertGeneration } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
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

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Project Persistence ─────────────────────────────────────────────────────

export async function createProject(data: Omit<InsertProject, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(projects).values(data);
  return result[0].insertId;
}

export async function updateProjectStatus(id: number, status: 'uploaded' | 'parsed' | 'error', metadata?: any) {
  const db = await getDb();
  if (!db) return;
  const updateData: any = { status };
  if (metadata) updateData.metadata = metadata;
  await db.update(projects).set(updateData).where(eq(projects.id, id));
}

export async function getProjectsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}

export async function getAllProjects() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

// ─── Endpoint Persistence ────────────────────────────────────────────────────

export async function createEndpoints(data: Omit<InsertEjbEndpoint, 'id' | 'createdAt'>[]) {
  const db = await getDb();
  if (!db || data.length === 0) return;
  await db.insert(ejbEndpoints).values(data);
}

export async function getEndpointsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ejbEndpoints).where(eq(ejbEndpoints.projectId, projectId));
}

// ─── Generation Persistence ──────────────────────────────────────────────────

export async function createGeneration(data: Omit<InsertGeneration, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(generations).values(data);
  return result[0].insertId;
}

export async function updateGeneration(id: number, data: Partial<InsertGeneration>) {
  const db = await getDb();
  if (!db) return;
  await db.update(generations).set(data).where(eq(generations.id, id));
}

export async function getGenerationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(generations).where(eq(generations.userId, userId)).orderBy(desc(generations.createdAt));
}

export async function getAllGenerations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(generations).orderBy(desc(generations.createdAt)).limit(100);
}

export async function getGenerationWithProject(generationId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(generations).where(eq(generations.id, generationId)).limit(1);
  return result.length > 0 ? result[0] : null;
}
