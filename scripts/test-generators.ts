import { TechnologyRegistry } from "../server/engine/registry/index";
import { registerAllDetectors } from "../server/engine/detectors/index";
import { registerAllGenerators } from "../server/engine/generators/index";
import * as fs from "fs";
import * as path from "path";

function readFiles(dir: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  function walk(d: string) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(java|jsp|xml)$/.test(entry.name)) {
        files.push({ path: full, content: fs.readFileSync(full, "utf-8") });
      }
    }
  }
  walk(dir);
  return files;
}

const projects = [
  { name: "tech-01-servlet", dir: "/home/ubuntu/test-projects/tech-01-servlet" },
  { name: "tech-02-ejb2x", dir: "/home/ubuntu/test-projects/tech-02-ejb2x" },
  { name: "tech-03-struts", dir: "/home/ubuntu/test-projects/tech-03-struts" },
  { name: "tech-04-soap", dir: "/home/ubuntu/test-projects/tech-04-soap" },
  { name: "tech-05-jdbc-hibernate", dir: "/home/ubuntu/test-projects/tech-05-jdbc-hibernate" },
  { name: "tech-06-jms-batch", dir: "/home/ubuntu/test-projects/tech-06-jms-batch" },
];

let allPass = true;

for (const proj of projects) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Projet: ${proj.name}`);
  console.log(`${"=".repeat(60)}`);

  const registry = new TechnologyRegistry();
  registerAllDetectors(registry);
  registerAllGenerators(registry);

  const files = readFiles(proj.dir);
  const components = registry.detectAll(files);
  console.log(`  Composants detectes: ${components.length}`);

  const allGenerated = registry.generateAll(components, "ma.banque.app");
  const totalGenerated = allGenerated.length;

  for (const comp of components) {
    const forComp = allGenerated.filter(f => f.sourceRef === comp.filePath);
    console.log(`  [${comp.technology}] ${comp.className}: ${forComp.length} fichiers generes`);
    for (const f of forComp) {
      console.log(`    -> ${f.category}: ${f.path}`);
    }
  }

  if (totalGenerated === 0 && components.length > 0) {
    console.log(`  ERREUR: Composants detectes mais aucun fichier genere!`);
    allPass = false;
  } else {
    console.log(`  OK: ${totalGenerated} fichiers generes au total`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(allPass ? "TOUS LES PROJETS OK" : "ERREURS DETECTEES");
console.log(`${"=".repeat(60)}`);
process.exit(allPass ? 0 : 1);
