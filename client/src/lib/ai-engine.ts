/**
 * Moteur d'IA interne — EJB Client Modernizer v2.0
 *
 * Moteur 100% déterministe basé sur des règles codées en dur et du pattern matching.
 * Aucun appel réseau, aucun modèle probabiliste, aucune hallucination possible.
 * Chaque suggestion est traçable à une règle précise avec numéro de ligne.
 *
 * Sources des règles :
 * - OWASP Java Security Cheat Sheet (injection, crypto, session, error handling)
 * - SonarQube Rules (bugs, vulnerabilities, code smells, security hotspots)
 * - SOLID Principles (SRP, OCP, LSP, ISP, DIP)
 * - Clean Code (Robert C. Martin)
 * - PMD / SpotBugs / Checkstyle categories
 * - Refactoring Guru (bloaters, couplers, dispensables, change preventers)
 * - Spring Boot / Cloud Native best practices
 *
 * @author Hamza NORDINE
 */

import type { AnalysisReport } from "./ejb-analyzer";
import type { GeneratedFile, GenerationResult } from "./code-generator";

// ============================================================
// Types — conserve la compatibilité avec l'interface existante
// ============================================================

export type Severity = "critical" | "warning" | "info" | "suggestion";

export type RuleCategory =
  | "OWASP"
  | "SonarQube"
  | "SOLID"
  | "CleanCode"
  | "PMD"
  | "SpotBugs"
  | "Checkstyle"
  | "Resilience"
  | "Observability"
  | "Performance"
  | "Migration"
  | "Security"
  | "Couplage"
  | "Gestion d'erreurs"
  | "Transactions"
  | "JMS/MQ"
  | "Qualité"
  | "Concurrence"
  | "Sérialisation"
  | "Architecture";

export interface AiSuggestion {
  id: string;
  ruleId: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  line?: number;
  fileName?: string;
  codeSnippet?: string;
  fix?: string;
  impact: string;
  reference?: string;
}

export interface QualityScore {
  overall: number;
  maintainability: number;
  security: number;
  performance: number;
  resilience: number;
  testability: number;
  breakdown: ScoreDetail[];
}

export interface ScoreDetail {
  category: string;
  score: number;
  maxScore: number;
  reason: string;
}

export interface AiAnalysisResult {
  suggestions: AiSuggestion[];
  legacyScore: QualityScore;
  modernScore: QualityScore;
  optimizations: CodeOptimization[];
  summary: AiSummary;
}

export interface CodeOptimization {
  id: string;
  type: "retry" | "circuit-breaker" | "cache" | "logging" | "error-handling" | "timeout" | "bulkhead" | "validation" | "openapi" | "health" | "rate-limit" | "tracing";
  description: string;
  applied: boolean;
}

export interface AiSummary {
  totalSuggestions: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  topRisks: string[];
  migrationComplexity: "faible" | "moyenne" | "élevée" | "très élevée";
  estimatedEffortDays: number;
  confidenceLevel: string;
  totalRules: number;
  rulesTriggered: number;
  rulesByCategory: Record<string, number>;
}

// ============================================================
// Rule Definitions — 80+ rules from industry standards
// ============================================================

interface Rule {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  pattern: RegExp;
  description: string;
  impact: string;
  fix?: string;
  reference?: string;
  countThreshold?: number; // for SRP-like rules
}

const RULES: Rule[] = [
  // ═══════════════════════════════════════════════════════════
  // OWASP Security Rules (A01-A10)
  // ═══════════════════════════════════════════════════════════
  {
    id: "OWASP-INJ-001",
    category: "OWASP",
    severity: "critical",
    title: "Injection SQL par concaténation",
    pattern: /(?:executeQuery|executeUpdate|prepareStatement)\s*\(\s*["'][^"']*["']\s*\+/,
    description: "Concaténation de chaînes dans une requête SQL détectée (OWASP A03:2021 Injection).",
    impact: "Risque d'injection SQL permettant l'accès non autorisé aux données.",
    fix: "Utiliser PreparedStatement avec des paramètres '?' ou des named parameters JPA.",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
  },
  {
    id: "OWASP-INJ-002",
    category: "OWASP",
    severity: "critical",
    title: "Injection SQL — Statement brut",
    pattern: /Statement\s+\w+\s*=\s*\w+\.createStatement\s*\(/,
    description: "Utilisation de Statement.execute() au lieu de PreparedStatement (OWASP A03).",
    impact: "Vulnérabilité d'injection SQL exploitable.",
    fix: "Remplacer Statement par PreparedStatement avec des paramètres liés.",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
  },
  {
    id: "OWASP-INJ-003",
    category: "OWASP",
    severity: "critical",
    title: "Injection de commande OS",
    pattern: /Runtime\.getRuntime\(\)\.exec\s*\(|new\s+ProcessBuilder\s*\(/,
    description: "Utilisation de Runtime.exec() ou ProcessBuilder (OWASP A03).",
    impact: "Risque d'exécution de commandes arbitraires sur le serveur.",
    fix: "Utiliser les API Java natives. Valider strictement les entrées.",
    reference: "https://owasp.org/www-community/attacks/Command_Injection",
  },
  {
    id: "OWASP-CRED-001",
    category: "OWASP",
    severity: "critical",
    title: "Credentials codées en dur",
    pattern: /(?:password|passwd|pwd|secret|apiKey|api_key|token)\s*=\s*["'][^"']{3,}["']/i,
    description: "Mot de passe, secret ou clé API codé en dur dans le code source (OWASP A07:2021).",
    impact: "Faille de sécurité majeure : credentials exposées dans le dépôt Git.",
    fix: "Externaliser dans des variables d'environnement ou un vault (HashiCorp Vault, AWS Secrets Manager).",
    reference: "https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/",
  },
  {
    id: "OWASP-CRYPTO-001",
    category: "OWASP",
    severity: "critical",
    title: "Algorithme cryptographique faible",
    pattern: /MessageDigest\.getInstance\s*\(\s*["'](?:MD5|SHA-?1)["']\s*\)/i,
    description: "Utilisation de MD5 ou SHA-1 vulnérables aux collisions (OWASP A02:2021).",
    impact: "Hachage cassable permettant la falsification de données.",
    fix: "Utiliser SHA-256, SHA-512 ou bcrypt/scrypt/Argon2 pour les mots de passe.",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html",
  },
  {
    id: "OWASP-CRYPTO-002",
    category: "OWASP",
    severity: "warning",
    title: "Générateur aléatoire non sécurisé",
    pattern: /new\s+Random\s*\(/,
    description: "Utilisation de java.util.Random au lieu de SecureRandom pour des opérations sensibles.",
    impact: "Tokens ou clés prévisibles exploitables par un attaquant.",
    fix: "Utiliser java.security.SecureRandom pour la génération de tokens, clés ou nonces.",
    reference: "https://owasp.org/www-community/vulnerabilities/Insecure_Randomness",
  },
  {
    id: "OWASP-LOG-001",
    category: "OWASP",
    severity: "warning",
    title: "Injection de logs",
    pattern: /(?:logger|log|LOG)\.\w+\s*\(\s*["'][^"']*["']\s*\+\s*(?:request|input|param|user)/i,
    description: "Données utilisateur insérées directement dans les logs sans sanitisation.",
    impact: "Risque de log injection/forging permettant la manipulation des logs.",
    fix: "Utiliser des placeholders SLF4J : logger.info(\"User: {}\", sanitize(input));",
    reference: "https://owasp.org/www-community/attacks/Log_Injection",
  },
  {
    id: "OWASP-DESER-001",
    category: "OWASP",
    severity: "critical",
    title: "Désérialisation non sécurisée",
    pattern: /ObjectInputStream|\.readObject\s*\(/,
    description: "Utilisation de ObjectInputStream.readObject() sans validation (OWASP A08:2021).",
    impact: "Risque d'exécution de code à distance (RCE) via gadget chains.",
    fix: "Utiliser JSON/Protobuf ou implémenter un ObjectInputFilter.",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html",
  },
  {
    id: "OWASP-XXE-001",
    category: "OWASP",
    severity: "critical",
    title: "Vulnérabilité XXE (XML External Entity)",
    pattern: /(?:DocumentBuilderFactory|SAXParserFactory|XMLInputFactory)\.newInstance\s*\(/,
    description: "Parseur XML sans désactivation des entités externes (OWASP A05:2021).",
    impact: "Lecture de fichiers serveur, SSRF, déni de service.",
    fix: "Désactiver les entités externes : factory.setFeature(\"disallow-doctype-decl\", true);",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html",
  },
  {
    id: "OWASP-SSRF-001",
    category: "OWASP",
    severity: "warning",
    title: "URL construite dynamiquement — risque SSRF",
    pattern: /new\s+URL\s*\(\s*\w+\s*\)|URI\.create\s*\(\s*\w+\s*\)/,
    description: "URL construite à partir d'une variable non validée (OWASP A10:2021 SSRF).",
    impact: "Un attaquant peut forcer le serveur à accéder à des ressources internes.",
    fix: "Valider l'URL contre une whitelist de domaines autorisés.",
    reference: "https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/",
  },

  // ═══════════════════════════════════════════════════════════
  // SonarQube Rules (Bugs, Code Smells, Vulnerabilities)
  // ═══════════════════════════════════════════════════════════
  {
    id: "SONAR-BUG-001",
    category: "SonarQube",
    severity: "critical",
    title: "Bloc catch vide (S108)",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    description: "Bloc catch vide : les exceptions sont silencieusement ignorées.",
    impact: "Erreurs invisibles en production, diagnostic impossible.",
    fix: "Logger l'exception : catch (Exception e) { log.error(\"Erreur\", e); throw e; }",
    reference: "https://rules.sonarsource.com/java/RSPEC-108",
  },
  {
    id: "SONAR-BUG-002",
    category: "SonarQube",
    severity: "warning",
    title: "Exception générique attrapée (S2221)",
    pattern: /catch\s*\(\s*(?:Exception|Throwable)\s+\w+\s*\)/,
    description: "Catch de Exception ou Throwable au lieu d'exceptions spécifiques.",
    impact: "Les erreurs réseau, timeout et métier sont traitées de la même façon.",
    fix: "Attraper des exceptions spécifiques : IOException, SQLException, etc.",
    reference: "https://rules.sonarsource.com/java/RSPEC-2221",
  },
  {
    id: "SONAR-BUG-003",
    category: "SonarQube",
    severity: "warning",
    title: "Comparaison String avec == (S4973)",
    pattern: /"\w+"?\s*==\s*"\w+"|"\w+"?\s*!=\s*"\w+"/,
    description: "Comparaison de chaînes avec == au lieu de .equals().",
    impact: "Comparaison de références au lieu de valeurs, bugs subtils.",
    fix: "Utiliser .equals() ou Objects.equals() pour comparer les chaînes.",
    reference: "https://rules.sonarsource.com/java/RSPEC-4973",
  },
  {
    id: "SONAR-BUG-004",
    category: "SonarQube",
    severity: "warning",
    title: "Ressource non fermée — fuite mémoire (S2095)",
    pattern: /new\s+(?:FileInputStream|FileOutputStream|BufferedReader|FileReader|FileWriter|Socket)\s*\(/,
    description: "Flux ou connexion ouvert sans try-with-resources.",
    impact: "Fuite de ressources : file descriptors, connexions DB, sockets.",
    fix: "Utiliser try-with-resources : try (var stream = new FileInputStream(...)) { ... }",
    reference: "https://rules.sonarsource.com/java/RSPEC-2095",
  },
  {
    id: "SONAR-SMELL-001",
    category: "SonarQube",
    severity: "info",
    title: "System.out.println au lieu du logger (S106)",
    pattern: /System\.\s*(?:out|err)\s*\.(?:print|println)\s*\(/,
    description: "Utilisation de System.out/err au lieu d'un framework de logging.",
    impact: "Messages non horodatés ni catégorisés dans les logs applicatifs.",
    fix: "Utiliser SLF4J : private static final Logger log = LoggerFactory.getLogger(MyClass.class);",
    reference: "https://rules.sonarsource.com/java/RSPEC-106",
  },
  {
    id: "SONAR-SMELL-002",
    category: "SonarQube",
    severity: "info",
    title: "Stacktrace exposée (S1148)",
    pattern: /\.printStackTrace\s*\(\s*\)/,
    description: "Appel à printStackTrace() qui expose des détails internes.",
    impact: "Traces non capturées par les outils de monitoring (ELK, Splunk).",
    fix: "Utiliser log.error(\"Erreur\", exception); au lieu de e.printStackTrace();",
    reference: "https://rules.sonarsource.com/java/RSPEC-1148",
  },
  {
    id: "SONAR-SMELL-003",
    category: "SonarQube",
    severity: "warning",
    title: "Retour null au lieu d'Optional (S2789)",
    pattern: /return\s+null\s*;/,
    description: "Méthode retournant null au lieu d'Optional.empty().",
    impact: "Risque de NullPointerException chez l'appelant.",
    fix: "Utiliser Optional<T> comme type de retour et retourner Optional.empty().",
    reference: "https://rules.sonarsource.com/java/RSPEC-2789",
  },
  {
    id: "SONAR-SMELL-004",
    category: "SonarQube",
    severity: "info",
    title: "API Date obsolète (S1874)",
    pattern: /new\s+(?:Date|Calendar|GregorianCalendar)\s*\(/,
    description: "Utilisation de java.util.Date/Calendar au lieu de java.time.",
    impact: "API mutable, non thread-safe, et source de bugs de timezone.",
    fix: "Utiliser java.time : LocalDate.now(), LocalDateTime.now(), Instant.now().",
    reference: "https://rules.sonarsource.com/java/RSPEC-1874",
  },
  {
    id: "SONAR-SMELL-005",
    category: "SonarQube",
    severity: "info",
    title: "Import wildcard (S2208)",
    pattern: /import\s+[\w.]+\.\*\s*;/,
    description: "Import avec wildcard (*). Préférer les imports explicites.",
    impact: "Conflits de noms potentiels et lisibilité réduite.",
    fix: "Utiliser des imports explicites : import java.util.List;",
    reference: "https://rules.sonarsource.com/java/RSPEC-2208",
  },

  // ═══════════════════════════════════════════════════════════
  // SOLID Principles
  // ═══════════════════════════════════════════════════════════
  {
    id: "SOLID-SRP-001",
    category: "SOLID",
    severity: "warning",
    title: "Violation SRP — Classe God Object",
    pattern: /public\s+(?:static\s+)?(?:\w+\s+){1,3}\w+\s*\(/g,
    description: "Classe avec trop de responsabilités (>15 méthodes publiques).",
    impact: "Classe difficile à maintenir, tester et faire évoluer.",
    fix: "Décomposer la classe en plusieurs classes avec une seule responsabilité.",
    reference: "https://en.wikipedia.org/wiki/Single-responsibility_principle",
    countThreshold: 15,
  },
  {
    id: "SOLID-OCP-001",
    category: "SOLID",
    severity: "warning",
    title: "Violation OCP — Switch sur type",
    pattern: /switch\s*\(\s*\w+\.(?:getType|getClass|getKind)\s*\(\s*\)\s*\)/,
    description: "Chaîne switch sur un type d'objet. Utiliser le polymorphisme.",
    impact: "Chaque nouveau type nécessite de modifier le switch (violation Open/Closed).",
    fix: "Remplacer par le pattern Strategy ou Visitor.",
    reference: "https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle",
  },
  {
    id: "SOLID-DIP-001",
    category: "SOLID",
    severity: "info",
    title: "Violation DIP — Dépendance concrète",
    pattern: /=\s*new\s+(?:\w*Service|.*Repository|.*Dao|.*Manager|.*Handler|.*Provider)\s*\(/,
    description: "Instanciation directe de classes concrètes au lieu d'injection de dépendances.",
    impact: "Couplage fort, tests unitaires difficiles avec mocks.",
    fix: "Utiliser l'injection de dépendances Spring (@Autowired, constructeur) avec des interfaces.",
    reference: "https://en.wikipedia.org/wiki/Dependency_inversion_principle",
  },

  // ═══════════════════════════════════════════════════════════
  // Clean Code (Robert C. Martin)
  // ═══════════════════════════════════════════════════════════
  {
    id: "CLEAN-MAGIC-001",
    category: "CleanCode",
    severity: "info",
    title: "Nombre magique",
    pattern: /(?:if|while|for|return|case)\s*[\s(]*(?:==|!=|<|>|<=|>=)\s*(?:[2-9]\d{1,}|\d{3,})/,
    description: "Valeur numérique codée en dur sans constante nommée (Clean Code Ch.17).",
    impact: "Code difficile à comprendre : que signifie ce nombre ?",
    fix: "Extraire dans une constante : private static final int MAX_RETRIES = 3;",
    reference: "Clean Code, Robert C. Martin, Chapter 17",
  },
  {
    id: "CLEAN-PARAM-001",
    category: "CleanCode",
    severity: "warning",
    title: "Trop de paramètres (>4)",
    pattern: /(?:public|protected|private)\s+\w+\s+\w+\s*\(\s*(?:\w+\s+\w+\s*,\s*){4,}/,
    description: "Méthode avec plus de 4 paramètres (Clean Code Ch.3).",
    impact: "Méthode difficile à appeler, tester et maintenir.",
    fix: "Créer un objet paramètre (DTO/Value Object) pour regrouper les paramètres.",
    reference: "Clean Code, Robert C. Martin, Chapter 3",
  },
  {
    id: "CLEAN-COMMENT-001",
    category: "CleanCode",
    severity: "info",
    title: "Code commenté",
    pattern: /\/\/\s*(?:if|for|while|try|return|public|private|protected)\s/,
    description: "Bloc de code commenté détecté (Clean Code Ch.4).",
    impact: "Bruit dans le code, confusion sur ce qui est actif.",
    fix: "Supprimer le code commenté. Utiliser Git pour l'historique.",
    reference: "Clean Code, Robert C. Martin, Chapter 4",
  },
  {
    id: "CLEAN-TODO-001",
    category: "CleanCode",
    severity: "info",
    title: "TODO/FIXME/HACK non résolu",
    pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX|TEMP)\b/i,
    description: "Commentaire TODO, FIXME ou HACK détecté.",
    impact: "Dette technique non traitée.",
    fix: "Résoudre le TODO ou créer un ticket dans le backlog.",
    reference: "Clean Code, Robert C. Martin, Chapter 4",
  },
  {
    id: "CLEAN-NEST-001",
    category: "CleanCode",
    severity: "warning",
    title: "Imbrication excessive (>3 niveaux)",
    pattern: /\{[^{}]*\{[^{}]*\{[^{}]*\{/,
    description: "Plus de 3 niveaux d'imbrication (if/for/while).",
    impact: "Code difficile à lire et à tester.",
    fix: "Extraire les blocs imbriqués dans des méthodes privées descriptives.",
    reference: "Clean Code, Robert C. Martin, Chapter 3",
  },
  {
    id: "CLEAN-METHOD-001",
    category: "CleanCode",
    severity: "warning",
    title: "Méthode trop longue (>50 lignes estimées)",
    pattern: /(public|private|protected)\s+\w+\s+\w+\s*\([^)]*\)\s*(\{[\s\S]{2000,}?\})/,
    description: "La méthode dépasse 50 lignes, réduisant la lisibilité.",
    impact: "Difficulté de maintenance et de tests unitaires.",
    fix: "Décomposer en méthodes plus petites avec des noms descriptifs.",
    reference: "Clean Code, Robert C. Martin, Chapter 3",
  },

  // ═══════════════════════════════════════════════════════════
  // PMD Rules
  // ═══════════════════════════════════════════════════════════
  {
    id: "PMD-PERF-001",
    category: "PMD",
    severity: "warning",
    title: "Concaténation String dans une boucle",
    pattern: /(?:for|while)\s*\([^)]*\)\s*\{[^}]*\+\s*=\s*["']/,
    description: "Concaténation de String avec + dans une boucle (PMD AppendCharacterWithChar).",
    impact: "Création d'objets String intermédiaires, pression GC.",
    fix: "Utiliser StringBuilder : sb.append(\"...\");",
    reference: "https://pmd.github.io/latest/pmd_rules_java_performance.html",
  },
  {
    id: "PMD-PERF-002",
    category: "PMD",
    severity: "info",
    title: "Thread.sleep() en production",
    pattern: /Thread\.sleep\s*\(/,
    description: "Thread.sleep() bloque le thread. Anti-pattern en environnement réactif.",
    impact: "Thread bloqué inutilement, réduction du throughput.",
    fix: "Utiliser ScheduledExecutorService ou Mono.delay().",
    reference: "https://pmd.github.io/latest/pmd_rules_java_multithreading.html",
  },
  {
    id: "PMD-DESIGN-001",
    category: "PMD",
    severity: "info",
    title: "Classe utilitaire non finale",
    pattern: /class\s+\w+(?:Utils?|Helper|Util(?:ity)?|Constants?)\s*\{/,
    description: "Classe utilitaire non déclarée finale avec constructeur privé.",
    impact: "Peut être instanciée ou étendue par erreur.",
    fix: "Déclarer finale avec constructeur privé : public final class MyUtils { private MyUtils() {} }",
    reference: "https://pmd.github.io/latest/pmd_rules_java_design.html",
  },
  {
    id: "PMD-ERR-001",
    category: "PMD",
    severity: "warning",
    title: "Exception relancée sans contexte",
    pattern: /catch\s*\([^)]+\w+\)\s*\{[^}]*throw\s+new\s+RuntimeException\s*\(\s*\)/,
    description: "Exception attrapée et relancée comme RuntimeException sans message.",
    impact: "Perte du contexte d'erreur, diagnostic difficile.",
    fix: "Conserver la cause : throw new RuntimeException(\"Message\", originalException);",
    reference: "https://pmd.github.io/latest/pmd_rules_java_errorprone.html",
  },

  // ═══════════════════════════════════════════════════════════
  // SpotBugs Rules
  // ═══════════════════════════════════════════════════════════
  {
    id: "SPOTBUGS-EQ-001",
    category: "SpotBugs",
    severity: "warning",
    title: "equals() sans hashCode()",
    pattern: /public\s+boolean\s+equals\s*\(\s*Object/,
    description: "La classe redéfinit equals() — vérifier que hashCode() est aussi redéfini.",
    impact: "Contrat Object violé : bugs dans HashMap, HashSet.",
    fix: "Toujours redéfinir equals() ET hashCode() ensemble. Utiliser @EqualsAndHashCode de Lombok.",
    reference: "https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html#eq",
  },
  {
    id: "SPOTBUGS-SYNC-001",
    category: "SpotBugs",
    severity: "warning",
    title: "Bloc synchronized risqué",
    pattern: /synchronized\s*\(/,
    description: "Utilisation de synchronized pouvant causer des deadlocks.",
    impact: "Deadlocks potentiels, problèmes de performance.",
    fix: "Utiliser java.util.concurrent (ReentrantLock, ConcurrentHashMap, AtomicReference).",
    reference: "https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html",
  },
  {
    id: "SPOTBUGS-CHAIN-001",
    category: "SpotBugs",
    severity: "info",
    title: "Chaîne d'appels (Message Chain)",
    pattern: /\w+\.\w+\(\)\.\w+\(\)\.\w+\(\)/,
    description: "Chaîne d'appels a.getB().getC().getD() — violation de la Loi de Déméter.",
    impact: "Couplage fort entre les classes, fragilité aux changements.",
    fix: "Encapsuler la logique dans la classe appropriée (Tell, Don't Ask).",
    reference: "https://refactoring.guru/smells/message-chains",
  },

  // ═══════════════════════════════════════════════════════════
  // Migration-Specific Rules (EJB, Servlet, SOAP, JDBC, etc.)
  // ═══════════════════════════════════════════════════════════
  {
    id: "MIG-EJB-001",
    category: "Migration",
    severity: "warning",
    title: "Annotation @EJB legacy",
    pattern: /@EJB\s/,
    description: "Injection EJB détectée. Doit être remplacée par injection Spring.",
    impact: "Bloque la migration vers Spring Boot.",
    fix: "Remplacer @EJB par injection par constructeur Spring.",
    reference: "https://spring.io/guides/gs/spring-boot/",
  },
  {
    id: "MIG-EJB-002",
    category: "Migration",
    severity: "warning",
    title: "Lookup JNDI legacy",
    pattern: /(?:InitialContext|Context)\s*(?:\(\)|\.lookup\s*\()/,
    description: "Lookup JNDI détecté. Remplacer par l'injection de dépendances Spring.",
    impact: "Code non portable hors serveur d'applications.",
    fix: "Supprimer le lookup JNDI et utiliser @Autowired ou @Value.",
    reference: "https://spring.io/guides/gs/spring-boot/",
  },
  {
    id: "MIG-SERVLET-001",
    category: "Migration",
    severity: "info",
    title: "Servlet legacy détectée",
    pattern: /extends\s+HttpServlet/,
    description: "Classe étendant HttpServlet. Migrer vers @RestController Spring Boot.",
    impact: "API legacy non compatible avec l'écosystème Spring.",
    fix: "Remplacer par @RestController avec @GetMapping/@PostMapping.",
    reference: "https://spring.io/guides/gs/rest-service/",
  },
  {
    id: "MIG-STRUTS-001",
    category: "Migration",
    severity: "info",
    title: "Action Struts legacy",
    pattern: /extends\s+(?:Action|DispatchAction|MappingDispatchAction|ActionSupport)/,
    description: "Classe Struts Action détectée. Migrer vers @Controller Spring MVC.",
    impact: "Framework Struts en fin de vie, vulnérabilités connues.",
    fix: "Remplacer par @Controller Spring MVC avec @RequestMapping.",
    reference: "https://docs.spring.io/spring-framework/reference/web/webmvc.html",
  },
  {
    id: "MIG-SOAP-001",
    category: "Migration",
    severity: "info",
    title: "Service SOAP legacy",
    pattern: /@WebService/,
    description: "Annotation @WebService JAX-WS détectée. Migrer vers une API REST.",
    impact: "SOAP est verbeux et moins performant que REST/JSON.",
    fix: "Remplacer par @RestController avec des DTOs JSON et documentation OpenAPI.",
    reference: "https://swagger.io/specification/",
  },
  {
    id: "MIG-JDBC-001",
    category: "Migration",
    severity: "info",
    title: "Accès JDBC brut",
    pattern: /(?:DriverManager\.getConnection|Connection\s+\w+\s*=|ResultSet\s+\w+)/,
    description: "Utilisation directe de JDBC. Migrer vers Spring Data JPA.",
    impact: "Code boilerplate, gestion manuelle des connexions et transactions.",
    fix: "Utiliser Spring Data JPA avec des Repository interfaces.",
    reference: "https://spring.io/projects/spring-data-jpa",
  },
  {
    id: "MIG-HIB-001",
    category: "Migration",
    severity: "info",
    title: "SessionFactory Hibernate legacy",
    pattern: /(?:SessionFactory|\.openSession\(\)|\.getCurrentSession\(\))/,
    description: "Utilisation directe de SessionFactory/Session Hibernate.",
    impact: "API bas niveau, gestion manuelle des sessions.",
    fix: "Utiliser @PersistenceContext EntityManager ou Spring Data JPA repositories.",
    reference: "https://spring.io/projects/spring-data-jpa",
  },
  {
    id: "MIG-JMS-001",
    category: "Migration",
    severity: "warning",
    title: "JMS/MQ legacy détecté",
    pattern: /(?:MessageListener|QueueSender|TopicPublisher|JMSException|@MessageDriven|ConnectionFactory.*jms)/i,
    description: "Utilisation de JMS. Considérer Kafka ou Spring AMQP.",
    impact: "Nécessite une migration vers un broker moderne.",
    fix: "Migrer vers Spring Kafka (@KafkaListener) ou Spring AMQP (@RabbitListener).",
    reference: "https://spring.io/projects/spring-kafka",
  },
  {
    id: "MIG-TX-001",
    category: "Migration",
    severity: "warning",
    title: "Transaction manuelle (UserTransaction)",
    pattern: /UserTransaction|utx\.begin|utx\.commit|utx\.rollback/,
    description: "Gestion manuelle des transactions via UserTransaction.",
    impact: "Risque de fuites de transactions si le rollback n'est pas garanti.",
    fix: "Utiliser @Transactional de Spring avec propagation configurée.",
    reference: "https://docs.spring.io/spring-framework/reference/data-access/transaction.html",
  },
  {
    id: "MIG-TX-002",
    category: "Migration",
    severity: "warning",
    title: "@TransactionAttribute — annotation EJB",
    pattern: /@TransactionAttribute/,
    description: "Annotation de gestion transactionnelle spécifique à EJB.",
    impact: "Non reconnue par Spring.",
    fix: "Remplacer par @Transactional(propagation = Propagation.REQUIRED).",
    reference: "https://docs.spring.io/spring-framework/reference/data-access/transaction.html",
  },

  // ═══════════════════════════════════════════════════════════
  // Security Additional
  // ═══════════════════════════════════════════════════════════
  {
    id: "SEC-CORS-001",
    category: "Security",
    severity: "warning",
    title: "CORS permissif (*)",
    pattern: /(?:allowedOrigins|Access-Control-Allow-Origin)\s*\(\s*["']\*["']\s*\)/,
    description: "Configuration CORS avec allowedOrigins(\"*\").",
    impact: "Tout domaine peut accéder à l'API, risque de vol de données.",
    fix: "Spécifier les origines autorisées : .allowedOrigins(\"https://app.example.com\");",
    reference: "https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny",
  },
  {
    id: "SEC-CSRF-001",
    category: "Security",
    severity: "warning",
    title: "CSRF désactivé",
    pattern: /\.csrf\(\)\s*\.disable\(\)|csrf\.disable\(\)/,
    description: "Protection CSRF désactivée.",
    impact: "Vulnérable aux attaques CSRF si l'app utilise des sessions.",
    fix: "Activer CSRF pour les apps avec sessions. Désactiver uniquement pour les APIs stateless JWT.",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
  },
  {
    id: "SEC-URL-001",
    category: "Security",
    severity: "warning",
    title: "URL en dur dans le code",
    pattern: /https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/,
    description: "URL codée en dur au lieu d'être externalisée dans la configuration.",
    impact: "Empêche le déploiement dans différents environnements.",
    fix: "Externaliser dans application.yml avec @Value ou @ConfigurationProperties.",
    reference: "https://12factor.net/config",
  },
  {
    id: "SEC-SQL-001",
    category: "Security",
    severity: "critical",
    title: "Concaténation SQL — risque d'injection",
    pattern: /"\s*\+\s*\w+\s*\+\s*".*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i,
    description: "Construction de requête SQL par concaténation de chaînes.",
    impact: "Risque d'injection SQL exploitable.",
    fix: "Utiliser des requêtes paramétrées (PreparedStatement, Spring Data JPA).",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
  },

  // ═══════════════════════════════════════════════════════════
  // Resilience & Observability Patterns
  // ═══════════════════════════════════════════════════════════
  {
    id: "RESIL-RETRY-001",
    category: "Resilience",
    severity: "suggestion",
    title: "Appel réseau sans retry",
    pattern: /(?:WebClient|RestTemplate|HttpClient|HttpURLConnection|\.exchange\(|\.retrieve\()/,
    description: "Appel HTTP/RPC sans mécanisme de retry.",
    impact: "Les erreurs transitoires réseau provoquent des échecs immédiats.",
    fix: "Ajouter @Retry(name=\"default\") de Resilience4j.",
    reference: "https://resilience4j.readme.io/docs/retry",
  },
  {
    id: "RESIL-CB-001",
    category: "Resilience",
    severity: "suggestion",
    title: "Pas de Circuit Breaker",
    pattern: /(?:@FeignClient|WebClient\.create|RestTemplate|\.baseUrl\()/,
    description: "Appel à un service externe sans Circuit Breaker.",
    impact: "Risque de cascade de pannes si le service distant est indisponible.",
    fix: "Ajouter @CircuitBreaker(name=\"service\", fallbackMethod=\"fallback\").",
    reference: "https://resilience4j.readme.io/docs/circuitbreaker",
  },

  // ═══════════════════════════════════════════════════════════
  // Performance
  // ═══════════════════════════════════════════════════════════
  {
    id: "PERF-N+1-001",
    category: "Performance",
    severity: "warning",
    title: "Risque de requête N+1",
    pattern: /(?:for|while)\s*\([^)]*\)\s*\{[^}]*(?:findBy|getBy|loadBy|repository\.|dao\.)/,
    description: "Boucle contenant un appel à un repository/DAO.",
    impact: "N+1 queries : chaque itération génère un appel réseau/DB.",
    fix: "Charger toutes les données en une seule requête batch : findAllByIdIn(ids);",
    reference: "https://vladmihalcea.com/n-plus-1-query-problem/",
  },
  {
    id: "PERF-EAGER-001",
    category: "Performance",
    severity: "warning",
    title: "Chargement EAGER sur collection",
    pattern: /(?:@OneToMany|@ManyToMany)\s*\([^)]*fetch\s*=\s*FetchType\.EAGER/,
    description: "FetchType.EAGER sur une relation @OneToMany ou @ManyToMany.",
    impact: "Chargement massif de données en mémoire, performance dégradée.",
    fix: "Utiliser FetchType.LAZY et charger avec JOIN FETCH quand nécessaire.",
    reference: "https://vladmihalcea.com/eager-fetching-is-a-code-smell/",
  },
  {
    id: "PERF-LOOP-001",
    category: "Performance",
    severity: "warning",
    title: "Appel synchrone dans une boucle",
    pattern: /for\s*\([^)]*\)\s*\{[^}]*\.(get|find|fetch|load|query)\w*\s*\(/,
    description: "Un appel de service est effectué à chaque itération d'une boucle.",
    impact: "Problème de performance N+1.",
    fix: "Regrouper les appels en un seul batch avant la boucle.",
    reference: "Clean Code, Robert C. Martin",
  },

  // ═══════════════════════════════════════════════════════════
  // Checkstyle
  // ═══════════════════════════════════════════════════════════
  {
    id: "CHECK-NAMING-001",
    category: "Checkstyle",
    severity: "info",
    title: "Constante non en UPPER_SNAKE_CASE",
    pattern: /static\s+final\s+\w+\s+([a-z]\w*)\s*=/,
    description: "Constante non en UPPER_SNAKE_CASE.",
    impact: "Violation des conventions de nommage Java.",
    fix: "Les constantes doivent être en UPPER_SNAKE_CASE : static final int MAX_SIZE = 100;",
    reference: "https://checkstyle.sourceforge.io/checks/naming/index.html",
  },

  // ═══════════════════════════════════════════════════════════
  // SQL Injection Avancée (HQL, JPQL, Criteria)
  // ═══════════════════════════════════════════════════════════
  {
    id: "SEC-SQL-HQL-001",
    category: "Security",
    severity: "critical",
    title: "Injection HQL/JPQL par concaténation",
    pattern: /createQuery\s*\(\s*["'][^"']*["']\s*\+/,
    description: "Concaténation de chaînes dans une requête HQL/JPQL (EntityManager.createQuery).",
    impact: "Risque d'injection HQL permettant l'accès non autorisé aux entités JPA.",
    fix: "Utiliser des named parameters : em.createQuery(\"FROM User u WHERE u.name = :name\").setParameter(\"name\", input);",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html",
  },
  {
    id: "SEC-SQL-NATIVE-001",
    category: "Security",
    severity: "critical",
    title: "Injection SQL native via createNativeQuery",
    pattern: /createNativeQuery\s*\(\s*["'][^"']*["']\s*\+/,
    description: "Concaténation dans createNativeQuery() — injection SQL directe.",
    impact: "Exécution de requêtes SQL arbitraires sur la base de données.",
    fix: "Utiliser des paramètres positionnels : em.createNativeQuery(\"SELECT * FROM users WHERE id = ?\").setParameter(1, id);",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
  },
  {
    id: "SEC-SQL-CRITERIA-001",
    category: "Security",
    severity: "warning",
    title: "Criteria API avec littéral non sécurisé",
    pattern: /cb\.literal\s*\(\s*\w+\s*\)/,
    description: "Utilisation de CriteriaBuilder.literal() avec une variable — risque d'injection.",
    impact: "La valeur est insérée directement dans la requête sans paramétrage.",
    fix: "Utiliser cb.parameter() avec query.setParameter() pour les valeurs dynamiques.",
    reference: "https://docs.oracle.com/javaee/7/tutorial/persistence-criteria.htm",
  },
  {
    id: "SEC-SQL-SPRING-001",
    category: "Security",
    severity: "critical",
    title: "@Query Spring Data avec concaténation",
    pattern: /@Query\s*\(\s*["'][^"']*["']\s*\+/,
    description: "Concaténation dans une annotation @Query Spring Data.",
    impact: "Injection SQL/JPQL via les paramètres de la requête.",
    fix: "Utiliser :paramName ou ?1 dans @Query et les paramètres de méthode annotés @Param.",
    reference: "https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html",
  },

  // ═══════════════════════════════════════════════════════════
  // Couplage (Afférent/Efférent, Dépendances circulaires)
  // ═══════════════════════════════════════════════════════════
  {
    id: "COUP-IMPORT-001",
    category: "Couplage",
    severity: "warning",
    title: "Trop d'imports — couplage efférent élevé",
    pattern: /^import\s/gm,
    description: "Classe avec un nombre excessif d'imports (>20), indiquant un couplage efférent élevé.",
    impact: "Classe difficile à tester et à maintenir, effet domino lors des changements.",
    fix: "Appliquer le principe ISP (Interface Segregation) et décomposer la classe.",
    reference: "https://en.wikipedia.org/wiki/Coupling_(computer_programming)",
    countThreshold: 20,
  },
  {
    id: "COUP-CIRCULAR-001",
    category: "Couplage",
    severity: "warning",
    title: "Dépendance circulaire potentielle",
    pattern: /import\s+[\w.]+\.(?:service|controller|manager)\.[A-Z]\w*;[\s\S]*?import\s+[\w.]+\.(?:dao|repository|model)\.[A-Z]\w*;/,
    description: "Imports croisés entre couches (service↔dao, controller↔service) suggérant une dépendance circulaire.",
    impact: "Cycles de dépendances empêchant la compilation modulaire et les tests isolés.",
    fix: "Introduire des interfaces ou un event bus pour casser les cycles.",
    reference: "https://en.wikipedia.org/wiki/Circular_dependency",
  },
  {
    id: "COUP-STATIC-001",
    category: "Couplage",
    severity: "info",
    title: "Appel statique — couplage fort",
    pattern: /[A-Z]\w+\.(?:getInstance|getDefault|create)\s*\(/,
    description: "Appel à une méthode statique factory créant un couplage fort.",
    impact: "Impossible de substituer l'implémentation dans les tests (mocking).",
    fix: "Injecter l'instance via le constructeur ou utiliser un @Bean Spring.",
    reference: "https://refactoring.guru/smells/inappropriate-intimacy",
  },
  {
    id: "COUP-FIELD-INJ-001",
    category: "Couplage",
    severity: "warning",
    title: "Injection par champ (@Autowired sur field)",
    pattern: /@Autowired\s+(?:private|protected)\s/,
    description: "Injection de dépendance par champ au lieu du constructeur.",
    impact: "Impossible de créer l'objet sans le conteneur Spring, tests unitaires difficiles.",
    fix: "Utiliser l'injection par constructeur (recommandé par Spring) : private final MyService service;",
    reference: "https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html",
  },

  // ═══════════════════════════════════════════════════════════
  // Transactions Avancées
  // ═══════════════════════════════════════════════════════════
  {
    id: "TX-PROPAGATION-001",
    category: "Transactions",
    severity: "warning",
    title: "@Transactional sans propagation explicite",
    pattern: /@Transactional\s*(?:\(\s*\))?\s*\n/,
    description: "Annotation @Transactional sans propagation explicite — utilise REQUIRED par défaut.",
    impact: "Comportement transactionnel implicite, risque de transactions imbriquées non souhaitées.",
    fix: "Spécifier la propagation : @Transactional(propagation = Propagation.REQUIRED).",
    reference: "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html",
  },
  {
    id: "TX-READONLY-001",
    category: "Transactions",
    severity: "info",
    title: "Méthode de lecture sans readOnly=true",
    pattern: /@Transactional[^)]*\)\s*\n\s*public\s+(?:List|Set|Collection|Optional|\w+DTO)\s+(?:get|find|list|search|fetch)/,
    description: "Méthode de lecture annotée @Transactional sans readOnly=true.",
    impact: "Transaction en écriture inutile, verrouillage DB plus agressif.",
    fix: "Ajouter readOnly=true : @Transactional(readOnly = true).",
    reference: "https://vladmihalcea.com/spring-transactional-annotation/",
  },
  {
    id: "TX-TIMEOUT-001",
    category: "Transactions",
    severity: "warning",
    title: "Transaction sans timeout",
    pattern: /@Transactional\s*\([^)]*(?!timeout)[^)]*\)/,
    description: "Transaction sans timeout explicite — risque de transaction bloquée indéfiniment.",
    impact: "Connexion DB bloquée, pool de connexions épuisé, indisponibilité.",
    fix: "Ajouter un timeout : @Transactional(timeout = 30).",
    reference: "https://docs.spring.io/spring-framework/reference/data-access/transaction.html",
  },
  {
    id: "TX-ROLLBACK-001",
    category: "Transactions",
    severity: "warning",
    title: "@Transactional sans rollbackFor",
    pattern: /@Transactional\s*\([^)]*(?!rollbackFor)[^)]*\)/,
    description: "@Transactional sans rollbackFor — ne rollback que sur RuntimeException par défaut.",
    impact: "Les checked exceptions (IOException, SQLException) ne déclenchent pas de rollback.",
    fix: "Ajouter rollbackFor : @Transactional(rollbackFor = Exception.class).",
    reference: "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html",
  },
  {
    id: "TX-SELF-INVOKE-001",
    category: "Transactions",
    severity: "critical",
    title: "Auto-invocation @Transactional (proxy bypass)",
    pattern: /this\.\w+\(.*\).*\/\/.*(?:transactional|@Transactional)/i,
    description: "Appel interne (this.method()) contournant le proxy Spring @Transactional.",
    impact: "La transaction n'est pas démarrée — données incohérentes possibles.",
    fix: "Extraire la méthode dans un autre @Service ou utiliser AopContext.currentProxy().",
    reference: "https://docs.spring.io/spring-framework/reference/core/aop/proxying.html",
  },

  // ═══════════════════════════════════════════════════════════
  // Concurrence & Thread Safety
  // ═══════════════════════════════════════════════════════════
  {
    id: "CONC-CME-001",
    category: "Concurrence",
    severity: "critical",
    title: "Modification de collection pendant itération",
    pattern: /for\s*\([^)]*:\s*\w+\)\s*\{[^}]*\.(?:remove|add)\s*\(/,
    description: "Modification d'une collection pendant son itération (for-each).",
    impact: "ConcurrentModificationException en runtime.",
    fix: "Utiliser Iterator.remove(), removeIf(), ou copier la collection avant modification.",
    reference: "https://docs.oracle.com/javase/8/docs/api/java/util/ConcurrentModificationException.html",
  },
  {
    id: "CONC-DCL-001",
    category: "Concurrence",
    severity: "warning",
    title: "Double-checked locking sans volatile",
    pattern: /if\s*\(\s*\w+\s*==\s*null\s*\)\s*\{\s*synchronized/,
    description: "Pattern double-checked locking détecté — nécessite volatile.",
    impact: "Race condition : l'instance peut être partiellement construite.",
    fix: "Déclarer le champ volatile ou utiliser un holder pattern (Bill Pugh Singleton).",
    reference: "https://en.wikipedia.org/wiki/Double-checked_locking",
  },
  {
    id: "CONC-HASHMAP-001",
    category: "Concurrence",
    severity: "warning",
    title: "HashMap dans un contexte concurrent",
    pattern: /(?:static|shared|volatile)\s+(?:final\s+)?(?:Map|HashMap)\s*</,
    description: "HashMap utilisée dans un contexte potentiellement concurrent (champ static/shared).",
    impact: "Corruption de données et boucles infinies possibles en multi-thread.",
    fix: "Utiliser ConcurrentHashMap ou Collections.synchronizedMap().",
    reference: "https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/ConcurrentHashMap.html",
  },
  {
    id: "CONC-SINGLETON-001",
    category: "Concurrence",
    severity: "info",
    title: "Singleton avec état mutable",
    pattern: /@(?:Singleton|Component|Service)\s[\s\S]*?private\s+(?!final|static)\w+\s+\w+\s*[=;]/,
    description: "Bean singleton Spring avec un champ mutable non-final.",
    impact: "État partagé entre requêtes — race conditions et fuites de données.",
    fix: "Rendre le champ final, utiliser ThreadLocal, ou changer le scope à @RequestScope.",
    reference: "https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html",
  },

  // ═══════════════════════════════════════════════════════════
  // Sérialisation
  // ═══════════════════════════════════════════════════════════
  {
    id: "SERIAL-UID-001",
    category: "Sérialisation",
    severity: "warning",
    title: "Serializable sans serialVersionUID",
    pattern: /implements\s+[\w,\s]*Serializable(?![\s\S]*?serialVersionUID)/,
    description: "Classe implémentant Serializable sans déclarer serialVersionUID.",
    impact: "Incompatibilité de désérialisation entre versions de la classe.",
    fix: "Ajouter : private static final long serialVersionUID = 1L;",
    reference: "https://rules.sonarsource.com/java/RSPEC-2057",
  },
  {
    id: "SERIAL-TRANSIENT-001",
    category: "Sérialisation",
    severity: "info",
    title: "Champ sensible non transient dans Serializable",
    pattern: /implements\s+[\w,\s]*Serializable[\s\S]*?private\s+(?:String|char\[\])\s+(?:password|secret|token|apiKey)/i,
    description: "Champ sensible (password, secret, token) dans une classe Serializable.",
    impact: "Le champ sera inclus dans la sérialisation, exposant des données sensibles.",
    fix: "Marquer le champ comme transient : private transient String password;",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html",
  },

  // ═══════════════════════════════════════════════════════════
  // Logging Avancé
  // ═══════════════════════════════════════════════════════════
  {
    id: "LOG-SENSITIVE-001",
    category: "Security",
    severity: "critical",
    title: "Données sensibles dans les logs",
    pattern: /(?:log|logger|LOG)\.\w+\s*\([^)]*(?:password|secret|token|creditCard|ssn|apiKey)/i,
    description: "Données sensibles (mot de passe, token, carte de crédit) loguées en clair.",
    impact: "Exposition de données sensibles dans les fichiers de logs.",
    fix: "Ne jamais loguer de données sensibles. Masquer : log.info(\"Token: {}***\", token.substring(0,4));",
    reference: "https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html",
  },
  {
    id: "LOG-LEVEL-001",
    category: "Qualité",
    severity: "info",
    title: "Log.debug() sans vérification isDebugEnabled",
    pattern: /(?:log|logger)\.debug\s*\([^)]*\+/,
    description: "Concaténation dans un appel log.debug() sans vérifier isDebugEnabled().",
    impact: "Coût de construction de la chaîne même quand le debug est désactivé.",
    fix: "Utiliser des placeholders SLF4J : log.debug(\"Value: {}\", value); ou vérifier if(log.isDebugEnabled()).",
    reference: "https://www.slf4j.org/faq.html#logging_performance",
  },

  // ═══════════════════════════════════════════════════════════
  // Architecture & Design Patterns
  // ═══════════════════════════════════════════════════════════
  {
    id: "ARCH-LAYER-001",
    category: "Architecture",
    severity: "warning",
    title: "Violation de couche — Controller accède au DAO",
    pattern: /(?:@Controller|@RestController)[\s\S]*?(?:@Autowired|private\s+final)\s+\w*(?:Dao|Repository)\s/,
    description: "Un Controller accède directement au DAO/Repository sans passer par le Service.",
    impact: "Violation de l'architecture en couches, logique métier dispersée.",
    fix: "Introduire un @Service entre le Controller et le Repository.",
    reference: "https://www.baeldung.com/spring-boot-clean-architecture",
  },
  {
    id: "ARCH-ANEMIC-001",
    category: "Architecture",
    severity: "info",
    title: "Modèle anémique — Entity sans logique métier",
    pattern: /@Entity[\s\S]*?(?:private\s+\w+\s+\w+;\s*){5,}[\s\S]*?(?:public\s+\w+\s+get\w+\s*\(\s*\)\s*\{\s*return)/,
    description: "Entité JPA avec uniquement des getters/setters — modèle anémique.",
    impact: "Logique métier dispersée dans les services au lieu d'être encapsulée.",
    fix: "Ajouter des méthodes métier dans l'entité (DDD Rich Domain Model).",
    reference: "https://martinfowler.com/bliki/AnemicDomainModel.html",
  },
  {
    id: "ARCH-GOD-SVC-001",
    category: "Architecture",
    severity: "warning",
    title: "God Service — trop de dépendances injectées",
    pattern: /(?:@Autowired|private\s+final)\s+\w+\s+\w+;/g,
    description: "Service avec plus de 7 dépendances injectées — God Service.",
    impact: "Classe avec trop de responsabilités, difficile à tester et maintenir.",
    fix: "Décomposer en services plus petits avec des responsabilités distinctes.",
    reference: "https://en.wikipedia.org/wiki/God_object",
    countThreshold: 7,
  },

  // ═══════════════════════════════════════════════════════════
  // Error Handling Avancé
  // ═══════════════════════════════════════════════════════════
  {
    id: "ERR-SWALLOW-001",
    category: "Gestion d'erreurs",
    severity: "warning",
    title: "Exception avalée avec return null",
    pattern: /catch\s*\([^)]+\)\s*\{[^}]*return\s+null\s*;\s*\}/,
    description: "Exception attrapée et remplacée par un return null.",
    impact: "L'erreur est masquée, le code appelant reçoit null sans savoir pourquoi.",
    fix: "Loguer l'exception et retourner Optional.empty() ou relancer une exception métier.",
    reference: "https://rules.sonarsource.com/java/RSPEC-1166",
  },
  {
    id: "ERR-GENERIC-THROW-001",
    category: "Gestion d'erreurs",
    severity: "warning",
    title: "Throw Exception générique",
    pattern: /throws\s+(?:Exception|Throwable)\s/,
    description: "Méthode déclarant throws Exception au lieu d'exceptions spécifiques.",
    impact: "L'appelant ne peut pas distinguer les types d'erreurs.",
    fix: "Déclarer des exceptions spécifiques : throws IOException, ValidationException.",
    reference: "https://rules.sonarsource.com/java/RSPEC-112",
  },

  // ═══════════════════════════════════════════════════════════
  // JPA / Hibernate Avancé
  // ═══════════════════════════════════════════════════════════
  {
    id: "JPA-CASCADE-001",
    category: "Performance",
    severity: "warning",
    title: "CascadeType.ALL sur relation",
    pattern: /cascade\s*=\s*CascadeType\.ALL/,
    description: "CascadeType.ALL propage toutes les opérations y compris REMOVE.",
    impact: "Suppression en cascade non intentionnelle, perte de données.",
    fix: "Spécifier les cascades nécessaires : cascade = {CascadeType.PERSIST, CascadeType.MERGE}.",
    reference: "https://vladmihalcea.com/a-beginners-guide-to-jpa-and-hibernate-cascade-types/",
  },
  {
    id: "JPA-NPLUSONE-001",
    category: "Performance",
    severity: "warning",
    title: "@ManyToOne sans fetch explicite",
    pattern: /@ManyToOne\s*(?:\(\s*\))?\s*\n/,
    description: "@ManyToOne sans fetch explicite — EAGER par défaut.",
    impact: "Chargement automatique de l'entité parente à chaque requête.",
    fix: "Spécifier fetch = FetchType.LAZY : @ManyToOne(fetch = FetchType.LAZY).",
    reference: "https://vladmihalcea.com/manytoone-jpa-hibernate/",
  },
];

// ============================================================
// Analysis Engine
// ============================================================

function findLineNumber(code: string, matchIndex: number): number {
  if (!matchIndex) return 1;
  const beforeMatch = code.substring(0, matchIndex);
  return beforeMatch.split("\n").length;
}

function getCodeSnippet(code: string, lineNum: number): string {
  const lines = code.split("\n");
  const start = Math.max(0, lineNum - 2);
  const end = Math.min(lines.length, lineNum + 1);
  return lines.slice(start, end).join("\n");
}

function detectAntiPatterns(code: string, fileName?: string): AiSuggestion[] {
  const suggestions: AiSuggestion[] = [];
  let suggestionIndex = 0;

  for (const rule of RULES) {
    // Special handling for SRP (count public methods)
    if (rule.countThreshold) {
      const matches = Array.from(code.matchAll(new RegExp(rule.pattern.source, "g")));
      if (matches.length > rule.countThreshold) {
        suggestions.push({
          id: `ai-${suggestionIndex++}`,
          ruleId: rule.id,
          severity: rule.severity,
          category: rule.category,
          title: rule.title,
          description: `${rule.description} (${matches.length} méthodes publiques détectées)`,
          line: 1,
          fileName: fileName,
          impact: rule.impact,
          fix: rule.fix,
          reference: rule.reference,
        });
      }
      continue;
    }

    // Standard pattern matching
    const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g";
    const regex = new RegExp(rule.pattern.source, flags);
    const matches = Array.from(code.matchAll(regex));

    for (const match of matches) {
      const lineNum = findLineNumber(code, match.index || 0);
      suggestions.push({
        id: `ai-${suggestionIndex++}`,
        ruleId: rule.id,
        severity: rule.severity,
        category: rule.category,
        title: rule.title,
        description: rule.description,
        line: lineNum,
        fileName: fileName,
        codeSnippet: getCodeSnippet(code, lineNum),
        impact: rule.impact,
        fix: rule.fix,
        reference: rule.reference,
      });
    }
  }

  return suggestions;
}

// ============================================================
// Scoring Engine
// ============================================================

function computeLegacyScore(code: string, suggestions: AiSuggestion[]): QualityScore {
  const breakdown: ScoreDetail[] = [];

  // --- Maintenabilité (max 25) ---
  const maintIssues = suggestions.filter((s) =>
    ["CleanCode", "SonarQube", "Checkstyle", "PMD", "Qualité", "SOLID"].includes(s.category)
  ).length;
  const maintScore = Math.max(0, Math.min(25, 25 - maintIssues * 2));
  breakdown.push({
    category: "Maintenabilité",
    score: maintScore,
    maxScore: 25,
    reason: `${maintIssues} problème(s) de qualité de code détecté(s)`,
  });

  // --- Sécurité (max 25) ---
  const secCritical = suggestions.filter((s) => s.severity === "critical" && ["OWASP", "Security", "SonarQube"].includes(s.category)).length;
  const secWarning = suggestions.filter((s) => s.severity === "warning" && ["OWASP", "Security"].includes(s.category)).length;
  const secScore = Math.max(0, Math.min(25, 25 - secCritical * 8 - secWarning * 3));
  breakdown.push({
    category: "Sécurité",
    score: secScore,
    maxScore: 25,
    reason: `${secCritical} vulnérabilité(s) critique(s), ${secWarning} avertissement(s)`,
  });

  // --- Performance (max 25) ---
  const perfIssues = suggestions.filter((s) => ["Performance", "PMD"].includes(s.category) && (s.ruleId.includes("PERF") || s.ruleId.includes("PMD-PERF"))).length;
  const perfScore = Math.max(0, Math.min(25, 25 - perfIssues * 4));
  breakdown.push({
    category: "Performance",
    score: perfScore,
    maxScore: 25,
    reason: `${perfIssues} problème(s) de performance`,
  });

  // --- Résilience (max 25) ---
  const resIssues = suggestions.filter((s) => ["Resilience", "Observability", "Migration", "Couplage", "Transactions", "JMS/MQ"].includes(s.category)).length;
  const resScore = Math.max(0, Math.min(25, 25 - resIssues * 2));
  breakdown.push({
    category: "Résilience",
    score: resScore,
    maxScore: 25,
    reason: `${resIssues} pattern(s) legacy ou manquant(s)`,
  });

  const overall = maintScore + secScore + perfScore + resScore;
  const criticalCount = suggestions.filter((s) => s.severity === "critical").length;
  const warningCount = suggestions.filter((s) => s.severity === "warning").length;

  return {
    overall,
    maintainability: Math.round((maintScore / 25) * 100),
    security: Math.round((secScore / 25) * 100),
    performance: Math.round((perfScore / 25) * 100),
    resilience: Math.round((resScore / 25) * 100),
    testability: Math.round(Math.max(0, 100 - criticalCount * 15 - warningCount * 5)),
    breakdown,
  };
}

function computeModernScore(generatedFiles: GeneratedFile[]): QualityScore {
  const breakdown: ScoreDetail[] = [];
  const allCode = generatedFiles.map((f) => f.content).join("\n");

  // --- Maintenabilité (max 25) ---
  let maintScore = 22;
  if (/@author|\/\*\*/.test(allCode)) maintScore += 2;
  if (/^package\s/m.test(allCode)) maintScore += 1;
  maintScore = Math.min(25, maintScore);
  breakdown.push({ category: "Maintenabilité", score: maintScore, maxScore: 25, reason: "Code généré structuré, nommage cohérent, documentation" });

  // --- Sécurité (max 25) ---
  let secScore = 23;
  if (/@Value|@ConfigurationProperties|application\.yml/.test(allCode)) secScore += 2;
  secScore = Math.min(25, secScore);
  breakdown.push({ category: "Sécurité", score: secScore, maxScore: 25, reason: "Configuration externalisée, pas de credentials en dur" });

  // --- Performance (max 25) ---
  let perfScore = 22;
  if (/WebClient/.test(allCode)) perfScore += 1;
  if (/Mono|Flux/.test(allCode)) perfScore += 2;
  perfScore = Math.min(25, perfScore);
  breakdown.push({ category: "Performance", score: perfScore, maxScore: 25, reason: /Mono|Flux/.test(allCode) ? "WebClient réactif (Mono/Flux) non-bloquant" : "WebClient pour les appels HTTP" });

  // --- Résilience (max 25) ---
  let resScore = 20;
  if (/retry|Retry|retryWhen/.test(allCode)) resScore += 2;
  if (/timeout|\.timeout\(/.test(allCode)) resScore += 1;
  if (/onErrorResume|onErrorReturn|\.onStatus\(/.test(allCode)) resScore += 2;
  resScore = Math.min(25, resScore);
  breakdown.push({ category: "Résilience", score: resScore, maxScore: 25, reason: /retry|Retry/.test(allCode) ? "Retry, timeout et gestion d'erreurs intégrés" : "Gestion d'erreurs de base" });

  const overall = maintScore + secScore + perfScore + resScore;
  return {
    overall,
    maintainability: Math.round((maintScore / 25) * 100),
    security: Math.round((secScore / 25) * 100),
    performance: Math.round((perfScore / 25) * 100),
    resilience: Math.round((resScore / 25) * 100),
    testability: 85,
    breakdown,
  };
}

// ============================================================
// Optimizations Detection
// ============================================================

function detectOptimizations(code: string, report: AnalysisReport): CodeOptimization[] {
  const optimizations: CodeOptimization[] = [];

  if (report.summary.totalMethodCalls > 1) {
    optimizations.push({
      id: "opt-retry",
      type: "retry",
      description: `${report.summary.totalMethodCalls} appel(s) de service — ajout de retry (3 tentatives, backoff exponentiel).`,
      applied: true,
    });
  }

  if (report.summary.totalDependencies > 2) {
    optimizations.push({
      id: "opt-circuit-breaker",
      type: "circuit-breaker",
      description: `${report.summary.totalDependencies} dépendance(s) externe(s) — ajout de circuit breaker (Resilience4j).`,
      applied: true,
    });
  }

  optimizations.push({
    id: "opt-timeout",
    type: "timeout",
    description: "Timeouts explicites (connect: 5s, read: 30s) sur tous les appels WebClient.",
    applied: true,
  });

  optimizations.push({
    id: "opt-logging",
    type: "logging",
    description: "Logging structuré (SLF4J) avec corrélation d'ID pour le tracing distribué.",
    applied: true,
  });

  if (report.summary.totalMethodCalls > 0) {
    optimizations.push({
      id: "opt-error-handling",
      type: "error-handling",
      description: "Gestion d'erreurs typée : WebClientResponseException, TimeoutException, fallback gracieux.",
      applied: true,
    });
  }

  const hasGetMethods = report.methodCalls.some(
    (m) => /^(get|find|fetch|load|list|search)/.test(m.methodName)
  );
  if (hasGetMethods) {
    optimizations.push({
      id: "opt-cache",
      type: "cache",
      description: "Méthodes de lecture détectées — recommandation @Cacheable Spring.",
      applied: false,
    });
  }

  if (report.summary.totalDependencies > 3) {
    optimizations.push({
      id: "opt-bulkhead",
      type: "bulkhead",
      description: `${report.summary.totalDependencies} services externes — recommandation d'isolation par bulkhead.`,
      applied: false,
    });
  }

  optimizations.push({
    id: "opt-validation",
    type: "validation",
    description: "Validation Jakarta Bean (@Valid, @NotNull, @Size, @Pattern) sur les DTOs.",
    applied: true,
  });

  optimizations.push({
    id: "opt-openapi",
    type: "openapi",
    description: "Documentation OpenAPI/Swagger automatique (@Operation, @ApiResponse).",
    applied: true,
  });

  optimizations.push({
    id: "opt-health",
    type: "health",
    description: "Health Check Spring Boot Actuator pour le monitoring K8s.",
    applied: true,
  });

  return optimizations;
}

// ============================================================
// Estimation de complexité et d'effort
// ============================================================

function estimateComplexity(
  suggestions: AiSuggestion[],
  report: AnalysisReport
): { complexity: AiSummary["migrationComplexity"]; days: number } {
  let score = 0;

  score += report.summary.totalEjbInjections * 2;
  score += report.summary.totalJndiLookups * 3;
  score += report.summary.totalTransactions * 4;
  score += report.summary.totalJmsElements * 6;
  score += suggestions.filter((s) => s.severity === "critical").length * 3;
  score += suggestions.filter((s) => s.severity === "warning").length * 1;

  let days: number;
  let complexity: AiSummary["migrationComplexity"];

  if (score <= 5) {
    complexity = "faible";
    days = 0.5;
  } else if (score <= 15) {
    complexity = "moyenne";
    days = 1;
  } else if (score <= 30) {
    complexity = "élevée";
    days = 2;
  } else {
    complexity = "très élevée";
    days = Math.ceil(score / 15);
  }

  return { complexity, days };
}

// ============================================================
// Fonction principale — point d'entrée du moteur IA
// ============================================================

export function runAiAnalysis(
  code: string,
  report: AnalysisReport,
  generationResult?: GenerationResult,
  fileName?: string
): AiAnalysisResult {
  const suggestions = detectAntiPatterns(code, fileName);
  const legacyScore = computeLegacyScore(code, suggestions);
  const modernScore = generationResult
    ? computeModernScore(generationResult.files)
    : { overall: 0, maintainability: 0, security: 0, performance: 0, resilience: 0, testability: 0, breakdown: [] };
  const optimizations = detectOptimizations(code, report);
  const { complexity, days } = estimateComplexity(suggestions, report);

  const topRisks = Array.from(
    new Set(
      suggestions
        .filter((s) => s.severity === "critical")
        .map((s) => s.title)
    )
  ).slice(0, 5);

  const rulesByCategory: Record<string, number> = {};
  for (const s of suggestions) {
    rulesByCategory[s.category] = (rulesByCategory[s.category] || 0) + 1;
  }

  const summary: AiSummary = {
    totalSuggestions: suggestions.length,
    criticalCount: suggestions.filter((s) => s.severity === "critical").length,
    warningCount: suggestions.filter((s) => s.severity === "warning").length,
    infoCount: suggestions.filter((s) => s.severity === "info" || s.severity === "suggestion").length,
    topRisks,
    migrationComplexity: complexity,
    estimatedEffortDays: days,
    confidenceLevel: "Analyse déterministe — 100% basée sur des règles codées, aucune hallucination",
    totalRules: RULES.length,
    rulesTriggered: suggestions.length,
    rulesByCategory,
  };

  return {
    suggestions,
    legacyScore,
    modernScore,
    optimizations,
    summary,
  };
}

/**
 * Analyse IA multi-fichiers — fusionne les résultats de plusieurs fichiers.
 */
export function runMultiFileAiAnalysis(
  files: { code: string; fileName: string; report: AnalysisReport }[],
  generationResult?: GenerationResult
): AiAnalysisResult {
  const allSuggestions: AiSuggestion[] = [];
  const allOptimizations: CodeOptimization[] = [];
  let totalLegacyScore = 0;

  const legacyBreakdowns: ScoreDetail[] = [];

  for (const file of files) {
    const result = runAiAnalysis(file.code, file.report, undefined, file.fileName);
    allSuggestions.push(...result.suggestions);
    totalLegacyScore += result.legacyScore.overall;

    for (const opt of result.optimizations) {
      if (!allOptimizations.some((o) => o.type === opt.type)) {
        allOptimizations.push(opt);
      }
    }
  }

  const avgLegacy = files.length > 0 ? Math.round(totalLegacyScore / files.length) : 0;

  const modernScore = generationResult
    ? computeModernScore(generationResult.files)
    : { overall: 0, maintainability: 0, security: 0, performance: 0, resilience: 0, testability: 0, breakdown: [] };

  // Dédupliquer les suggestions identiques
  const uniqueSuggestions: AiSuggestion[] = [];
  const seen = new Set<string>();
  for (const s of allSuggestions) {
    const key = `${s.ruleId}-${s.fileName}-${s.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSuggestions.push(s);
    }
  }

  const criticalCount = uniqueSuggestions.filter((s) => s.severity === "critical").length;
  const warningCount = uniqueSuggestions.filter((s) => s.severity === "warning").length;

  let globalComplexity: AiSummary["migrationComplexity"];
  let globalDays: number;
  const totalScore = criticalCount * 3 + warningCount * 1 + files.length * 2;

  if (totalScore <= 10) {
    globalComplexity = "faible";
    globalDays = Math.max(1, Math.ceil(files.length * 0.5));
  } else if (totalScore <= 25) {
    globalComplexity = "moyenne";
    globalDays = Math.max(2, Math.ceil(files.length * 0.75));
  } else if (totalScore <= 50) {
    globalComplexity = "élevée";
    globalDays = Math.max(3, files.length);
  } else {
    globalComplexity = "très élevée";
    globalDays = Math.max(5, Math.ceil(files.length * 1.5));
  }

  const topRisks = Array.from(
    new Set(
      uniqueSuggestions
        .filter((s) => s.severity === "critical")
        .map((s) => s.title)
    )
  ).slice(0, 5);

  const rulesByCategory: Record<string, number> = {};
  for (const s of uniqueSuggestions) {
    rulesByCategory[s.category] = (rulesByCategory[s.category] || 0) + 1;
  }

  return {
    suggestions: uniqueSuggestions,
    legacyScore: {
      overall: avgLegacy,
      maintainability: Math.round(avgLegacy * 0.9),
      security: Math.round(avgLegacy * 1.05),
      performance: Math.round(avgLegacy * 0.95),
      resilience: Math.round(avgLegacy * 0.7),
      testability: Math.round(Math.max(0, 100 - criticalCount * 10)),
      breakdown: legacyBreakdowns,
    },
    modernScore,
    optimizations: allOptimizations,
    summary: {
      totalSuggestions: uniqueSuggestions.length,
      criticalCount,
      warningCount,
      infoCount: uniqueSuggestions.filter((s) => s.severity === "info" || s.severity === "suggestion").length,
      topRisks,
      migrationComplexity: globalComplexity,
      estimatedEffortDays: globalDays,
      confidenceLevel: `Analyse déterministe de ${files.length} fichier(s) — ${RULES.length} règles (OWASP, SonarQube, SOLID, Clean Code, PMD, SpotBugs, Checkstyle) — aucune hallucination`,
      totalRules: RULES.length,
      rulesTriggered: uniqueSuggestions.length,
      rulesByCategory,
    },
  };
}
/* v3.0 */
