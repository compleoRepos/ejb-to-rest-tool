/**
 * VisualizationEngine — Génération de visualisations multi-formats.
 * Exports : SVG (inline), GraphML, JSON (Cytoscape), D2 diagram.
 *
 * @author Hamza NORDINE
 */

import type {
  DependencyGraph,
  ClassNode,
  ExternalNode,
  CytoscapeGraph,
  GraphMLExport,
} from "../graph/model/GraphModel";
import type { ExtractionResult, MicroserviceCandidate } from "../graph/MicroserviceExtractor";
import type { ArchitectureReport } from "../graph/ArchitectureDiscovery";
import { GraphBuilder } from "../graph/GraphBuilder";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VisualizationOutput {
  format: "SVG" | "GRAPHML" | "JSON" | "D2";
  content: string;
  filename: string;
  description: string;
}

// ─── Color Palettes ─────────────────────────────────────────────────────────

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

const ROLE_SHAPES: Record<string, string> = {
  ORCHESTRATOR: "hexagon",
  DOMAIN_SERVICE: "rectangle",
  REPOSITORY: "cylinder",
  VALUE_OBJECT: "ellipse",
  ENUM_TYPE: "diamond",
  EXCEPTION_TYPE: "triangle",
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

// ─── VisualizationEngine ────────────────────────────────────────────────────

export class VisualizationEngine {
  private graphBuilder = new GraphBuilder();

  /**
   * Génère toutes les visualisations pour un projet.
   */
  generateAll(
    graph: DependencyGraph,
    extraction: ExtractionResult,
    archReport: ArchitectureReport
  ): VisualizationOutput[] {
    const outputs: VisualizationOutput[] = [];

    // 1. Dependency Graph SVG
    outputs.push(this.generateDependencyGraphSVG(graph));

    // 2. Microservices Map SVG
    outputs.push(this.generateMicroservicesMapSVG(extraction));

    // 3. GraphML export
    outputs.push(this.generateGraphML(graph));

    // 4. Cytoscape JSON
    outputs.push(this.generateCytoscapeJSON(graph));

    // 5. D2 diagram
    outputs.push(this.generateD2Diagram(graph, extraction));

    // 6. Architecture Overview SVG
    outputs.push(this.generateArchitectureOverviewSVG(archReport, extraction));

    return outputs;
  }

  // ─── 1. Dependency Graph SVG ────────────────────────────────────────────

  generateDependencyGraphSVG(graph: DependencyGraph): VisualizationOutput {
    const classNodes = graph.nodes.filter((n) => n.type === "CLASS") as ClassNode[];
    const externalNodes = graph.nodes.filter((n) => n.type === "EXTERNAL") as ExternalNode[];

    // Layout: simple force-directed approximation
    const positions = this.layoutNodes(graph);

    const width = 1200;
    const height = 800;
    const padding = 60;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family: 'Segoe UI', sans-serif; background: #1a1a2e;">`;

    // Title
    svg += `<text x="${width / 2}" y="30" text-anchor="middle" fill="#e0e0e0" font-size="16" font-weight="bold">Graphe de Dépendances — ${this.escapeXml(graph.projectName)}</text>`;

    // Legend
    svg += this.generateLegend(width - 200, 50);

    // Edges
    for (const edge of graph.edges) {
      const src = positions.get(edge.source);
      const tgt = positions.get(edge.target);
      if (!src || !tgt) continue;

      const color = EDGE_COLORS[edge.type] || "#666";
      const dashArray = edge.type === "JNDI_LOOKUP" ? '5,3' : edge.type === "EMITS_EVENT" ? '3,3' : 'none';
      svg += `<line x1="${src.x}" y1="${src.y}" x2="${tgt.x}" y2="${tgt.y}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${dashArray}" opacity="0.6"/>`;
    }

    // Class nodes
    for (const node of classNodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;

      const color = DOMAIN_COLORS[node.domain] || DOMAIN_COLORS.UNKNOWN;
      const radius = Math.max(8, Math.min(20, node.linesOfCode / 20));

      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${radius}" fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.9"/>`;
      svg += `<text x="${pos.x}" y="${pos.y + radius + 12}" text-anchor="middle" fill="#ccc" font-size="8">${this.escapeXml(node.className.substring(0, 20))}</text>`;
    }

    // External nodes
    for (const node of externalNodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;

      const color = node.externalType === "DATABASE" ? "#F39C12" : node.externalType === "QUEUE" ? "#27AE60" : "#9B59B6";
      svg += `<rect x="${pos.x - 10}" y="${pos.y - 10}" width="20" height="20" fill="${color}" stroke="#fff" stroke-width="1" rx="3"/>`;
      svg += `<text x="${pos.x}" y="${pos.y + 22}" text-anchor="middle" fill="#aaa" font-size="7">${this.escapeXml(node.systemName.substring(0, 15))}</text>`;
    }

    // Stats
    svg += `<text x="20" y="${height - 20}" fill="#888" font-size="10">${graph.graphMetrics.totalNodes} nœuds | ${graph.graphMetrics.totalEdges} arêtes | ${graph.graphMetrics.connectedComponents} composantes</text>`;

    svg += "</svg>";

    return {
      format: "SVG",
      content: svg,
      filename: "dependency-graph.svg",
      description: "Graphe de dépendances complet avec coloration par domaine métier",
    };
  }

  // ─── 2. Microservices Map SVG ───────────────────────────────────────────

  generateMicroservicesMapSVG(extraction: ExtractionResult): VisualizationOutput {
    const width = 1200;
    const height = 800;
    const services = extraction.microservices;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family: 'Segoe UI', sans-serif; background: #0f0f23;">`;

    svg += `<text x="${width / 2}" y="30" text-anchor="middle" fill="#e0e0e0" font-size="16" font-weight="bold">Carte des Microservices — ${this.escapeXml(extraction.projectName)}</text>`;

    // Layout services in a grid
    const cols = Math.ceil(Math.sqrt(services.length));
    const cellW = (width - 100) / cols;
    const cellH = (height - 100) / Math.ceil(services.length / cols);

    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 50 + col * cellW + cellW / 2;
      const y = 70 + row * cellH + cellH / 2;
      const boxW = cellW * 0.8;
      const boxH = cellH * 0.7;

      const domainKey = svc.boundedContext.split("+")[0];
      const color = DOMAIN_COLORS[domainKey] || DOMAIN_COLORS.UNKNOWN;

      // Service box
      svg += `<rect x="${x - boxW / 2}" y="${y - boxH / 2}" width="${boxW}" height="${boxH}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2" rx="8"/>`;

      // Service name
      svg += `<text x="${x}" y="${y - boxH / 4}" text-anchor="middle" fill="${color}" font-size="11" font-weight="bold">${this.escapeXml(svc.name)}</text>`;

      // Class count
      svg += `<text x="${x}" y="${y}" text-anchor="middle" fill="#aaa" font-size="9">${svc.metrics.classCount} classes | ${svc.endpoints.length} endpoints</text>`;

      // Port
      svg += `<text x="${x}" y="${y + 15}" text-anchor="middle" fill="#666" font-size="8">:${svc.springBootConfig.port}</text>`;

      // Databases
      if (svc.databases.length > 0) {
        svg += `<text x="${x}" y="${y + boxH / 4}" text-anchor="middle" fill="#F39C12" font-size="8">DB: ${svc.databases.join(", ").substring(0, 30)}</text>`;
      }
    }

    // Draw dependencies between services
    for (const svc of services) {
      const srcIdx = services.indexOf(svc);
      const srcCol = srcIdx % cols;
      const srcRow = Math.floor(srcIdx / cols);
      const srcX = 50 + srcCol * cellW + cellW / 2;
      const srcY = 70 + srcRow * cellH + cellH / 2;

      for (const dep of svc.dependencies) {
        const tgtIdx = services.findIndex((s) => s.id === dep.targetServiceId);
        if (tgtIdx < 0) continue;
        const tgtCol = tgtIdx % cols;
        const tgtRow = Math.floor(tgtIdx / cols);
        const tgtX = 50 + tgtCol * cellW + cellW / 2;
        const tgtY = 70 + tgtRow * cellH + cellH / 2;

        const color = dep.type === "ASYNC" ? "#27AE60" : "#3498DB";
        const dash = dep.type === "ASYNC" ? "4,3" : "none";
        svg += `<line x1="${srcX}" y1="${srcY}" x2="${tgtX}" y2="${tgtY}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${dash}" opacity="0.5" marker-end="url(#arrow)"/>`;
      }
    }

    // Arrow marker
    svg += `<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#3498DB"/></marker></defs>`;

    // Summary
    svg += `<text x="20" y="${height - 20}" fill="#888" font-size="10">${services.length} microservices | ${extraction.summary.totalEndpoints} endpoints | ${extraction.summary.totalDependencies} dépendances</text>`;

    svg += "</svg>";

    return {
      format: "SVG",
      content: svg,
      filename: "microservices-map.svg",
      description: "Carte des microservices extraits avec dépendances inter-services",
    };
  }

  // ─── 3. GraphML Export ──────────────────────────────────────────────────

  generateGraphML(graph: DependencyGraph): VisualizationOutput {
    const result = this.graphBuilder.toGraphML(graph);
    return {
      format: "GRAPHML",
      content: result.xml,
      filename: "architecture.graphml",
      description: `Export GraphML — ${result.nodeCount} nœuds, ${result.edgeCount} arêtes (compatible yEd, Gephi)`,
    };
  }

  // ─── 4. Cytoscape JSON ─────────────────────────────────────────────────

  generateCytoscapeJSON(graph: DependencyGraph): VisualizationOutput {
    const cyto = this.graphBuilder.toCytoscape(graph);
    return {
      format: "JSON",
      content: JSON.stringify(cyto, null, 2),
      filename: "cytoscape-graph.json",
      description: "Format Cytoscape.js pour visualisation interactive dans le navigateur",
    };
  }

  // ─── 5. D2 Diagram ─────────────────────────────────────────────────────

  generateD2Diagram(graph: DependencyGraph, extraction: ExtractionResult): VisualizationOutput {
    const lines: string[] = [];
    lines.push("# Architecture Microservices — Compleo v5.0");
    lines.push("");

    // Group classes by microservice
    for (const svc of extraction.microservices) {
      const safeName = svc.name.replace(/-/g, "_");
      lines.push(`${safeName}: ${svc.name} {`);
      lines.push(`  style.fill: "${DOMAIN_COLORS[svc.boundedContext.split("+")[0]] || "#BDC3C7"}20"`);
      lines.push(`  style.stroke: "${DOMAIN_COLORS[svc.boundedContext.split("+")[0]] || "#BDC3C7"}"`);

      for (const detail of svc.classDetails.slice(0, 10)) {
        const safeClass = detail.className.replace(/[^a-zA-Z0-9]/g, "_");
        lines.push(`  ${safeClass}: ${detail.className} {`);
        lines.push(`    shape: ${ROLE_SHAPES[detail.role] || "rectangle"}`);
        lines.push("  }");
      }
      lines.push("}");
      lines.push("");
    }

    // Dependencies
    for (const svc of extraction.microservices) {
      const srcName = svc.name.replace(/-/g, "_");
      for (const dep of svc.dependencies) {
        const tgtName = dep.targetServiceName.replace(/-/g, "_");
        const style = dep.type === "ASYNC" ? "stroke-dash: 5" : "";
        lines.push(`${srcName} -> ${tgtName}: ${dep.protocol} {`);
        if (style) lines.push(`  style.${style}`);
        lines.push("}");
      }
    }

    return {
      format: "D2",
      content: lines.join("\n"),
      filename: "architecture.d2",
      description: "Diagramme D2 de l'architecture microservices (compatible d2lang.com)",
    };
  }

  // ─── 6. Architecture Overview SVG ───────────────────────────────────────

  generateArchitectureOverviewSVG(
    archReport: ArchitectureReport,
    extraction: ExtractionResult
  ): VisualizationOutput {
    const width = 1200;
    const height = 600;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family: 'Segoe UI', sans-serif; background: #0f0f23;">`;

    svg += `<text x="${width / 2}" y="30" text-anchor="middle" fill="#e0e0e0" font-size="16" font-weight="bold">Vue d'ensemble Architecture — ${this.escapeXml(archReport.projectName)}</text>`;

    // Entry Points (left)
    svg += `<text x="80" y="60" text-anchor="middle" fill="#3498DB" font-size="12" font-weight="bold">Entry Points</text>`;
    const entryTypes = new Map<string, number>();
    for (const ep of archReport.entryPoints) {
      entryTypes.set(ep.type, (entryTypes.get(ep.type) || 0) + 1);
    }
    let ey = 80;
    for (const [type, count] of entryTypes) {
      svg += `<rect x="20" y="${ey}" width="120" height="25" fill="#3498DB" fill-opacity="0.2" stroke="#3498DB" rx="4"/>`;
      svg += `<text x="80" y="${ey + 16}" text-anchor="middle" fill="#3498DB" font-size="9">${type} (${count})</text>`;
      ey += 30;
    }

    // Modules (center)
    svg += `<text x="${width / 2}" y="60" text-anchor="middle" fill="#E0E0E0" font-size="12" font-weight="bold">Modules Fonctionnels</text>`;
    const modStartX = 200;
    const modWidth = (width - 400) / Math.min(extraction.microservices.length, 4);
    for (let i = 0; i < Math.min(extraction.microservices.length, 8); i++) {
      const svc = extraction.microservices[i];
      const col = i % 4;
      const row = Math.floor(i / 4);
      const mx = modStartX + col * modWidth + modWidth / 2;
      const my = 90 + row * 120;
      const domainKey = svc.boundedContext.split("+")[0];
      const color = DOMAIN_COLORS[domainKey] || DOMAIN_COLORS.UNKNOWN;

      svg += `<rect x="${mx - modWidth * 0.4}" y="${my}" width="${modWidth * 0.8}" height="90" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="1.5" rx="6"/>`;
      svg += `<text x="${mx}" y="${my + 20}" text-anchor="middle" fill="${color}" font-size="10" font-weight="bold">${this.escapeXml(svc.name)}</text>`;
      svg += `<text x="${mx}" y="${my + 40}" text-anchor="middle" fill="#aaa" font-size="8">${svc.metrics.classCount} classes</text>`;
      svg += `<text x="${mx}" y="${my + 55}" text-anchor="middle" fill="#aaa" font-size="8">${svc.endpoints.length} endpoints</text>`;
      svg += `<text x="${mx}" y="${my + 70}" text-anchor="middle" fill="#888" font-size="7">Cohésion: ${(svc.metrics.cohesion * 100).toFixed(0)}%</text>`;
    }

    // Exit Points (right)
    svg += `<text x="${width - 80}" y="60" text-anchor="middle" fill="#E74C3C" font-size="12" font-weight="bold">Exit Points</text>`;
    const exitTypes = new Map<string, number>();
    for (const ep of archReport.exitPoints) {
      exitTypes.set(ep.type, (exitTypes.get(ep.type) || 0) + 1);
    }
    let exy = 80;
    for (const [type, count] of exitTypes) {
      svg += `<rect x="${width - 140}" y="${exy}" width="120" height="25" fill="#E74C3C" fill-opacity="0.2" stroke="#E74C3C" rx="4"/>`;
      svg += `<text x="${width - 80}" y="${exy + 16}" text-anchor="middle" fill="#E74C3C" font-size="9">${type} (${count})</text>`;
      exy += 30;
    }

    // Summary bar
    const summaryY = height - 50;
    svg += `<rect x="20" y="${summaryY}" width="${width - 40}" height="35" fill="#1a1a3e" rx="6"/>`;
    svg += `<text x="${width / 2}" y="${summaryY + 22}" text-anchor="middle" fill="#aaa" font-size="10">`;
    svg += `${archReport.summary.totalEntryPoints} entrées | ${archReport.summary.totalModules} modules | ${archReport.summary.totalExitPoints} sorties | `;
    svg += `${archReport.summary.totalCriticalFlows} flux critiques | ${archReport.summary.highRiskFlows} risques élevés`;
    svg += `</text>`;

    svg += "</svg>";

    return {
      format: "SVG",
      content: svg,
      filename: "architecture-overview.svg",
      description: "Vue d'ensemble de l'architecture : entry points → modules → exit points",
    };
  }

  // ─── Layout Helper ──────────────────────────────────────────────────────

  private layoutNodes(graph: DependencyGraph): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    const nodes = graph.nodes;
    const width = 1200;
    const height = 800;
    const padding = 80;

    // Group by domain for CLASS nodes
    const domainGroups = new Map<string, string[]>();
    for (const node of nodes) {
      if (node.type === "CLASS") {
        const domain = (node as ClassNode).domain;
        if (!domainGroups.has(domain)) domainGroups.set(domain, []);
        domainGroups.get(domain)!.push(node.id);
      }
    }

    // Layout domains in a circle
    const domains = [...domainGroups.keys()];
    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = Math.min(width, height) / 2 - padding;

    for (let d = 0; d < domains.length; d++) {
      const angle = (2 * Math.PI * d) / Math.max(domains.length, 1);
      const domainCenterX = centerX + outerRadius * 0.6 * Math.cos(angle);
      const domainCenterY = centerY + outerRadius * 0.6 * Math.sin(angle);

      const classIds = domainGroups.get(domains[d])!;
      const innerRadius = Math.min(80, 20 * classIds.length);

      for (let c = 0; c < classIds.length; c++) {
        const innerAngle = (2 * Math.PI * c) / Math.max(classIds.length, 1);
        positions.set(classIds[c], {
          x: domainCenterX + innerRadius * Math.cos(innerAngle),
          y: domainCenterY + innerRadius * Math.sin(innerAngle),
        });
      }
    }

    // External nodes at the periphery
    const externalNodes = nodes.filter((n) => n.type === "EXTERNAL");
    for (let e = 0; e < externalNodes.length; e++) {
      const angle = (2 * Math.PI * e) / Math.max(externalNodes.length, 1);
      positions.set(externalNodes[e].id, {
        x: centerX + outerRadius * 0.95 * Math.cos(angle),
        y: centerY + outerRadius * 0.95 * Math.sin(angle),
      });
    }

    return positions;
  }

  // ─── Legend Helper ──────────────────────────────────────────────────────

  private generateLegend(x: number, y: number): string {
    let svg = "";
    const domains = Object.entries(DOMAIN_COLORS).slice(0, 6);
    for (let i = 0; i < domains.length; i++) {
      const [name, color] = domains[i];
      svg += `<circle cx="${x + 8}" cy="${y + i * 15}" r="4" fill="${color}"/>`;
      svg += `<text x="${x + 18}" y="${y + i * 15 + 4}" fill="#aaa" font-size="7">${name.replace(/_/g, " ")}</text>`;
    }
    return svg;
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
