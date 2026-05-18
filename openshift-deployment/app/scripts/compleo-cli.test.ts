/**
 * Tests pour la CLI Compleo v4.0 — compleo migrate
 *
 * Vérifie le parsing des arguments, la lecture de fichiers,
 * et le pipeline complet en mode dry-run et migration.
 *
 * @author Compleo
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

// ─── Helpers réutilisables ──────────────────────────────────────────────────

/**
 * Crée un projet Java temporaire minimal pour les tests CLI.
 */
function createTempJavaProject(): { dir: string; zipPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compleo-cli-test-"));
  const srcDir = path.join(dir, "src", "main", "java", "com", "example");
  fs.mkdirSync(srcDir, { recursive: true });

  // Fichier EJB minimal
  fs.writeFileSync(
    path.join(srcDir, "MyService.java"),
    `package com.example;

import javax.ejb.Stateless;
import javax.ejb.Remote;

@Stateless
@Remote(MyServiceRemote.class)
public class MyService implements MyServiceRemote {
    public String hello(String name) {
        return "Hello " + name;
    }
}
`
  );

  // Interface Remote
  fs.writeFileSync(
    path.join(srcDir, "MyServiceRemote.java"),
    `package com.example;

import javax.ejb.Remote;

@Remote
public interface MyServiceRemote {
    String hello(String name);
}
`
  );

  // DTO
  fs.writeFileSync(
    path.join(srcDir, "UserDto.java"),
    `package com.example;

import java.io.Serializable;

public class UserDto implements Serializable {
    private String name;
    private int age;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }
}
`
  );

  // pom.xml
  fs.writeFileSync(
    path.join(dir, "pom.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>my-ejb-app</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>ejb</packaging>
    <dependencies>
        <dependency>
            <groupId>javax</groupId>
            <artifactId>javaee-api</artifactId>
            <version>7.0</version>
        </dependency>
    </dependencies>
</project>
`
  );

  // Créer le ZIP
  const zipPath = path.join(os.tmpdir(), `compleo-cli-test-${Date.now()}.zip`);
  execSync(`cd "${dir}" && zip -r "${zipPath}" .`, { stdio: "pipe" });

  return { dir, zipPath };
}

function cleanupTemp(dir: string, zipPath?: string) {
  try { execSync(`rm -rf "${dir}"`); } catch { /* ignore */ }
  if (zipPath) {
    try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Compleo CLI v4.0", () => {
  describe("Argument parsing", () => {
    it("affiche l'aide sans erreur", () => {
      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts help 2>&1`,
        { encoding: "utf-8", timeout: 30000 }
      );
      expect(result).toContain("Compleo CLI v4.0");
      expect(result).toContain("migrate");
      expect(result).toContain("--repo");
      expect(result).toContain("--zip");
      expect(result).toContain("--dry-run");
      expect(result).toContain("--auto-resolve");
      expect(result).toContain("--verbose");
    });

    it("affiche l'aide avec --help", () => {
      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts --help 2>&1`,
        { encoding: "utf-8", timeout: 30000 }
      );
      expect(result).toContain("Compleo CLI v4.0");
    });

    it("échoue avec une commande inconnue", () => {
      try {
        execSync(
          `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts unknown 2>&1`,
          { encoding: "utf-8", timeout: 30000 }
        );
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.stdout || err.stderr || "").toContain("Commande inconnue");
      }
    });

    it("échoue sans --repo ni --zip", () => {
      try {
        execSync(
          `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate 2>&1`,
          { encoding: "utf-8", timeout: 30000 }
        );
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.stdout || err.stderr || "").toContain("--repo");
      }
    });

    it("échoue si le fichier ZIP n'existe pas", () => {
      try {
        execSync(
          `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate --zip /tmp/nonexistent.zip 2>&1`,
          { encoding: "utf-8", timeout: 30000 }
        );
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.stdout || err.stderr || "").toContain("introuvable");
      }
    });
  });

  describe("Mode dry-run", () => {
    let tempDir: string;
    let zipPath: string;

    beforeEach(() => {
      const temp = createTempJavaProject();
      tempDir = temp.dir;
      zipPath = temp.zipPath;
    });

    it("analyse un ZIP sans générer de fichiers", () => {
      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate --zip "${zipPath}" --dry-run 2>&1`,
        { encoding: "utf-8", timeout: 60000 }
      );
      expect(result).toContain("Compleo CLI v4.0");
      expect(result).toContain("fichiers chargés");
      expect(result).toContain("Résultat de l'analyse");
      expect(result).toContain("Use Cases EJB");
      expect(result).toContain("Mode dry-run");
      // Should NOT contain generation phase
      expect(result).not.toContain("Génération du projet Spring Boot");
      cleanupTemp(tempDir, zipPath);
    });

    it("affiche les détails en mode verbose", () => {
      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate --zip "${zipPath}" --dry-run --verbose 2>&1`,
        { encoding: "utf-8", timeout: 60000 }
      );
      expect(result).toContain("Résultat de l'analyse");
      expect(result).toContain("DTOs");
      expect(result).toContain("Technologies");
      cleanupTemp(tempDir, zipPath);
    });
  });

  describe("Migration complète", () => {
    let tempDir: string;
    let zipPath: string;
    let outputDir: string;

    beforeEach(() => {
      const temp = createTempJavaProject();
      tempDir = temp.dir;
      zipPath = temp.zipPath;
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "compleo-cli-output-"));
    });

    it("exécute le pipeline complet avec auto-resolve", () => {
      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate --zip "${zipPath}" --auto-resolve --output "${outputDir}" 2>&1`,
        { encoding: "utf-8", timeout: 120000 }
      );
      expect(result).toContain("Compleo CLI v4.0");
      expect(result).toContain("fichiers chargés");
      expect(result).toContain("Résultat de l'analyse");
      expect(result).toContain("Génération du projet Spring Boot");
      expect(result).toContain("Boucle de compilation");
      expect(result).toContain("Écriture des fichiers");
      expect(result).toContain("Migration terminée avec succès");

      // Verify output files exist
      const outputFiles = fs.readdirSync(outputDir, { recursive: true }) as string[];
      expect(outputFiles.length).toBeGreaterThan(0);

      cleanupTemp(tempDir, zipPath);
      cleanupTemp(outputDir);
    });

    it("génère un rapport de migration", () => {
      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate --zip "${zipPath}" --auto-resolve --output "${outputDir}" 2>&1`,
        { encoding: "utf-8", timeout: 120000 }
      );

      // Check for migration report
      const reportPath = path.join(outputDir, "MIGRATION_REPORT.md");
      expect(fs.existsSync(reportPath)).toBe(true);

      const reportContent = fs.readFileSync(reportPath, "utf-8");
      expect(reportContent.length).toBeGreaterThan(0);

      cleanupTemp(tempDir, zipPath);
      cleanupTemp(outputDir);
    });

    it("utilise le nom du projet déduit du ZIP", () => {
      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate --zip "${zipPath}" --auto-resolve --output "${outputDir}" 2>&1`,
        { encoding: "utf-8", timeout: 120000 }
      );
      // The project name should be derived from the zip filename
      expect(result).toContain("Projet");
      expect(result).toContain("compleo-cli-test");

      cleanupTemp(tempDir, zipPath);
      cleanupTemp(outputDir);
    });

    it("respecte le --project name personnalisé", () => {
      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate --zip "${zipPath}" --auto-resolve --output "${outputDir}" --project mon-projet 2>&1`,
        { encoding: "utf-8", timeout: 120000 }
      );
      expect(result).toContain("mon-projet");

      cleanupTemp(tempDir, zipPath);
      cleanupTemp(outputDir);
    });
  });

  describe("Lecture de fichiers source", () => {
    it("lit les fichiers Java, XML et properties", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compleo-read-test-"));
      const javaDir = path.join(dir, "src");
      fs.mkdirSync(javaDir, { recursive: true });

      fs.writeFileSync(path.join(javaDir, "Test.java"), "class Test {}");
      fs.writeFileSync(path.join(javaDir, "config.xml"), "<config/>");
      fs.writeFileSync(path.join(javaDir, "app.properties"), "key=value");
      fs.writeFileSync(path.join(javaDir, "ignored.txt"), "not a source file");

      // Use the CLI in dry-run to verify it reads the right files
      const zipPath = path.join(os.tmpdir(), `compleo-read-test-${Date.now()}.zip`);
      execSync(`cd "${dir}" && zip -r "${zipPath}" .`, { stdio: "pipe" });

      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate --zip "${zipPath}" --dry-run 2>&1`,
        { encoding: "utf-8", timeout: 60000 }
      );
      // Should load 3 files (java, xml, properties) but not .txt
      expect(result).toContain("3 fichiers chargés");

      cleanupTemp(dir, zipPath);
    });

    it("ignore les répertoires node_modules et .git", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compleo-ignore-test-"));
      const srcDir = path.join(dir, "src");
      const nodeDir = path.join(dir, "node_modules", "pkg");
      const gitDir = path.join(dir, ".git", "objects");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(nodeDir, { recursive: true });
      fs.mkdirSync(gitDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, "App.java"), "class App {}");
      fs.writeFileSync(path.join(nodeDir, "Dep.java"), "class Dep {}");
      fs.writeFileSync(path.join(gitDir, "Obj.java"), "class Obj {}");

      const zipPath = path.join(os.tmpdir(), `compleo-ignore-test-${Date.now()}.zip`);
      execSync(`cd "${dir}" && zip -r "${zipPath}" .`, { stdio: "pipe" });

      const result = execSync(
        `cd "${path.resolve(__dirname, "..")}" && npx tsx scripts/compleo-cli.ts migrate --zip "${zipPath}" --dry-run 2>&1`,
        { encoding: "utf-8", timeout: 60000 }
      );
      // Should only load 1 file (App.java), ignoring node_modules and .git
      expect(result).toContain("1 fichiers chargés");

      cleanupTemp(dir, zipPath);
    });
  });
});
