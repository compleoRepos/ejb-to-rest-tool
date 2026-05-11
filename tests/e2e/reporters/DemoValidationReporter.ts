import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
import fs from "fs";
import path from "path";

/**
 * COMPLEO v13.5 — DemoValidationReporter
 * 
 * Custom Playwright reporter qui produit un `validation-report.html`
 * self-contained avec : cover, synthèse, étapes avec screenshots,
 * validations, livrables, et infos système.
 * 
 * Design : dark theme, mint accents, Geist font — cohérent avec les
 * autres rapports COMPLEO.
 */

interface StepResult {
  name: string;
  status: "passed" | "failed" | "skipped" | "timedOut" | "interrupted";
  duration: number;
  screenshot?: string; // base64
  validations: { label: string; passed: boolean }[];
  error?: string;
}

class DemoValidationReporter implements Reporter {
  private steps: StepResult[] = [];
  private startTime: number = 0;
  private endTime: number = 0;
  private outputDir: string = "";
  private config: FullConfig | null = null;

  onBegin(config: FullConfig, _suite: Suite) {
    this.config = config;
    this.startTime = Date.now();
    this.outputDir =
      process.env.COMPLEO_TEST_OUTPUT_DIR ||
      path.resolve("tests/e2e/output", `demo-run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    fs.mkdirSync(this.outputDir, { recursive: true });
    console.log(`\n🎬 Demo Dry-Run — Output: ${this.outputDir}\n`);
  }

  onTestBegin(test: TestCase) {
    console.log(`  ▶ ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const step: StepResult = {
      name: test.title,
      status: result.status,
      duration: result.duration,
      validations: [],
    };

    // Extraire les screenshots attachés
    for (const attachment of result.attachments) {
      if (attachment.contentType?.startsWith("image/") && attachment.body) {
        step.screenshot = attachment.body.toString("base64");
        break; // Prendre la première capture
      } else if (attachment.contentType?.startsWith("image/") && attachment.path) {
        try {
          const buf = fs.readFileSync(attachment.path);
          step.screenshot = buf.toString("base64");
          break;
        } catch { /* ignore */ }
      }
    }

    // Extraire les validations depuis les steps du test
    for (const s of result.steps) {
      if (s.title.startsWith("expect")) {
        step.validations.push({
          label: s.title.replace(/^expect\./, ""),
          passed: s.error == null,
        });
      }
    }

    if (result.error) {
      step.error = result.error.message || String(result.error);
    }

    const icon = result.status === "passed" ? "✓" : result.status === "failed" ? "✗" : "○";
    console.log(`  ${icon} ${test.title} (${(result.duration / 1000).toFixed(1)}s)`);

    this.steps.push(step);
  }

  onEnd(result: FullResult) {
    this.endTime = Date.now();
    const totalDuration = this.endTime - this.startTime;
    const passed = this.steps.filter((s) => s.status === "passed").length;
    const failed = this.steps.filter((s) => s.status === "failed").length;
    const globalStatus = failed === 0 ? "PASS" : "FAIL";

    console.log(`\n📋 Résultat global: ${globalStatus} (${passed}/${this.steps.length} étapes)`);
    console.log(`⏱  Durée totale: ${(totalDuration / 1000 / 60).toFixed(1)} min`);

    // Générer le HTML
    const html = this.generateHTML(globalStatus, totalDuration, passed, failed);
    const outputPath = path.join(this.outputDir, "validation-report.html");
    fs.writeFileSync(outputPath, html, "utf-8");
    console.log(`📄 Rapport: ${outputPath}\n`);
  }

  private generateHTML(
    globalStatus: string,
    totalDuration: number,
    passed: number,
    failed: number
  ): string {
    const date = new Date().toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const stepsHTML = this.steps
      .map((step, i) => {
        const statusIcon =
          step.status === "passed" ? "✓" : step.status === "failed" ? "✗" : "○";
        const statusColor =
          step.status === "passed"
            ? "#4ade80"
            : step.status === "failed"
            ? "#f87171"
            : "#fbbf24";

        const validationsHTML = step.validations.length > 0
          ? `<div class="validations">
              ${step.validations
                .map(
                  (v) =>
                    `<div class="validation ${v.passed ? "pass" : "fail"}">
                      <span>${v.passed ? "✓" : "✗"}</span> ${this.escapeHtml(v.label)}
                    </div>`
                )
                .join("")}
            </div>`
          : "";

        const screenshotHTML = step.screenshot
          ? `<div class="screenshot"><img src="data:image/png;base64,${step.screenshot}" alt="Capture étape ${i + 1}" /></div>`
          : "";

        const errorHTML = step.error
          ? `<div class="error-block"><pre>${this.escapeHtml(step.error.substring(0, 500))}</pre></div>`
          : "";

        return `
          <div class="step-card">
            <div class="step-header">
              <span class="step-number" style="color:${statusColor}">${statusIcon}</span>
              <span class="step-title">Étape ${i + 1} · ${this.escapeHtml(step.name)}</span>
              <span class="step-duration">${(step.duration / 1000).toFixed(1)}s</span>
              <span class="step-status" style="background:${statusColor}20;color:${statusColor}">${step.status.toUpperCase()}</span>
            </div>
            ${screenshotHTML}
            ${validationsHTML}
            ${errorHTML}
          </div>`;
      })
      .join("");

    const totalValidations = this.steps.reduce((acc, s) => acc + s.validations.length, 0);
    const passedValidations = this.steps.reduce(
      (acc, s) => acc + s.validations.filter((v) => v.passed).length,
      0
    );

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COMPLEO — Validation Report v13.5</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0f1a;
      --surface: #111827;
      --surface-alt: #1a2332;
      --border: #1e293b;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --mint: #4ade80;
      --mint-dim: #22c55e;
      --red: #f87171;
      --amber: #fbbf24;
      --blue: #60a5fa;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 0;
    }
    .cover {
      text-align: center;
      padding: 80px 40px;
      background: linear-gradient(135deg, var(--bg) 0%, #0f1a2e 100%);
      border-bottom: 1px solid var(--border);
    }
    .cover h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 8px;
      background: linear-gradient(135deg, var(--mint) 0%, var(--blue) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .cover .subtitle {
      font-size: 1.1rem;
      color: var(--text-muted);
      margin-bottom: 24px;
    }
    .cover .date { font-family: 'Geist Mono', monospace; color: var(--text-muted); font-size: 0.9rem; }
    .container { max-width: 1100px; margin: 0 auto; padding: 40px 24px; }
    .section { margin-bottom: 48px; }
    .section-title {
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 20px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
      color: var(--mint);
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .summary-card .value {
      font-size: 2rem;
      font-weight: 700;
      font-family: 'Geist Mono', monospace;
    }
    .summary-card .label {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .step-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .step-number { font-size: 1.2rem; font-weight: 700; }
    .step-title { flex: 1; font-weight: 500; }
    .step-duration {
      font-family: 'Geist Mono', monospace;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .step-status {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .screenshot {
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
    }
    .screenshot img {
      width: 100%;
      border-radius: 6px;
      border: 1px solid var(--border);
    }
    .validations { padding: 12px 20px; }
    .validation {
      font-size: 0.85rem;
      padding: 4px 0;
      font-family: 'Geist Mono', monospace;
    }
    .validation.pass { color: var(--mint); }
    .validation.fail { color: var(--red); }
    .error-block {
      padding: 12px 20px;
      background: #1a0f0f;
      border-top: 1px solid #3b1111;
    }
    .error-block pre {
      font-family: 'Geist Mono', monospace;
      font-size: 0.8rem;
      color: var(--red);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .livrables-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .livrable-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .livrable-item .icon { font-size: 1.2rem; }
    .livrable-item .name { flex: 1; font-weight: 500; }
    .livrable-item .meta { font-size: 0.8rem; color: var(--text-muted); font-family: 'Geist Mono', monospace; }
    .system-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .system-info .item {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--surface);
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .system-info .item .key { color: var(--text-muted); }
    .system-info .item .val { font-family: 'Geist Mono', monospace; color: var(--mint); }
    .global-status {
      display: inline-block;
      font-size: 1.5rem;
      font-weight: 700;
      padding: 8px 24px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .global-status.pass { background: #052e16; color: var(--mint); border: 1px solid var(--mint-dim); }
    .global-status.fail { background: #2a0f0f; color: var(--red); border: 1px solid var(--red); }
    @media print {
      body { background: white; color: #1a1a1a; }
      .cover { background: white; border-bottom: 2px solid #eee; }
      .cover h1 { -webkit-text-fill-color: #059669; }
      .step-card, .summary-card, .livrable-item { border-color: #ddd; background: #fafafa; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>Demo Dry-Run v13.5</h1>
    <p class="subtitle">Validation système bout-en-bout — EJB Client Modernizer</p>
    <p class="date">${date}</p>
  </div>

  <div class="container">
    <div class="section">
      <h2 class="section-title">Synthèse</h2>
      <div style="text-align:center;margin-bottom:20px">
        <span class="global-status ${globalStatus === "PASS" ? "pass" : "fail"}">${globalStatus}</span>
      </div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="value" style="color:${globalStatus === "PASS" ? "var(--mint)" : "var(--red)"}">${passed}/${this.steps.length}</div>
          <div class="label">Étapes réussies</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color:var(--blue)">${(totalDuration / 1000 / 60).toFixed(1)} min</div>
          <div class="label">Durée totale</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color:var(--mint)">${passedValidations}/${totalValidations}</div>
          <div class="label">Validations</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color:${failed > 0 ? "var(--red)" : "var(--mint)"}">${failed}</div>
          <div class="label">Échecs</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Étapes</h2>
      ${stepsHTML}
    </div>

    <div class="section">
      <h2 class="section-title">Livrables</h2>
      <div class="livrables-list">
        <div class="livrable-item">
          <span class="icon">📦</span>
          <span class="name">interface-credit-jocker-migrated.zip</span>
          <span class="meta">🟢 Ready</span>
        </div>
        <div class="livrable-item">
          <span class="icon">📦</span>
          <span class="name">avis-opere-migrated.zip</span>
          <span class="meta">🟡 Near-complete</span>
        </div>
        <div class="livrable-item">
          <span class="icon">📄</span>
          <span class="name">WORKSPACE-AUDIT.html</span>
          <span class="meta">Rapport workspace</span>
        </div>
        <div class="livrable-item">
          <span class="icon">📋</span>
          <span class="name">validation-report.html</span>
          <span class="meta">Ce fichier</span>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Système</h2>
      <div class="system-info">
        <div class="item"><span class="key">Version COMPLEO</span><span class="val">v13.5</span></div>
        <div class="item"><span class="key">Date</span><span class="val">${date}</span></div>
        <div class="item"><span class="key">LLM</span><span class="val">${process.env.COMPLEO_OLLAMA_MODEL || "qwen2.5-coder:1.5b"}</span></div>
        <div class="item"><span class="key">Node.js</span><span class="val">${process.version}</span></div>
        <div class="item"><span class="key">OS</span><span class="val">${process.platform} ${process.arch}</span></div>
        <div class="item"><span class="key">Playwright</span><span class="val">${this.config?.version || "unknown"}</span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

export default DemoValidationReporter;
