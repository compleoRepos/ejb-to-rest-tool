/**
 * CodeDiff — Comparateur visuel code source EJB vs code Spring Boot genere.
 * Modes: diff (unified), side-by-side, generated-only.
 * Syntax highlighting Java, numeros de ligne, bouton Copier.
 */

import { useState, useMemo, useCallback } from "react";
import { diffLines, type Change } from "diff";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Copy, Columns2, FileCode2, Sparkles, ArrowLeftRight,
  Eye, ChevronDown,
} from "lucide-react";

type ViewMode = "side-by-side" | "diff" | "generated-only";

interface CodeDiffProps {
  sourceCode: string | null;
  sourceFileName: string | null;
  generatedCode: string;
  generatedFileName: string;
  category: string;
}

// Simple Java keyword highlighter
function highlightJava(code: string): string {
  return code;
}

function LineNumber({ n }: { n: number }) {
  return (
    <span className="inline-block w-10 text-right pr-3 select-none text-[oklch(0.4_0.01_250)] text-xs font-mono">
      {n}
    </span>
  );
}

export default function CodeDiff({
  sourceCode,
  sourceFileName,
  generatedCode,
  generatedFileName,
  category,
}: CodeDiffProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(
    sourceCode ? "side-by-side" : "generated-only"
  );

  const handleCopy = useCallback(async (code: string, label: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`${label} copie dans le presse-papier`);
    } catch {
      toast.error("Impossible de copier");
    }
  }, []);

  // Compute diff
  const changes = useMemo(() => {
    if (!sourceCode) return null;
    return diffLines(sourceCode, generatedCode);
  }, [sourceCode, generatedCode]);

  // Build side-by-side lines
  const sideBySideData = useMemo(() => {
    if (!changes) return null;

    const leftLines: { text: string; type: "normal" | "removed" | "context"; lineNum: number }[] = [];
    const rightLines: { text: string; type: "normal" | "added" | "context"; lineNum: number }[] = [];

    let leftNum = 0;
    let rightNum = 0;

    for (const change of changes) {
      const lines = change.value.split("\n");
      // Remove trailing empty string from split
      if (lines[lines.length - 1] === "") lines.pop();

      if (change.added) {
        for (const line of lines) {
          rightNum++;
          rightLines.push({ text: line, type: "added", lineNum: rightNum });
          leftLines.push({ text: "", type: "context", lineNum: 0 });
        }
      } else if (change.removed) {
        for (const line of lines) {
          leftNum++;
          leftLines.push({ text: line, type: "removed", lineNum: leftNum });
          rightLines.push({ text: "", type: "context", lineNum: 0 });
        }
      } else {
        for (const line of lines) {
          leftNum++;
          rightNum++;
          leftLines.push({ text: line, type: "normal", lineNum: leftNum });
          rightLines.push({ text: line, type: "normal", lineNum: rightNum });
        }
      }
    }

    return { leftLines, rightLines };
  }, [changes]);

  // Build unified diff lines
  const unifiedLines = useMemo(() => {
    if (!changes) return null;

    const lines: { text: string; type: "added" | "removed" | "normal"; leftNum: number; rightNum: number }[] = [];
    let leftNum = 0;
    let rightNum = 0;

    for (const change of changes) {
      const changeLines = change.value.split("\n");
      if (changeLines[changeLines.length - 1] === "") changeLines.pop();

      for (const line of changeLines) {
        if (change.added) {
          rightNum++;
          lines.push({ text: line, type: "added", leftNum: 0, rightNum });
        } else if (change.removed) {
          leftNum++;
          lines.push({ text: line, type: "removed", leftNum, rightNum: 0 });
        } else {
          leftNum++;
          rightNum++;
          lines.push({ text: line, type: "normal", leftNum, rightNum });
        }
      }
    }

    return lines;
  }, [changes]);

  const lineColorClass = (type: string) => {
    switch (type) {
      case "added": return "bg-emerald-500/10 text-emerald-300";
      case "removed": return "bg-red-500/10 text-red-300";
      default: return "text-[oklch(0.8_0.01_250)]";
    }
  };

  const lineGutterClass = (type: string) => {
    switch (type) {
      case "added": return "bg-emerald-500/20 text-emerald-400";
      case "removed": return "bg-red-500/20 text-red-400";
      default: return "";
    }
  };

  const hasSource = !!sourceCode;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)]">
        <div className="flex items-center gap-2">
          {hasSource ? (
            <>
              <Button
                variant={viewMode === "side-by-side" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("side-by-side")}
                className={viewMode === "side-by-side"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : "border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)]"
                }
              >
                <Columns2 className="w-3.5 h-3.5 mr-1" />
                Cote a cote
              </Button>
              <Button
                variant={viewMode === "diff" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("diff")}
                className={viewMode === "diff"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : "border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)]"
                }
              >
                <ArrowLeftRight className="w-3.5 h-3.5 mr-1" />
                Diff
              </Button>
              <Button
                variant={viewMode === "generated-only" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("generated-only")}
                className={viewMode === "generated-only"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : "border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)]"
                }
              >
                <Eye className="w-3.5 h-3.5 mr-1" />
                Genere seul
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-medium">Nouveau fichier cree par Compleo</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasSource && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(sourceCode!, "Code source")}
              className="border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)] hover:text-white"
            >
              <Copy className="w-3.5 h-3.5 mr-1" />
              Source
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopy(generatedCode, "Code genere")}
            className="border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)] hover:text-white"
          >
            <Copy className="w-3.5 h-3.5 mr-1" />
            Genere
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {/* Side by side */}
        {viewMode === "side-by-side" && hasSource && sideBySideData && (
          <div className="grid grid-cols-2 h-full divide-x divide-[oklch(0.25_0.01_250)]">
            {/* Left: Source */}
            <div className="flex flex-col h-full overflow-hidden">
              <div className="px-3 py-2 border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)]">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-blue-400 font-mono truncate">{sourceFileName}</span>
                  <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30 ml-auto">EJB Source</Badge>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <pre className="text-xs leading-5 font-mono">
                  {sideBySideData.leftLines.map((line, i) => (
                    <div key={i} className={`flex ${lineColorClass(line.type)} ${line.lineNum === 0 ? "opacity-30" : ""}`}>
                      <span className={`inline-block w-10 text-right pr-3 select-none text-xs ${lineGutterClass(line.type)} ${line.lineNum === 0 ? "text-transparent" : "text-[oklch(0.4_0.01_250)]"}`}>
                        {line.lineNum || " "}
                      </span>
                      <span className="px-2 whitespace-pre">{line.type === "removed" ? "- " : "  "}{line.text}</span>
                    </div>
                  ))}
                </pre>
              </ScrollArea>
            </div>

            {/* Right: Generated */}
            <div className="flex flex-col h-full overflow-hidden">
              <div className="px-3 py-2 border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)]">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-mono truncate">{generatedFileName}</span>
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30 ml-auto">Spring Boot</Badge>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <pre className="text-xs leading-5 font-mono">
                  {sideBySideData.rightLines.map((line, i) => (
                    <div key={i} className={`flex ${lineColorClass(line.type)} ${line.lineNum === 0 ? "opacity-30" : ""}`}>
                      <span className={`inline-block w-10 text-right pr-3 select-none text-xs ${lineGutterClass(line.type)} ${line.lineNum === 0 ? "text-transparent" : "text-[oklch(0.4_0.01_250)]"}`}>
                        {line.lineNum || " "}
                      </span>
                      <span className="px-2 whitespace-pre">{line.type === "added" ? "+ " : "  "}{line.text}</span>
                    </div>
                  ))}
                </pre>
              </ScrollArea>
            </div>
          </div>
        )}

        {/* Unified diff */}
        {viewMode === "diff" && hasSource && unifiedLines && (
          <ScrollArea className="h-full">
            <pre className="text-xs leading-5 font-mono">
              {unifiedLines.map((line, i) => (
                <div key={i} className={`flex ${lineColorClass(line.type)}`}>
                  <span className={`inline-block w-10 text-right pr-1 select-none text-xs ${lineGutterClass(line.type)} text-[oklch(0.4_0.01_250)]`}>
                    {line.leftNum || " "}
                  </span>
                  <span className={`inline-block w-10 text-right pr-3 select-none text-xs ${lineGutterClass(line.type)} text-[oklch(0.4_0.01_250)]`}>
                    {line.rightNum || " "}
                  </span>
                  <span className="px-2 whitespace-pre">
                    {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "} {line.text}
                  </span>
                </div>
              ))}
            </pre>
          </ScrollArea>
        )}

        {/* Generated only */}
        {(viewMode === "generated-only" || !hasSource) && (
          <ScrollArea className="h-full">
            <pre className="p-4 text-xs leading-5 font-mono">
              {generatedCode.split("\n").map((line, i) => (
                <div key={i} className="flex text-[oklch(0.8_0.01_250)]">
                  <LineNumber n={i + 1} />
                  <span className="whitespace-pre">{line}</span>
                </div>
              ))}
            </pre>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
