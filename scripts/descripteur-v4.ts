/**
 * Reconstruit le descripteur au format courant d'un depot deja expose, sans ecrire dans le depot.
 * Usage : npx tsx scripts/descripteur-v4.ts <dossier-du-depot> <fichier-de-sortie.json>
 */
import fs from "fs/promises";
import path from "path";
import { buildEndpointDescriptor } from "../server/generators/descriptorGenerator";

async function main() {
  const [projectDir, outFile] = process.argv.slice(2);
  if (!projectDir || !outFile) {
    console.error("Usage : npx tsx scripts/descripteur-v4.ts <dossier-du-depot> <fichier-de-sortie.json>");
    process.exit(2);
  }
  const artifactId = path.basename(path.resolve(projectDir));
  const built = await buildEndpointDescriptor(projectDir, artifactId);
  if (!built) {
    console.error(`Aucune resource JAX-RS dans ${projectDir}`);
    process.exit(1);
  }
  await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(built.descriptor, null, 2) + "\n");
  const endpoints = built.descriptor.endpoints;
  console.log(`${artifactId} : ${endpoints.length} endpoints, ${endpoints.filter((e) => e.test).length} de test, domaine '${built.descriptor.bian.service_domain}'`);
}

main();
