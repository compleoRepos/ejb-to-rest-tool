/**
 * source-filter.ts — v8.4 STEP 1
 * Filtrer les fichiers de test AVANT le parsing.
 * Les tests ne doivent JAMAIS générer de services, controllers ou DTOs.
 *
 * @author Compleo
 */

// ─── Patterns de fichiers de test ───────────────────────────────────────────

const TEST_CLASS_PATTERNS = [
  /Test\.java$/,               // ActiverCarteUCTest.java
  /Tests\.java$/,              // MadServicesTests.java
  /IT\.java$/,                 // IntegrationIT.java
  /Spec\.java$/,               // ServiceSpec.java
  /Mock\w*\.java$/,            // MockService.java
  /Stub\w*\.java$/,            // StubDao.java
  /Fake\w*\.java$/,            // FakeRepository.java
  /TestHelper\.java$/,         // TestHelper.java
  /TestUtils?\.java$/,         // TestUtil.java, TestUtils.java
  /TestBase\.java$/,           // TestBase.java
  /TestConfig\.java$/,         // TestConfig.java
];

const TEST_DIRECTORIES = [
  "/src/test/",
  "/test/java/",
  "/tests/",
  "/generated/",
  "/target/",
  "/build/",
];

// ─── Patterns de fichiers non-migrables (config, IDE, générés) ──────────────
const NON_MIGRABLE_PATTERNS = [
  /package-info\.java$/,
  /module-info\.java$/,
  /_\w+\.java$/,              // Fichiers préfixés underscore
  /TestData\.java$/,
];

// ─── API publique ───────────────────────────────────────────────────────────

/**
 * Détermine si un fichier est un fichier de test.
 * Critères :
 *   1. Le chemin contient un répertoire de test connu (src/test/, test/java/, tests/)
 *   2. Le nom de fichier correspond à un pattern de test (*Test.java, *Mock*.java, etc.)
 */
export function isTestFile(filePath: string, fileName?: string): boolean {
  const name = fileName ?? filePath.split("/").pop() ?? "";

  // Répertoire de test ou non-migrable
  if (TEST_DIRECTORIES.some(dir => filePath.includes(dir))) return true;

  // Nom de fichier de test
  if (TEST_CLASS_PATTERNS.some(pattern => pattern.test(name))) return true;

  // Fichiers non-migrables (config, IDE, générés)
  if (NON_MIGRABLE_PATTERNS.some(pattern => pattern.test(name))) return true;

  return false;
}

/**
 * Filtrer les fichiers source en excluant les fichiers de test.
 * Retourne un nouveau tableau avec uniquement les fichiers source.
 */
export function filterTestFiles(
  files: { path: string; content: string }[]
): { filtered: { path: string; content: string }[]; testCount: number } {
  const filtered: { path: string; content: string }[] = [];
  let testCount = 0;

  for (const file of files) {
    const fileName = file.path.split("/").pop() ?? "";

    if (isTestFile(file.path, fileName)) {
      testCount++;
      continue; // Exclure du parsing
    }

    filtered.push(file);
  }

  return { filtered, testCount };
}
