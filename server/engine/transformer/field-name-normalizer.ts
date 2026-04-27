/**
 * field-name-normalizer.ts — v8.4 STEP 6
 * Post-generation transformer : normalise les noms de variables dans le code métier
 * pour les aligner avec les champs injectés dans le constructeur.
 *
 * Pattern :
 *   - Champ injecté : "authentificationService"
 *   - Code legacy : "authentification.getValidToken()"
 *   - Fix : "authentificationService.getValidToken()"
 *
 * Idempotent : si les noms sont déjà corrects, le code passe sans modification.
 *
 * @author Compleo
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InjectedField {
  name: string;   // ex: "authentificationService"
  type: string;   // ex: "AuthentificationService"
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function decapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── API publique ───────────────────────────────────────────────────────────

/**
 * Extraire les champs injectés depuis le code d'un service Spring.
 * Cherche les patterns : private final TypeName fieldName;
 */
export function extractInjectedFields(serviceCode: string): InjectedField[] {
  const fields: InjectedField[] = [];
  const pattern = /private\s+final\s+(\w+)\s+(\w+)\s*;/g;
  let match;

  while ((match = pattern.exec(serviceCode)) !== null) {
    fields.push({ type: match[1], name: match[2] });
  }

  return fields;
}

/**
 * Normaliser les références de variables dans le code métier.
 * Remplace les variantes raccourcies par les noms de champs injectés.
 *
 * Exemples :
 *   authentification.getToken() → authentificationService.getToken()
 *   xbanking.callService()     → xbankingService.callService()
 *   dao.findAll()              → daoService.findAll()
 */
export function normalizeFieldReferences(
  serviceCode: string,
  injectedFields?: InjectedField[]
): string {
  const fields = injectedFields ?? extractInjectedFields(serviceCode);
  if (fields.length === 0) return serviceCode;

  let result = serviceCode;

  for (const field of fields) {
    // Construire les variantes possibles du nom raccourci
    const baseName = field.name
      .replace(/Service$/i, "")
      .replace(/Impl$/i, "")
      .replace(/Client$/i, "")
      .replace(/Repository$/i, "")
      .replace(/Dao$/i, "");

    const variants = [
      baseName,                              // "authentification"
      decapitalize(field.type),              // "authentificationService" (déjà correct)
      baseName + "Impl",                     // "authentificationImpl"
    ];

    for (const variant of variants) {
      if (variant === field.name) continue;  // déjà le bon nom
      if (variant.length < 3) continue;      // trop court, risque de faux positifs

      // Remplacer variant.method() → field.name.method()
      // UNIQUEMENT quand c'est un appel de méthode (pas une variable locale)
      const pattern = new RegExp(`\\b${escapeRegex(variant)}\\.(?=[a-z])`, "g");
      if (pattern.test(result)) {
        // Reset lastIndex after test
        pattern.lastIndex = 0;
        result = result.replace(pattern, `${field.name}.`);
      }
    }
  }

  return result;
}

/**
 * Vérifie si un code Java contient des variables orphelines (utilisées mais pas injectées).
 */
export function findOrphanVariables(serviceCode: string): string[] {
  const injected = new Set(
    [...serviceCode.matchAll(/private\s+final\s+\w+\s+(\w+)\s*;/g)].map(m => m[1])
  );

  // Chercher les appels de méthodes sur des objets non-injectés
  const methodCalls = [...serviceCode.matchAll(/\b(\w+)\.\w+\(/g)].map(m => m[1]);

  // Filtrer les faux positifs (classes statiques, mots-clés, etc.)
  const SAFE_PREFIXES = new Set([
    "log", "this", "ctx", "request", "response", "builder",
    "System", "Math", "String", "Arrays", "Collections", "Optional",
    "List", "Map", "Set", "Integer", "Long", "Double", "Boolean",
    "Objects", "Stream", "Collectors", "Pattern", "Matcher",
    "LocalDate", "LocalDateTime", "Instant", "Duration",
    "BigDecimal", "UUID", "Base64",
  ]);

  const orphans = new Set<string>();
  for (const varName of methodCalls) {
    if (injected.has(varName)) continue;
    if (SAFE_PREFIXES.has(varName)) continue;
    if (/^[A-Z]/.test(varName)) continue; // Classe statique (commence par majuscule)
    orphans.add(varName);
  }

  return [...orphans];
}
