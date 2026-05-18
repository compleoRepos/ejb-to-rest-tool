/**
 * Environment variables — Autonomous OpenShift deployment
 * No Manus dependency. All services are local.
 */
export const ENV = {
  // Database
  databaseUrl: process.env.DATABASE_URL ?? "mysql://root:password@mysql:3306/ejb_modernizer",

  // JWT for local session (kept for future auth)
  cookieSecret: process.env.JWT_SECRET ?? "local-dev-secret-change-me",

  // LLM — Ollama local
  ollamaUrl: process.env.OLLAMA_URL ?? "http://ollama:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "ejb-modernizer",

  // Storage — local filesystem
  storagePath: process.env.STORAGE_PATH ?? "/data/uploads",

  // Pipeline — compilation tools
  pipelineUrl: process.env.PIPELINE_URL ?? "http://pipeline:8080",

  // App
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT ?? "3000", 10),

  // Legacy compat (kept so imports don't break)
  appId: process.env.VITE_APP_ID ?? "",
  oAuthServerUrl: "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "local-admin",
  forgeApiUrl: process.env.OLLAMA_URL ?? "http://ollama:11434",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "not-needed",
};
