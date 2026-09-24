/**
 * Post-traitement des adaptateurs générés pour les EJB bâtis sur le framework
 * eai-fwk-ejb (bean qui étend UCStrategie, logique portée par des classes
 * annotées @UseCase).
 *
 * UCStrategie ne lit pas le flux historique <Flux><FONCTION>. Il extrait trois
 * éléments par XPath fixes (paths.properties du framework) :
 *   flux/entete/fonction   nom du bean use case (nom simple exact de la classe)
 *   /flux/object/@class    nom complet de la VoIn à désérialiser
 *   /flux/object           contenu désérialisé par JAXB dans cette VoIn
 * Le moteur produit le format historique pour ces EJB : le use case n'est pas
 * trouvé (NoSuchBeanDefinitionException) ou la VoIn est nulle (NPE), sans
 * aucune erreur à la compilation.
 *
 * Ce post-traitement relit les sources de l'EJB et, pour chaque fonction d'un
 * bean UCStrategie :
 *   - retrouve la classe use case et la VoIn réellement castée dans execute() ;
 *   - calcule le mapping JAXB de la VoIn (noms d'éléments, listes, objets
 *     imbriqués, type d'accès) ;
 *   - réécrit le DTO de requête avec la structure réelle de la VoIn ;
 *   - réécrit la méthode toEnvelope du converter au format imposé ;
 *   - aligne la resource : signature (corps JSON quand la VoIn porte des
 *     champs), lecture du code retour dans la VoOut, erreur technique globale
 *     de l'EJB rendue en 500.
 * Les beans historiques (process() maison) ne sont pas touchés.
 */
import fs from "fs/promises";
import path from "path";
import {
  JavaSourceIndex,
  JavaType,
  JavaMethod,
  JavaField,
  JavaAnnotation,
  loadJavaSources,
  findAnnotation,
  annotationValue,
  evaluateStringExpression,
  matchingClose,
} from "./javaSourceModel";

export interface UseCaseFixReport {
  touched: string[];
  functions: UseCaseFunctionReport[];
  warnings: string[];
}

export interface UseCaseFunctionReport {
  bean: string;
  code: string;
  useCase: string;
  voClass: string;
  voSource: "cast" | "fallback";
  signature: "request" | "params" | "none";
}

/** Mapping JAXB d'une propriété de VoIn. */
export interface XmlProperty {
  /** Nom JSON / Java de la propriété dans le DTO de requête. */
  jsonName: string;
  /** Nom de l'élément XML (ou de l'attribut) attendu par JAXB. */
  xmlName: string;
  kind: "element" | "attribute";
  wrapper: string | null;
  isList: boolean;
  /** Type scalaire Java du DTO, ou null si la valeur est un objet. */
  scalar: string | null;
  complex: XmlComplexType | null;
}

export interface XmlComplexType {
  /** Nom de la classe imbriquée du DTO de requête. */
  dtoName: string;
  source: string;
  properties: XmlProperty[];
}

interface ConverterMethod {
  name: string;
  start: number;
  end: number;
  code: string;
  service: string;
  params: { type: string; name: string }[];
  text: string;
}

const JAXB_BINDING_ANNOTATIONS = new Set([
  "XmlElement", "XmlElements", "XmlAttribute", "XmlElementWrapper", "XmlElementRef",
  "XmlElementRefs", "XmlValue", "XmlAnyElement", "XmlList", "XmlMixed",
  "XmlJavaTypeAdapter", "XmlSchemaType", "XmlID", "XmlIDREF", "XmlInlineBinaryData",
  "XmlMimeType", "XmlAttachmentRef",
]);

const LIST_TYPES = new Set([
  "List", "ArrayList", "LinkedList", "Set", "HashSet", "LinkedHashSet", "TreeSet",
  "SortedSet", "Collection", "Vector",
]);

/** Types scalaires connus : type source -> type du DTO de requête. */
const SCALAR_TYPES: Record<string, string> = {
  String: "String", char: "String", Character: "String",
  int: "Integer", Integer: "Integer", short: "Integer", Short: "Integer", byte: "Integer", Byte: "Integer",
  long: "Long", Long: "Long",
  double: "Double", Double: "Double", float: "Double", Float: "Double",
  boolean: "Boolean", Boolean: "Boolean",
  BigDecimal: "BigDecimal", BigInteger: "BigInteger",
  Date: "String", Calendar: "String", GregorianCalendar: "String", XMLGregorianCalendar: "String",
  Timestamp: "String", LocalDate: "String", LocalDateTime: "String", OffsetDateTime: "String",
  ZonedDateTime: "String", Duration: "String", UUID: "String", Object: "String",
};

const MAX_DEPTH = 8;

/**
 * Applique le correctif au projet généré. `inputPath` est le projet EJB source ;
 * les modules clonés dans `outputDir` sont également lus.
 */
export async function fixUseCaseEnvelopes(outputDir: string, inputPath: string): Promise<UseCaseFixReport> {
  const report: UseCaseFixReport = { touched: [], functions: [], warnings: [] };
  const index = await loadJavaSources([inputPath, ...(await sourceModuleDirs(outputDir))]);

  const beans = index.types.filter((t) => t.kind === "class" && index.inherits(t, "UCStrategie"));
  if (beans.length === 0) return report;

  const beanNames = new Map<string, JavaType>();
  for (const bean of beans) {
    beanNames.set(bean.name, bean);
    const stateless = findAnnotation(bean.annotations, "Stateless");
    for (const key of ["name", "mappedName"]) {
      const v = annotationValue(stateless, key);
      if (v) beanNames.set(v, bean);
    }
  }

  const useCases = index.types.filter(
    (t) => t.kind === "class" && !!findAnnotation(t.annotations, "UseCase")
  );

  const webFiles = await collectWebJavaFiles(outputDir);
  const converters = webFiles.filter((f) => f.endsWith("Converter.java") && f.includes(`${path.sep}converter${path.sep}`));

  for (const converterFile of converters) {
    let converter = await fs.readFile(converterFile, "utf-8");
    const methods = listConverterMethods(converter).filter((m) => beanNames.has(m.service));
    if (methods.length === 0) continue;

    const bean = beanNames.get(methods[0].service)!;
    const technicalError = resolveGlobalError(bean, index, report);
    const resourceFile = await findResourceFor(converterFile, webFiles);
    let resource = resourceFile ? await fs.readFile(resourceFile, "utf-8") : null;
    const basePackage = packageOf(converter).replace(/\.converter$/, "");
    const dtoPackage =
      [...converter.matchAll(/import\s+([\w.]+)\.\*;/g)]
        .map((m) => m[1])
        .find((p) => p === `${basePackage}.dto` || p.startsWith(`${basePackage}.dto.`)) ?? `${basePackage}.dto`;
    const javaRoot = path.resolve(path.dirname(converterFile), ...basePackage.split(".").map(() => ".."), "..");
    const dtoDir = path.join(javaRoot, ...dtoPackage.split("."));
    const writers = new WriterRegistry();

    // Remplacement en partant de la fin pour garder des positions valides.
    for (const method of [...methods].sort((a, b) => b.start - a.start)) {
      const useCase = findUseCase(method.code, useCases);
      if (!useCase) {
        report.warnings.push(`${method.service}/${method.code} : classe @UseCase introuvable, méthode laissée en l'état.`);
        continue;
      }
      const vo = resolveVoIn(useCase, index, report);
      if (!vo) {
        report.warnings.push(`${method.service}/${method.code} : aucune VoIn utilisable, méthode laissée en l'état.`);
        continue;
      }

      const hasRequest = method.params.length === 1 && /Request$/.test(method.params[0].type);
      const requestName = hasRequest ? method.params[0].type.split(".").pop()! : `${method.name.replace(/^toEnvelope/, "")}Request`;
      const properties = jaxbProperties(vo.type, index, requestName, new Set());
      let signature: UseCaseFunctionReport["signature"];
      let newMethod: string;

      if (hasRequest) {
        signature = "request";
      } else if (method.params.length > 0 && paramsCoverVoIn(method.params, properties)) {
        signature = "params";
      } else if (properties.length === 0) {
        signature = "none";
      } else {
        signature = "request";
      }

      if (signature === "request") {
        await fs.mkdir(dtoDir, { recursive: true });
        const dtoFile = path.join(dtoDir, `${requestName}.java`);
        await fs.writeFile(dtoFile, renderRequestDto(dtoPackage, requestName, useCase.name, properties), "utf-8");
        report.touched.push(dtoFile);
        newMethod = renderRequestMethod(method, useCase.name, vo.type.fqcn, requestName, properties, writers);
        if (resource && !hasRequest) {
          resource = switchResourceToRequestBody(resource, method.name, requestName);
        }
      } else if (signature === "params") {
        newMethod = renderParamsMethod(method, useCase.name, vo.type.fqcn, properties);
      } else {
        newMethod = renderParamsMethod(method, useCase.name, vo.type.fqcn, []);
      }

      converter = converter.slice(0, method.start) + newMethod + converter.slice(method.end);
      if (resource) resource = alignResourceReturnCode(resource, method.name);

      report.functions.push({
        bean: method.service,
        code: method.code,
        useCase: useCase.name,
        voClass: vo.type.fqcn,
        voSource: vo.source,
        signature,
      });
    }

    converter = addConverterHelpers(converter, writers, technicalError);
    await fs.writeFile(converterFile, converter, "utf-8");
    report.touched.push(converterFile);

    if (resource && resourceFile) {
      resource = ensureResourceImports(resource);
      await fs.writeFile(resourceFile, resource, "utf-8");
      report.touched.push(resourceFile);
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Use case, VoIn et erreur technique globale
// ---------------------------------------------------------------------------

/**
 * Le moteur nomme la fonction d'après la classe, sans le suffixe UC. Le nom du
 * bean attendu par le framework est le nom simple exact de la classe.
 */
export function findUseCase(code: string, useCases: JavaType[]): JavaType | null {
  const exact = useCases.find((u) => u.name === code || u.name === `${code}UC`);
  if (exact) return exact;
  const lower = code.toLowerCase();
  const loose = useCases.filter(
    (u) => u.name.toLowerCase() === lower || u.name.toLowerCase() === `${lower}uc`
  );
  return loose.length === 1 ? loose[0] : null;
}

/**
 * VoIn = type casté depuis le paramètre de execute(ValueObject). Sans cast, la
 * VoIn n'est pas lue par le use case : on retient une classe déclarée
 * @XmlRootElement(name = "object") qui implémente ValueObject, pour que la
 * désérialisation du framework réussisse.
 */
function resolveVoIn(
  useCase: JavaType,
  index: JavaSourceIndex,
  report: UseCaseFixReport
): { type: JavaType; source: "cast" | "fallback" } | null {
  const execute = useCase.methods.find(
    (m) => m.name === "execute" && m.params.length === 1 && /ValueObject$/.test(m.params[0].type)
  );
  if (execute) {
    const p = execute.params[0].name;
    const cast = execute.body.match(new RegExp(`\\(\\s*([\\w.]+)\\s*\\)\\s*${p}\\b`));
    if (cast) {
      const t = index.resolve(cast[1], useCase);
      if (t) return { type: t, source: "cast" };
      report.warnings.push(`${useCase.name} : VoIn ${cast[1]} introuvable dans les sources.`);
    }
  }

  const base = useCase.name.replace(/UC$/, "");
  const isObjectRoot = (t: JavaType) =>
    t.kind === "class" &&
    annotationValue(findAnnotation(t.annotations, "XmlRootElement"), "name") === "object" &&
    index.inherits(t, "ValueObject");

  const byName = [`${base}VoIn`, `${base}In`, `${base}VO`, `${base}Vo`]
    .map((n) => index.types.find((t) => t.name === n && isObjectRoot(t)))
    .find((t) => !!t);
  if (byName) return { type: byName, source: "fallback" };

  if (execute) {
    for (const m of execute.body.matchAll(/new\s+([\w.]+)\s*\(\s*\)/g)) {
      const t = index.resolve(m[1], useCase);
      if (t && isObjectRoot(t)) return { type: t, source: "fallback" };
    }
  }

  const any = index.types
    .filter(isObjectRoot)
    .sort((a, b) => fieldCount(a) - fieldCount(b) || a.fqcn.localeCompare(b.fqcn))[0];
  return any ? { type: any, source: "fallback" } : null;
}

function fieldCount(t: JavaType): number {
  return t.fields.filter((f) => !f.modifiers.includes("static")).length;
}

/**
 * Corps renvoyé par l'EJB quand une exception remonte jusqu'au bean
 * (CommonFunction.constructEnvWhenGlobalError) : code et message sont extraits
 * de la constante bodyError utilisée.
 */
function resolveGlobalError(
  bean: JavaType,
  index: JavaSourceIndex,
  report: UseCaseFixReport
): { code: string; message: string } | null {
  const holders = index.types.filter((t) => t.fields.some((f) => f.name === "bodyError" && f.initializer));
  const top = (t: JavaType) => {
    let x = t;
    while (x.outer) x = x.outer;
    return x;
  };
  const beanPkg = top(bean).pkg;
  holders.sort((a, b) => {
    const ia = top(bean).imports.includes(a.fqcn) ? 0 : 1;
    const ib = top(bean).imports.includes(b.fqcn) ? 0 : 1;
    if (ia !== ib) return ia - ib;
    return commonPrefix(b.pkg, beanPkg) - commonPrefix(a.pkg, beanPkg);
  });
  for (const h of holders) {
    const field = h.fields.find((f) => f.name === "bodyError")!;
    const value = evaluateStringExpression(field.initializer!, h, index);
    if (value === null) continue;
    const code = value.match(/<codeRetour>([\s\S]*?)<\/codeRetour>/);
    const message = value.match(/<messageRetour>([\s\S]*?)<\/messageRetour>/);
    if (code) return { code: code[1].trim(), message: message ? message[1].trim() : "" };
  }
  report.warnings.push(`${bean.name} : corps d'erreur globale non résolu, l'erreur technique ne sera pas distinguée.`);
  return null;
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// ---------------------------------------------------------------------------
// Mapping JAXB
// ---------------------------------------------------------------------------

interface Candidate {
  name: string;
  type: string;
  annotations: JavaAnnotation[];
}

/**
 * Propriétés liées par JAXB, dans l'ordre de déclaration : superclasses d'abord,
 * puis selon le type d'accès (@XmlAccessorType, PUBLIC_MEMBER par défaut).
 */
export function jaxbProperties(
  type: JavaType,
  index: JavaSourceIndex,
  dtoName: string,
  stack: Set<string>,
  registry: Map<string, XmlComplexType> = new Map(),
  depth = 0
): XmlProperty[] {
  const props: XmlProperty[] = [];
  if (depth > MAX_DEPTH) return props;

  if (type.superclass) {
    const sup = index.resolve(type.superclass, type);
    if (sup) props.push(...jaxbProperties(sup, index, dtoName, stack, registry, depth));
  }

  const used = new Set(props.map((p) => p.jsonName));
  for (const c of bindingCandidates(type)) {
    const prop = toXmlProperty(c, type, index, dtoName, stack, registry, depth);
    if (!prop || used.has(prop.jsonName)) continue;
    used.add(prop.jsonName);
    props.push(prop);
  }
  return props;
}

function bindingCandidates(type: JavaType): Candidate[] {
  const access = accessType(type);
  const isBinding = (anns: JavaAnnotation[]) => anns.some((a) => JAXB_BINDING_ANNOTATIONS.has(a.name));
  const isTransient = (anns: JavaAnnotation[]) => anns.some((a) => a.name === "XmlTransient");
  const instanceFields = type.fields.filter((f) => !f.modifiers.includes("static"));

  const getters = new Map<string, JavaMethod>();
  const setters = new Map<string, JavaMethod>();
  for (const m of type.methods) {
    if (m.modifiers.includes("static")) continue;
    const g = m.name.match(/^(get|is)([A-Z_]\w*)$/);
    if (g && m.params.length === 0 && m.returnType && m.returnType !== "void") {
      if (g[1] === "is" && !/^boolean$|^Boolean$/.test(m.returnType)) continue;
      getters.set(decapitalize(g[2]), m);
      continue;
    }
    const s = m.name.match(/^set([A-Z_]\w*)$/);
    if (s && m.params.length === 1) setters.set(decapitalize(s[1]), m);
  }

  const result: Candidate[] = [];
  const seen = new Set<string>();
  const push = (c: Candidate) => {
    if (seen.has(c.name) || isTransient(c.annotations)) return;
    seen.add(c.name);
    result.push(c);
  };
  const fieldCandidate = (f: JavaField): Candidate => ({ name: f.name, type: f.type, annotations: f.annotations });
  const propertyCandidate = (name: string): Candidate | null => {
    const g = getters.get(name);
    const s = setters.get(name);
    const t = g?.returnType ?? s?.params[0].type;
    if (!t) return null;
    return { name, type: t, annotations: [...(g?.annotations ?? []), ...(s?.annotations ?? [])] };
  };
  const propertyNames = () => {
    const names: string[] = [];
    for (const f of instanceFields) {
      const n = decapitalize(capitalize(f.name));
      if (getters.has(n) || setters.has(n)) names.push(n);
    }
    for (const n of [...getters.keys(), ...setters.keys()]) if (!names.includes(n)) names.push(n);
    return names;
  };

  if (access === "FIELD") {
    for (const f of instanceFields) {
      if (f.modifiers.includes("transient")) continue;
      push(fieldCandidate(f));
    }
    for (const n of propertyNames()) {
      const c = propertyCandidate(n);
      if (c && isBinding(c.annotations)) push(c);
    }
    return result;
  }

  const publicMember = access === "PUBLIC_MEMBER";
  for (const f of instanceFields) {
    if (f.modifiers.includes("transient")) continue;
    if (isBinding(f.annotations) || (publicMember && f.modifiers.includes("public"))) push(fieldCandidate(f));
  }
  for (const n of propertyNames()) {
    const g = getters.get(n);
    const s = setters.get(n);
    const c = propertyCandidate(n);
    if (!c) continue;
    const pair = !!g && !!s && (access !== "PUBLIC_MEMBER" || (g.modifiers.includes("public") && s.modifiers.includes("public")));
    if (isBinding(c.annotations) || (access !== "NONE" && pair)) push(c);
  }
  return result;
}

function accessType(type: JavaType): "FIELD" | "PROPERTY" | "PUBLIC_MEMBER" | "NONE" {
  const ann = findAnnotation(type.annotations, "XmlAccessorType");
  const v = ann ? annotationValue(ann, "value") ?? ann.args : "";
  if (/FIELD/.test(v)) return "FIELD";
  if (/NONE/.test(v)) return "NONE";
  if (/PUBLIC_MEMBER/.test(v)) return "PUBLIC_MEMBER";
  if (/PROPERTY/.test(v)) return "PROPERTY";
  return "PUBLIC_MEMBER";
}

function toXmlProperty(
  c: Candidate,
  owner: JavaType,
  index: JavaSourceIndex,
  dtoName: string,
  stack: Set<string>,
  registry: Map<string, XmlComplexType>,
  depth: number
): XmlProperty | null {
  const element = findAnnotation(c.annotations, "XmlElement");
  const attribute = findAnnotation(c.annotations, "XmlAttribute");
  const wrapperAnn = findAnnotation(c.annotations, "XmlElementWrapper");
  if (findAnnotation(c.annotations, "XmlValue") || findAnnotation(c.annotations, "XmlAnyElement")) return null;

  const named = (ann: JavaAnnotation | undefined) => {
    const v = annotationValue(ann, "name");
    return v && v !== "##default" ? v : null;
  };
  const xmlName = named(element) ?? named(attribute) ?? c.name;
  const wrapper = wrapperAnn ? named(wrapperAnn) ?? c.name : null;

  let t = c.type.trim();
  let isList = false;
  const generic = t.match(/^([\w.]+)<(.+)>$/);
  if (generic && LIST_TYPES.has(generic[1].split(".").pop()!)) {
    isList = true;
    t = generic[2].replace(/^\?\s*extends\s+/, "").trim();
  } else if (t.endsWith("[]") && t !== "byte[]") {
    isList = true;
    t = t.slice(0, -2);
  }

  const base: XmlProperty = {
    jsonName: jsonName(c.name),
    xmlName,
    kind: attribute ? "attribute" : "element",
    wrapper,
    isList,
    scalar: null,
    complex: null,
  };

  const simple = t.replace(/<.*>$/, "").split(".").pop()!;
  if (t === "byte[]" || simple in SCALAR_TYPES) {
    base.scalar = t === "byte[]" ? "String" : SCALAR_TYPES[simple];
    return base;
  }
  const resolved = index.resolve(t, owner);
  if (!resolved || resolved.kind === "enum" || resolved.kind !== "class") {
    base.scalar = "String";
    return base;
  }
  if (base.kind === "attribute") {
    base.scalar = "String";
    return base;
  }
  if (stack.has(resolved.fqcn)) {
    base.scalar = "String";
    return base;
  }

  let complex = registry.get(resolved.fqcn);
  if (!complex) {
    complex = { dtoName: uniqueNestedName(resolved.name, dtoName, registry), source: resolved.fqcn, properties: [] };
    registry.set(resolved.fqcn, complex);
    stack.add(resolved.fqcn);
    complex.properties = jaxbProperties(resolved, index, dtoName, stack, registry, depth + 1);
    stack.delete(resolved.fqcn);
  }
  base.complex = complex;
  return base;
}

function uniqueNestedName(name: string, outer: string, registry: Map<string, XmlComplexType>): string {
  const taken = new Set([outer, ...[...registry.values()].map((c) => c.dtoName)]);
  let candidate = name;
  let i = 2;
  while (taken.has(candidate)) candidate = `${name}${i++}`;
  return candidate;
}

function decapitalize(s: string): string {
  if (!s) return s;
  if (s.length > 1 && s[0] === s[0].toUpperCase() && s[1] === s[1].toUpperCase() && /[A-Z]/.test(s[1])) return s;
  return s[0].toLowerCase() + s.slice(1);
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Nom JSON stable : celui que Jackson déduit du getter généré (casse initiale
 * abaissée jusqu'à la première minuscule), pour que DTO, JSON et descripteur
 * portent le même nom.
 */
export function jsonName(name: string): string {
  const cap = capitalize(name.replace(/^_+/, "")) || name;
  let i = 0;
  while (i < cap.length && cap[i] >= "A" && cap[i] <= "Z") i++;
  if (i === 0) return cap;
  if (i === cap.length) return cap.toLowerCase();
  const lead = i > 1 && /[a-z]/.test(cap[i]) ? i - 1 : i;
  return cap.slice(0, lead).toLowerCase() + cap.slice(lead);
}

function paramsCoverVoIn(params: { name: string }[], properties: XmlProperty[]): boolean {
  if (params.length !== properties.length) return false;
  return properties.every(
    (p) => p.scalar === "String" && !p.isList && p.kind === "element" &&
      params.some((x) => x.name.toLowerCase() === p.jsonName.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// Converter
// ---------------------------------------------------------------------------

function listConverterMethods(content: string): ConverterMethod[] {
  const methods: ConverterMethod[] = [];
  const re = /public\s+Envelope\s+(toEnvelope\w+)\s*\(([^)]*)\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchingClose(content, open);
    const body = content.slice(open, close + 1);
    const service = body.match(/setService\("([^"]+)"\)/);
    const code = body.match(/setMethod\("([^"]+)"\)/);
    if (!service || !code) continue;
    const before = content.slice(0, m.index);
    let start = before.lastIndexOf("\n") + 1;
    const docOpen = before.lastIndexOf("/**");
    const docClose = before.lastIndexOf("*/");
    if (docOpen >= 0 && docClose > docOpen && /^\s*$/.test(before.slice(docClose + 2))) {
      start = before.lastIndexOf("\n", docOpen) + 1;
    }
    const params = m[2]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const pm = p.match(/^(?:final\s+)?([\w.<>]+)\s+(\w+)$/);
        return pm ? { type: pm[1], name: pm[2] } : { type: p, name: p };
      });
    methods.push({
      name: m[1],
      start,
      end: close + 1,
      code: code[1],
      service: service[1],
      params,
      text: content.slice(start, close + 1),
    });
  }
  return methods;
}

class WriterRegistry {
  private readonly writers = new Map<string, { method: string; dtoType: string; complex: XmlComplexType }>();

  nameFor(complex: XmlComplexType, dtoType: string): string {
    const key = `${dtoType}`;
    const existing = this.writers.get(key);
    if (existing) return existing.method;
    const taken = new Set([...this.writers.values()].map((w) => w.method));
    const base = `append${dtoType.replace(/\./g, "")}`;
    let method = base;
    let i = 2;
    while (taken.has(method)) method = `${base}${i++}`;
    this.writers.set(key, { method, dtoType, complex });
    return method;
  }

  all(): { method: string; dtoType: string; complex: XmlComplexType }[] {
    return [...this.writers.values()];
  }
}

function header(indent: string, useCase: string): string {
  return `${indent}/**\n${indent} * Construit l'Envelope du use case ${useCase}.\n${indent} */\n`;
}

function openingLines(method: ConverterMethod, useCase: string): string[] {
  return [
    `        Envelope envelope = new Envelope();`,
    `        envelope.setService("${method.service}");`,
    `        envelope.setMethod("${method.code}");`,
    `        StringBuilder xml = new StringBuilder("<flux>");`,
    `        xml.append("<entete><fonction>${useCase}</fonction></entete>");`,
  ];
}

function closingLines(): string[] {
  return [
    `        xml.append("</object>");`,
    `        xml.append("</flux>");`,
    `        envelope.setBody(xml.toString());`,
    `        return envelope;`,
    `    }`,
  ];
}

function renderRequestMethod(
  method: ConverterMethod,
  useCase: string,
  voClass: string,
  requestName: string,
  properties: XmlProperty[],
  writers: WriterRegistry
): string {
  const attributes = properties.filter((p) => p.kind === "attribute");
  const elements = properties.filter((p) => p.kind === "element");
  const get = (p: XmlProperty) => `request.get${capitalize(p.jsonName)}()`;
  const lines = [
    `    public Envelope ${method.name}(${requestName} request) {`,
    ...openingLines(method, useCase),
  ];
  if (attributes.length > 0) {
    lines.push(`        xml.append("<object class=\\"${voClass}\\"");`);
    lines.push(`        if (request != null) {`);
    for (const a of attributes) lines.push(`            appendAttribute(xml, "${a.xmlName}", ${get(a)});`);
    lines.push(`        }`);
    lines.push(`        xml.append('>');`);
  } else {
    lines.push(`        xml.append("<object class=\\"${voClass}\\">");`);
  }
  if (elements.length > 0) {
    lines.push(`        if (request != null) {`);
    for (const p of elements) lines.push(...propertyLines(p, get(p), requestName, writers, "            "));
    lines.push(`        }`);
  }
  lines.push(...closingLines());
  return header("    ", useCase) + lines.join("\n");
}

function renderParamsMethod(method: ConverterMethod, useCase: string, voClass: string, properties: XmlProperty[]): string {
  const signature = method.params.map((p) => `${p.type} ${p.name}`).join(", ");
  const lines = [`    public Envelope ${method.name}(${signature}) {`, ...openingLines(method, useCase)];
  lines.push(`        xml.append("<object class=\\"${voClass}\\">");`);
  for (const p of properties) {
    const param = method.params.find((x) => x.name.toLowerCase() === p.jsonName.toLowerCase())!;
    lines.push(`        appendValue(xml, "${p.xmlName}", ${param.name});`);
  }
  lines.push(...closingLines());
  return header("    ", useCase) + lines.join("\n");
}

function propertyLines(p: XmlProperty, value: string, requestName: string, writers: WriterRegistry, indent: string): string[] {
  const lines: string[] = [];
  const inner = p.wrapper ? `${indent}    ` : indent;
  const body: string[] = [];
  if (p.scalar !== null) {
    body.push(p.isList ? `${inner}appendValues(xml, "${p.xmlName}", ${value});` : `${inner}appendValue(xml, "${p.xmlName}", ${value});`);
  } else if (p.complex) {
    const dtoType = `${requestName}.${p.complex.dtoName}`;
    const writer = writers.nameFor(p.complex, dtoType);
    if (p.isList) {
      body.push(`${inner}for (${dtoType} item : ${value}) {`);
      body.push(`${inner}    ${writer}(xml, "${p.xmlName}", item);`);
      body.push(`${inner}}`);
    } else {
      body.push(`${inner}${writer}(xml, "${p.xmlName}", ${value});`);
    }
  }
  const needsGuard = p.wrapper !== null || (p.complex !== null && p.isList);
  if (!needsGuard) return body;
  lines.push(`${indent}if (${value} != null) {`);
  if (p.wrapper) lines.push(`${indent}    xml.append("<${p.wrapper}>");`);
  lines.push(...body.map((l) => (p.wrapper ? l : `    ${l}`)));
  if (p.wrapper) lines.push(`${indent}    xml.append("</${p.wrapper}>");`);
  lines.push(`${indent}}`);
  return lines;
}

function renderWriter(method: string, dtoType: string, complex: XmlComplexType, requestName: string, writers: WriterRegistry): string {
  const attributes = complex.properties.filter((p) => p.kind === "attribute");
  const elements = complex.properties.filter((p) => p.kind === "element");
  const get = (p: XmlProperty) => `value.get${capitalize(p.jsonName)}()`;
  const lines = [
    `    private static void ${method}(StringBuilder xml, String tag, ${dtoType} value) {`,
    `        if (value == null) {`,
    `            return;`,
    `        }`,
  ];
  if (attributes.length > 0) {
    lines.push(`        xml.append('<').append(tag);`);
    for (const a of attributes) lines.push(`        appendAttribute(xml, "${a.xmlName}", ${get(a)});`);
    lines.push(`        xml.append('>');`);
  } else {
    lines.push(`        xml.append('<').append(tag).append('>');`);
  }
  for (const p of elements) lines.push(...propertyLines(p, get(p), requestName, writers, "        "));
  lines.push(`        xml.append("</").append(tag).append('>');`);
  lines.push(`    }`);
  return lines.join("\n");
}

const VALUE_HELPERS = `    private static void appendValue(StringBuilder xml, String tag, Object value) {
        if (value == null) {
            return;
        }
        xml.append('<').append(tag).append('>').append(InputSanitizer.sanitize(xmlText(value))).append("</").append(tag).append('>');
    }

    private static void appendValues(StringBuilder xml, String tag, java.util.Collection<?> values) {
        if (values == null) {
            return;
        }
        for (Object value : values) {
            appendValue(xml, tag, value);
        }
    }

    private static void appendAttribute(StringBuilder xml, String name, Object value) {
        if (value == null) {
            return;
        }
        xml.append(' ').append(name).append("=\\"").append(InputSanitizer.sanitize(xmlText(value))).append('"');
    }

    private static String xmlText(Object value) {
        if (value instanceof java.math.BigDecimal) {
            return ((java.math.BigDecimal) value).toPlainString();
        }
        return String.valueOf(value);
    }`;

function addConverterHelpers(
  content: string,
  writers: WriterRegistry,
  technicalError: { code: string; message: string } | null
): string {
  const blocks: string[] = [];

  const technical = technicalError
    ? `    /**
     * Indique si la réponse est le corps d'erreur globale renvoyé par l'EJB sur exception.
     */
    public boolean isTechnicalError(String code, String message) {
        return ${javaString(technicalError.code)}.equals(code == null ? null : code.trim())
                && ${javaString(asciiKey(technicalError.message))}.equals(asciiKey(message));
    }

    private static String asciiKey(String text) {
        return text == null ? "" : text.replaceAll("[^A-Za-z0-9]", "");
    }`
    : `    /**
     * Indique si la réponse est le corps d'erreur globale renvoyé par l'EJB sur exception.
     */
    public boolean isTechnicalError(String code, String message) {
        return false;
    }`;
  if (!content.includes("public boolean isTechnicalError(")) blocks.push(technical);

  // Les writers peuvent en référencer d'autres : on rend jusqu'à stabilité.
  const rendered = new Set<string>();
  let pending = writers.all().filter((w) => !rendered.has(w.method));
  while (pending.length > 0) {
    for (const w of pending) {
      const requestName = w.dtoType.split(".")[0];
      blocks.push(renderWriter(w.method, w.dtoType, w.complex, requestName, writers));
      rendered.add(w.method);
    }
    pending = writers.all().filter((w) => !rendered.has(w.method));
  }

  if (!content.includes("private static void appendValue(")) blocks.push(VALUE_HELPERS);

  const last = content.lastIndexOf("}");
  const head = content.slice(0, last).replace(/\s*$/, "\n");
  let out = `${head}\n${blocks.join("\n\n")}\n}\n`;
  if (!/import\s+[\w.]+\.config\.InputSanitizer;/.test(out)) {
    const pkg = packageOf(out).replace(/\.converter$/, "");
    out = out.replace(/(package\s+[\w.]+;\s*\n)/, `$1\nimport ${pkg}.config.InputSanitizer;\n`);
  }
  return out;
}

function asciiKey(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "");
}

function javaString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
}

// ---------------------------------------------------------------------------
// DTO de requête
// ---------------------------------------------------------------------------

function javaType(p: XmlProperty): string {
  const item = p.complex ? p.complex.dtoName : p.scalar === "BigDecimal" ? "BigDecimal" : p.scalar === "BigInteger" ? "BigInteger" : p.scalar!;
  return p.isList ? `List<${item}>` : item;
}

function renderRequestDto(pkg: string, name: string, useCase: string, properties: XmlProperty[]): string {
  const nested = collectNested(properties);
  const all = [properties, ...nested.map((n) => n.properties)].flat();
  const imports = ["java.io.Serializable"];
  if (all.some((p) => p.scalar === "BigDecimal")) imports.push("java.math.BigDecimal");
  if (all.some((p) => p.scalar === "BigInteger")) imports.push("java.math.BigInteger");
  if (all.some((p) => p.isList)) imports.push("java.util.List");
  imports.sort();

  const lines = [
    `package ${pkg};`,
    ``,
    ...imports.map((i) => `import ${i};`),
    ``,
    `/**`,
    ` * Requête du use case ${useCase}.`,
    ` */`,
    `public class ${name} implements Serializable {`,
    ``,
    `    private static final long serialVersionUID = 1L;`,
    ...classMembers(properties, "    "),
  ];
  for (const n of nested) {
    lines.push(``);
    lines.push(`    /**`);
    lines.push(`     * Structure ${n.dtoName}.`);
    lines.push(`     */`);
    lines.push(`    public static class ${n.dtoName} implements Serializable {`);
    lines.push(``);
    lines.push(`        private static final long serialVersionUID = 1L;`);
    lines.push(...classMembers(n.properties, "        "));
    lines.push(`    }`);
  }
  lines.push(`}`);
  return lines.join("\n") + "\n";
}

function collectNested(properties: XmlProperty[]): XmlComplexType[] {
  const out: XmlComplexType[] = [];
  const seen = new Set<string>();
  const walk = (props: XmlProperty[]) => {
    for (const p of props) {
      if (!p.complex || seen.has(p.complex.dtoName)) continue;
      seen.add(p.complex.dtoName);
      out.push(p.complex);
      walk(p.complex.properties);
    }
  };
  walk(properties);
  return out;
}

function classMembers(properties: XmlProperty[], indent: string): string[] {
  const lines: string[] = [];
  if (properties.length > 0) lines.push(``);
  for (const p of properties) lines.push(`${indent}private ${javaType(p)} ${p.jsonName};`);
  for (const p of properties) {
    const t = javaType(p);
    const cap = capitalize(p.jsonName);
    lines.push(``);
    lines.push(`${indent}public ${t} get${cap}() {`);
    lines.push(`${indent}    return ${p.jsonName};`);
    lines.push(`${indent}}`);
    lines.push(``);
    lines.push(`${indent}public void set${cap}(${t} ${p.jsonName}) {`);
    lines.push(`${indent}    this.${p.jsonName} = ${p.jsonName};`);
    lines.push(`${indent}}`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

/** Bloc de la méthode de resource qui appelle `converter.<converterMethod>(`. */
function resourceMethodBounds(content: string, converterMethod: string): { start: number; end: number } | null {
  const call = content.indexOf(`converter.${converterMethod}(`);
  if (call < 0) return null;
  const sigRe = /public\s+Response\s+\w+\s*\(/g;
  let sig: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((sig = sigRe.exec(content)) !== null && sig.index < call) last = sig;
  if (!last) return null;
  const open = content.indexOf("{", matchingClose(content, last.index + last[0].length - 1));
  const close = matchingClose(content, open);
  const before = content.slice(0, last.index);
  const lines = before.split("\n");
  let startLine = lines.length - 1;
  while (startLine > 0 && /^\s*(@[\w.]+(\(.*\))?\s*)*$/.test(lines[startLine - 1]) && lines[startLine - 1].trim() !== "") startLine--;
  let start = lines.slice(0, startLine).join("\n").length + (startLine > 0 ? 1 : 0);
  const head = content.slice(0, start);
  const docOpen = head.lastIndexOf("/**");
  const docClose = head.lastIndexOf("*/");
  if (docOpen >= 0 && docClose > docOpen && /^\s*$/.test(head.slice(docClose + 2))) {
    start = head.lastIndexOf("\n", docOpen) + 1;
  }
  return { start, end: close + 1 };
}

function switchResourceToRequestBody(content: string, converterMethod: string, requestName: string): string {
  const bounds = resourceMethodBounds(content, converterMethod);
  if (!bounds) return content;
  let block = content.slice(bounds.start, bounds.end);
  block = block.replace(/@GET\b/, "@POST");
  const sig = block.match(/public\s+Response\s+\w+\s*\(/);
  if (sig && sig.index !== undefined) {
    const open = sig.index + sig[0].length - 1;
    const close = matchingClose(block, open);
    block = `${block.slice(0, open + 1)}@Valid @NotNull ${requestName} request${block.slice(close)}`;
  }
  block = block.replace(new RegExp(`converter\\.${converterMethod}\\([^;]*\\);`), `converter.${converterMethod}(request);`);
  return content.slice(0, bounds.start) + block + content.slice(bounds.end);
}

/**
 * La réponse d'un use case est la VoOut sérialisée sous <object> : le code et
 * le message se lisent dans object/codeRetour et object/messageRetour. Seule
 * l'erreur globale de l'EJB (exception interceptée par le bean) est une erreur
 * HTTP ; les codes métier sont restitués tels quels dans le corps.
 */
function alignResourceReturnCode(content: string, converterMethod: string): string {
  const bounds = resourceMethodBounds(content, converterMethod);
  if (!bounds) return content;
  let block = content.slice(bounds.start, bounds.end);
  block = block.replace(/getNodeAsString\("flux\/code"\)/g, `getNodeAsString("object/codeRetour")`);
  block = block.replace(/getNodeAsString\("flux\/message"\)/g, `getNodeAsString("object/messageRetour")`);
  block = block.replace(
    /if \((?:!?CodeMapper\.is(?:Error|Success)\(code\))\) \{(\s*)return Response\.status\(CodeMapper\.toHttpStatus\(code\)\)/,
    `if (converter.isTechnicalError(code, message)) {$1return Response.status(Response.Status.INTERNAL_SERVER_ERROR)`
  );
  return content.slice(0, bounds.start) + block + content.slice(bounds.end);
}

function ensureResourceImports(content: string): string {
  let out = content;
  const add = (imp: string) => {
    if (out.includes(`import ${imp};`)) return;
    out = out.replace(/(package\s+[\w.]+;\s*\n)/, `$1\nimport ${imp};\n`);
  };
  if (/@Valid\b/.test(out)) add("javax.validation.Valid");
  if (/@NotNull\b/.test(out)) add("javax.validation.constraints.NotNull");
  return out;
}

// ---------------------------------------------------------------------------
// Fichiers
// ---------------------------------------------------------------------------

function packageOf(content: string): string {
  const m = content.match(/^\s*package\s+([\w.]+)\s*;/m);
  return m ? m[1] : "";
}

async function findResourceFor(converterFile: string, webFiles: string[]): Promise<string | null> {
  const base = path.basename(converterFile, ".java").replace(/Converter$/, "");
  const direct = webFiles.find((f) => path.basename(f) === `${base}Resource.java`);
  if (direct) return direct;
  const className = path.basename(converterFile, ".java");
  for (const f of webFiles.filter((x) => x.endsWith("Resource.java"))) {
    const c = await fs.readFile(f, "utf-8");
    if (c.includes(`new ${className}()`)) return f;
  }
  return null;
}

async function collectWebJavaFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["target", "node_modules", ".git"].includes(entry.name)) continue;
      result.push(...(await collectWebJavaFiles(full)));
    } else if (entry.name.endsWith(".java")) {
      result.push(full);
    }
  }
  return result;
}

/** Modules source clonés dans le projet généré (`*-ejb`), relus en complément de l'entrée. */
async function sourceModuleDirs(outputDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && /-ejb$/i.test(e.name)).map((e) => path.join(outputDir, e.name));
  } catch {
    return [];
  }
}
