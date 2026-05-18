/**
 * Tests unitaires — GenerationService v9.0
 *
 * Vérifie :
 *   - Les prompts enrichis avec les patterns appris du dataset 27K
 *   - La validation du code généré (signature, anti-patterns, imports)
 *   - Le fallback code quand la confiance est trop basse
 *   - Le boost de confiance pour le modèle fine-tuné
 *   - Les méthodes statiques (getSupportedTechnologies, getLearnedPatterns)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerationService } from "./generation-service";
import type { EJBSignature } from "./ml-enhancer";
import type { MigrationPair } from "./embedding-service";

// Mock llm-adapter
vi.mock("./llm-adapter", () => ({
  llmGenerateCodeWithBackend: vi.fn(),
  llmGenerateCode: vi.fn(),
}));

import { llmGenerateCodeWithBackend } from "./llm-adapter";
const mockedLLMGenerate = vi.mocked(llmGenerateCodeWithBackend);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Fixtures ────────────────────────────────────────────────────

const ejbSignature: EJBSignature = {
  methodName:  "findAccountByClientId",
  params:      [{ name: "clientId", type: "String" }],
  returnType:  "AccountVO",
  className:   "AccountServiceBean",
  javaType:    "EJB3X",
};

const servletSignature: EJBSignature = {
  methodName:  "doGet",
  params:      [{ name: "request", type: "HttpServletRequest" }, { name: "response", type: "HttpServletResponse" }],
  returnType:  "void",
  className:   "OrderServlet",
  javaType:    "SERVLET",
};

const jdbcSignature: EJBSignature = {
  methodName:  "findActiveAccounts",
  params:      [{ name: "clientId", type: "String" }],
  returnType:  "List<Account>",
  className:   "AccountDAO",
  javaType:    "JDBC",
};

const hibernateSignature: EJBSignature = {
  methodName:  "getCustomerOrders",
  params:      [{ name: "customerId", type: "Long" }],
  returnType:  "List<Order>",
  className:   "OrderHibernateDAO",
  javaType:    "HIBERNATE",
};

const sampleEjbCode = `@Stateless
public class AccountServiceBean {
    @EJB
    private AccountDAO accountDAO;
    public AccountVO findAccountByClientId(String clientId) {
        return accountDAO.findByClientId(clientId);
    }
}`;

const sampleRuleBasedCode = `@Service
@Transactional
public class AccountService {
    public AccountVO findAccountByClientId(String clientId) {
        return accountRepository.findByClientId(clientId);
    }
}`;

const sampleSimilarExamples: MigrationPair[] = [
  {
    id: "example-1",
    ejbCode: "@Stateless public class SampleBean { }",
    springCode: "@Service public class SampleService { }",
    meta: {
      className: "SampleBean",
      methodName: "process",
      javaType: "EJB3X",
      hasOracle: false,
      hasJms: false,
    },
  },
];

// ── Tests ───────────────────────────────────────────────────────

describe("GenerationService v9.0", () => {

  describe("buildDetailedPrompt", () => {
    const service = new GenerationService("http://localhost:11434", "ejb-modernizer");

    it("should include EJB signature section in the prompt", () => {
      const prompt = service.buildDetailedPrompt(
        sampleEjbCode, sampleRuleBasedCode, [], ejbSignature
      );

      expect(prompt).toContain("Signature EJB source");
      expect(prompt).toContain("AccountServiceBean");
      expect(prompt).toContain("findAccountByClientId");
      expect(prompt).toContain("String clientId");
      expect(prompt).toContain("AccountVO");
    });

    it("should include technology-specific patterns for EJB3X", () => {
      const prompt = service.buildDetailedPrompt(
        sampleEjbCode, sampleRuleBasedCode, [], ejbSignature
      );

      expect(prompt).toContain("EJB Session Bean");
      expect(prompt).toContain("@Stateless");
      expect(prompt).toContain("@Service + @Transactional");
      expect(prompt).toContain("Injection par constructeur");
      expect(prompt).toContain("javax.ejb.*");
    });

    it("should include technology-specific patterns for SERVLET", () => {
      const prompt = service.buildDetailedPrompt(
        "doGet(req, resp)", "getMapping()", [], servletSignature
      );

      expect(prompt).toContain("Servlet / JSP");
      expect(prompt).toContain("@WebServlet");
      expect(prompt).toContain("@RestController + @RequestMapping");
      expect(prompt).toContain("doGet()");
      expect(prompt).toContain("@GetMapping");
    });

    it("should include technology-specific patterns for JDBC", () => {
      const prompt = service.buildDetailedPrompt(
        "PreparedStatement ps = conn.prepareStatement(sql)", "repository.findAll()", [], jdbcSignature
      );

      expect(prompt).toContain("JDBC / DAO");
      expect(prompt).toContain("PreparedStatement");
      expect(prompt).toContain("Spring Data JPA @Query");
      expect(prompt).toContain("JpaRepository");
    });

    it("should include technology-specific patterns for HIBERNATE", () => {
      const prompt = service.buildDetailedPrompt(
        "session.createQuery(hql)", "repository.findAll()", [], hibernateSignature
      );

      expect(prompt).toContain("Hibernate (SessionFactory)");
      expect(prompt).toContain("SessionFactory");
      expect(prompt).toContain("session.openSession()");
      expect(prompt).toContain("@Transactional");
    });

    it("should include RAG examples when provided", () => {
      const prompt = service.buildDetailedPrompt(
        sampleEjbCode, sampleRuleBasedCode, sampleSimilarExamples, ejbSignature
      );

      expect(prompt).toContain("Exemples de migrations similaires réussies");
      expect(prompt).toContain("SampleBean");
      expect(prompt).toContain("SampleService");
    });

    it("should not include RAG section when no examples", () => {
      const prompt = service.buildDetailedPrompt(
        sampleEjbCode, sampleRuleBasedCode, [], ejbSignature
      );

      expect(prompt).not.toContain("Exemples de migrations similaires réussies");
    });

    it("should include anti-patterns section", () => {
      const prompt = service.buildDetailedPrompt(
        sampleEjbCode, sampleRuleBasedCode, [], ejbSignature
      );

      expect(prompt).toContain("Anti-patterns à éviter");
      expect(prompt).toContain("Ne jamais garder");
    });

    it("should include strict rules section", () => {
      const prompt = service.buildDetailedPrompt(
        sampleEjbCode, sampleRuleBasedCode, [], ejbSignature
      );

      expect(prompt).toContain("Règles strictes");
      expect(prompt).toContain("Injection par constructeur");
      expect(prompt).toContain("Jamais Void.builder()");
    });

    it("should fallback to EJB3X patterns for unknown javaType", () => {
      const unknownSignature: EJBSignature = {
        ...ejbSignature,
        javaType: "UNKNOWN_TYPE",
      };

      const prompt = service.buildDetailedPrompt(
        sampleEjbCode, sampleRuleBasedCode, [], unknownSignature
      );

      // Should fallback to EJB3X patterns
      expect(prompt).toContain("EJB Session Bean");
    });
  });

  describe("validate", () => {
    const service = new GenerationService("http://localhost:11434");

    it("should return high confidence for valid code", () => {
      const validCode = `@Transactional
    public AccountVO findAccountByClientId(String clientId) {
        return accountRepository.findByClientId(clientId);
    }`;

      const result = service.validate(validCode, ejbSignature);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.source).toBe("ml");
      expect(result.warnings).toHaveLength(0);
    });

    it("should detect Void.builder() anti-pattern", () => {
      const badCode = `public AccountVO findAccountByClientId(String clientId) {
        return Void.builder().build();
    }`;

      const result = service.validate(badCode, ejbSignature);
      expect(result.warnings).toContain("Void.builder() détecté — code invalide");
      expect(result.confidence).toBeLessThan(0.6);
    });

    it("should detect missing parameters", () => {
      const missingParamCode = `public AccountVO findAccountByClientId() {
        return accountRepository.findAll();
    }`;

      const result = service.validate(missingParamCode, ejbSignature);
      expect(result.warnings.some(w => w.includes("Paramètre manquant"))).toBe(true);
    });

    it("should detect Object return type", () => {
      const objectReturnCode = `public Object findAccountByClientId(String clientId) {
        return accountRepository.findByClientId(clientId);
    }`;

      const result = service.validate(objectReturnCode, ejbSignature);
      expect(result.warnings.some(w => w.includes("public Object"))).toBe(true);
    });

    it("should detect slash in method name and correct it", () => {
      const slashCode = `public AccountVO find/AccountByClientId(String clientId) {
        return null;
    }`;

      const result = service.validate(slashCode, ejbSignature);
      expect(result.warnings.some(w => w.includes("Slash dans nom de méthode"))).toBe(true);
      expect(result.code).not.toContain("/");
    });

    it("should detect legacy imports for EJB3X", () => {
      const legacyImportCode = `import javax.ejb.Stateless;
    public AccountVO findAccountByClientId(String clientId) {
        return accountRepository.findByClientId(clientId);
    }`;

      const result = service.validate(legacyImportCode, ejbSignature);
      expect(result.warnings.some(w => w.includes("Import legacy conservé"))).toBe(true);
    });

    it("should detect @Autowired on field (prefer constructor injection)", () => {
      const autowiredCode = `    @Autowired
    private AccountRepository accountRepository;
    public AccountVO findAccountByClientId(String clientId) {
        return accountRepository.findByClientId(clientId);
    }`;

      const result = service.validate(autowiredCode, ejbSignature);
      expect(result.warnings.some(w => w.includes("@Autowired sur champ"))).toBe(true);
    });

    it("should generate fallback code when confidence is too low", () => {
      const terribleCode = `public Object bad/Method() {
        return Void.builder().build();
    }`;

      const result = service.validate(terribleCode, ejbSignature);
      expect(result.source).toBe("rules-corrected");
      expect(result.code).toContain("findAccountByClientId");
      expect(result.code).toContain("AccountVO");
      expect(result.code).toContain("@Transactional");
    });
  });

  describe("improveServiceMethod", () => {
    const service = new GenerationService("http://localhost:11434", "ejb-modernizer");

    it("should return rule-based code when LLM is unavailable", async () => {
      mockedLLMGenerate.mockResolvedValueOnce(null);

      const result = await service.improveServiceMethod(
        sampleEjbCode, sampleRuleBasedCode, [], ejbSignature
      );

      expect(result.source).toBe("rules");
      expect(result.code).toBe(sampleRuleBasedCode);
      expect(result.warnings).toContain("LLM indisponible — code rule-based conservé");
    });

    it("should boost confidence for fine-tuned backend", async () => {
      mockedLLMGenerate.mockResolvedValueOnce({
        code: `@Transactional
    public AccountVO findAccountByClientId(String clientId) {
        return accountRepository.findByClientId(clientId);
    }`,
        backend: "finetuned",
      });

      const result = await service.improveServiceMethod(
        sampleEjbCode, sampleRuleBasedCode, [], ejbSignature
      );

      expect(result.backend).toBe("finetuned");
      // Confidence should be boosted (0.9 base + 0.1 boost = 1.0)
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should not boost confidence for manus backend", async () => {
      mockedLLMGenerate.mockResolvedValueOnce({
        code: `@Transactional
    public AccountVO findAccountByClientId(String clientId) {
        return accountRepository.findByClientId(clientId);
    }`,
        backend: "manus",
      });

      const result = await service.improveServiceMethod(
        sampleEjbCode, sampleRuleBasedCode, [], ejbSignature
      );

      expect(result.backend).toBe("manus");
      expect(result.confidence).toBe(0.9); // No boost
    });

    it("should handle LLM errors gracefully", async () => {
      mockedLLMGenerate.mockRejectedValueOnce(new Error("timeout"));

      const result = await service.improveServiceMethod(
        sampleEjbCode, sampleRuleBasedCode, [], ejbSignature
      );

      expect(result.source).toBe("rules");
      expect(result.code).toBe(sampleRuleBasedCode);
      expect(result.warnings.some(w => w.includes("LLM indisponible"))).toBe(true);
    });
  });

  describe("static methods", () => {

    it("getSupportedTechnologies should return all 9 categories", () => {
      const techs = GenerationService.getSupportedTechnologies();
      expect(techs).toContain("EJB3X");
      expect(techs).toContain("EJB2X");
      expect(techs).toContain("SERVLET");
      expect(techs).toContain("STRUTS");
      expect(techs).toContain("SOAP");
      expect(techs).toContain("JDBC");
      expect(techs).toContain("HIBERNATE");
      expect(techs).toContain("JMS");
      expect(techs).toContain("BATCH");
      expect(techs.length).toBe(9);
    });

    it("getLearnedPatterns should return pattern for known type", () => {
      const pattern = GenerationService.getLearnedPatterns("SERVLET");
      expect(pattern).toBeDefined();
      expect(pattern!.category).toBe("Servlet / JSP");
      expect(pattern!.annotationMap["@WebServlet"]).toBe("@RestController + @RequestMapping");
    });

    it("getLearnedPatterns should return undefined for unknown type", () => {
      const pattern = GenerationService.getLearnedPatterns("COBOL");
      expect(pattern).toBeUndefined();
    });
  });

  describe("extractCode", () => {
    const service = new GenerationService("http://localhost:11434");

    it("should extract Java code from markdown block", () => {
      const response = "Here:\n```java\npublic void test() {}\n```\nDone.";
      expect(service.extractCode(response)).toBe("public void test() {}");
    });

    it("should handle response without code blocks", () => {
      const response = "public void test() { return; }";
      expect(service.extractCode(response)).toBe("public void test() { return; }");
    });
  });
});
