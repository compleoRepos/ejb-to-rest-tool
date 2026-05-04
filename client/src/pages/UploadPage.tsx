/**
 * UploadPage — Drag & drop ZIP/Git + bouton "Analyser".
 * Pas de checkboxes techniques. Les options viennent APRÈS l'analyse.
 */
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { PipelineStepper } from "@/components/PipelineStepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Upload, FolderArchive, GitBranch, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function UploadPage() {
  const [, navigate] = useLocation();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const [mode, setMode] = useState<"file" | "git">("file");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files?.[0]) {
      const file = files[0];
      if (file.name.endsWith(".zip") || file.name.endsWith(".jar") || file.name.endsWith(".war")) {
        setSelectedFile(file);
        setMode("file");
      } else {
        toast.error("Format non supporté. Utilisez un fichier ZIP, JAR ou WAR.");
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setMode("file");
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      let uploadSessionId: string | null = null;

      if (mode === "file" && selectedFile) {
        // Step 1: Upload the file
        const formData = new FormData();
        formData.append("file", selectedFile);
        const uploadRes = await fetch("/api/compleo/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error("Échec de l'upload");
        const uploadData = await uploadRes.json();
        uploadSessionId = uploadData.sessionId || uploadData.id;
      }

      // Step 2: Start the agent in analyze-only mode
      const startRes = await fetch("/api/agent/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: mode === "file"
            ? { type: "zip", sessionId: uploadSessionId }
            : { type: "git", url: gitUrl.trim() },
          output: { type: "zip" },
          options: {
            analyzeOnly: true,
            projectName: mode === "file" ? selectedFile?.name.replace(/\.(zip|jar|war)$/, "") : gitUrl.split("/").pop()?.replace(".git", ""),
          },
        }),
      });

      if (!startRes.ok) {
        const errData = await startRes.json();
        throw new Error(errData.error || "Échec du démarrage");
      }

      const data = await startRes.json();
      toast.success("Analyse lancée !");
      navigate(`/compleo/agent/${data.sessionId}/analyze`);
    } catch (err: any) {
      setError(err.message || "Erreur inattendue");
      toast.error(err.message || "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  };

  const canAnalyze = (mode === "file" && selectedFile) || (mode === "git" && gitUrl.trim());

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <PipelineStepper currentStep="upload" />

      <div className="max-w-2xl mx-auto px-4 pt-8 pb-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-100 mb-2">
            Modernisation de projet
          </h1>
          <p className="text-zinc-400">
            Uploadez votre projet legacy pour lancer l'analyse automatique.
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-6 justify-center">
          <Button
            variant={mode === "file" ? "default" : "outline"}
            onClick={() => setMode("file")}
            className="gap-2"
          >
            <FolderArchive className="w-4 h-4" />
            Fichier ZIP
          </Button>
          <Button
            variant={mode === "git" ? "default" : "outline"}
            onClick={() => setMode("git")}
            className="gap-2"
          >
            <GitBranch className="w-4 h-4" />
            Repository Git
          </Button>
        </div>

        {/* Upload zone */}
        {mode === "file" && (
          <Card
            className={`border-2 border-dashed p-12 text-center cursor-pointer transition-all ${
              dragActive
                ? "border-teal-500 bg-teal-500/5"
                : selectedFile
                ? "border-teal-600 bg-teal-500/5"
                : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".zip,.jar,.war"
              className="hidden"
              onChange={handleFileSelect}
            />
            {selectedFile ? (
              <div className="space-y-2">
                <FolderArchive className="w-12 h-12 mx-auto text-teal-400" />
                <p className="text-lg font-medium text-teal-300">{selectedFile.name}</p>
                <p className="text-sm text-zinc-400">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="w-12 h-12 mx-auto text-zinc-500" />
                <p className="text-zinc-300">
                  Glissez-déposez votre archive ici
                </p>
                <p className="text-sm text-zinc-500">
                  Formats supportés : ZIP, JAR, WAR
                </p>
              </div>
            )}
          </Card>
        )}

        {/* Git URL */}
        {mode === "git" && (
          <Card className="p-6 bg-zinc-900/50 border-zinc-700">
            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-300">
                URL du repository
              </label>
              <Input
                placeholder="https://github.com/org/project.git"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                className="bg-zinc-800 border-zinc-600 text-zinc-100"
              />
              <p className="text-xs text-zinc-500">
                Le repository sera cloné et analysé automatiquement.
              </p>
            </div>
          </Card>
        )}

        {/* Analyze button */}
        <div className="mt-8 text-center">
          <Button
            size="lg"
            disabled={!canAnalyze || loading}
            onClick={handleAnalyze}
            className="gap-2 bg-teal-600 hover:bg-teal-500 text-white px-8"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Analyser le projet
              </>
            )}
          </Button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
