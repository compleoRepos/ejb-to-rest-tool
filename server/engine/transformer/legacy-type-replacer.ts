/**
 * legacy-type-replacer.ts — v8.4 STEP 5
 * Post-generation transformer : remplace les types legacy (ValueObject, Envelope)
 * par les DTOs Spring générés dans le code Java des microservices.
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
 */
export function replaceLegacyTypes(
  content: string,
  useCase?: UseCaseContext
): string {
  let result = content;

  if (useCase) {
    const { requestDto, responseDto } = useCase;

    // Signature méthode : public ValueObject execute(ValueObject voIn)
    result = result.replace(
      /public\s+ValueObject\s+execute\s*\(\s*ValueObject\s+\w+\s*\)/g,
      `public ${responseDto} execute(${requestDto} request)`
    );

    // Signature méthode : public Envelope process(Envelope envelopeIn)
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

    // Variable declarations : ValueObject voOut = → ResponseDTO response =
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
  }

  // Transformations génériques (sans contexte UseCase)
  // new ValueObject() → new HashMap<>() (fallback sûr)
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
  totalReferences: number;
} {
  const hasValueObject = /\bValueObject\b/.test(javaCode);
  const hasEnvelope = /\bEnvelope\b/.test(javaCode);
  const hasBaseUseCase = /\bBaseUseCase\b/.test(javaCode);

  const totalReferences =
    (javaCode.match(/\bValueObject\b/g) || []).length +
    (javaCode.match(/\bEnvelope\b/g) || []).length +
    (javaCode.match(/\bBaseUseCase\b/g) || []).length;

  return { hasValueObject, hasEnvelope, hasBaseUseCase, totalReferences };
}
