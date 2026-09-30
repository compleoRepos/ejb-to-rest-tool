/**
 * Adapter WAR Generator
 * Wraps the jaxrs-wrapper-generator Java CLI to produce WAR adapter projects
 * from EJB source ZIPs.
 */
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { existsSync, createWriteStream } from "fs";
import { ZipArchive } from "archiver";
import { applyOutputMappingFix, includeSourceModules, fixWebPomDependencies, addWebFrameworkDependencies, fixEarFinalName, fixJndiBindingNames, writeDeployTooling, writeProjectReadme } from "./outputMappingFix";
import { fixTypedResponseMapping } from "./typedResponseFix";
import { fixUseCaseEnvelopes } from "./useCaseEnvelopeFix";
import { fixDuplicateDtoProperties } from "./duplicatePropertyFix";
import { prepareEngineInput } from "./engineInputFix";
import { removeDeadResponseMapping } from "./deadCodeFix";
import { fixReturnCodeReading } from "./returnCodeFix";
import { fixRequestFields } from "./requestFieldsFix";
import { restoreOriginalPoms } from "./pomPreservationFix";
import { removeNonEjbExposures } from "./nonEjbExposureFix";
import { resolveJavaBinary, detectJavaVersion, MIN_JAVA_MAJOR } from "./javaRuntime";
import { writeEndpointDescriptor } from "./descriptorGenerator";

/**
 * Message unique renvoyé quand le java utilisé est trop ancien pour le moteur.
 */
function tooOldJavaMessage(version: string | null): string {
  const detected = version ?? "inconnue";
  return `Le générateur nécessite Java ${MIN_JAVA_MAJOR} ou supérieur. Java détecté : ${detected}. Renseignez le chemin d'un JDK ${MIN_JAVA_MAJOR}+ dans le champ prévu.`;
}

/**
 * Chemin vers le JAR du générateur JAX-RS.
 * Priorité : variable d'env JAXRS_GENERATOR_JAR > server/lib/jaxrs-wrapper-generator.jar (bundled) > chemin sandbox dev.
 */
const JAR_PATH = (() => {
  if (process.env.JAXRS_GENERATOR_JAR) {
    return process.env.JAXRS_GENERATOR_JAR;
  }

  // In dev: import.meta.dirname = /home/ubuntu/ejb-to-rest-tool-v2/server/generators
  // In prod (bundled): import.meta.dirname = /app/dist  (esbuild output)
  const thisDir = import.meta.dirname;

  // Candidate paths for the bundled JAR
  const candidates = [
    // Dev mode: relative to server/generators/ → go up to project root → server/lib/
    path.resolve(thisDir, "..", "lib", "jaxrs-wrapper-generator.jar"),
    // Production (esbuild bundles to dist/): go up to project root → server/lib/
    path.resolve(thisDir, "..", "server", "lib", "jaxrs-wrapper-generator.jar"),
    // Alternative production path: JAR copied next to dist/
    path.resolve(thisDir, "lib", "jaxrs-wrapper-generator.jar"),
    // Sandbox dev path (works during local development in Manus sandbox)
    "/home/ubuntu/jaxrs-wrapper-generator/target/jaxrs-wrapper-generator-1.0.0-SNAPSHOT.jar",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Fallback: return the sandbox path (will fail at runtime with a clear error)
  return candidates[candidates.length - 1];
})();

export interface AdapterGenerationOptions {
  inputPath: string; // Path to extracted EJB project directory or ZIP
  outputDir: string; // Where to write the generated project
  groupId: string;
  artifactId: string;
  basePackage: string;
  jdkHome?: string; // JDK dédié au moteur (sinon GENERATOR_JAVA_HOME, sinon java du PATH)
}

export interface AdapterGenerationResult {
  success: boolean;
  outputDir: string;
  ejbCount: number;
  methodCount: number;
  filesGenerated: number;
  errors: string[];
  log: string;
}

/**
 * Run the Java CLI to generate an Adapter WAR project from an EJB source.
 */
export async function generateAdapter(options: AdapterGenerationOptions): Promise<AdapterGenerationResult> {
  const { inputPath, outputDir, groupId, artifactId, basePackage, jdkHome } = options;

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const emptyResult = (errors: string[]): AdapterGenerationResult => ({
    success: false,
    outputDir,
    ejbCount: 0,
    methodCount: 0,
    filesGenerated: 0,
    errors,
    log: "",
  });

  // Résolution du binaire java (jdkHome > GENERATOR_JAVA_HOME > PATH).
  let javaBin: string;
  try {
    javaBin = resolveJavaBinary(jdkHome).javaBin;
  } catch (err) {
    return emptyResult([(err as Error).message]);
  }

  // Pré-vérification de version : ne pas lancer le moteur avec un java trop ancien.
  const versionInfo = await detectJavaVersion(javaBin);
  if (!versionInfo.ok) {
    return emptyResult([`Impossible d'exécuter java (${javaBin}). ${versionInfo.raw}`.trim()]);
  }
  if (!versionInfo.atLeast17) {
    return emptyResult([tooOldJavaMessage(versionInfo.version)]);
  }

  // Copie de l'entrée sans les commentaires des enum, que le moteur lit comme des codes fonction.
  const engineInput = await prepareEngineInput(inputPath);

  return new Promise((resolve) => {
    const args = [
      "-jar", JAR_PATH,
      engineInput.path,
      "-o", outputDir,
      "-g", groupId,
      "-a", artifactId,
      "-p", basePackage,
    ];

    let stdout = "";
    let stderr = "";

    const proc = spawn(javaBin, args, {
      cwd: outputDir,
      env: { ...process.env },
    });

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", async (code) => {
      await engineInput.cleanup().catch(() => undefined);
      const log = stdout + "\n" + stderr;
      
      if (code !== 0) {
        const message = /UnsupportedClassVersionError/.test(log)
          ? tooOldJavaMessage(versionInfo.version)
          : stderr || `Process exited with code ${code}`;
        resolve({
          success: false,
          outputDir,
          ejbCount: 0,
          methodCount: 0,
          filesGenerated: 0,
          errors: [message],
          log,
        });
        return;
      }

      // Aligner le mapping de sortie sur la couche adaptateur validée (JNDI + flux JSON).
      try {
        await applyOutputMappingFix(outputDir);
      } catch (fixErr) {
        // Le correctif de sortie ne doit jamais faire échouer la génération.
        stderr += `\n[outputMappingFix] ${(fixErr as Error).message}`;
      }

      // Aligner les converters sur les DTO de réponse typés (champs objet et listes).
      try {
        await fixTypedResponseMapping(outputDir);
      } catch (typedErr) {
        stderr += `\n[fixTypedResponseMapping] ${(typedErr as Error).message}`;
      }

      // Retirer les dépendances framework sans version qui cassent le build.
      try {
        await fixWebPomDependencies(outputDir);
      } catch (pomErr) {
        stderr += `\n[fixWebPomDependencies] ${(pomErr as Error).message}`;
      }

      // finalName de l'EAR = artifactId (aligne le nom du .ear sur le Dockerfile).
      try {
        await fixEarFinalName(outputDir);
      } catch (earErr) {
        stderr += `\n[fixEarFinalName] ${(earErr as Error).message}`;
      }

      // Inclure les modules source d'origine (EJB au réacteur, EAR conservé + .ear dans le web).
      try {
        await includeSourceModules(outputDir, inputPath);
      } catch (modErr) {
        stderr += `\n[includeSourceModules] ${(modErr as Error).message}`;
      }

      // Reporter dans le web les dépendances framework déclarées par l'EJB (parent sans framework hérité).
      try {
        await addWebFrameworkDependencies(outputDir);
      } catch (depErr) {
        stderr += `\n[addWebFrameworkDependencies] ${(depErr as Error).message}`;
      }

      // Aligner le lookup JNDI des resources sur le binding-name du descripteur
      // IBM (present dans le module ejb clone ci-dessus).
      try {
        await fixJndiBindingNames(outputDir);
      } catch (jndiErr) {
        stderr += `\n[fixJndiBindingNames] ${(jndiErr as Error).message}`;
      }

      // Interfaces clientes de web services et interfaces @Local : pas des EJB appelables.
      try {
        const removals = await removeNonEjbExposures(outputDir, inputPath);
        for (const r of removals) stderr += `\n[removeNonEjbExposures] ${r.target} retire (${r.reason})`;
      } catch (nonEjbErr) {
        stderr += `\n[removeNonEjbExposures] ${(nonEjbErr as Error).message}`;
      }

      // Flux des EJB eai-fwk-ejb (UCStrategie) : <flux><entete><fonction>UC</fonction></entete>
      // <object class="VoIn">...</object></flux>, DTO de requete aligne sur la VoIn.
      try {
        const ucReport = await fixUseCaseEnvelopes(outputDir, inputPath);
        for (const warning of ucReport.warnings) stderr += `\n[fixUseCaseEnvelopes] ${warning}`;
      } catch (ucErr) {
        stderr += `\n[fixUseCaseEnvelopes] ${(ucErr as Error).message}`;
      }

      // DTO dont deux champs ne different que par la casse : accesseurs en double.
      try {
        await fixDuplicateDtoProperties(outputDir);
      } catch (dupErr) {
        stderr += `\n[fixDuplicateDtoProperties] ${(dupErr as Error).message}`;
      }

      // Champs d'entree des EJB historiques, retrouves par analyse statique de l'EJB fonction par fonction.
      try {
        const fields = await fixRequestFields(outputDir);
        for (const f of fields.functions) {
          if (f.relay) stderr += `\n[fixRequestFields] ${f.code} : relais vers un service aval, parametres libres acceptes`;
          if (f.lists.length) stderr += `\n[fixRequestFields] ${f.code} : listes non transmises ${f.lists.join(", ")}`;
        }
        for (const s of fields.skipped) stderr += `\n[fixRequestFields] ${s}`;
      } catch (rfErr) {
        stderr += `\n[fixRequestFields] ${(rfErr as Error).message}`;
      }

      // Conversion de réponse jamais utilisée : appel fromXxxEnvelope, méthodes et accesseurs orphelins.
      try {
        await removeDeadResponseMapping(outputDir);
      } catch (deadErr) {
        stderr += `\n[removeDeadResponseMapping] ${(deadErr as Error).message}`;
      }

      // Code retour des EJB historiques (CODRET, codeRetour...) au lieu de flux/code, reponse vide en erreur technique.
      try {
        await fixReturnCodeReading(outputDir);
      } catch (rcErr) {
        stderr += `\n[fixReturnCodeReading] ${(rcErr as Error).message}`;
      }

      // Poms du depot d'origine conserves : le projet livre remplace le depot.
      try {
        const poms = await restoreOriginalPoms(outputDir, inputPath);
        for (const s of poms.skipped) stderr += `\n[restoreOriginalPoms] ${s}`;
      } catch (pomErr) {
        stderr += `\n[restoreOriginalPoms] ${(pomErr as Error).message}`;
      }

      // Remplacer les stubs de deploiement par l'outillage WAS valide. Doit rester
      // apres includeSourceModules : l'outillage se cale sur les modules ejb et ear.
      try {
        await writeDeployTooling(outputDir);
      } catch (depErr) {
        stderr += `\n[writeDeployTooling] ${(depErr as Error).message}`;
      }

      // Descripteur JSON des endpoints, ré-uploadable dans le générateur de wrappers.
      try {
        await writeEndpointDescriptor(outputDir, artifactId);
      } catch (descErr) {
        stderr += `\n[writeEndpointDescriptor] ${(descErr as Error).message}`;
      }

      // Count generated files
      const filesGenerated = await countFiles(outputDir);
      
      // Parse stats from log
      const ejbMatch = log.match(/EJBs to transform:\s*(\d+)/);
      const ejbCount = ejbMatch ? parseInt(ejbMatch[1]) : 0;
      
      // Count methods from Resource files
      const methodCount = await countMethods(outputDir);

      resolve({
        success: true,
        outputDir,
        ejbCount,
        methodCount,
        filesGenerated,
        errors: [],
        log: stdout + "\n" + stderr,
      });
    });

    proc.on("error", (err) => {
      void engineInput.cleanup().catch(() => undefined);
      resolve({
        success: false,
        outputDir,
        ejbCount: 0,
        methodCount: 0,
        filesGenerated: 0,
        errors: [`Failed to start Java process: ${err.message}`],
        log: "",
      });
    });
  });
}

/**
 * Documentation livree avec le projet : un README factuel, tire des modules generes.
 */
export async function generateAdapterDocumentation(
  outputDir: string,
  projectName: string,
  _ejbCount: number,
  _methodCount: number
): Promise<void> {
  for (const obsolete of ["DEVELOPER-GUIDE.md", "DEPLOYMENT.md", "ARCHITECTURE.md"]) {
    await fs.rm(path.join(outputDir, obsolete), { force: true });
  }
  await writeProjectReadme(outputDir, projectName);
}

/**
 * Package the generated project as a ZIP file.
 */
export async function packageAsZip(sourceDir: string, outputZipPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputZipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => resolve(outputZipPath));
    archive.on("error", (err: Error) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// ─── Utility Functions ────────────────────────────────────────────────────────

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        count++;
      } else if (entry.isDirectory()) {
        count += await countFiles(path.join(dir, entry.name));
      }
    }
  } catch {
    // ignore errors
  }
  return count;
}

async function countMethods(dir: string): Promise<number> {
  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith("Resource.java")) {
        const filePath = path.join((entry as any).parentPath || (entry as any).path, entry.name);
        const content = await fs.readFile(filePath, "utf-8");
        const matches = content.match(/@(GET|POST|PUT|DELETE|PATCH)/g);
        if (matches) count += matches.length;
      }
    }
  } catch {
    // fallback
  }
  return count;
}
