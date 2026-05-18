# ============================================================
# Java Legacy Modernizer — Dockerfile multi-stage
# Build: Node.js 22 + pnpm, Runtime: Node.js 22 slim
# ============================================================

# ---- Stage 1: Build ----
FROM node:22-slim AS builder

WORKDIR /app

# Installer pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copier les fichiers de dépendances
COPY package.json pnpm-lock.yaml ./

# Installer les dépendances (incluant devDependencies pour le build)
RUN pnpm install --frozen-lockfile

# Copier le code source
COPY . .

# Build frontend (Vite) + backend (esbuild)
RUN pnpm run build

# ---- Stage 2: Runtime ----
FROM node:22-slim AS runtime

WORKDIR /app

# Installer pnpm pour les dépendances de production
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copier les fichiers de dépendances
COPY package.json pnpm-lock.yaml ./

# Installer uniquement les dépendances de production
RUN pnpm install --frozen-lockfile --prod

# Copier le build depuis le stage builder
COPY --from=builder /app/dist ./dist

# Copier les fichiers nécessaires au runtime
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server/engine ./server/engine
COPY --from=builder /app/tests/snapshots ./tests/snapshots

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/compleo/sessions').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Exposer le port
EXPOSE 3000

# Lancer l'application
CMD ["node", "dist/index.js"]
