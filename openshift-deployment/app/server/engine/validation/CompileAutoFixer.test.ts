/**
 * Tests for CompileAutoFixer — auto-fix compilation errors.
 */
import { describe, it, expect } from "vitest";
import { autoFixAndCompile } from "./CompileAutoFixer";

describe("CompileAutoFixer", () => {
  it("should pass directly for valid projects (no fix needed)", () => {
    const files = [
      {
        path: "pom.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.compleo</groupId>
    <artifactId>test-project</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>`,
      },
      {
        path: "src/main/java/com/compleo/test/TestService.java",
        content: `package com.compleo.test;

import org.springframework.stereotype.Service;

@Service
public class TestService {
    public String hello() {
        return "Hello";
    }
}`,
      },
    ];

    const result = autoFixAndCompile(files, { timeout: 60000 });
    expect(result.status).toBe("PASS");
    expect(result.iterations).toBe(0);
    expect(result.fixesApplied.length).toBe(0);
    expect(result.recoveredFromFail).toBe(false);
  }, 30000);

  it("should auto-fix missing DTO package by generating stubs", () => {
    const files = [
      {
        path: "pom.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.compleo</groupId>
    <artifactId>test-project</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>`,
      },
      {
        path: "src/main/java/com/compleo/service/OrderService.java",
        content: `package com.compleo.service;

import org.springframework.stereotype.Service;
import com.compleo.dto.OrderDTO;

@Service
public class OrderService {
    public OrderDTO getOrder(Long id) {
        OrderDTO dto = new OrderDTO();
        dto.setId(id);
        dto.setName("Test Order");
        dto.setAmount(new java.math.BigDecimal("100.00"));
        return dto;
    }
}`,
      },
    ];

    const result = autoFixAndCompile(files, { timeout: 90000 });
    console.log(`Status: ${result.status}, Iterations: ${result.iterations}, Fixes: ${result.fixesApplied.length}`);
    for (const fix of result.fixesApplied) {
      console.log(`  [${fix.type}] ${fix.description}`);
    }

    expect(result.recoveredFromFail).toBe(true);
    expect(result.status).toContain("PASS");
    expect(result.fixesApplied.some(f => f.type === "STUB_CLASS")).toBe(true);
  }, 90000);

  it("should add spring-security dependency when missing", () => {
    const files = [
      {
        path: "pom.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.compleo</groupId>
    <artifactId>test-project</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>`,
      },
      {
        path: "src/main/java/com/compleo/config/SecurityConfig.java",
        content: `package com.compleo.config;

import org.springframework.stereotype.Service;
import org.springframework.security.access.prepost.PreAuthorize;

@Service
public class SecurityConfig {
    @PreAuthorize("hasRole('ADMIN')")
    public void adminOnly() {
        System.out.println("Admin access");
    }
}`,
      },
    ];

    const result = autoFixAndCompile(files, { timeout: 90000 });
    console.log(`Status: ${result.status}, Iterations: ${result.iterations}, Fixes: ${result.fixesApplied.length}`);
    for (const fix of result.fixesApplied) {
      console.log(`  [${fix.type}] ${fix.description}`);
    }

    // With the dependency added, it should pass (no stub for framework packages)
    expect(result.recoveredFromFail).toBe(true);
    expect(result.status).toContain("PASS");
    expect(result.fixesApplied.some(f => f.type === "ADD_DEPENDENCY")).toBe(true);
    // Should NOT generate stubs for Spring framework packages
    expect(result.fixesApplied.some(f => f.type === "STUB_CLASS" && f.file.includes("springframework"))).toBe(false);
  }, 90000);
});
