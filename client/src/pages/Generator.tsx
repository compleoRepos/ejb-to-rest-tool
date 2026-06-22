/**
 * Generator — Deux modes d'entrée :
 * 1. Upload de projets EJB (ZIP/JAR/WAR) pour analyse automatique du code source
 * 2. Upload de fichiers JSON descripteurs (ou WSDL) pour génération directe
 */
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileJson,
  FileArchive,
  Trash2,
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  FolderArchive,
  Code,
  GitBranch,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

type TabMode = "ejb" | "json";

// ─── EJB Upload Types ────────────────────────────────────────────────────────
interface EjbProject {
  name: string;
  file: File;
  size: number;
  format: "zip" | "jar" | "war";
}

// ─── JSON/WSDL Upload Types ──────────────────────────────────────────────────
interface JsonFile {
  name: string;
  type: "json" | "wsdl";
  size: number;
  content?: unknown;
  endpoints?: number;
}

// ─── Generation Result ───────────────────────────────────────────────────────
interface GenerationResult {
  wrapperName: string;
  serviceDomain: string;
  endpoints: number;
  files: number;
  status: "success" | "error";
}

export default function Generator() {
  const [activeTab, setActiveTab] = useState<TabMode>("ejb");

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 pt-24 pb-16">
        <div className="container">
          <div className="mb-8">
            <h1 className="font-display font-bold text-3xl mb-2">
              Générateur de Wrappers REST BIAN
            </h1>
            <p className="text-muted-foreground">
              Choisissez votre mode d'entrée pour lancer la modernisation
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => setActiveTab("ejb")}
              className={`flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-all duration-150 border ${
                activeTab === "ejb"
                  ? "bg-[oklch(0.78_0.15_200/0.1)] border-[oklch(0.78_0.15_200/0.5)] text-cyan"
                  : "bg-card/50 border-border text-muted-foreground hover:text-foreground hover:border-[oklch(0.78_0.15_200/0.3)]"
              }`}
            >
              <FolderArchive className="w-4 h-4" />
              Projet EJB (ZIP / JAR / WAR)
            </button>
            <button
              onClick={() => setActiveTab("json")}
              className={`flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-all duration-150 border ${
                activeTab === "json"
                  ? "bg-[oklch(0.78_0.15_200/0.1)] border-[oklch(0.78_0.15_200/0.5)] text-cyan"
                  : "bg-card/50 border-border text-muted-foreground hover:text-foreground hover:border-[oklch(0.78_0.15_200/0.3)]"
              }`}
            >
              <FileJson className="w-4 h-4" />
              JSON / WSDL descripteurs
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "ejb" ? <EjbUploadTab /> : <JsonUploadTab />}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 : Upload Projet EJB (ZIP / JAR / WAR)
// ═══════════════════════════════════════════════════════════════════════════════
function EjbUploadTab() {
  const [projects, setProjects] = useState<EjbProject[]>([]);
  const [gitUrl, setGitUrl] = useState("");
  const [sourceMode, setSourceMode] = useState<"file" | "git">("file");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState("");
  const [results, setResults] = useState<GenerationResult[] | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) =>
        f.name.endsWith(".zip") ||
        f.name.endsWith(".jar") ||
        f.name.endsWith(".war")
    );
    addProjects(droppedFiles);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selected = Array.from(e.target.files).filter(
          (f) =>
            f.name.endsWith(".zip") ||
            f.name.endsWith(".jar") ||
            f.name.endsWith(".war")
        );
        addProjects(selected);
      }
    },
    []
  );

  const addProjects = (files: File[]) => {
    const newProjects: EjbProject[] = files.map((f) => ({
      name: f.name,
      file: f,
      size: f.size,
      format: f.name.endsWith(".jar")
        ? "jar"
        : f.name.endsWith(".war")
        ? "war"
        : "zip",
    }));
    setProjects((prev) => [...prev, ...newProjects]);
    toast.success(`${newProjects.length} projet(s) ajouté(s)`);
  };

  const removeProject = (index: number) => {
    setProjects((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (sourceMode === "file" && projects.length === 0) {
      toast.error("Aucun projet à analyser");
      return;
    }
    if (sourceMode === "git" && !gitUrl.trim()) {
      toast.error("Veuillez saisir une URL de repository");
      return;
    }

    setIsAnalyzing(true);
    setResults(null);

    const steps = [
      "Extraction des archives...",
      "Détection des technologies (EJB, Servlets, JSP, Struts, SOAP)...",
      "Analyse des descripteurs (web.xml, ejb-jar.xml)...",
      "Extraction des endpoints depuis les Servlets...",
      "Extraction des EJB Session Beans...",
      "Détection des services SOAP/WSDL...",
      "Mapping vers les Service Domains BIAN...",
      "Regroupement par domaine...",
      "Génération des wrappers Spring Boot...",
      "Compilation Maven & validation Swagger...",
    ];

    for (const step of steps) {
      setAnalysisStep(step);
      await new Promise((r) => setTimeout(r, 900));
    }

    // Simulate results
    const mockResults: GenerationResult[] = [
      { wrapperName: "card-administration-bmcedirect", serviceDomain: "Card Administration", endpoints: 13, files: 66, status: "success" },
      { wrapperName: "payment-order-bmcedirect", serviceDomain: "Payment Order", endpoints: 12, files: 58, status: "success" },
      { wrapperName: "customer-offer-bmcedirect", serviceDomain: "Customer Offer", endpoints: 6, files: 42, status: "success" },
    ];

    setResults(mockResults);
    setIsAnalyzing(false);
    setAnalysisStep("");
    toast.success(`${mockResults.length} wrapper(s) générés avec succès`);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {/* Source mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setSourceMode("file")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all border ${
              sourceMode === "file"
                ? "bg-secondary border-[oklch(0.78_0.15_200/0.4)] text-cyan"
                : "bg-transparent border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            Fichier ZIP / JAR / WAR
          </button>
          <button
            onClick={() => setSourceMode("git")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all border ${
              sourceMode === "git"
                ? "bg-secondary border-[oklch(0.78_0.15_200/0.4)] text-cyan"
                : "bg-transparent border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Repository Git
          </button>
        </div>

        {/* Upload Zone */}
        {sourceMode === "file" && (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="relative border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-[oklch(0.78_0.15_200/0.5)] transition-colors duration-200 bg-card/30"
            >
              <input
                type="file"
                multiple
                accept=".zip,.jar,.war"
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <FolderArchive className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <p className="font-display font-semibold text-lg mb-1">
                Glissez-déposez vos projets EJB ici
              </p>
              <p className="text-sm text-muted-foreground">
                Formats supportés : ZIP, JAR, WAR — Plusieurs fichiers acceptés
              </p>
            </div>

            {/* Project List */}
            {projects.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                    Projets chargés ({projects.length})
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProjects([])}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Tout supprimer
                  </Button>
                </div>
                {projects.map((project, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-4 py-3 rounded-md border border-border bg-card/50 group"
                  >
                    <div className="flex items-center gap-3">
                      <FileArchive className="w-4 h-4 text-[oklch(0.75_0.15_50)]" />
                      <span className="font-mono text-sm">{project.name}</span>
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded uppercase">
                        {project.format}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatSize(project.size)}
                      </span>
                    </div>
                    <button
                      onClick={() => removeProject(index)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity duration-150"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Git URL */}
        {sourceMode === "git" && (
          <div className="p-6 rounded-lg border border-border bg-card/50">
            <label className="text-sm font-medium text-muted-foreground block mb-2">
              URL du repository Git
            </label>
            <input
              type="text"
              placeholder="https://github.com/org/project-ejb.git"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-secondary border border-border text-foreground font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[oklch(0.78_0.15_200/0.5)] transition-colors"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Le repository sera cloné et analysé automatiquement.
            </p>
          </div>
        )}

        {/* Analysis Progress */}
        {isAnalyzing && (
          <div className="p-6 rounded-lg border border-[oklch(0.78_0.15_200/0.3)] bg-[oklch(0.78_0.15_200/0.03)]">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 text-cyan animate-spin" />
              <span className="font-display font-semibold">
                Analyse en cours...
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono ml-8">
              {analysisStep}
            </p>
          </div>
        )}

        {/* Results */}
        {results && <ResultsList results={results} />}
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        <div className="p-5 rounded-lg border border-border bg-card">
          <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">
            Résumé
          </h3>
          <div className="space-y-3">
            <StatRow label="Projets" value={projects.length.toString()} />
            <StatRow
              label="Wrappers générés"
              value={results ? results.length.toString() : "—"}
            />
          </div>
        </div>

        <Button
          onClick={handleAnalyze}
          disabled={
            (sourceMode === "file" && projects.length === 0) ||
            (sourceMode === "git" && !gitUrl.trim()) ||
            isAnalyzing
          }
          className="w-full gap-2 font-display font-semibold h-12 bg-[oklch(0.78_0.15_200)] text-[oklch(0.13_0.02_230)] hover:bg-[oklch(0.82_0.15_200)] disabled:opacity-40 transition-all duration-150 active:scale-[0.97]"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyse en cours...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Analyser & Générer
            </>
          )}
        </Button>

        <div className="p-5 rounded-lg border border-border bg-card">
          <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
            Technologies détectées
          </h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <TechItem label="EJB Session Beans (Stateless/Stateful)" />
            <TechItem label="Servlets Java (HttpServlet)" />
            <TechItem label="JSP / Struts Actions" />
            <TechItem label="Services SOAP / WSDL" />
            <TechItem label="JDBC / Hibernate" />
            <TechItem label="JMS / Messaging" />
            <TechItem label="web.xml / ejb-jar.xml" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 : Upload JSON / WSDL descripteurs
// ═══════════════════════════════════════════════════════════════════════════════
function JsonUploadTab() {
  const [files, setFiles] = useState<JsonFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [results, setResults] = useState<GenerationResult[] | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".json") || f.name.endsWith(".wsdl") || f.name.endsWith(".xml")
    );
    processFiles(droppedFiles);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selected = Array.from(e.target.files).filter(
          (f) => f.name.endsWith(".json") || f.name.endsWith(".wsdl") || f.name.endsWith(".xml")
        );
        processFiles(selected);
      }
    },
    []
  );

  const processFiles = async (newFiles: File[]) => {
    const parsed: JsonFile[] = [];
    for (const file of newFiles) {
      if (file.name.endsWith(".json")) {
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const endpoints = json.endpoints?.length || 0;
          parsed.push({
            name: file.name,
            type: "json",
            size: file.size,
            content: json,
            endpoints,
          });
        } catch {
          toast.error(`Erreur de parsing: ${file.name}`);
        }
      } else {
        // WSDL / XML
        parsed.push({
          name: file.name,
          type: "wsdl",
          size: file.size,
          endpoints: Math.floor(Math.random() * 5) + 2, // simulated
        });
      }
    }
    setFiles((prev) => [...prev, ...parsed]);
    if (parsed.length > 0) {
      toast.success(`${parsed.length} fichier(s) ajouté(s)`);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (files.length === 0) {
      toast.error("Aucun fichier à traiter");
      return;
    }
    setIsGenerating(true);
    setResults(null);

    const steps = [
      "Parsing des fichiers JSON...",
      "Parsing des fichiers WSDL...",
      "Extraction des opérations et signatures...",
      "Mapping vers les Service Domains BIAN...",
      "Regroupement par domaine...",
      "Génération des wrappers Spring Boot...",
      "Génération des diagrammes de séquence...",
      "Compilation Maven & validation Swagger...",
    ];

    for (const step of steps) {
      setGenerationStep(step);
      await new Promise((r) => setTimeout(r, 700));
    }

    // Simulate BIAN mapping
    const bianMapping: Record<string, { domain: string; count: number }> = {};
    for (const file of files) {
      let domain = "Unknown";
      const name = file.name.toLowerCase();

      if (name.includes("carte") || name.includes("card") || name.includes("3dsecure") || name.includes("token") || name.includes("monetique") || name.includes("releve") || name.includes("vente")) {
        domain = "Card Administration";
      } else if (name.includes("chequier") || name.includes("dotation") || name.includes("disposition") || name.includes("virement") || name.includes("payment")) {
        domain = "Payment Order";
      } else if (name.includes("epargne") || name.includes("assistance") || name.includes("opv") || name.includes("offer")) {
        domain = "Customer Offer";
      } else if (name.includes("notification") || name.includes("sms")) {
        domain = "Party Notification";
      } else if (name.includes("avenir") || name.includes("opere") || name.includes("account")) {
        domain = "Current Account";
      } else if (name.includes("credit") || name.includes("jocker") || name.includes("loan")) {
        domain = "Consumer Loan";
      } else if (name.includes("transfert") || name.includes("euro") || name.includes("exchange")) {
        domain = "Foreign Exchange";
      }

      if (!bianMapping[domain]) bianMapping[domain] = { domain, count: 0 };
      bianMapping[domain].count += file.endpoints || 0;
    }

    const generatedResults: GenerationResult[] = Object.entries(bianMapping).map(
      ([domain, info]) => ({
        wrapperName: domain.toLowerCase().replace(/\s+/g, "-") + "-bmcedirect",
        serviceDomain: domain,
        endpoints: info.count,
        files: 40 + info.count * 4,
        status: "success" as const,
      })
    );

    setResults(generatedResults);
    setIsGenerating(false);
    setGenerationStep("");
    toast.success(`${generatedResults.length} wrapper(s) générés avec succès`);
  };

  const totalEndpoints = files.reduce((sum, f) => sum + (f.endpoints || 0), 0);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {/* Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="relative border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-[oklch(0.78_0.15_200/0.5)] transition-colors duration-200 bg-card/30"
        >
          <input
            type="file"
            multiple
            accept=".json,.wsdl,.xml"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="font-display font-semibold text-lg mb-1">
            Déposez vos fichiers JSON ou WSDL ici
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            ou cliquez pour sélectionner — Plusieurs fichiers acceptés
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/60 border border-border">
              <FileJson className="w-3.5 h-3.5 text-cyan" />
              JSON descripteurs
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/60 border border-border">
              <Globe className="w-3.5 h-3.5 text-[oklch(0.75_0.15_280)]" />
              WSDL / XML
            </span>
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                Fichiers chargés ({files.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFiles([])}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Tout supprimer
              </Button>
            </div>
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-4 py-3 rounded-md border border-border bg-card/50 group"
              >
                <div className="flex items-center gap-3">
                  {file.type === "json" ? (
                    <FileJson className="w-4 h-4 text-cyan" />
                  ) : (
                    <Globe className="w-4 h-4 text-[oklch(0.75_0.15_280)]" />
                  )}
                  <span className="font-mono text-sm">{file.name}</span>
                  <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                    {file.endpoints || 0} endpoint
                    {(file.endpoints || 0) > 1 ? "s" : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatSize(file.size)}
                  </span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity duration-150"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Generation Progress */}
        {isGenerating && (
          <div className="p-6 rounded-lg border border-[oklch(0.78_0.15_200/0.3)] bg-[oklch(0.78_0.15_200/0.03)]">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 text-cyan animate-spin" />
              <span className="font-display font-semibold">
                Génération en cours...
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono ml-8">
              {generationStep}
            </p>
          </div>
        )}

        {/* Results */}
        {results && <ResultsList results={results} />}
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        <div className="p-5 rounded-lg border border-border bg-card">
          <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">
            Résumé
          </h3>
          <div className="space-y-3">
            <StatRow
              label="Fichiers JSON"
              value={files.filter((f) => f.type === "json").length.toString()}
            />
            <StatRow
              label="Fichiers WSDL"
              value={files.filter((f) => f.type === "wsdl").length.toString()}
            />
            <div className="border-t border-border my-2" />
            <StatRow label="Total endpoints" value={totalEndpoints.toString()} />
            <StatRow
              label="Wrappers estimés"
              value={results ? results.length.toString() : "—"}
            />
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={files.length === 0 || isGenerating}
          className="w-full gap-2 font-display font-semibold h-12 bg-[oklch(0.78_0.15_200)] text-[oklch(0.13_0.02_230)] hover:bg-[oklch(0.82_0.15_200)] disabled:opacity-40 transition-all duration-150 active:scale-[0.97]"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Génération en cours...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Lancer la génération
            </>
          )}
        </Button>

        <div className="p-5 rounded-lg border border-border bg-card">
          <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
            Format JSON attendu
          </h3>
          <pre className="text-[10px] font-mono text-muted-foreground bg-secondary/50 p-3 rounded overflow-x-auto leading-relaxed">
{`{
  "adapter_name": "...",
  "endpoints": [{
    "operation": "...",
    "method": "POST",
    "path": "/backend/...",
    "request_fields": [...],
    "response_fields": [...]
  }]
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared Components
// ═══════════════════════════════════════════════════════════════════════════════
function ResultsList({ results }: { results: GenerationResult[] }) {
  return (
    <div className="space-y-4 mt-8">
      <h3 className="font-display font-semibold text-lg flex items-center gap-2">
        <CheckCircle className="w-5 h-5 text-[oklch(0.82_0.25_140)]" />
        Wrappers générés
      </h3>
      <div className="space-y-3">
        {results.map((result, index) => (
          <div
            key={index}
            className="p-4 rounded-lg border border-border bg-card hover:border-[oklch(0.78_0.15_200/0.3)] transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                {result.status === "success" ? (
                  <CheckCircle className="w-4 h-4 text-[oklch(0.82_0.25_140)]" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-destructive" />
                )}
                <span className="font-mono text-sm font-medium">
                  {result.wrapperName}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1 border-border hover:border-[oklch(0.78_0.15_200/0.5)] hover:text-cyan"
              >
                Télécharger ZIP
              </Button>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground ml-7">
              <span>SD: {result.serviceDomain}</span>
              <span>{result.endpoints} endpoints</span>
              <span>{result.files} fichiers</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-medium text-cyan">{value}</span>
    </div>
  );
}

function TechItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Code className="w-3 h-3 text-cyan/60" />
      <span>{label}</span>
    </div>
  );
}
