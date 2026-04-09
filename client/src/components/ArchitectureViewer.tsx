/**
 * ArchitectureViewer — Composant Cytoscape.js interactif v6.0.
 * V6: Réécriture complète pour lisibilité architecte.
 *   FIX 1: Layout dans requestAnimationFrame (pas pendant init)
 *   FIX 2: 3 niveaux de zoom avec drill-down interactif
 *   FIX 3: Styles Cytoscape clairs et distincts
 *   FIX 4: Panel détail, légende, contrôles
 *   FIX 5: Données API normalisées
 *
 * @author Hamza NORDINE
 */

import { useEffect, useRef, useState, useCallback } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
// @ts-ignore
import dagre from "cytoscape-dagre";
// @ts-ignore
import cola from "cytoscape-cola";
// @ts-ignore
import svg from "cytoscape-svg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Download,
  Eye,
  EyeOff,
  Network,
  Box,
  ArrowLeft,
  Filter,
} from "lucide-react";

// Register layout extensions (idempotent)
try { cytoscape.use(dagre); } catch { /* already registered */ }
try { cytoscape.use(cola); } catch { /* already registered */ }
try { cytoscape.use(svg); } catch { /* already registered */ }

// ─── Types ──────────────────────────────────────────────────────────────────

interface CytoscapeNode {
  data: {
    id: string;
    label: string;
    type: string;
    domain?: string;
    role?: string;
    linesOfCode?: number;
    complexity?: number;
    technologyType?: string;
    parent?: string;
    [key: string]: unknown;
  };
}

interface CytoscapeEdge {
  data: {
    id: string;
    source: string;
    target: string;
    type: string;
    weight?: number;
    label?: string;
  };
}

interface CytoscapeData {
  nodes: CytoscapeNode[];
  edges: CytoscapeEdge[];
}

interface MicroserviceData {
  id: string;
  name: string;
  boundedContext: string;
  classes: string[];
  classCount: number;
  endpoints: number;
  cohesion: number;
  coupling: number;
  dependencies: Array<{
    targetServiceId: string;
    targetServiceName: string;
    type: string;
  }>;
}

interface ArchitectureViewerProps {
  cytoscapeData: CytoscapeData | null;
  microservices: MicroserviceData[];
  svgDependency?: string;
  svgMicroservices?: string;
  svgOverview?: string;
  onExport?: (format: string) => void;
}

// ─── Color Palette ──────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  ACCOUNT_MANAGEMENT: "#4A90D9",
  PAYMENT_PROCESSING: "#E74C3C",
  CREDIT_MANAGEMENT: "#F39C12",
  KYC_COMPLIANCE: "#27AE60",
  CARD_MANAGEMENT: "#9B59B6",
  BATCH_PROCESSING: "#1ABC9C",
  RISK_MANAGEMENT: "#E67E22",
  TRANSFER_MANAGEMENT: "#3498DB",
  CUSTOMER_MANAGEMENT: "#2ECC71",
  REPORTING: "#95A5A6",
  UNKNOWN: "#BDC3C7",
};

// FIX 3: Couleurs de fond par domaine (plus foncées, pour compound nodes)
const DOMAIN_BG_COLORS: Record<string, string> = {
  ACCOUNT_MANAGEMENT: "#1a3a5f",
  PAYMENT_PROCESSING: "#4a1a1a",
  CREDIT_MANAGEMENT: "#4a3a1a",
  KYC_COMPLIANCE: "#1a4a3a",
  CARD_MANAGEMENT: "#3a1a4a",
  BATCH_PROCESSING: "#1a3a3a",
  RISK_MANAGEMENT: "#3a2a1a",
  TRANSFER_MANAGEMENT: "#1a2a4a",
  CUSTOMER_MANAGEMENT: "#1a3a2a",
  REPORTING: "#2a2a2a",
  UNKNOWN: "#2a2a2a",
};

const EDGE_STYLES: Record<string, { color: string; dash: string; label: string }> = {
  CALLS: { color: "#636e72", dash: "solid", label: "Appels" },
  DEPENDS_ON: { color: "#3498DB", dash: "solid", label: "Dépendances" },
  JNDI_LOOKUP: { color: "#ffa502", dash: "dashed", label: "JNDI Lookup" },
  DB_ACCESS: { color: "#ff4757", dash: "dotted", label: "Accès BD" },
  EMITS_EVENT: { color: "#27AE60", dash: "dotted", label: "Événements" },
  SOAP_CALLS: { color: "#9B59B6", dash: "solid", label: "SOAP" },
  SHARES_DTO: { color: "#95A5A6", dash: "solid", label: "DTO partagé" },
  TRANSACTION_WITH: { color: "#1ABC9C", dash: "solid", label: "Transaction" },
};

const ROLE_COLORS: Record<string, { bg: string; border: string }> = {
  ORCHESTRATOR: { bg: "#6c5ce7", border: "#a29bfe" },
  DOMAIN_SERVICE: { bg: "#00b894", border: "#55efc4" },
  REPOSITORY: { bg: "#e17055", border: "#fab1a0" },
  VALUE_OBJECT: { bg: "#636e72", border: "#b2bec3" },
  ENUM_TYPE: { bg: "#fdcb6e", border: "#ffeaa7" },
  EXCEPTION_TYPE: { bg: "#d63031", border: "#ff7675" },
  ENTRY_POINT: { bg: "#0984e3", border: "#74b9ff" },
  BATCH_STEP: { bg: "#00cec9", border: "#81ecec" },
};

const ROLE_SHAPES: Record<string, string> = {
  ORCHESTRATOR: "hexagon",
  DOMAIN_SERVICE: "roundrectangle",
  REPOSITORY: "barrel",
  VALUE_OBJECT: "ellipse",
  ENUM_TYPE: "diamond",
  EXCEPTION_TYPE: "triangle",
  ENTRY_POINT: "star",
  BATCH_STEP: "round-rectangle",
};

// ─── Cytoscape Styles (FIX 3) ──────────────────────────────────────────────

function buildCytoscapeStyles(): any[] {
  return [
    // ── Microservice compound nodes ──────────────────────────
    {
      selector: 'node[type="microservice"]',
      style: {
        "background-color": (ele: cytoscape.NodeSingular) => {
          const ctx = ele.data("boundedContext") || "";
          const domainKey = ctx.split("+")[0];
          return DOMAIN_BG_COLORS[domainKey] || DOMAIN_BG_COLORS.UNKNOWN;
        },
        "background-opacity": 0.6,
        "border-width": 2,
        "border-color": (ele: cytoscape.NodeSingular) => {
          const ctx = ele.data("boundedContext") || "";
          const domainKey = ctx.split("+")[0];
          return DOMAIN_COLORS[domainKey] || DOMAIN_COLORS.UNKNOWN;
        },
        "border-style": "solid",
        label: "data(label)",
        "text-valign": "top",
        "text-halign": "center",
        color: "#ffffff",
        "font-size": "14px",
        "font-weight": "bold",
        "text-margin-y": -10,
        padding: "30px",
        shape: "round-rectangle",
      } as any,
    },
    // ── Domain compound nodes ────────────────────────────────
    {
      selector: 'node[type="domain"]',
      style: {
        "background-color": (ele: cytoscape.NodeSingular) => {
          const domain = ele.data("id")?.replace("domain-", "") || "UNKNOWN";
          return DOMAIN_BG_COLORS[domain] || DOMAIN_BG_COLORS.UNKNOWN;
        },
        "background-opacity": 0.6,
        "border-width": 2,
        "border-color": (ele: cytoscape.NodeSingular) => {
          const domain = ele.data("id")?.replace("domain-", "") || "UNKNOWN";
          return DOMAIN_COLORS[domain] || DOMAIN_COLORS.UNKNOWN;
        },
        label: "data(label)",
        "text-valign": "top",
        "text-halign": "center",
        color: "#ffffff",
        "font-size": "13px",
        "font-weight": "bold",
        "text-margin-y": -10,
        padding: "25px",
        shape: "round-rectangle",
      } as any,
    },
    // ── Class nodes ──────────────────────────────────────────
    {
      selector: 'node[type="CLASS"]',
      style: {
        "background-color": (ele: cytoscape.NodeSingular) => {
          const role = ele.data("role") || "";
          return ROLE_COLORS[role]?.bg || "#2d3436";
        },
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        color: "#dfe6e9",
        "font-size": "10px",
        width: (ele: cytoscape.NodeSingular) => {
          const loc = ele.data("linesOfCode") || 50;
          return Math.max(25, Math.min(60, loc / 6));
        },
        height: (ele: cytoscape.NodeSingular) => {
          const loc = ele.data("linesOfCode") || 50;
          return Math.max(25, Math.min(60, loc / 6));
        },
        shape: (ele: cytoscape.NodeSingular) => {
          const role = ele.data("role") || "";
          return ROLE_SHAPES[role] || "ellipse";
        },
        "border-width": 2,
        "border-color": (ele: cytoscape.NodeSingular) => {
          const role = ele.data("role") || "";
          return ROLE_COLORS[role]?.border || "#636e72";
        },
        "text-wrap": "ellipsis",
        "text-max-width": "120px",
      } as any,
    },
    // ── External nodes ───────────────────────────────────────
    {
      selector: 'node[type="EXTERNAL"]',
      style: {
        "background-color": "#F39C12",
        shape: "rectangle",
        label: "data(label)",
        "text-valign": "bottom",
        color: "#ffa502",
        "font-size": "9px",
        width: 28,
        height: 28,
        "border-width": 2,
        "border-color": "#e67e22",
      },
    },
    // ── Edges — base style ───────────────────────────────────
    {
      selector: "edge",
      style: {
        width: (ele: cytoscape.EdgeSingular) => {
          const w = ele.data("weight") || 1;
          return Math.max(1.5, Math.min(4, w * 1.5));
        },
        "line-color": (ele: cytoscape.EdgeSingular) => {
          const type = ele.data("type") || "DEPENDS_ON";
          return EDGE_STYLES[type]?.color || "#636e72";
        },
        "target-arrow-color": (ele: cytoscape.EdgeSingular) => {
          const type = ele.data("type") || "DEPENDS_ON";
          return EDGE_STYLES[type]?.color || "#636e72";
        },
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.8,
        opacity: 0.65,
        "line-style": (ele: cytoscape.EdgeSingular) => {
          const type = ele.data("type");
          if (type === "JNDI_LOOKUP") return "dashed";
          if (type === "EMITS_EVENT" || type === "DB_ACCESS") return "dotted";
          return "solid";
        },
      } as any,
    },
    // ── JNDI edges with label ────────────────────────────────
    {
      selector: 'edge[type="JNDI_LOOKUP"]',
      style: {
        label: "JNDI",
        "font-size": "9px",
        color: "#ffa502",
        "text-background-color": "#0f0f23",
        "text-background-opacity": 1,
        "text-background-padding": "2px",
        width: 2,
      } as any,
    },
    // ── DB access edges ──────────────────────────────────────
    {
      selector: 'edge[type="DB_ACCESS"]',
      style: {
        width: 2,
      } as any,
    },
    // ── Selected state ───────────────────────────────────────
    {
      selector: ":selected",
      style: {
        "border-width": 3,
        "border-color": "#FFD700",
        "z-index": 999,
      },
    },
    // ── Hover state ──────────────────────────────────────────
    {
      selector: "node:active",
      style: {
        "border-width": 3,
        "border-color": "#ffffff",
        "overlay-opacity": 0,
      },
    },
  ];
}

// ─── Layout Configs (FIX 1: improved spacing) ───────────────────────────────

function getLayoutConfig(layoutName: string, hasCompoundNodes: boolean): cytoscape.LayoutOptions {
  // FIX 1: Force cose for compound nodes (dagre crashes with parent-child)
  const effectiveName = hasCompoundNodes && (layoutName === "dagre" || layoutName === "breadthfirst")
    ? "cose"
    : layoutName;

  switch (effectiveName) {
    case "dagre":
      return {
        name: "dagre",
        rankDir: "TB",
        nodeSep: 80,
        rankSep: 120,
        edgeSep: 20,
        padding: 60,
        animate: false,
        fit: true,
      } as any;
    case "cola":
      return {
        name: "cola",
        animate: false,
        maxSimulationTime: 3000,
        nodeSpacing: 40,
        edgeLength: 150,
        convergenceThreshold: 0.01,
        fit: true,
        padding: 40,
      } as any;
    case "cose":
      return {
        name: "cose",
        animate: false,
        nodeRepulsion: () => 20000,
        idealEdgeLength: () => 150,
        edgeElasticity: () => 100,
        gravity: 0.15,
        numIter: 800,
        fit: true,
        padding: 50,
        nodeOverlap: 30,
        nestingFactor: 1.2,
      } as any;
    case "circle":
      return {
        name: "circle",
        animate: false,
        fit: true,
        padding: 40,
      } as cytoscape.LayoutOptions;
    case "breadthfirst":
      return {
        name: "breadthfirst",
        animate: false,
        directed: true,
        spacingFactor: 1.8,
        fit: true,
        padding: 40,
      } as cytoscape.LayoutOptions;
    default:
      return {
        name: "dagre",
        animate: false,
        fit: true,
        padding: 40,
      } as any;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ArchitectureViewer({
  cytoscapeData,
  microservices,
  svgDependency,
  svgMicroservices,
  svgOverview,
  onExport,
}: ArchitectureViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [viewLevel, setViewLevel] = useState<"microservices" | "domains" | "classes" | "detail">("microservices");
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<CytoscapeNode["data"] | null>(null);
  const [layout, setLayout] = useState<string>("dagre");
  const [activeTab, setActiveTab] = useState<string>("interactive");
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Set<string>>(
    new Set(Object.keys(EDGE_STYLES))
  );
  const [showLegend, setShowLegend] = useState(true);

  // ─── Toggle edge type visibility ─────────────────────────────────────

  const toggleEdgeType = useCallback((edgeType: string) => {
    setVisibleEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(edgeType)) {
        next.delete(edgeType);
      } else {
        next.add(edgeType);
      }
      return next;
    });
  }, []);

  // ─── Export functions ────────────────────────────────────────────────

  const exportSVG = useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const svgContent = (cy as any).svg({ full: true, scale: 1, bg: "#0f0f23" });
    if (typeof svgContent === "string") {
      const blob = new Blob([svgContent], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "architecture-graph.svg";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      exportPNG();
    }
  }, []);

  const exportPNG = useCallback(() => {
    if (!cyRef.current) return;
    const pngData = cyRef.current.png({ full: true, scale: 2, bg: "#0f0f23" });
    const a = document.createElement("a");
    a.href = pngData;
    a.download = "architecture-graph.png";
    a.click();
  }, []);

  // ─── Build elements for current view level (FIX 2) ──────────────────

  const buildElements = useCallback((): cytoscape.ElementDefinition[] => {
    if (!cytoscapeData) return [];
    const elements: cytoscape.ElementDefinition[] = [];

    if (viewLevel === "microservices" && microservices.length > 0) {
      // ── Vue microservices: compound nodes par microservice ──
      const classToService = new Map<string, string>();
      for (const svc of microservices) {
        elements.push({
          data: {
            id: `ms-${svc.id}`,
            label: svc.name,
            type: "microservice",
            classCount: svc.classCount,
            endpoints: svc.endpoints,
            cohesion: svc.cohesion,
            coupling: svc.coupling,
            boundedContext: svc.boundedContext,
          },
        });
        for (const cls of svc.classes) {
          classToService.set(cls, svc.id);
        }
      }

      for (const node of cytoscapeData.nodes) {
        const serviceId = classToService.get(node.data.id);
        if (serviceId) {
          elements.push({
            data: { ...node.data, parent: `ms-${serviceId}` },
          });
        } else {
          elements.push({ data: { ...node.data } });
        }
      }

      for (const edge of cytoscapeData.edges) {
        if (visibleEdgeTypes.has(edge.data.type)) {
          elements.push({ data: { ...edge.data } });
        }
      }
    } else if (viewLevel === "domains" || (viewLevel === "microservices" && microservices.length === 0)) {
      // ── Vue domaines: compound nodes par domaine ──
      // If selectedDomain is set, show only that domain's classes (drill-down)
      if (selectedDomain) {
        const domainNodes = cytoscapeData.nodes.filter(
          (n) => n.data.domain === selectedDomain
        );
        for (const node of domainNodes) {
          elements.push({ data: { ...node.data } });
        }
        // Only edges within the domain
        const domainNodeIds = new Set(domainNodes.map((n) => n.data.id));
        for (const edge of cytoscapeData.edges) {
          if (
            visibleEdgeTypes.has(edge.data.type) &&
            domainNodeIds.has(edge.data.source) &&
            domainNodeIds.has(edge.data.target)
          ) {
            elements.push({ data: { ...edge.data } });
          }
        }
      } else {
        // All domains as compound nodes
        const domains = new Map<string, string[]>();
        for (const node of cytoscapeData.nodes) {
          const domain = node.data.domain || "UNKNOWN";
          if (!domains.has(domain)) domains.set(domain, []);
          domains.get(domain)!.push(node.data.id);
        }

        for (const [domain, nodeIds] of domains) {
          elements.push({
            data: {
              id: `domain-${domain}`,
              label: domain.replace(/_/g, " "),
              type: "domain",
              classCount: nodeIds.length,
            },
          });

          for (const nodeId of nodeIds) {
            const originalNode = cytoscapeData.nodes.find((n) => n.data.id === nodeId);
            if (originalNode) {
              elements.push({
                data: { ...originalNode.data, parent: `domain-${domain}` },
              });
            }
          }
        }

        for (const edge of cytoscapeData.edges) {
          if (visibleEdgeTypes.has(edge.data.type)) {
            elements.push({ data: { ...edge.data } });
          }
        }
      }
    } else if (viewLevel === "classes") {
      // ── Vue classes: flat, toutes les classes ──
      for (const node of cytoscapeData.nodes) {
        elements.push({ data: { ...node.data } });
      }
      for (const edge of cytoscapeData.edges) {
        if (visibleEdgeTypes.has(edge.data.type)) {
          elements.push({ data: { ...edge.data } });
        }
      }
    }

    return elements;
  }, [cytoscapeData, viewLevel, microservices, visibleEdgeTypes, selectedDomain]);

  // ─── Initialize Cytoscape (FIX 1: layout in requestAnimationFrame) ───

  const initCytoscape = useCallback(() => {
    if (!containerRef.current || !cytoscapeData) return;

    // Clean up previous instance
    if (cyRef.current) {
      try { cyRef.current.stop(); } catch { /* ignore */ }
      try { cyRef.current.destroy(); } catch { /* ignore */ }
      cyRef.current = null;
    }

    const elements = buildElements();
    if (elements.length === 0) return;

    // Validate edges: remove any edge whose source or target doesn't exist
    const nodeIds = new Set(
      elements.filter((el) => !el.data.source && !el.data.target).map((el) => el.data.id)
    );
    const validatedElements = elements.filter((el) => {
      if (!el.data.source && !el.data.target) return true;
      return nodeIds.has(el.data.source as string) && nodeIds.has(el.data.target as string);
    });

    const hasCompoundNodes = validatedElements.some((el) => el.data.parent);

    try {
      // FIX 1: Create Cytoscape WITHOUT layout, add elements, then run layout in requestAnimationFrame
      const cy = cytoscape({
        container: containerRef.current,
        elements: [],  // Empty at start
        style: buildCytoscapeStyles(),
        minZoom: 0.05,
        maxZoom: 8,
        wheelSensitivity: 1,
        // NO layout here
      });

      cyRef.current = cy;

      // Add elements after init
      cy.add(validatedElements);

      // FIX 1: Run layout AFTER elements are in the DOM
      requestAnimationFrame(() => {
        if (!cy || cy.destroyed()) return;
        try {
          const layoutConfig = getLayoutConfig(layout, hasCompoundNodes);
          cy.layout(layoutConfig).run();
        } catch (err) {
          console.warn("[ArchitectureViewer] Layout failed, falling back to grid:", err);
          try {
            cy.layout({ name: "grid", fit: true, padding: 40 } as any).run();
          } catch { /* ignore */ }
        }
      });

      // Semantic zoom
      cy.on("zoom", () => {
        const zoom = cy.zoom();
        cy.batch(() => {
          if (zoom < 0.3) {
            cy.nodes('[type="CLASS"], [type="EXTERNAL"]').style("label", "");
            cy.edges().style("opacity", 0.2);
          } else if (zoom < 0.7) {
            cy.nodes('[type="CLASS"]').style({ label: "data(label)", "font-size": "8px" });
            cy.nodes('[type="EXTERNAL"]').style({ label: "data(label)", "font-size": "7px" });
            cy.edges().style("opacity", 0.4);
          } else {
            cy.nodes('[type="CLASS"]').style({ label: "data(label)", "font-size": "10px" });
            cy.nodes('[type="EXTERNAL"]').style({ label: "data(label)", "font-size": "9px" });
            cy.edges().style("opacity", 0.65);
          }
        });
      });

      // FIX 2: Drill-down click handler
      cy.on("tap", "node", (evt: EventObject) => {
        const node = evt.target;
        const nodeType = node.data("type");

        if (nodeType === "microservice") {
          // Click on microservice → highlight its children
          const children = node.children();
          cy.elements().unselect();
          children.select();
          // Zoom to fit the microservice
          cy.fit(node, 40);
        } else if (nodeType === "domain") {
          // Click on domain → drill down to domain classes
          const domainId = node.data("id")?.replace("domain-", "") || "";
          setSelectedDomain(domainId);
        } else {
          setSelectedNode(node.data());
        }
      });

      cy.on("tap", (evt: EventObject) => {
        if (evt.target === cy) {
          setSelectedNode(null);
        }
      });

    } catch (err) {
      console.error("[ArchitectureViewer] Cytoscape init failed:", err);
    }
  }, [cytoscapeData, viewLevel, layout, microservices, visibleEdgeTypes, selectedDomain, buildElements]);

  // ─── Effect: init Cytoscape when tab/view changes ────────────────────

  useEffect(() => {
    if (activeTab === "interactive" && viewLevel !== "detail") {
      initCytoscape();
    }
    return () => {
      if (cyRef.current) {
        try { cyRef.current.stop(); } catch { /* ignore */ }
        try { cyRef.current.destroy(); } catch { /* ignore */ }
        cyRef.current = null;
      }
    };
  }, [initCytoscape, activeTab]);

  // ─── Controls ─────────────────────────────────────────────────────────

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.7);
  const handleFit = () => cyRef.current?.fit(undefined, 40);

  const handleLayoutChange = (newLayout: string) => {
    setLayout(newLayout);
    if (cyRef.current) {
      const hasCompound = cyRef.current.nodes().some((n) => (n as any).isParent());
      try {
        cyRef.current.layout(getLayoutConfig(newLayout, hasCompound)).run();
      } catch (err) {
        console.warn("[ArchitectureViewer] Layout change failed:", err);
        try {
          cyRef.current.layout({ name: "grid", fit: true, padding: 40 } as any).run();
        } catch { /* ignore */ }
      }
    }
  };

  const goBack = useCallback(() => {
    if (selectedDomain) {
      setSelectedDomain(null);
    } else if (viewLevel === "detail") {
      setViewLevel(microservices.length > 0 ? "microservices" : "domains");
    }
    setSelectedNode(null);
  }, [selectedDomain, viewLevel, microservices.length]);

  // ─── Help message based on view level ─────────────────────────────────

  const helpMessage = (() => {
    if (viewLevel === "microservices") {
      return "Cliquez sur un microservice pour zoomer sur ses classes";
    }
    if (viewLevel === "domains" && !selectedDomain) {
      return "Cliquez sur un domaine pour voir ses classes en détail";
    }
    if (viewLevel === "domains" && selectedDomain) {
      return `Classes du domaine ${selectedDomain.replace(/_/g, " ")} — Cliquez sur une classe pour les détails`;
    }
    if (viewLevel === "classes") {
      return "Vue à plat de toutes les classes — Cliquez pour voir les détails";
    }
    return "";
  })();

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header Controls — only shown for interactive sub-tab */}
      {activeTab === "interactive" && <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          {/* Back button for drill-down */}
          {(selectedDomain || viewLevel === "detail") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={goBack}>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Retour
                </Button>
              </TooltipTrigger>
              <TooltipContent>Revenir à la vue précédente</TooltipContent>
            </Tooltip>
          )}

          {microservices.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewLevel === "microservices" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setViewLevel("microservices"); setSelectedNode(null); setSelectedDomain(null); }}
                >
                  <Network className="w-4 h-4 mr-1" />
                  Microservices
                </Button>
              </TooltipTrigger>
              <TooltipContent>Vue groupée par microservice extrait</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewLevel === "domains" ? "default" : "outline"}
                size="sm"
                onClick={() => { setViewLevel("domains"); setSelectedNode(null); setSelectedDomain(null); }}
              >
                <Layers className="w-4 h-4 mr-1" />
                Domaines
              </Button>
            </TooltipTrigger>
            <TooltipContent>Vue groupée par domaine métier</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewLevel === "classes" ? "default" : "outline"}
                size="sm"
                onClick={() => { setViewLevel("classes"); setSelectedNode(null); setSelectedDomain(null); }}
              >
                <Box className="w-4 h-4 mr-1" />
                Classes
              </Button>
            </TooltipTrigger>
            <TooltipContent>Vue à plat de toutes les classes</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewLevel === "detail" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewLevel("detail")}
                disabled={!selectedNode}
              >
                <Eye className="w-4 h-4 mr-1" />
                Détail
              </Button>
            </TooltipTrigger>
            <TooltipContent>Propriétés détaillées du nœud sélectionné</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1.5">
          <Select value={layout} onValueChange={handleLayoutChange}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dagre">Dagre (hiérarchique)</SelectItem>
              <SelectItem value="cola">Cola (force)</SelectItem>
              <SelectItem value="cose">CoSE (organique)</SelectItem>
              <SelectItem value="circle">Circulaire</SelectItem>
              <SelectItem value="breadthfirst">Arbre</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleFit}>
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button
            variant={showLegend ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowLegend(!showLegend)}
          >
            <Filter className="w-4 h-4" />
          </Button>

          {/* Export menu */}
          <Select onValueChange={(v) => {
            if (v === "svg") exportSVG();
            else if (v === "png") exportPNG();
            else if (onExport) onExport(v);
          }}>
            <SelectTrigger className="w-[120px] h-8">
              <Download className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Export" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="svg">SVG</SelectItem>
              <SelectItem value="png">PNG (HD)</SelectItem>
              <SelectItem value="graphml">GraphML</SelectItem>
              <SelectItem value="json">Cytoscape JSON</SelectItem>
              <SelectItem value="d2">D2 Diagram</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>}

      {/* Help message */}
      {activeTab === "interactive" && helpMessage && viewLevel !== "detail" && (
        <div className="text-xs text-muted-foreground px-1">
          {helpMessage}
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="interactive">
            <Eye className="w-4 h-4 mr-1" />
            Interactif
          </TabsTrigger>
          <TabsTrigger value="dependency">Graphe Dépendances</TabsTrigger>
          <TabsTrigger value="microservices">Carte Microservices</TabsTrigger>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
        </TabsList>

        <TabsContent value="interactive" className="flex-1 flex flex-col gap-3 mt-2 min-h-0">
          {/* Graph row: canvas + optional side panel */}
          <div className="flex gap-3 flex-1 min-h-0">
          {/* Cytoscape Canvas */}
          <div className="flex-1 relative min-h-0">
            {viewLevel !== "detail" ? (
              <div
                ref={containerRef}
                className="w-full rounded-lg border border-border bg-[#0f0f23]"
                style={{ height: "calc(100vh - 16rem)", minHeight: "550px" }}
              />
            ) : (
              /* Detail View */
              <div
                className="w-full rounded-lg border border-border bg-background p-6 overflow-auto"
                style={{ height: "calc(100vh - 16rem)", minHeight: "550px" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-4"
                  onClick={goBack}
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Retour
                </Button>
                {selectedNode && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold">{selectedNode.label}</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Propriétés</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Type:</span>
                            <Badge variant="outline">{selectedNode.type}</Badge>
                          </div>
                          {selectedNode.role && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Rôle:</span>
                              <Badge>{selectedNode.role}</Badge>
                            </div>
                          )}
                          {selectedNode.domain && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Domaine:</span>
                              <Badge
                                variant="secondary"
                                style={{ backgroundColor: (DOMAIN_COLORS[selectedNode.domain] || "#BDC3C7") + "30" }}
                              >
                                {(selectedNode.domain as string).replace(/_/g, " ")}
                              </Badge>
                            </div>
                          )}
                          {selectedNode.technologyType && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Technologie:</span>
                              <span>{selectedNode.technologyType}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Métriques</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          {selectedNode.linesOfCode !== undefined && (
                            <div>
                              <span className="text-muted-foreground">Lignes de code:</span>{" "}
                              <span className="font-mono">{selectedNode.linesOfCode}</span>
                            </div>
                          )}
                          {selectedNode.complexity !== undefined && (
                            <div>
                              <span className="text-muted-foreground">Complexité cyclomatique:</span>{" "}
                              <span className="font-mono">{selectedNode.complexity}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Interactive Legend + Edge Filters */}
            {showLegend && viewLevel !== "detail" && (
              <div className="absolute top-3 right-3 bg-[#0f0f23]/90 backdrop-blur-sm border border-border rounded-lg p-3 max-w-[220px] z-10">
                {/* Domain colors */}
                <div className="text-xs font-semibold text-muted-foreground mb-2">Domaines</div>
                <div className="space-y-1 mb-3">
                  {Object.entries(DOMAIN_COLORS)
                    .filter(([key]) => key !== "UNKNOWN")
                    .slice(0, 8)
                    .map(([name, color]) => (
                      <div key={name} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-[10px] text-muted-foreground truncate">
                          {name.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                </div>

                {/* Role colors (shown when in class/domain detail view) */}
                {(viewLevel === "classes" || selectedDomain) && (
                  <>
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Rôles</div>
                    <div className="space-y-1 mb-3">
                      {Object.entries(ROLE_COLORS).slice(0, 6).map(([role, colors]) => (
                        <div key={role} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded shrink-0"
                            style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
                          />
                          <span className="text-[10px] text-muted-foreground truncate">
                            {role.replace(/_/g, " ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Edge type filters */}
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  Arêtes <span className="text-[10px] font-normal">(cliquer pour filtrer)</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(EDGE_STYLES).map(([type, style]) => (
                    <button
                      key={type}
                      className="flex items-center gap-2 w-full text-left hover:bg-white/5 rounded px-1 py-0.5 transition-colors"
                      onClick={() => toggleEdgeType(type)}
                    >
                      <div className="flex items-center gap-1.5">
                        {visibleEdgeTypes.has(type) ? (
                          <Eye className="w-3 h-3 text-muted-foreground" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-muted-foreground/40" />
                        )}
                        <div
                          className="w-4 h-0.5 shrink-0"
                          style={{
                            backgroundColor: style.color,
                            opacity: visibleEdgeTypes.has(type) ? 1 : 0.3,
                            borderTop: style.dash !== "solid" ? `2px ${style.dash === "3,3" ? "dotted" : "dashed"} ${style.color}` : "none",
                            height: style.dash !== "solid" ? 0 : 2,
                          }}
                        />
                      </div>
                      <span
                        className="text-[10px] truncate"
                        style={{
                          color: visibleEdgeTypes.has(type) ? "#ccc" : "#666",
                        }}
                      >
                        {style.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Node count badges */}
            {cytoscapeData && viewLevel !== "detail" && (
              <div className="absolute bottom-3 left-3 flex gap-2">
                <Badge variant="secondary" className="text-xs">
                  {cytoscapeData.nodes.length} nœuds
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {cytoscapeData.edges.length} arêtes
                </Badge>
                {microservices.length > 0 && (
                  <Badge variant="secondary" className="text-xs bg-emerald-900/50 text-emerald-300">
                    {microservices.length} microservices
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Side Panel — selected node details */}
          {selectedNode && viewLevel !== "detail" && (
            <Card className="w-72 shrink-0 overflow-auto" style={{ maxHeight: "calc(100vh - 16rem)" }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm truncate">{selectedNode.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div>
                  <span className="text-muted-foreground">Type:</span>{" "}
                  <Badge variant="outline" className="text-xs">{selectedNode.type}</Badge>
                </div>
                {selectedNode.role && (
                  <div>
                    <span className="text-muted-foreground">Rôle:</span>{" "}
                    <Badge className="text-xs">{selectedNode.role}</Badge>
                  </div>
                )}
                {selectedNode.domain && (
                  <div>
                    <span className="text-muted-foreground">Domaine:</span>{" "}
                    <Badge
                      variant="secondary"
                      className="text-xs"
                      style={{ backgroundColor: (DOMAIN_COLORS[selectedNode.domain] || "#BDC3C7") + "30" }}
                    >
                      {(selectedNode.domain as string).replace(/_/g, " ")}
                    </Badge>
                  </div>
                )}
                {selectedNode.technologyType && (
                  <div>
                    <span className="text-muted-foreground">Tech:</span> {selectedNode.technologyType}
                  </div>
                )}
                {selectedNode.linesOfCode !== undefined && (
                  <div>
                    <span className="text-muted-foreground">LOC:</span> {selectedNode.linesOfCode}
                  </div>
                )}
                {selectedNode.complexity !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Complexité:</span> {selectedNode.complexity}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => setViewLevel("detail")}
                >
                  Voir détail complet
                </Button>
              </CardContent>
            </Card>
          )}
          </div>{/* end graph row */}

          {/* Microservices Summary Cards — below the graph */}
          {microservices.length > 0 && viewLevel !== "detail" && (
            <div className="w-full">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {microservices.slice(0, 8).map((svc) => (
                  <Card key={svc.id} className="p-3 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => {
                      setViewLevel("microservices");
                      setSelectedDomain(null);
                      if (cyRef.current) {
                        const msNode = cyRef.current.$(`#ms-${svc.id}`);
                        if (msNode.length > 0) {
                          cyRef.current.fit(msNode, 40);
                          msNode.select();
                        }
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor:
                            DOMAIN_COLORS[svc.boundedContext.split("+")[0]] || DOMAIN_COLORS.UNKNOWN,
                        }}
                      />
                      <span className="text-sm font-medium truncate">{svc.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>{svc.classCount} classes | {svc.endpoints} endpoints</div>
                      <div>
                        Cohésion: {(svc.cohesion * 100).toFixed(0)}% | Couplage:{" "}
                        {(svc.coupling * 100).toFixed(0)}%
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="dependency" className="flex-1 mt-2">
          {svgDependency ? (
            <div
              className="w-full rounded-lg border border-border overflow-auto"
              style={{ height: "calc(100vh - 16rem)", minHeight: "550px" }}
              dangerouslySetInnerHTML={{ __html: svgDependency }}
            />
          ) : (
            <div
              className="flex items-center justify-center text-muted-foreground"
              style={{ height: "calc(100vh - 16rem)", minHeight: "550px" }}
            >
              Lancez une analyse pour générer le graphe de dépendances
            </div>
          )}
        </TabsContent>

        <TabsContent value="microservices" className="flex-1 mt-2">
          {svgMicroservices ? (
            <div
              className="w-full rounded-lg border border-border overflow-auto"
              style={{ height: "calc(100vh - 16rem)", minHeight: "550px" }}
              dangerouslySetInnerHTML={{ __html: svgMicroservices }}
            />
          ) : (
            <div
              className="flex items-center justify-center text-muted-foreground"
              style={{ height: "calc(100vh - 16rem)", minHeight: "550px" }}
            >
              Lancez une analyse pour générer la carte des microservices
            </div>
          )}
        </TabsContent>

        <TabsContent value="overview" className="flex-1 mt-2">
          {svgOverview ? (
            <div
              className="w-full rounded-lg border border-border overflow-auto"
              style={{ height: "calc(100vh - 16rem)", minHeight: "550px" }}
              dangerouslySetInnerHTML={{ __html: svgOverview }}
            />
          ) : (
            <div
              className="flex items-center justify-center text-muted-foreground"
              style={{ height: "calc(100vh - 16rem)", minHeight: "550px" }}
            >
              Lancez une analyse pour générer la vue d'ensemble
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ArchitectureViewer;
