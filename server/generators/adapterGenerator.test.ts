/**
 * Integration tests for the Adapter WAR Generator.
 * Tests the Java CLI-based generation of JAX-RS adapter projects from EJB sources.
 */
import { describe, it, expect } from "vitest";
import { generateAdapter, generateAdapterDocumentation } from "./adapterGenerator";
import fs from "fs/promises";
import path from "path";

const SAMPLE_EJB_DIR = "/home/ubuntu/jaxrs-wrapper-generator/src/test/resources/sample-ejb";
const OUTPUT_BASE = "/tmp/vitest-adapter-output";

describe("Adapter Generator (Java CLI)", () => {
  it("generates a complete adapter project from sample EJB", async () => {
    const outputDir = path.join(OUTPUT_BASE, "test-basic");
    await fs.rm(outputDir, { recursive: true, force: true });

    const result = await generateAdapter({
      inputPath: SAMPLE_EJB_DIR,
      outputDir,
      groupId: "ma.bmce",
      artifactId: "test-adapter",
      basePackage: "ma.bmce.adapter",
    });

    expect(result.success).toBe(true);
    expect(result.ejbCount).toBeGreaterThan(0);
    expect(result.methodCount).toBeGreaterThan(0);
    expect(result.filesGenerated).toBeGreaterThan(10);
    expect(result.errors).toHaveLength(0);
  });

  it("generates SecurityHeadersFilter", async () => {
    const outputDir = path.join(OUTPUT_BASE, "test-basic");
    const filterPath = path.join(outputDir, "test-adapter-web/src/main/java/ma/bmce/adapter/config/SecurityHeadersFilter.java");
    const content = await fs.readFile(filterPath, "utf-8");

    expect(content).toContain("X-Content-Type-Options");
    expect(content).toContain("X-Frame-Options");
    expect(content).toContain("Strict-Transport-Security");
    expect(content).toContain("Content-Security-Policy");
    expect(content).toContain("Referrer-Policy");
    expect(content).toContain("@Provider");
  });

  it("generates RequestLoggingFilter", async () => {
    const outputDir = path.join(OUTPUT_BASE, "test-basic");
    const filterPath = path.join(outputDir, "test-adapter-web/src/main/java/ma/bmce/adapter/config/RequestLoggingFilter.java");
    const content = await fs.readFile(filterPath, "utf-8");

    expect(content).toContain("@Provider");
    expect(content).toContain("ContainerRequestFilter");
    expect(content).toContain("request-start-time");
  });

  it("generates InputSanitizer with XSS protection", async () => {
    const outputDir = path.join(OUTPUT_BASE, "test-basic");
    const sanitizerPath = path.join(outputDir, "test-adapter-web/src/main/java/ma/bmce/adapter/config/InputSanitizer.java");
    const content = await fs.readFile(sanitizerPath, "utf-8");

    expect(content).toContain("sanitize");
    expect(content).toContain("isSafe");
    expect(content).toContain("&amp;");
    expect(content).toContain("&lt;");
    expect(content).toContain("&gt;");
    expect(content).toContain("&quot;");
  });

  it("generates Resource with comprehensive JavaDoc", async () => {
    const outputDir = path.join(OUTPUT_BASE, "test-basic");
    const files = await fs.readdir(path.join(outputDir, "test-adapter-web/src/main/java/ma/bmce/adapter/resource"));
    expect(files.length).toBeGreaterThan(0);

    const resourceContent = await fs.readFile(
      path.join(outputDir, "test-adapter-web/src/main/java/ma/bmce/adapter/resource", files[0]),
      "utf-8"
    );

    // Class-level JavaDoc
    expect(resourceContent).toContain("adaptateur pur");
    expect(resourceContent).toContain("pattern Adapter GoF");
    expect(resourceContent).toContain("@author");
    expect(resourceContent).toContain("@version");
    expect(resourceContent).toContain("@see");

    // Method-level JavaDoc
    expect(resourceContent).toContain("@param request");
    expect(resourceContent).toContain("@return");
  });

  it("generates POM with correct coordinates", async () => {
    const outputDir = path.join(OUTPUT_BASE, "test-basic");
    const pomContent = await fs.readFile(path.join(outputDir, "pom.xml"), "utf-8");

    expect(pomContent).toContain("<groupId>ma.bmce</groupId>");
    expect(pomContent).toContain("<artifactId>test-adapter-pom</artifactId>");
    expect(pomContent).toContain("<packaging>pom</packaging>");
    // Web module should have WAR packaging
    const webPomContent = await fs.readFile(path.join(outputDir, "test-adapter-web/pom.xml"), "utf-8");
    expect(webPomContent).toContain("<packaging>war</packaging>");
  });

  it("generates documentation files", async () => {
    const outputDir = path.join(OUTPUT_BASE, "test-docs");
    await fs.rm(outputDir, { recursive: true, force: true });

    const result = await generateAdapter({
      inputPath: SAMPLE_EJB_DIR,
      outputDir,
      groupId: "ma.bmce",
      artifactId: "test-docs-adapter",
      basePackage: "ma.bmce.adapter",
    });

    await generateAdapterDocumentation(outputDir, "test-docs-adapter", result.ejbCount, result.methodCount);

    const readmePath = path.join(outputDir, "README.md");
    const readmeContent = await fs.readFile(readmePath, "utf-8");
    expect(readmeContent).toContain("test-docs-adapter");
    expect(readmeContent).toContain("EJB");
  });
});
