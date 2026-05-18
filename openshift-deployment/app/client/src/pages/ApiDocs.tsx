/**
 * ApiDocs — Documentation de l'API publique REST.
 * Endpoints : scan, analyze, transform, architecture, report.
 * @author Compleo
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Code2, Copy, ChevronDown, ChevronRight, Globe, Zap,
  FileCode2, Network, BarChart3, GitBranch, Shield,
} from "lucide-react";

// ============================================================
// API Endpoint Definitions
// ============================================================

interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  summary: string;
  description: string;
  category: string;
  requestBody?: string;
  responseBody?: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
}

const API_ENDPOINTS: ApiEndpoint[] = [
  // Projects
  {
    method: "GET", path: "/api/trpc/projects.list", summary: "Lister tous les projets",
    description: "Retourne la liste de tous les projets avec leurs métadonnées.", category: "Projets",
    responseBody: `[{
  "id": 1,
  "name": "mon-projet-legacy",
  "status": "active",
  "fileCount": 42,
  "totalLines": 12500,
  "legacyScore": 35,
  "modernScore": 82,
  "technologies": ["ejb", "servlet", "jdbc"],
  "createdAt": "2026-04-07T12:00:00Z"
}]`,
  },
  {
    method: "POST", path: "/api/trpc/projects.create", summary: "Créer un nouveau projet",
    description: "Crée un nouveau projet de modernisation. Retourne l'ID du projet créé.", category: "Projets",
    requestBody: `{
  "name": "mon-projet-legacy",
  "description": "Migration du monolithe EJB vers microservices",
  "gitUrl": "https://github.com/org/repo",
  "gitProvider": "github",
  "gitBranch": "main"
}`,
    responseBody: `{ "id": 1 }`,
  },
  // Files
  {
    method: "POST", path: "/api/trpc/files.upload", summary: "Uploader des fichiers Java",
    description: "Upload un ou plusieurs fichiers Java dans un projet. Remplace les fichiers existants.", category: "Fichiers",
    requestBody: `{
  "projectId": 1,
  "files": [{
    "filePath": "src/main/java/com/example/PaymentService.java",
    "fileName": "PaymentService.java",
    "content": "package com.example;\\n...",
    "lineCount": 150,
    "technologies": ["ejb", "jdbc"],
    "moduleName": "payment"
  }]
}`,
    responseBody: `{ "count": 1 }`,
  },
  {
    method: "GET", path: "/api/trpc/files.list", summary: "Lister les fichiers d'un projet",
    description: "Retourne tous les fichiers Java d'un projet avec leur contenu.", category: "Fichiers",
    params: [{ name: "projectId", type: "number", required: true, description: "ID du projet" }],
  },
  // Scans
  {
    method: "POST", path: "/api/trpc/scans.create", summary: "Lancer une analyse (scan)",
    description: "Crée un nouveau scan d'analyse pour un projet. Le scan est initialement en statut 'pending'.", category: "Analyses",
    requestBody: `{
  "projectId": 1,
  "scanType": "full"
}`,
    responseBody: `{ "id": 1 }`,
  },
  {
    method: "GET", path: "/api/trpc/scans.list", summary: "Lister les scans d'un projet",
    description: "Retourne l'historique des scans avec résultats, scores et métriques.", category: "Analyses",
    params: [{ name: "projectId", type: "number", required: true, description: "ID du projet" }],
  },
  {
    method: "POST", path: "/api/trpc/scans.updateResult", summary: "Mettre à jour les résultats d'un scan",
    description: "Met à jour les résultats d'analyse, scores, microservices, cloud et IA.", category: "Analyses",
    requestBody: `{
  "id": 1,
  "status": "completed",
  "filesAnalyzed": 42,
  "technologies": ["ejb", "servlet", "jdbc"],
  "legacyScore": 35,
  "modernScore": 82,
  "issuesCount": 118,
  "criticalCount": 12,
  "warningCount": 45,
  "durationMs": 3200,
  "analysisResult": { ... },
  "microservicesResult": { ... },
  "cloudResult": { ... },
  "aiResult": { ... },
  "migrationPlan": { ... },
  "architectureGraph": { ... }
}`,
  },
  // Comments
  {
    method: "POST", path: "/api/trpc/comments.create", summary: "Ajouter un commentaire",
    description: "Ajoute un commentaire de revue, validation ou question sur un projet.", category: "Collaboration",
    requestBody: `{
  "projectId": 1,
  "authorName": "Compleo",
  "commentType": "review",
  "content": "La migration du PaymentService nécessite une attention particulière...",
  "filePath": "src/main/java/PaymentService.java",
  "lineNumber": 42
}`,
  },
  {
    method: "POST", path: "/api/trpc/comments.updateValidation", summary: "Valider/rejeter un commentaire",
    description: "Met à jour le statut de validation d'un commentaire.", category: "Collaboration",
    requestBody: `{
  "id": 1,
  "validationStatus": "approved"
}`,
  },
  // Git
  {
    method: "POST", path: "/api/trpc/git.connect", summary: "Connecter un repository Git",
    description: "Connecte un repository Git (GitHub, GitLab, Bitbucket, Azure DevOps) à un projet.", category: "Git",
    requestBody: `{
  "projectId": 1,
  "provider": "github",
  "repoUrl": "https://github.com/org/repo",
  "repoName": "org/repo",
  "defaultBranch": "main",
  "isMonorepo": false
}`,
  },
  // Sharing
  {
    method: "POST", path: "/api/trpc/sharing.create", summary: "Créer un lien de partage",
    description: "Génère un lien de partage public pour un rapport d'analyse.", category: "Partage",
    requestBody: `{
  "projectId": 1,
  "title": "Rapport d'audit Q1 2026"
}`,
    responseBody: `{
  "id": 1,
  "shareToken": "abc123def456...",
  "title": "Rapport d'audit Q1 2026"
}`,
  },
  {
    method: "GET", path: "/api/trpc/sharing.getByToken", summary: "Accéder à un rapport partagé",
    description: "Récupère un rapport partagé via son token. Accessible publiquement.", category: "Partage",
    params: [{ name: "token", type: "string", required: true, description: "Token de partage" }],
  },
];

const CATEGORIES = ["Projets", "Fichiers", "Analyses", "Collaboration", "Git", "Partage"];
const CATEGORY_ICONS: Record<string, typeof Code2> = {
  Projets: FileCode2,
  Fichiers: Code2,
  Analyses: Zap,
  Collaboration: Globe,
  Git: GitBranch,
  Partage: Network,
};

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

// ============================================================
// Main Component
// ============================================================

export default function ApiDocsPage() {
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const toggleEndpoint = (key: string) => {
    setExpandedEndpoints(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredEndpoints = selectedCategory === "all"
    ? API_ENDPOINTS
    : API_ENDPOINTS.filter(e => e.category === selectedCategory);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié dans le presse-papier");
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center px-4 gap-3 shrink-0 bg-secondary/20">
        <Code2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">API Publique REST</span>
        <Badge className="text-[10px] bg-primary/20 text-primary border-0">v4.0</Badge>
        <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-0">{API_ENDPOINTS.length} endpoints</Badge>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — Categories */}
        <div className="w-48 border-r border-border shrink-0">
          <ScrollArea className="h-full">
            <div className="p-2">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                  selectedCategory === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />Tous ({API_ENDPOINTS.length})
              </button>
              {CATEGORIES.map(cat => {
                const Icon = CATEGORY_ICONS[cat] || Code2;
                const count = API_ENDPOINTS.filter(e => e.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                      selectedCategory === cat ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />{cat} ({count})
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Main content */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-3 max-w-4xl">
            {/* Intro */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6">
              <h2 className="text-sm font-semibold text-foreground mb-1">API Java Legacy Modernizer</h2>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                L'API publique REST permet d'intégrer la plateforme de modernisation dans vos pipelines CI/CD,
                scripts d'automatisation et outils tiers. Tous les endpoints utilisent le protocole tRPC
                avec des appels HTTP standard (GET pour les queries, POST pour les mutations).
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-[9px] h-4 border-emerald-500/30 text-emerald-400">tRPC</Badge>
                <Badge variant="outline" className="text-[9px] h-4 border-blue-500/30 text-blue-400">JSON</Badge>
                <Badge variant="outline" className="text-[9px] h-4 border-purple-500/30 text-purple-400">SuperJSON</Badge>
              </div>
            </div>

            {/* Endpoints */}
            {filteredEndpoints.map((endpoint, idx) => {
              const key = `${endpoint.method}-${endpoint.path}`;
              const isExpanded = expandedEndpoints.has(key);
              return (
                <div key={key} className="rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => toggleEndpoint(key)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/10 transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    <Badge variant="outline" className={`text-[10px] h-5 font-mono ${METHOD_COLORS[endpoint.method]}`}>
                      {endpoint.method}
                    </Badge>
                    <code className="text-[11px] font-mono text-foreground">{endpoint.path}</code>
                    <span className="text-[11px] text-muted-foreground ml-2">{endpoint.summary}</span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-3 bg-secondary/5">
                      <p className="text-[11px] text-muted-foreground">{endpoint.description}</p>

                      {endpoint.params && endpoint.params.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-1.5">Paramètres</h4>
                          <div className="space-y-1">
                            {endpoint.params.map(p => (
                              <div key={p.name} className="flex items-center gap-2 text-[11px]">
                                <code className="text-primary font-mono">{p.name}</code>
                                <Badge variant="outline" className="text-[9px] h-4 border-border">{p.type}</Badge>
                                {p.required && <Badge className="text-[9px] h-4 bg-red-500/20 text-red-400 border-0">requis</Badge>}
                                <span className="text-muted-foreground">{p.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {endpoint.requestBody && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <h4 className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Request Body</h4>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => handleCopy(endpoint.requestBody!)}>
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                          <pre className="text-[10px] font-mono bg-background rounded-md border border-border p-3 overflow-x-auto text-muted-foreground">
                            {endpoint.requestBody}
                          </pre>
                        </div>
                      )}

                      {endpoint.responseBody && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <h4 className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Response</h4>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => handleCopy(endpoint.responseBody!)}>
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                          <pre className="text-[10px] font-mono bg-background rounded-md border border-border p-3 overflow-x-auto text-emerald-400/80">
                            {endpoint.responseBody}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
