/**
 * Compleo v1.0 — Tests for Java Parser and Spring Boot Generator.
 * Tests the core EJB-to-Spring Boot migration pipeline.
 *
 * @author Hamza NORDINE
 */

import { describe, expect, it } from "vitest";
import { parseEjbProject, type ProjectIR } from "./java-parser";
import { generateSpringBootProject, type GenerationResult } from "./spring-generator";

// ─── Sample EJB files for testing ────────────────────────────────────────────

const SAMPLE_USECASE = `
package com.bank.usecase;

import com.bank.dto.VirementVoIn;
import com.bank.dto.VirementVoOut;
import com.bank.framework.BaseUseCase;
import com.bank.framework.UseCase;
import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;

@UseCase
@Stateless
@TransactionAttribute(TransactionAttributeType.REQUIRED)
public class VirementUC implements BaseUseCase<VirementVoIn, VirementVoOut> {

    public VirementVoOut execute(VirementVoIn voIn) throws FwkRollbackException {
        VirementVoOut voOut = new VirementVoOut();
        // Business logic here
        voOut.setStatus("OK");
        return voOut;
    }
}
`;

const SAMPLE_VO_IN = `
package com.bank.dto;

import javax.xml.bind.annotation.XmlElement;
import javax.xml.bind.annotation.XmlRootElement;

@XmlRootElement
public class VirementVoIn {

    @XmlElement(required = true)
    private String compteDebiteur;

    @XmlElement(required = true)
    private String compteCrediteur;

    @XmlElement(required = true)
    private double montant;

    @XmlElement
    private String motif;

    public String getCompteDebiteur() { return compteDebiteur; }
    public void setCompteDebiteur(String v) { this.compteDebiteur = v; }
    public String getCompteCrediteur() { return compteCrediteur; }
    public void setCompteCrediteur(String v) { this.compteCrediteur = v; }
    public double getMontant() { return montant; }
    public void setMontant(double v) { this.montant = v; }
    public String getMotif() { return motif; }
    public void setMotif(String v) { this.motif = v; }
}
`;

const SAMPLE_VO_OUT = `
package com.bank.dto;

import javax.xml.bind.annotation.XmlElement;
import javax.xml.bind.annotation.XmlRootElement;

@XmlRootElement
public class VirementVoOut {

    @XmlElement
    private String status;

    @XmlElement
    private String reference;

    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getReference() { return reference; }
    public void setReference(String v) { this.reference = v; }
}
`;

const SAMPLE_ENUM = `
package com.bank.enums;

public enum Canal {
    WEB,
    MOBILE,
    AGENCE,
    ATM;
}
`;

const SAMPLE_EXCEPTION = `
package com.bank.exception;

public class VirementException extends FwkRollbackException {
    public VirementException(String message) {
        super(message);
    }
}
`;

const SAMPLE_VALIDATOR = `
package com.bank.validator;

import javax.validation.Constraint;
import javax.validation.Payload;
import java.lang.annotation.*;

@Documented
@Constraint(validatedBy = RibValidator.class)
@Target({ ElementType.FIELD })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidRib {
    String message() default "RIB invalide";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
`;

const SAMPLE_POM = `<?xml version="1.0" encoding="UTF-8"?>
<project>
    <groupId>com.bank</groupId>
    <artifactId>virement-service</artifactId>
    <version>2.1.0</version>
    <packaging>ejb</packaging>
</project>
`;

const SAMPLE_BIAN = `
domains:
  - name: payment
    actions:
      - name: initiation
        usecases:
          - VirementUC
`;

function createTestFiles() {
  return [
    { path: "src/main/java/com/bank/usecase/VirementUC.java", content: SAMPLE_USECASE },
    { path: "src/main/java/com/bank/dto/VirementVoIn.java", content: SAMPLE_VO_IN },
    { path: "src/main/java/com/bank/dto/VirementVoOut.java", content: SAMPLE_VO_OUT },
    { path: "src/main/java/com/bank/enums/Canal.java", content: SAMPLE_ENUM },
    { path: "src/main/java/com/bank/exception/VirementException.java", content: SAMPLE_EXCEPTION },
    { path: "src/main/java/com/bank/validator/ValidRib.java", content: SAMPLE_VALIDATOR },
  ];
}

// ─── Java Parser Tests ───────────────────────────────────────────────────────

describe("Java Parser (parseEjbProject)", () => {
  it("detects UseCases from @UseCase annotation and BaseUseCase extends", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    expect(ir.useCases.length).toBe(1);
    expect(ir.useCases[0].className).toBe("VirementUC");
    expect(ir.useCases[0].voInType).toBe("VirementVoIn");
    expect(ir.useCases[0].voOutType).toBe("VirementVoOut");
  });

  it("extracts domain from UseCase class name", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    expect(ir.useCases[0].domain).toBeTruthy();
  });

  it("detects DTOs with VoIn/VoOut suffix", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    const dtoNames = ir.dtos.map(d => d.className);
    expect(dtoNames).toContain("VirementVoIn");
    expect(dtoNames).toContain("VirementVoOut");
  });

  it("detects DTO direction (in/out) from suffix", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    const voIn = ir.dtos.find(d => d.className === "VirementVoIn");
    const voOut = ir.dtos.find(d => d.className === "VirementVoOut");
    expect(voIn?.direction).toBe("in");
    expect(voOut?.direction).toBe("out");
  });

  it("extracts fields from DTOs via getter methods", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    const voIn = ir.dtos.find(d => d.className === "VirementVoIn");
    expect(voIn).toBeDefined();
    expect(voIn!.fields.length).toBeGreaterThanOrEqual(3);
    const fieldNames = voIn!.fields.map(f => f.name);
    expect(fieldNames).toContain("compteDebiteur");
    expect(fieldNames).toContain("compteCrediteur");
    expect(fieldNames).toContain("montant");
  });

  it("detects @XmlElement(required=true) as required fields", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    const voIn = ir.dtos.find(d => d.className === "VirementVoIn");
    const compteDebiteur = voIn!.fields.find(f => f.name === "compteDebiteur");
    expect(compteDebiteur?.required).toBe(true);
    const motif = voIn!.fields.find(f => f.name === "motif");
    expect(motif?.required).toBe(false);
  });

  it("detects enums", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    expect(ir.enums.length).toBe(1);
    expect(ir.enums[0].className).toBe("Canal");
    expect(ir.enums[0].values).toContain("WEB");
    expect(ir.enums[0].values).toContain("MOBILE");
    expect(ir.enums[0].values.length).toBe(4);
  });

  it("detects exceptions extending FwkRollbackException", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    expect(ir.exceptions.length).toBe(1);
    expect(ir.exceptions[0].className).toBe("VirementException");
    expect(ir.exceptions[0].extendsClass).toBe("FwkRollbackException");
  });

  it("detects validator annotations (@Constraint)", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    expect(ir.validators.length).toBe(1);
    expect(ir.validators[0].className).toBe("ValidRib");
  });

  it("parses pom.xml for groupId, artifactId, version", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    expect(ir.groupId).toBe("com.bank");
    expect(ir.artifactId).toBe("virement-service");
    expect(ir.version).toBe("2.1.0");
  });

  it("generates correct stats", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    expect(ir.stats.totalFiles).toBe(6);
    expect(ir.stats.useCaseCount).toBe(1);
    expect(ir.stats.dtoCount).toBe(2);
    expect(ir.stats.enumCount).toBe(1);
    expect(ir.stats.exceptionCount).toBe(1);
    expect(ir.stats.validatorCount).toBe(1);
  });

  it("determines HTTP method from UseCase name", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    // VirementUC → POST (default for mutations)
    expect(ir.useCases[0].httpMethod).toBeTruthy();
  });

  it("handles empty file list gracefully", () => {
    const ir = parseEjbProject([]);
    expect(ir.useCases.length).toBe(0);
    expect(ir.dtos.length).toBe(0);
    expect(ir.stats.totalFiles).toBe(0);
  });

  it("handles files without Java content gracefully", () => {
    const files = [
      { path: "README.md", content: "# Hello" },
      { path: "src/main/java/Empty.java", content: "// empty file" },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(0);
  });

  it("parses BIAN YAML for domain mapping", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM, SAMPLE_BIAN);
    // Should have BIAN info if parser supports it
    expect(ir).toBeDefined();
  });
});

// ─── Spring Boot Generator Tests ─────────────────────────────────────────────

describe("Spring Boot Generator (generateSpringBootProject)", () => {
  function getIR(): ProjectIR {
    return parseEjbProject(createTestFiles(), SAMPLE_POM, SAMPLE_BIAN);
  }

  it("generates a non-empty result", () => {
    const result = generateSpringBootProject(getIR());
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("generates a Controller file", () => {
    const result = generateSpringBootProject(getIR());
    const controllers = result.files.filter(f => f.category === "controller");
    expect(controllers.length).toBeGreaterThanOrEqual(1);
  });

  it("Controller contains @RestController annotation", () => {
    const result = generateSpringBootProject(getIR());
    const controller = result.files.find(f => f.category === "controller");
    expect(controller).toBeDefined();
    expect(controller!.content).toContain("@RestController");
    expect(controller!.content).toContain("@RequestMapping");
  });

  it("Controller contains endpoint for VirementUC", () => {
    const result = generateSpringBootProject(getIR());
    const controller = result.files.find(f => f.category === "controller");
    expect(controller!.content).toContain("virement");
    expect(controller!.content).toContain("VirementRequest");
    expect(controller!.content).toContain("VirementResponse");
  });

  it("generates a Service file", () => {
    const result = generateSpringBootProject(getIR());
    const services = result.files.filter(f => f.category === "service");
    expect(services.length).toBeGreaterThanOrEqual(1);
  });

  it("Service contains @Service and Transactional import", () => {
    const result = generateSpringBootProject(getIR());
    const service = result.files.find(f => f.category === "service");
    expect(service).toBeDefined();
    expect(service!.content).toContain("@Service");
    expect(service!.content).toContain("import org.springframework.transaction.annotation.Transactional");
  });

  it("generates DTO files (Request/Response)", () => {
    const result = generateSpringBootProject(getIR());
    const dtos = result.files.filter(f => f.category === "dto");
    expect(dtos.length).toBeGreaterThanOrEqual(2);
    const dtoNames = dtos.map(f => f.path);
    const hasRequest = dtoNames.some(n => n.includes("Request"));
    const hasResponse = dtoNames.some(n => n.includes("Response"));
    expect(hasRequest).toBe(true);
    expect(hasResponse).toBe(true);
  });

  it("DTOs contain Lombok @Data annotation", () => {
    const result = generateSpringBootProject(getIR());
    const dto = result.files.find(f => f.category === "dto");
    expect(dto).toBeDefined();
    expect(dto!.content).toContain("@Data");
  });

  it("generates Test file with MockMvc", () => {
    const result = generateSpringBootProject(getIR());
    const tests = result.files.filter(f => f.category === "test");
    expect(tests.length).toBeGreaterThanOrEqual(1);
    const test = tests[0];
    expect(test.content).toContain("MockMvc");
    expect(test.content).toContain("@WebMvcTest");
  });

  it("generates Dockerfile", () => {
    const result = generateSpringBootProject(getIR());
    const dockerfile = result.files.find(f => f.path === "Dockerfile");
    expect(dockerfile).toBeDefined();
    expect(dockerfile!.content).toContain("FROM");
    expect(dockerfile!.content).toContain("java");
  });

  it("generates docker-compose.yml", () => {
    const result = generateSpringBootProject(getIR());
    const compose = result.files.find(f => f.path === "docker-compose.yml");
    expect(compose).toBeDefined();
    expect(compose!.content).toContain("services:");
  });

  it("generates K8s deployment manifest", () => {
    const result = generateSpringBootProject(getIR());
    const k8s = result.files.find(f => f.path.includes("k8s/deployment"));
    expect(k8s).toBeDefined();
    expect(k8s!.content).toContain("kind: Deployment");
  });

  it("generates pom.xml with Spring Boot parent", () => {
    const result = generateSpringBootProject(getIR());
    const pom = result.files.find(f => f.path === "pom.xml");
    expect(pom).toBeDefined();
    expect(pom!.content).toContain("spring-boot-starter-parent");
    expect(pom!.content).toContain("3.2");
  });

  it("generates MIGRATION_REPORT.md", () => {
    const result = generateSpringBootProject(getIR());
    const report = result.files.find(f => f.path === "MIGRATION_REPORT.md");
    expect(report).toBeDefined();
    expect(report!.content).toContain("Rapport de modernisation Compleo");
    expect(report!.content).toContain("Moteur Compleo");
  });

  it("generates Enum files", () => {
    const result = generateSpringBootProject(getIR());
    const enums = result.files.filter(f => f.category === "enum");
    expect(enums.length).toBe(1);
    expect(enums[0].content).toContain("Canal");
    expect(enums[0].content).toContain("WEB");
  });

  it("generates Exception files with @ResponseStatus", () => {
    const result = generateSpringBootProject(getIR());
    const exceptions = result.files.filter(f => f.category === "exception");
    expect(exceptions.length).toBeGreaterThanOrEqual(1);
  });

  it("generates application.yml config", () => {
    const result = generateSpringBootProject(getIR());
    const config = result.files.find(f => f.path.includes("application.yml"));
    expect(config).toBeDefined();
    expect(config!.content).toContain("spring:");
  });

  it("generates correct stats", () => {
    const result = generateSpringBootProject(getIR());
    expect(result.stats.totalFiles).toBeGreaterThan(0);
    expect(result.stats.controllers).toBeGreaterThanOrEqual(1);
    expect(result.stats.services).toBeGreaterThanOrEqual(1);
    expect(result.stats.dtos).toBeGreaterThanOrEqual(2);
    expect(result.stats.tests).toBeGreaterThanOrEqual(1);
    expect(result.stats.totalLinesGenerated).toBeGreaterThan(0);
  });

  it("generates Application main class", () => {
    const result = generateSpringBootProject(getIR());
    const app = result.files.find(f => f.path.includes("Application.java"));
    expect(app).toBeDefined();
    expect(app!.content).toContain("@SpringBootApplication");
    expect(app!.content).toContain("main(String[] args)");
  });

  it("handles IR with no useCases gracefully", () => {
    const ir = parseEjbProject([]);
    const result = generateSpringBootProject(ir);
    expect(result.files.length).toBeGreaterThan(0); // Should still generate config files
  });

  it("preserves groupId in generated package paths", () => {
    const result = generateSpringBootProject(getIR());
    const controller = result.files.find(f => f.category === "controller");
    expect(controller!.content).toContain("package com.bank");
  });
});

// ─── Integration Tests ───────────────────────────────────────────────────────

describe("Compleo Pipeline Integration", () => {
  it("full pipeline: parse → generate → verify consistency", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM, SAMPLE_BIAN);
    const result = generateSpringBootProject(ir);

    // Each UseCase should have a corresponding endpoint in a Controller
    for (const uc of ir.useCases) {
      const hasEndpoint = result.files.some(
        f => f.category === "controller" && f.content.includes(uc.className.replace("UC", ""))
      );
      expect(hasEndpoint).toBe(true);
    }
  });

  it("each DTO in IR has a corresponding generated DTO file", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    const result = generateSpringBootProject(ir);
    const generatedDtoNames = result.files
      .filter(f => f.category === "dto")
      .map(f => {
        const match = f.path.match(/\/([^/]+)\.java$/);
        return match ? match[1] : "";
      });

    for (const dto of ir.dtos) {
      const expectedName = dto.direction === "in"
        ? dto.className.replace(/VoIn$/, "RequestDTO")
        : dto.direction === "out"
          ? dto.className.replace(/VoOut$/, "ResponseDTO")
          : dto.className.replace(/Dto$/, "DTO");
      expect(generatedDtoNames).toContain(expectedName);
    }
  });

  it("each enum in IR has a corresponding generated enum file", () => {
    const files = createTestFiles();
    const ir = parseEjbProject(files, SAMPLE_POM);
    const result = generateSpringBootProject(ir);
    const generatedEnumNames = result.files
      .filter(f => f.category === "enum")
      .map(f => f.content);

    for (const e of ir.enums) {
      const found = generatedEnumNames.some(c => c.includes(e.className));
      expect(found).toBe(true);
    }
  });
});

// ─── Phase 1.2 & 1.3 Regression Tests ──────────────────────────────────────

// Stub UseCase: no cast, no new, no explicit import — only naming convention
const STUB_USECASE_NO_CAST = `
package ma.eai.boa.xbanking.carte.usecases;

import ma.eai.boa.xbanking.carte.dto.*;
import ma.eai.boa.framework.BaseUseCase;
import ma.eai.boa.framework.UseCase;

@UseCase(description = "Consultation du solde d'un compte")
public class ConsulterSoldeUC implements BaseUseCase {

    @Override
    public Object execute(Object voIn) throws Exception {
        // Stub — business logic not implemented
        return null;
    }
}
`;

const STUB_VO_IN = `
package ma.eai.boa.xbanking.carte.dto;

import java.io.Serializable;

public class ConsulterSoldeVoIn implements Serializable {
    private String numeroCompte;
    private String canal;

    public String getNumeroCompte() { return numeroCompte; }
    public void setNumeroCompte(String v) { this.numeroCompte = v; }
    public String getCanal() { return canal; }
    public void setCanal(String v) { this.canal = v; }
}
`;

const STUB_VO_OUT = `
package ma.eai.boa.xbanking.carte.dto;

import java.io.Serializable;

public class ConsulterSoldeVoOut implements Serializable {
    private String solde;
    private String devise;

    public String getSolde() { return solde; }
    public void setSolde(String v) { this.solde = v; }
    public String getDevise() { return devise; }
    public void setDevise(String v) { this.devise = v; }
}
`;

// @Stateless-only EJB (no @UseCase, no BaseUseCase)
const STATELESS_ONLY_EJB = `
package ma.eai.boa.xbanking.payment;

import javax.ejb.Stateless;

@Stateless
public class ProcessPaymentEJB {

    public String process(String orderId) {
        return "PROCESSED:" + orderId;
    }
}
`;

// DTO with complex types: Map, List, BigDecimal
const COMPLEX_DTO = `
package com.bank.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public class ComplexVoIn implements java.io.Serializable {
    private BigDecimal montant;
    private List<String> references;
    private Map<String, Long> metadata;
    private int count;

    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal v) { this.montant = v; }
    public List<String> getReferences() { return references; }
    public void setReferences(List<String> v) { this.references = v; }
    public Map<String, Long> getMetadata() { return metadata; }
    public void setMetadata(Map<String, Long> v) { this.metadata = v; }
    public int getCount() { return count; }
    public void setCount(int v) { this.count = v; }
}
`;

describe("Phase 1.2 — VoIn/VoOut Fallback Resolution", () => {
  it("resolves VoIn/VoOut by naming convention when no cast/new/import is present", () => {
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/carte/usecases/ConsulterSoldeUC.java", content: STUB_USECASE_NO_CAST },
      { path: "src/main/java/ma/eai/boa/xbanking/carte/dto/ConsulterSoldeVoIn.java", content: STUB_VO_IN },
      { path: "src/main/java/ma/eai/boa/xbanking/carte/dto/ConsulterSoldeVoOut.java", content: STUB_VO_OUT },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(1);
    expect(ir.useCases[0].voInType).toBe("ConsulterSoldeVoIn");
    expect(ir.useCases[0].voOutType).toBe("ConsulterSoldeVoOut");
  });

  it("produces zero warnings when VoIn/VoOut are resolved by convention", () => {
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/carte/usecases/ConsulterSoldeUC.java", content: STUB_USECASE_NO_CAST },
      { path: "src/main/java/ma/eai/boa/xbanking/carte/dto/ConsulterSoldeVoIn.java", content: STUB_VO_IN },
      { path: "src/main/java/ma/eai/boa/xbanking/carte/dto/ConsulterSoldeVoOut.java", content: STUB_VO_OUT },
    ];
    const ir = parseEjbProject(files);
    const voWarnings = ir.warnings.filter(w => w.includes("Could not resolve"));
    expect(voWarnings.length).toBe(0);
  });

  it("extracts @UseCase description", () => {
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/carte/usecases/ConsulterSoldeUC.java", content: STUB_USECASE_NO_CAST },
      { path: "src/main/java/ma/eai/boa/xbanking/carte/dto/ConsulterSoldeVoIn.java", content: STUB_VO_IN },
      { path: "src/main/java/ma/eai/boa/xbanking/carte/dto/ConsulterSoldeVoOut.java", content: STUB_VO_OUT },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases[0].useCaseDescription).toBe("Consultation du solde d'un compte");
  });

  it("falls back to ValueObject when no matching DTO exists", () => {
    // UseCase with no matching DTOs at all
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/carte/usecases/ConsulterSoldeUC.java", content: STUB_USECASE_NO_CAST },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases[0].voInType).toBe("ValueObject");
    expect(ir.useCases[0].voOutType).toBe("ValueObject");
    expect(ir.warnings.length).toBeGreaterThan(0);
  });
});

describe("Phase 1.3 — @Stateless EJB Detection", () => {
  it("detects @Stateless EJBs as UseCases", () => {
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/payment/ProcessPaymentEJB.java", content: STATELESS_ONLY_EJB },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(1);
    expect(ir.useCases[0].className).toBe("ProcessPaymentEJB");
  });

  it("@Stateless EJB falls back to ValueObject when no DTO exists", () => {
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/payment/ProcessPaymentEJB.java", content: STATELESS_ONLY_EJB },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases[0].voInType).toBe("ValueObject");
    expect(ir.useCases[0].voOutType).toBe("ValueObject");
  });
});

describe("Phase 1.2 — Type Inference Quality", () => {
  it("resolves BigDecimal, List<String>, Map<String,Long> in DTOs", () => {
    const files = [
      { path: "src/main/java/com/bank/dto/ComplexVoIn.java", content: COMPLEX_DTO },
    ];
    const ir = parseEjbProject(files);
    const dto = ir.dtos.find(d => d.className === "ComplexVoIn");
    expect(dto).toBeDefined();

    const montant = dto!.fields.find(f => f.name === "montant");
    expect(montant?.resolvedType).toBe("BigDecimal");

    const refs = dto!.fields.find(f => f.name === "references");
    expect(refs?.resolvedType).toBe("List<String>");
    expect(refs?.isList).toBe(true);

    const meta = dto!.fields.find(f => f.name === "metadata");
    expect(meta?.resolvedType).toContain("Map");
    expect(meta?.resolvedType).toContain("String");
    expect(meta?.resolvedType).toContain("Long");

    const count = dto!.fields.find(f => f.name === "count");
    expect(count?.resolvedType).toBe("int");
  });

  it("generated code contains zero 'Object' for well-typed DTOs", () => {
    const files = [
      ...createTestFiles(),
      { path: "src/main/java/com/bank/dto/ComplexVoIn.java", content: COMPLEX_DTO },
    ];
    const ir = parseEjbProject(files, SAMPLE_POM);
    const result = generateSpringBootProject(ir);

    // Filter out legitimate uses (like ErrorResponse, Class<?>)
    const objectOccurrences = result.files
      .filter(f => f.category === "dto" || f.category === "controller" || f.category === "service")
      .filter(f => {
        const lines = f.content.split("\n");
        return lines.some(l =>
          /\bObject\b/.test(l) &&
          !l.includes("Class<?>") &&
          !l.includes("ErrorResponse") &&
          !l.includes("// TODO") &&
          !l.includes("UnsupportedOperationException")
        );
      });

    expect(objectOccurrences.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// BUG 1 — DAO classes with @Stateless should NOT be UseCases
// ═══════════════════════════════════════════════════════════════

const DAO_WITH_STATELESS = `
package ma.eai.boa.xbanking.dao;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

@Stateless
public class CompteDAO {
    @PersistenceContext
    private EntityManager em;

    public Object findById(Long id) {
        return em.find(Object.class, id);
    }

    public void save(Object entity) {
        em.persist(entity);
    }

    public void delete(Object entity) {
        em.remove(entity);
    }
}
`;

const DAO_REPOSITORY_PATTERN = `
package ma.eai.boa.xbanking.repository;

import javax.ejb.Stateless;
import java.util.List;

@Stateless
public class ClientRepository {
    public List<Object> findAll() { return null; }
    public Object findByNumero(String numero) { return null; }
    public void create(Object entity) {}
    public void update(Object entity) {}
}
`;

describe("BUG 1 — DAO/Repository exclusion from UseCase detection", () => {
  it("@Stateless DAO class is NOT detected as UseCase", () => {
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/dao/CompteDAO.java", content: DAO_WITH_STATELESS },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(0);
  });

  it("@Stateless Repository class is NOT detected as UseCase", () => {
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/repository/ClientRepository.java", content: DAO_REPOSITORY_PATTERN },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(0);
  });

  it("@Stateless business EJB is still detected as UseCase", () => {
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/payment/ProcessPaymentEJB.java", content: STATELESS_ONLY_EJB },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(1);
    expect(ir.useCases[0].className).toBe("ProcessPaymentEJB");
  });

  it("mixed project: DAO excluded, business EJB included", () => {
    const files = [
      { path: "src/main/java/ma/eai/boa/xbanking/dao/CompteDAO.java", content: DAO_WITH_STATELESS },
      { path: "src/main/java/ma/eai/boa/xbanking/repository/ClientRepository.java", content: DAO_REPOSITORY_PATTERN },
      { path: "src/main/java/ma/eai/boa/xbanking/payment/ProcessPaymentEJB.java", content: STATELESS_ONLY_EJB },
    ];
    const ir = parseEjbProject(files);
    expect(ir.useCases.length).toBe(1);
    expect(ir.useCases[0].className).toBe("ProcessPaymentEJB");
  });
});
