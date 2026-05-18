import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Demo user — bypasses Manus OAuth for public demo mode
const DEMO_USER: User = {
  id: 1,
  openId: "demo-user",
  name: "Compleo",
  email: "demo@compleo.dev",
  loginMethod: "demo",
  role: "admin",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

/**
 * No authentication — always returns DEMO_USER (admin).
 * Auth can be added later via local JWT strategy.
 */
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: DEMO_USER,
  };
}
