# Custom Dockerfile — EJB to REST Wrapper Generator
# Requires Java runtime (eclipse-temurin JRE) to execute the jaxrs-wrapper-generator JAR.
FROM eclipse-temurin:21-jre

# Install Node.js 22 via NodeSource
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates unzip \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install corepack for pnpm
RUN npm install -g corepack@latest

WORKDIR /app
COPY . .
RUN corepack pnpm install && corepack pnpm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
