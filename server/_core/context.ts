import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Demo user — bypasses Manus OAuth for public demo mode
const DEMO_USER: User = {
  id: 1,
  openId: "demo-user",
  name: "Hamza NORDINE",
  email: "demo@compleo.dev",
  loginMethod: "demo",
  role: "admin",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Demo mode: always provide a user so protectedProcedure never blocks
  if (!user) {
    user = DEMO_USER;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
