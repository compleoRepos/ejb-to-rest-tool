/**
 * Tests de régression v8.4 — Support Framework EAI / UCStrategie / Handlers
 * 7 bugs systématiques corrigés sur tous les projets EAI BOA.
 *
 * @author Hamza NORDINE
 */
import { describe, it, expect } from "vitest";

// STEP 1: source-filter
import { isTestFile, filterTestFiles } from "../../server/engine/detectors/source-filter";

// STEP 3+4: eai-framework-transformer
import {
  transformEaiFrameworkReferences,
  hasEaiFrameworkReferences,
} from "../../server/engine/transformer/eai-framework-transformer";

// STEP 5: legacy-type-replacer
import {
  replaceLegacyTypes,
  hasLegacyTypes,
} from "../../server/engine/transformer/legacy-type-replacer";

// STEP 6: field-name-normalizer
import {
  extractInjectedFields,
  normalizeFieldReferences,
  findOrphanVariables,
} from "../../server/engine/transformer/field-name-normalizer";

// STEP 7: facade-detector
import {
  isFacadeEjb,
  shouldGenerateService,
  filterFacadeUseCases,
} from "../../server/engine/detectors/facade-detector";

// ═══ STEP 1 — Filtrer les fichiers de test ═══

describe("v8.4 STEP 1 — source-filter", () => {
  it("détecte les fichiers de test par nom (*Test.java)", () => {
    expect(isTestFile("src/test/java/ActiverCarteUCTest.java")).toBe(true);
    expect(isTestFile("src/main/java/ActiverCarteUCTest.java")).toBe(true);
    expect(isTestFile("src/main/java/ActiverCarteUC.java")).toBe(false);
  });

  it("détecte les fichiers de test par répertoire (src/test/)", () => {
    expect(isTestFile("src/test/java/com/example/Service.java")).toBe(true);
    expect(isTestFile("src/main/java/com/example/Service.java")).toBe(false);
  });

  it("détecte les fichiers Mock/Stub/Fake", () => {
    expect(isTestFile("src/main/java/MockService.java")).toBe(true);
    expect(isTestFile("src/main/java/StubDao.java")).toBe(true);
    expect(isTestFile("src/main/java/FakeRepository.java")).toBe(true);
  });

  it("filtre correctement un ensemble de fichiers", () => {
    const files = [
      { path: "src/main/java/Service.java", content: "class Service {}" },
      { path: "src/test/java/ServiceTest.java", content: "class ServiceTest {}" },
      { path: "src/main/java/MockHelper.java", content: "class MockHelper {}" },
      { path: "src/main/java/Controller.java", content: "class Controller {}" },
    ];
    const { filtered, testCount } = filterTestFiles(files);
    expect(testCount).toBe(2);
    expect(filtered).toHaveLength(2);
    expect(filtered.map(f => f.path)).toEqual([
      "src/main/java/Service.java",
      "src/main/java/Controller.java",
    ]);
  });
});

// ═══ STEP 3+4 — EAI Framework Transformer ═══

describe("v8.4 STEP 3 — EaiLog → @Slf4j log", () => {
  it("remplace EaiLog.info() par log.info()", () => {
    const input = `EaiLog.info("=== Starting Process ===");`;
    const output = transformEaiFrameworkReferences(input);
    expect(output).toContain('log.info("=== Starting Process ===")');
    expect(output).not.toContain("EaiLog");
  });

  it("remplace toutes les variantes de logging EAI", () => {
    const input = `
      EaiLog.info("info");
      EaiLog.error("error", e);
      EaiLog.debug("debug");
      EaiLog.warn("warn");
      Log.info("legacy info");
      Log.error("legacy error");
    `;
    const output = transformEaiFrameworkReferences(input);
    expect(output).not.toContain("EaiLog.");
    expect(output).not.toMatch(/\bLog\.(info|error)\(/);
    expect(output).toContain("log.info(");
    expect(output).toContain("log.error(");
  });

  it("supprime les appels d'initialisation EAI", () => {
    const input = `
      EaiLog.initLogTraceInfos(env);
      EaiLog.setNewThreadId();
      log.info("real code");
    `;
    const output = transformEaiFrameworkReferences(input);
    expect(output).not.toContain("initLogTraceInfos");
    expect(output).not.toContain("setNewThreadId");
    expect(output).toContain('log.info("real code")');
  });

  it("supprime les imports EAI", () => {
    const input = `import ma.eai.ingdev.fwk.logging.EaiLog;
import ma.eai.midw.log.Log;
import ma.eai.commons.services.parsing.Envelope;
import ma.eai.commons.services.parsing.Parser;
import org.springframework.stereotype.Service;`;
    const output = transformEaiFrameworkReferences(input);
    expect(output).not.toMatch(/import\s+ma\.eai\./);
    expect(output).toContain("import org.springframework.stereotype.Service;");
  });
});

describe("v8.4 STEP 4 — FwkRollbackException + SessionContext", () => {
  it("supprime FwkRollbackException des annotations @Transactional", () => {
    const input = `@Transactional(rollbackFor = FwkRollbackException.class)`;
    const output = transformEaiFrameworkReferences(input);
    expect(output).not.toContain("FwkRollbackException");
    expect(output).toContain("@Transactional");
  });

  it("remplace sctx.setRollbackOnly() par throw RuntimeException", () => {
    const input = `sctx.setRollbackOnly();`;
    const output = transformEaiFrameworkReferences(input);
    expect(output).toContain('throw new RuntimeException("Transaction rollback forced")');
    expect(output).not.toContain("sctx.setRollbackOnly()");
  });

  it("hasEaiFrameworkReferences détecte correctement les références", () => {
    const code = `EaiLog.info("test"); sctx.setRollbackOnly(); FwkRollbackException`;
    const result = hasEaiFrameworkReferences(code);
    expect(result.hasEaiLog).toBe(true);
    expect(result.hasSessionContext).toBe(true);
    expect(result.hasFwkRollback).toBe(true);
    expect(result.totalReferences).toBeGreaterThanOrEqual(3);
  });
});

// ═══ STEP 5 — ValueObject/Envelope → DTOs ═══

describe("v8.4 STEP 5 — legacy-type-replacer", () => {
  it("remplace ValueObject dans les signatures de méthodes", () => {
    const input = `public ValueObject execute(ValueObject voIn)`;
    const output = replaceLegacyTypes(input, {
      className: "ActiverCarteUC",
      requestDto: "ActiverCarteRequestDTO",
      responseDto: "ActiverCarteResponseDTO",
    });
    expect(output).toContain("ActiverCarteResponseDTO");
    expect(output).toContain("ActiverCarteRequestDTO");
    expect(output).not.toContain("ValueObject");
  });

  it("remplace Envelope dans les signatures de méthodes", () => {
    const input = `public Envelope process(Envelope envelopeIn)`;
    const output = replaceLegacyTypes(input, {
      className: "TraitementMadUC",
      requestDto: "TraitementMadRequestDTO",
      responseDto: "TraitementMadResponseDTO",
    });
    expect(output).toContain("TraitementMadResponseDTO");
    expect(output).toContain("TraitementMadRequestDTO");
    expect(output).not.toContain("Envelope");
  });

  it("supprime les imports legacy", () => {
    const input = `import com.example.ValueObject;\nimport ma.eai.Envelope;\nimport org.springframework.stereotype.Service;`;
    const output = replaceLegacyTypes(input);
    expect(output).not.toContain("ValueObject");
    expect(output).not.toContain("Envelope");
    expect(output).toContain("import org.springframework.stereotype.Service;");
  });

  it("hasLegacyTypes détecte correctement", () => {
    const result = hasLegacyTypes("ValueObject vo = new ValueObject(); Envelope env;");
    expect(result.hasValueObject).toBe(true);
    expect(result.hasEnvelope).toBe(true);
    expect(result.totalReferences).toBeGreaterThanOrEqual(3);
  });
});

// ═══ STEP 6 — Normalisation des noms de variables ═══

describe("v8.4 STEP 6 — field-name-normalizer", () => {
  it("extrait les champs injectés d'un service", () => {
    const code = `
      private final AuthentificationService authentificationService;
      private final XbankingService xbankingService;
    `;
    const fields = extractInjectedFields(code);
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe("authentificationService");
    expect(fields[1].name).toBe("xbankingService");
  });

  it("normalise les variantes raccourcies vers les champs injectés", () => {
    const code = `
      private final AuthentificationService authentificationService;
      authentification.getValidToken();
      authentification.checkSession();
    `;
    const output = normalizeFieldReferences(code);
    expect(output).toContain("authentificationService.getValidToken()");
    expect(output).toContain("authentificationService.checkSession()");
    expect(output).not.toMatch(/\bauthentification\.get/);
  });

  it("ne modifie pas les noms déjà corrects", () => {
    const code = `
      private final AuthentificationService authentificationService;
      authentificationService.getValidToken();
    `;
    const output = normalizeFieldReferences(code);
    expect(output).toContain("authentificationService.getValidToken()");
  });

  it("détecte les variables orphelines", () => {
    const code = `
      private final AuthentificationService authentificationService;
      orphanVar.doSomething();
      authentificationService.getToken();
    `;
    const orphans = findOrphanVariables(code);
    expect(orphans).toContain("orphanVar");
    expect(orphans).not.toContain("authentificationService");
  });
});

// ═══ STEP 7 — Façade EJB Detector ═══

describe("v8.4 STEP 7 — facade-detector", () => {
  it("détecte une façade UCStrategie", () => {
    const cls = {
      className: "ActivationCarteBmcedirectBean",
      sourceCode: `public class ActivationCarteBmcedirectBean extends UCStrategie {
        public Envelope process(Envelope env) { return super.process(env); }
      }`,
    };
    expect(isFacadeEjb(cls)).toBe(true);
    expect(shouldGenerateService(cls)).toBe(false);
  });

  it("détecte une façade avec Factory dispatch", () => {
    const cls = {
      className: "MadServicesBean",
      sourceCode: `public class MadServicesBean {
        public void process(String action) {
          ActionHandler handler = ActionHandlerFactory.getHandler(action);
          handler.handle();
        }
      }`,
    };
    expect(isFacadeEjb(cls)).toBe(true);
  });

  it("ne détecte PAS un service normal", () => {
    const cls = {
      className: "XbankingService",
      sourceCode: `public class XbankingService {
        public void activerCarte(String numCarte) {
          // logique métier réelle
          dao.findByCarte(numCarte);
          service.callExternalApi();
        }
      }`,
    };
    expect(isFacadeEjb(cls)).toBe(false);
    expect(shouldGenerateService(cls)).toBe(true);
  });

  it("filtre les façades d'un ensemble de UseCases", () => {
    const useCases = [
      { className: "ActiverCarteUC", rawSource: "class ActiverCarteUC { public void execute() {} }" },
      { className: "FacadeBean", rawSource: "class FacadeBean extends UCStrategie { public void process() { super.process(); } }" },
    ];
    const { filtered, excludedFacades } = filterFacadeUseCases(useCases);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].className).toBe("ActiverCarteUC");
    expect(excludedFacades).toContain("FacadeBean");
  });
});
