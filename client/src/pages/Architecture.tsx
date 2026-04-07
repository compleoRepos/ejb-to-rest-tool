/**
 * Architecture — Visualisation interactive de l'architecture avec Cytoscape.js
 * Graphe de dépendances entre services, bounded contexts, flux de données.
 * @author Hamza NORDINE
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Network, ZoomIn, ZoomOut, Maximize2, Download, Layers, Box,
  Database, Globe, Server, Shield, Activity, ArrowRight, RefreshCw,
  Loader2, Eye, Filter,
} from "lucide-react";
import cytoscape from "cytoscape";

// ============================================================
// Types
// ============================================================

interface ArchNode {
  id: string;
  label: string;
  type: "service" | "database" | "queue" | "gateway" | "external" | "bounded-context";
  technology?: string;
  group?: string;
}

interface ArchEdge {
  source: string;
  target: string;
  label?: string;
  type: "sync" | "async" | "data" | "dependency";
}

interface ArchitectureData {
  nodes: ArchNode[];
  edges: ArchEdge[];
}

const NODE_COLORS: Record<string, string> = {
  service: "#3b82f6",
  database: "#f59e0b",
  queue: "#ef4444",
  gateway: "#8b5cf6",
  external: "#6b7280",
  "bounded-context": "#10b981",
};

const NODE_SHAPES: Record<string, string> = {
  service: "round-rectangle",
  database: "barrel",
  queue: "diamond",
  gateway: "hexagon",
  external: "ellipse",
  "bounded-context": "round-rectangle",
};

// ============================================================
// Demo Architecture Generator
// ============================================================

function generateDemoArchitecture(): ArchitectureData {
  return {
    nodes: [
      { id: "gateway", label: "API Gateway", type: "gateway", technology: "Spring Cloud Gateway" },
      { id: "payment-svc", label: "Payment Service", type: "service", technology: "Spring Boot", group: "payment" },
      { id: "order-svc", label: "Order Service", type: "service", technology: "Spring Boot", group: "order" },
      { id: "user-svc", label: "User Service", type: "service", technology: "Spring Boot", group: "user" },
      { id: "notification-svc", label: "Notification Service", type: "service", technology: "Spring Boot", group: "notification" },
      { id: "inventory-svc", label: "Inventory Service", type: "service", technology: "Spring Boot", group: "inventory" },
      { id: "payment-db", label: "Payment DB", type: "database", technology: "PostgreSQL", group: "payment" },
      { id: "order-db", label: "Order DB", type: "database", technology: "PostgreSQL", group: "order" },
      { id: "user-db", label: "User DB", type: "database", technology: "PostgreSQL", group: "user" },
      { id: "inventory-db", label: "Inventory DB", type: "database", technology: "PostgreSQL", group: "inventory" },
      { id: "kafka", label: "Kafka", type: "queue", technology: "Apache Kafka" },
      { id: "redis", label: "Redis Cache", type: "database", technology: "Redis" },
      { id: "ext-payment", label: "Payment Provider", type: "external", technology: "Stripe/PayPal" },
      { id: "ext-email", label: "Email Service", type: "external", technology: "SendGrid" },
    ],
    edges: [
      { source: "gateway", target: "payment-svc", label: "REST", type: "sync" },
      { source: "gateway", target: "order-svc", label: "REST", type: "sync" },
      { source: "gateway", target: "user-svc", label: "REST", type: "sync" },
      { source: "gateway", target: "inventory-svc", label: "REST", type: "sync" },
      { source: "payment-svc", target: "payment-db", label: "JDBC", type: "data" },
      { source: "order-svc", target: "order-db", label: "JDBC", type: "data" },
      { source: "user-svc", target: "user-db", label: "JDBC", type: "data" },
      { source: "inventory-svc", target: "inventory-db", label: "JDBC", type: "data" },
      { source: "order-svc", target: "kafka", label: "OrderCreated", type: "async" },
      { source: "kafka", target: "payment-svc", label: "OrderCreated", type: "async" },
      { source: "payment-svc", target: "kafka", label: "PaymentCompleted", type: "async" },
      { source: "kafka", target: "notification-svc", label: "PaymentCompleted", type: "async" },
      { source: "kafka", target: "inventory-svc", label: "OrderCreated", type: "async" },
      { source: "payment-svc", target: "ext-payment", label: "API", type: "sync" },
      { source: "notification-svc", target: "ext-email", label: "SMTP", type: "sync" },
      { source: "payment-svc", target: "redis", label: "Cache", type: "data" },
      { source: "order-svc", target: "redis", label: "Cache", type: "data" },
      { source: "order-svc", target: "user-svc", label: "gRPC", type: "sync" },
      { source: "order-svc", target: "inventory-svc", label: "REST", type: "sync" },
    ],
  };
}

// ============================================================
// Main Component
// ============================================================

export default function ArchitecturePage({ projectId }: { projectId: number }) {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstanceRef = useRef<cytoscape.Core | null>(null);
  const { data: project } = trpc.projects.getById.useQuery({ id: projectId });
  const { data: scans } = trpc.scans.list.useQuery({ projectId });

  const [layout, setLayout] = useState<string>("cose");
  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [archData, setArchData] = useState<ArchitectureData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load architecture data from latest scan or generate demo
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      // Check if latest scan has architecture data
      if (scans && scans.length > 0) {
        const latestScan = scans[0];
        if (latestScan.architectureGraph) {
          try {
            const parsed = typeof latestScan.architectureGraph === "string"
              ? JSON.parse(latestScan.architectureGraph)
              : latestScan.architectureGraph;
            setArchData(parsed);
            setIsLoading(false);
            return;
          } catch { /* fallthrough */ }
        }
      }
      // Generate demo architecture
      setArchData(generateDemoArchitecture());
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [scans]);

  // Initialize Cytoscape
  useEffect(() => {
    if (!cyRef.current || !archData || isLoading) return;

    const filteredNodes = filterType === "all"
      ? archData.nodes
      : archData.nodes.filter(n => n.type === filterType);
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = archData.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    const cy = cytoscape({
      container: cyRef.current,
      elements: [
        ...filteredNodes.map(n => ({
          data: { id: n.id, label: n.label, nodeType: n.type, technology: n.technology || "", group: n.group || "" },
        })),
        ...filteredEdges.map((e, i) => ({
          data: { id: `edge-${i}`, source: e.source, target: e.target, label: e.label || "", edgeType: e.type },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": "10px",
            "font-family": "'JetBrains Mono', monospace",
            color: "#e2e8f0",
            "text-outline-color": "#0f172a",
            "text-outline-width": 2,
            width: 60,
            height: 40,
            "border-width": 2,
            "border-color": "#334155",
          } as any,
        },
        ...Object.entries(NODE_COLORS).map(([type, color]) => ({
          selector: `node[nodeType = "${type}"]`,
          style: {
            "background-color": color,
            "border-color": color,
            shape: NODE_SHAPES[type] || "ellipse",
          } as any,
        })),
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "8px",
            "font-family": "'JetBrains Mono', monospace",
            color: "#94a3b8",
            "text-outline-color": "#0f172a",
            "text-outline-width": 1,
            "text-rotation": "autorotate",
          } as any,
        },
        {
          selector: 'edge[edgeType = "async"]',
          style: { "line-style": "dashed", "line-color": "#ef4444", "target-arrow-color": "#ef4444" } as any,
        },
        {
          selector: 'edge[edgeType = "data"]',
          style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b" } as any,
        },
        {
          selector: 'edge[edgeType = "sync"]',
          style: { "line-color": "#3b82f6", "target-arrow-color": "#3b82f6" } as any,
        },
        {
          selector: "node:selected",
          style: { "border-width": 4, "border-color": "#22d3ee", "background-opacity": 1 } as any,
        },
      ],
      layout: { name: layout, animate: true, animationDuration: 500, padding: 40 } as any,
    });

    cy.on("tap", "node", (evt) => {
      const nodeData = evt.target.data();
      setSelectedNode({
        id: nodeData.id,
        label: nodeData.label,
        type: nodeData.nodeType,
        technology: nodeData.technology,
        group: nodeData.group,
      });
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) setSelectedNode(null);
    });

    cyInstanceRef.current = cy;

    return () => {
      cy.destroy();
      cyInstanceRef.current = null;
    };
  }, [archData, layout, filterType, isLoading]);

  const handleZoomIn = useCallback(() => {
    cyInstanceRef.current?.zoom(cyInstanceRef.current.zoom() * 1.2);
  }, []);

  const handleZoomOut = useCallback(() => {
    cyInstanceRef.current?.zoom(cyInstanceRef.current.zoom() * 0.8);
  }, []);

  const handleFit = useCallback(() => {
    cyInstanceRef.current?.fit(undefined, 40);
  }, []);

  const handleRelayout = useCallback(() => {
    cyInstanceRef.current?.layout({ name: layout, animate: true, animationDuration: 500, padding: 40 } as any).run();
  }, [layout]);

  const handleExportPng = useCallback(() => {
    if (!cyInstanceRef.current) return;
    const png = cyInstanceRef.current.png({ full: true, scale: 2, bg: "#0f172a" });
    const link = document.createElement("a");
    link.href = png;
    link.download = `architecture-${project?.name || "project"}.png`;
    link.click();
    toast.success("Architecture exportée en PNG");
  }, [project]);

  const stats = useMemo(() => {
    if (!archData) return null;
    return {
      services: archData.nodes.filter(n => n.type === "service").length,
      databases: archData.nodes.filter(n => n.type === "database").length,
      queues: archData.nodes.filter(n => n.type === "queue").length,
      gateways: archData.nodes.filter(n => n.type === "gateway").length,
      external: archData.nodes.filter(n => n.type === "external").length,
      syncEdges: archData.edges.filter(e => e.type === "sync").length,
      asyncEdges: archData.edges.filter(e => e.type === "async").length,
      dataEdges: archData.edges.filter(e => e.type === "data").length,
    };
  }, [archData]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Chargement de l'architecture...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 border-b border-border flex items-center px-4 gap-3 shrink-0 bg-secondary/20">
        <Network className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-semibold">Architecture — {project?.name || "Projet"}</span>

        <div className="w-px h-5 bg-border mx-2" />

        <Select value={layout} onValueChange={setLayout}>
          <SelectTrigger className="w-32 h-7 text-[11px] bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cose">CoSE</SelectItem>
            <SelectItem value="breadthfirst">Hiérarchique</SelectItem>
            <SelectItem value="circle">Circulaire</SelectItem>
            <SelectItem value="grid">Grille</SelectItem>
            <SelectItem value="concentric">Concentrique</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32 h-7 text-[11px] bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les noeuds</SelectItem>
            <SelectItem value="service">Services</SelectItem>
            <SelectItem value="database">Bases de données</SelectItem>
            <SelectItem value="queue">Files d'attente</SelectItem>
            <SelectItem value="gateway">Gateways</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomIn}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomOut}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleFit}>
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleRelayout}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleExportPng}>
            <Download className="w-3 h-3" />PNG
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph */}
        <div className="flex-1 relative bg-[#0f172a]">
          <div ref={cyRef} className="absolute inset-0" />

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-background/90 border border-border rounded-lg p-3 backdrop-blur-sm">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Légende</div>
            <div className="space-y-1.5">
              {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-muted-foreground capitalize">{type.replace("-", " ")}</span>
                </div>
              ))}
              <div className="border-t border-border pt-1.5 mt-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 bg-blue-500" />
                  <span className="text-[10px] text-muted-foreground">Sync</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 bg-red-500 border-dashed border-t border-red-500" />
                  <span className="text-[10px] text-muted-foreground">Async</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 bg-amber-500" />
                  <span className="text-[10px] text-muted-foreground">Data</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-64 border-l border-border shrink-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Stats */}
              {stats && (
                <div>
                  <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" />Statistiques
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border bg-secondary/20 p-2 text-center">
                      <div className="text-lg font-bold font-mono text-blue-400">{stats.services}</div>
                      <div className="text-[9px] text-muted-foreground">Services</div>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/20 p-2 text-center">
                      <div className="text-lg font-bold font-mono text-amber-400">{stats.databases}</div>
                      <div className="text-[9px] text-muted-foreground">Databases</div>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/20 p-2 text-center">
                      <div className="text-lg font-bold font-mono text-red-400">{stats.queues}</div>
                      <div className="text-[9px] text-muted-foreground">Queues</div>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/20 p-2 text-center">
                      <div className="text-lg font-bold font-mono text-purple-400">{stats.gateways}</div>
                      <div className="text-[9px] text-muted-foreground">Gateways</div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Flux sync</span>
                      <span className="text-blue-400 font-mono">{stats.syncEdges}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Flux async</span>
                      <span className="text-red-400 font-mono">{stats.asyncEdges}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Flux data</span>
                      <span className="text-amber-400 font-mono">{stats.dataEdges}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected node info */}
              {selectedNode && (
                <div>
                  <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-cyan-400" />Noeud sélectionné
                  </h3>
                  <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
                    <div className="text-sm font-semibold text-cyan-300">{selectedNode.label}</div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: NODE_COLORS[selectedNode.type] || "#6b7280" }} />
                      <span className="text-[10px] text-muted-foreground capitalize">{selectedNode.type}</span>
                    </div>
                    {selectedNode.technology && (
                      <Badge variant="outline" className="text-[9px] h-4 border-border text-muted-foreground">
                        {selectedNode.technology}
                      </Badge>
                    )}
                    {selectedNode.group && (
                      <div className="text-[10px] text-muted-foreground">
                        Bounded Context : <span className="text-foreground capitalize">{selectedNode.group}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nodes list */}
              <div>
                <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5 text-emerald-400" />Composants ({archData?.nodes.length || 0})
                </h3>
                <div className="space-y-1">
                  {archData?.nodes.map(n => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setSelectedNode(n);
                        const cy = cyInstanceRef.current;
                        if (cy) {
                          cy.nodes().unselect();
                          cy.$(`#${n.id}`).select();
                          cy.animate({ center: { eles: cy.$(`#${n.id}`) }, duration: 300 });
                        }
                      }}
                      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-colors ${
                        selectedNode?.id === n.id ? "bg-cyan-500/10 text-cyan-300" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: NODE_COLORS[n.type] || "#6b7280" }} />
                      <span className="truncate">{n.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
