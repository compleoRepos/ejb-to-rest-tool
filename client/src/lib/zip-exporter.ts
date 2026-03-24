/**
 * ZIP Exporter — Génère une archive ZIP avec structure Maven complète.
 * 
 * @author Hamza NORDINE
 * @description Exporte les fichiers générés par EJB Client Modernizer
 *              dans une archive ZIP prête à compiler avec Maven.
 */

import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface GeneratedFile {
  path: string;
  content: string;
  category?: string;
}

/**
 * Génère le contenu du fichier .gitignore pour le projet Maven.
 */
function generateGitignore(): string {
  return `# Compiled class files
*.class

# Log files
*.log

# Package files
*.jar
*.war
*.nar
*.ear
*.zip
*.tar.gz
*.rar

# Maven
target/
pom.xml.tag
pom.xml.releaseBackup
pom.xml.versionsBackup
pom.xml.next
release.properties
dependency-reduced-pom.xml
buildNumber.properties
.mvn/timing.properties
.mvn/wrapper/maven-wrapper.jar

# IDE
.idea/
*.iml
*.iws
.project
.classpath
.settings/
.factorypath
.vscode/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db
`;
}

/**
 * Génère un README.md pour le projet exporté.
 */
function generateReadme(projectName: string, serviceCount: number): string {
  return `# ${projectName}

> Projet généré automatiquement par **EJB Client Modernizer** — Hamza NORDINE

## Description

Ce projet contient les clients API REST modernes générés à partir du code legacy EJB.
Les appels EJB (\`@EJB\`, JNDI lookups, \`InitialContext\`) ont été remplacés par des appels
HTTP via **Spring WebClient** (Spring WebFlux).

## Prérequis

- Java 21+
- Maven 3.9+
- Spring Boot 3.2+

## Compilation

\`\`\`bash
mvn clean install
\`\`\`

## Exécution des tests

\`\`\`bash
mvn test
\`\`\`

## Structure du projet

\`\`\`
src/
├── main/java/com/bank/client/
│   ├── client/          # Clients API REST (WebClient)
│   ├── config/          # Configuration (WebClient, timeout, retry)
│   ├── dto/             # DTOs (Request/Response)
│   ├── exception/       # Exceptions personnalisées
│   └── util/            # Utilitaires (error handler)
└── test/java/com/bank/client/
    └── client/          # Tests unitaires (JUnit 5 + Mockito)
\`\`\`

## Services générés

${serviceCount} client(s) API REST ont été générés pour remplacer les appels EJB legacy.

## Auteur

**Hamza NORDINE** — EJB Client Modernizer
`;
}

/**
 * Génère un fichier Dockerfile pour le projet.
 */
function generateDockerfile(): string {
  return `# Multi-stage build
FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`;
}

/**
 * Exporte les fichiers générés dans une archive ZIP avec structure Maven.
 * 
 * @param files - Liste des fichiers générés
 * @param projectName - Nom du projet (défaut: "ejb-client-modernized")
 * @param analysisReport - Rapport d'analyse Markdown (optionnel)
 */
export async function exportToZip(
  files: GeneratedFile[],
  projectName: string = 'ejb-client-modernized',
  analysisReport?: string
): Promise<void> {
  const zip = new JSZip();
  const root = zip.folder(projectName);

  if (!root) {
    throw new Error('Impossible de créer le dossier racine dans le ZIP');
  }

  // Compteur de services pour le README
  const serviceCount = files.filter(f => f.category === 'CLIENT' || f.path.includes('/client/')).length;

  // Ajouter chaque fichier généré dans la structure Maven
  for (const file of files) {
    // Les fichiers ont déjà le chemin relatif correct (src/main/java/...)
    root.file(file.path, file.content);
  }

  // Ajouter le .gitignore
  root.file('.gitignore', generateGitignore());

  // Ajouter le README.md
  root.file('README.md', generateReadme(projectName, serviceCount));

  // Ajouter le Dockerfile
  root.file('Dockerfile', generateDockerfile());

  // Ajouter le rapport d'analyse si disponible
  if (analysisReport) {
    const docsFolder = root.folder('docs');
    if (docsFolder) {
      docsFolder.file('rapport-analyse.md', analysisReport);
    }
  }

  // Générer et télécharger le ZIP
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  saveAs(blob, `${projectName}.zip`);
}

/**
 * Estime la taille de l'archive ZIP (pour affichage avant téléchargement).
 */
export function estimateZipSize(files: GeneratedFile[]): string {
  const totalBytes = files.reduce((sum, f) => sum + new Blob([f.content]).size, 0);
  // Le ZIP compressé fait environ 30-40% de la taille originale
  const estimatedZipBytes = Math.round(totalBytes * 0.35);

  if (estimatedZipBytes < 1024) {
    return `${estimatedZipBytes} B`;
  } else if (estimatedZipBytes < 1024 * 1024) {
    return `${(estimatedZipBytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(estimatedZipBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
