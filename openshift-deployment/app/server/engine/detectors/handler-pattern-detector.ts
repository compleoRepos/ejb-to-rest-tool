/**
 * handler-pattern-detector.ts — Détecte le pattern Strategy/Handler dans un projet Java EE.
 *
 * Pattern cible :
 *   1. Interface avec méthode handle()/execute()           → ActionHandler
 *   2. Factory avec EnumMap<Action, Supplier<Handler>>     → ActionHandlerFactory
 *   3. EJB façade qui appelle Factory.getHandler(action)   → MadServices.Traitement()
 *   4. N classes concrètes qui implémentent l'interface    → *Handler.java
 *
 * Si le pattern est détecté, chaque handler concret est converti en UseCaseIR
 * et l'EJB façade est exclu de la génération de services.
 *
 * Impact sur les projets existants : AUCUN.
 * Le détecteur retourne null si le pattern n'est pas trouvé → le pipeline
 * continue sur le chemin classique. Zéro régression possible.
 *
 * @author Compleo
 * @since v8.3
 */

// ─── Types publics ──────────────────────────────────────────────────────────

export interface HandlerPatternDetection {
  detected: boolean;
  /** Nom de l'EJB façade (ex: "MadServices") */
  facadeClass: string;
  /** Nom de la Factory (ex: "ActionHandlerFactory") */
  factoryClass: string;
  /** Nom de l'interface handler (ex: "ActionHandler") */
  interfaceClass: string;
  /** Nom de la méthode de dispatch (ex: "handle") */
  handleMethod: string;
  /** Liste des handlers concrets détectés */
  handlers: HandlerInfo[];
  /** Nom de l'enum d'actions (ex: "MadServiceAction") */
  actionEnum: string;
}

export interface HandlerInfo {
  /** Nom de la classe handler (ex: "TraitementMadHandler") */
  className: string;
  /** Nom de la méthode handle (ex: "handle") */
  handleMethod: string;
  /** Code source complet du handler */
  sourceCode: string;
  /** Corps de la méthode handle() uniquement */
  handleBody: string;
  /** DataSources utilisées dans le handler */
  dataSources: string[];
  /** Dépendances (classes utilisées dans le handler) */
  dependencies: string[];
  /** Package du handler */
  packageName: string;
  /** Chemin du fichier source */
  sourceFile: string;
}

// ─── Fichier Java simplifié ─────────────────────────────────────────────────

interface JavaFileRef {
  path: string;
  content: string;
  className: string;
  packageName: string;
}

// ─── Méthodes de dispatch connues ───────────────────────────────────────────

const DISPATCH_METHODS = /^(handle|execute|process|doAction|run)$/;

// ─── DataSources connues ────────────────────────────────────────────────────

const KNOWN_DATASOURCES = [
  "ebankdirect", "ebankinterface", "DWHDSXA", "dataCenterDs",
  "jdbc/ebankdirect", "jdbc/ebankinterface", "jdbc/dwhds",
];

// ─── Détection principale ───────────────────────────────────────────────────

/**
 * Détecter le pattern Strategy/Handler dans un ensemble de fichiers Java.
 *
 * Critères de détection :
 * 1. Une interface avec une méthode handle/execute qui prend un paramètre et retourne un résultat
 * 2. Une Factory qui mappe des enums vers des Supplier<Interface>
 * 3. Au moins 3 classes concrètes qui implémentent l'interface
 * 4. Un EJB façade qui utilise la Factory
 *
 * @returns HandlerPatternDetection si le pattern est trouvé, null sinon
 */
export function detectHandlerPattern(
  files: { path: string; content: string }[]
): HandlerPatternDetection | null {
  // Préparer les fichiers Java
  const javaFiles: JavaFileRef[] = files
    .filter(f => f.path.endsWith(".java"))
    .map(f => ({
      path: f.path,
      content: f.content,
      className: extractClassName(f.path, f.content),
      packageName: extractPackage(f.content),
    }))
    .filter(f => f.className !== "");

  // 1. Chercher les interfaces avec handle/execute/process
  const candidateInterfaces = javaFiles.filter(f => {
    if (!isInterface(f.content)) return false;
    return hasDispatchMethod(f.content);
  });

  for (const iface of candidateInterfaces) {
    const ifaceName = iface.className;
    const handleMethodName = extractDispatchMethodName(iface.content);
    if (!handleMethodName) continue;

    // 2. Chercher les implémentations concrètes
    const implementations = javaFiles.filter(f =>
      f.className !== ifaceName &&
      implementsInterface(f.content, ifaceName) &&
      !isAbstractClass(f.content)
    );

    if (implementations.length < 3) continue; // Pas assez pour être un pattern

    // 3. Chercher la Factory
    const factory = javaFiles.find(f =>
      (f.content.includes("EnumMap") || f.className.toLowerCase().includes("factory")) &&
      (f.content.includes(ifaceName) || f.content.includes("getHandler")) &&
      (/Supplier\s*</.test(f.content) || /switch\s*\(/.test(f.content) || /new\s+\w+Handler/.test(f.content))
    );

    // v8.3 FIX: Discriminer Strategy/Handler vs Command/UseCase pattern
    // Le pattern Strategy/Handler REQUIERT soit :
    //   a) Une Factory qui dispatche vers les handlers, OU
    //   b) Le nom de l'interface contient "Handler" ou "Action"
    // Sans Factory ET sans nom Handler/Action, c'est un pattern Command (BaseUseCase)
    // qui est déjà géré par le pipeline classique.
    const isHandlerInterface = /handler|action/i.test(ifaceName);
    if (!factory && !isHandlerInterface) continue;

    // 4. Chercher l'EJB façade qui utilise la Factory
    const facade = javaFiles.find(f =>
      f.className !== ifaceName &&
      !implementations.some(impl => impl.className === f.className) &&
      f.className !== (factory?.className ?? "__NONE__") &&
      (f.content.includes(factory?.className ?? "__NONE__") ||
       f.content.includes(".getHandler(") ||
       f.content.includes(ifaceName)) &&
      (/@Stateless|@Stateful|@Singleton/.test(f.content) ||
       f.content.includes(".handle(") || f.content.includes(".process("))
    );

    // 5. Extraire l'enum d'actions depuis la Factory
    const actionEnum = factory ? extractActionEnum(factory.content) : "unknown";

    // Pattern détecté !
    return {
      detected: true,
      facadeClass: facade?.className ?? "unknown",
      factoryClass: factory?.className ?? "unknown",
      interfaceClass: ifaceName,
      handleMethod: handleMethodName,
      handlers: implementations.map(impl => extractHandlerInfo(impl, handleMethodName, javaFiles)),
      actionEnum,
    };
  }

  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractClassName(path: string, content: string): string {
  // Essayer d'extraire depuis le contenu
  const classMatch = content.match(/public\s+(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)/);
  if (classMatch) return classMatch[1];
  // Fallback: extraire depuis le chemin
  const parts = path.split("/");
  const fileName = parts[parts.length - 1];
  return fileName.replace(".java", "");
}

function extractPackage(content: string): string {
  const match = content.match(/package\s+([\w.]+)\s*;/);
  return match ? match[1] : "";
}

function isInterface(content: string): boolean {
  return /public\s+interface\s+\w+/.test(content);
}

function isAbstractClass(content: string): boolean {
  return /public\s+abstract\s+class\s+/.test(content);
}

function hasDispatchMethod(content: string): boolean {
  // Chercher une méthode qui matche handle/execute/process avec au moins 1 paramètre
  const methodRegex = /\b(handle|execute|process|doAction|run)\s*\([^)]+\)/;
  return methodRegex.test(content);
}

function extractDispatchMethodName(content: string): string | null {
  const methodRegex = /\b(handle|execute|process|doAction|run)\s*\([^)]+\)/;
  const match = content.match(methodRegex);
  return match ? match[1] : null;
}

function implementsInterface(content: string, interfaceName: string): boolean {
  // Pattern: class XxxHandler implements ActionHandler
  const regex = new RegExp(`class\\s+\\w+\\s+implements\\s+[\\w,\\s]*\\b${interfaceName}\\b`);
  return regex.test(content);
}

function extractActionEnum(factoryContent: string): string {
  // Pattern: EnumMap<MadServiceAction, Supplier<...>>
  const match = factoryContent.match(/EnumMap\s*<\s*(\w+)\s*,/);
  return match ? match[1] : "unknown";
}

function extractHandlerInfo(
  impl: JavaFileRef,
  handleMethodName: string,
  allFiles: JavaFileRef[]
): HandlerInfo {
  return {
    className: impl.className,
    handleMethod: handleMethodName,
    sourceCode: impl.content,
    handleBody: extractMethodBody(impl.content, handleMethodName),
    dataSources: extractDataSources(impl.content),
    dependencies: extractDependencies(impl.content, allFiles),
    packageName: impl.packageName,
    sourceFile: impl.path,
  };
}

/**
 * Extraire le corps d'une méthode par son nom.
 * Utilise un compteur de braces pour trouver la fin du corps.
 */
function extractMethodBody(source: string, methodName: string): string {
  const regex = new RegExp(
    `(?:public|protected)\\s+\\w[\\w<>,\\s\\[\\]]*\\s+${methodName}\\s*\\([^)]*\\)\\s*(?:throws\\s+[\\w,\\s]+)?\\s*\\{`
  );
  const match = regex.exec(source);
  if (!match) return "";

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let i = startIdx;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    i++;
  }

  return source.substring(startIdx, i - 1).trim();
}

/**
 * Extraire les DataSources utilisées dans le code source.
 */
function extractDataSources(source: string): string[] {
  const found: string[] = [];
  for (const ds of KNOWN_DATASOURCES) {
    if (source.includes(ds)) {
      // Normaliser le nom
      const normalized = ds.replace("jdbc/", "");
      if (!found.includes(normalized)) found.push(normalized);
    }
  }
  // Aussi chercher les patterns @Resource(name = "jdbc/xxx")
  const resourceMatches = source.matchAll(/@Resource\s*\(\s*name\s*=\s*"([^"]+)"\s*\)/g);
  for (const m of resourceMatches) {
    const normalized = m[1].replace("jdbc/", "").replace(/_xa$|_nonxa$/i, "");
    if (!found.includes(normalized)) found.push(normalized);
  }
  return found;
}

/**
 * Extraire les dépendances (classes utilisées) depuis le code source d'un handler.
 */
function extractDependencies(source: string, allFiles: JavaFileRef[]): string[] {
  const deps: string[] = [];
  const classNames = allFiles.map(f => f.className);

  for (const cn of classNames) {
    // Vérifier si la classe est référencée dans le source (pas juste dans les imports)
    if (cn.length < 3) continue; // Ignorer les noms trop courts
    const regex = new RegExp(`\\b${cn}\\b`);
    if (regex.test(source)) {
      // Exclure la classe elle-même et les types primitifs/wrappers
      if (source.includes(`class ${cn}`)) continue;
      if (["String", "Integer", "Long", "Boolean", "Double", "Float", "Void", "Object"].includes(cn)) continue;
      deps.push(cn);
    }
  }

  return [...new Set(deps)];
}

// ─── Conversion Handler → UseCase ───────────────────────────────────────────

/**
 * Mapping explicite des noms de handlers vers des domaines métier.
 * Utilisé pour grouper les handlers en services Spring par domaine.
 */
const HANDLER_DOMAIN_MAP: Record<string, string> = {
  "TraitementMadHandler":        "mad-operation",
  "AnnulerMADHandler":           "mad-operation",
  "ControlMontantHandler":       "mad-operation",
  "GetListMadAttenteHandler":    "mad-consultation",
  "ListeAttenteHandler":          "mad-consultation",
  "GetHistMadAttenteHandler":     "mad-consultation",
  "ConsulterEligibiliteHandler": "mad-consultation",
  "AddBeneficiariHandler":       "beneficiaire",
  "ModifBenefHandler":           "beneficiaire",
  "SupfBenefHandler":            "beneficiaire",
  "GetBeneficiariesHandler":     "beneficiaire",
  "IsBenefEnregistrerHandler":   "beneficiaire",
  "MadCoreAuthHandler":          "mad-core-integration",
  "ModifierTelephoneHandler":    "client",
};

/**
 * Mapping explicite handler → nom de méthode métier Spring.
 */
const HANDLER_METHOD_MAP: Record<string, string> = {
  "TraitementMadHandler":        "traiterMad",
  "AnnulerMADHandler":           "annulerMad",
  "AnnulationMadHandler":         "annulerMad",
  "ControlMontantHandler":       "controlerMontant",
  "GetListMadAttenteHandler":    "getListeEnAttente",
  "GetHistMadAttenteHandler":    "getHistorique",
  "ConsulterEligibiliteHandler": "consulterEligibilite",
  "AddBeneficiariHandler":       "ajouterBeneficiari",
  "ModifBenefHandler":           "modifierBeneficiaire",
  "SupfBenefHandler":            "supprimerBeneficiaire",
  "GetBeneficiariesHandler":     "getBeneficiaires",
  "IsBenefEnregistrerHandler":   "isBeneficiaireEnregistre",
  "MadCoreAuthHandler":          "authentifier",
  "ModifierTelephoneHandler":    "modifierTelephone",
};

/**
 * Inférer le domaine depuis le nom du handler (fallback générique).
 */
export function inferDomainFromHandlerName(name: string): string {
  if (HANDLER_DOMAIN_MAP[name]) return HANDLER_DOMAIN_MAP[name];
  // Fallback : extraire le domaine du nom du handler
  return name
    .replace(/Handler$/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Obtenir le nom de méthode Spring pour un handler donné.
 */
export function getMethodNameForHandler(handlerClassName: string): string {
  if (HANDLER_METHOD_MAP[handlerClassName]) return HANDLER_METHOD_MAP[handlerClassName];
  // Fallback: camelCase du nom sans "Handler"
  const base = handlerClassName.replace(/Handler$/, "");
  return base.charAt(0).toLowerCase() + base.slice(1);
}

/**
 * Obtenir le mapping domaine pour un handler donné.
 */
export function getDomainForHandler(handlerClassName: string): string {
  return HANDLER_DOMAIN_MAP[handlerClassName] ?? inferDomainFromHandlerName(handlerClassName);
}
