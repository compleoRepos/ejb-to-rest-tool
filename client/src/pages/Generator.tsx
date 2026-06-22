import { useState, useCallback } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Upload, FileJson, Trash2, Play, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface JsonFile {
  name: string;
  content: unknown;
  endpoints: number;
}

interface GenerationResult {
  wrapperName: string;
  serviceDomain: string;
  endpoints: number;
  files: number;
  status: "success" | "error";
}

export default function Generator() {
  const [files, setFiles] = useState<JsonFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GenerationResult[] | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".json")
    );
    processFiles(droppedFiles);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        (f) => f.name.endsWith(".json")
      );
      processFiles(selectedFiles);
    }
  }, []);

  const processFiles = async (newFiles: File[]) => {
    const parsed: JsonFile[] = [];
    for (const file of newFiles) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const endpoints = json.endpoints?.length || 0;
        parsed.push({ name: file.name, content: json, endpoints });
      } catch {
        toast.error(`Erreur de parsing: ${file.name}`);
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
      toast.error("Aucun fichier JSON à traiter");
      return;
    }
    setIsGenerating(true);
    setResults(null);

    // Simulate generation with BIAN mapping
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const bianMapping: Record<string, { domain: string; projects: string[] }> = {};

    for (const file of files) {
      const content = file.content as { adapter_name?: string; endpoints?: { path?: string }[] };
      const adapterName = content.adapter_name || file.name.replace(".json", "");
      const path = content.endpoints?.[0]?.path || "";

      let domain = "Unknown";
      if (path.includes("monetique") || path.includes("carte") || path.includes("3dsecure") || path.includes("token") || adapterName.includes("carte") || adapterName.includes("3dsecure") || adapterName.includes("token") || adapterName.includes("releve") || adapterName.includes("vente")) {
        domain = "Card Administration";
      } else if (path.includes("chequier") || path.includes("dotation") || path.includes("disposition") || path.includes("virement") || adapterName.includes("chequier") || adapterName.includes("dotation") || adapterName.includes("disposition") || adapterName.includes("virement")) {
        domain = "Payment Order";
      } else if (path.includes("epargne") || path.includes("assistance") || path.includes("opv") || adapterName.includes("epargne") || adapterName.includes("assistance") || adapterName.includes("opv")) {
        domain = "Customer Offer";
      } else if (path.includes("notification") || path.includes("sms") || adapterName.includes("notification") || adapterName.includes("sms")) {
        domain = "Party Notification";
      } else if (path.includes("avenir") || path.includes("opere") || adapterName.includes("avenir") || adapterName.includes("opere")) {
        domain = "Current Account";
      } else if (path.includes("credit") || path.includes("jocker") || adapterName.includes("credit") || adapterName.includes("jocker")) {
        domain = "Consumer Loan";
      } else if (path.includes("transfert") || path.includes("euro") || adapterName.includes("transfert") || adapterName.includes("euro")) {
        domain = "Foreign Exchange";
      }

      if (!bianMapping[domain]) {
        bianMapping[domain] = { domain, projects: [] };
      }
      bianMapping[domain].projects.push(adapterName);
    }

    const generatedResults: GenerationResult[] = Object.entries(bianMapping).map(
      ([domain, info]) => {
        const totalEndpoints = files
          .filter((f) => {
            const content = f.content as { adapter_name?: string };
            const name = content.adapter_name || f.name.replace(".json", "");
            return info.projects.includes(name);
          })
          .reduce((sum, f) => sum + f.endpoints, 0);

        return {
          wrapperName: domain.toLowerCase().replace(/\s+/g, "-") + "-bmcedirect",
          serviceDomain: domain,
          endpoints: totalEndpoints,
          files: 40 + totalEndpoints * 4,
          status: "success" as const,
        };
      }
    );

    setResults(generatedResults);
    setIsGenerating(false);
    toast.success(`${generatedResults.length} wrapper(s) générés avec succès`);
  };

  const totalEndpoints = files.reduce((sum, f) => sum + f.endpoints, 0);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 pt-24 pb-16">
        <div className="container">
          <div className="mb-8">
            <h1 className="font-display font-bold text-3xl mb-2">Générateur de Wrappers</h1>
            <p className="text-muted-foreground">
              Déposez vos fichiers JSON descripteurs et lancez la génération
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Upload Zone */}
            <div className="lg:col-span-2 space-y-6">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="relative border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-[oklch(0.78_0.15_200/0.5)] transition-colors duration-200 bg-card/30"
              >
                <input
                  type="file"
                  multiple
                  accept=".json"
                  onChange={handleFileInput}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <p className="font-display font-semibold text-lg mb-1">
                  Déposez vos fichiers JSON ici
                </p>
                <p className="text-sm text-muted-foreground">
                  ou cliquez pour sélectionner — Plusieurs fichiers acceptés
                </p>
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
                        <FileJson className="w-4 h-4 text-cyan" />
                        <span className="font-mono text-sm">{file.name}</span>
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                          {file.endpoints} endpoint{file.endpoints > 1 ? "s" : ""}
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

              {/* Results */}
              {results && (
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
                          <Button size="sm" variant="outline" className="text-xs gap-1 border-border hover:border-[oklch(0.78_0.15_200/0.5)] hover:text-cyan">
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
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Stats */}
              <div className="p-5 rounded-lg border border-border bg-card">
                <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">
                  Résumé
                </h3>
                <div className="space-y-3">
                  <StatRow label="Fichiers" value={files.length.toString()} />
                  <StatRow label="Endpoints" value={totalEndpoints.toString()} />
                  <StatRow
                    label="Wrappers estimés"
                    value={results ? results.length.toString() : "—"}
                  />
                </div>
              </div>

              {/* Generate Button */}
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

              {/* Format Info */}
              <div className="p-5 rounded-lg border border-border bg-card">
                <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
                  Format JSON attendu
                </h3>
                <pre className="text-xs font-mono text-muted-foreground bg-secondary/50 p-3 rounded overflow-x-auto">
{`{
  "adapter_name": "...",
  "endpoints": [
    {
      "operation": "...",
      "method": "POST",
      "path": "/backend/...",
      "request_fields": [...],
      "response_fields": [...]
    }
  ]
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </main>
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
