/**
 * DropZone — Upload robuste pour projets Java (ZIP Maven, URL Git).
 * États visuels : idle, dragging, loading, success, error.
 * @author Compleo
 */

import { useState, useCallback, useRef } from "react";
import { Upload, Loader2, CheckCircle2, AlertTriangle, FolderArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

type DropZoneStatus = "idle" | "dragging" | "loading" | "success" | "error";

interface DropZoneProps {
  onUpload: (sessionId: string) => void;
  onDemoLoad?: () => void;
}

export default function DropZone({ onUpload, onDemoLoad }: DropZoneProps) {
  const [status, setStatus] = useState<DropZoneStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      setError("Format non supporté — ZIP Maven attendu");
      setStatus("error");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Fichier trop volumineux (max 100 MB)");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setFileName(file.name);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/compleo/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();
      if (data.sessionId) {
        localStorage.setItem("compleo_last_session", data.sessionId);
        setStatus("success");
        onUpload(data.sessionId);
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'upload — réessayer");
      setStatus("error");
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStatus("idle");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStatus("dragging");
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStatus("idle");
  }, []);

  const handleGitClone = useCallback(async () => {
    if (!gitUrl.trim()) return;
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/compleo/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: gitUrl.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Clone failed");
      }

      const data = await res.json();
      if (data.sessionId) {
        localStorage.setItem("compleo_last_session", data.sessionId);
        setStatus("success");
        onUpload(data.sessionId);
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors du clone Git");
      setStatus("error");
    }
  }, [gitUrl, onUpload]);

  const borderColor = {
    idle: "border-white/10 hover:border-emerald-500/40",
    dragging: "border-emerald-400 bg-emerald-500/5",
    loading: "border-amber-400/50",
    success: "border-emerald-400",
    error: "border-red-400/50",
  }[status];

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      {/* Drop Zone */}
      <motion.div
        className={`relative rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 ${borderColor}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => status !== "loading" && fileInputRef.current?.click()}
        whileHover={status === "idle" ? { scale: 1.01 } : {}}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        <AnimatePresence mode="wait">
          {status === "loading" ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
              <p className="text-sm text-white/60">
                Chargement de {fileName ?? "..."}
              </p>
            </motion.div>
          ) : status === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              <p className="text-sm text-emerald-400">{fileName} chargé</p>
            </motion.div>
          ) : status === "error" ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <AlertTriangle className="w-10 h-10 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setStatus("idle");
                  setError(null);
                }}
              >
                Réessayer
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <Upload className="w-10 h-10 text-white/30" />
              <p className="text-sm text-white/50">
                Glissez votre projet Java ici
              </p>
              <p className="text-xs text-white/30">
                ou cliquez pour sélectionner
              </p>
              <p className="text-xs text-white/20 mt-1">
                ZIP Maven · Dossier Java · URL Git
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Git URL input */}
      <div className="flex gap-2">
        <Input
          placeholder="https://github.com/org/repo.git"
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          className="bg-white/5 border-white/10 text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleGitClone()}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleGitClone}
          disabled={!gitUrl.trim() || status === "loading"}
          className="shrink-0"
        >
          Clone
        </Button>
      </div>

      {/* Demo button */}
      {onDemoLoad && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDemoLoad}
          className="w-full text-white/40 hover:text-white/60"
          disabled={status === "loading"}
        >
          <FolderArchive className="w-4 h-4 mr-2" />
          Projet de démo
        </Button>
      )}
    </div>
  );
}
