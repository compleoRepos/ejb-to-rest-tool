/**
 * GenerationService — Compleo v9.0 ML Layer
 *
 * Utilise un LLM pour améliorer le code Spring Boot généré par le moteur de règles.
 *
 * v9.0: Prompts enrichis avec les patterns appris du dataset de 27 237 paires.
 *       Adapte le prompt selon le backend (fine-tuné vs généraliste).
 *       Le modèle fine-tuné reçoit des prompts concis (il connaît déjà les patterns).
 *       Le modèle généraliste reçoit des prompts détaillés avec exemples et règles.
 *
 * @author Hamza NORDINE
 */
import type { MigrationPair } from "./embedding-service";
import type { EJBSignature } from "./ml-enhancer";
import {
  llmGenerateCodeWithBackend,
  llmGenerateCode,
  type LLMAdapterConfig,
  type LLMBackend,
} from "./llm-adapter";

// ── Types ────────────────────────────────────────────────────────

export interface MLGenerationResult {
  code:       string;
  confidence: number;
  source:     "ml" | "rules" | "rules-corrected";
  warnings:   string[];
  backend?:   LLMBackend;
}

/**
 * Patterns de transformation appris du dataset de 27 237 paires.
 * Chaque catégorie contient les règles de transformation les plus fréquentes
 * extraites de l'analyse de 884 repos GitHub enterprise.
 */
const LEARNED_PATTERNS: Record<string, TransformationPattern> = {
  EJB3X: {
    category: "EJB Session Bean",
    annotationMap: {
      "@Stateless":             "@Service + @Transactional",
      "@Stateful":              "@Service + @Transactional",
      "@Singleton":             "@Service",
      "@EJB":                   "Injection par constructeur",
      "@Remote / @Local":       "Supprimer (Spring n'a pas de remote/local)",
      "@TransactionAttribute":  "@Transactional(propagation = ...)",
      "@Schedule":              "@Scheduled",
      "@Interceptor":           "@Aspect",
    },
    importReplacements: {
      "javax.ejb.*":            "org.springframework.stereotype.Service, org.springframework.transaction.annotation.Transactional",
      "jakarta.ejb.*":          "org.springframework.stereotype.Service, org.springframework.transaction.annotation.Transactional",
    },
    antiPatterns: [
      "Ne jamais garder InitialContext/JNDI lookup → remplacer par injection constructeur",
      "Ne jamais garder implements SessionBean → supprimer",
      "Ne jamais garder @Remote/@Local interfaces → supprimer",
    ],
    exampleTransform: `// EJB: @Stateless + @EJB injection
// Spring: @Service + injection constructeur
@Service
@Transactional
public class AccountService {
    private final AccountRepository accountRepository;
    public AccountService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }
}`,
  },
  EJB2X: {
    category: "EJB 2.x (Home/Remote)",
    annotationMap: {
      "implements SessionBean":  "@Service",
      "ejbCreate()":             "Constructeur",
      "ejbRemove()":             "@PreDestroy",
      "ejbActivate/Passivate":   "Supprimer (pas de concept équivalent)",
    },
    importReplacements: {
      "javax.ejb.SessionBean":  "org.springframework.stereotype.Service",
      "javax.ejb.SessionContext": "Supprimer",
    },
    antiPatterns: [
      "Ne jamais garder SessionContext → remplacer par SecurityContextHolder si besoin",
      "Ne jamais garder ejb-jar.xml → configuration Spring Boot auto",
    ],
    exampleTransform: `// EJB 2.x: implements SessionBean + ejbCreate
// Spring: @Service + constructeur
@Service
public class LegacyService {
    @PostConstruct
    public void init() { /* ex-ejbCreate logic */ }
}`,
  },
  SERVLET: {
    category: "Servlet / JSP",
    annotationMap: {
      "@WebServlet":            "@RestController + @RequestMapping",
      "extends HttpServlet":    "@RestController",
      "doGet()":                "@GetMapping",
      "doPost()":               "@PostMapping",
      "doPut()":                "@PutMapping",
      "doDelete()":             "@DeleteMapping",
      "@WebFilter":             "@Component + implements Filter (Spring)",
      "@WebListener":           "@Component + @EventListener",
    },
    importReplacements: {
      "javax.servlet.http.*":   "org.springframework.web.bind.annotation.*",
      "javax.servlet.*":        "org.springframework.web.bind.annotation.*",
      "jakarta.servlet.*":      "org.springframework.web.bind.annotation.*",
    },
    antiPatterns: [
      "Ne jamais garder HttpServletRequest/Response dans la signature → utiliser @RequestBody, @PathVariable, @RequestParam",
      "Ne jamais garder RequestDispatcher.forward() → retourner ResponseEntity ou redirect",
      "Ne jamais garder HttpSession directement → utiliser Spring Session ou @SessionScope",
      "Ne jamais garder PrintWriter pour la réponse → retourner un objet (Jackson sérialise)",
    ],
    exampleTransform: `// Servlet: @WebServlet("/orders") + doGet(req, resp)
// Spring: @RestController + @GetMapping
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService orderService;
    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }
    @GetMapping
    public ResponseEntity<List<OrderDTO>> getOrders() {
        return ResponseEntity.ok(orderService.findAll());
    }
}`,
  },
  STRUTS: {
    category: "Struts 1.x / 2.x",
    annotationMap: {
      "extends ActionSupport":  "@RestController",
      "extends Action":         "@RestController",
      "ActionForm":             "@RequestBody DTO",
      "ActionForward":          "ResponseEntity<?>",
      "ActionMapping":          "@RequestMapping",
      "execute()":              "@PostMapping / @GetMapping",
      "SUCCESS / ERROR":        "ResponseEntity.ok() / .badRequest()",
    },
    importReplacements: {
      "org.apache.struts.*":    "org.springframework.web.bind.annotation.*",
      "org.apache.struts2.*":   "org.springframework.web.bind.annotation.*",
      "com.opensymphony.xwork2.*": "org.springframework.web.bind.annotation.*",
    },
    antiPatterns: [
      "Ne jamais garder ActionForm → créer un DTO avec @Valid",
      "Ne jamais garder struts-config.xml → @RequestMapping",
      "Ne jamais retourner SUCCESS/ERROR string → ResponseEntity",
      "Ne jamais garder ValueStack → utiliser @ModelAttribute ou @RequestBody",
    ],
    exampleTransform: `// Struts: extends ActionSupport + execute() → return SUCCESS
// Spring: @RestController + @PostMapping → ResponseEntity
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    @PostMapping
    public ResponseEntity<?> createOrder(@Valid @RequestBody OrderRequest request) {
        orderService.create(request);
        return ResponseEntity.ok().build();
    }
}`,
  },
  SOAP: {
    category: "SOAP / JAX-WS",
    annotationMap: {
      "@WebService":            "@RestController + @RequestMapping",
      "@WebMethod":             "@PostMapping",
      "@WebParam":              "@RequestParam ou @RequestBody",
      "@SOAPBinding":           "Supprimer (REST n'a pas de SOAP binding)",
    },
    importReplacements: {
      "javax.jws.*":            "org.springframework.web.bind.annotation.*",
      "javax.xml.ws.*":         "org.springframework.web.bind.annotation.*",
    },
    antiPatterns: [
      "Ne jamais garder WSDL → documenter avec OpenAPI/Swagger",
      "Ne jamais garder SOAPMessage → utiliser JSON (@RequestBody/@ResponseBody)",
      "Ne jamais garder @WebParam(name=...) → @RequestParam ou champ DTO",
    ],
    exampleTransform: `// SOAP: @WebService + @WebMethod
// REST: @RestController + @PostMapping
@RestController
@RequestMapping("/api/payment")
public class PaymentController {
    @PostMapping("/process")
    public ResponseEntity<PaymentResponse> processPayment(
            @Valid @RequestBody PaymentRequest request) {
        return ResponseEntity.ok(paymentService.process(request));
    }
}`,
  },
  JDBC: {
    category: "JDBC / DAO",
    annotationMap: {
      "DriverManager.getConnection": "Spring Boot auto-configuration (HikariCP)",
      "PreparedStatement":           "Spring Data JPA @Query ou derived queries",
      "ResultSet":                   "JPA Entity mapping automatique",
      "DataSource":                  "Spring Boot auto-configuration",
      "CallableStatement":           "@Procedure ou @Query(nativeQuery=true)",
    },
    importReplacements: {
      "java.sql.*":             "org.springframework.data.jpa.repository.JpaRepository",
    },
    antiPatterns: [
      "Ne jamais garder Connection/Statement/ResultSet manuels → JpaRepository",
      "Ne jamais garder try/finally pour fermer les connexions → @Transactional",
      "Ne jamais garder DriverManager → Spring Boot auto-configure HikariCP",
      "Ne jamais garder SQL inline → @Query ou derived query methods",
    ],
    exampleTransform: `// JDBC: PreparedStatement + ResultSet manual
// Spring Data JPA: interface Repository
@Repository
public interface AccountRepository extends JpaRepository<Account, Long> {
    @Query("SELECT a FROM Account a WHERE a.clientId = :clientId AND a.status = :status")
    List<Account> findByClientIdAndStatus(
        @Param("clientId") String clientId,
        @Param("status") String status);
}`,
  },
  HIBERNATE: {
    category: "Hibernate (SessionFactory)",
    annotationMap: {
      "SessionFactory":              "Spring Boot auto-configuration",
      "session.openSession()":       "@Transactional (Spring gère la session)",
      "session.save()":              "repository.save()",
      "session.update()":            "repository.save()",
      "session.delete()":            "repository.delete()",
      "session.get()":               "repository.findById()",
      "session.createQuery()":       "@Query ou derived query",
      "Criteria + Restrictions":     "Specification<T> (Spring Data JPA)",
      "HibernateTemplate":           "JpaRepository",
    },
    importReplacements: {
      "org.hibernate.*":        "org.springframework.data.jpa.repository.*",
    },
    antiPatterns: [
      "Ne jamais garder HibernateUtil.getSessionFactory() → auto-config Spring Boot",
      "Ne jamais garder session.openSession()/close() → @Transactional",
      "Ne jamais garder transaction.begin()/commit() → @Transactional",
      "Ne jamais garder hibernate.cfg.xml → application.yml spring.jpa.*",
    ],
    exampleTransform: `// Hibernate: SessionFactory + session.createQuery
// Spring Data JPA: JpaRepository + @Query
@Service
@Transactional
public class AccountService {
    private final AccountRepository accountRepository;
    public AccountService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }
    public List<Account> findActiveAccounts(String clientId) {
        return accountRepository.findByClientIdAndStatusActive(clientId);
    }
}`,
  },
  JMS: {
    category: "JMS / MDB",
    annotationMap: {
      "@MessageDriven":         "@Component + @JmsListener",
      "implements MessageListener": "Supprimer (Spring gère)",
      "onMessage()":            "@JmsListener(destination = ...)",
      "QueueSender":            "JmsTemplate.convertAndSend()",
      "TopicPublisher":         "JmsTemplate.convertAndSend()",
      "ConnectionFactory":      "Spring Boot auto-configuration",
      "@ActivationConfigProperty": "Propriétés dans @JmsListener",
    },
    importReplacements: {
      "javax.jms.*":            "org.springframework.jms.annotation.JmsListener, org.springframework.jms.core.JmsTemplate",
      "jakarta.jms.*":          "org.springframework.jms.annotation.JmsListener, org.springframework.jms.core.JmsTemplate",
      "javax.ejb.*":            "org.springframework.stereotype.Component",
    },
    antiPatterns: [
      "Ne jamais garder @ActivationConfigProperty → configurer dans @JmsListener",
      "Ne jamais garder ConnectionFactory manual → Spring Boot auto-config",
      "Ne jamais garder Session.createConsumer() → @JmsListener",
    ],
    exampleTransform: `// JMS MDB: @MessageDriven + onMessage(Message)
// Spring: @Component + @JmsListener
@Component
@Slf4j
public class OrderEventListener {
    @JmsListener(destination = "orders.queue")
    public void onOrderEvent(OrderEvent event) {
        log.info("Received order event: {}", event.getOrderId());
        orderService.processEvent(event);
    }
}`,
  },
  BATCH: {
    category: "Batch / Scheduler",
    annotationMap: {
      "TimerBean":              "@Scheduled",
      "@Schedule":              "@Scheduled",
      "Quartz Job":             "Spring @Scheduled ou Spring Batch",
    },
    importReplacements: {
      "javax.ejb.Schedule":     "org.springframework.scheduling.annotation.Scheduled",
    },
    antiPatterns: [
      "Ne jamais garder javax.ejb.Timer → @Scheduled",
    ],
    exampleTransform: `// EJB Timer: @Schedule(hour="2", minute="0")
// Spring: @Scheduled(cron = "0 0 2 * * *")
@Component
public class NightlyBatchJob {
    @Scheduled(cron = "0 0 2 * * *")
    public void executeNightlyBatch() {
        batchService.runNightlyReconciliation();
    }
}`,
  },
};

interface TransformationPattern {
  category:          string;
  annotationMap:     Record<string, string>;
  importReplacements: Record<string, string>;
  antiPatterns:      string[];
  exampleTransform:  string;
}

// ── Service ──────────────────────────────────────────────────────

export class GenerationService {
  private ollamaUrl: string;
  private model:     string;

  constructor(
    ollamaUrl: string,
    model = "ejb-modernizer"
  ) {
    this.ollamaUrl = ollamaUrl.replace(/\/$/, "");
    this.model     = model;
  }

  /**
   * Improve a rule-based service method using the LLM.
   *
   * v9.0: Uses llm-adapter with fine-tuned model priority.
   *       Adapts prompt based on backend (concise for fine-tuned, detailed for generalist).
   */
  async improveServiceMethod(
    ejbCode:         string,
    ruleBasedCode:   string,
    similarExamples: MigrationPair[],
    signature:       EJBSignature
  ): Promise<MLGenerationResult> {
    // Build both prompt versions
    const detailedPrompt = this.buildDetailedPrompt(
      ejbCode, ruleBasedCode, similarExamples, signature
    );

    try {
      const adapterConfig: LLMAdapterConfig = {
        ollamaUrl: this.ollamaUrl,
        model:     this.model,
        timeoutMs: 60_000,
      };

      // Use the new backend-aware generation
      const result = await llmGenerateCodeWithBackend(
        detailedPrompt,
        { temperature: 0.1, maxTokens: 800, stop: ["```", "// END_METHOD"] },
        adapterConfig,
      );

      if (!result) {
        return {
          code:       ruleBasedCode,
          confidence: 0.5,
          source:     "rules",
          warnings:   ["LLM indisponible — code rule-based conservé"],
        };
      }

      const validated = this.validate(result.code, signature);
      validated.backend = result.backend;

      // Boost confidence for fine-tuned model (trained on 27K pairs)
      if (result.backend === "finetuned" && validated.confidence >= 0.6) {
        validated.confidence = Math.min(1.0, validated.confidence + 0.1);
      }

      return validated;
    } catch (e) {
      return {
        code:       ruleBasedCode,
        confidence: 0.5,
        source:     "rules",
        warnings:   [`LLM indisponible: ${e}`],
      };
    }
  }

  /**
   * Build a detailed prompt enriched with learned patterns from the 27K dataset.
   * This prompt is used for all backends but is especially useful for generalist models.
   * The fine-tuned model already knows these patterns but benefits from the structure.
   */
  buildDetailedPrompt(
    ejbCode:         string,
    ruleBasedCode:   string,
    examples:        MigrationPair[],
    signature:       EJBSignature
  ): string {
    // Resolve the technology-specific patterns
    const pattern = LEARNED_PATTERNS[signature.javaType]
      ?? LEARNED_PATTERNS["EJB3X"]; // fallback

    const paramsStr = signature.params.length > 0
      ? signature.params.map(p => `${p.type} ${p.name}`).join(", ")
      : "aucun";
    const springReturn = inferSpringReturnType(signature.returnType);

    // ── Section 1: Signature EJB (authoritative) ──
    const signatureSection = `## Signature EJB source (référence authoritative)
Classe : ${signature.className} (${signature.javaType})
Méthode : ${signature.methodName}
Paramètres : ${paramsStr}
Retour : ${signature.returnType}
La méthode Spring Boot DOIT avoir :
- Nom : ${signature.methodName}
- Paramètre(s) : ${paramsStr}
- Type de retour : ${springReturn}
- Jamais : void si returnType != void dans le EJB
- Jamais : Object comme type de retour
- Jamais : méthode sans paramètre si le EJB en a un
`;

    // ── Section 2: Patterns appris du dataset 27K ──
    const patternSection = `## Patterns de transformation (${pattern.category})
### Correspondances d'annotations
${Object.entries(pattern.annotationMap).map(([k, v]) => `- ${k} → ${v}`).join("\n")}

### Remplacement d'imports
${Object.entries(pattern.importReplacements).map(([k, v]) => `- ${k} → ${v}`).join("\n")}

### Anti-patterns à éviter
${pattern.antiPatterns.map(ap => `- ${ap}`).join("\n")}

### Exemple de transformation type
\`\`\`java
${pattern.exampleTransform}
\`\`\`
`;

    // ── Section 3: Exemples RAG similaires ──
    const exSection = examples.length > 0
      ? `## Exemples de migrations similaires réussies\n\n` +
        examples.map((ex, i) => `
### Exemple ${i + 1}
EJB:
\`\`\`java
${ex.ejbCode.substring(0, 500)}
\`\`\`
Spring Boot:
\`\`\`java
${ex.springCode.substring(0, 500)}
\`\`\`
`).join("\n")
      : "";

    // ── Section 4: Code source et rule-based ──
    return `Tu es un expert Java EE → Spring Boot 3.2.
${signatureSection}
${patternSection}
${exSection}
## Code EJB à migrer
\`\`\`java
${ejbCode.substring(0, 800)}
\`\`\`

## Code rule-based généré (peut contenir des erreurs)
\`\`\`java
${ruleBasedCode}
\`\`\`

## Règles strictes
1. Respecter EXACTEMENT la signature EJB source ci-dessus
2. Si le rule-based a un paramètre manquant → l'ajouter
3. Si le rule-based retourne void alors que le EJB retourne autre chose → corriger
4. Appliquer les patterns de transformation ${pattern.category} ci-dessus
5. SQL constants = private static final au niveau classe
6. Injection par constructeur (jamais @Autowired sur champ)
7. Jamais Object comme type de retour
8. Jamais Void.builder()

Génère la méthode Spring Boot corrigée :
\`\`\`java
`;
  }

  /**
   * Build the legacy prompt (kept for backward compatibility).
   * @deprecated Use buildDetailedPrompt instead.
   */
  buildPrompt(
    ejbCode:         string,
    ruleBasedCode:   string,
    examples:        MigrationPair[],
    signature:       EJBSignature
  ): string {
    return this.buildDetailedPrompt(ejbCode, ruleBasedCode, examples, signature);
  }

  /**
   * Extract Java code from the LLM response.
   */
  extractCode(response: string): string {
    const match = response.match(/```java\s*([\s\S]*?)(?:```|$)/);
    if (match) return match[1].trim();

    const lastBrace = response.lastIndexOf("}");
    return lastBrace > 0
      ? response.substring(0, lastBrace + 1)
      : response;
  }

  /**
   * Validate the generated code against the EJB signature.
   * v9.0: Enhanced validation with pattern-aware checks.
   */
  validate(
    code:      string,
    signature: EJBSignature
  ): MLGenerationResult {
    const warnings: string[] = [];
    let confidence = 0.9;
    let validatedCode = code;

    // Vérif 1 — Void.builder() invalide
    if (validatedCode.includes("Void.builder()")) {
      warnings.push("Void.builder() détecté — code invalide");
      confidence -= 0.4;
    }

    // Vérif 2 — chaque paramètre EJB doit être dans la signature Spring
    for (const param of signature.params) {
      if (!validatedCode.includes(param.name) && !validatedCode.includes(param.type)) {
        warnings.push(`Paramètre manquant: ${param.type} ${param.name}`);
        confidence -= 0.25;
      }
    }

    // Vérif 3 — type de retour cohérent
    const expectedReturn = inferSpringReturnType(signature.returnType);
    if (expectedReturn !== "void" && !validatedCode.includes(expectedReturn)) {
      warnings.push(`Type de retour incorrect. Attendu: ${expectedReturn}`);
      confidence -= 0.2;
    }

    // Vérif 4 — pas de Object comme type retour
    if (/public\s+Object\s+\w+\s*\(/.test(validatedCode)) {
      warnings.push("public Object détecté — type non acceptable");
      confidence -= 0.3;
    }

    // Vérif 5 — slash dans nom de méthode
    if (/public\s+\w+\s+\w*\/\w*\(/.test(validatedCode)) {
      warnings.push("Slash dans nom de méthode — corrigé");
      validatedCode = validatedCode.replace(/(\w+)\/(\w+)\(/g, "$2(");
      confidence -= 0.1;
    }

    // Vérif 6 (v9.0) — anti-patterns spécifiques à la technologie
    const pattern = LEARNED_PATTERNS[signature.javaType];
    if (pattern) {
      // Vérifier que les imports legacy ne sont pas conservés
      for (const legacyImport of Object.keys(pattern.importReplacements)) {
        const importBase = legacyImport.replace(".*", "").replace(/\./g, "\\.");
        if (new RegExp(`import\\s+${importBase}`).test(validatedCode)) {
          warnings.push(`Import legacy conservé: ${legacyImport} → devrait être remplacé`);
          confidence -= 0.1;
        }
      }

      // Vérifier l'injection par constructeur (pas @Autowired sur champ)
      if (/^\s*@Autowired\s*\n\s*private\s/m.test(validatedCode)) {
        warnings.push("@Autowired sur champ détecté → préférer injection constructeur");
        confidence -= 0.05;
      }
    }

    // Si confiance trop basse → forcer le code rule-based corrigé
    if (confidence < 0.5) {
      return {
        code:       this.buildFallbackCode(signature),
        confidence: 0.5,
        source:     "rules-corrected",
        warnings,
      };
    }

    return {
      code: validatedCode,
      confidence: Math.max(0, confidence),
      source: confidence >= 0.6 ? "ml" : "rules",
      warnings,
    };
  }

  /**
   * Build a correct stub from the EJB signature when ML output
   * fails validation.
   */
  private buildFallbackCode(signature: EJBSignature): string {
    const springReturn = inferSpringReturnType(signature.returnType);
    const params = signature.params
      .map(p => `${p.type} ${p.name}`)
      .join(", ");

    return `    @Transactional
    public ${springReturn} ${signature.methodName}(${params}) {
        log.info("${signature.methodName}: {}", ${signature.params[0]?.name ?? '""'});
        // TODO: Migrer la logique depuis ${signature.className}.${signature.methodName}
        throw new UnsupportedOperationException("Migration en cours");
    }`;
  }

  /**
   * Get the learned patterns for a given technology (useful for diagnostics).
   */
  static getLearnedPatterns(javaType: string): TransformationPattern | undefined {
    return LEARNED_PATTERNS[javaType];
  }

  /**
   * Get all supported technology types.
   */
  static getSupportedTechnologies(): string[] {
    return Object.keys(LEARNED_PATTERNS);
  }
}

// ── Utility ─────────────────────────────────────────────────────

function inferSpringReturnType(ejbReturnType: string): string {
  if (!ejbReturnType || ejbReturnType === "void" || ejbReturnType === "Void") {
    return "void";
  }
  if (ejbReturnType === "Object") {
    return "Object";
  }
  return ejbReturnType;
}
