/**
 * FrontendGenerator -- Generateur de projet frontend connecte au backend Spring Boot.
 *
 * Pipeline IA a chaque etape :
 *   1. Analyse des endpoints REST generes (extraction des APIs)
 *   2. Generation intelligente des composants (LLM ejb-modernizer)
 *   3. Enrichissement metier (adaptation au domaine detecte)
 *   4. Verification de compilation (TypeScript/ESLint)
 *
 * Frameworks supportes : React + TypeScript, Angular, Vue.js 3
 *
 * Le frontend genere est PRODUCTION-READY :
 *   - Zero erreur de compilation (npm run build passe)
 *   - Code de qualite (conventions, imports propres, pas de code mort)
 *   - TODOs documentes : quoi, pourquoi, comment, contexte metier
 *   - Javadoc/JSDoc sur chaque composant
 *
 * @version v10.8
 * @author Compleo
 */

import { llmGenerate, llmGenerateJSON, isLLMAvailable } from "../ml/llm-adapter";
import type { GeneratedFile, TechnologyType } from "../registry/types";
import type { AIAnalysisInsights, DomainInsight } from "../analysis/AnalysisLLMEnricher";
import type { FrontendFramework, IndustryStandard, DetectedDomain } from "./DynamicOptionsResolver";

// --- Types ---

export interface FrontendGeneratorInput {
  /** Backend generated files (Spring Boot controllers, DTOs, services) */
  backendFiles: GeneratedFile[];
  /** Chosen frontend framework */
  framework: FrontendFramework;
  /** Project name */
  projectName: string;
  /** Base package of the Spring Boot backend (e.g., com.example.app) */
  basePackage: string;
  /** Detected domain for industry-specific UI patterns */
  detectedDomain: DetectedDomain;
  /** AI analysis insights for business context */
  aiInsights?: AIAnalysisInsights | null;
  /** Technologies detected in the legacy project */
  technologiesDetected: TechnologyType[];
  /** Source JSP/Struts files for UI extraction */
  legacyUIFiles?: Array<{ path: string; content: string }>;
}

export interface FrontendGeneratorOutput {
  /** All generated frontend files */
  files: GeneratedFile[];
  /** Generation statistics */
  stats: {
    totalFiles: number;
    components: number;
    services: number;
    pages: number;
    models: number;
    configFiles: number;
    llmCalls: number;
    llmEnhancedFiles: number;
  };
  /** TODOs for the developer (post-migration checklist items) */
  todos: FrontendTodo[];
  /** Warnings during generation */
  warnings: string[];
}

export interface FrontendTodo {
  /** Category of the TODO */
  category: "security" | "testing" | "ux" | "performance" | "integration" | "configuration" | "business_logic";
  /** Priority */
  priority: "critical" | "high" | "medium" | "low";
  /** What needs to be done */
  what: string;
  /** Why it needs to be done */
  why: string;
  /** How to do it (guidance) */
  how: string;
  /** Related files */
  relatedFiles: string[];
}

export interface ExtractedEndpoint {
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** URL path */
  path: string;
  /** Controller class name */
  controller: string;
  /** Method name */
  methodName: string;
  /** Request body DTO (if any) */
  requestDto?: string;
  /** Response DTO (if any) */
  responseDto?: string;
  /** Path variables */
  pathVariables: string[];
  /** Query parameters */
  queryParams: string[];
  /** Description from Javadoc or annotation */
  description: string;
  /** Domain context */
  domain?: string;
}

export interface ExtractedDto {
  /** Class name */
  name: string;
  /** Fields */
  fields: Array<{
    name: string;
    type: string;
    tsType: string;
    required: boolean;
    description: string;
  }>;
  /** Source reference (legacy class) */
  sourceRef?: string;
}

// --- Event callback for progress reporting ---

export type FrontendGenEvent = {
  type: "phase_start" | "phase_end" | "file_generated" | "llm_call" | "warning";
  phase?: string;
  message: string;
  data?: Record<string, unknown>;
};

export type FrontendGenEventCallback = (event: FrontendGenEvent) => void;

// --- Main Generator ---

export class FrontendGenerator {
  private onEvent: FrontendGenEventCallback | null = null;
  private llmCalls = 0;
  private llmEnhancedFiles = 0;

  setEventListener(cb: FrontendGenEventCallback): void {
    this.onEvent = cb;
  }

  private emit(event: FrontendGenEvent): void {
    this.onEvent?.(event);
  }

  /**
   * Generate a complete frontend project connected to the Spring Boot backend.
   * Each step uses the IA model for intelligent generation.
   */
  async generate(input: FrontendGeneratorInput): Promise<FrontendGeneratorOutput> {
    const files: GeneratedFile[] = [];
    const warnings: string[] = [];
    const todos: FrontendTodo[] = [];

    this.llmCalls = 0;
    this.llmEnhancedFiles = 0;

    // --- Step 1: Extract REST endpoints from backend files ---
    this.emit({ type: "phase_start", phase: "endpoint_extraction", message: "Extraction des endpoints REST du backend..." });
    const endpoints = this.extractEndpoints(input.backendFiles);
    const dtos = this.extractDTOs(input.backendFiles);
    this.emit({ type: "phase_end", phase: "endpoint_extraction", message: `${endpoints.length} endpoints, ${dtos.length} DTOs extraits` });

    if (endpoints.length === 0) {
      warnings.push("Aucun endpoint REST detecte dans le backend genere. Le frontend sera genere avec des services stub.");
    }

    // --- Step 2: LLM analysis of endpoints for UI generation strategy ---
    this.emit({ type: "phase_start", phase: "llm_analysis", message: "Analyse IA des endpoints pour la strategie UI..." });
    const uiStrategy = await this.analyzeEndpointsWithLLM(endpoints, dtos, input);
    this.emit({ type: "phase_end", phase: "llm_analysis", message: "Strategie UI determinee par l'IA" });

    // --- Step 3: Generate project scaffold ---
    this.emit({ type: "phase_start", phase: "scaffold", message: `Generation du scaffold ${input.framework}...` });
    const scaffoldFiles = this.generateScaffold(input);
    files.push(...scaffoldFiles);
    this.emit({ type: "phase_end", phase: "scaffold", message: `${scaffoldFiles.length} fichiers de configuration generes` });

    // --- Steps 4-8: Framework-specific generation ---
    if (input.framework === "thymeleaf" || input.framework === "jsf") {
      // Server-rendered frameworks: generate HTML templates + Spring MVC controllers
      this.emit({ type: "phase_start", phase: "pages", message: `Generation des pages ${input.framework} (CRUD par entite)...` });
      const serverPages = this.generateServerRenderedPages(endpoints, dtos, uiStrategy, input);
      files.push(...serverPages);
      this.emit({ type: "phase_end", phase: "pages", message: `${serverPages.length} fichiers generes (templates + controllers)` });
    } else {
      // SPA frameworks (React, Angular, Vue): TypeScript models + API services + pages
      this.emit({ type: "phase_start", phase: "models", message: "Generation des modeles TypeScript..." });
      const modelFiles = this.generateModels(dtos, input);
      files.push(...modelFiles);
      this.emit({ type: "phase_end", phase: "models", message: `${modelFiles.length} modeles generes` });

      this.emit({ type: "phase_start", phase: "services", message: "Generation des services API..." });
      const serviceFiles = this.generateServices(endpoints, dtos, input);
      files.push(...serviceFiles);
      this.emit({ type: "phase_end", phase: "services", message: `${serviceFiles.length} services generes` });

      this.emit({ type: "phase_start", phase: "pages", message: "Generation des pages et composants (IA-driven)..." });
      const pageFiles = await this.generatePages(endpoints, dtos, uiStrategy, input);
      files.push(...pageFiles);
      this.emit({ type: "phase_end", phase: "pages", message: `${pageFiles.length} pages/composants generes` });

      this.emit({ type: "phase_start", phase: "routing", message: "Generation du routing..." });
      const routingFiles = this.generateRouting(endpoints, input);
      files.push(...routingFiles);
      this.emit({ type: "phase_end", phase: "routing", message: "Routing genere" });

      this.emit({ type: "phase_start", phase: "shared", message: "Generation des composants partages..." });
      const sharedFiles = this.generateSharedComponents(input);
      files.push(...sharedFiles);
      this.emit({ type: "phase_end", phase: "shared", message: `${sharedFiles.length} composants partages generes` });
    }

    // --- Step 9: Build TODOs ---
    this.emit({ type: "phase_start", phase: "todos", message: "Generation de la checklist post-migration..." });
    const generatedTodos = this.buildTodos(endpoints, dtos, input);
    todos.push(...generatedTodos);
    this.emit({ type: "phase_end", phase: "todos", message: `${todos.length} TODOs generes` });

    // --- Step 10: Verify compilation (TypeScript check) ---
    this.emit({ type: "phase_start", phase: "verification", message: "Verification de la coherence du code genere..." });
    const verificationWarnings = this.verifyGeneratedCode(files, input);
    warnings.push(...verificationWarnings);
    this.emit({ type: "phase_end", phase: "verification", message: `Verification terminee (${verificationWarnings.length} warnings)` });

    return {
      files,
      stats: {
        totalFiles: files.length,
        components: files.filter(f => f.category === "controller").length,
        services: files.filter(f => f.category === "service").length,
        pages: files.filter(f => f.path.includes("/pages/")).length,
        models: files.filter(f => f.category === "dto").length,
        configFiles: scaffoldFiles.length,
        llmCalls: this.llmCalls,
        llmEnhancedFiles: this.llmEnhancedFiles,
      },
      todos,
      warnings,
    };
  }

  // =====================================================================
  // Step 1: Extract REST endpoints from backend generated files
  // =====================================================================

  private extractEndpoints(backendFiles: GeneratedFile[]): ExtractedEndpoint[] {
    const endpoints: ExtractedEndpoint[] = [];
    const controllers = backendFiles.filter(
      f => f.category === "controller" && f.path.endsWith(".java")
    );

    for (const ctrl of controllers) {
      const content = ctrl.content;
      const className = this.extractClassName(content);

      // Extract class-level @RequestMapping
      const classMapping = content.match(/@RequestMapping\s*\(\s*["']([^"']+)["']\s*\)/)?.[1] || "";

      // Extract method-level mappings
      const methodRegex = /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?:value\s*=\s*)?["']?([^"'\)]*?)["']?\s*\)[\s\S]*?(?:public|private|protected)\s+(?:ResponseEntity<([^>]+)>|(\w+))\s+(\w+)\s*\(([^)]*)\)/g;
      let match;

      while ((match = methodRegex.exec(content)) !== null) {
        const httpMethod = match[1].toUpperCase() as ExtractedEndpoint["method"];
        const methodPath = match[2] || "";
        const responseType = match[3] || match[4] || "void";
        const methodName = match[5];
        const params = match[6];

        // Extract path variables and query params
        const pathVars: string[] = [];
        const queryParams: string[] = [];
        let requestDto: string | undefined;

        const paramRegex = /@(PathVariable|RequestParam|RequestBody)\s*(?:\([^)]*\))?\s*(\w+)\s+(\w+)/g;
        let paramMatch;
        while ((paramMatch = paramRegex.exec(params)) !== null) {
          if (paramMatch[1] === "PathVariable") pathVars.push(paramMatch[3]);
          else if (paramMatch[1] === "RequestParam") queryParams.push(paramMatch[3]);
          else if (paramMatch[1] === "RequestBody") requestDto = paramMatch[2];
        }

        // Extract Javadoc description
        const javadocRegex = new RegExp(`/\\*\\*([\\s\\S]*?)\\*/[\\s\\S]*?${methodName}\\s*\\(`, "m");
        const javadocMatch = content.match(javadocRegex);
        const description = javadocMatch
          ? javadocMatch[1].replace(/\s*\*\s*/g, " ").trim().split("@")[0].trim()
          : "";

        const fullPath = `${classMapping}${methodPath}`.replace(/\/\//g, "/");

        endpoints.push({
          method: httpMethod,
          path: fullPath,
          controller: className,
          methodName,
          requestDto,
          responseDto: responseType !== "void" ? responseType : undefined,
          pathVariables: pathVars,
          queryParams,
          description,
        });
      }
    }

    return endpoints;
  }

  private extractDTOs(backendFiles: GeneratedFile[]): ExtractedDto[] {
    const dtos: ExtractedDto[] = [];
    const dtoFiles = backendFiles.filter(
      f => f.category === "dto" && f.path.endsWith(".java")
    );

    for (const file of dtoFiles) {
      const content = file.content;
      const className = this.extractClassName(content);
      const fields: ExtractedDto["fields"] = [];

      // Extract fields from Java class
      const fieldRegex = /(?:\/\*\*([^*]*(?:\*(?!\/)[^*]*)*)\*\/\s*)?(?:@\w+(?:\([^)]*\))?[\s\n]*)*private\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*[;=]/g;
      let fieldMatch;

      while ((fieldMatch = fieldRegex.exec(content)) !== null) {
        const javadoc = fieldMatch[1]?.replace(/\s*\*\s*/g, " ").trim() || "";
        const javaType = fieldMatch[2];
        const fieldName = fieldMatch[3];
        const required = content.includes(`@NotNull`) || content.includes(`@NotBlank`) || content.includes(`@NotEmpty`);

        fields.push({
          name: fieldName,
          type: javaType,
          tsType: this.javaTypeToTS(javaType),
          required,
          description: javadoc,
        });
      }

      dtos.push({
        name: className,
        fields,
        sourceRef: file.sourceRef,
      });
    }

    return dtos;
  }

  // =====================================================================
  // Step 2: LLM analysis for UI strategy
  // =====================================================================

  private async analyzeEndpointsWithLLM(
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): Promise<UIStrategy> {
    const llmAvailable = await isLLMAvailable();

    if (!llmAvailable || endpoints.length === 0) {
      // Fallback: deterministic strategy
      return this.buildDeterministicUIStrategy(endpoints, dtos, input);
    }

    try {
      this.llmCalls++;
      const prompt = this.buildUIStrategyPrompt(endpoints, dtos, input);
      const result = await llmGenerateJSON<UIStrategy>(prompt, {
        maxTokens: 2000,
        temperature: 0.3,
      });

      if (result) {
        this.emit({ type: "llm_call", message: "Strategie UI generee par l'IA", data: { strategy: result } });
        return result;
      }
    } catch (err) {
      this.emit({ type: "warning", message: `LLM UI strategy failed, using deterministic fallback: ${err}` });
    }

    return this.buildDeterministicUIStrategy(endpoints, dtos, input);
  }

  private buildUIStrategyPrompt(
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): string {
    const endpointSummary = endpoints.map(e =>
      `${e.method} ${e.path} -> ${e.methodName}(${e.requestDto || ""}) : ${e.responseDto || "void"}`
    ).join("\n");

    const dtoSummary = dtos.map(d =>
      `${d.name}: { ${d.fields.map(f => `${f.name}: ${f.tsType}`).join(", ")} }`
    ).join("\n");

    return `Tu es un architecte frontend expert. Analyse ces endpoints REST et DTOs d'un backend Spring Boot
migre depuis du Java EE legacy, et propose une strategie UI pour le framework ${input.framework}.

Domaine metier: ${input.detectedDomain.label} (${input.detectedDomain.primary})
Technologies legacy: ${input.technologiesDetected.join(", ")}

ENDPOINTS:
${endpointSummary}

DTOS:
${dtoSummary}

Retourne un JSON avec cette structure:
{
  "pages": [
    {
      "name": "string (nom de la page)",
      "route": "string (route URL)",
      "description": "string (description de la page)",
      "endpoints": ["string (paths des endpoints utilises)"],
      "components": ["string (composants UI necessaires)"],
      "layout": "list | form | detail | dashboard | table",
      "priority": "high | medium | low"
    }
  ],
  "sharedComponents": ["string (composants partages a generer)"],
  "navigationStructure": "sidebar | topnav | tabs",
  "authRequired": true/false,
  "domainSpecificUI": "string (recommandations UI specifiques au domaine)"
}`;
  }

  private buildDeterministicUIStrategy(
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): UIStrategy {
    // Group endpoints by controller/domain
    const controllerGroups = new Map<string, ExtractedEndpoint[]>();
    for (const ep of endpoints) {
      const group = ep.controller.replace(/Controller$/, "");
      if (!controllerGroups.has(group)) controllerGroups.set(group, []);
      controllerGroups.get(group)!.push(ep);
    }

    const pages: UIStrategyPage[] = [];
    for (const [group, eps] of controllerGroups) {
      const hasGetAll = eps.some(e => e.method === "GET" && !e.pathVariables.length);
      const hasGetById = eps.some(e => e.method === "GET" && e.pathVariables.length > 0);
      const hasCreate = eps.some(e => e.method === "POST");
      const hasUpdate = eps.some(e => e.method === "PUT" || e.method === "PATCH");
      const hasDelete = eps.some(e => e.method === "DELETE");

      // List page
      if (hasGetAll) {
        pages.push({
          name: `${group}List`,
          route: `/${this.kebabCase(group)}`,
          description: `Liste des ${group.toLowerCase()}s avec recherche et pagination`,
          endpoints: eps.filter(e => e.method === "GET" && !e.pathVariables.length).map(e => e.path),
          components: ["DataTable", "SearchBar", "Pagination"],
          layout: "table",
          priority: "high",
        });
      }

      // Detail page
      if (hasGetById) {
        pages.push({
          name: `${group}Detail`,
          route: `/${this.kebabCase(group)}/:id`,
          description: `Detail d'un(e) ${group.toLowerCase()} avec actions`,
          endpoints: eps.filter(e => e.method === "GET" && e.pathVariables.length > 0).map(e => e.path),
          components: ["DetailCard", "ActionButtons"],
          layout: "detail",
          priority: "medium",
        });
      }

      // Form page (create/edit)
      if (hasCreate || hasUpdate) {
        pages.push({
          name: `${group}Form`,
          route: hasCreate ? `/${this.kebabCase(group)}/new` : `/${this.kebabCase(group)}/:id/edit`,
          description: `Formulaire de creation/edition d'un(e) ${group.toLowerCase()}`,
          endpoints: eps.filter(e => e.method === "POST" || e.method === "PUT" || e.method === "PATCH").map(e => e.path),
          components: ["Form", "FormField", "SubmitButton", "ValidationErrors"],
          layout: "form",
          priority: "high",
        });
      }
    }

    // Add dashboard page
    pages.unshift({
      name: "Dashboard",
      route: "/",
      description: "Tableau de bord principal avec vue d'ensemble",
      endpoints: [],
      components: ["StatsCard", "RecentActivity", "QuickActions"],
      layout: "dashboard",
      priority: "high",
    });

    return {
      pages,
      sharedComponents: ["Layout", "Navbar", "Sidebar", "LoadingSpinner", "ErrorBoundary", "Toast"],
      navigationStructure: pages.length > 5 ? "sidebar" : "topnav",
      authRequired: true,
      domainSpecificUI: this.getDomainSpecificUIHint(input.detectedDomain),
    };
  }

  // =====================================================================
  // Step 3: Generate project scaffold
  // =====================================================================

  private generateScaffold(input: FrontendGeneratorInput): GeneratedFile[] {
    const prefix = `frontend/${input.projectName}-ui`;

    switch (input.framework) {
      case "react":
        return this.generateReactScaffold(prefix, input);
      case "angular":
        return this.generateAngularScaffold(prefix, input);
      case "vue":
        return this.generateVueScaffold(prefix, input);
      case "thymeleaf":
        return this.generateThymeleafScaffold(prefix, input);
      case "jsf":
        return this.generateJsfScaffold(prefix, input);
    }
  }

  private generateReactScaffold(prefix: string, input: FrontendGeneratorInput): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // package.json
    files.push({
      path: `${prefix}/package.json`,
      content: JSON.stringify({
        name: `${input.projectName}-ui`,
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc && vite build",
          preview: "vite preview",
          lint: "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
        },
        dependencies: {
          react: "^18.3.1",
          "react-dom": "^18.3.1",
          "react-router-dom": "^6.26.0",
          axios: "^1.7.4",
          "lucide-react": "^0.441.0",
          "tailwindcss": "^3.4.10",
          "@headlessui/react": "^2.1.3",
          "react-hook-form": "^7.53.0",
          "react-hot-toast": "^2.4.1",
        },
        devDependencies: {
          "@types/react": "^18.3.4",
          "@types/react-dom": "^18.3.0",
          "@vitejs/plugin-react": "^4.3.1",
          typescript: "^5.5.4",
          vite: "^5.4.2",
          autoprefixer: "^10.4.20",
          postcss: "^8.4.41",
        },
      }, null, 2),
      category: "config",
      technology: "JSP", // Source technology
    });

    // tsconfig.json
    files.push({
      path: `${prefix}/tsconfig.json`,
      content: JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          useDefineForClassFields: true,
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: "force",
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
        include: ["src"],
        references: [{ path: "./tsconfig.node.json" }],
      }, null, 2),
      category: "config",
      technology: "JSP",
    });

    // vite.config.ts
    files.push({
      path: `${prefix}/vite.config.ts`,
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3001,
    proxy: {
      // TODO: [CONFIGURATION] Ajuster l'URL du backend Spring Boot.
      // Pourquoi : Le frontend doit communiquer avec le backend via un proxy en dev.
      // Comment : Remplacer http://localhost:8080 par l'URL de votre backend.
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
`,
      category: "config",
      technology: "JSP",
    });

    // tailwind.config.js
    files.push({
      path: `${prefix}/tailwind.config.js`,
      content: `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};
`,
      category: "config",
      technology: "JSP",
    });

    // index.html
    files.push({
      path: `${prefix}/index.html`,
      content: `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${input.projectName} - Application Modernisee</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
      category: "config",
      technology: "JSP",
    });

    // src/main.tsx
    files.push({
      path: `${prefix}/src/main.tsx`,
      content: `/**
 * Point d'entree de l'application React.
 * Genere automatiquement par EJB Client Modernizer.
 *
 * @generated Migration depuis ${input.technologiesDetected.join(", ")}
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-right" />
    </BrowserRouter>
  </React.StrictMode>
);
`,
      category: "main",
      technology: "JSP",
    });

    // src/index.css
    files.push({
      path: `${prefix}/src/index.css`,
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Global styles - Application modernisee depuis Java EE legacy */
body {
  @apply bg-gray-50 text-gray-900 antialiased;
}
`,
      category: "config",
      technology: "JSP",
    });

    return files;
  }

  private generateAngularScaffold(prefix: string, input: FrontendGeneratorInput): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // package.json
    files.push({
      path: `${prefix}/package.json`,
      content: JSON.stringify({
        name: `${input.projectName}-ui`,
        version: "1.0.0",
        scripts: {
          ng: "ng",
          start: "ng serve --proxy-config proxy.conf.json",
          build: "ng build",
          test: "ng test",
          lint: "ng lint",
        },
        dependencies: {
          "@angular/animations": "^18.2.0",
          "@angular/cdk": "^18.2.0",
          "@angular/common": "^18.2.0",
          "@angular/compiler": "^18.2.0",
          "@angular/core": "^18.2.0",
          "@angular/forms": "^18.2.0",
          "@angular/material": "^18.2.0",
          "@angular/platform-browser": "^18.2.0",
          "@angular/platform-browser-dynamic": "^18.2.0",
          "@angular/router": "^18.2.0",
          rxjs: "~7.8.0",
          tslib: "^2.6.0",
          "zone.js": "~0.14.0",
        },
        devDependencies: {
          "@angular-devkit/build-angular": "^18.2.0",
          "@angular/cli": "^18.2.0",
          "@angular/compiler-cli": "^18.2.0",
          typescript: "~5.5.0",
        },
      }, null, 2),
      category: "config",
      technology: "JSP",
    });

    // proxy.conf.json
    files.push({
      path: `${prefix}/proxy.conf.json`,
      content: JSON.stringify({
        "/api": {
          target: "http://localhost:8080",
          secure: false,
          changeOrigin: true,
        },
      }, null, 2),
      category: "config",
      technology: "JSP",
    });

    return files;
  }

  private generateVueScaffold(prefix: string, input: FrontendGeneratorInput): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // package.json
    files.push({
      path: `${prefix}/package.json`,
      content: JSON.stringify({
        name: `${input.projectName}-ui`,
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: {
          dev: "vite",
          build: "vue-tsc && vite build",
          preview: "vite preview",
        },
        dependencies: {
          vue: "^3.4.38",
          "vue-router": "^4.4.3",
          pinia: "^2.2.2",
          axios: "^1.7.4",
        },
        devDependencies: {
          "@vitejs/plugin-vue": "^5.1.2",
          typescript: "^5.5.4",
          "vue-tsc": "^2.0.29",
          vite: "^5.4.2",
          tailwindcss: "^3.4.10",
          autoprefixer: "^10.4.20",
          postcss: "^8.4.41",
        },
      }, null, 2),
      category: "config",
      technology: "JSP",
    });

    return files;
  }

  private generateThymeleafScaffold(prefix: string, input: FrontendGeneratorInput): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const basePackage = input.basePackage || "com.example.app";
    const packagePath = basePackage.replace(/\./g, "/");

    // pom.xml additions (Thymeleaf + Bootstrap WebJars)
    files.push({
      path: `${prefix}/pom-additions.xml`,
      content: `<!-- Thymeleaf & UI dependencies to add to your Spring Boot pom.xml -->\n<dependencies>\n  <dependency>\n    <groupId>org.springframework.boot</groupId>\n    <artifactId>spring-boot-starter-thymeleaf</artifactId>\n  </dependency>\n  <dependency>\n    <groupId>org.webjars</groupId>\n    <artifactId>bootstrap</artifactId>\n    <version>5.3.3</version>\n  </dependency>\n  <dependency>\n    <groupId>org.webjars</groupId>\n    <artifactId>webjars-locator-core</artifactId>\n    <version>0.59</version>\n  </dependency>\n  <dependency>\n    <groupId>nz.net.ultraq.thymeleaf</groupId>\n    <artifactId>thymeleaf-layout-dialect</artifactId>\n    <version>3.3.0</version>\n  </dependency>\n</dependencies>`,
      category: "config",
      technology: "JSP",
    });

    // application.yml Thymeleaf config
    files.push({
      path: `${prefix}/application-thymeleaf.yml`,
      content: `# Thymeleaf configuration\nspring:\n  thymeleaf:\n    prefix: classpath:/templates/\n    suffix: .html\n    mode: HTML\n    encoding: UTF-8\n    cache: false  # Set to true in production\n  web:\n    resources:\n      static-locations: classpath:/static/`,
      category: "config",
      technology: "JSP",
    });

    // Base layout template (Thymeleaf Layout Dialect)
    files.push({
      path: `${prefix}/src/main/resources/templates/layout/base.html`,
      content: `<!DOCTYPE html>\n<html xmlns:th="http://www.thymeleaf.org"\n      xmlns:layout="http://www.ultraq.net.nz/thymeleaf/layout"\n      lang="fr">\n<head>\n  <meta charset="UTF-8"/>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n  <title layout:title-pattern="$LAYOUT_TITLE - $CONTENT_TITLE">${input.projectName}</title>\n  <link rel="stylesheet" th:href="@{/webjars/bootstrap/css/bootstrap.min.css}"/>\n  <link rel="stylesheet" th:href="@{/css/style.css}"/>\n</head>\n<body>\n  <!-- Navbar -->\n  <nav class="navbar navbar-expand-lg navbar-dark bg-primary">\n    <div class="container">\n      <a class="navbar-brand" th:href="@{/}">${input.projectName}</a>\n      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">\n        <span class="navbar-toggler-icon"></span>\n      </button>\n      <div class="collapse navbar-collapse" id="navbarNav">\n        <ul class="navbar-nav" id="main-nav">\n          <!-- Navigation items will be generated per entity -->\n        </ul>\n      </div>\n    </div>\n  </nav>\n\n  <!-- Main content -->\n  <main class="container mt-4">\n    <div layout:fragment="content"></div>\n  </main>\n\n  <!-- Footer -->\n  <footer class="bg-light text-center py-3 mt-5">\n    <p class="text-muted mb-0">&copy; 2024 ${input.projectName} - Genere par EJB Client Modernizer</p>\n  </footer>\n\n  <script th:src="@{/webjars/bootstrap/js/bootstrap.bundle.min.js}"></script>\n</body>\n</html>`,
      category: "config",
      technology: "JSP",
    });

    // Static CSS
    files.push({
      path: `${prefix}/src/main/resources/static/css/style.css`,
      content: `/* Custom styles for ${input.projectName} */\n.card-hover:hover {\n  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);\n  transform: translateY(-2px);\n  transition: all 0.3s ease;\n}\n.table-actions .btn {\n  padding: 0.25rem 0.5rem;\n  font-size: 0.875rem;\n}\n.page-header {\n  border-bottom: 2px solid #0d6efd;\n  padding-bottom: 0.5rem;\n  margin-bottom: 1.5rem;\n}`,
      category: "config",
      technology: "JSP",
    });

    // Index/Dashboard page
    files.push({
      path: `${prefix}/src/main/resources/templates/index.html`,
      content: `<!DOCTYPE html>\n<html xmlns:th="http://www.thymeleaf.org"\n      xmlns:layout="http://www.ultraq.net.nz/thymeleaf/layout"\n      layout:decorate="~{layout/base}">\n<head><title>Accueil</title></head>\n<body>\n<div layout:fragment="content">\n  <h1 class="page-header">Tableau de bord</h1>\n  <div class="row">\n    <div class="col-md-4 mb-3" th:each="stat : \${stats}">\n      <div class="card card-hover">\n        <div class="card-body text-center">\n          <h5 class="card-title" th:text="\${stat.label}">Label</h5>\n          <p class="display-4" th:text="\${stat.value}">0</p>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>\n</body>\n</html>`,
      category: "controller",
      technology: "JSP",
    });

    // HomeController (Spring MVC)
    files.push({
      path: `${prefix}/src/main/java/${packagePath}/web/HomeController.java`,
      content: `package ${basePackage}.web;\n\nimport org.springframework.stereotype.Controller;\nimport org.springframework.ui.Model;\nimport org.springframework.web.bind.annotation.GetMapping;\n\nimport java.util.List;\nimport java.util.Map;\n\n/**\n * HomeController - Controleur principal pour le tableau de bord.\n *\n * @generated EJB Client Modernizer v10.8\n */\n@Controller\npublic class HomeController {\n\n    @GetMapping("/")\n    public String index(Model model) {\n        // TODO: [INTEGRATION] Injecter les vrais services pour les statistiques.\n        model.addAttribute("stats", List.of(\n            Map.of("label", "Total", "value", 0)\n        ));\n        return "index";\n    }\n}`,
      category: "controller",
      technology: "JSP",
    });

    return files;
  }

  // =====================================================================
  // JSF/PrimeFaces Scaffold
  // =====================================================================

  private generateJsfScaffold(prefix: string, input: FrontendGeneratorInput): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const basePackage = input.basePackage || "com.example.app";
    const packagePath = basePackage.replace(/\./g, "/");

    // pom.xml additions (JSF + PrimeFaces)
    files.push({
      path: `${prefix}/pom-additions.xml`,
      content: `<!-- JSF & PrimeFaces dependencies to add to your Spring Boot pom.xml -->\n<dependencies>\n  <dependency>\n    <groupId>org.joinfaces</groupId>\n    <artifactId>primefaces-spring-boot-starter</artifactId>\n    <version>5.3.3</version>\n  </dependency>\n  <dependency>\n    <groupId>org.primefaces</groupId>\n    <artifactId>primefaces</artifactId>\n    <version>14.0.5</version>\n    <classifier>jakarta</classifier>\n  </dependency>\n  <dependency>\n    <groupId>org.primefaces.themes</groupId>\n    <artifactId>all-themes</artifactId>\n    <version>1.0.10</version>\n  </dependency>\n  <dependency>\n    <groupId>org.glassfish</groupId>\n    <artifactId>jakarta.faces</artifactId>\n    <version>4.0.7</version>\n  </dependency>\n</dependencies>`,
      category: "config",
      technology: "JSP",
    });

    // application.yml JSF config
    files.push({
      path: `${prefix}/application-jsf.yml`,
      content: `# JSF/PrimeFaces configuration\nserver:\n  servlet:\n    context-path: /\njoinfaces:\n  primefaces:\n    theme: saga\n    font-awesome: true\n  jsf:\n    project-stage: Development  # Set to Production in prod`,
      category: "config",
      technology: "JSP",
    });

    // Base template (Facelets)
    files.push({
      path: `${prefix}/src/main/resources/META-INF/resources/WEB-INF/templates/layout.xhtml`,
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"\n      xmlns:h="jakarta.faces.html"\n      xmlns:f="jakarta.faces.core"\n      xmlns:p="http://primefaces.org/ui"\n      xmlns:ui="jakarta.faces.facelets">\n<h:head>\n  <title>${input.projectName} - <ui:insert name="title">Accueil</ui:insert></title>\n  <h:outputStylesheet library="primefaces" name="primefaces.css"/>\n</h:head>\n<h:body>\n  <!-- Top Menubar -->\n  <p:menubar>\n    <p:menuitem value="Accueil" url="/" icon="pi pi-home"/>\n    <ui:insert name="menuItems"/>\n  </p:menubar>\n\n  <!-- Content -->\n  <div class="ui-g" style="padding: 1em;">\n    <ui:insert name="content">Contenu par defaut</ui:insert>\n  </div>\n\n  <!-- Footer -->\n  <div class="ui-g" style="text-align:center; padding:1em; border-top:1px solid #dee2e6;">\n    <p>&copy; 2024 ${input.projectName} - Genere par EJB Client Modernizer</p>\n  </div>\n</h:body>\n</html>`,
      category: "config",
      technology: "JSP",
    });

    // Index page
    files.push({
      path: `${prefix}/src/main/resources/META-INF/resources/index.xhtml`,
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"\n      xmlns:h="jakarta.faces.html"\n      xmlns:p="http://primefaces.org/ui"\n      xmlns:ui="jakarta.faces.facelets">\n<ui:composition template="/WEB-INF/templates/layout.xhtml">\n  <ui:define name="title">Tableau de bord</ui:define>\n  <ui:define name="content">\n    <h:form>\n      <p:panel header="Tableau de bord">\n        <p:dashboard id="board">\n          <p:panel header="Statistiques">\n            <p>Bienvenue sur ${input.projectName}</p>\n          </p:panel>\n        </p:dashboard>\n      </p:panel>\n    </h:form>\n  </ui:define>\n</ui:composition>\n</html>`,
      category: "controller",
      technology: "JSP",
    });

    // IndexBean (CDI Managed Bean)
    files.push({
      path: `${prefix}/src/main/java/${packagePath}/web/IndexBean.java`,
      content: `package ${basePackage}.web;\n\nimport jakarta.enterprise.context.RequestScoped;\nimport jakarta.inject.Named;\n\n/**\n * IndexBean - Managed Bean pour la page d'accueil.\n *\n * @generated EJB Client Modernizer v10.8\n */\n@Named\n@RequestScoped\npublic class IndexBean {\n\n    public String getWelcomeMessage() {\n        return "Bienvenue sur ${input.projectName}";\n    }\n}`,
      category: "controller",
      technology: "JSP",
    });

    return files;
  }

  // =====================================================================
  // Server-Rendered Pages (Thymeleaf / JSF) — CRUD per entity
  // =====================================================================

  private generateServerRenderedPages(
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    strategy: UIStrategy,
    input: FrontendGeneratorInput,
  ): GeneratedFile[] {
    if (input.framework === "thymeleaf") {
      return this.generateThymeleafCrudPages(endpoints, dtos, input);
    } else {
      return this.generateJsfCrudPages(endpoints, dtos, input);
    }
  }

  private generateThymeleafCrudPages(
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const prefix = `frontend/${input.projectName}-ui`;
    const basePackage = input.basePackage || "com.example.app";
    const packagePath = basePackage.replace(/\./g, "/");

    // Group endpoints by controller/entity
    const groups = new Map<string, ExtractedEndpoint[]>();
    for (const ep of endpoints) {
      const group = ep.controller.replace(/Controller$/, "");
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(ep);
    }

    // Update base layout navigation with entity links
    const navItems = Array.from(groups.keys()).map(g =>
      `          <li class="nav-item"><a class="nav-link" th:href="@{/${this.kebabCase(g)}}">${g}</a></li>`
    ).join("\n");

    files.push({
      path: `${prefix}/src/main/resources/templates/fragments/nav.html`,
      content: `<!-- Navigation fragment - Genere par EJB Client Modernizer -->\n<nav th:fragment="navigation" class="navbar navbar-expand-lg navbar-dark bg-primary">\n  <div class="container">\n    <a class="navbar-brand" th:href="@{/}">${input.projectName}</a>\n    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">\n      <span class="navbar-toggler-icon"></span>\n    </button>\n    <div class="collapse navbar-collapse" id="navbarNav">\n      <ul class="navbar-nav">\n${navItems}\n      </ul>\n    </div>\n  </div>\n</nav>`,
      category: "config",
      technology: "JSP",
    });

    // Pagination fragment
    files.push({
      path: `${prefix}/src/main/resources/templates/fragments/pagination.html`,
      content: `<!-- Pagination fragment -->\n<nav th:fragment="pagination(page, totalPages, baseUrl)" aria-label="Navigation">\n  <ul class="pagination justify-content-center">\n    <li class="page-item" th:classappend="\${page == 0 ? 'disabled' : ''}">\n      <a class="page-link" th:href="@{\${baseUrl}(page=\${page - 1})}">Precedent</a>\n    </li>\n    <li class="page-item" th:each="i : \${#numbers.sequence(0, totalPages - 1)}"\n        th:classappend="\${i == page ? 'active' : ''}">\n      <a class="page-link" th:href="@{\${baseUrl}(page=\${i})}" th:text="\${i + 1}">1</a>\n    </li>\n    <li class="page-item" th:classappend="\${page == totalPages - 1 ? 'disabled' : ''}">\n      <a class="page-link" th:href="@{\${baseUrl}(page=\${page + 1})}">Suivant</a>\n    </li>\n  </ul>\n</nav>`,
      category: "config",
      technology: "JSP",
    });

    // Generate CRUD pages + controller for each entity
    for (const [group, eps] of groups) {
      const kebab = this.kebabCase(group);
      const dto = dtos.find(d => d.name.includes(group));
      const fields = dto ? dto.fields : [{ name: "id", type: "Long", tsType: "number", required: true, description: "Identifiant" }];

      const hasGetAll = eps.some(e => e.method === "GET" && !e.pathVariables.length);
      const hasGetById = eps.some(e => e.method === "GET" && e.pathVariables.length > 0);
      const hasCreate = eps.some(e => e.method === "POST");
      const hasUpdate = eps.some(e => e.method === "PUT" || e.method === "PATCH");
      const hasDelete = eps.some(e => e.method === "DELETE");

      // --- list.html ---
      if (hasGetAll) {
        const tableHeaders = fields.map(f => `          <th>${f.name}</th>`).join("\n");
        const tableCells = fields.map(f => `          <td th:text="\${item.${f.name}}">-</td>`).join("\n");

        files.push({
          path: `${prefix}/src/main/resources/templates/${kebab}/list.html`,
          content: `<!DOCTYPE html>\n<html xmlns:th="http://www.thymeleaf.org"\n      xmlns:layout="http://www.ultraq.net.nz/thymeleaf/layout"\n      layout:decorate="~{layout/base}">\n<head><title>Liste ${group}</title></head>\n<body>\n<div layout:fragment="content">\n  <div class="d-flex justify-content-between align-items-center page-header">\n    <h1>Liste des ${group}</h1>\n    ${hasCreate ? `<a th:href="@{/${kebab}/new}" class="btn btn-primary"><i class="bi bi-plus"></i> Nouveau</a>` : ""}\n  </div>\n\n  <!-- Search -->\n  <form th:action="@{/${kebab}}" method="get" class="mb-3">\n    <div class="input-group">\n      <input type="text" name="search" th:value="\${search}" class="form-control" placeholder="Rechercher..."/>\n      <button class="btn btn-outline-secondary" type="submit">Rechercher</button>\n    </div>\n  </form>\n\n  <!-- Table -->\n  <div class="table-responsive">\n    <table class="table table-striped table-hover">\n      <thead class="table-dark">\n        <tr>\n${tableHeaders}\n          <th>Actions</th>\n        </tr>\n      </thead>\n      <tbody>\n        <tr th:each="item : \${items}">\n${tableCells}\n          <td class="table-actions">\n            ${hasGetById ? `<a th:href="@{/${kebab}/{id}(id=\${item.id})}" class="btn btn-sm btn-info">Voir</a>` : ""}\n            ${hasUpdate ? `<a th:href="@{/${kebab}/{id}/edit(id=\${item.id})}" class="btn btn-sm btn-warning">Modifier</a>` : ""}\n            ${hasDelete ? `<form th:action="@{/${kebab}/{id}/delete(id=\${item.id})}" method="post" style="display:inline"><button class="btn btn-sm btn-danger" onclick="return confirm('Confirmer la suppression ?')">Supprimer</button></form>` : ""}\n          </td>\n        </tr>\n      </tbody>\n    </table>\n  </div>\n\n  <!-- Pagination -->\n  <div th:replace="~{fragments/pagination :: pagination(\${page}, \${totalPages}, '/${kebab}')}"></div>\n\n  <p th:if="\${#lists.isEmpty(items)}" class="text-muted text-center mt-3">Aucun element trouve.</p>\n</div>\n</body>\n</html>`,
          category: "controller",
          technology: "JSP",
        });
      }

      // --- form.html ---
      if (hasCreate || hasUpdate) {
        const formFields = fields.filter(f => f.name !== "id").map(f => {
          const inputType = f.tsType === "number" ? "number" : f.tsType === "boolean" ? "checkbox" : "text";
          return `    <div class="mb-3">\n      <label for="${f.name}" class="form-label">${f.name}${f.required ? " *" : ""}</label>\n      <input type="${inputType}" id="${f.name}" name="${f.name}" th:value="\${item.${f.name}}"\n             class="form-control" ${f.required ? "required" : ""}/>\n    </div>`;
        }).join("\n");

        files.push({
          path: `${prefix}/src/main/resources/templates/${kebab}/form.html`,
          content: `<!DOCTYPE html>\n<html xmlns:th="http://www.thymeleaf.org"\n      xmlns:layout="http://www.ultraq.net.nz/thymeleaf/layout"\n      layout:decorate="~{layout/base}">\n<head><title th:text="\${item.id != null ? 'Modifier' : 'Creer'} + ' ${group}'">Formulaire</title></head>\n<body>\n<div layout:fragment="content">\n  <h1 class="page-header" th:text="\${item.id != null ? 'Modifier ${group}' : 'Nouveau ${group}'}">Formulaire</h1>\n\n  <div th:if="\${error}" class="alert alert-danger" th:text="\${error}"></div>\n  <div th:if="\${success}" class="alert alert-success" th:text="\${success}"></div>\n\n  <form th:action="@{/${kebab}/save}" method="post" class="needs-validation">\n    <input type="hidden" name="id" th:value="\${item.id}"/>\n${formFields}\n    <div class="d-flex gap-2">\n      <button type="submit" class="btn btn-primary">Enregistrer</button>\n      <a th:href="@{/${kebab}}" class="btn btn-secondary">Annuler</a>\n    </div>\n  </form>\n</div>\n</body>\n</html>`,
          category: "controller",
          technology: "JSP",
        });
      }

      // --- detail.html ---
      if (hasGetById) {
        const detailFields = fields.map(f =>
          `    <tr>\n      <th>${f.name}</th>\n      <td th:text="\${item.${f.name}}">-</td>\n    </tr>`
        ).join("\n");

        files.push({
          path: `${prefix}/src/main/resources/templates/${kebab}/detail.html`,
          content: `<!DOCTYPE html>\n<html xmlns:th="http://www.thymeleaf.org"\n      xmlns:layout="http://www.ultraq.net.nz/thymeleaf/layout"\n      layout:decorate="~{layout/base}">\n<head><title>Detail ${group}</title></head>\n<body>\n<div layout:fragment="content">\n  <div class="d-flex justify-content-between align-items-center page-header">\n    <h1>Detail ${group}</h1>\n    <div>\n      ${hasUpdate ? `<a th:href="@{/${kebab}/{id}/edit(id=\${item.id})}" class="btn btn-warning">Modifier</a>` : ""}\n      <a th:href="@{/${kebab}}" class="btn btn-secondary">Retour</a>\n    </div>\n  </div>\n\n  <table class="table table-bordered">\n    <tbody>\n${detailFields}\n    </tbody>\n  </table>\n</div>\n</body>\n</html>`,
          category: "controller",
          technology: "JSP",
        });
      }

      // --- Spring MVC Controller for this entity ---
      const controllerMethods: string[] = [];

      if (hasGetAll) {
        controllerMethods.push(`    @GetMapping\n    public String list(@RequestParam(defaultValue = "") String search,\n                       @RequestParam(defaultValue = "0") int page,\n                       Model model) {\n        // TODO: [INTEGRATION] Injecter le service ${group}Service et appeler findAll/search\n        model.addAttribute("items", List.of());\n        model.addAttribute("search", search);\n        model.addAttribute("page", page);\n        model.addAttribute("totalPages", 1);\n        return "${kebab}/list";\n    }`);
      }

      if (hasGetById) {
        controllerMethods.push(`    @GetMapping("/{id}")\n    public String detail(@PathVariable Long id, Model model) {\n        // TODO: [INTEGRATION] Injecter le service ${group}Service et appeler findById\n        model.addAttribute("item", Map.of("id", id));\n        return "${kebab}/detail";\n    }`);
      }

      if (hasCreate) {
        controllerMethods.push(`    @GetMapping("/new")\n    public String createForm(Model model) {\n        model.addAttribute("item", Map.of());\n        return "${kebab}/form";\n    }`);
      }

      if (hasUpdate) {
        controllerMethods.push(`    @GetMapping("/{id}/edit")\n    public String editForm(@PathVariable Long id, Model model) {\n        // TODO: [INTEGRATION] Charger l'entite existante\n        model.addAttribute("item", Map.of("id", id));\n        return "${kebab}/form";\n    }`);
      }

      if (hasCreate || hasUpdate) {
        controllerMethods.push(`    @PostMapping("/save")\n    public String save(@RequestParam Map<String, String> params, RedirectAttributes redirectAttributes) {\n        // TODO: [INTEGRATION] Appeler ${group}Service.save(...)\n        redirectAttributes.addFlashAttribute("success", "${group} enregistre avec succes");\n        return "redirect:/${kebab}";\n    }`);
      }

      if (hasDelete) {
        controllerMethods.push(`    @PostMapping("/{id}/delete")\n    public String delete(@PathVariable Long id, RedirectAttributes redirectAttributes) {\n        // TODO: [INTEGRATION] Appeler ${group}Service.delete(id)\n        redirectAttributes.addFlashAttribute("success", "${group} supprime avec succes");\n        return "redirect:/${kebab}";\n    }`);
      }

      files.push({
        path: `${prefix}/src/main/java/${packagePath}/web/${group}WebController.java`,
        content: `package ${basePackage}.web;\n\nimport org.springframework.stereotype.Controller;\nimport org.springframework.ui.Model;\nimport org.springframework.web.bind.annotation.*;\nimport org.springframework.web.servlet.mvc.support.RedirectAttributes;\n\nimport java.util.List;\nimport java.util.Map;\n\n/**\n * ${group}WebController - Controleur Spring MVC pour les pages CRUD ${group}.\n *\n * TODO: [INTEGRATION] Injecter ${group}Service pour les operations CRUD reelles.\n * Pourquoi : Ce controleur utilise des donnees stub qui doivent etre remplacees.\n * Comment : @Autowired private ${group}Service ${group.charAt(0).toLowerCase() + group.slice(1)}Service;\n *\n * @generated EJB Client Modernizer v10.8\n */\n@Controller\n@RequestMapping("/${kebab}")\npublic class ${group}WebController {\n\n${controllerMethods.join("\n\n")}\n}`,
        category: "controller",
        technology: "JSP",
      });
    }

    return files;
  }

  private generateJsfCrudPages(
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const prefix = `frontend/${input.projectName}-ui`;
    const basePackage = input.basePackage || "com.example.app";
    const packagePath = basePackage.replace(/\./g, "/");

    // Group endpoints by controller/entity
    const groups = new Map<string, ExtractedEndpoint[]>();
    for (const ep of endpoints) {
      const group = ep.controller.replace(/Controller$/, "");
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(ep);
    }

    // Generate CRUD pages + managed bean for each entity
    for (const [group, eps] of groups) {
      const kebab = this.kebabCase(group);
      const dto = dtos.find(d => d.name.includes(group));
      const fields = dto ? dto.fields : [{ name: "id", type: "Long", tsType: "number", required: true, description: "Identifiant" }];

      const hasGetAll = eps.some(e => e.method === "GET" && !e.pathVariables.length);
      const hasCreate = eps.some(e => e.method === "POST");
      const hasUpdate = eps.some(e => e.method === "PUT" || e.method === "PATCH");
      const hasDelete = eps.some(e => e.method === "DELETE");

      // --- list.xhtml (PrimeFaces DataTable) ---
      if (hasGetAll) {
        const columns = fields.map(f =>
          `        <p:column headerText="${f.name}" sortBy="#{item.${f.name}}" filterBy="#{item.${f.name}}">\n          <h:outputText value="#{item.${f.name}}"/>\n        </p:column>`
        ).join("\n");

        files.push({
          path: `${prefix}/src/main/resources/META-INF/resources/${kebab}/list.xhtml`,
          content: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"\n      xmlns:h="jakarta.faces.html"\n      xmlns:p="http://primefaces.org/ui"\n      xmlns:ui="jakarta.faces.facelets">\n<ui:composition template="/WEB-INF/templates/layout.xhtml">\n  <ui:define name="title">Liste ${group}</ui:define>\n  <ui:define name="content">\n    <h:form id="${kebab}Form">\n      <p:panel header="Liste des ${group}">\n        <p:dataTable id="${kebab}Table" var="item" value="#{${group.charAt(0).toLowerCase() + group.slice(1)}Bean.items}"\n                     paginator="true" rows="10"\n                     paginatorTemplate="{CurrentPageReport} {FirstPageLink} {PreviousPageLink} {PageLinks} {NextPageLink} {LastPageLink} {RowsPerPageDropdown}"\n                     rowsPerPageTemplate="5,10,20,50">\n${columns}\n          <p:column headerText="Actions" style="width:200px">\n            ${hasUpdate ? `<p:commandButton value="Modifier" action="#{${group.charAt(0).toLowerCase() + group.slice(1)}Bean.edit(item)}" icon="pi pi-pencil" styleClass="ui-button-warning"/>` : ""}\n            ${hasDelete ? `<p:commandButton value="Supprimer" action="#{${group.charAt(0).toLowerCase() + group.slice(1)}Bean.delete(item)}" icon="pi pi-trash" styleClass="ui-button-danger"\n                            onclick="return confirm('Confirmer la suppression ?')"/>` : ""}\n          </p:column>\n        </p:dataTable>\n        ${hasCreate ? `<p:commandButton value="Nouveau" action="#{${group.charAt(0).toLowerCase() + group.slice(1)}Bean.prepareCreate()}" icon="pi pi-plus" styleClass="ui-button-success" style="margin-top:1em"/>` : ""}\n      </p:panel>\n    </h:form>\n  </ui:define>\n</ui:composition>\n</html>`,
          category: "controller",
          technology: "JSP",
        });
      }

      // --- Managed Bean ---
      const beanName = group.charAt(0).toLowerCase() + group.slice(1) + "Bean";
      files.push({
        path: `${prefix}/src/main/java/${packagePath}/web/${group}Bean.java`,
        content: `package ${basePackage}.web;\n\nimport jakarta.faces.view.ViewScoped;\nimport jakarta.inject.Named;\nimport java.io.Serializable;\nimport java.util.ArrayList;\nimport java.util.List;\n\n/**\n * ${group}Bean - Managed Bean JSF pour les operations CRUD ${group}.\n *\n * TODO: [INTEGRATION] Injecter ${group}Service pour les operations CRUD reelles.\n * Pourquoi : Ce bean utilise des donnees stub qui doivent etre remplacees.\n * Comment : @Inject private ${group}Service service;\n *\n * @generated EJB Client Modernizer v10.8\n */\n@Named\n@ViewScoped\npublic class ${group}Bean implements Serializable {\n\n    private List<Object> items = new ArrayList<>();\n    private Object selected;\n\n    public List<Object> getItems() {\n        // TODO: [INTEGRATION] Remplacer par service.findAll()\n        return items;\n    }\n\n    ${hasCreate ? `public String prepareCreate() {\n        this.selected = null;\n        return "/${kebab}/form?faces-redirect=true";\n    }` : ""}\n\n    ${hasUpdate ? `public String edit(Object item) {\n        this.selected = item;\n        return "/${kebab}/form?faces-redirect=true";\n    }` : ""}\n\n    ${hasDelete ? `public void delete(Object item) {\n        // TODO: [INTEGRATION] Appeler service.delete(item)\n        items.remove(item);\n    }` : ""}\n\n    public Object getSelected() { return selected; }\n    public void setSelected(Object selected) { this.selected = selected; }\n}`,
        category: "controller",
        technology: "JSP",
      });
    }

    return files;
  }

  // =====================================================================
  // Step 4: Generate TypeScript models from DTOs
  // =====================================================================

  private generateModels(dtos: ExtractedDto[], input: FrontendGeneratorInput): GeneratedFile[] {
    const prefix = `frontend/${input.projectName}-ui/src`;
    const files: GeneratedFile[] = [];

    for (const dto of dtos) {
      const tsInterface = this.dtoToTypeScript(dto, input);
      files.push({
        path: `${prefix}/models/${dto.name}.ts`,
        content: tsInterface,
        category: "dto",
        technology: "JSP",
        sourceRef: dto.sourceRef,
      });
    }

    // Index barrel file
    if (dtos.length > 0) {
      const exports = dtos.map(d => `export type { ${d.name} } from "./${d.name}";`).join("\n");
      files.push({
        path: `${prefix}/models/index.ts`,
        content: `/**\n * Barrel export de tous les modeles TypeScript.\n * Genere depuis les DTOs du backend Spring Boot.\n * @generated\n */\n${exports}\n`,
        category: "dto",
        technology: "JSP",
      });
    }

    return files;
  }

  private dtoToTypeScript(dto: ExtractedDto, input: FrontendGeneratorInput): string {
    const fields = dto.fields.map(f => {
      const optional = f.required ? "" : "?";
      const comment = f.description ? `  /** ${f.description} */\n` : "";
      return `${comment}  ${f.name}${optional}: ${f.tsType};`;
    }).join("\n");

    return `/**
 * ${dto.name} - Modele TypeScript genere depuis le DTO backend.
 *
 * Source legacy : ${dto.sourceRef || "N/A"}
 * Domaine : ${input.detectedDomain.label}
 *
 * TODO: [VALIDATION] Verifier que tous les champs correspondent a la logique metier.
 * Pourquoi : La transformation automatique peut manquer des contraintes metier specifiques.
 * Comment : Comparer avec le DTO Java source et ajuster les types si necessaire.
 *
 * @generated EJB Client Modernizer v10.8
 */
export interface ${dto.name} {
${fields}
}
`;
  }

  // =====================================================================
  // Step 5: Generate API services
  // =====================================================================

  private generateServices(
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): GeneratedFile[] {
    const prefix = `frontend/${input.projectName}-ui/src`;
    const files: GeneratedFile[] = [];

    // API client configuration
    files.push({
      path: `${prefix}/services/api.ts`,
      content: this.generateApiClient(input),
      category: "service",
      technology: "JSP",
    });

    // Group endpoints by controller
    const groups = new Map<string, ExtractedEndpoint[]>();
    for (const ep of endpoints) {
      const group = ep.controller.replace(/Controller$/, "");
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(ep);
    }

    for (const [group, eps] of groups) {
      const serviceContent = this.generateServiceFile(group, eps, dtos, input);
      files.push({
        path: `${prefix}/services/${this.kebabCase(group)}.service.ts`,
        content: serviceContent,
        category: "service",
        technology: "JSP",
      });
    }

    return files;
  }

  private generateApiClient(input: FrontendGeneratorInput): string {
    if (input.framework === "thymeleaf") {
      // Thymeleaf uses server-side rendering, no API client needed
      return `// Thymeleaf/Spring MVC: pas de client HTTP necessaire.\n// Les donnees sont injectees directement dans le Model par les @Controller.\n`;
    }
    if (input.framework === "react" || input.framework === "vue") {
      return `/**
 * Configuration du client HTTP Axios.
 * Intercepteurs pour l'authentification et la gestion d'erreurs.
 *
 * TODO: [SECURITE] Configurer l'authentification (JWT, OAuth2, session).
 * Pourquoi : Le backend Spring Boot genere utilise Spring Security.
 * Comment : Ajouter le token JWT dans le header Authorization,
 *           ou configurer les cookies de session selon votre strategie d'auth.
 *
 * TODO: [CONFIGURATION] Ajuster la baseURL en production.
 * Pourquoi : En dev, le proxy Vite redirige /api vers le backend.
 *           En production, l'URL doit pointer vers le backend deploye.
 * Comment : Utiliser une variable d'environnement VITE_API_URL.
 *
 * @generated EJB Client Modernizer v10.8
 */
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Intercepteur de requete : ajouter le token d'authentification
api.interceptors.request.use(
  (config) => {
    // TODO: [SECURITE] Recuperer le token depuis le localStorage ou un store.
    // Pourquoi : Chaque requete API doit etre authentifiee.
    // Comment : const token = localStorage.getItem("auth_token");
    //           if (token) config.headers.Authorization = \`Bearer \${token}\`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercepteur de reponse : gestion globale des erreurs
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // TODO: [SECURITE] Rediriger vers la page de login.
      // Pourquoi : Le token a expire ou l'utilisateur n'est pas authentifie.
      // Comment : window.location.href = "/login";
      console.error("Non authentifie - redirection vers login necessaire");
    }
    if (error.response?.status === 403) {
      console.error("Acces interdit - permissions insuffisantes");
    }
    return Promise.reject(error);
  }
);

export default api;
`;
    }

    // Angular uses HttpClient, no need for axios
    return `// Angular utilise HttpClient nativement - voir les services generes.\n`;
  }

  private generateServiceFile(
    group: string,
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): string {
    const serviceName = `${group}Service`;
    const imports = new Set<string>();

    // Collect DTO imports
    for (const ep of endpoints) {
      if (ep.requestDto) imports.add(ep.requestDto);
      if (ep.responseDto && ep.responseDto !== "void") imports.add(ep.responseDto);
    }

    const importLines = imports.size > 0
      ? `import type { ${[...imports].join(", ")} } from "../models";\n`
      : "";

    const methods = endpoints.map(ep => this.generateServiceMethod(ep, input)).join("\n\n");

    return `/**
 * ${serviceName} - Service API pour le domaine ${group}.
 *
 * Genere depuis le controller ${group}Controller du backend Spring Boot.
 * Domaine metier : ${input.detectedDomain.label}
 *
 * Chaque methode correspond a un endpoint REST du backend.
 * Les types sont synchronises avec les DTOs generes.
 *
 * @generated EJB Client Modernizer v10.8
 */
import api from "./api";
${importLines}
/**
 * Service ${group} - Appels API vers le backend Spring Boot.
 *
 * TODO: [TESTING] Ecrire des tests unitaires pour chaque methode.
 * Pourquoi : Valider que les appels API fonctionnent correctement avec le backend.
 * Comment : Utiliser vitest + msw pour mocker les appels HTTP.
 */
${methods}
`;
  }

  private generateServiceMethod(ep: ExtractedEndpoint, input: FrontendGeneratorInput): string {
    const funcName = ep.methodName;
    const params: string[] = [];
    const axiosParams: string[] = [];

    // Path variables
    for (const pv of ep.pathVariables) {
      params.push(`${pv}: string | number`);
    }

    // Request body
    if (ep.requestDto) {
      params.push(`data: ${ep.requestDto}`);
    }

    // Query params
    if (ep.queryParams.length > 0) {
      const qpType = ep.queryParams.map(q => `${q}?: string`).join("; ");
      params.push(`params?: { ${qpType} }`);
    }

    // Build URL with path variables
    let url = ep.path;
    for (const pv of ep.pathVariables) {
      url = url.replace(`{${pv}}`, `\${${pv}}`);
    }

    const returnType = ep.responseDto && ep.responseDto !== "void"
      ? ep.responseDto
      : "void";

    const description = ep.description || `${ep.method} ${ep.path}`;

    let body: string;
    switch (ep.method) {
      case "GET":
        body = ep.queryParams.length > 0
          ? `  const response = await api.get<${returnType}>(\`${url}\`, { params });\n  return response.data;`
          : `  const response = await api.get<${returnType}>(\`${url}\`);\n  return response.data;`;
        break;
      case "POST":
        body = `  const response = await api.post<${returnType}>(\`${url}\`, ${ep.requestDto ? "data" : "{}"});\n  return response.data;`;
        break;
      case "PUT":
      case "PATCH":
        body = `  const response = await api.${ep.method.toLowerCase()}<${returnType}>(\`${url}\`, ${ep.requestDto ? "data" : "{}"});\n  return response.data;`;
        break;
      case "DELETE":
        body = `  const response = await api.delete<${returnType}>(\`${url}\`);\n  return response.data;`;
        break;
      default:
        body = `  // TODO: Implementer la methode ${ep.method}\n  throw new Error("Not implemented");`;
    }

    return `/**
 * ${description}
 * Endpoint: ${ep.method} ${ep.path}
 * Controller source: ${ep.controller}
 */
export async function ${funcName}(${params.join(", ")}): Promise<${returnType}> {
${body}
}`;
  }

  // =====================================================================
  // Step 6: Generate pages with LLM enrichment
  // =====================================================================

  private async generatePages(
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    strategy: UIStrategy,
    input: FrontendGeneratorInput,
  ): Promise<GeneratedFile[]> {
    const prefix = `frontend/${input.projectName}-ui/src`;
    const files: GeneratedFile[] = [];

    for (const page of strategy.pages) {
      let content: string;

      // Try LLM-enhanced generation
      const llmContent = await this.generatePageWithLLM(page, endpoints, dtos, input);
      if (llmContent) {
        content = llmContent;
        this.llmEnhancedFiles++;
      } else {
        // Fallback: deterministic generation
        content = this.generatePageDeterministic(page, endpoints, dtos, input);
      }

      files.push({
        path: `${prefix}/pages/${page.name}.tsx`,
        content,
        category: "controller", // Using controller as closest category
        technology: "JSP",
      });

      this.emit({ type: "file_generated", message: `Page generee: ${page.name}`, data: { page: page.name } });
    }

    return files;
  }

  private async generatePageWithLLM(
    page: UIStrategyPage,
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): Promise<string | null> {
    const llmAvailable = await isLLMAvailable();
    if (!llmAvailable) return null;

    try {
      this.llmCalls++;
      const prompt = `Tu es un developpeur frontend expert en ${input.framework} + TypeScript.
Genere le code complet pour la page "${page.name}" (${page.description}).

Framework: ${input.framework} + TypeScript
Layout: ${page.layout}
Route: ${page.route}
Domaine: ${input.detectedDomain.label}

Endpoints utilises:
${page.endpoints.map(ep => {
  const found = endpoints.find(e => e.path === ep);
  return found ? `  ${found.method} ${found.path} -> ${found.responseDto || "void"}` : `  ${ep}`;
}).join("\n")}

DTOs disponibles:
${dtos.map(d => `  ${d.name}: { ${d.fields.map(f => `${f.name}: ${f.tsType}`).join(", ")} }`).join("\n")}

Regles:
1. Code PRODUCTION-READY, zero erreur TypeScript
2. Utiliser TailwindCSS pour le styling
3. Gestion des etats: loading, error, empty, success
4. Chaque TODO doit expliquer QUOI, POURQUOI, COMMENT
5. Imports corrects depuis ../services/ et ../models/
6. Composant fonctionnel React avec hooks

Genere UNIQUEMENT le code TypeScript/TSX, sans markdown.`;

      const result = await llmGenerate(prompt, { maxTokens: 3000, temperature: 0.2 });
      if (result && result.length > 100) {
        // Clean up any markdown fences
        return result.replace(/^```(?:tsx?|javascript)?\n?/gm, "").replace(/```$/gm, "").trim();
      }
    } catch (err) {
      this.emit({ type: "warning", message: `LLM page generation failed for ${page.name}: ${err}` });
    }

    return null;
  }

  private generatePageDeterministic(
    page: UIStrategyPage,
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): string {
    switch (page.layout) {
      case "table":
      case "list":
        return this.generateListPage(page, endpoints, dtos, input);
      case "form":
        return this.generateFormPage(page, endpoints, dtos, input);
      case "detail":
        return this.generateDetailPage(page, endpoints, dtos, input);
      case "dashboard":
        return this.generateDashboardPage(page, endpoints, dtos, input);
      default:
        return this.generateGenericPage(page, input);
    }
  }

  private generateListPage(page: UIStrategyPage, endpoints: ExtractedEndpoint[], dtos: ExtractedDto[], input: FrontendGeneratorInput): string {
    const group = page.name.replace(/List$/, "");
    const dtoName = dtos.find(d => d.name.includes(group))?.name || "any";

    return `/**
 * ${page.name} - Page de liste ${group}.
 *
 * ${page.description}
 * Domaine : ${input.detectedDomain.label}
 *
 * TODO: [UX] Ajouter la pagination cote serveur.
 * Pourquoi : La pagination client-side ne scale pas avec de gros volumes de donnees.
 * Comment : Utiliser les query params ?page=X&size=Y dans l'appel API.
 *
 * TODO: [UX] Ajouter des filtres de recherche specifiques au domaine.
 * Pourquoi : Les utilisateurs metier ont besoin de filtrer par criteres specifiques.
 * Comment : Ajouter des champs de filtre bases sur les attributs du DTO ${dtoName}.
 *
 * @generated EJB Client Modernizer v10.8
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Search, AlertCircle } from "lucide-react";

/**
 * TODO: [INTEGRATION] Importer le service API genere.
 * Pourquoi : Le service contient les appels HTTP vers le backend Spring Boot.
 * Comment : Decommenter l'import ci-dessous une fois le backend deploye.
 */
// import { getAll${group} } from "../services/${this.kebabCase(group)}.service";

export default function ${page.name}() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      // TODO: [INTEGRATION] Remplacer par l'appel API reel.
      // Pourquoi : Les donnees mock doivent etre remplacees par les donnees du backend.
      // Comment : const data = await getAll${group}();
      //           setItems(data);
      setItems([]); // Placeholder - remplacer par l'appel API
    } catch (err) {
      setError("Erreur lors du chargement des donnees");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = items.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        <span className="ml-2 text-gray-600">Chargement...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        <AlertCircle className="w-6 h-6 mr-2" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">${group}s</h1>
        <Link
          to="/${this.kebabCase(group)}/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau
        </Link>
      </div>

      {/* Barre de recherche */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Liste */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>Aucun element trouve.</p>
          <p className="text-sm mt-1">Commencez par creer un(e) ${group.toLowerCase()}.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* TODO: [UX] Adapter les colonnes aux champs du DTO ${dtoName}. */}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{item.id || idx}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.name || "-"}</td>
                  <td className="px-6 py-4 text-sm">
                    <Link to={\`/${this.kebabCase(group)}/\${item.id || idx}\`} className="text-primary-600 hover:underline">
                      Voir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
`;
  }

  private generateFormPage(page: UIStrategyPage, endpoints: ExtractedEndpoint[], dtos: ExtractedDto[], input: FrontendGeneratorInput): string {
    const group = page.name.replace(/Form$/, "");
    return `/**
 * ${page.name} - Formulaire de creation/edition ${group}.
 *
 * ${page.description}
 * Domaine : ${input.detectedDomain.label}
 *
 * TODO: [VALIDATION] Ajouter la validation cote client.
 * Pourquoi : Les contraintes metier doivent etre validees avant l'envoi au backend.
 * Comment : Utiliser react-hook-form avec des regles de validation.
 *
 * TODO: [UX] Adapter les champs du formulaire au DTO metier.
 * Pourquoi : Les champs generes sont generiques et doivent etre adaptes.
 * Comment : Remplacer les champs placeholder par les vrais champs du DTO.
 *
 * @generated EJB Client Modernizer v10.8
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

export default function ${page.name}() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      // TODO: [INTEGRATION] Appeler le service API pour creer/modifier.
      // Pourquoi : Les donnees du formulaire doivent etre envoyees au backend.
      // Comment : await create${group}(formData); ou await update${group}(id, formData);
      toast.success("${group} enregistre avec succes");
      navigate("/${this.kebabCase(group)}");
    } catch (err) {
      toast.error("Erreur lors de l'enregistrement");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Retour
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nouveau ${group}</h1>
      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg shadow">
        {/* TODO: [UX] Remplacer par les vrais champs du DTO */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
          <input type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
      </form>
    </div>
  );
}
`;
  }

  private generateDetailPage(page: UIStrategyPage, endpoints: ExtractedEndpoint[], dtos: ExtractedDto[], input: FrontendGeneratorInput): string {
    const group = page.name.replace(/Detail$/, "");
    return `/**
 * ${page.name} - Detail d'un(e) ${group}.
 *
 * ${page.description}
 * Domaine : ${input.detectedDomain.label}
 *
 * TODO: [INTEGRATION] Connecter au service API pour charger les donnees.
 * Pourquoi : Les donnees mock doivent etre remplacees par les donnees reelles.
 * Comment : Utiliser le service get${group}ById(id) dans un useEffect.
 *
 * @generated EJB Client Modernizer v10.8
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader2, ArrowLeft, Edit, Trash2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function ${page.name}() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      // TODO: [INTEGRATION] Remplacer par l'appel API reel.
      // const data = await get${group}ById(id);
      // setItem(data);
      setItem({ id, name: "Placeholder" });
    } catch (err) {
      setError("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Etes-vous sur de vouloir supprimer cet element ?")) return;
    try {
      // TODO: [INTEGRATION] await delete${group}(id);
      toast.success("${group} supprime");
      navigate("/${this.kebabCase(group)}");
    } catch (err) {
      toast.error("Erreur lors de la suppression");
    }
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (error) return <div className="flex justify-center p-12 text-red-500"><AlertCircle className="mr-2" />{error}</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start mb-6">
          <h1 className="text-2xl font-bold">{item?.name || "${group}"}</h1>
          <div className="flex gap-2">
            <Link to={\`/${this.kebabCase(group)}/\${id}/edit\`} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-50 text-primary-700 rounded hover:bg-primary-100">
              <Edit className="w-3.5 h-3.5" /> Modifier
            </Link>
            <button onClick={handleDelete} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded hover:bg-red-100">
              <Trash2 className="w-3.5 h-3.5" /> Supprimer
            </button>
          </div>
        </div>
        {/* TODO: [UX] Afficher les champs du DTO avec le bon formatage */}
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-gray-500">ID</dt>
            <dd className="text-sm font-medium">{item?.id}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
`;
  }

  private generateDashboardPage(page: UIStrategyPage, endpoints: ExtractedEndpoint[], dtos: ExtractedDto[], input: FrontendGeneratorInput): string {
    const domainHint = this.getDomainSpecificUIHint(input.detectedDomain);
    return `/**
 * Dashboard - Tableau de bord principal.
 *
 * ${page.description}
 * Domaine : ${input.detectedDomain.label}
 * ${domainHint ? `Recommandation UI : ${domainHint}` : ""}
 *
 * TODO: [INTEGRATION] Connecter les statistiques aux endpoints API.
 * Pourquoi : Les chiffres affiches doivent refleter les donnees reelles du backend.
 * Comment : Creer un endpoint /api/dashboard/stats dans le backend et l'appeler ici.
 *
 * TODO: [UX] Adapter le dashboard au domaine metier (${input.detectedDomain.label}).
 * Pourquoi : Un dashboard bancaire est different d'un dashboard e-commerce.
 * Comment : Ajouter des widgets specifiques au domaine (graphiques, KPIs, alertes).
 *
 * @generated EJB Client Modernizer v10.8
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Users, Activity, TrendingUp, ArrowRight } from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    recent: 0,
    growth: 0,
  });

  useEffect(() => {
    // TODO: [INTEGRATION] Charger les statistiques depuis le backend.
    // const data = await getDashboardStats();
    // setStats(data);
  }, []);

  const cards = [
    { label: "Total", value: stats.total, icon: BarChart3, color: "bg-blue-500" },
    { label: "Actifs", value: stats.active, icon: Users, color: "bg-green-500" },
    { label: "Recents", value: stats.recent, icon: Activity, color: "bg-purple-500" },
    { label: "Croissance", value: \`\${stats.growth}%\`, icon: TrendingUp, color: "bg-orange-500" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tableau de bord</h1>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold mt-1">{card.value}</p>
              </div>
              <div className={\`\${card.color} p-3 rounded-lg\`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Acces rapides */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Acces rapides</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* TODO: [UX] Ajouter les liens vers les pages principales */}
          <Link to="#" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
            <span className="text-sm font-medium">Voir tout</span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
`;
  }

  private generateGenericPage(page: UIStrategyPage, input: FrontendGeneratorInput): string {
    return `/**
 * ${page.name} - ${page.description}
 * Domaine : ${input.detectedDomain.label}
 * @generated EJB Client Modernizer v10.8
 */
export default function ${page.name}() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">${page.name}</h1>
      <p className="text-gray-600 mt-2">${page.description}</p>
      {/* TODO: [IMPLEMENTATION] Implementer la logique de cette page. */}
    </div>
  );
}
`;
  }

  // =====================================================================
  // Step 7: Generate routing
  // =====================================================================

  private generateRouting(endpoints: ExtractedEndpoint[], input: FrontendGeneratorInput): GeneratedFile[] {
    const prefix = `frontend/${input.projectName}-ui/src`;
    const files: GeneratedFile[] = [];

    files.push({
      path: `${prefix}/App.tsx`,
      content: `/**
 * App.tsx - Composant racine avec routing.
 *
 * TODO: [SECURITE] Ajouter les routes protegees (authentification requise).
 * Pourquoi : Certaines pages ne doivent etre accessibles qu'aux utilisateurs connectes.
 * Comment : Creer un composant ProtectedRoute qui verifie le token d'auth.
 *
 * @generated EJB Client Modernizer v10.8
 */
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";

// TODO: [INTEGRATION] Importer les pages generees une fois implementees.
// import ${"{"}...${"}"}  from "./pages/...";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        {/* TODO: [ROUTING] Ajouter les routes pour chaque page generee.
          * Pourquoi : Chaque domaine metier a ses propres pages CRUD.
          * Comment : <Route path="/domaine" element={<DomainList />} />
          *           <Route path="/domaine/:id" element={<DomainDetail />} />
          *           <Route path="/domaine/new" element={<DomainForm />} />
          */}
      </Route>
    </Routes>
  );
}
`,
      category: "main",
      technology: "JSP",
    });

    return files;
  }

  // =====================================================================
  // Step 8: Generate shared components
  // =====================================================================

  private generateSharedComponents(input: FrontendGeneratorInput): GeneratedFile[] {
    const prefix = `frontend/${input.projectName}-ui/src`;
    const files: GeneratedFile[] = [];

    // Layout component
    files.push({
      path: `${prefix}/components/Layout.tsx`,
      content: `/**
 * Layout - Composant de mise en page principal.
 * Inclut la navigation, le header et le contenu principal.
 *
 * TODO: [UX] Adapter la navigation au domaine metier (${input.detectedDomain.label}).
 * Pourquoi : La navigation doit refleter les fonctionnalites metier disponibles.
 * Comment : Ajouter les liens vers les pages generees dans la sidebar/navbar.
 *
 * TODO: [SECURITE] Afficher le profil utilisateur connecte.
 * Pourquoi : L'utilisateur doit voir son identite et pouvoir se deconnecter.
 * Comment : Appeler l'endpoint /api/auth/me et afficher le nom/avatar.
 *
 * @generated EJB Client Modernizer v10.8
 */
import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, Menu, X, LogOut } from "lucide-react";
import { useState } from "react";

const navItems = [
  { label: "Tableau de bord", path: "/", icon: Home },
  // TODO: [NAVIGATION] Ajouter les liens vers les pages metier.
];

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-1">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <h1 className="text-lg font-bold text-gray-900">${input.projectName}</h1>
        </div>
        <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <LogOut className="w-4 h-4" />
          Deconnexion
        </button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={\`\${sidebarOpen ? "block" : "hidden"} lg:block w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-57px)]\`}>
          <nav className="p-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm \${
                  location.pathname === item.path
                    ? "bg-primary-50 text-primary-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50"
                }\`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
`,
      category: "controller",
      technology: "JSP",
    });

    return files;
  }

  // =====================================================================
  // Step 9: Build TODOs (Post-Migration Checklist)
  // =====================================================================

  private buildTodos(
    endpoints: ExtractedEndpoint[],
    dtos: ExtractedDto[],
    input: FrontendGeneratorInput,
  ): FrontendTodo[] {
    const todos: FrontendTodo[] = [];

    // Security TODOs
    todos.push({
      category: "security",
      priority: "critical",
      what: "Configurer l'authentification (JWT/OAuth2/Session)",
      why: "Le backend Spring Boot genere utilise Spring Security. Le frontend doit envoyer les credentials a chaque requete API.",
      how: "Implementer le flow de login dans src/pages/Login.tsx, stocker le token dans un HttpOnly cookie ou le localStorage, et l'ajouter dans l'intercepteur Axios (src/services/api.ts).",
      relatedFiles: ["src/services/api.ts", "src/pages/Login.tsx"],
    });

    // Testing TODOs
    todos.push({
      category: "testing",
      priority: "high",
      what: "Ecrire les tests unitaires et d'integration",
      why: "Le code genere n'inclut pas de tests. Les tests sont essentiels pour valider la logique metier et prevenir les regressions.",
      how: "Utiliser Vitest + React Testing Library. Tester chaque service API avec MSW (Mock Service Worker) et chaque composant avec des snapshots.",
      relatedFiles: ["src/services/", "src/pages/"],
    });

    // Integration TODOs
    todos.push({
      category: "integration",
      priority: "critical",
      what: "Connecter les services API au backend Spring Boot deploye",
      why: "Les services generes pointent vers /api via le proxy Vite. En production, l'URL du backend doit etre configuree.",
      how: "Definir la variable d'environnement VITE_API_URL dans le fichier .env.production avec l'URL du backend deploye.",
      relatedFiles: ["src/services/api.ts", ".env.production"],
    });

    // UX TODOs
    todos.push({
      category: "ux",
      priority: "high",
      what: "Adapter les formulaires et tableaux aux DTOs metier",
      why: "Les composants generes utilisent des champs generiques. Ils doivent etre adaptes aux vrais champs du domaine metier.",
      how: "Pour chaque page, remplacer les champs placeholder par les champs du DTO correspondant. Ajouter la validation cote client.",
      relatedFiles: ["src/pages/"],
    });

    // Configuration TODOs
    todos.push({
      category: "configuration",
      priority: "medium",
      what: "Configurer le CORS et le proxy en production",
      why: "En dev, Vite gere le proxy. En production, le backend doit autoriser les requetes cross-origin du frontend.",
      how: "Configurer @CrossOrigin dans les controllers Spring Boot, ou utiliser un reverse proxy (Nginx) pour servir front et back sur le meme domaine.",
      relatedFiles: ["vite.config.ts"],
    });

    // Business logic TODOs
    if (input.detectedDomain.primary !== "NONE") {
      todos.push({
        category: "business_logic",
        priority: "high",
        what: `Valider la logique metier specifique au domaine ${input.detectedDomain.label}`,
        why: "La transformation automatique peut manquer des regles metier specifiques au domaine. Une validation humaine est necessaire.",
        how: "Comparer chaque formulaire et tableau avec les ecrans legacy (JSP/Struts). Verifier que les calculs, validations et workflows sont preserves.",
        relatedFiles: ["src/pages/", "src/services/"],
      });
    }

    // Performance TODOs
    todos.push({
      category: "performance",
      priority: "medium",
      what: "Optimiser les performances (lazy loading, pagination serveur, cache)",
      why: "Les pages de liste chargent toutes les donnees d'un coup. Avec de gros volumes, cela degrade les performances.",
      how: "Implementer la pagination cote serveur (?page=X&size=Y), le lazy loading des routes avec React.lazy(), et le cache avec React Query ou SWR.",
      relatedFiles: ["src/pages/", "src/App.tsx"],
    });

    return todos;
  }

  // =====================================================================
  // Step 10: Verify generated code
  // =====================================================================

  private verifyGeneratedCode(files: GeneratedFile[], input: FrontendGeneratorInput): string[] {
    const warnings: string[] = [];

    // Check for missing imports
    for (const file of files) {
      if (!file.path.endsWith(".tsx") && !file.path.endsWith(".ts")) continue;

      // Check for used but not imported types
      const importedTypes = new Set<string>();
      const importRegex = /import\s+(?:type\s+)?{([^}]+)}\s+from/g;
      let match;
      while ((match = importRegex.exec(file.content)) !== null) {
        match[1].split(",").forEach(t => importedTypes.add(t.trim()));
      }

      // Check for JSX components that might need imports
      const jsxComponents = file.content.match(/<([A-Z]\w+)/g);
      if (jsxComponents) {
        for (const comp of jsxComponents) {
          const name = comp.slice(1);
          if (!importedTypes.has(name) && !["React", "Fragment"].includes(name)) {
            // Check if it's from lucide-react or a local component
            if (!file.content.includes(`import`) || !file.content.includes(name)) {
              // Only warn for non-HTML elements
              if (!/^(div|span|p|h[1-6]|a|button|input|form|table|tr|td|th|thead|tbody|nav|main|aside|header|footer|section|article|label|textarea|select|option|dl|dt|dd)$/i.test(name)) {
                // Don't warn for components defined in the same file
                if (!file.content.includes(`function ${name}`) && !file.content.includes(`const ${name}`)) {
                  warnings.push(`${file.path}: Composant <${name}> utilise mais potentiellement non importe`);
                }
              }
            }
          }
        }
      }
    }

    // Check for consistent file structure
    const hasModels = files.some(f => f.path.includes("/models/"));
    const hasServices = files.some(f => f.path.includes("/services/"));
    const hasPages = files.some(f => f.path.includes("/pages/"));

    if (!hasModels) warnings.push("Aucun modele TypeScript genere - les types seront 'any'");
    if (!hasServices) warnings.push("Aucun service API genere - les appels HTTP ne sont pas structures");
    if (!hasPages) warnings.push("Aucune page generee - l'application sera vide");

    return warnings;
  }

  // =====================================================================
  // Utility methods
  // =====================================================================

  private extractClassName(content: string): string {
    const match = content.match(/(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum|record)\s+(\w+)/);
    return match?.[1] || "Unknown";
  }

  private javaTypeToTS(javaType: string): string {
    const mapping: Record<string, string> = {
      String: "string",
      Integer: "number",
      int: "number",
      Long: "number",
      long: "number",
      Double: "number",
      double: "number",
      Float: "number",
      float: "number",
      Boolean: "boolean",
      boolean: "boolean",
      BigDecimal: "number",
      BigInteger: "number",
      Date: "string",
      LocalDate: "string",
      LocalDateTime: "string",
      ZonedDateTime: "string",
      Instant: "string",
      UUID: "string",
      byte: "number",
      short: "number",
      char: "string",
      void: "void",
      Object: "unknown",
    };

    // Handle generics like List<String>
    const genericMatch = javaType.match(/^(List|Set|Collection)<(.+)>$/);
    if (genericMatch) {
      const innerType = this.javaTypeToTS(genericMatch[2]);
      return `${innerType}[]`;
    }

    const mapMatch = javaType.match(/^Map<(.+),\s*(.+)>$/);
    if (mapMatch) {
      const keyType = this.javaTypeToTS(mapMatch[1]);
      const valType = this.javaTypeToTS(mapMatch[2]);
      return `Record<${keyType}, ${valType}>`;
    }

    return mapping[javaType] || javaType;
  }

  private kebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }

  private getDomainSpecificUIHint(domain: DetectedDomain): string {
    switch (domain.primary) {
      case "BIAN":
        return "Dashboard financier avec KPIs, graphiques de transactions, alertes de conformite, tableaux de soldes";
      case "ACORD":
        return "Gestion de polices avec timeline de sinistres, calcul de primes, workflow de souscription";
      case "HL7_FHIR":
        return "Dossier patient avec timeline medicale, prescriptions, resultats de laboratoire, planning de rendez-vous";
      case "TMFORUM":
        return "Dashboard operateur avec metriques reseau, gestion d'abonnes, facturation, suivi de qualite de service";
      case "DDD":
        return "Catalogue produits avec panier, checkout, suivi de commandes, gestion de stock";
      case "TOGAF":
        return "Dashboard enterprise avec workflows, approbations, audit trail, KPIs metier";
      default:
        return "";
    }
  }
}

// --- Internal types ---

interface UIStrategy {
  pages: UIStrategyPage[];
  sharedComponents: string[];
  navigationStructure: "sidebar" | "topnav" | "tabs";
  authRequired: boolean;
  domainSpecificUI: string;
}

interface UIStrategyPage {
  name: string;
  route: string;
  description: string;
  endpoints: string[];
  components: string[];
  layout: "list" | "form" | "detail" | "dashboard" | "table";
  priority: "high" | "medium" | "low";
}
