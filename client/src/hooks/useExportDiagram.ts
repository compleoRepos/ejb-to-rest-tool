/**
 * useExportDiagram — Hook réutilisable pour exporter un SVG DOM en SVG ou PNG.
 *
 * Usage:
 *   const svgRef = useRef<SVGSVGElement>(null);
 *   const { exportAsSVG, exportAsPNG } = useExportDiagram(svgRef, "mon-diagramme");
 *
 * @author Compleo
 */

import { useCallback, type RefObject } from "react";

/**
 * Prépare le contenu SVG pour l'export en ajoutant les styles inline nécessaires.
 */
function prepareSvgForExport(svgElement: SVGSVGElement): string {
  // Clone the SVG to avoid modifying the original
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  // Ensure xmlns is set
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // Add a white/dark background rect if none exists
  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("width", "100%");
  bgRect.setAttribute("height", "100%");
  bgRect.setAttribute("fill", "#0f0f1a");
  clone.insertBefore(bgRect, clone.firstChild);

  // Inline computed styles for text elements
  const textElements = clone.querySelectorAll("text");
  textElements.forEach((el) => {
    if (!el.getAttribute("font-family")) {
      el.setAttribute("font-family", "'JetBrains Mono', 'Fira Code', monospace");
    }
  });

  return new XMLSerializer().serializeToString(clone);
}

/**
 * Télécharge un fichier via un lien temporaire.
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useExportDiagram(
  svgRef: RefObject<SVGSVGElement | null>,
  defaultFilename: string = "diagram",
) {
  /**
   * Export en SVG vectoriel.
   */
  const exportAsSVG = useCallback(
    (filename?: string) => {
      if (!svgRef.current) return;
      const svgContent = prepareSvgForExport(svgRef.current);
      const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
      downloadBlob(blob, `${filename || defaultFilename}.svg`);
    },
    [svgRef, defaultFilename],
  );

  /**
   * Export en PNG haute résolution (2x).
   */
  const exportAsPNG = useCallback(
    (filename?: string, scale: number = 2) => {
      if (!svgRef.current) return;
      const svgContent = prepareSvgForExport(svgRef.current);

      const svgElement = svgRef.current;
      const viewBox = svgElement.getAttribute("viewBox");
      let width = svgElement.width.baseVal.value || 960;
      let height = svgElement.height.baseVal.value || 680;

      if (viewBox) {
        const parts = viewBox.split(/\s+/).map(Number);
        if (parts.length === 4) {
          width = parts[2];
          height = parts[3];
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        ctx.fillStyle = "#0f0f1a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              downloadBlob(blob, `${filename || defaultFilename}.png`);
            }
          },
          "image/png",
          1.0,
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        console.error("[useExportDiagram] Erreur lors du rendu PNG");
      };

      img.src = url;
    },
    [svgRef, defaultFilename],
  );

  return { exportAsSVG, exportAsPNG };
}

/**
 * Composant boutons d'export réutilisable (pour les fichiers JSX).
 * Utilisable directement dans les composants architecture.
 */
export function exportSvgElement(svgElement: SVGSVGElement, filename: string, format: "svg" | "png", scale: number = 2) {
  const svgContent = prepareSvgForExport(svgElement);

  if (format === "svg") {
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, `${filename}.svg`);
    return;
  }

  // PNG export
  const viewBox = svgElement.getAttribute("viewBox");
  let width = svgElement.width.baseVal.value || 960;
  let height = svgElement.height.baseVal.value || 680;

  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4) {
      width = parts[2];
      height = parts[3];
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    ctx.fillStyle = "#0f0f1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          downloadBlob(blob, `${filename}.png`);
        }
      },
      "image/png",
      1.0,
    );
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    console.error("[exportSvgElement] Erreur lors du rendu PNG");
  };

  img.src = url;
}
