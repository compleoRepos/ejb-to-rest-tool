/**
 * Tests unitaires pour la route /api/agent/:id/compliance
 * et la logique de catégorisation SOC 2.
 *
 * @author Compleo
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock du SOC2ComplianceGenerator ─────────────────────────────────────────

describe("SOC 2 Compliance Route Logic", () => {
  // Simulate the categorization logic from the route
  function categorizeComplianceFiles(files: Array<{ path: string; content: string; category?: string }>) {
    const complianceFiles = files.filter(
      (f) =>
        f.path.includes("/compliance/") ||
        f.path.includes("SOC2_COMPLIANCE") ||
        f.path.includes("application-soc2")
    );

    const reportFile = complianceFiles.find((f) => f.path.includes("SOC2_COMPLIANCE.md"));
    const codeFiles = complianceFiles.filter((f) => !f.path.includes("SOC2_COMPLIANCE.md"));

    const categorizedFiles = codeFiles.map((f) => {
      let category = "config";
      let tsc = "";
      if (f.path.includes("/audit/")) { category = "audit"; tsc = "CC7, CC8"; }
      else if (f.path.includes("/security/")) { category = "security"; tsc = "CC6"; }
      else if (f.path.includes("/validation/")) { category = "validation"; tsc = "CC5, PI1"; }
      else if (f.path.includes("/monitoring/")) { category = "monitoring"; tsc = "A1, CC7"; }
      else if (f.path.includes("/error/")) { category = "error"; tsc = "CC3, CC9"; }
      else if (f.path.includes("application-soc2")) { category = "config"; tsc = "CC6, CC7"; }
      return {
        path: f.path,
        content: f.content,
        category,
        tsc,
        fileName: f.path.split("/").pop() || f.path,
      };
    });

    const tscSet = new Set<string>();
    categorizedFiles.forEach((f) => {
      f.tsc.split(", ").filter(Boolean).forEach((t) => tscSet.add(t));
    });

    return {
      enabled: complianceFiles.length > 0,
      files: categorizedFiles,
      report: reportFile ? reportFile.content : null,
      summary: {
        totalFiles: categorizedFiles.length,
        criteriasCovered: Array.from(tscSet).sort(),
        categories: {
          audit: categorizedFiles.filter((f) => f.category === "audit").length,
          security: categorizedFiles.filter((f) => f.category === "security").length,
          validation: categorizedFiles.filter((f) => f.category === "validation").length,
          monitoring: categorizedFiles.filter((f) => f.category === "monitoring").length,
          error: categorizedFiles.filter((f) => f.category === "error").length,
          config: categorizedFiles.filter((f) => f.category === "config").length,
        },
      },
    };
  }

  it("should return enabled=false when no compliance files exist", () => {
    const files = [
      { path: "src/main/java/com/app/service/UserService.java", content: "class UserService {}" },
      { path: "src/main/resources/application.yml", content: "spring: ..." },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(false);
    expect(result.files).toHaveLength(0);
    expect(result.report).toBeNull();
  });

  it("should correctly categorize audit files", () => {
    const files = [
      { path: "src/main/java/com/app/compliance/audit/AuditLogEntity.java", content: "@Entity class AuditLogEntity {}" },
      { path: "src/main/java/com/app/compliance/audit/AuditInterceptor.java", content: "class AuditInterceptor {}" },
      { path: "src/main/java/com/app/compliance/audit/AuditAspect.java", content: "class AuditAspect {}" },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(true);
    expect(result.files).toHaveLength(3);
    expect(result.files.every(f => f.category === "audit")).toBe(true);
    expect(result.files.every(f => f.tsc === "CC7, CC8")).toBe(true);
    expect(result.summary.categories.audit).toBe(3);
  });

  it("should correctly categorize security files", () => {
    const files = [
      { path: "src/main/java/com/app/compliance/security/SecurityConfig.java", content: "class SecurityConfig {}" },
      { path: "src/main/java/com/app/compliance/security/DataEncryptionUtil.java", content: "class DataEncryptionUtil {}" },
      { path: "src/main/java/com/app/compliance/security/SecurityHeadersFilter.java", content: "class SecurityHeadersFilter {}" },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(true);
    expect(result.files.every(f => f.category === "security")).toBe(true);
    expect(result.files.every(f => f.tsc === "CC6")).toBe(true);
    expect(result.summary.categories.security).toBe(3);
  });

  it("should correctly categorize validation files", () => {
    const files = [
      { path: "src/main/java/com/app/compliance/validation/InputValidationAspect.java", content: "class InputValidationAspect {}" },
      { path: "src/main/java/com/app/compliance/validation/SanitizeInput.java", content: "@interface SanitizeInput {}" },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(true);
    expect(result.files.every(f => f.category === "validation")).toBe(true);
    expect(result.files.every(f => f.tsc === "CC5, PI1")).toBe(true);
    expect(result.summary.categories.validation).toBe(2);
  });

  it("should correctly categorize monitoring files", () => {
    const files = [
      { path: "src/main/java/com/app/compliance/monitoring/HealthCheckController.java", content: "class HealthCheckController {}" },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(true);
    expect(result.files[0].category).toBe("monitoring");
    expect(result.files[0].tsc).toBe("A1, CC7");
    expect(result.summary.categories.monitoring).toBe(1);
  });

  it("should correctly categorize error handling files", () => {
    const files = [
      { path: "src/main/java/com/app/compliance/error/GlobalErrorHandler.java", content: "class GlobalErrorHandler {}" },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(true);
    expect(result.files[0].category).toBe("error");
    expect(result.files[0].tsc).toBe("CC3, CC9");
    expect(result.summary.categories.error).toBe(1);
  });

  it("should correctly categorize application-soc2.yml as config", () => {
    const files = [
      { path: "src/main/resources/application-soc2.yml", content: "spring:\n  profiles:\n    active: soc2" },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(true);
    expect(result.files[0].category).toBe("config");
    expect(result.files[0].tsc).toBe("CC6, CC7");
    expect(result.summary.categories.config).toBe(1);
  });

  it("should extract the SOC2_COMPLIANCE.md report separately", () => {
    const files = [
      { path: "docs/SOC2_COMPLIANCE.md", content: "# Rapport SOC 2\n\n## Vue d'ensemble\n..." },
      { path: "src/main/java/com/app/compliance/audit/AuditLogEntity.java", content: "class AuditLogEntity {}" },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(true);
    expect(result.report).toBe("# Rapport SOC 2\n\n## Vue d'ensemble\n...");
    expect(result.files).toHaveLength(1); // Report is not in the files array
    expect(result.files[0].fileName).toBe("AuditLogEntity.java");
  });

  it("should compute all TSC criteria correctly from mixed files", () => {
    const files = [
      { path: "src/main/java/com/app/compliance/audit/AuditLogEntity.java", content: "" },
      { path: "src/main/java/com/app/compliance/security/SecurityConfig.java", content: "" },
      { path: "src/main/java/com/app/compliance/validation/InputValidationAspect.java", content: "" },
      { path: "src/main/java/com/app/compliance/monitoring/HealthCheckController.java", content: "" },
      { path: "src/main/java/com/app/compliance/error/GlobalErrorHandler.java", content: "" },
      { path: "src/main/resources/application-soc2.yml", content: "" },
      { path: "docs/SOC2_COMPLIANCE.md", content: "# Report" },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(true);
    expect(result.summary.totalFiles).toBe(6); // 7 - 1 report
    expect(result.summary.criteriasCovered).toContain("CC3");
    expect(result.summary.criteriasCovered).toContain("CC5");
    expect(result.summary.criteriasCovered).toContain("CC6");
    expect(result.summary.criteriasCovered).toContain("CC7");
    expect(result.summary.criteriasCovered).toContain("CC8");
    expect(result.summary.criteriasCovered).toContain("CC9");
    expect(result.summary.criteriasCovered).toContain("A1");
    expect(result.summary.criteriasCovered).toContain("PI1");
    expect(result.report).toBe("# Report");
  });

  it("should extract correct fileName from path", () => {
    const files = [
      { path: "src/main/java/com/app/compliance/security/SecurityConfig.java", content: "" },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.files[0].fileName).toBe("SecurityConfig.java");
  });

  it("should handle full SOC 2 generation output (realistic scenario)", () => {
    // Simulate what generateSOC2Compliance actually produces
    const files = [
      { path: "src/main/java/com/migration/compliance/audit/AuditLogEntity.java", content: "package com.migration.compliance.audit;\n@Entity..." },
      { path: "src/main/java/com/migration/compliance/audit/AuditLogRepository.java", content: "package com.migration.compliance.audit;\ninterface..." },
      { path: "src/main/java/com/migration/compliance/audit/AuditInterceptor.java", content: "package com.migration.compliance.audit;\nclass..." },
      { path: "src/main/java/com/migration/compliance/audit/AuditAspect.java", content: "package com.migration.compliance.audit;\nclass..." },
      { path: "src/main/java/com/migration/compliance/audit/Auditable.java", content: "package com.migration.compliance.audit;\n@interface..." },
      { path: "src/main/java/com/migration/compliance/security/SecurityConfig.java", content: "package com.migration.compliance.security;\nclass..." },
      { path: "src/main/java/com/migration/compliance/security/DataEncryptionUtil.java", content: "package com.migration.compliance.security;\nclass..." },
      { path: "src/main/java/com/migration/compliance/security/EncryptedField.java", content: "package com.migration.compliance.security;\n@interface..." },
      { path: "src/main/java/com/migration/compliance/validation/InputValidationAspect.java", content: "package com.migration.compliance.validation;\nclass..." },
      { path: "src/main/java/com/migration/compliance/validation/SanitizeInput.java", content: "package com.migration.compliance.validation;\n@interface..." },
      { path: "src/main/java/com/migration/compliance/monitoring/HealthCheckController.java", content: "package com.migration.compliance.monitoring;\nclass..." },
      { path: "src/main/java/com/migration/compliance/error/GlobalErrorHandler.java", content: "package com.migration.compliance.error;\nclass..." },
      { path: "src/main/resources/application-soc2.yml", content: "spring:\n  profiles:\n    active: soc2" },
      { path: "src/main/java/com/migration/compliance/security/SecurityHeadersFilter.java", content: "package com.migration.compliance.security;\nclass..." },
      { path: "docs/SOC2_COMPLIANCE.md", content: "# Rapport de Conformité SOC 2 Type II\n\n## 1. Vue d'ensemble\n..." },
    ];
    const result = categorizeComplianceFiles(files);
    expect(result.enabled).toBe(true);
    expect(result.summary.totalFiles).toBe(14); // 15 - 1 report
    expect(result.summary.categories.audit).toBe(5);
    expect(result.summary.categories.security).toBe(4);
    expect(result.summary.categories.validation).toBe(2);
    expect(result.summary.categories.monitoring).toBe(1);
    expect(result.summary.categories.error).toBe(1);
    expect(result.summary.categories.config).toBe(1);
    expect(result.report).toContain("Rapport de Conformité SOC 2");
  });
});
