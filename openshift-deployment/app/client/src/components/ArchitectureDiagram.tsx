/**
 * ArchitectureDiagram — Diagrammes d'architecture legacy EJB vs Spring Boot cible.
 * Utilise Cytoscape.js pour le rendu interactif.
 * Affiche cote a cote: legacy (gauche), mapping (centre), cible (droite).
 */

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import cytoscape, { type Core } from "cytoscape";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ZoomIn, ZoomOut, Maximize2, Download, Layers,
  ArrowRight, FileCode2, Eye,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface UseCaseInfo {
  className: string;
  domain: string;
  httpMethod: string;
  restPath: string;
  voInType: string;
  voOutType: string;
}

interface DtoInfo {
  className: string;
  direction: string;
  fieldCount: number;
}

interface EnumInfo {
  className: string;
  valueCount: number;
}

interface ExceptionInfo {
  className: string;
  extendsClass: string;
}

interface RemoteServiceInfo {
  className: string;
  methodCount: number;
}

interface GeneratedFile {
  path: string;
  category: string;
  lines: number;
}

interface ArchitectureDiagramProps {
  useCases: UseCaseInfo[];
  dtos: DtoInfo[];
  enums: EnumInfo[];
  exceptions: ExceptionInfo[];
  remoteInterfaces: RemoteServiceInfo[];
  generatedFiles: GeneratedFile[];
  domains: string[];
  onNodeClick?: (nodeId: string, side: "legacy" | "target") => void;
}

// ─── Color schemes ──────────────────────────────────────────────────────────

const legacyColors: Record<string, string> = {
  usecase: "#3b82f6",    // blue
  service: "#10b981",    // green
  dto_in: "#6b7280",     // gray
  dto_out: "#9ca3af",    // lighter gray
  enum: "#f97316",       // orange
  exception: "#ef4444",  // red
};

const targetColors: Record<string, string> = {
  controller: "#8b5cf6",  // violet
  service: "#10b981",     // green
  dto: "#6b7280",         // gray
  config: "#f97316",      // orange
  test: "#06b6d4",        // cyan
  cloud: "#14b8a6",       // teal
  main: "#22c55e",        // green
};

const legacyShapes: Record<string, string> = {
  usecase: "round-rectangle",
  service: "diamond",
  dto_in: "rectangle",
  dto_out: "rectangle",
  enum: "hexagon",
  exception: "octagon",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function ArchitectureDiagram({
  useCases,
  dtos,
  enums,
  exceptions,
  remoteInterfaces,
  generatedFiles,
  domains,
  onNodeClick,
}: ArchitectureDiagramProps) {
  const legacyCyRef = useRef<HTMLDivElement>(null);
  const targetCyRef = useRef<HTMLDivElement>(null);
  const [legacyCy, setLegacyCy] = useState<Core | null>(null);
  const [targetCy, setTargetCy] = useState<Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string; side: "legacy" | "target"; label: string } | null>(null);
  const [showMapping, setShowMapping] = useState(true);

  // ─── Build legacy graph data ────────────────────────────────────────────

  const legacyElements = useMemo(() => {
    const nodes: cytoscape.ElementDefinition[] = [];
    const edges: cytoscape.ElementDefinition[] = [];

    // UseCases
    for (const uc of useCases) {
      nodes.push({
        data: {
          id: `uc-${uc.className}`,
          label: uc.className.replace(/UC$/, ""),
          type: "usecase",
          fullName: uc.className,
          domain: uc.domain,
        },
      });

      // Edge to VoIn DTO
      if (uc.voInType && uc.voInType !== "Void") {
        edges.push({
          data: {
            source: `uc-${uc.className}`,
            target: `dto-${uc.voInType}`,
            label: "uses",
          },
        });
      }

      // Edge to VoOut DTO
      if (uc.voOutType && uc.voOutType !== "Void") {
        edges.push({
          data: {
            source: `uc-${uc.className}`,
            target: `dto-${uc.voOutType}`,
            label: "returns",
          },
        });
      }
    }

    // DTOs
    for (const dto of dtos) {
      const type = dto.direction === "in" ? "dto_in" : "dto_out";
      nodes.push({
        data: {
          id: `dto-${dto.className}`,
          label: dto.className,
          type,
          fieldCount: dto.fieldCount,
        },
      });
    }

    // Enums
    for (const en of enums) {
      nodes.push({
        data: {
          id: `enum-${en.className}`,
          label: en.className,
          type: "enum",
          valueCount: en.valueCount,
        },
      });
    }

    // Exceptions
    for (const ex of exceptions) {
      nodes.push({
        data: {
          id: `exc-${ex.className}`,
          label: ex.className,
          type: "exception",
          extendsClass: ex.extendsClass,
        },
      });
    }

    // Remote services
    for (const svc of remoteInterfaces) {
      nodes.push({
        data: {
          id: `svc-${svc.className}`,
          label: svc.className.replace(/Remote$/, ""),
          type: "service",
          methodCount: svc.methodCount,
        },
      });

      // Edges from UseCases to services (simplified)
      for (const uc of useCases) {
        edges.push({
          data: {
            source: `uc-${uc.className}`,
            target: `svc-${svc.className}`,
            label: "@EJB",
          },
        });
      }
    }

    return [...nodes, ...edges];
  }, [useCases, dtos, enums, exceptions, remoteInterfaces]);

  // ─── Build target graph data ────────────────────────────────────────────

  const targetElements = useMemo(() => {
    const nodes: cytoscape.ElementDefinition[] = [];
    const edges: cytoscape.ElementDefinition[] = [];

    const filesByCategory: Record<string, GeneratedFile[]> = {};
    for (const f of generatedFiles) {
      if (!filesByCategory[f.category]) filesByCategory[f.category] = [];
      filesByCategory[f.category].push(f);
    }

    for (const [cat, files] of Object.entries(filesByCategory)) {
      for (const file of files) {
        const name = file.path.split("/").pop()?.replace(".java", "") || file.path;
        nodes.push({
          data: {
            id: `gen-${file.path}`,
            label: name,
            type: cat,
            lines: file.lines,
            path: file.path,
          },
        });
      }
    }

    // Edges: Controller → Service → DTO
    const controllers = (files: any[]) => files.filter((f: any) => f.category === "controller");
    const services = (files: any[]) => files.filter((f: any) => f.category === "service");
    const dtosGen = (files: any[]) => files.filter((f: any) => f.category === "dto");

    for (const ctrl of generatedFiles.filter(f => f.category === "controller")) {
      const ctrlName = ctrl.path.split("/").pop()?.replace("Controller.java", "") || "";
      // Find matching service
      const matchingSvc = generatedFiles.find(f =>
        f.category === "service" && f.path.includes(ctrlName)
      );
      if (matchingSvc) {
        edges.push({
          data: {
            source: `gen-${ctrl.path}`,
            target: `gen-${matchingSvc.path}`,
            label: "@Autowired",
          },
        });
      }
    }

    for (const svc of generatedFiles.filter(f => f.category === "service")) {
      // Service → DTOs (simplified)
      const svcDomain = svc.path.split("/").slice(-2, -1)[0] || "";
      for (const dto of generatedFiles.filter(f => f.category === "dto")) {
        if (dto.path.includes(svcDomain)) {
          edges.push({
            data: {
              source: `gen-${svc.path}`,
              target: `gen-${dto.path}`,
              label: "uses",
            },
          });
        }
      }
    }

    return [...nodes, ...edges];
  }, [generatedFiles]);

  // ─── Mapping data (legacy → target) ─────────────────────────────────────

  const mappings = useMemo(() => {
    const result: { legacyId: string; targetId: string; legacyLabel: string; targetLabel: string }[] = [];

    for (const uc of useCases) {
      // UseCase → Controller
      const domain = uc.domain.toLowerCase();
      const ctrl = generatedFiles.find(f =>
        f.category === "controller" && f.path.toLowerCase().includes(domain)
      );
      if (ctrl) {
        result.push({
          legacyId: `uc-${uc.className}`,
          targetId: `gen-${ctrl.path}`,
          legacyLabel: uc.className,
          targetLabel: ctrl.path.split("/").pop()?.replace(".java", "") || "",
        });
      }
    }

    for (const dto of dtos) {
      // DTO → RequestDTO/ResponseDTO
      const dtoName = dto.className;
      const genDto = generatedFiles.find(f =>
        f.category === "dto" && (
          f.path.includes(dtoName.replace("VoIn", "RequestDTO")) ||
          f.path.includes(dtoName.replace("VoOut", "ResponseDTO")) ||
          f.path.includes(dtoName)
        )
      );
      if (genDto) {
        result.push({
          legacyId: `dto-${dto.className}`,
          targetId: `gen-${genDto.path}`,
          legacyLabel: dto.className,
          targetLabel: genDto.path.split("/").pop()?.replace(".java", "") || "",
        });
      }
    }

    for (const en of enums) {
      const genEnum = generatedFiles.find(f =>
        f.category === "enum" && f.path.includes(en.className)
      );
      if (genEnum) {
        result.push({
          legacyId: `enum-${en.className}`,
          targetId: `gen-${genEnum.path}`,
          legacyLabel: en.className,
          targetLabel: en.className + " (preserved)",
        });
      }
    }

    return result;
  }, [useCases, dtos, enums, generatedFiles]);

  // ─── Initialize Cytoscape instances ─────────────────────────────────────

  useEffect(() => {
    if (!legacyCyRef.current) return;

    const cy = cytoscape({
      container: legacyCyRef.current,
      elements: legacyElements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": "10px",
            color: "#e2e8f0",
            "text-outline-color": "#0f172a",
            "text-outline-width": 1,
            width: 80,
            height: 40,
            "border-width": 2,
            "border-color": "#334155",
          },
        },
        ...Object.entries(legacyColors).map(([type, color]) => ({
          selector: `node[type="${type}"]`,
          style: {
            "background-color": color,
            shape: legacyShapes[type] || "rectangle",
          } as any,
        })),
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "font-size": "8px",
            color: "#64748b",
          } as any,
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#10b981",
            "border-width": 3,
          } as any,
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        padding: 20,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 100,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    cy.on("tap", "node", (evt) => {
      const nodeId = evt.target.id();
      const label = evt.target.data("label");
      setSelectedNode({ id: nodeId, side: "legacy", label });
      onNodeClick?.(nodeId, "legacy");
    });

    setLegacyCy(cy);

    return () => { cy.destroy(); };
  }, [legacyElements]);

  useEffect(() => {
    if (!targetCyRef.current) return;

    const cy = cytoscape({
      container: targetCyRef.current,
      elements: targetElements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": "10px",
            color: "#e2e8f0",
            "text-outline-color": "#0f172a",
            "text-outline-width": 1,
            width: 80,
            height: 40,
            "border-width": 2,
            "border-color": "#334155",
            shape: "round-rectangle",
          },
        },
        ...Object.entries(targetColors).map(([type, color]) => ({
          selector: `node[type="${type}"]`,
          style: {
            "background-color": color,
          },
        })),
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "font-size": "8px",
            color: "#64748b",
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#10b981",
            "border-width": 3,
          },
        },
      ],
      layout: {
        name: "breadthfirst",
        directed: true,
        padding: 20,
        spacingFactor: 1.2,
        animate: false,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    cy.on("tap", "node", (evt) => {
      const nodeId = evt.target.id();
      const label = evt.target.data("label");
      setSelectedNode({ id: nodeId, side: "target", label });
      onNodeClick?.(nodeId, "target");
    });

    setTargetCy(cy);

    return () => { cy.destroy(); };
  }, [targetElements]);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleZoom = useCallback((cy: Core | null, factor: number) => {
    if (!cy) return;
    cy.zoom(cy.zoom() * factor);
  }, []);

  const handleFit = useCallback((cy: Core | null) => {
    if (!cy) return;
    cy.fit(undefined, 20);
  }, []);

  const handleExportPng = useCallback((cy: Core | null, name: string) => {
    if (!cy) return;
    const png = cy.png({ full: true, scale: 2, bg: "#0f172a" });
    const link = document.createElement("a");
    link.href = png;
    link.download = `${name}-architecture.png`;
    link.click();
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)]">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-semibold text-white">Architecture Legacy vs Cible</span>
          <Badge variant="outline" className="text-xs text-[oklch(0.5_0.01_250)] border-[oklch(0.3_0.01_250)]">
            {legacyElements.filter(e => !e.data.source).length} → {targetElements.filter(e => !e.data.source).length} noeuds
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showMapping ? "default" : "outline"}
            size="sm"
            onClick={() => setShowMapping(!showMapping)}
            className={showMapping
              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
              : "border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)]"
            }
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1" />
            Mapping
          </Button>
        </div>
      </div>

      {/* Diagrams */}
      <div className="flex-1 grid grid-cols-12 divide-x divide-[oklch(0.25_0.01_250)]">
        {/* Legacy diagram */}
        <div className={`${showMapping ? "col-span-5" : "col-span-6"} flex flex-col`}>
          <div className="px-3 py-2 border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">LEGACY EJB</Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => handleZoom(legacyCy, 1.2)} className="h-7 w-7 p-0 text-[oklch(0.5_0.01_250)]">
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleZoom(legacyCy, 0.8)} className="h-7 w-7 p-0 text-[oklch(0.5_0.01_250)]">
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleFit(legacyCy)} className="h-7 w-7 p-0 text-[oklch(0.5_0.01_250)]">
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleExportPng(legacyCy, "legacy")} className="h-7 w-7 p-0 text-[oklch(0.5_0.01_250)]">
                <Download className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div ref={legacyCyRef} className="flex-1 bg-[oklch(0.12_0.01_250)]" />
          {/* Legend */}
          <div className="px-3 py-2 border-t border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] flex items-center gap-3 flex-wrap">
            {Object.entries(legacyColors).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-[oklch(0.5_0.01_250)]">{type.replace("_", " ")}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mapping panel */}
        {showMapping && (
          <div className="col-span-2 flex flex-col bg-[oklch(0.13_0.01_250)]">
            <div className="px-3 py-2 border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)]">
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">MAPPING</Badge>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {mappings.map((m, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-lg bg-[oklch(0.16_0.01_250)] border border-[oklch(0.22_0.01_250)] text-[10px]"
                  >
                    <div className="text-blue-400 font-mono truncate">{m.legacyLabel}</div>
                    <div className="flex items-center justify-center my-0.5">
                      <ArrowRight className="w-3 h-3 text-amber-400" />
                    </div>
                    <div className="text-emerald-400 font-mono truncate">{m.targetLabel}</div>
                  </div>
                ))}
                {mappings.length === 0 && (
                  <div className="text-center text-[oklch(0.4_0.01_250)] text-xs py-4">
                    Aucun mapping detecte
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Target diagram */}
        <div className={`${showMapping ? "col-span-5" : "col-span-6"} flex flex-col`}>
          <div className="px-3 py-2 border-b border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">CIBLE SPRING BOOT</Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => handleZoom(targetCy, 1.2)} className="h-7 w-7 p-0 text-[oklch(0.5_0.01_250)]">
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleZoom(targetCy, 0.8)} className="h-7 w-7 p-0 text-[oklch(0.5_0.01_250)]">
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleFit(targetCy)} className="h-7 w-7 p-0 text-[oklch(0.5_0.01_250)]">
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleExportPng(targetCy, "target")} className="h-7 w-7 p-0 text-[oklch(0.5_0.01_250)]">
                <Download className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div ref={targetCyRef} className="flex-1 bg-[oklch(0.12_0.01_250)]" />
          {/* Legend */}
          <div className="px-3 py-2 border-t border-[oklch(0.25_0.01_250)] bg-[oklch(0.14_0.01_250)] flex items-center gap-3 flex-wrap">
            {Object.entries(targetColors).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-[oklch(0.5_0.01_250)]">{type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected node info */}
      {selectedNode && (
        <div className="p-3 border-t border-[oklch(0.25_0.01_250)] bg-[oklch(0.15_0.01_250)] flex items-center gap-3">
          <Badge variant="outline" className={`text-xs ${
            selectedNode.side === "legacy" ? "text-blue-400 border-blue-500/30" : "text-emerald-400 border-emerald-500/30"
          }`}>
            {selectedNode.side === "legacy" ? "Legacy" : "Cible"}
          </Badge>
          <span className="text-sm text-white font-mono">{selectedNode.label}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNodeClick?.(selectedNode.id, selectedNode.side)}
            className="ml-auto border-[oklch(0.25_0.01_250)] text-[oklch(0.7_0.01_250)] hover:text-white"
          >
            <Eye className="w-3.5 h-3.5 mr-1" />
            Voir le code
          </Button>
        </div>
      )}
    </div>
  );
}
