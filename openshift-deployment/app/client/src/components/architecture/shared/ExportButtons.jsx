/**
 * ExportButtons — Boutons d'export SVG/PNG réutilisables pour les diagrammes architecture.
 * Compatible JSX (pas de TypeScript).
 *
 * Usage:
 *   <ExportButtons svgRef={svgRef} filename="mon-diagramme" />
 *
 * @author Compleo
 */

import { C } from "./primitives";

/**
 * Prépare le contenu SVG pour l'export.
 */
function prepareSvgForExport(svgElement) {
  const clone = svgElement.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // Add background
  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("width", "100%");
  bgRect.setAttribute("height", "100%");
  bgRect.setAttribute("fill", C.dark || "#0f0f1a");
  clone.insertBefore(bgRect, clone.firstChild);

  // Inline font-family
  const textElements = clone.querySelectorAll("text");
  textElements.forEach((el) => {
    if (!el.getAttribute("font-family")) {
      el.setAttribute("font-family", "'JetBrains Mono', 'Fira Code', monospace");
    }
  });

  return new XMLSerializer().serializeToString(clone);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleExport(svgElement, filename, format) {
  if (!svgElement) return;
  const svgContent = prepareSvgForExport(svgElement);

  if (format === "svg") {
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, `${filename}.svg`);
    return;
  }

  // PNG
  const viewBox = svgElement.getAttribute("viewBox");
  let width = svgElement.width?.baseVal?.value || 960;
  let height = svgElement.height?.baseVal?.value || 680;

  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4) {
      width = parts[2];
      height = parts[3];
    }
  }

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    ctx.fillStyle = C.dark || "#0f0f1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    canvas.toBlob(
      (blob) => {
        if (blob) downloadBlob(blob, `${filename}.png`);
      },
      "image/png",
      1.0,
    );
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
  };

  img.src = url;
}

export default function ExportButtons({ svgRef, filename = "diagram" }) {
  const btnStyle = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
    border: `1px solid ${C.border}`,
    color: C.textMuted,
    background: "transparent",
    transition: "all 0.15s",
  };

  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button
        style={btnStyle}
        onClick={() => handleExport(svgRef?.current, filename, "svg")}
        title="Télécharger en SVG"
        onMouseEnter={(e) => {
          e.currentTarget.style.color = C.cyan;
          e.currentTarget.style.borderColor = C.cyan;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = C.textMuted;
          e.currentTarget.style.borderColor = C.border;
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        SVG
      </button>
      <button
        style={btnStyle}
        onClick={() => handleExport(svgRef?.current, filename, "png")}
        title="Télécharger en PNG (HD)"
        onMouseEnter={(e) => {
          e.currentTarget.style.color = C.cyan;
          e.currentTarget.style.borderColor = C.cyan;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = C.textMuted;
          e.currentTarget.style.borderColor = C.border;
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        PNG
      </button>
    </div>
  );
}
