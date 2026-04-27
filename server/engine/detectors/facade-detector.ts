/**
 * facade-detector.ts — v8.4 STEP 7
 * Détecte les EJB façades qui ne font que dispatcher vers les UseCases.
 * Ces classes NE DOIVENT PAS générer de service Spring.
 *
 * Signes d'une façade :
 * 1. extends UCStrategie / AbstractFacade / AbstractService
 * 2. La seule méthode est process() qui appelle super.process()
 * 3. Utilise ActionHandlerFactory.getHandler() pour dispatcher
 * 4. Le corps de la méthode ne contient PAS de logique métier propre
 *
 * @author Compleo
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedClassLike {
  className: string;
  sourceCode: string;
  extends?: string;
  methods?: { name: string; body?: string }[];
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const DISPATCH_SUPER_CLASSES = [
  "UCStrategie",
  "AbstractFacade",
  "AbstractService",
  "AbstractUCStrategie",
  "BaseStrategy",
];

const FACTORY_DISPATCH_PATTERNS = [
  /Factory\.getHandler\s*\(/,
  /Factory\.get\s*\(/,
  /HandlerFactory\.\w+\s*\(/,
  /ActionHandlerFactory\.\w+\s*\(/,
];

// ─── API publique ───────────────────────────────────────────────────────────

/**
 * Détermine si une classe est une façade EJB (dispatcher sans logique métier).
 */
export function isFacadeEjb(cls: ParsedClassLike): boolean {
  const src = cls.sourceCode;

  // Check 1 : extends une classe de dispatch connue
  if (cls.extends && DISPATCH_SUPER_CLASSES.includes(cls.extends)) return true;

  // Check 1b : extends détecté par regex dans le source
  const extendsMatch = src.match(/class\s+\w+\s+extends\s+(\w+)/);
  if (extendsMatch && DISPATCH_SUPER_CLASSES.includes(extendsMatch[1])) return true;

  // Check 2 : utilise une Factory pour dispatcher
  if (FACTORY_DISPATCH_PATTERNS.some(p => p.test(src))) return true;

  // Check 3 : appelle super.process() sans logique propre
  if (src.includes("super.process(")) {
    // Compter les méthodes publiques non-constructeur
    const publicMethods = (src.match(/public\s+(?!class\b)\w[\w<>,\s]*\s+\w+\s*\(/g) || []).length;
    if (publicMethods <= 2) return true;
  }

  return false;
}

/**
 * Détermine si une classe devrait générer un service Spring.
 * Retourne false pour les façades EJB.
 */
export function shouldGenerateService(cls: ParsedClassLike): boolean {
  if (isFacadeEjb(cls)) {
    return false;
  }
  return true;
}

/**
 * Filtrer les UseCases pour exclure ceux provenant de façades EJB.
 * Accepte un tableau de fichiers source pour la détection.
 */
export function filterFacadeUseCases(
  useCases: { className: string; rawSource?: string }[],
  rawFiles?: { path: string; content: string }[]
): {
  filtered: { className: string; rawSource?: string }[];
  excludedFacades: string[];
} {
  const excludedFacades: string[] = [];

  // Construire un set des classes façade détectées dans les fichiers source
  const facadeClassNames = new Set<string>();
  if (rawFiles) {
    for (const file of rawFiles) {
      const classMatch = file.content.match(/class\s+(\w+)/);
      if (classMatch) {
        const cls: ParsedClassLike = {
          className: classMatch[1],
          sourceCode: file.content,
        };
        if (isFacadeEjb(cls)) {
          facadeClassNames.add(classMatch[1]);
        }
      }
    }
  }

  // Aussi détecter les façades directement dans les UseCases
  const filtered = useCases.filter(uc => {
    if (facadeClassNames.has(uc.className)) {
      excludedFacades.push(uc.className);
      return false;
    }

    // Vérifier le rawSource du UseCase lui-même
    if (uc.rawSource) {
      const cls: ParsedClassLike = {
        className: uc.className,
        sourceCode: uc.rawSource,
      };
      if (isFacadeEjb(cls)) {
        excludedFacades.push(uc.className);
        return false;
      }
    }

    return true;
  });

  return { filtered, excludedFacades };
}
