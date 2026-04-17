/**
 * Java EJB Parser — Server-side AST analysis for EJB/Maven projects.
 * Parses Java source files to extract UseCases, DTOs, Services, Enums,
 * Exceptions, Validators, Remote interfaces, and dependency graph.
 * Produces a typed IR (Intermediate Representation) JSON.
 *
 * Designed for BOA EAI pattern: @UseCase + BaseUseCase.execute(ValueObject)
 * @author Hamza NORDINE
 */

import { detectHandlerPattern, getMethodNameForHandler, getDomainForHandler } from "./engine/detectors/handler-pattern-detector";
import type { HandlerPatternDetection } from "./engine/detectors/handler-pattern-detector";
import { filterTestFiles } from "./engine/detectors/source-filter";

// ─── IR Types ───────────────────────────────────────────────────────────────

export interface ProjectIR {
  projectName: string;
  groupId: string;
  artifactId: string;
  version: string;
  packaging: string;
  description: string;
  javaVersion: string;
  dependencies: MavenDependency[];
  useCases: UseCaseIR[];
  dtos: DtoIR[];
  services: ServiceIR[];
  enums: EnumIR[];
  exceptions: ExceptionIR[];
  validators: ValidatorIR[];
  remoteInterfaces: RemoteInterfaceIR[];
  baseClasses: BaseClassIR[];
  constants: ConstantsIR | null;
  bianMapping: BianMapping[];
  stats: ProjectStats;
  warnings: string[];
  /** EJB 2.x beans (SessionBean, EntityBean with Home/Remote interfaces) */
  ejb2xBeans: Ejb2xBeanIR[];
  /** JSR-352 batch jobs (ItemReader, ItemWriter, ItemProcessor) */
  batchJobs: BatchJobIR[];
  /** Raw Java files for secondary scanning (JNDI in batch/EJB2x files not classified as UseCases) */
  _rawFiles?: { path: string; content: string }[];
  /** v8.3: Handler pattern detection result (null if not detected) */
  handlerPattern?: import("./engine/detectors/handler-pattern-detector").HandlerPatternDetection | null;
}

export interface MavenDependency {
  groupId: string;
  artifactId: string;
  version: string;
  scope: string;
}

export interface UseCaseIR {
  className: string;
  packageName: string;
  domain: string;
  bianDomain: string;
  bianAction: string;
  voInType: string;
  voOutType: string;
  useCaseDescription: string;
  javadoc: string;
  injectedServices: InjectedService[];
  transactional: TransactionalInfo | null;
  exceptionsCaught: string[];
  exceptionsThrown: string[];
  sourceFile: string;
  rawSource: string;
  httpMethod: string;
  restPath: string;
  /** FIX E v7.3: All legacy method parameters (not just voInType which is only the first) */
  methodParameters?: { name: string; type: string }[];
  /** v8.3: Flag indicating this UseCase was derived from a Strategy/Handler pattern */
  isFromHandlerPattern?: boolean;
}

export interface InjectedService {
  type: string;
  name: string;
}

export interface TransactionalInfo {
  readOnly: boolean;
  propagation: string;
  rollbackFor: string;
}

export interface DtoIR {
  className: string;
  packageName: string;
  direction: "in" | "out" | "unknown";
  xmlRootElement: string;
  fields: DtoFieldIR[];
  implementsInterfaces: string[];
  sourceFile: string;
}

export interface DtoFieldIR {
  name: string;
  type: string;
  resolvedType: string;
  required: boolean;
  xmlElement: boolean;
  validationAnnotations: string[];
  isEnum: boolean;
  isList: boolean;
}

export interface ServiceIR {
  className: string;
  packageName: string;
  methods: ServiceMethodIR[];
  injectedDependencies: InjectedService[];
  sourceFile: string;
}

export interface ServiceMethodIR {
  name: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  throwsExceptions: string[];
}

export interface EnumIR {
  className: string;
  packageName: string;
  values: string[];
  sourceFile: string;
}

export interface ExceptionIR {
  className: string;
  packageName: string;
  extendsClass: string;
  sourceFile: string;
}

export interface ValidatorIR {
  className: string;
  packageName: string;
  annotationName: string;
  sourceFile: string;
}

export interface RemoteInterfaceIR {
  className: string;
  packageName: string;
  methods: RemoteMethodIR[];
  sourceFile: string;
}

export interface RemoteMethodIR {
  name: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  rolesAllowed: string[];
}

export interface BaseClassIR {
  className: string;
  packageName: string;
  kind: "interface" | "class" | "annotation";
  sourceFile: string;
}

export interface ConstantsIR {
  className: string;
  packageName: string;
  fields: { name: string; type: string; value: string }[];
  sourceFile: string;
}

export interface BianMapping {
  useCase: string;
  serviceDomain: string;
  sdCode: string;
  action: string;
}

export interface Ejb2xBeanIR {
  className: string;
  packageName: string;
  beanType: "SESSION" | "ENTITY" | "MDB";
  homeInterface: string;
  remoteInterface: string;
  methods: { name: string; returnType: string; parameters: { name: string; type: string }[] }[];
  sourceFile: string;
  rawSource: string;
}

export interface BatchJobIR {
  className: string;
  packageName: string;
  batchRole: "READER" | "WRITER" | "PROCESSOR" | "LISTENER" | "BATCHLET";
  implementsInterface: string;
  sourceFile: string;
  rawSource: string;
}

export interface ProjectStats {
  totalFiles: number;
  totalLines: number;
  useCaseCount: number;
  dtoCount: number;
  serviceCount: number;
  enumCount: number;
  exceptionCount: number;
  validatorCount: number;
  remoteInterfaceCount: number;
  domainCount: number;
  domains: string[];
}

// ─── Parser Implementation ──────────────────────────────────────────────────

interface JavaFile {
  path: string;
  content: string;
  packageName: string;
  className: string;
}

export function parseEjbProject(files: { path: string; content: string }[], pomXml?: string, bianYml?: string): ProjectIR {
  const warnings: string[] = [];
  const javaFiles: JavaFile[] = [];

  // v8.4 STEP 1: Filtrer les fichiers de test AVANT le parsing
  // Seuil minimum : ne filtrer que quand il y a assez de fichiers (vrai projet, pas un test unitaire)
  const MIN_FILES_FOR_FILTER = 5;
  let sourceFiles = files;
  if (files.length >= MIN_FILES_FOR_FILTER) {
    const { filtered, testCount } = filterTestFiles(files);
    sourceFiles = filtered;
    if (testCount > 0) {
      warnings.push(`[v8.4] ${testCount} fichiers de test exclus du parsing`);
    }
  }

  // Parse all Java files (using filtered source files)
  for (const file of sourceFiles) {
    if (!file.path.endsWith(".java")) continue;
    const packageName = extractPackage(file.content);
    const className = extractClassName(file.path, file.content);
    if (className) {
      javaFiles.push({ path: file.path, content: file.content, packageName, className });
    }
  }

  // Parse pom.xml
  const pomInfo = pomXml ? parsePomXml(pomXml) : defaultPomInfo();

  // Parse BIAN mapping
  const bianMappings = bianYml ? parseBianYml(bianYml) : [];

  // Classify files
  const useCaseFiles = javaFiles.filter(f => isUseCase(f.content));
  const dtoFiles = javaFiles.filter(f => isDto(f.content, f.className));
  const serviceFiles = javaFiles.filter(f => isService(f.content, f.className));
  const enumFiles = javaFiles.filter(f => isEnum(f.content));
  const exceptionFiles = javaFiles.filter(f => isException(f.className, f.content));
  const validatorFiles = javaFiles.filter(f => isValidator(f.className, f.content));
  const remoteFiles = javaFiles.filter(f => isRemoteInterface(f.content));
  const baseClassFiles = javaFiles.filter(f => isBaseClass(f.content, f.className));
  const constantsFile = javaFiles.find(f => f.className === "Constants");
  const ejb2xFiles = javaFiles.filter(f => isEjb2xBean(f.content));
  const batchFiles = javaFiles.filter(f => isBatchJob(f.content));

  // Build type registry for resolution
  const typeRegistry = buildTypeRegistry(javaFiles);

  // Parse each category
  const enums = enumFiles.map(f => parseEnum(f));
  const enumNames = new Set(enums.map(e => e.className));

  const dtos = dtoFiles.map(f => parseDto(f, enumNames));
  const dtoMap = new Map(dtos.map(d => [d.className, d]));

  const services = serviceFiles.map(f => parseService(f));
  const exceptions = exceptionFiles.map(f => parseException(f));
  const validators = validatorFiles.map(f => parseValidator(f));
  const remoteInterfaces = remoteFiles.map(f => parseRemoteInterface(f));
  const baseClasses = baseClassFiles.map(f => parseBaseClass(f));
  const constants = constantsFile ? parseConstants(constantsFile) : null;
  const ejb2xBeans = ejb2xFiles.map(f => parseEjb2xBean(f, javaFiles));
  const batchJobs = batchFiles.map(f => parseBatchJob(f));

  // ─── Detect direct EJB multi-method classes ───
  // BUG-A v7.5: Filter inner classes before classification
  const topLevelJavaFiles = javaFiles.filter(f => !shouldSkipClass(f.className, f.content, f.content));
  const directEjbFiles = topLevelJavaFiles.filter(f => isDirectEjb(f.content));
  const directEjbUseCases = directEjbFiles.flatMap(f =>
    parseDirectEjbUseCases(f, dtoMap, bianMappings, typeRegistry)
  );

  // Filter out direct EJB files from the standard UseCase list to avoid duplication
  const directEjbPaths = new Set(directEjbFiles.map(f => f.path));
  const standardUseCaseFiles = useCaseFiles.filter(f => !directEjbPaths.has(f.path));

  // ─── v8.3: Detect Strategy/Handler pattern ───
  const handlerDetection = detectHandlerPattern(files);
  let handlerUseCases: UseCaseIR[] = [];
  const handlerFacadeClass = handlerDetection?.facadeClass ?? "";

  if (handlerDetection && handlerDetection.detected) {
    warnings.push(`[v8.3] Handler pattern detected: ${handlerDetection.handlers.length} handlers via ${handlerDetection.interfaceClass}`);
    handlerUseCases = handlerDetection.handlers.map(handler => {
      const methodName = getMethodNameForHandler(handler.className);
      const domain = getDomainForHandler(handler.className);
      const ucClassName = `${handler.className}_${methodName}`;

      // Extract parameters from handle() method signature
      const handleSig = handler.sourceCode.match(
        /(?:public)\s+(\w[\w<>,\s\[\]]*?)\s+(?:handle|execute|process)\s*\(([^)]*)\)/
      );
      const returnType = handleSig ? handleSig[1].trim() : "Object";
      const paramsStr = handleSig ? handleSig[2] : "";
      const methodParameters = paramsStr
        .split(",")
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => {
          const cleaned = p.replace(/@\w+(?:\([^)]*\))?\s*/g, "").trim();
          const parts = cleaned.split(/\s+/);
          return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" ") };
        });

      const voInType = methodParameters.length > 0 ? methodParameters[0].type : "Void";
      const voOutType = returnType === "void" ? "Void" : returnType;

      return {
        className: ucClassName,
        packageName: handler.packageName,
        domain,
        bianDomain: "",
        bianAction: "",
        voInType,
        voOutType,
        useCaseDescription: `${methodName} — extrait du handler ${handler.className}`,
        javadoc: "",
        injectedServices: [],
        transactional: null,
        exceptionsCaught: [],
        exceptionsThrown: [],
        sourceFile: handler.sourceFile,
        rawSource: handler.sourceCode,
        httpMethod: determineHttpMethod(methodName, ""),
        restPath: generateRestPath(domain, methodName),
        methodParameters,
        isFromHandlerPattern: true,
      };
    });
  }

  const useCases = [
    ...standardUseCaseFiles.map(f => {
      const uc = parseUseCase(f, dtoMap, bianMappings, typeRegistry);
      // Validate
      if (uc.voInType === "ValueObject" || uc.voInType === "Object") {
        warnings.push(`${uc.className}: Could not resolve VoIn type (found: ${uc.voInType})`);
      }
      if (uc.voOutType === "ValueObject" || uc.voOutType === "Object") {
        warnings.push(`${uc.className}: Could not resolve VoOut type (found: ${uc.voOutType})`);
      }
      return uc;
    }),
    ...directEjbUseCases,
    ...handlerUseCases,
  ].filter(uc => {
    // v8.3: Exclure la façade Strategy des useCases
    if (handlerFacadeClass && uc.className.startsWith(handlerFacadeClass + "_")) return false;
    if (handlerFacadeClass && uc.className === handlerFacadeClass) return false;
    return true;
  });

  // Compute domains
  const domains = [...new Set(useCases.map(uc => uc.domain))].filter(Boolean);

  const stats: ProjectStats = {
    totalFiles: javaFiles.length,
    totalLines: javaFiles.reduce((sum, f) => sum + f.content.split("\n").length, 0),
    useCaseCount: useCases.length,
    dtoCount: dtos.length,
    serviceCount: services.length,
    enumCount: enums.length,
    exceptionCount: exceptions.length,
    validatorCount: validators.length,
    remoteInterfaceCount: remoteInterfaces.length,
    domainCount: domains.length,
    domains,
  };

  return {
    projectName: pomInfo.name || pomInfo.artifactId,
    groupId: pomInfo.groupId,
    artifactId: pomInfo.artifactId,
    version: pomInfo.version,
    packaging: pomInfo.packaging,
    description: pomInfo.description,
    javaVersion: pomInfo.javaVersion,
    dependencies: pomInfo.dependencies,
    useCases,
    dtos,
    services,
    enums,
    exceptions,
    validators,
    remoteInterfaces,
    baseClasses,
    constants,
    bianMapping: bianMappings,
    ejb2xBeans,
    batchJobs,
    stats,
    warnings,
    _rawFiles: javaFiles.map(f => ({ path: f.path, content: f.content })),
    handlerPattern: handlerDetection,
  };
}

// ─── File Classification ────────────────────────────────────────────────────

// ─── BUG-A v7.5: Filter inner/private classes ─────────────────────────────

/** Component type classification for Java EE → Spring mapping (BUG-B v7.5) */
export type JavaComponentType =
  | "EJB3X_STATELESS"      // @Stateless → @Service Spring
  | "EJB3X_SINGLETON"      // @Singleton → @Component + @Scope("singleton")
  | "EJB3X_STATEFUL"       // @Stateful → @Service + @Scope("prototype")
  | "EJB2X_SESSION"        // implements SessionBean → @Service
  | "CDI_APPLICATION"      // @ApplicationScoped → @Component Spring
  | "CDI_REQUEST"          // @RequestScoped → @Component + @Scope("request")
  | "SERVLET"              // extends HttpServlet → @RestController
  | "FILTER"               // implements Filter → @Component OncePerRequestFilter
  | "MDB"                  // @MessageDriven → @KafkaListener
  | "BATCH_READER"         // ItemReader → @Component Spring Batch
  | "BATCH_PROCESSOR"      // ItemProcessor → @Component Spring Batch
  | "BATCH_WRITER"         // ItemWriter → @Component Spring Batch
  | "VALIDATOR"            // CDI bean pur sans annotation → @Component
  | "TRANSFORMER"          // CDI bean pur sans annotation → @Component
  | "UNKNOWN";

/**
 * Detect the Java EE component type from source code (BUG-B v7.5).
 * Order matters: EJB annotations take priority over CDI.
 */
export function detectComponentType(source: string): JavaComponentType {
  // EJB Annotations (highest priority)
  if (/@Stateless/.test(source))    return "EJB3X_STATELESS";
  if (/@Singleton/.test(source))    return "EJB3X_SINGLETON";
  if (/@Stateful/.test(source))     return "EJB3X_STATEFUL";
  if (/implements\s+(?:.*\b)?SessionBean\b/.test(source)) return "EJB2X_SESSION";

  // CDI Annotations
  if (/@ApplicationScoped/.test(source)) return "CDI_APPLICATION";
  if (/@RequestScoped/.test(source))     return "CDI_REQUEST";

  // Servlet / Filter
  if (/extends\s+HttpServlet/.test(source))    return "SERVLET";
  if (/implements\s+(?:.*\b)?Filter\b/.test(source)) return "FILTER";

  // MDB
  if (/@MessageDriven/.test(source)) return "MDB";

  // Batch JSR-352
  if (/extends\s+AbstractItemReader/.test(source) ||
      /implements\s+(?:.*\b)?ItemReader\b/.test(source))   return "BATCH_READER";
  if (/implements\s+(?:.*\b)?ItemProcessor\b/.test(source)) return "BATCH_PROCESSOR";
  if (/extends\s+AbstractItemWriter/.test(source) ||
      /implements\s+(?:.*\b)?ItemWriter\b/.test(source))   return "BATCH_WRITER";

  return "UNKNOWN";
}

/** Whether this component type should generate a REST Controller (BUG-B v7.5) */
export function shouldGenerateController(type: JavaComponentType): boolean {
  return type === "EJB3X_STATELESS"
      || type === "EJB3X_STATEFUL"
      || type === "EJB2X_SESSION"
      || type === "EJB3X_SINGLETON"
      || type === "SERVLET";
}

/** Map component type to Spring annotation (BUG-B v7.5) */
export function generateSpringAnnotation(type: JavaComponentType): string {
  switch (type) {
    case "EJB3X_STATELESS":
    case "EJB3X_STATEFUL":
    case "EJB2X_SESSION":
      return "@Service";
    case "EJB3X_SINGLETON":
    case "CDI_APPLICATION":
    case "CDI_REQUEST":
    case "VALIDATOR":
    case "TRANSFORMER":
      return "@Component";
    case "SERVLET":
      return "@RestController";
    case "FILTER":
      return "@Component";
    case "MDB":
      return "@Component";
    case "BATCH_READER":
    case "BATCH_PROCESSOR":
    case "BATCH_WRITER":
      return "@Component";
    default:
      return "@Component";
  }
}

/**
 * BUG-A v7.5: Check if a class is an inner/private/static nested class.
 * Inner classes should not be treated as EJBs.
 */
function isInnerClass(content: string, className: string): boolean {
  const classDecl = `class ${className}`;
  const idx = content.indexOf(classDecl);
  if (idx < 0) return false;

  // Check for 'private', 'protected', 'static' modifier before class declaration
  const before = content.substring(Math.max(0, idx - 80), idx);
  if (/\b(private|protected)\s+(static\s+)?class\b/.test(before + "class")) return true;
  if (/\bstatic\s+class\b/.test(content.substring(Math.max(0, idx - 15), idx + classDecl.length))) return true;

  // Check indentation: inner classes are declared inside another class
  // Count opening/closing braces before this class declaration
  const beforeClass = content.substring(0, idx);
  const publicClassMatches = beforeClass.match(/public\s+(?:abstract\s+)?class\s+/g);
  if (publicClassMatches && publicClassMatches.length >= 1) {
    // There's already a public class before this one → this is an inner class
    // But only if this class itself is NOT the first public class
    const firstPublicClassIdx = content.search(/public\s+(?:abstract\s+)?class\s+/);
    if (firstPublicClassIdx >= 0 && firstPublicClassIdx < idx) {
      return true;
    }
  }

  return false;
}

/**
 * BUG-A v7.5: Check if a class should be skipped from EJB/CDI processing.
 * Filters inner classes, DTOs, listeners, callbacks, enums.
 */
function shouldSkipClass(className: string, content: string, fullSource: string): boolean {
  // 1. Inner class / private static class
  if (isInnerClass(fullSource, className)) return true;

  // 2. DTO / ValueObject suffixes
  const dtoSuffixes = [
    "VoIn", "VoOut", "DTO", "Dto", "Request", "Response",
    "Item", "Context", "Data", "Builder", "Event", "Config",
    "Info", "Detail", "Summary", "Result", "Match"
  ];
  if (dtoSuffixes.some(s => className.endsWith(s))) return true;

  // 3. Listener / Callback / Handler (non-servlet)
  if (className.endsWith("Listener") || className.endsWith("Callback")) return true;
  if (className.endsWith("Handler") && !/extends\s+HttpServlet/.test(content)) return true;

  // 4. Enum declaration
  if (/public\s+enum\s+/.test(content)) return true;

  return false;
}

/**
 * BUG-C v7.5: Check if a class is a DTO that should NOT be treated as an EJB/CDI component.
 */
function isDtoClass(className: string, source: string): boolean {
  // 1. Known DTO suffixes
  const dtoSuffixes = [
    "VoIn", "VoOut", "DTO", "Dto", "RequestDTO", "ResponseDTO",
    "Request", "Response", "Item", "Context", "Data",
    "Config", "Info", "Detail", "Summary", "Result", "Match"
  ];
  if (dtoSuffixes.some(s => className.endsWith(s))) return true;

  // 2. Lombok @Data/@Builder without EJB/CDI annotations
  const hasLombokData    = /@Data/.test(source);
  const hasLombokBuilder = /@Builder/.test(source);
  const hasEJBAnnotation = /@Stateless|@Singleton|@Stateful|@ApplicationScoped|@MessageDriven/.test(source);
  if (hasLombokData && hasLombokBuilder && !hasEJBAnnotation) return true;

  // 3. @Data without business logic
  const hasBusinessLogic = source.includes("DataSource")
    || source.includes("Connection")
    || source.includes("PreparedStatement")
    || source.includes("@Resource")
    || source.includes("@EJB")
    || source.includes("@Inject");
  if (hasLombokData && !hasBusinessLogic) return true;

  return false;
}

function isUseCase(content: string): boolean {
  // BOA pattern: @UseCase + BaseUseCase
  if (/@UseCase/.test(content) && /implements\s+BaseUseCase/.test(content)) return true;
  // Standard Java EE pattern: @Stateless with BaseUseCase (single execute() UseCase)
  if (/@Stateless/.test(content) && /implements\s+BaseUseCase/.test(content) && /public\s+class/.test(content)) {
    const classNameMatch = content.match(/public\s+class\s+(\w+)/);
    const className = classNameMatch ? classNameMatch[1] : "";
    if (isDao(content, className)) return false;
    return true;
  }
  // @Stateless WITHOUT BaseUseCase → handled by isDirectEjb() / parseDirectEjbUseCases()
  // Do NOT match here to avoid parseUseCase() producing empty stubs
  return false;
}

/**
 * Détecte les EJB directs — @Stateless sans BaseUseCase,
 * avec au moins une méthode publique business (non-lifecycle).
 * Chaque méthode publique non-lifecycle = 1 UseCase distinct.
 * v5.10.1: seuil abaissé de >1 à >=1 pour couvrir les EJB à méthode unique.
 */
function isDirectEjb(content: string): boolean {
  // BUG-B v7.5: CDI @ApplicationScoped/@RequestScoped are NOT EJBs
  if (/@ApplicationScoped/.test(content) || /@RequestScoped/.test(content)) return false;
  if (!/@Stateless/.test(content) && !/@Stateful/.test(content)) return false;
  if (/implements\s+BaseUseCase/.test(content)) return false; // BOA pattern → single UseCase via parseUseCase
  if (!(/public\s+class/.test(content))) return false;
  const classNameMatch = content.match(/public\s+class\s+(\w+)/);
  const className = classNameMatch ? classNameMatch[1] : "";
  if (isDao(content, className)) return false;
  // BUG-A v7.5: Skip inner classes
  if (shouldSkipClass(className, content, content)) return false;
  // BUG-C v7.5: Skip DTOs
  if (isDtoClass(className, content)) return false;
  // Count business methods (public, non-lifecycle, non-constructor)
  const businessMethods = extractBusinessMethods(content, className);
  return businessMethods.length >= 1;
}

interface DirectEjbMethod {
  name: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  throwsExceptions: string[];
  javadoc: string;
}

const LIFECYCLE_METHODS = new Set([
  "ejbCreate", "ejbRemove", "ejbActivate", "ejbPassivate",
  "setSessionContext", "setEntityContext", "unsetEntityContext",
  "toString", "hashCode", "equals", "clone", "finalize",
  "init", "destroy", "afterPropertiesSet",
]);

function extractBusinessMethods(content: string, className: string): DirectEjbMethod[] {
  const methods: DirectEjbMethod[] = [];
  const methodRegex = /(?:\/\*\*([\s\S]*?)\*\/\s*)?public\s+((?:[\w<>,\s\[\]]+?)\s+(\w+))\s*\(([^)]*)\)\s*(?:throws\s+([\w,\s]+))?\s*\{/g;
  let m;
  while ((m = methodRegex.exec(content)) !== null) {
    const javadocRaw = m[1] || "";
    const returnType = m[2].replace(m[3], "").trim();
    const name = m[3];
    const paramsStr = m[4];
    const throwsStr = m[5] || "";

    // Skip constructor
    if (name === className) continue;
    // Skip lifecycle methods
    if (LIFECYCLE_METHODS.has(name)) continue;
    // Skip void setters (setXxx)
    if (/^set[A-Z]/.test(name) && returnType === "void") continue;
    // Skip getters that are just simple property accessors (getXxx with no params AND simple return type)
    // FIX G v7.3: Do NOT skip business methods like getCartesActives(), getHistoriqueClientComplet()
    // Heuristic: skip only if return type is a simple primitive/wrapper AND method body is a simple return
    if (/^get[A-Z]/.test(name) && !paramsStr.trim()) {
      // Keep methods that return collections (List, Set, Map) or complex types (DTO, Response, etc.)
      const isCollectionReturn = /^(?:List|Set|Map|Collection|Iterable|Stream)</.test(returnType);
      const isComplexReturn = /DTO$|Response$|Result$|Info$|Data$|Bean$|VO$|Vo$/.test(returnType);
      // Keep methods with non-trivial names (more than just getXxx for a field)
      const nameAfterGet = name.substring(3);
      const isLikelyBusinessMethod = nameAfterGet.length > 15 || /Active|Historique|Complet|All|List|By|For|Client|Compte|Carte|Session|Solde|Mouvement|Virement/.test(nameAfterGet);
      if (!isCollectionReturn && !isComplexReturn && !isLikelyBusinessMethod) continue;
    }
    // Skip is-prefixed boolean getters (only if no params — validerSession(String token) → boolean is NOT a getter)
    if (/^is[A-Z]/.test(name) && !paramsStr.trim() && returnType === "boolean") continue;

    const javadoc = javadocRaw
      .split("\n")
      .map(l => l.replace(/^\s*\*\s?/, "").trim())
      .filter(l => l && !l.startsWith("@"))
      .join(" ")
      .trim();

    const parameters = paramsStr
      .split(",")
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        // Remove annotations like @Valid, @NotNull
        const cleaned = p.replace(/@\w+(?:\([^)]*\))?\s*/g, "").trim();
        const parts = cleaned.split(/\s+/);
        return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" ") };
      });

    const throwsExceptions = throwsStr.split(",").map(e => e.trim()).filter(Boolean);

    methods.push({ name, returnType, parameters, throwsExceptions, javadoc });
  }
  return methods;
}

/**
 * Parse un EJB direct multi-méthodes en N UseCaseIR.
 * Chaque méthode publique non-lifecycle produit un UseCase distinct.
 * Le className du UseCase = EjbClassName_MethodName (ex: NotificationServiceEJB_envoyerSMS)
 */
function parseDirectEjbUseCases(
  file: JavaFile,
  dtoMap: Map<string, DtoIR>,
  bianMappings: BianMapping[],
  typeRegistry: Map<string, string>
): UseCaseIR[] {
  const content = file.content;
  const domain = extractDomain(file.packageName, file.className);
  const businessMethods = extractBusinessMethods(content, file.className);

  // Extract injected services (shared across all methods)
  const injectedServices: InjectedService[] = [];
  const autowiredRegex = /@(?:Autowired|Inject|EJB|Resource)\s+(?:private\s+)?(\w+)\s+(\w+)/g;
  let am;
  while ((am = autowiredRegex.exec(content)) !== null) {
    injectedServices.push({ type: am[1], name: am[2] });
  }

  // Extract @Transactional info (shared)
  let transactional: TransactionalInfo | null = null;
  const txMatch = content.match(/@Transactional\s*\(([^)]*)\)/);
  if (txMatch) {
    const txBody = txMatch[1];
    transactional = {
      readOnly: /readOnly\s*=\s*true/.test(txBody),
      propagation: (txBody.match(/propagation\s*=\s*Propagation\.(\w+)/) || [, "REQUIRED"])[1],
      rollbackFor: (txBody.match(/rollbackFor\s*=\s*(\w+)\.class/) || [, ""])[1],
    };
  } else if (/@Transactional/.test(content)) {
    transactional = { readOnly: false, propagation: "REQUIRED", rollbackFor: "" };
  }

  return businessMethods.map(method => {
    // Derive VoIn from first parameter type
    const voInType = method.parameters.length > 0 ? method.parameters[0].type : "Void";
    // Derive VoOut from return type
    const voOutType = method.returnType === "void" ? "Void" : method.returnType;

    // Generate a unique className for this UseCase
    const ucClassName = `${file.className}_${method.name}`;

    // Determine HTTP method from method name
    const httpMethod = determineHttpMethod(method.name, "");
    const restPath = generateRestPath(domain, method.name);

    // Description from Javadoc or method name
    const useCaseDescription = method.javadoc || `${method.name} — extrait de ${file.className}`;

    return {
      className: ucClassName,
      packageName: file.packageName,
      domain,
      bianDomain: "",
      bianAction: "",
      voInType,
      voOutType,
      useCaseDescription,
      javadoc: method.javadoc,
      injectedServices,
      transactional,
      exceptionsCaught: [],
      exceptionsThrown: method.throwsExceptions,
      sourceFile: file.path,
      rawSource: content,
      httpMethod,
      restPath,
      // FIX E v7.3: Propagate all legacy method parameters
      methodParameters: method.parameters,
    };
  });
}

/**
 * Détecte les classes DAO/Repository — couche persistance, pas UseCase.
 * Patterns : nommage *DAO/*Dao/*Repository/*Persistence,
 *            ou @Stateless avec accès JDBC/EntityManager sans execute().
 */
function isDao(content: string, className: string): boolean {
  // Pattern de nommage DAO
  const isDaoName = /DAO$|Dao$|Repository$|Persistence$/.test(className);
  if (isDaoName) return true;

  // @Stateless avec accès données mais sans méthode execute()
  // v5.10.2: Ne pas exclure si l'EJB a des méthodes business non-lifecycle
  // (sinon les EJB directs comme CompteEJB avec EntityManager seraient exclus à tort)
  if (/@Stateless/.test(content)) {
    const hasDataAccess = /EntityManager|getConnection|PreparedStatement|DataSource|@PersistenceContext/.test(content);
    const hasExecute = /public\s+\w+\s+execute\s*\(/.test(content);
    if (hasDataAccess && !hasExecute) {
      // Check if it has real business methods (non-lifecycle, non-getter/setter)
      const businessMethods = extractBusinessMethods(content, className);
      // Only classify as DAO if it has NO business methods
      // (pure data access layer with only lifecycle + accessors)
      if (businessMethods.length === 0) return true;
      // Has business methods → it's a direct EJB, not a DAO
      return false;
    }
  }

  return false;
}

function isDto(content: string, className: string): boolean {
  // VoIn/VoOut/Dto naming convention (most reliable for BOA)
  if (/Vo(In|Out)$|Dto$/.test(className) && /(private|protected)\s+\w+\s+\w+;/.test(content)) return true;
  // Implements ValueObject or Serializable with DTO-like name
  if (/implements\s+(ValueObject|Serializable)/.test(content) && /Vo(In|Out)|Dto/.test(className)) return true;
  // XML-annotated data classes
  if (/@Xml(RootElement|AccessorType)/.test(content) && /(private|protected)\s+\w+\s+\w+;/.test(content)) return true;
  return false;
}

function isService(content: string, className: string): boolean {
  if (isUseCase(content) || isEnum(content) || isException(className, content)) return false;
  if (isDto(content, className)) return false; // Don't classify DTOs as services
  if (/Service\b/.test(className) && !/@Remote/.test(content) && !/@interface/.test(content)) return true;
  return false;
}

function isEnum(content: string): boolean {
  return /public\s+enum\s+\w+/.test(content);
}

function isException(className: string, content: string): boolean {
  return /Exception\b/.test(className) && /extends\s+\w*(Exception|Throwable)/.test(content);
}

function isValidator(className: string, content: string): boolean {
  return /Validator\b/.test(className) || (/@interface/.test(content) && /Valid/.test(className));
}

function isRemoteInterface(content: string): boolean {
  return /@Remote/.test(content) && /interface\s+\w+/.test(content);
}

function isBaseClass(content: string, className: string): boolean {
  if (className === "BaseUseCase" || className === "ValueObject") return true;
  if (/@interface/.test(content) && className === "UseCase") return true;
  return false;
}

function isEjb2xBean(content: string): boolean {
  // EJB 2.x: implements SessionBean/EntityBean/MessageDrivenBean, or has ejbCreate/ejbRemove
  if (/implements\s+(?:.*\b)?(?:SessionBean|EntityBean)\b/.test(content)) return true;
  if (/\bejbCreate\b/.test(content) && /\bejbRemove\b/.test(content)) return true;
  return false;
}

function isBatchJob(content: string): boolean {
  // JSR-352: implements ItemReader/ItemWriter/ItemProcessor, or @BatchProperty
  if (/implements\s+(?:.*\b)?(?:ItemReader|ItemWriter|ItemProcessor|AbstractItemReader|AbstractItemWriter)\b/.test(content)) return true;
  if (/@BatchProperty/.test(content)) return true;
  // Batchlet
  if (/implements\s+(?:.*\b)?Batchlet\b/.test(content)) return true;
  return false;
}

function parseEjb2xBean(file: JavaFile, allFiles: JavaFile[]): Ejb2xBeanIR {
  const content = file.content;
  const className = file.className;
  const packageName = file.packageName;

  // Determine bean type
  let beanType: Ejb2xBeanIR["beanType"] = "SESSION";
  if (/implements\s+(?:.*\b)?EntityBean\b/.test(content)) beanType = "ENTITY";
  if (/implements\s+(?:.*\b)?MessageDrivenBean\b/.test(content)) beanType = "MDB";

  // Find Home/Remote interfaces by naming convention (e.g., ActivationCarteBean → ActivationCarteHome/ActivationCarteRemote)
  const baseName = className.replace(/Bean$/, "");
  const homeFile = allFiles.find(f => f.className === `${baseName}Home`);
  const remoteFile = allFiles.find(f => f.className === `${baseName}Remote`);

  // Extract methods from the bean class
  const methods: Ejb2xBeanIR["methods"] = [];
  const methodPattern = /public\s+(\w[\w<>,\s]*?)\s+(\w+)\s*\(([^)]*)\)/g;
  let m;
  while ((m = methodPattern.exec(content)) !== null) {
    const name = m[2];
    // Skip EJB lifecycle methods
    if (/^(ejbCreate|ejbRemove|ejbActivate|ejbPassivate|setSessionContext|setEntityContext|unsetEntityContext)$/.test(name)) continue;
    const returnType = m[1].trim();
    const params = m[3].trim()
      .split(",")
      .filter(Boolean)
      .map(p => {
        const parts = p.trim().split(/\s+/);
        return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" ") };
      });
    methods.push({ name, returnType, parameters: params });
  }

  return {
    className,
    packageName,
    beanType,
    homeInterface: homeFile?.className || "",
    remoteInterface: remoteFile?.className || "",
    methods,
    sourceFile: file.path,
    rawSource: content,
  };
}

function parseBatchJob(file: JavaFile): BatchJobIR {
  const content = file.content;
  const className = file.className;
  const packageName = file.packageName;

  let batchRole: BatchJobIR["batchRole"] = "PROCESSOR";
  let implementsInterface = "";
  if (/implements\s+(?:.*\b)?ItemReader\b/.test(content) || /implements\s+(?:.*\b)?AbstractItemReader\b/.test(content)) {
    batchRole = "READER";
    implementsInterface = "ItemReader";
  } else if (/implements\s+(?:.*\b)?ItemWriter\b/.test(content) || /implements\s+(?:.*\b)?AbstractItemWriter\b/.test(content)) {
    batchRole = "WRITER";
    implementsInterface = "ItemWriter";
  } else if (/implements\s+(?:.*\b)?ItemProcessor\b/.test(content)) {
    batchRole = "PROCESSOR";
    implementsInterface = "ItemProcessor";
  } else if (/implements\s+(?:.*\b)?MessageListener\b/.test(content)) {
    batchRole = "LISTENER";
    implementsInterface = "MessageListener";
  } else if (/implements\s+(?:.*\b)?Batchlet\b/.test(content)) {
    batchRole = "BATCHLET";
    implementsInterface = "Batchlet";
  }

  return {
    className,
    packageName,
    batchRole,
    implementsInterface,
    sourceFile: file.path,
    rawSource: content,
  };
}

// ─── Extraction Helpers ─────────────────────────────────────────────────────

function extractPackage(content: string): string {
  const m = content.match(/package\s+([\w.]+)\s*;/);
  return m ? m[1] : "";
}

function extractClassName(path: string, content: string): string {
  // Try from content first
  const m = content.match(/public\s+(?:abstract\s+)?(?:class|interface|enum|@interface)\s+(\w+)/);
  if (m) return m[1];
  // Fallback to filename
  const parts = path.split("/");
  const filename = parts[parts.length - 1];
  return filename.replace(".java", "");
}

function buildTypeRegistry(files: JavaFile[]): Map<string, string> {
  const registry = new Map<string, string>();
  for (const f of files) {
    registry.set(f.className, f.packageName + "." + f.className);
  }
  return registry;
}

// ─── UseCase Parser ─────────────────────────────────────────────────────────

function parseUseCase(
  file: JavaFile,
  dtoMap: Map<string, DtoIR>,
  bianMappings: BianMapping[],
  typeRegistry: Map<string, string>
): UseCaseIR {
  const content = file.content;

  // Extract domain from package or class name
  const domain = extractDomain(file.packageName, file.className);

  // Extract @UseCase description for Javadoc / OpenAPI
  let useCaseDescription = "";
  const ucDescMatch = content.match(/@UseCase\s*\(\s*description\s*=\s*"([^"]+)"/);
  if (ucDescMatch) useCaseDescription = ucDescMatch[1];

  // Extract Javadoc comment above the class
  let javadoc = "";
  const javadocMatch = content.match(/\/\*\*([\s\S]*?)\*\/\s*(?:@\w+[\s\S]*?)*(?:public\s+(?:abstract\s+)?class)/);
  if (javadocMatch) {
    javadoc = javadocMatch[1]
      .split("\n")
      .map(l => l.replace(/^\s*\*\s?/, "").trim())
      .filter(l => l && !l.startsWith("@"))
      .join(" ")
      .trim();
  }

  // ─── VoIn Resolution (4-level fallback) ───
  let voInType = resolveVoType(content, file.className, "VoIn", dtoMap, typeRegistry);

  // ─── VoOut Resolution (4-level fallback) ───
  let voOutType = resolveVoType(content, file.className, "VoOut", dtoMap, typeRegistry);

  // ─── Extract injected services ───
  const injectedServices: InjectedService[] = [];
  const autowiredRegex = /@(?:Autowired|Inject|EJB|Resource)\s+(?:private\s+)?(\w+)\s+(\w+)/g;
  let am;
  while ((am = autowiredRegex.exec(content)) !== null) {
    injectedServices.push({ type: am[1], name: am[2] });
  }

  // Extract @Transactional info
  let transactional: TransactionalInfo | null = null;
  const txMatch = content.match(/@Transactional\s*\(([^)]*)\)/);
  if (txMatch) {
    const txBody = txMatch[1];
    transactional = {
      readOnly: /readOnly\s*=\s*true/.test(txBody),
      propagation: (txBody.match(/propagation\s*=\s*Propagation\.(\w+)/) || [, "REQUIRED"])[1],
      rollbackFor: (txBody.match(/rollbackFor\s*=\s*(\w+)\.class/) || [, ""])[1],
    };
  } else if (/@Transactional/.test(content)) {
    transactional = { readOnly: false, propagation: "REQUIRED", rollbackFor: "" };
  }

  // Extract caught exceptions
  const exceptionsCaught: string[] = [];
  const catchRegex = /catch\s*\(\s*(\w+)\s+/g;
  let cm;
  while ((cm = catchRegex.exec(content)) !== null) {
    if (!exceptionsCaught.includes(cm[1])) exceptionsCaught.push(cm[1]);
  }

  // Extract thrown exceptions
  const exceptionsThrown: string[] = [];
  const throwsRegex = /throws\s+([\w,\s]+)/g;
  let tm;
  while ((tm = throwsRegex.exec(content)) !== null) {
    tm[1].split(",").map(e => e.trim()).filter(Boolean).forEach(e => {
      if (!exceptionsThrown.includes(e)) exceptionsThrown.push(e);
    });
  }

  // Extract BIAN info from Javadoc comment
  let bianDomain = "";
  let bianAction = "";
  const bianComment = content.match(/\/\*\*\s*BIAN:\s*([^(]+)\(([^)]+)\)\s*\/?\s*(\w+)?/);
  if (bianComment) {
    bianDomain = bianComment[1].trim();
    bianAction = bianComment[3] || "";
  }
  // Also check BIAN mapping file
  const bianEntry = bianMappings.find(b => b.useCase === file.className);
  if (bianEntry) {
    bianDomain = bianEntry.serviceDomain;
    bianAction = bianEntry.action;
  }

  // Determine HTTP method and REST path
  const httpMethod = determineHttpMethod(file.className, bianAction);
  const restPath = generateRestPath(domain, file.className);

  return {
    className: file.className,
    packageName: file.packageName,
    domain,
    bianDomain,
    bianAction,
    voInType,
    voOutType,
    useCaseDescription,
    javadoc,
    injectedServices,
    transactional,
    exceptionsCaught,
    exceptionsThrown,
    sourceFile: file.path,
    rawSource: content,
    httpMethod,
    restPath,
  };
}

/**
 * Resolve VoIn or VoOut type using a 4-level fallback strategy:
 * 1. Cast pattern in method body: (XxxVoIn) voIn
 * 2. Constructor pattern: new XxxVoOut()
 * 3. Explicit import: import ...XxxVoIn;
 * 4. Naming convention fallback: UseCaseName → UseCaseNameVoIn/VoOut
 *    (looks up in dtoMap and typeRegistry)
 */
function resolveVoType(
  content: string,
  className: string,
  suffix: "VoIn" | "VoOut",
  dtoMap: Map<string, DtoIR>,
  typeRegistry: Map<string, string>
): string {
  const suffixRegex = suffix === "VoIn" ? /VoIn/ : /VoOut/;

  // Strategy 1: Cast pattern (VoIn) or constructor pattern (VoOut)
  if (suffix === "VoIn") {
    const castMatch = content.match(/\((\w+VoIn)\)\s*\w+/);
    if (castMatch) return castMatch[1];
  } else {
    const newMatch = content.match(/new\s+(\w+VoOut)\s*\(/);
    if (newMatch) return newMatch[1];
  }

  // Strategy 2: Explicit import
  const importRegex = new RegExp(`import\\s+[\\w.]+\\.(\\w+${suffix})\\s*;`);
  const importMatch = content.match(importRegex);
  if (importMatch) return importMatch[1];

  // Strategy 3: Naming convention — derive from UseCase class name
  // ActiverCarteUC → ActiverCarteVoIn / ActiverCarteVoOut
  // SouscrireContratEJB → SouscrireContratVoIn / SouscrireContratVoOut
  const baseName = className.replace(/UC$/, "").replace(/EJB$/, "");
  const conventionName = baseName + suffix;

  // Check if this DTO exists in the project (dtoMap or typeRegistry)
  if (dtoMap.has(conventionName)) return conventionName;
  if (typeRegistry.has(conventionName)) return conventionName;

  // Strategy 4: Wildcard import scan — if import *.dto.* exists,
  // look for any DTO in the same domain package that matches the suffix
  const wildcardImport = content.match(/import\s+([\w.]+)\.\*\s*;/g);
  if (wildcardImport) {
    for (const [dtoName] of dtoMap) {
      if (suffixRegex.test(dtoName) && dtoName.startsWith(baseName)) {
        return dtoName;
      }
    }
    // Also check typeRegistry for DTOs not yet in dtoMap
    for (const [typeName] of typeRegistry) {
      if (suffixRegex.test(typeName) && typeName.startsWith(baseName)) {
        return typeName;
      }
    }
  }

  // Fallback: return ValueObject (will trigger a warning in the caller)
  return "ValueObject";
}

function extractDomain(packageName: string, className: string): string {
  // Try to extract from package: ma.eai.boa.xbanking.carte.usecases -> carte
  const pkgParts = packageName.split(".");
  const ucIdx = pkgParts.indexOf("usecases");
  if (ucIdx > 0) {
    return pkgParts[ucIdx - 1];
  }

  // FIX F v5.7.2: Infer domain from class name with enriched patterns
  // Strip common suffixes: UC, UseCase, EJB, Bean, Service, Impl
  const name = className
    .replace(/UC$/, "")
    .replace(/UseCase$/, "")
    .replace(/EJB$/, "")
    .replace(/Bean$/, "")
    .replace(/ServiceImpl$/, "")
    .replace(/Service$/, "")
    .replace(/Impl$/, "");

  // For direct EJB: strip method suffix (e.g. CompteEJB_consulterSolde → Compte)
  const baseName = name.includes("_") ? name.split("_")[0] : name;

  // Domain keyword mapping (order matters: more specific first)
  const domainPatterns: Array<{ regex: RegExp; domain: string }> = [
    { regex: /^Carte|Card|Activer|Bloquer|Receptionner|Opposition/, domain: "carte" },
    { regex: /^Client|Customer|Charger|MajClient/, domain: "client" },
    { regex: /^Compte|Account|Ouvrir|Cloturer|Solde/, domain: "compte" },
    { regex: /^Credit|Loan|Simuler|Pret/, domain: "credit" },
    { regex: /^Virement|Transfer|Virer/, domain: "virement" },
    { regex: /^Document|Generer|Pdf|Releve/, domain: "document" },
    { regex: /^Notification|Envoyer|Sms|Email|Alerte/, domain: "notification" },
    { regex: /^Report|Reporting|Rapport|Statistique|Stat/, domain: "reporting" },
    { regex: /^Session|Connexion|Login|Auth|Token/, domain: "sessions" },
    { regex: /^Cheque|Check/, domain: "cheque" },
    { regex: /^Beneficiaire|Beneficiary/, domain: "beneficiaire" },
    { regex: /^Devise|Currency|Change|Forex/, domain: "devise" },
    { regex: /^Paiement|Payment|Pay/, domain: "paiement" },
    { regex: /^Assurance|Insurance/, domain: "assurance" },
    { regex: /^Epargne|Saving/, domain: "epargne" },
    { regex: /^Agence|Branch|Agency/, domain: "agence" },
    { regex: /^Utilisateur|User|Profil|Profile/, domain: "utilisateur" },
    { regex: /^Mouvement|Movement|Transaction/, domain: "mouvement" },
    { regex: /^Batch|Job|Scheduler/, domain: "batch" },
    { regex: /^Config|Parametre|Setting/, domain: "configuration" },
  ];

  for (const { regex, domain } of domainPatterns) {
    if (regex.test(baseName)) return domain;
  }

  // Fallback: use the base class name as domain (lowercase)
  // e.g. "AccountServiceBean" → "account" (after stripping suffixes)
  if (baseName.length > 2 && baseName !== className) {
    return baseName.charAt(0).toLowerCase() + baseName.slice(1);
  }

  return "general";
}

function determineHttpMethod(className: string, bianAction: string): string {
  const name = className.toLowerCase();
  if (/consulter|charger|get|list|count/.test(name)) return "GET";
  if (/maj|update|modifier|bloquer|activer/.test(name)) return "PUT";
  if (/ouvrir|creer|create|simuler|envoyer|generer|virement/.test(name)) return "POST";
  if (/cloturer|supprimer|delete/.test(name)) return "DELETE";
  if (bianAction) {
    const action = bianAction.toLowerCase();
    if (/execution|initiate|create/.test(action)) return "POST";
    if (/retrieve|evaluate/.test(action)) return "GET";
    if (/update/.test(action)) return "PUT";
  }
  return "POST";
}

function generateRestPath(domain: string, className: string): string {
  const name = className.replace(/UC$/, "");
  // Convert CamelCase to kebab-case
  const kebab = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  return `/api/v1/${domain}/${kebab}`;
}

// ─── DTO Parser ─────────────────────────────────────────────────────────────

function parseDto(file: JavaFile, enumNames: Set<string>): DtoIR {
  const content = file.content;
  const className = file.className;

  // Determine direction
  let direction: "in" | "out" | "unknown" = "unknown";
  if (/VoIn$/.test(className)) direction = "in";
  else if (/VoOut$/.test(className)) direction = "out";

  // Extract XML root element
  const xmlRoot = content.match(/@XmlRootElement\s*(?:\(\s*name\s*=\s*"([^"]+)"\s*\))?/);
  const xmlRootElement = xmlRoot ? (xmlRoot[1] || className) : className;

  // Extract implements
  const implMatch = content.match(/implements\s+([\w,\s]+)/);
  const implementsInterfaces = implMatch
    ? implMatch[1].split(",").map(s => s.trim()).filter(Boolean)
    : [];

  // Extract fields
  const fields: DtoFieldIR[] = [];
  const lines = content.split("\n");
  let pendingAnnotations: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, class/interface declarations, imports, package
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      continue;
    }
    if (trimmed.startsWith("package ") || trimmed.startsWith("import ")) {
      continue;
    }
    if (/^(public|abstract)?\s*(class|interface|enum)\s/.test(trimmed)) {
      pendingAnnotations = [];
      continue;
    }

    // CORRECTION v5.2: Handle lines with BOTH annotations AND field declaration on the same line
    // e.g. "@XmlElement(required = true) @NotBlank @ValidRIB private String ribEmetteur;"
    const fieldAccessorMatch = trimmed.match(/(private|protected|public)\s+/);
    if (fieldAccessorMatch) {
      // Extract inline annotations from the part BEFORE the access modifier
      const accessorIdx = trimmed.indexOf(fieldAccessorMatch[0]);
      if (accessorIdx > 0) {
        const annotationPart = trimmed.substring(0, accessorIdx).trim();
        // Extract all @Xxx(...) annotations from the prefix
        const inlineAnnotations = annotationPart.match(/@\w+(?:\([^)]*\))?/g);
        if (inlineAnnotations) {
          pendingAnnotations.push(...inlineAnnotations);
        }
      }

      // Now match the field declaration part
      const fieldPart = trimmed.substring(accessorIdx);
      const fieldMatch = fieldPart.match(/(?:private|protected|public)\s+(?:static\s+final\s+\w+\s+serialVersionUID)|(?:private|protected|public)\s+([\w<>,\s]+?)\s+(\w+)\s*;/);
      if (fieldMatch && fieldMatch[1] && fieldMatch[2]) {
        const rawType = fieldMatch[1].trim();
        const name = fieldMatch[2];

        // Skip serialVersionUID
        if (name === "serialVersionUID") {
          pendingAnnotations = [];
          continue;
        }

        const allAnnotations = pendingAnnotations;
        const required = allAnnotations.some(a => /required\s*=\s*true/.test(a));
        const xmlElement = allAnnotations.some(a => /@XmlElement/.test(a));
        const validationAnnotations = allAnnotations
          .filter(a => /@Valid/.test(a) || /@NotNull/.test(a) || /@NotBlank/.test(a) || /@Size/.test(a) || /@NotEmpty/.test(a) || /@DecimalMin/.test(a) || /@DecimalMax/.test(a) || /@Min/.test(a) || /@Max/.test(a) || /@Pattern/.test(a) || /@Positive/.test(a))
          .map(a => a.replace(/^@/, ""));

        const isEnum = enumNames.has(rawType);
        const isList = /List</.test(rawType) || /\[\]/.test(rawType);
        const resolvedType = resolveJavaType(rawType, isEnum);

        // CORRECTION v5.2: Semantic type inference — String fields named date* → LocalDate
        let finalType = rawType;
        if (rawType === "String" && /^date/i.test(name)) {
          finalType = "LocalDate";
        }

        fields.push({
          name,
          type: finalType,
          resolvedType: finalType !== rawType ? finalType : resolvedType,
          required,
          xmlElement,
          validationAnnotations,
          isEnum,
          isList,
        });

        pendingAnnotations = [];
      } else {
        pendingAnnotations = [];
      }
    } else if (trimmed.startsWith("@")) {
      // Pure annotation line (no field on this line)
      pendingAnnotations.push(trimmed);
    } else {
      // Non-annotation, non-field line (getter/setter, etc.) → reset
      pendingAnnotations = [];
    }
  }

  return {
    className,
    packageName: file.packageName,
    direction,
    xmlRootElement,
    fields,
    implementsInterfaces,
    sourceFile: file.path,
  };
}

function resolveJavaType(rawType: string, isEnum: boolean): string {
  if (isEnum) return rawType; // Keep enum name

  const typeMap: Record<string, string> = {
    "String": "String",
    "string": "String",
    "int": "int",
    "Integer": "Integer",
    "long": "long",
    "Long": "Long",
    "double": "double",
    "Double": "Double",
    "float": "float",
    "Float": "Float",
    "boolean": "boolean",
    "Boolean": "Boolean",
    "BigDecimal": "BigDecimal",
    "BigInteger": "BigInteger",
    "LocalDate": "LocalDate",
    "LocalDateTime": "LocalDateTime",
    "Date": "LocalDate",
    "java.util.Date": "LocalDateTime",
    "byte[]": "byte[]",
    "Byte[]": "byte[]",
  };

  // Handle generics: List<String>, Map<K,V>, Set<X>
  const genericMatch = rawType.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const container = genericMatch[1];
    const innerRaw = genericMatch[2];
    if (container === "List" || container === "ArrayList" || container === "LinkedList") {
      const innerResolved = resolveJavaType(innerRaw.trim(), false);
      return `List<${innerResolved}>`;
    }
    if (container === "Set" || container === "HashSet" || container === "TreeSet") {
      const innerResolved = resolveJavaType(innerRaw.trim(), false);
      return `Set<${innerResolved}>`;
    }
    if (container === "Map" || container === "HashMap" || container === "TreeMap") {
      const parts = innerRaw.split(",").map(p => p.trim());
      if (parts.length === 2) {
        return `Map<${resolveJavaType(parts[0], false)}, ${resolveJavaType(parts[1], false)}>`;
      }
    }
    // Unknown generic container — preserve as-is
    return rawType;
  }

  // Handle raw collection types without generics
  if (rawType === "List" || rawType === "ArrayList") return "List<String>"; // Fallback, will generate WARNING
  if (rawType === "Set" || rawType === "HashSet") return "Set<String>";
  if (rawType === "Map" || rawType === "HashMap") return "Map<String, String>";

  const baseType = rawType.replace(/\[\]$/, "").trim();
  if (rawType.endsWith("[]") && typeMap[baseType]) return typeMap[baseType] + "[]";

  // RULE: Never emit "Object" — preserve original type name
  if (rawType === "Object" || rawType === "java.lang.Object") return rawType;

  return typeMap[rawType] || rawType; // Preserve unknown types as-is
}

// ─── Service Parser ─────────────────────────────────────────────────────────

function parseService(file: JavaFile): ServiceIR {
  const content = file.content;
  const methods: ServiceMethodIR[] = [];

  // Extract methods
  const methodRegex = /(?:public|protected)\s+([\w<>,\s\[\]]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+([\w,\s]+))?\s*\{/g;
  let mm;
  while ((mm = methodRegex.exec(content)) !== null) {
    const returnType = mm[1].trim();
    const name = mm[2];
    const paramsStr = mm[3];
    const throwsStr = mm[4] || "";

    if (name === file.className) continue; // Skip constructor

    const parameters = paramsStr
      .split(",")
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const parts = p.split(/\s+/);
        return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" ") };
      });

    const throwsExceptions = throwsStr.split(",").map(e => e.trim()).filter(Boolean);

    methods.push({ name, returnType, parameters, throwsExceptions });
  }

  // Extract injected dependencies
  const injectedDependencies: InjectedService[] = [];
  const autowiredRegex = /@(?:Autowired|Inject|EJB|Resource)\s+(?:private\s+)?(\w+)\s+(\w+)/g;
  let am;
  while ((am = autowiredRegex.exec(content)) !== null) {
    injectedDependencies.push({ type: am[1], name: am[2] });
  }

  return {
    className: file.className,
    packageName: file.packageName,
    methods,
    injectedDependencies,
    sourceFile: file.path,
  };
}

// ─── Enum Parser ────────────────────────────────────────────────────────────

function parseEnum(file: JavaFile): EnumIR {
  const content = file.content;
  const values: string[] = [];

  // Extract enum values
  const enumBody = content.match(/enum\s+\w+\s*\{([^}]+)\}/s);
  if (enumBody) {
    const body = enumBody[1];
    // Enum values are before the first semicolon or method
    const valuesSection = body.split(";")[0];
    const valRegex = /(\w+)/g;
    let vm;
    while ((vm = valRegex.exec(valuesSection)) !== null) {
      values.push(vm[1]);
    }
  }

  return {
    className: file.className,
    packageName: file.packageName,
    values,
    sourceFile: file.path,
  };
}

// ─── Exception Parser ───────────────────────────────────────────────────────

function parseException(file: JavaFile): ExceptionIR {
  const content = file.content;
  const extendsMatch = content.match(/extends\s+(\w+)/);
  return {
    className: file.className,
    packageName: file.packageName,
    extendsClass: extendsMatch ? extendsMatch[1] : "Exception",
    sourceFile: file.path,
  };
}

// ─── Validator Parser ───────────────────────────────────────────────────────

function parseValidator(file: JavaFile): ValidatorIR {
  const content = file.content;
  let annotationName = "";
  if (/@interface/.test(content)) {
    annotationName = file.className;
  } else {
    // Find the annotation it validates
    const constraintMatch = content.match(/implements\s+ConstraintValidator<(\w+)/);
    annotationName = constraintMatch ? constraintMatch[1] : file.className.replace("Validator", "");
  }
  return {
    className: file.className,
    packageName: file.packageName,
    annotationName,
    sourceFile: file.path,
  };
}

// ─── Remote Interface Parser ────────────────────────────────────────────────

function parseRemoteInterface(file: JavaFile): RemoteInterfaceIR {
  const content = file.content;
  const methods: RemoteMethodIR[] = [];

  // Extract methods
  const methodRegex = /(?:@RolesAllowed\(\{([^}]+)\}\)\s+)?(?:public\s+)?([\w<>,\s\[\]]+?)\s+(\w+)\s*\(([^)]*)\)\s*;/g;
  let mm;
  while ((mm = methodRegex.exec(content)) !== null) {
    const rolesStr = mm[1] || "";
    const returnType = mm[2].trim();
    const name = mm[3];
    const paramsStr = mm[4];

    const rolesAllowed = rolesStr
      .split(",")
      .map(r => r.trim().replace(/"/g, ""))
      .filter(Boolean);

    const parameters = paramsStr
      .split(",")
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const parts = p.split(/\s+/);
        return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" ") };
      });

    methods.push({ name, returnType, parameters, rolesAllowed });
  }

  return {
    className: file.className,
    packageName: file.packageName,
    methods,
    sourceFile: file.path,
  };
}

// ─── Base Class Parser ──────────────────────────────────────────────────────

function parseBaseClass(file: JavaFile): BaseClassIR {
  const content = file.content;
  let kind: "interface" | "class" | "annotation" = "class";
  if (/@interface/.test(content)) kind = "annotation";
  else if (/\binterface\s+/.test(content)) kind = "interface";
  return {
    className: file.className,
    packageName: file.packageName,
    kind,
    sourceFile: file.path,
  };
}

// ─── Constants Parser ───────────────────────────────────────────────────────

function parseConstants(file: JavaFile): ConstantsIR {
  const content = file.content;
  const fields: { name: string; type: string; value: string }[] = [];

  const constRegex = /(?:public|protected|private)?\s*static\s+final\s+(\w+)\s+(\w+)\s*=\s*([^;]+);/g;
  let cm;
  while ((cm = constRegex.exec(content)) !== null) {
    fields.push({
      type: cm[1],
      name: cm[2],
      value: cm[3].trim().replace(/^"|"$/g, ""),
    });
  }

  return {
    className: file.className,
    packageName: file.packageName,
    fields,
    sourceFile: file.path,
  };
}

// ─── POM.xml Parser ─────────────────────────────────────────────────────────

interface PomInfo {
  groupId: string;
  artifactId: string;
  version: string;
  packaging: string;
  name: string;
  description: string;
  javaVersion: string;
  dependencies: MavenDependency[];
}

function parsePomXml(xml: string): PomInfo {
  const get = (tag: string, src?: string): string => {
    const source = src || xml;
    const m = source.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return m ? m[1].trim() : "";
  };

  // Parse dependencies
  const dependencies: MavenDependency[] = [];
  const depRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
  let dm;
  while ((dm = depRegex.exec(xml)) !== null) {
    dependencies.push({
      groupId: get("groupId", dm[1]),
      artifactId: get("artifactId", dm[1]),
      version: get("version", dm[1]),
      scope: get("scope", dm[1]) || "compile",
    });
  }

  return {
    groupId: get("groupId"),
    artifactId: get("artifactId"),
    version: get("version"),
    packaging: get("packaging") || "jar",
    name: get("name"),
    description: get("description").replace(/\s+/g, " "),
    javaVersion: get("java.version") || get("maven.compiler.source") || "11",
    dependencies,
  };
}

function defaultPomInfo(): PomInfo {
  return {
    groupId: "com.example",
    artifactId: "ejb-project",
    version: "1.0.0",
    packaging: "ejb",
    name: "",
    description: "",
    javaVersion: "11",
    dependencies: [],
  };
}

// ─── BIAN YAML Parser ───────────────────────────────────────────────────────

function parseBianYml(yml: string): BianMapping[] {
  const mappings: BianMapping[] = [];
  const lines = yml.split("\n");
  let currentUC = "";

  for (const line of lines) {
    const ucMatch = line.match(/^(\w+UC)\s*:/);
    if (ucMatch) {
      currentUC = ucMatch[1];
      continue;
    }
    if (currentUC) {
      const sdMatch = line.match(/service[_-]?domain\s*:\s*"?([^"]+)"?/i);
      const codeMatch = line.match(/sd[_-]?code\s*:\s*"?([^"]+)"?/i);
      const actionMatch = line.match(/action\s*:\s*"?([^"]+)"?/i);

      if (sdMatch || codeMatch || actionMatch) {
        const existing = mappings.find(m => m.useCase === currentUC);
        if (existing) {
          if (sdMatch) existing.serviceDomain = sdMatch[1].trim();
          if (codeMatch) existing.sdCode = codeMatch[1].trim();
          if (actionMatch) existing.action = actionMatch[1].trim();
        } else {
          mappings.push({
            useCase: currentUC,
            serviceDomain: sdMatch ? sdMatch[1].trim() : "",
            sdCode: codeMatch ? codeMatch[1].trim() : "",
            action: actionMatch ? actionMatch[1].trim() : "",
          });
        }
      }
    }
  }

  return mappings;
}
