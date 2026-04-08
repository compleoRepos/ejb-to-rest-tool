/**
 * Java EJB Parser — Server-side AST analysis for EJB/Maven projects.
 * Parses Java source files to extract UseCases, DTOs, Services, Enums,
 * Exceptions, Validators, Remote interfaces, and dependency graph.
 * Produces a typed IR (Intermediate Representation) JSON.
 *
 * Designed for BOA EAI pattern: @UseCase + BaseUseCase.execute(ValueObject)
 * @author Hamza NORDINE
 */

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
  injectedServices: InjectedService[];
  transactional: TransactionalInfo | null;
  exceptionsCaught: string[];
  exceptionsThrown: string[];
  sourceFile: string;
  rawSource: string;
  httpMethod: string;
  restPath: string;
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

  // Parse all Java files
  for (const file of files) {
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

  const useCases = useCaseFiles.map(f => {
    const uc = parseUseCase(f, dtoMap, bianMappings, typeRegistry);
    // Validate
    if (uc.voInType === "ValueObject" || uc.voInType === "Object") {
      warnings.push(`${uc.className}: Could not resolve VoIn type (found: ${uc.voInType})`);
    }
    if (uc.voOutType === "ValueObject" || uc.voOutType === "Object") {
      warnings.push(`${uc.className}: Could not resolve VoOut type (found: ${uc.voOutType})`);
    }
    return uc;
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
    stats,
    warnings,
  };
}

// ─── File Classification ────────────────────────────────────────────────────

function isUseCase(content: string): boolean {
  return /@UseCase/.test(content) && /implements\s+BaseUseCase/.test(content);
}

function isDto(content: string, className: string): boolean {
  if (/implements\s+(ValueObject|Serializable)/.test(content) && /Vo(In|Out)|Dto/.test(className)) return true;
  if (/@Xml(RootElement|AccessorType)/.test(content) && /(private|protected)\s+\w+\s+\w+;/.test(content)) return true;
  return false;
}

function isService(content: string, className: string): boolean {
  if (isUseCase(content) || isEnum(content) || isException(className, content)) return false;
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

  // Extract VoIn type from cast pattern: (XxxVoIn) voIn or (XxxVoIn) in
  let voInType = "ValueObject";
  const castMatch = content.match(/\((\w+VoIn)\)\s*\w+/);
  if (castMatch) {
    voInType = castMatch[1];
  } else {
    // Try import-based resolution
    const importMatch = content.match(/import\s+[\w.]+\.(\w+VoIn)\s*;/);
    if (importMatch) voInType = importMatch[1];
  }

  // Extract VoOut type from constructor: new XxxVoOut()
  let voOutType = "ValueObject";
  const newMatch = content.match(/new\s+(\w+VoOut)\s*\(/);
  if (newMatch) {
    voOutType = newMatch[1];
  } else {
    // Try return type from import
    const importMatch = content.match(/import\s+[\w.]+\.(\w+VoOut)\s*;/);
    if (importMatch) voOutType = importMatch[1];
  }

  // Extract injected services
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

function extractDomain(packageName: string, className: string): string {
  // Try to extract from package: ma.eai.boa.xbanking.carte.usecases -> carte
  const pkgParts = packageName.split(".");
  const ucIdx = pkgParts.indexOf("usecases");
  if (ucIdx > 0) {
    return pkgParts[ucIdx - 1];
  }

  // Infer from class name
  const name = className.replace(/UC$/, "");
  if (/Carte|Activer|Bloquer|Receptionner/.test(name)) return "carte";
  if (/Client|Charger|Maj/.test(name)) return "client";
  if (/Compte|Ouvrir|Cloturer|Consulter/.test(name)) return "compte";
  if (/Credit|Simuler/.test(name)) return "credit";
  if (/Virement/.test(name)) return "virement";
  if (/Document|Generer/.test(name)) return "document";
  if (/Notification|Envoyer/.test(name)) return "notification";

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
  // Match field declarations: private Type name;
  const fieldRegex = /(?:(@\w+(?:\([^)]*\))?)\s+)*(?:private|protected|public)\s+(?:static\s+final\s+\w+\s+serialVersionUID[^;]+;|(\w+(?:<[\w,\s<>]+>)?)\s+(\w+)\s*;)/g;

  // Better approach: line by line
  const lines = content.split("\n");
  let pendingAnnotations: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Collect annotations
    if (trimmed.startsWith("@") && !trimmed.includes("class ") && !trimmed.includes("interface ")) {
      pendingAnnotations.push(trimmed);
      continue;
    }

    // Match field declaration
    const fieldMatch = trimmed.match(/(?:private|protected|public)\s+(?:static\s+final\s+\w+\s+serialVersionUID)|(?:private|protected|public)\s+([\w<>,\s]+?)\s+(\w+)\s*;/);
    if (fieldMatch && fieldMatch[1] && fieldMatch[2]) {
      const rawType = fieldMatch[1].trim();
      const name = fieldMatch[2];

      // Skip serialVersionUID
      if (name === "serialVersionUID") {
        pendingAnnotations = [];
        continue;
      }

      const required = pendingAnnotations.some(a => /required\s*=\s*true/.test(a));
      const xmlElement = pendingAnnotations.some(a => /@XmlElement/.test(a));
      const validationAnnotations = pendingAnnotations
        .filter(a => /@Valid/.test(a) || /@NotNull/.test(a) || /@NotBlank/.test(a) || /@Size/.test(a))
        .map(a => a.replace(/^@/, ""));

      const isEnum = enumNames.has(rawType);
      const isList = /List</.test(rawType) || /\[\]/.test(rawType);
      const resolvedType = resolveJavaType(rawType, isEnum);

      fields.push({
        name,
        type: rawType,
        resolvedType,
        required,
        xmlElement,
        validationAnnotations,
        isEnum,
        isList,
      });

      pendingAnnotations = [];
    } else if (!trimmed.startsWith("@")) {
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
    "Date": "Date",
    "byte[]": "byte[]",
  };
  // Handle generics: List<String> -> List<String>
  const baseType = rawType.replace(/<.*>/, "").trim();
  return typeMap[baseType] || rawType;
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
