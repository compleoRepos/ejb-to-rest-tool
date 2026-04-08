import { parseEjbProject } from "../server/java-parser.ts";
import { GraphBuilder } from "../server/graph/GraphBuilder.ts";
import * as fs from "fs";
import * as path from "path";

function loadSim(name) {
  const dir = path.resolve("test-projects/simulateurs", name);
  const files = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".java"))
        files.push({ path: e.name, content: fs.readFileSync(f, "utf-8") });
    }
  }
  walk(dir);
  return files;
}

const builder = new GraphBuilder();

const SIMS = [
  "sim-01-core-banking",
  "sim-02-virement",
  "sim-03-kyc",
  "sim-04-credit",
  "sim-05-monetique",
  "sim-06-batch",
];

for (const sim of SIMS) {
  const files = loadSim(sim);
  const ir = parseEjbProject(files);
  const graph = builder.buildFromIR(ir);
  const jndi = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
  console.log(`${sim}: ${files.length} files, ${ir.useCases.length} UC, ${jndi.length} JNDI edges`);
  for (const e of jndi) {
    console.log(`  -> ${e.source} -> ${e.target} [${e.label}]`);
  }
}

// All sims combined
const allFiles = [];
for (const sim of SIMS) {
  allFiles.push(...loadSim(sim));
}
const ir = parseEjbProject(allFiles);
const graph = builder.buildFromIR(ir);
const jndi = graph.edges.filter((e) => e.type === "JNDI_LOOKUP");
console.log(`\nSI COMPLET: ${allFiles.length} files, ${ir.useCases.length} UC, ${jndi.length} JNDI edges`);
