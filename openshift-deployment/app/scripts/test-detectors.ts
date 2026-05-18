/**
 * Test rapide de tous les detecteurs multi-technologies
 * sur les 6 projets de test.
 */
import { TechnologyRegistry } from "../server/engine/registry/index";
import { registerAllDetectors } from "../server/engine/detectors/index";
import * as fs from "fs";
import * as path from "path";

function readJavaFiles(dir: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  function walk(d: string) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".java") || entry.name.endsWith(".jsp") || entry.name.endsWith(".xml")) {
        files.push({ path: full, content: fs.readFileSync(full, "utf-8") });
      }
    }
  }
  walk(dir);
  return files;
}

const projects = [
  { name: "tech-01-servlet", dir: "/home/ubuntu/test-projects/tech-01-servlet", expected: ["SERVLET", "JSP"] },
  { name: "tech-02-ejb2x", dir: "/home/ubuntu/test-projects/tech-02-ejb2x", expected: ["EJB_2X"] },
  { name: "tech-03-struts", dir: "/home/ubuntu/test-projects/tech-03-struts", expected: ["STRUTS_1"] },
  { name: "tech-04-soap", dir: "/home/ubuntu/test-projects/tech-04-soap", expected: ["SOAP"] },
  { name: "tech-05-jdbc-hibernate", dir: "/home/ubuntu/test-projects/tech-05-jdbc-hibernate", expected: ["JDBC", "HIBERNATE"] },
  { name: "tech-06-jms-batch", dir: "/home/ubuntu/test-projects/tech-06-jms-batch", expected: ["JMS", "BATCH"] },
];

let allPass = true;

for (const proj of projects) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Projet: ${proj.name}`);
  console.log(`${"=".repeat(60)}`);

  const registry = new TechnologyRegistry();
  registerAllDetectors(registry);

  const files = readJavaFiles(proj.dir);
  console.log(`  Fichiers trouves: ${files.length}`);

  const components = registry.detectAll(files);
  console.log(`  Composants detectes: ${components.length}`);

  const techsFound = [...new Set(components.map((c) => c.technology))];
  console.log(`  Technologies: ${techsFound.join(", ")}`);

  for (const comp of components) {
    console.log(`    - [${comp.technology}] ${comp.className} (confiance: ${comp.confidence}%)`);
  }

  // Verifier que toutes les technologies attendues sont detectees
  const missing = proj.expected.filter((e) => !techsFound.includes(e as any));
  if (missing.length > 0) {
    console.log(`  ERREUR: Technologies manquantes: ${missing.join(", ")}`);
    allPass = false;
  } else {
    console.log(`  OK: Toutes les technologies attendues detectees`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(allPass ? "TOUS LES PROJETS OK" : "ERREURS DETECTEES");
console.log(`${"=".repeat(60)}`);
process.exit(allPass ? 0 : 1);
