/**
 * validateMLOutput — Compleo v7.7
 *
 * Validation post-génération des sorties ML (Ollama).
 * Détecte et nettoie les hallucinations courantes :
 *   - Classes inventées (UserService, OrderService, etc.)
 *   - Technologies hors contexte (ASP.NET, PostgreSQL, etc.)
 *   - Mauvaises définitions (BAM ≠ Bureau Automatisé des Mandats)
 *   - Chiffres inventés (75% de réduction, etc.)
 *
 * @author Compleo Engine
 */

// ── Types ────────────────────────────────────────────────────────────

export interface ValidationResult {
  isValid:        boolean;
  hallucinations: Hallucination[];
  cleanedText:    string;
}

export interface Hallucination {
  type:     "fake-class" | "fake-tech" | "fake-number" | "bad-definition";
  original: string;
  line:     number;
}

// ── Blacklists ───────────────────────────────────────────────────────

const FAKE_CLASSES = new Set([
  "UserService", "OrderService", "ProductService", "CustomerService",
  "ExceptionHandler", "UserController", "OrderController",
  "ProductController", "CustomerController", "UserRepository",
  "OrderRepository", "ProductRepository", "CustomerRepository",
  "findUserById", "updateOrder", "createProduct", "deleteCustomer",
  "UserEntity", "OrderEntity", "ProductEntity", "CustomerEntity",
  "UserDTO", "OrderDTO", "ProductDTO", "CustomerDTO",
]);

const FAKE_TECHNOLOGIES: RegExp[] = [
  /ASP\.NET/i,
  /PostgreSQL/i,
  /MongoDB/i,
  /Node\.js/i,
  /Django/i,
  /Ruby\s+on\s+Rails/i,
  /Angular(?:JS)?/i,
  /Vue\.js/i,
  /Flask/i,
  /Express\.js/i,
  /\.NET\s+Core/i,
  /Laravel/i,
  /React(?:\.js)?/i,
  /Next\.js/i,
  /NestJS/i,
];

const BAD_DEFINITIONS: Array<{ pattern: RegExp; correction: string }> = [
  { pattern: /Bureau\s+Automatis[ée]\s+des\s+Mandats/gi, correction: "Banque Al-Maghrib" },
  { pattern: /Business\s+Activity\s+Monitoring/gi, correction: "Banque Al-Maghrib" },
  { pattern: /Business\s+Application\s+Manager/gi, correction: "Banque Al-Maghrib" },
];

// ── Main validator ───────────────────────────────────────────────────

export function validateMLOutput(
  text: string,
  realClassNames: string[]
): ValidationResult {
  const hallucinations: Hallucination[] = [];
  let cleanedText = text;

  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Vérifier les classes inventées
    for (const fake of FAKE_CLASSES) {
      if (line.includes(fake)) {
        hallucinations.push({ type: "fake-class", original: fake, line: i + 1 });
        cleanedText = cleanedText.replace(new RegExp(escapeRegex(fake), "g"), "[SUPPRIMÉ]");
      }
    }

    // 2. Vérifier les technologies inventées
    for (const techRegex of FAKE_TECHNOLOGIES) {
      const match = line.match(techRegex);
      if (match) {
        hallucinations.push({ type: "fake-tech", original: match[0], line: i + 1 });
        cleanedText = cleanedText.replace(new RegExp(techRegex.source, "gi"), "[SUPPRIMÉ]");
      }
    }

    // 3. Vérifier les mauvaises définitions
    for (const bad of BAD_DEFINITIONS) {
      if (bad.pattern.test(line)) {
        hallucinations.push({ type: "bad-definition", original: line.trim(), line: i + 1 });
        cleanedText = cleanedText.replace(bad.pattern, bad.correction);
      }
    }

    // 4. Vérifier les chiffres inventés (pourcentages exagérés)
    const fakePct = line.match(/(\d{2,3})%\s*(de réduction|reduction|savings|gain|d'économie|économie)/i);
    if (fakePct && parseInt(fakePct[1]) > 50) {
      hallucinations.push({ type: "fake-number", original: fakePct[0], line: i + 1 });
      cleanedText = cleanedText.replace(fakePct[0], "à évaluer selon le contexte");
    }
  }

  return {
    isValid: hallucinations.length === 0,
    hallucinations,
    cleanedText,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
