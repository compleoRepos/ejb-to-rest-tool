/**
 * Pipeline API Server — Compilation, Analysis, Quality Scanning
 * Provides REST endpoints for Java project build operations.
 * Runs inside the pipeline container with JDK 21, Maven, Gradle, SonarScanner.
 */

const http = require("http");
const { execSync, exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const WORKSPACE = process.env.WORKSPACE_DIR || "/workspace";
const REPOS_DIR = process.env.REPOS_DIR || "/data/repos";

// Ensure directories exist
[WORKSPACE, REPOS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * Detect build tool from project directory
 */
function detectBuildTool(projectDir) {
  if (fs.existsSync(path.join(projectDir, "pom.xml"))) return "maven";
  if (fs.existsSync(path.join(projectDir, "build.gradle")) ||
      fs.existsSync(path.join(projectDir, "build.gradle.kts"))) return "gradle";
  if (fs.existsSync(path.join(projectDir, "build.xml"))) return "ant";
  return "unknown";
}

/**
 * Compile a Java project
 */
function compileProject(projectDir, buildTool) {
  const startTime = Date.now();
  let command;

  switch (buildTool) {
    case "maven":
      command = `cd "${projectDir}" && mvn clean compile -q -B -DskipTests 2>&1`;
      break;
    case "gradle":
      command = `cd "${projectDir}" && gradle build -x test --no-daemon -q 2>&1`;
      break;
    default:
      return { success: false, error: `Unsupported build tool: ${buildTool}`, duration: 0 };
  }

  try {
    const output = execSync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }).toString();
    return {
      success: true,
      buildTool,
      output: output.slice(-2000),
      duration: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      buildTool,
      error: err.stderr?.toString().slice(-2000) || err.message,
      output: err.stdout?.toString().slice(-2000) || "",
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Analyze project structure
 */
function analyzeProject(projectDir) {
  const buildTool = detectBuildTool(projectDir);
  const files = [];

  function walk(dir, depth = 0) {
    if (depth > 5) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "target" || entry.name === "build") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.name.endsWith(".java") || entry.name.endsWith(".xml") || entry.name.endsWith(".jsp") || entry.name.endsWith(".properties")) {
          files.push(path.relative(projectDir, fullPath));
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(projectDir);

  return {
    buildTool,
    totalFiles: files.length,
    javaFiles: files.filter(f => f.endsWith(".java")).length,
    xmlFiles: files.filter(f => f.endsWith(".xml")).length,
    jspFiles: files.filter(f => f.endsWith(".jsp")).length,
    files: files.slice(0, 200),
  };
}

/**
 * HTTP request handler
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Content-Type", "application/json");

  // Health check
  if (url.pathname === "/health") {
    let javaVersion = "unknown";
    let mavenVersion = "unknown";
    let gradleVersion = "unknown";
    try { javaVersion = execSync("java -version 2>&1").toString().split("\\n")[0]; } catch {}
    try { mavenVersion = execSync("mvn --version 2>&1").toString().split("\\n")[0]; } catch {}
    try { gradleVersion = execSync("gradle --version 2>&1").toString().match(/Gradle \\d+\\.\\d+/)?.[0] || "unknown"; } catch {}

    res.writeHead(200);
    return res.end(JSON.stringify({
      status: "ok",
      tools: { java: javaVersion, maven: mavenVersion, gradle: gradleVersion },
      timestamp: new Date().toISOString(),
    }));
  }

  // Compile endpoint
  if (url.pathname === "/compile" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const { projectDir, buildTool } = JSON.parse(body);
        const tool = buildTool || detectBuildTool(projectDir);
        const result = compileProject(projectDir, tool);
        res.writeHead(result.success ? 200 : 422);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Analyze endpoint
  if (url.pathname === "/analyze" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const { projectDir } = JSON.parse(body);
        const result = analyzeProject(projectDir);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Detect build tool
  if (url.pathname === "/detect" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const { projectDir } = JSON.parse(body);
        res.writeHead(200);
        res.end(JSON.stringify({ buildTool: detectBuildTool(projectDir) }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[Pipeline] API server running on port ${PORT}`);
  console.log(`[Pipeline] Java: ${execSync("java -version 2>&1").toString().split("\\n")[0]}`);
  console.log(`[Pipeline] Maven: ${execSync("mvn --version 2>&1").toString().split("\\n")[0]}`);
});
