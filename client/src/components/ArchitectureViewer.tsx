/**
 * ArchitectureViewer — Composant Cytoscape.js interactif 3 niveaux.
 * Niveau 1 : Vue domaines (clusters)
 * Niveau 2 : Vue classes (nœuds individuels)
 * Niveau 3 : Vue détail (propriétés d'un nœud)
 *
 * @author Hamza NORDINE
 */

import { useEffect, useRef, useState, useCallback } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Download,
  Eye,
  Network,
  Box,
  ArrowLeft,
} from "lucide-react";

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

const EDGE_COLORS: Record<string, string> = {
  CALLS: "#2C3E50",
  DEPENDS_ON: "#3498DB",
  JNDI_LOOKUP: "#E74C3C",
  DB_ACCESS: "#F39C12",
  EMITS_EVENT: "#27AE60",
  SOAP_CALLS: "#9B59B6",
  SHARES_DTO: "#95A5A6",
  TRANSACTION_WITH: "#1ABC9C",
};

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
  const [viewLevel, setViewLevel] = useState<1 | 2 | 3>(1);
  const [selectedNode, setSelectedNode] = useState<CytoscapeNode["data"] | null>(null);
  const [layout, setLayout] = useState<string>("cose");
  const [activeTab, setActiveTab] = useState<string>("interactive");

  // ─── Initialize Cytoscape ─────────────────────────────────────────────

  const initCytoscape = useCallback(() => {
    if (!containerRef.current || !cytoscapeData) return;

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const elements: cytoscape.ElementDefinition[] = [];

    if (viewLevel === 1) {
      // Niveau 1: Vue domaines (compound nodes)
      const domains = new Map<string, string[]>();
      for (const node of cytoscapeData.nodes) {
        const domain = node.data.domain || "UNKNOWN";
        if (!domains.has(domain)) domains.set(domain, []);
        domains.get(domain)!.push(node.data.id);
      }

      // Create domain compound nodes
      for (const [domain, nodeIds] of domains) {
        elements.push({
          data: {
            id: `domain-${domain}`,
            label: domain.replace(/_/g, " "),
            type: "domain",
            classCount: nodeIds.length,
          },
        });

        // Add class nodes as children
        for (const nodeId of nodeIds) {
          const originalNode = cytoscapeData.nodes.find((n) => n.data.id === nodeId);
          if (originalNode) {
            elements.push({
              data: {
                ...originalNode.data,
                parent: `domain-${domain}`,
              },
            });
          }
        }
      }

      // Add edges
      for (const edge of cytoscapeData.edges) {
        elements.push({ data: { ...edge.data } });
      }
    } else if (viewLevel === 2) {
      // Niveau 2: Vue classes (flat)
      for (const node of cytoscapeData.nodes) {
        elements.push({ data: { ...node.data } });
      }
      for (const edge of cytoscapeData.edges) {
        elements.push({ data: { ...edge.data } });
      }
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // Domain compound nodes
        {
          selector: 'node[type="domain"]',
          style: {
            "background-color": "#1a1a2e",
            "background-opacity": 0.3,
            "border-width": 2,
            "border-color": "#3498DB",
            label: "data(label)",
            "text-valign": "top",
            "text-halign": "center",
            color: "#e0e0e0",
            "font-size": "14px",
            "font-weight": "bold",
            "padding": "20px",
            shape: "round-rectangle",
          },
        },
        // Class nodes
        {
          selector: 'node[type="CLASS"]',
          style: {
            "background-color": (ele: cytoscape.NodeSingular) => {
              const domain = ele.data("domain") || "UNKNOWN";
              return DOMAIN_COLORS[domain] || DOMAIN_COLORS.UNKNOWN;
            },
            label: "data(label)",
            "text-valign": "bottom",
            "text-halign": "center",
            color: "#ccc",
            "font-size": "8px",
            width: (ele: cytoscape.NodeSingular) => {
              const loc = ele.data("linesOfCode") || 50;
              return Math.max(15, Math.min(50, loc / 10));
            },
            height: (ele: cytoscape.NodeSingular) => {
              const loc = ele.data("linesOfCode") || 50;
              return Math.max(15, Math.min(50, loc / 10));
            },
            "border-width": 1,
            "border-color": "#fff",
          },
        },
        // External nodes
        {
          selector: 'node[type="EXTERNAL"]',
          style: {
            "background-color": "#F39C12",
            shape: "rectangle",
            label: "data(label)",
            "text-valign": "bottom",
            color: "#aaa",
            "font-size": "7px",
            width: 20,
            height: 20,
            "border-width": 1,
            "border-color": "#fff",
          },
        },
        // Edges
        {
          selector: "edge",
          style: {
            width: (ele: cytoscape.EdgeSingular) => {
              const w = ele.data("weight") || 1;
              return Math.max(1, Math.min(4, w));
            },
            "line-color": (ele: cytoscape.EdgeSingular) => {
              const type = ele.data("type") || "DEPENDS_ON";
              return EDGE_COLORS[type] || "#666";
            },
            "target-arrow-color": (ele: cytoscape.EdgeSingular) => {
              const type = ele.data("type") || "DEPENDS_ON";
              return EDGE_COLORS[type] || "#666";
            },
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.5,
            "line-style": (ele: cytoscape.EdgeSingular) => {
              const type = ele.data("type");
              if (type === "JNDI_LOOKUP") return "dashed";
              if (type === "EMITS_EVENT") return "dotted";
              return "solid";
            },
          },
        },
        // Highlighted
        {
          selector: ":selected",
          style: {
            "border-width": 3,
            "border-color": "#FFD700",
            "z-index": 999,
          },
        },
      ],
      layout: {
        name: layout === "cose" ? "cose" : layout === "circle" ? "circle" : layout === "grid" ? "grid" : "breadthfirst",
        animate: true,
        animationDuration: 500,
        ...(layout === "cose"
          ? {
              nodeRepulsion: () => 8000,
              idealEdgeLength: () => 100,
              edgeElasticity: () => 100,
              gravity: 0.25,
            }
          : {}),
      } as cytoscape.LayoutOptions,
      minZoom: 0.1,
      maxZoom: 5,
      wheelSensitivity: 0.3,
    });

    // Click handler
    cy.on("tap", "node", (evt: EventObject) => {
      const node = evt.target;
      setSelectedNode(node.data());
    });

    cy.on("tap", (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null);
      }
    });

    cyRef.current = cy;
  }, [cytoscapeData, viewLevel, layout]);

  useEffect(() => {
    if (activeTab === "interactive") {
      initCytoscape();
    }
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [initCytoscape, activeTab]);

  // ─── Controls ─────────────────────────────────────────────────────────

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.7);
  const handleFit = () => cyRef.current?.fit(undefined, 30);

  const handleLayoutChange = (newLayout: string) => {
    setLayout(newLayout);
    if (cyRef.current) {
      cyRef.current
        .layout({
          name: newLayout,
          animate: true,
          animationDuration: 500,
          ...(newLayout === "cose"
            ? { nodeRepulsion: () => 8000, idealEdgeLength: () => 100, gravity: 0.25 }
            : {}),
        } as cytoscape.LayoutOptions)
        .run();
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant={viewLevel === 1 ? "default" : "outline"}
            size="sm"
            onClick={() => { setViewLevel(1); setSelectedNode(null); }}
          >
            <Layers className="w-4 h-4 mr-1" />
            Domaines
          </Button>
          <Button
            variant={viewLevel === 2 ? "default" : "outline"}
            size="sm"
            onClick={() => { setViewLevel(2); setSelectedNode(null); }}
          >
            <Network className="w-4 h-4 mr-1" />
            Classes
          </Button>
          <Button
            variant={viewLevel === 3 ? "default" : "outline"}
            size="sm"
            onClick={() => setViewLevel(3)}
            disabled={!selectedNode}
          >
            <Box className="w-4 h-4 mr-1" />
            Détail
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={layout} onValueChange={handleLayoutChange}>
            <SelectTrigger className="w-[130px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cose">Force-directed</SelectItem>
              <SelectItem value="circle">Circulaire</SelectItem>
              <SelectItem value="grid">Grille</SelectItem>
              <SelectItem value="breadthfirst">Hiérarchique</SelectItem>
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

          {onExport && (
            <Select onValueChange={(v) => onExport(v)}>
              <SelectTrigger className="w-[120px] h-8">
                <Download className="w-4 h-4 mr-1" />
                <SelectValue placeholder="Export" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="svg">SVG</SelectItem>
                <SelectItem value="graphml">GraphML</SelectItem>
                <SelectItem value="json">Cytoscape JSON</SelectItem>
                <SelectItem value="d2">D2 Diagram</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList>
          <TabsTrigger value="interactive">
            <Eye className="w-4 h-4 mr-1" />
            Interactif
          </TabsTrigger>
          <TabsTrigger value="dependency">Graphe Dépendances</TabsTrigger>
          <TabsTrigger value="microservices">Carte Microservices</TabsTrigger>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
        </TabsList>

        <TabsContent value="interactive" className="flex-1 flex gap-4 mt-2">
          {/* Cytoscape Canvas */}
          <div className="flex-1 relative">
            {viewLevel < 3 ? (
              <div
                ref={containerRef}
                className="w-full h-full min-h-[500px] rounded-lg border border-border bg-[#0f0f23]"
              />
            ) : (
              /* Niveau 3: Detail View */
              <div className="w-full h-full min-h-[500px] rounded-lg border border-border bg-background p-6 overflow-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-4"
                  onClick={() => setViewLevel(2)}
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
                        <CardContent className="text-sm space-y-1">
                          <div>Type: <Badge variant="outline">{selectedNode.type}</Badge></div>
                          {selectedNode.role && <div>Rôle: <Badge>{selectedNode.role}</Badge></div>}
                          {selectedNode.domain && <div>Domaine: <Badge variant="secondary">{selectedNode.domain}</Badge></div>}
                          {selectedNode.technologyType && <div>Technologie: {selectedNode.technologyType}</div>}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Métriques</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-1">
                          {selectedNode.linesOfCode !== undefined && <div>Lignes de code: {selectedNode.linesOfCode}</div>}
                          {selectedNode.complexity !== undefined && <div>Complexité: {selectedNode.complexity}</div>}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Node count badge */}
            {cytoscapeData && viewLevel < 3 && (
              <div className="absolute bottom-3 left-3 flex gap-2">
                <Badge variant="secondary" className="text-xs">
                  {cytoscapeData.nodes.length} nœuds
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {cytoscapeData.edges.length} arêtes
                </Badge>
              </div>
            )}
          </div>

          {/* Side Panel */}
          {selectedNode && viewLevel < 3 && (
            <Card className="w-72 shrink-0 overflow-auto max-h-[600px]">
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
                      style={{ backgroundColor: DOMAIN_COLORS[selectedNode.domain] + "30" }}
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
                  onClick={() => setViewLevel(3)}
                >
                  Voir détail complet
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dependency" className="flex-1 mt-2">
          {svgDependency ? (
            <div
              className="w-full h-full min-h-[500px] rounded-lg border border-border overflow-auto"
              dangerouslySetInnerHTML={{ __html: svgDependency }}
            />
          ) : (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
              Lancez une analyse pour générer le graphe de dépendances
            </div>
          )}
        </TabsContent>

        <TabsContent value="microservices" className="flex-1 mt-2">
          {svgMicroservices ? (
            <div
              className="w-full h-full min-h-[500px] rounded-lg border border-border overflow-auto"
              dangerouslySetInnerHTML={{ __html: svgMicroservices }}
            />
          ) : (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
              Lancez une analyse pour générer la carte des microservices
            </div>
          )}
        </TabsContent>

        <TabsContent value="overview" className="flex-1 mt-2">
          {svgOverview ? (
            <div
              className="w-full h-full min-h-[500px] rounded-lg border border-border overflow-auto"
              dangerouslySetInnerHTML={{ __html: svgOverview }}
            />
          ) : (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
              Lancez une analyse pour générer la vue d'ensemble
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Microservices Summary */}
      {microservices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {microservices.slice(0, 8).map((svc) => (
            <Card key={svc.id} className="p-3">
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
      )}
    </div>
  );
}

export default ArchitectureViewer;
