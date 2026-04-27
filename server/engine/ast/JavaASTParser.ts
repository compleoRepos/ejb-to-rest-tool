/**
 * JavaASTParser — Parser AST Java basé sur java-parser (Chevrotain, pur JS).
 * Extrait les classes, champs, méthodes, annotations et corps de méthodes
 * depuis du code source Java pour la migration EJB → Spring Boot.
 *
 * @author Compleo
 */
import { parse as javaParse } from "java-parser";

// ─── Interfaces publiques ──────────────────────────────────────────────────

export interface FieldNode {
  name: string;
  type: string;
  annotations: string[];
  isPrivate: boolean;
  isStatic: boolean;
  isFinal: boolean;
  initializer?: string;
}

export interface MethodNode {
  name: string;
  returnType: string;
  params: ParamNode[];
  body: string;
  annotations: string[];
  throwsClause: string[];
  isPrivate: boolean;
  isPublic: boolean;
}

export interface ParamNode {
  name: string;
  type: string;
  annotations: string[];
}

export interface ClassNode {
  className: string;
  packageName: string;
  superClass: string | null;
  interfaces: string[];
  annotations: string[];
  fields: FieldNode[];
  methods: MethodNode[];
  imports: string[];
  sourceCode: string;
}

// ─── Helpers CST ───────────────────────────────────────────────────────────

function getImage(node: any): string {
  if (!node) return "";
  if (node.image) return node.image;
  if (node.children) {
    return collectAllText(node);
  }
  return "";
}

function collectAllText(node: any): string {
  if (!node) return "";
  if (node.image !== undefined) return node.image;
  if (node.children) {
    const parts: string[] = [];
    for (const key of Object.keys(node.children)) {
      const arr = node.children[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          parts.push(collectAllText(child));
        }
      }
    }
    return parts.join("");
  }
  return "";
}

function extractAnnotationText(modifiers: any[]): string[] {
  const annotations: string[] = [];
  if (!modifiers) return annotations;
  for (const mod of modifiers) {
    if (mod.children?.annotation) {
      for (const ann of mod.children.annotation) {
        annotations.push(collectAllText(ann));
      }
    }
  }
  return annotations;
}

function hasModifier(modifiers: any[], keyword: string): boolean {
  if (!modifiers) return false;
  for (const mod of modifiers) {
    if (mod.children?.[keyword]) return true;
  }
  return false;
}

function extractTypeText(typeNode: any): string {
  if (!typeNode) return "void";
  return collectAllText(typeNode).trim();
}

// ─── Parser principal ──────────────────────────────────────────────────────

export class JavaASTParser {
  parse(sourceCode: string): ClassNode {
    try {
      const cst = javaParse(sourceCode);
      return this.extractFromCST(cst, sourceCode);
    } catch {
      // Fallback: extraction regex si le parsing CST échoue
      return this.fallbackRegexParse(sourceCode);
    }
  }

  private extractFromCST(cst: any, sourceCode: string): ClassNode {
    const ocu = cst.children?.ordinaryCompilationUnit?.[0];
    if (!ocu) {
      return this.fallbackRegexParse(sourceCode);
    }

    // Package
    const packageName = this.extractPackageName(ocu);

    // Imports
    const imports = this.extractImports(ocu);

    // Class declaration
    const typeDecl = ocu.children?.typeDeclaration?.[0];
    const classDecl = typeDecl?.children?.classDeclaration?.[0];
    const normalClass = classDecl?.children?.normalClassDeclaration?.[0];

    if (!normalClass) {
      return this.fallbackRegexParse(sourceCode);
    }

    const className = normalClass.children?.typeIdentifier?.[0]?.children?.Identifier?.[0]?.image ?? "Unknown";

    // Superclass
    const superClassNode = normalClass.children?.classExtends?.[0];
    const superClass = superClassNode
      ? extractTypeText(superClassNode.children?.classType?.[0])
      : null;

    // Interfaces
    const interfacesNode = normalClass.children?.classImplements?.[0];
    const interfaces: string[] = [];
    if (interfacesNode?.children?.interfaceTypeList?.[0]?.children?.interfaceType) {
      for (const it of interfacesNode.children.interfaceTypeList[0].children.interfaceType) {
        interfaces.push(extractTypeText(it));
      }
    }

    // Class annotations
    const classModifiers = classDecl?.children?.classModifier;
    const classAnnotations = extractAnnotationText(classModifiers);

    // Body declarations
    const bodyDecls = normalClass.children?.classBody?.[0]?.children?.classBodyDeclaration ?? [];

    const fields: FieldNode[] = [];
    const methods: MethodNode[] = [];

    for (const bodyDecl of bodyDecls) {
      const memberDecl = bodyDecl.children?.classMemberDeclaration?.[0];
      if (!memberDecl) continue;

      if (memberDecl.children?.fieldDeclaration) {
        const fd = memberDecl.children.fieldDeclaration[0];
        const field = this.extractField(fd, sourceCode);
        if (field) fields.push(field);
      }

      if (memberDecl.children?.methodDeclaration) {
        const md = memberDecl.children.methodDeclaration[0];
        const method = this.extractMethod(md, sourceCode);
        if (method) methods.push(method);
      }
    }

    return {
      className,
      packageName,
      superClass,
      interfaces,
      annotations: classAnnotations,
      fields,
      methods,
      imports,
      sourceCode,
    };
  }

  private extractPackageName(ocu: any): string {
    const pkgDecl = ocu.children?.packageDeclaration?.[0];
    if (!pkgDecl) return "";
    // Extract from the Identifier tokens in the package name
    const parts: string[] = [];
    const walk = (node: any) => {
      if (node.image && node.tokenType?.name === "Identifier") {
        parts.push(node.image);
      }
      if (node.children) {
        for (const key of Object.keys(node.children)) {
          for (const child of node.children[key]) {
            walk(child);
          }
        }
      }
    };
    walk(pkgDecl);
    return parts.join(".");
  }

  private extractImports(ocu: any): string[] {
    const imports: string[] = [];
    const importDecls = ocu.children?.importDeclaration ?? [];
    for (const imp of importDecls) {
      // Reconstruct import statement with dots/spaces from tokens
      const tokens = this.collectTokensOrdered(imp);
      const text = tokens.map(t => t.image).join("");
      // Add spaces after 'import' and before ';'
      const formatted = text.replace(/^import/, "import ").replace(/;$/, ";").replace(/\s+/g, " ");
      imports.push(formatted.trim());
    }
    return imports;
  }

  private collectTokensOrdered(node: any): any[] {
    const tokens: any[] = [];
    if (node.image !== undefined && node.startOffset !== undefined) {
      tokens.push(node);
    }
    if (node.children) {
      for (const key of Object.keys(node.children)) {
        const arr = node.children[key];
        if (Array.isArray(arr)) {
          for (const child of arr) {
            tokens.push(...this.collectTokensOrdered(child));
          }
        }
      }
    }
    tokens.sort((a: any, b: any) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
    return tokens;
  }

  private extractField(fd: any, sourceCode: string): FieldNode | null {
    const modifiers = fd.children?.fieldModifier;
    const annotations = extractAnnotationText(modifiers);
    const isPrivate = hasModifier(modifiers, "Private");
    const isStatic = hasModifier(modifiers, "Static");
    const isFinal = hasModifier(modifiers, "Final");

    const type = extractTypeText(fd.children?.unannType?.[0]);

    const varDeclList = fd.children?.variableDeclaratorList?.[0];
    const varDecl = varDeclList?.children?.variableDeclarator?.[0];
    if (!varDecl) return null;

    const varId = varDecl.children?.variableDeclaratorId?.[0];
    const name = varId?.children?.Identifier?.[0]?.image ?? "";

    // Initializer
    let initializer: string | undefined;
    const varInit = varDecl.children?.variableInitializer?.[0];
    if (varInit) {
      initializer = collectAllText(varInit).trim();
    }

    return { name, type, annotations, isPrivate, isStatic, isFinal, initializer };
  }

  private extractMethod(md: any, sourceCode: string): MethodNode | null {
    const modifiers = md.children?.methodModifier;
    const annotations = extractAnnotationText(modifiers);
    const isPrivate = hasModifier(modifiers, "Private");
    const isPublic = hasModifier(modifiers, "Public");

    const header = md.children?.methodHeader?.[0];
    if (!header) return null;

    // Return type
    const resultNode = header.children?.result?.[0];
    const returnType = resultNode?.children?.Void
      ? "void"
      : extractTypeText(resultNode?.children?.unannType?.[0]);

    // Method name
    const declarator = header.children?.methodDeclarator?.[0];
    const name = declarator?.children?.Identifier?.[0]?.image ?? "";

    // Parameters
    const params: ParamNode[] = [];
    const formalParamList = declarator?.children?.formalParameterList?.[0];
    if (formalParamList) {
      const formalParams = formalParamList.children?.formalParameter ?? [];
      for (const fp of formalParams) {
        // java-parser wraps params in variableParaRegularParameter
        const vrp = fp.children?.variableParaRegularParameter?.[0];
        const paramSource = vrp ?? fp;
        const paramModifiers = paramSource.children?.variableModifier;
        const paramAnnotations = extractAnnotationText(paramModifiers);
        const paramType = extractTypeText(paramSource.children?.unannType?.[0]);
        const paramId = paramSource.children?.variableDeclaratorId?.[0];
        const paramName = paramId?.children?.Identifier?.[0]?.image ?? "";
        params.push({ name: paramName, type: paramType, annotations: paramAnnotations });
      }
    }

    // Throws clause
    const throwsClause: string[] = [];
    const throwsNode = header.children?.throws?.[0];
    if (throwsNode) {
      const exceptionList = throwsNode.children?.exceptionTypeList?.[0];
      const exceptionTypes = exceptionList?.children?.exceptionType ?? [];
      for (const et of exceptionTypes) {
        throwsClause.push(extractTypeText(et));
      }
    }

    // Body — extract from source code using position info
    const bodyNode = md.children?.methodBody?.[0];
    let body = "";
    if (bodyNode) {
      body = this.extractBodyFromSource(bodyNode, sourceCode);
    }

    return { name, returnType, params, body, annotations, throwsClause, isPrivate, isPublic };
  }

  private extractBodyFromSource(bodyNode: any, sourceCode: string): string {
    // Find the start and end positions of the method body block
    const blockNode = bodyNode.children?.block?.[0];
    if (!blockNode) return "";

    const lbrace = blockNode.children?.LCurly?.[0];
    const rbrace = blockNode.children?.RCurly?.[0];

    if (lbrace && rbrace) {
      const start = lbrace.endOffset + 1;
      const end = rbrace.startOffset;
      if (start < end) {
        return sourceCode.substring(start, end).trim();
      }
    }

    // Fallback: collect all text
    return collectAllText(blockNode);
  }

  // ─── Fallback regex parser ─────────────────────────────────────────────

  private fallbackRegexParse(sourceCode: string): ClassNode {
    const packageMatch = sourceCode.match(/package\s+([\w.]+)\s*;/);
    const classMatch = sourceCode.match(/(?:public\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/);
    const importMatches = sourceCode.match(/import\s+[\w.*]+\s*;/g) ?? [];

    const className = classMatch?.[1] ?? "Unknown";
    const superClass = classMatch?.[2] ?? null;
    const interfaces = classMatch?.[3]?.split(",").map(s => s.trim()) ?? [];

    // Extract fields via regex
    const fields: FieldNode[] = [];
    const fieldRegex = /(?:(@\w+(?:\([^)]*\))?)\s+)*(private|public|protected)?\s*(static)?\s*(final)?\s*([\w<>,\s]+?)\s+(\w+)\s*(?:=\s*([^;]+))?\s*;/gm;
    let fm;
    while ((fm = fieldRegex.exec(sourceCode)) !== null) {
      const annotations = fm[1] ? [fm[1]] : [];
      fields.push({
        name: fm[6],
        type: fm[5].trim(),
        annotations,
        isPrivate: fm[2] === "private",
        isStatic: !!fm[3],
        isFinal: !!fm[4],
        initializer: fm[7]?.trim(),
      });
    }

    // Extract methods via regex
    const methods: MethodNode[] = [];
    const methodRegex = /(?:(@\w+(?:\([^)]*\))?)\s+)*(private|public|protected)?\s*([\w<>,\s]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+([\w,\s]+))?\s*\{/gm;
    let mm;
    while ((mm = methodRegex.exec(sourceCode)) !== null) {
      const annotations = mm[1] ? [mm[1]] : [];
      const paramStr = mm[5].trim();
      const params: ParamNode[] = paramStr
        ? paramStr.split(",").map(p => {
            const parts = p.trim().split(/\s+/);
            return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" "), annotations: [] };
          })
        : [];

      // Extract body by counting braces
      let braceCount = 1;
      let bodyStart = mm.index + mm[0].length;
      let bodyEnd = bodyStart;
      for (let i = bodyStart; i < sourceCode.length && braceCount > 0; i++) {
        if (sourceCode[i] === "{") braceCount++;
        if (sourceCode[i] === "}") braceCount--;
        if (braceCount === 0) bodyEnd = i;
      }
      const body = sourceCode.substring(bodyStart, bodyEnd).trim();

      methods.push({
        name: mm[4],
        returnType: mm[3].trim(),
        params,
        body,
        annotations,
        throwsClause: mm[6]?.split(",").map(s => s.trim()) ?? [],
        isPrivate: mm[2] === "private",
        isPublic: mm[2] === "public",
      });
    }

    return {
      className,
      packageName: packageMatch?.[1] ?? "",
      superClass,
      interfaces,
      annotations: [],
      fields,
      methods,
      imports: importMatches,
      sourceCode,
    };
  }
}
