/**
 * Tests de régression v8.5 — UseCase DTO Generator + Legacy Type Replacer enrichi.
 *
 * Couvre :
 *   - extractInputFields() : extraction des champs d'entrée depuis rawSource
 *   - extractOutputFields() : extraction des champs de sortie depuis rawSource
 *   - deriveBaseName() : dérivation du nom de base pour les DTOs
 *   - generateMissingDtos() : génération des DTOs manquants pour les UseCases
 *   - replaceLegacyTypes() v8.5 : HashMap fallback → DTOs typés
 *   - hasLegacyTypes() v8.5 : détection du hasHashMapFallback
 *   - Intégration : les DTOs générés sont correctement enregistrés dans le dtoMap
 *
 * @author Hamza NORDINE
 */

import { describe, it, expect } from "vitest";
import {
  extractInputFields,
  extractOutputFields,
  deriveBaseName,
  generateMissingDtos,
} from "../../server/engine/transformer/usecase-dto-generator";
import {
  replaceLegacyTypes,
  hasLegacyTypes,
} from "../../server/engine/transformer/legacy-type-replacer";
import type { UseCaseIR, DtoIR } from "../../server/java-parser";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeUseCase(overrides: Partial<UseCaseIR> & { className: string }): UseCaseIR {
  return {
    className: overrides.className,
    packageName: overrides.packageName ?? "com.example",
    voInType: overrides.voInType ?? "",
    voOutType: overrides.voOutType ?? "",
    domain: overrides.domain ?? "test",
    bianDomain: overrides.bianDomain ?? "",
    bianAction: overrides.bianAction ?? "",
    injectedServices: overrides.injectedServices ?? [],
    transactional: overrides.transactional ?? null,
    rawSource: overrides.rawSource ?? "",
    isFromHandlerPattern: overrides.isFromHandlerPattern ?? false,
  };
}

// ─── extractInputFields ─────────────────────────────────────────────────────

describe("v8.5 — extractInputFields", () => {
  it("should extract fields from voIn.getNodeAsString patterns", () => {
    const source = `
      public ValueObject execute(ValueObject voIn) {
        String numCompte = voIn.getNodeAsString("numCompte");
        Long idClient = voIn.getNodeAsLong("idClient");
        BigDecimal montant = voIn.getNodeAsBigDecimal("montant");
        String dateOperation = voIn.getNodeAsDate("dateOperation");
      }
    `;
    const fields = extractInputFields(source);
    expect(fields.length).toBeGreaterThanOrEqual(4);

    const numCompte = fields.find(f => f.name === "numCompte");
    expect(numCompte).toBeDefined();
    expect(numCompte!.type).toBe("String");

    const idClient = fields.find(f => f.name === "idClient");
    expect(idClient).toBeDefined();
    expect(idClient!.type).toBe("Long");

    const montant = fields.find(f => f.name === "montant");
    expect(montant).toBeDefined();
    expect(montant!.type).toBe("BigDecimal");

    const dateOp = fields.find(f => f.name === "dateOperation");
    expect(dateOp).toBeDefined();
    expect(dateOp!.type).toBe("LocalDate");
  });

  it("should extract fields from voIn.getXxx() getter patterns", () => {
    const source = `
      public void execute(ValueObject voIn) {
        String code = voIn.getCodeAgence();
        String nom = voIn.getNomClient();
      }
    `;
    const fields = extractInputFields(source);
    expect(fields.length).toBeGreaterThanOrEqual(2);

    const codeAgence = fields.find(f => f.name === "codeAgence");
    expect(codeAgence).toBeDefined();

    const nomClient = fields.find(f => f.name === "nomClient");
    expect(nomClient).toBeDefined();
  });

  it("should extract fields from envelope.getNodeAsString patterns", () => {
    const source = `
      public Envelope process(Envelope envelopeIn) {
        String rib = envelopeIn.getNodeAsString("rib");
        String iban = envelopeIn.getNodeAsString("iban");
      }
    `;
    const fields = extractInputFields(source);
    expect(fields.length).toBeGreaterThanOrEqual(2);
    expect(fields.find(f => f.name === "rib")).toBeDefined();
    expect(fields.find(f => f.name === "iban")).toBeDefined();
  });

  it("should extract fields from method parameters (non-ValueObject)", () => {
    const source = `
      public void execute(String numCompte, BigDecimal montant, Long idClient) {
        // business logic
      }
    `;
    const fields = extractInputFields(source);
    expect(fields.length).toBeGreaterThanOrEqual(3);
    expect(fields.find(f => f.name === "numCompte")?.type).toBe("String");
    expect(fields.find(f => f.name === "montant")?.type).toBe("BigDecimal");
    expect(fields.find(f => f.name === "idClient")?.type).toBe("Long");
  });

  it("should return empty array for empty source", () => {
    expect(extractInputFields("")).toEqual([]);
    expect(extractInputFields(null as any)).toEqual([]);
  });

  it("should deduplicate fields extracted from multiple patterns", () => {
    const source = `
      public ValueObject execute(ValueObject voIn) {
        String numCompte = voIn.getNodeAsString("numCompte");
        String num2 = voIn.getNumCompte();
      }
    `;
    const fields = extractInputFields(source);
    const numCompteFields = fields.filter(f => f.name === "numCompte");
    expect(numCompteFields.length).toBe(1); // deduplicated
  });
});

// ─── extractOutputFields ────────────────────────────────────────────────────

describe("v8.5 — extractOutputFields", () => {
  it("should extract fields from voOut.setNodeValue patterns", () => {
    const source = `
      public ValueObject execute(ValueObject voIn) {
        ValueObject voOut = new ValueObject();
        voOut.setNodeValue("solde", solde);
        voOut.setNodeValue("devise", "MAD");
        voOut.setNodeValue("dateValeur", dateValeur);
      }
    `;
    const fields = extractOutputFields(source);
    expect(fields.find(f => f.name === "solde")).toBeDefined();
    expect(fields.find(f => f.name === "devise")).toBeDefined();
    expect(fields.find(f => f.name === "dateValeur")).toBeDefined();
  });

  it("should extract fields from voOut.setXxx() setter patterns", () => {
    const source = `
      public ValueObject execute(ValueObject voIn) {
        ValueObject voOut = new ValueObject();
        voOut.setCodeRetour("000");
        voOut.setMessageRetour("OK");
        voOut.setSoldeDisponible(solde);
      }
    `;
    const fields = extractOutputFields(source);
    expect(fields.find(f => f.name === "codeRetour")).toBeDefined();
    expect(fields.find(f => f.name === "messageRetour")).toBeDefined();
    expect(fields.find(f => f.name === "soldeDisponible")).toBeDefined();
  });

  it("should always include codeRetour and messageRetour as standard fields", () => {
    const source = `
      public void execute() {
        // no explicit output fields
      }
    `;
    const fields = extractOutputFields(source);
    expect(fields.find(f => f.name === "codeRetour")).toBeDefined();
    expect(fields.find(f => f.name === "messageRetour")).toBeDefined();
  });

  it("should extract fields from builder pattern", () => {
    const source = `
      public ResponseDTO execute() {
        return ResponseDTO.builder()
          .solde(soldeCalcule)
          .devise("MAD")
          .build();
      }
    `;
    const fields = extractOutputFields(source);
    expect(fields.find(f => f.name === "solde")).toBeDefined();
    expect(fields.find(f => f.name === "devise")).toBeDefined();
  });
});

// ─── deriveBaseName ─────────────────────────────────────────────────────────

describe("v8.5 — deriveBaseName", () => {
  it("should strip UC suffix", () => {
    expect(deriveBaseName("ConsulterSoldeUC")).toBe("ConsulterSolde");
  });

  it("should strip UseCase suffix", () => {
    expect(deriveBaseName("ConsulterSoldeUseCase")).toBe("ConsulterSolde");
  });

  it("should strip Handler suffix", () => {
    expect(deriveBaseName("TraitementMadHandler")).toBe("TraitementMad");
  });

  it("should strip EJB suffix", () => {
    expect(deriveBaseName("CompteEJB")).toBe("Compte");
  });

  it("should use method name for underscore pattern", () => {
    expect(deriveBaseName("CompteEJB_consulterSolde")).toBe("ConsulterSolde");
  });

  it("should capitalize method name from handler pattern", () => {
    expect(deriveBaseName("InitierVirementHandler_initierVirement")).toBe("InitierVirement");
  });
});

// ─── generateMissingDtos ────────────────────────────────────────────────────

describe("v8.5 — generateMissingDtos", () => {
  it("should generate RequestDTO and ResponseDTO for UseCase without DTOs", () => {
    const uc = makeUseCase({
      className: "ConsulterSoldeUC",
      rawSource: `
        public ValueObject execute(ValueObject voIn) {
          String numCompte = voIn.getNodeAsString("numCompte");
          String codeAgence = voIn.getNodeAsString("codeAgence");
          ValueObject voOut = new ValueObject();
          voOut.setNodeValue("solde", solde);
          voOut.setNodeValue("devise", "MAD");
        }
      `,
    });

    const dtoMap = new Map<string, DtoIR>();
    const result = generateMissingDtos([uc], dtoMap, "com.example", "src/main/java/com/example");

    expect(result.stats.dtosGenerated).toBeGreaterThanOrEqual(2);
    expect(result.files.length).toBeGreaterThanOrEqual(2);

    // Check that RequestDTO was generated
    const reqFile = result.files.find(f => f.path.includes("RequestDTO"));
    expect(reqFile).toBeDefined();
    expect(reqFile!.content).toContain("numCompte");
    expect(reqFile!.content).toContain("codeAgence");

    // Check that ResponseDTO was generated
    const resFile = result.files.find(f => f.path.includes("ResponseDTO"));
    expect(resFile).toBeDefined();
    expect(resFile!.content).toContain("solde");
    expect(resFile!.content).toContain("devise");
  });

  it("should skip UseCases that already have DTOs in dtoMap", () => {
    const existingDto: DtoIR = {
      className: "ConsulterSoldeVoIn",
      packageName: "com.example.dto",
      direction: "in",
      xmlRootElement: "",
      implementsInterfaces: [],
      sourceFile: "existing.java",
      fields: [{ name: "numCompte", type: "String", resolvedType: "String", required: true, xmlElement: false, validationAnnotations: [], isEnum: false, isList: false }],
    };

    const uc = makeUseCase({
      className: "ConsulterSoldeUC",
      voInType: "ConsulterSoldeVoIn",
      voOutType: "ConsulterSoldeVoOut",
      rawSource: `public ValueObject execute(ValueObject voIn) { }`,
    });

    const dtoMap = new Map<string, DtoIR>();
    dtoMap.set("ConsulterSoldeVoIn", existingDto);
    dtoMap.set("ConsulterSoldeVoOut", existingDto);

    const result = generateMissingDtos([uc], dtoMap, "com.example", "src/main/java/com/example");
    expect(result.stats.dtosGenerated).toBe(0);
  });

  it("should register generated DTOs in dtoMap for downstream consumers", () => {
    const uc = makeUseCase({
      className: "VirementUC",
      rawSource: `
        public ValueObject execute(ValueObject voIn) {
          String rib = voIn.getNodeAsString("rib");
          voOut.setNodeValue("reference", ref);
        }
      `,
    });

    const dtoMap = new Map<string, DtoIR>();
    generateMissingDtos([uc], dtoMap, "com.example", "src/main/java/com/example");

    // dtoMap should now contain the generated DTOs
    expect(dtoMap.size).toBeGreaterThanOrEqual(2);
    const reqDto = [...dtoMap.values()].find(d => d.className.includes("RequestDTO"));
    expect(reqDto).toBeDefined();
    const resDto = [...dtoMap.values()].find(d => d.className.includes("ResponseDTO"));
    expect(resDto).toBeDefined();
  });

  it("should generate DTOs with Bean Validation annotations for RequestDTO", () => {
    const uc = makeUseCase({
      className: "CreerCompteUC",
      rawSource: `
        public ValueObject execute(ValueObject voIn) {
          String codeAgence = voIn.getNodeAsString("codeAgence");
          String nomClient = voIn.getNodeAsString("nomClient");
          BigDecimal montantInitial = voIn.getNodeAsBigDecimal("montantInitial");
        }
      `,
    });

    const dtoMap = new Map<string, DtoIR>();
    const result = generateMissingDtos([uc], dtoMap, "com.example", "src/main/java/com/example");

    const reqFile = result.files.find(f => f.path.includes("RequestDTO"));
    expect(reqFile).toBeDefined();
    // codeAgence should have @NotNull and @NotBlank
    expect(reqFile!.content).toContain("@NotNull");
    expect(reqFile!.content).toContain("@NotBlank");
    // montantInitial should have @Positive
    expect(reqFile!.content).toContain("@Positive");
  });

  it("should handle handler pattern classNames correctly", () => {
    const uc = makeUseCase({
      className: "TraitementMadHandler_traiterMad",
      isFromHandlerPattern: true,
      rawSource: `
        public Envelope process(Envelope envelopeIn) {
          String numDossier = envelopeIn.getNodeAsString("numDossier");
          envelopeOut.setNodeValue("statut", "OK");
        }
      `,
    });

    const dtoMap = new Map<string, DtoIR>();
    const result = generateMissingDtos([uc], dtoMap, "com.example", "src/main/java/com/example");

    const reqFile = result.files.find(f => f.path.includes("RequestDTO"));
    expect(reqFile).toBeDefined();
    expect(reqFile!.path).toContain("TraiterMadRequestDTO");
  });
});

// ─── replaceLegacyTypes v8.5 ────────────────────────────────────────────────

describe("v8.5 — replaceLegacyTypes enrichi", () => {
  it("should replace HashMap fallback with typed DTO builder", () => {
    const code = `ConsulterSoldeResponseDTO response = new HashMap<>();`;
    const result = replaceLegacyTypes(code, {
      className: "ConsulterSoldeUC",
      requestDto: "ConsulterSoldeRequestDTO",
      responseDto: "ConsulterSoldeResponseDTO",
    });
    expect(result).toContain("ConsulterSoldeResponseDTO.builder().build()");
    expect(result).not.toContain("HashMap");
  });

  it("should replace return new HashMap<>() with typed builder", () => {
    const code = `return new HashMap<>();`;
    const result = replaceLegacyTypes(code, {
      className: "ConsulterSoldeUC",
      requestDto: "ConsulterSoldeRequestDTO",
      responseDto: "ConsulterSoldeResponseDTO",
    });
    expect(result).toContain("ConsulterSoldeResponseDTO.builder().build()");
    expect(result).not.toContain("HashMap");
  });

  it("should replace List<ValueObject> with List<ResponseDTO>", () => {
    const code = `List<ValueObject> results = new ArrayList<>();`;
    const result = replaceLegacyTypes(code, {
      className: "ListerComptesUC",
      requestDto: "ListerComptesRequestDTO",
      responseDto: "ListerComptesResponseDTO",
    });
    expect(result).toContain("List<ListerComptesResponseDTO>");
    expect(result).not.toContain("List<ValueObject>");
  });

  it("should replace instanceof ValueObject with instanceof ResponseDTO", () => {
    const code = `if (obj instanceof ValueObject) { }`;
    const result = replaceLegacyTypes(code, {
      className: "TestUC",
      requestDto: "TestRequestDTO",
      responseDto: "TestResponseDTO",
    });
    expect(result).toContain("instanceof TestResponseDTO");
    expect(result).not.toContain("instanceof ValueObject");
  });

  it("should still work without UseCase context (generic fallback)", () => {
    const code = `ValueObject vo = new ValueObject();`;
    const result = replaceLegacyTypes(code);
    expect(result).toContain("new HashMap<>()");
    // ValueObject type name should remain since no context to replace it
    expect(result).toContain("ValueObject vo");
  });
});

// ─── hasLegacyTypes v8.5 ───────────────────────────────────────────────────

describe("v8.5 — hasLegacyTypes enrichi", () => {
  it("should detect HashMap fallback", () => {
    const result = hasLegacyTypes(`ResponseDTO response = new HashMap<>();`);
    expect(result.hasHashMapFallback).toBe(true);
    expect(result.totalReferences).toBeGreaterThanOrEqual(1);
  });

  it("should detect all legacy types", () => {
    const code = `
      ValueObject voIn = new ValueObject();
      Envelope env = new Envelope();
      BaseUseCase base = null;
      Map m = new HashMap<>();
    `;
    const result = hasLegacyTypes(code);
    expect(result.hasValueObject).toBe(true);
    expect(result.hasEnvelope).toBe(true);
    expect(result.hasBaseUseCase).toBe(true);
    expect(result.hasHashMapFallback).toBe(true);
    expect(result.totalReferences).toBeGreaterThanOrEqual(4);
  });

  it("should return all false for clean Spring code", () => {
    const code = `
      ConsulterSoldeRequestDTO request = ConsulterSoldeRequestDTO.builder().build();
      ConsulterSoldeResponseDTO response = service.consulterSolde(request);
    `;
    const result = hasLegacyTypes(code);
    expect(result.hasValueObject).toBe(false);
    expect(result.hasEnvelope).toBe(false);
    expect(result.hasBaseUseCase).toBe(false);
    expect(result.hasHashMapFallback).toBe(false);
    expect(result.totalReferences).toBe(0);
  });
});
