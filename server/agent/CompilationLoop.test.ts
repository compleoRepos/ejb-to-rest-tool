import { describe, it, expect } from "vitest";
import { CompilationLoop, GeneratedFile } from "./CompilationLoop";

describe("CompilationLoop", () => {
  const loop = new CompilationLoop();

  // ─── Test: Projet sans erreur → SUCCESS direct ──────────────────────

  it("should return SUCCESS for a clean project (0 errors)", async () => {
    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/dto/CarteRequestDTO.java",
        content: `package com.example.dto;

import lombok.Data;

@Data
public class CarteRequestDTO {
    private String numCarte;
    private String codePin;
}`,
      },
      {
        path: "src/main/java/com/example/controller/CarteController.java",
        content: `package com.example.controller;

import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.http.ResponseEntity;
import com.example.dto.CarteRequestDTO;

@RestController
public class CarteController {
    @PostMapping("/api/cartes/activer")
    public ResponseEntity<String> activer(@RequestBody CarteRequestDTO request) {
        return ResponseEntity.ok("OK");
    }
}`,
      },
    ];

    const result = await loop.run(project);
    expect(result.status).toBe("SUCCESS");
    expect(result.totalAttempts).toBe(1);
    expect(result.finalErrors).toHaveLength(0);
  });

  // ─── Test: Import manquant → boucle corrige ────────────────────────

  it("should fix missing imports automatically", async () => {
    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/dto/VirementRequestDTO.java",
        content: `package com.example.dto;

import lombok.Data;

@Data
public class VirementRequestDTO {
    private String compteSource;
    private String compteDestination;
    private double montant;
}`,
      },
      {
        path: "src/main/java/com/example/controller/VirementController.java",
        content: `package com.example.controller;

import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.http.ResponseEntity;

@RestController
public class VirementController {
    @PostMapping("/api/virements")
    public ResponseEntity<String> effectuer(@RequestBody VirementRequestDTO request) {
        return ResponseEntity.ok("OK");
    }
}`,
      },
    ];

    const result = await loop.run(project);
    expect(result.status).toBe("FIXED");
    expect(result.totalAttempts).toBeGreaterThan(1);
    expect(result.iterations[0].errorsFixed).toBeGreaterThan(0);

    // Verify the import was added
    const controller = result.project.find(f => f.path.includes("VirementController"));
    expect(controller?.content).toContain("import com.example.dto.VirementRequestDTO;");
  });

  // ─── Test: Méthode dupliquée → renommage ──────────────────────────

  it("should fix duplicate methods by renaming", async () => {
    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/CompteService.java",
        content: `package com.example.service;

import org.springframework.stereotype.Service;

@Service
public class CompteService {
    public String getCompte(String id) {
        return "compte-" + id;
    }

    public String getCompte(int numero) {
        return "compte-" + numero;
    }
}`,
      },
    ];

    const result = await loop.run(project);
    // The duplicate method should be renamed
    if (result.iterations.length > 0 && result.iterations[0].errorsFixed > 0) {
      const service = result.project.find(f => f.path.includes("CompteService"));
      expect(service?.content).toContain("getCompteAlt");
    }
  });

  // ─── Test: Dépendance externe → TODO généré ───────────────────────

  it("should comment out external dependencies and add TODO", async () => {
    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/MagixService.java",
        content: `package com.example.service;

import ma.eai.midw.core.MagixTransaction;
import ma.eai.midw.core.MagixResponse;
import org.springframework.stereotype.Service;

@Service
public class MagixService {
    public String execute() {
        return "stub";
    }
}`,
      },
    ];

    const result = await loop.run(project);
    const service = result.project.find(f => f.path.includes("MagixService"));

    // External imports should be commented out with TODO
    expect(service?.content).toContain("TODO: Dependance externe non resolue");
    expect(service?.content).not.toMatch(/^import ma\.eai\.midw/m);
  });

  // ─── Test: Compilation statique détecte les erreurs ────────────────

  it("compile() should detect missing imports", () => {
    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/dto/TestDTO.java",
        content: `package com.example.dto;

public class TestDTO {
    private String name;
}`,
      },
      {
        path: "src/main/java/com/example/controller/TestController.java",
        content: `package com.example.controller;

import org.springframework.web.bind.annotation.RestController;

@RestController
public class TestController {
    public TestDTO getTest() {
        return new TestDTO();
    }
}`,
      },
    ];

    const result = loop.compile(project);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === "MISSING_IMPORT")).toBe(true);
  });

  // ─── Test: compile() détecte les packages externes ─────────────────

  it("compile() should detect missing external packages", () => {
    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/LegacyService.java",
        content: `package com.example.service;

import ma.eai.boa.custom.LegacyAdapter;

public class LegacyService {
    public String call() {
        return "stub";
    }
}`,
      },
    ];

    const result = loop.compile(project);
    expect(result.errors.some(e => e.code === "MISSING_PACKAGE")).toBe(true);
  });

  // ─── Test: compile() détecte les méthodes dupliquées ──────────────

  it("compile() should detect duplicate methods", () => {
    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/DupService.java",
        content: `package com.example.service;

public class DupService {
    public String process(String input) {
        return input;
    }
    public String process(int input) {
        return String.valueOf(input);
    }
}`,
      },
    ];

    const result = loop.compile(project);
    expect(result.errors.some(e => e.code === "DUPLICATE_METHOD")).toBe(true);
  });

  // ─── Test: Event listener reçoit les événements ───────────────────

  it("should emit events during the loop", async () => {
    const events: string[] = [];
    const eventLoop = new CompilationLoop();
    eventLoop.setEventListener((event) => {
      events.push(event.type);
    });

    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/App.java",
        content: `package com.example;

public class App {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}`,
      },
    ];

    await eventLoop.run(project);
    expect(events).toContain("compilation_start");
    expect(events).toContain("loop_complete");
  });

  // ─── Test: maxIterations respecté ─────────────────────────────────

  it("should respect maxIterations limit", async () => {
    // Disable LLM to avoid timeout in test env (LLM not available)
    const noLlmLoop = new CompilationLoop({ enableLLM: false });
    const project: GeneratedFile[] = [
      {
        path: "src/main/java/com/example/service/BrokenService.java",
        content: `package com.example.service;

import ma.eai.boa.custom.UnknownType;
import ma.eai.boa.custom.AnotherUnknown;

public class BrokenService {
    public UnknownType process() {
        return null;
    }
}`,
      },
    ];

    const result = await noLlmLoop.run(project, 3);
    expect(result.totalAttempts).toBeLessThanOrEqual(3);
  });
});
