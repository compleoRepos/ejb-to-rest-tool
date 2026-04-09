/**
 * CodeViewer — Affichage de code Java avec syntax highlighting.
 * Lignes TODO surlignées en orange, lignes migrées en vert subtil.
 * @author Hamza NORDINE
 */

import { useMemo } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";

interface CodeViewerProps {
  code: string;
  filePath: string;
  language?: string;
}

function detectLanguage(filePath: string): string {
  if (filePath.endsWith(".java")) return "java";
  if (filePath.endsWith(".xml") || filePath.endsWith(".pom")) return "markup";
  if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) return "yaml";
  if (filePath.endsWith(".properties")) return "properties";
  if (filePath.endsWith(".gradle")) return "groovy";
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".md")) return "markdown";
  if (filePath.endsWith(".sql")) return "sql";
  return "java";
}

export default function CodeViewer({ code, filePath, language }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const lang = language || detectLanguage(filePath);

  const todoLines = useMemo(() => {
    const lines = code.split("\n");
    const set = new Set<number>();
    lines.forEach((line, i) => {
      if (/TODO/i.test(line)) set.add(i);
    });
    return set;
  }, [code]);

  const migratedLines = useMemo(() => {
    const lines = code.split("\n");
    const set = new Set<number>();
    lines.forEach((line, i) => {
      if (/Migrated from:|@Transactional|@Service|@RestController/.test(line)) set.add(i);
    });
    return set;
  }, [code]);

  const stats = useMemo(() => {
    const lines = code.split("\n").length;
    const todos = todoLines.size;
    return { lines, todos };
  }, [code, todoLines]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const fileName = filePath.split("/").pop() || filePath;

  return (
    <div className="flex flex-col h-full bg-[oklch(0.13_0.01_250)] rounded-lg border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-white/[0.02]">
        <span className="text-xs text-white/60 font-mono truncate flex-1" title={filePath}>
          {filePath}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/10 text-white/40">
            {stats.lines} lignes
          </Badge>
          {stats.todos > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400">
              {stats.todos} TODO
            </Badge>
          )}
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Copier"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-white/40" />
            )}
          </button>
        </div>
      </div>

      {/* Code */}
      <ScrollArea className="flex-1">
        <Highlight theme={themes.nightOwl} code={code} language={lang as any}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={`${className} text-xs leading-5 p-3 min-w-0`}
              style={{ ...style, background: "transparent", margin: 0 }}
            >
              {tokens.map((line, i) => {
                const isTodo = todoLines.has(i);
                const isMigrated = migratedLines.has(i);
                const lineProps = getLineProps({ line });
                return (
                  <div
                    key={i}
                    {...lineProps}
                    className={`flex ${
                      isTodo
                        ? "bg-amber-500/10 border-l-2 border-amber-400/50"
                        : isMigrated
                        ? "bg-emerald-500/5 border-l-2 border-emerald-400/20"
                        : "border-l-2 border-transparent"
                    }`}
                  >
                    <span className="select-none w-10 text-right pr-3 text-white/20 shrink-0 font-mono">
                      {i + 1}
                    </span>
                    <span className="flex-1">
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
