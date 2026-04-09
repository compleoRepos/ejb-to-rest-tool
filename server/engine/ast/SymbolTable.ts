/**
 * SymbolTable — Table de symboles pour la migration EJB → Spring Boot.
 * Classifie chaque variable/champ selon son rôle dans le pattern execute().
 *
 * @author Hamza NORDINE
 */
import type { MethodNode, ClassNode } from "./JavaASTParser";

export type SymbolRole =
  | "INPUT_DTO"        // paramètre voIn (avant cast)
  | "INPUT_ALIAS"      // variable castée : input = (VoIn) voIn
  | "OUTPUT_DTO"       // variable de sortie : VoOut output = new VoOut()
  | "EXTERNAL_SERVICE" // champ @EJB ou @Inject
  | "LOCAL_VAR"        // variable locale ordinaire
  | "CLASS_FIELD"      // champ de la classe (non-EJB)
  | "PARAMETER"        // paramètre de méthode ordinaire
  | "CONSTANT";        // static final

export interface Symbol {
  name: string;
  type: string;
  role: SymbolRole;
  origin: "METHOD_PARAM" | "LOCAL_DECLARATION" | "CLASS_FIELD" | "CAST";
  isVoIn?: boolean;
  isVoOut?: boolean;
  magixCodes?: string[];
}

export class SymbolTable {
  private symbols: Map<string, Symbol> = new Map();

  buildFromMethod(
    method: MethodNode,
    classAST: ClassNode,
    voInPattern: RegExp = /VoIn$/,
    voOutPattern: RegExp = /VoOut$/,
  ): void {
    this.symbols.clear();

    // 1. Paramètres de la méthode
    for (const param of method.params) {
      this.symbols.set(param.name, {
        name: param.name,
        type: param.type,
        role: voInPattern.test(param.type) ? "INPUT_DTO" : "PARAMETER",
        origin: "METHOD_PARAM",
        isVoIn: voInPattern.test(param.type),
      });
    }

    // 2. Champs de la classe
    for (const field of classAST.fields) {
      const hasEjbAnnotation = field.annotations.some(
        (a) => a.includes("@EJB") || a.includes("@Inject"),
      );
      const magixCodes = this.extractMagixCodes(classAST.sourceCode, field.name);

      if (field.isStatic && field.isFinal) {
        this.symbols.set(field.name, {
          name: field.name,
          type: field.type,
          role: "CONSTANT",
          origin: "CLASS_FIELD",
        });
      } else {
        this.symbols.set(field.name, {
          name: field.name,
          type: field.type,
          role: hasEjbAnnotation ? "EXTERNAL_SERVICE" : "CLASS_FIELD",
          origin: "CLASS_FIELD",
          magixCodes,
        });
      }
    }

    // 3. Variables locales dans le corps de la méthode
    const localVarPattern = /\b([A-Z][\w<>,\s]*?)\s+(\w+)\s*=/g;
    const body = method.body;
    let match: RegExpExecArray | null;

    while ((match = localVarPattern.exec(body)) !== null) {
      const [, type, name] = match;

      // Skip if already known (class field or param)
      if (this.symbols.has(name) && this.symbols.get(name)!.origin !== "LOCAL_DECLARATION") {
        continue;
      }

      // Cast VoIn : ActiverCarteVoIn input = (ActiverCarteVoIn) voIn
      const isCastOfVoIn =
        body.includes(`(${type}) voIn`) || body.includes(`(${type})voIn`);

      // new VoOut() : ActiverCarteVoOut output = new ActiverCarteVoOut()
      const isVoOutInstantiation =
        voOutPattern.test(type) && body.includes(`new ${type}()`);

      if (isCastOfVoIn) {
        this.symbols.set(name, {
          name,
          type,
          role: "INPUT_ALIAS",
          origin: "CAST",
          isVoIn: true,
        });
      } else if (isVoOutInstantiation) {
        this.symbols.set(name, {
          name,
          type,
          role: "OUTPUT_DTO",
          origin: "LOCAL_DECLARATION",
          isVoOut: true,
        });
      } else if (!this.symbols.has(name)) {
        this.symbols.set(name, {
          name,
          type,
          role: "LOCAL_VAR",
          origin: "LOCAL_DECLARATION",
        });
      }
    }
  }

  private extractMagixCodes(sourceCode: string, varName: string): string[] {
    const codes: string[] = [];
    const magixPattern = new RegExp(
      `${varName}\\.\\w+\\s*\\(\\s*"([A-Z]{2,6}[0-9]{1,3})"`,
      "g",
    );
    let match: RegExpExecArray | null;
    while ((match = magixPattern.exec(sourceCode)) !== null) {
      codes.push(match[1]);
    }
    return [...new Set(codes)];
  }

  resolve(name: string): Symbol | null {
    return this.symbols.get(name) ?? null;
  }

  getAll(): Symbol[] {
    return Array.from(this.symbols.values());
  }

  getInputAlias(): Symbol | null {
    return this.getAll().find((s) => s.role === "INPUT_ALIAS") ?? null;
  }

  getOutputVar(): Symbol | null {
    return this.getAll().find((s) => s.role === "OUTPUT_DTO") ?? null;
  }

  getExternalServices(): Symbol[] {
    return this.getAll().filter((s) => s.role === "EXTERNAL_SERVICE");
  }

  getConstants(): Symbol[] {
    return this.getAll().filter((s) => s.role === "CONSTANT");
  }
}
