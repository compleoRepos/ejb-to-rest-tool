/**
 * FileExplorer — Arbre de fichiers générés avec indicateurs de qualité.
 * Vert = migré auto, Orange = contient TODOs, Gris = stub/config.
 * @author Compleo
 */

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, FileCode2, FolderOpen, Folder } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

interface GeneratedFile {
  path: string;
  content: string;
  category?: string;
}

interface FileExplorerProps {
  files: GeneratedFile[];
  selectedPath: string | null;
  onSelect: (file: GeneratedFile) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  file?: GeneratedFile;
  quality?: "green" | "orange" | "gray";
}

function getQuality(content: string): "green" | "orange" | "gray" {
  if (!content || content.length < 20) return "gray";
  const hasTodo = /TODO(?!.*auto-generated)/i.test(content);
  const hasImplement = /TODO:?\s*Implement/i.test(content);
  if (hasImplement) return "orange";
  if (hasTodo) return "orange";
  // Config files, stubs
  if (content.includes("@Configuration") || content.includes("application.yml") || content.includes("pom.xml")) {
    return "gray";
  }
  return "green";
}

function buildTree(files: GeneratedFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existingChild = current.children.find(c => c.name === part);

      if (existingChild) {
        current = existingChild;
      } else {
        const newNode: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          isDir: !isLast,
          children: [],
          file: isLast ? file : undefined,
          quality: isLast ? getQuality(file.content) : undefined,
        };
        current.children.push(newNode);
        current = newNode;
      }
    }
  }

  // Sort: directories first, then alphabetically
  function sortTree(nodes: TreeNode[]): TreeNode[] {
    return nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    }).map(n => ({ ...n, children: sortTree(n.children) }));
  }

  return sortTree(root.children);
}

function FileTreeNode({
  node, depth, selectedPath, onSelect, defaultOpen
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (file: GeneratedFile) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen && depth < 3);
  const isSelected = node.path === selectedPath;

  const qualityDot = node.quality ? {
    green: "bg-emerald-400",
    orange: "bg-amber-400",
    gray: "bg-white/20",
  }[node.quality] : null;

  if (node.isDir) {
    return (
      <div>
        <button
          className="flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded hover:bg-white/5 text-sm"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-white/40 shrink-0" />
          )}
          {open ? (
            <FolderOpen className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-amber-400/50 shrink-0" />
          )}
          <span className="text-white/70 truncate">{node.name}</span>
          <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0 text-white/30 border-white/10">
            {node.children.length}
          </Badge>
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {node.children.map(child => (
                <FileTreeNode
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  defaultOpen={defaultOpen}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <button
      className={`flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded text-sm transition-colors ${
        isSelected ? "bg-emerald-500/15 text-emerald-300" : "hover:bg-white/5 text-white/60"
      }`}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
      onClick={() => node.file && onSelect(node.file)}
    >
      <FileCode2 className="w-3.5 h-3.5 shrink-0 text-white/30" />
      <span className="truncate">{node.name}</span>
      {qualityDot && (
        <span className={`w-1.5 h-1.5 rounded-full ml-auto shrink-0 ${qualityDot}`} />
      )}
    </button>
  );
}

export default function FileExplorer({ files, selectedPath, onSelect }: FileExplorerProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  const stats = useMemo(() => {
    let green = 0, orange = 0, gray = 0;
    for (const f of files) {
      const q = getQuality(f.content);
      if (q === "green") green++;
      else if (q === "orange") orange++;
      else gray++;
    }
    return { green, orange, gray, total: files.length };
  }, [files]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with stats */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-white/10">
        <span className="text-xs text-white/50">{stats.total} fichiers</span>
        <div className="flex items-center gap-2 ml-auto">
          <span className="flex items-center gap-1 text-[10px] text-white/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {stats.green}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-white/40">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {stats.orange}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-white/40">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" /> {stats.gray}
          </span>
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1 px-1 py-1">
        {tree.map(node => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
            defaultOpen={true}
          />
        ))}
      </ScrollArea>
    </div>
  );
}
