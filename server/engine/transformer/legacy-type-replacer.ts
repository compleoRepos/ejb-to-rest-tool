/**
 * legacy-type-replacer.ts — v8.4 → v8.5
 * Post-generation transformer : remplace les types legacy (ValueObject, Envelope)
 * par les DTOs Spring générés dans le code Java des microservices.
 *
 * v8.5 : Enrichi pour remplacer les fallbacks HashMap<>() par les DTOs typés
 * quand le contexte UseCase est disponible (via usecase-dto-generator).
 *
 * Contextualisé par UseCase : chaque UseCase a ses propres RequestDTO/ResponseDTO.
 * Idempotent : si aucun type legacy n'est trouvé, le code passe sans modification.
 *
 * @author Hamza NORDINE
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UseCaseContext {
  className: string;
  requestDto: string;
  responseDto: string;
}

// ─── API publique ───────────────────────────────────────────────────────────

/**
 * Remplacer les types legacy (ValueObject, Envelope) dans le code Java généré.
 * Nécessite le contexte du UseCase pour déterminer les DTOs de remplacement.
 *
 * v8.5 : Si le contexte est fourni, remplace aussi les fallbacks HashMap<>()
 * par les DTOs typés (XxxRequestDTO.builder().build() / XxxResponseDTO.builder().build()).
 */
export function replaceLegacyTypes(
  content: string,
  useCase?: UseCaseContext
): string {
  let result = content;

  if (useCase) {
    const { requestDto, responseDto } = useCase;

    // ─── v8.4: Signature méthode ───
    // public ValueObject execute(ValueObject voIn)
    result = result.replace(
      /public\s+ValueObject\s+execute\s*\(\s*ValueObject\s+\w+\s*\)/g,
      `public ${responseDto} execute(${requestDto} request)`
    );

    // public Envelope process(Envelope envelopeIn)
    result = result.replace(
      /public\s+Envelope\s+\w+\s*\(\s*Envelope\s+\w+\s*\)/g,
      `public ${responseDto} process(${requestDto} request)`
    );

    // ResponseEntity<ValueObject> → ResponseEntity<ResponseDTO>
    result = result.replace(
      /ResponseEntity<ValueObject>/g,
      `ResponseEntity<${responseDto}>`
    );
    result = result.replace(
      /ResponseEntity<Envelope>/g,
      `ResponseEntity<${responseDto}>`
    );

    // ─── v8.4: Variable declarations ───
    // ValueObject voOut = → ResponseDTO response =
    result = result.replace(
      /\bValueObject\s+(voOut|result|response)\b/g,
      `${responseDto} $1`
    );
    result = result.replace(
      /\bValueObject\s+(voIn|request|input)\b/g,
      `${requestDto} $1`
    );

    // Envelope comme paramètre de méthode
    result = result.replace(
      /\bEnvelope\s+(envelope(?:In|Out)?|request|response)\b/g,
      (_, varName) => {
        if (/in|request|input/i.test(varName)) return `${requestDto} ${varName}`;
        return `${responseDto} ${varName}`;
      }
    );

    // ─── v8.5: HashMap fallback → DTOs typés ───

    // new HashMap<>() dans un contexte d'assignation response/result/voOut
    // Ex: "ResponseDTO response = new HashMap<>()" → "ResponseDTO response = ResponseDTO.builder().build()"
    result = result.replace(
      new RegExp(`${escapeRegex(responseDto)}\\s+(\\w+)\\s*=\\s*new\\s+HashMap<>\\(\\)`, "g"),
      `${responseDto} $1 = ${responseDto}.builder().build()`
    );

    // new HashMap<>() dans un contexte d'assignation request/voIn
    result = result.replace(
      new RegExp(`${escapeRegex(requestDto)}\\s+(\\w+)\\s*=\\s*new\\s+HashMap<>\\(\\)`, "g"),
      `${requestDto} $1 = ${requestDto}.builder().build()`
    );

    // Standalone "new HashMap<>()" quand c'est un return dans un contexte de ResponseDTO
    // Ex: "return new HashMap<>()" → "return ResponseDTO.builder().build()"
    result = result.replace(
      /return\s+new\s+HashMap<>\(\)\s*;/g,
      `return ${responseDto}.builder().build();`
    );

    // Cast patterns : (ValueObject) xxx → (ResponseDTO) xxx
    result = result.replace(
      /\(\s*ValueObject\s*\)\s*/g,
      `(${responseDto}) `
    );
    result = result.replace(
      /\(\s*Envelope\s*\)\s*/g,
      `(${responseDto}) `
    );

    // Type dans les generics : List<ValueObject> → List<ResponseDTO>
    result = result.replace(
      /List<ValueObject>/g,
      `List<${responseDto}>`
    );
    result = result.replace(
      /List<Envelope>/g,
      `List<${responseDto}>`
    );

    // Map<String, ValueObject> → Map<String, ResponseDTO>
    result = result.replace(
      /Map<String,\s*ValueObject>/g,
      `Map<String, ${responseDto}>`
    );
    result = result.replace(
      /Map<String,\s*Envelope>/g,
      `Map<String, ${responseDto}>`
    );

    // instanceof ValueObject → instanceof ResponseDTO
    result = result.replace(
      /instanceof\s+ValueObject/g,
      `instanceof ${responseDto}`
    );
    result = result.replace(
      /instanceof\s+Envelope/g,
      `instanceof ${responseDto}`
    );
  }

  // ─── Transformations génériques (sans contexte UseCase) ───
  // new ValueObject() → new HashMap<>() (fallback sûr quand pas de contexte)
  result = result.replace(/new\s+ValueObject\(\)/g, "new HashMap<>()");
  result = result.replace(/new\s+Envelope\(\)/g, "new HashMap<>()");

  // Imports legacy → supprimer
  result = result.replace(/import\s+.*\.ValueObject;\r?\n?/g, "");
  result = result.replace(/import\s+.*\.Envelope;\r?\n?/g, "");
  result = result.replace(/import\s+.*\.BaseUseCase;\r?\n?/g, "");

  return result;
}

/**
 * Vérifie si un code Java contient des types legacy.
 */
export function hasLegacyTypes(javaCode: string): {
  hasValueObject: boolean;
  hasEnvelope: boolean;
  hasBaseUseCase: boolean;
  hasHashMapFallback: boolean;
  totalReferences: number;
} {
  const hasValueObject = /\bValueObject\b/.test(javaCode);
  const hasEnvelope = /\bEnvelope\b/.test(javaCode);
  const hasBaseUseCase = /\bBaseUseCase\b/.test(javaCode);
  const hasHashMapFallback = /new\s+HashMap<>\(\)/.test(javaCode);

  const totalReferences =
    (javaCode.match(/\bValueObject\b/g) || []).length +
    (javaCode.match(/\bEnvelope\b/g) || []).length +
    (javaCode.match(/\bBaseUseCase\b/g) || []).length +
    (javaCode.match(/new\s+HashMap<>\(\)/g) || []).length;

  return { hasValueObject, hasEnvelope, hasBaseUseCase, hasHashMapFallback, totalReferences };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
