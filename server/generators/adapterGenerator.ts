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
import { applyOutputMappingFix, includeSourceModules, fixWebPomDependencies, fixEarFinalName, writeDeployTooling } from "./outputMappingFix";

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
  const { inputPath, outputDir, groupId, artifactId, basePackage } = options;

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  return new Promise((resolve) => {
    const args = [
      "-jar", JAR_PATH,
      inputPath,
      "-o", outputDir,
      "-g", groupId,
      "-a", artifactId,
      "-p", basePackage,
    ];

    let stdout = "";
    let stderr = "";

    const proc = spawn("java", args, {
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
      const log = stdout + "\n" + stderr;
      
      if (code !== 0) {
        resolve({
          success: false,
          outputDir,
          ejbCount: 0,
          methodCount: 0,
          filesGenerated: 0,
          errors: [stderr || `Process exited with code ${code}`],
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

      // Remplacer les stubs de deploiement par l'outillage WAS valide. Doit rester
      // apres includeSourceModules : l'outillage se cale sur les modules ejb et ear.
      try {
        await writeDeployTooling(outputDir);
      } catch (depErr) {
        stderr += `\n[writeDeployTooling] ${(depErr as Error).message}`;
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
        log,
      });
    });

    proc.on("error", (err) => {
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
 * Generate documentation files for the Adapter project.
 */
export async function generateAdapterDocumentation(
  outputDir: string,
  projectName: string,
  ejbCount: number,
  methodCount: number
): Promise<void> {
  const readmeContent = generateReadme(projectName, ejbCount, methodCount);
  const devGuideContent = generateDeveloperGuide(projectName);
  const deployGuideContent = generateDeploymentGuide(projectName);
  const architectureContent = generateArchitectureDoc(projectName);

  await fs.writeFile(path.join(outputDir, "README.md"), readmeContent);
  await fs.writeFile(path.join(outputDir, "DEVELOPER-GUIDE.md"), devGuideContent);
  await fs.writeFile(path.join(outputDir, "DEPLOYMENT.md"), deployGuideContent);
  await fs.writeFile(path.join(outputDir, "ARCHITECTURE.md"), architectureContent);
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

// ─── Documentation Templates ─────────────────────────────────────────────────

function generateReadme(projectName: string, ejbCount: number, methodCount: number): string {
  return `# ${projectName} — Adapter REST JAX-RS

## Vue d'ensemble

Ce projet est un **module WAR adaptateur** qui expose les EJB legacy en tant qu'API REST JAX-RS.
Il sert de couche d'adaptation entre les clients REST modernes et les services EJB existants déployés sur WebSphere.

## Statistiques

| Métrique | Valeur |
|----------|--------|
| EJBs transformés | ${ejbCount} |
| Endpoints REST générés | ${methodCount} |
| Compatibilité | Java 8 / WebSphere 8.5+ |
| Spécification | JAX-RS 2.0 (javax.ws.rs) |

## Structure du projet

\`\`\`
src/main/java/
├── resource/          # Ressources JAX-RS (@Path, @GET, @POST, etc.)
├── converter/         # Convertisseurs Envelope ↔ DTO JSON
├── dto/               # Data Transfer Objects (Request/Response)
├── mapper/            # CodeMapper (codes retour EJB → HTTP status)
└── JaxRsApplication.java  # Point d'entrée JAX-RS
\`\`\`

## Architecture

\`\`\`
Client HTTP → [Resource JAX-RS] → [Converter] → [SynchroneService EJB] → Backend Legacy
                                       ↕
                                  [DTO JSON]
\`\`\`

## Prérequis

- Java 8 (JDK 1.8)
- Maven 3.6+
- WebSphere Application Server 8.5+ ou Liberty

## Compilation

\`\`\`bash
mvn clean package
\`\`\`

Le fichier WAR généré se trouve dans \`target/${projectName}.war\`.

## Documentation complémentaire

- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — Guide détaillé pour les développeurs
- [DEPLOYMENT.md](DEPLOYMENT.md) — Guide de déploiement complet
- [ARCHITECTURE.md](ARCHITECTURE.md) — Architecture technique détaillée
`;
}

function generateDeveloperGuide(projectName: string): string {
  return `# Guide Développeur — ${projectName}

## Comprendre le code généré

### 1. Ressources JAX-RS (\`resource/\`)

Chaque classe Resource correspond à un EJB Session Bean original. Elle expose les méthodes
de l'EJB en tant qu'endpoints REST.

**Pattern utilisé :**
\`\`\`java
@Path("/nom-ejb")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class NomEjbResource {

    @EJB
    private SynchroneService synchroneService;

    @POST
    @Path("/methode")
    public Response methode(MethodeRequest request) {
        // 1. Créer l'Envelope
        Envelope envelope = new Envelope();
        // 2. Mapper les champs du DTO vers l'Envelope
        NomEjbConverter.toEnvelope(request, envelope);
        // 3. Appeler le service EJB
        Envelope response = synchroneService.process(envelope);
        // 4. Extraire le code retour et mapper vers HTTP status
        String code = response.getNodeAsString("flux/codeRetour");
        int httpStatus = CodeMapper.toHttpStatus(code);
        // 5. Convertir la réponse Envelope vers DTO
        MethodeResponse dto = NomEjbConverter.fromEnvelope(response);
        return Response.status(httpStatus).entity(dto).build();
    }
}
\`\`\`

### 2. Convertisseurs (\`converter/\`)

Les Converters assurent la transformation bidirectionnelle entre les DTOs JSON
et les Envelopes XML utilisées par le bus EAI.

**Méthodes clés :**
- \`toEnvelope(RequestDTO, Envelope)\` — Mappe les champs JSON vers les nœuds Envelope
- \`fromEnvelope(Envelope)\` → \`ResponseDTO\` — Extrait les nœuds Envelope vers le DTO

**Convention de nommage des nœuds :**
- Les nœuds Envelope suivent le pattern \`flux/nomDuChamp\`
- Les noms de champs sont identiques entre le DTO et l'Envelope

### 3. DTOs (\`dto/\`)

Chaque méthode EJB génère un couple Request/Response DTO.

**Règles :**
- Les types primitifs Java (int, long, double, boolean) sont wrappés en types objets (Integer, Long, Double, Boolean)
- Les types complexes sont sérialisés en String (pas de @QueryParam sur types complexes)
- Les sous-packages évitent les collisions de noms quand plusieurs EJBs ont des méthodes homonymes

### 4. CodeMapper (\`mapper/\`)

Traduit les codes retour métier de l'Envelope vers des codes HTTP standards :

| Code EJB | HTTP Status | Signification |
|----------|-------------|---------------|
| "000" | 200 OK | Succès |
| "001" | 409 Conflict | Conflit métier |
| "003" | 500 Internal Server Error | Erreur technique |
| Autre | 500 Internal Server Error | Erreur non mappée |

### 5. JaxRsApplication

Point d'entrée JAX-RS qui déclare le chemin de base de l'API :
\`\`\`java
@ApplicationPath("/api")
public class JaxRsApplication extends Application { }
\`\`\`

## Conventions

- **Package de base** : Tous les fichiers sont dans le package configuré lors de la génération
- **Pas de RMI/JNDI** : L'injection se fait via \`@EJB\` (conteneur WebSphere)
- **Pas de Jakarta** : Uniquement \`javax.*\` pour compatibilité Java EE 7 / WebSphere 8.5

## Modification du code

### Ajouter un endpoint
1. Ajouter la méthode dans la Resource correspondante
2. Créer les DTOs Request/Response
3. Ajouter les méthodes de conversion dans le Converter
4. Mettre à jour le CodeMapper si nécessaire

### Personnaliser le mapping Envelope
Modifier le Converter correspondant pour ajuster les noms de nœuds ou ajouter
des transformations métier.

## Tests

Pour tester localement sans WebSphere, créez un mock du SynchroneService :
\`\`\`java
@Alternative
@Priority(1)
public class MockSynchroneService extends SynchroneService {
    @Override
    public Envelope process(Envelope input) {
        Envelope response = new Envelope();
        response.addNode("flux/codeRetour", "000");
        // ... remplir les champs de réponse
        return response;
    }
}
\`\`\`
`;
}

function generateDeploymentGuide(projectName: string): string {
  return `# Guide de Déploiement — ${projectName}

## Prérequis

| Composant | Version minimale |
|-----------|-----------------|
| JDK | 1.8 (Java 8) |
| Maven | 3.6+ |
| WebSphere | 8.5.5+ ou Liberty 18.0+ |
| Mémoire | 512 MB min (heap) |

## Compilation

\`\`\`bash
# Compilation standard
mvn clean package

# Compilation avec profil spécifique
mvn clean package -P production

# Skip tests (si stubs non disponibles)
mvn clean package -DskipTests
\`\`\`

## Déploiement sur WebSphere Application Server

### 1. Préparation

1. Compiler le WAR : \`mvn clean package\`
2. Vérifier que le fichier \`target/${projectName}.war\` est généré
3. S'assurer que les EJBs cibles sont déployés et accessibles

### 2. Déploiement via Console Admin WebSphere

1. Ouvrir la console d'administration : \`https://<host>:9043/ibm/console\`
2. Naviguer vers **Applications** → **Nouvelle application** → **Nouvelle application d'entreprise**
3. Sélectionner le fichier WAR
4. Configurer le context root : \`/${projectName}\`
5. Mapper le module sur le serveur cible
6. Sauvegarder et synchroniser les nœuds

### 3. Déploiement via wsadmin (Script)

\`\`\`python
# deploy.py — Script wsadmin
AdminApp.install('/path/to/${projectName}.war', [
    '-appname', '${projectName}',
    '-contextroot', '/${projectName}',
    '-server', 'server1',
    '-MapWebModToVH', [['.*', '.*', 'default_host']]
])
AdminConfig.save()
\`\`\`

Exécution :
\`\`\`bash
/opt/IBM/WebSphere/AppServer/bin/wsadmin.sh -f deploy.py -lang jython
\`\`\`

### 4. Déploiement sur WebSphere Liberty

\`\`\`xml
<!-- server.xml -->
<server>
    <featureManager>
        <feature>jaxrs-2.0</feature>
        <feature>ejbLite-3.2</feature>
        <feature>jsonp-1.0</feature>
    </featureManager>

    <httpEndpoint id="defaultHttpEndpoint" httpPort="9080" httpsPort="9443" />

    <webApplication id="${projectName}" location="${projectName}.war" contextRoot="/${projectName}" />
</server>
\`\`\`

## Déploiement sur machine locale (Développement)

### Option 1 : WebSphere Liberty (recommandé)

\`\`\`bash
# 1. Télécharger Liberty
# https://www.ibm.com/docs/en/was-liberty

# 2. Créer un serveur
wlp/bin/server create devServer

# 3. Copier le WAR
cp target/${projectName}.war wlp/usr/servers/devServer/dropins/

# 4. Démarrer
wlp/bin/server start devServer

# 5. Tester
curl http://localhost:9080/${projectName}/api/health
\`\`\`

### Option 2 : Open Liberty avec Maven

Ajouter au pom.xml :
\`\`\`xml
<plugin>
    <groupId>io.openliberty.tools</groupId>
    <artifactId>liberty-maven-plugin</artifactId>
    <version>3.8</version>
</plugin>
\`\`\`

\`\`\`bash
mvn liberty:dev
\`\`\`

## Configuration des environnements

### Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| \`EAI_ENDPOINT\` | URL du bus EAI | \`http://eai-host:8080/services\` |
| \`SYNC_SERVICE_JNDI\` | JNDI du SynchroneService | \`ejb/SynchroneService\` |
| \`LOG_LEVEL\` | Niveau de log | \`INFO\` |

### Profils d'environnement

| Environnement | Description | Particularités |
|---------------|-------------|----------------|
| **dev** | Développement local | Mocks activés, logs DEBUG |
| **staging** | Pré-production | EAI staging, logs INFO |
| **production** | Production | EAI prod, logs WARN, monitoring |

## Vérification post-déploiement

\`\`\`bash
# Vérifier que l'application est démarrée
curl -s http://localhost:9080/${projectName}/api/ | jq .

# Tester un endpoint spécifique
curl -X POST http://localhost:9080/${projectName}/api/<resource>/<method> \\
  -H "Content-Type: application/json" \\
  -d '{"field1": "value1"}'
\`\`\`

## Troubleshooting

| Problème | Cause probable | Solution |
|----------|---------------|----------|
| ClassNotFoundException | Dépendances manquantes | Vérifier le scope Maven (provided vs compile) |
| EJB lookup failed | JNDI incorrect | Vérifier le binding EJB dans WebSphere |
| 404 sur les endpoints | Context root incorrect | Vérifier la configuration du context root |
| 500 Internal Error | Envelope mal formée | Vérifier les noms de nœuds dans le Converter |
`;
}

function generateArchitectureDoc(projectName: string): string {
  return `# Architecture Technique — ${projectName}

## Diagramme de composants

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                    Module WAR Adapter                            │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Resource   │───▶│  Converter   │───▶│ SynchroneService │  │
│  │  (JAX-RS)    │    │              │    │     (@EJB)       │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                    │                     │            │
│         ▼                    ▼                     ▼            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │     DTO      │    │  CodeMapper  │    │    Envelope      │  │
│  │ (Req/Resp)   │    │              │    │   (XML Bus)      │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

## Flux de données

### Requête entrante (Client → EJB)

1. Le client envoie une requête HTTP (JSON) vers la Resource JAX-RS
2. JAX-RS désérialise le JSON en DTO Request
3. Le Converter transforme le DTO en Envelope (format XML du bus EAI)
4. Le SynchroneService (EJB) est invoqué avec l'Envelope
5. L'EJB legacy traite la requête via le bus EAI

### Réponse sortante (EJB → Client)

1. Le SynchroneService retourne une Envelope de réponse
2. Le CodeMapper extrait le code retour et détermine le HTTP status
3. Le Converter transforme l'Envelope en DTO Response
4. La Resource retourne le DTO sérialisé en JSON avec le bon HTTP status

## Dépendances techniques

| Dépendance | Scope | Rôle |
|------------|-------|------|
| javax.ws.rs-api | provided | API JAX-RS 2.0 |
| javax.ejb-api | provided | Injection EJB |
| javax.json-api | provided | Traitement JSON |
| ma.eai.commons | provided | Envelope, SynchroneService |
| jackson-databind | compile | Sérialisation JSON |

## Sécurité

- L'authentification est gérée au niveau du conteneur WebSphere (LTPA tokens)
- Les endpoints REST héritent des contraintes de sécurité du web.xml
- Aucune logique de sécurité n'est implémentée dans le code généré

## Performance

- Pas de state côté serveur (Stateless)
- Connection pooling géré par le conteneur
- Timeout configurable via le descripteur de déploiement
`;
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
