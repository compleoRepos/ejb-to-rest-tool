/**
 * ServiceMethodGenerator — Génère le code des méthodes Service Spring Boot
 * à partir des résultats de transformation de la logique métier.
 *
 * @author Compleo
 */
import type { TransformResult, TransformTodo } from "./BusinessLogicTransformer";
import type { MethodNode } from "./ast/JavaASTParser";

export interface PrivateHelperMethod {
  name: string;
  returnType: string;
  params: string;
  body: string;
  sourceClassName: string;
}

export interface ServiceMethodContext {
  methodName: string;
  description: string;
  sourceClassName: string;
  sourceFilePath: string;
  requestDtoClass: string;
  responseDtoClass: string;
  requestDtoFields?: Array<{ name: string; type: string }>;
}

export class ServiceMethodGenerator {
  private packageName: string;

  constructor(packageName: string = "com.generated") {
    this.packageName = packageName;
  }

  generateMethod(
    ctx: ServiceMethodContext,
    transformResult: TransformResult,
    privateHelpers: PrivateHelperMethod[],
  ): string {
    const todosComment =
      transformResult.todos.length > 0
        ? transformResult.todos
            .map((t) => `    // TODO [${t.type}]: ${t.suggestion}`)
            .join("\n") + "\n"
        : "";

    const warningsComment =
      transformResult.warnings.length > 0
        ? transformResult.warnings
            .map((w) => `    // WARNING: ${w}`)
            .join("\n") + "\n"
        : "";

    const magixComment =
      transformResult.magixCodes.length > 0
        ? `    // Codes Magix utilisés : ${transformResult.magixCodes.join(", ")}\n`
        : "";

    const helpers = privateHelpers
      .map((h) => this.generatePrivateHelper(h))
      .join("\n\n");

    const mainIdExpr = this.getMainIdentifierExpr(ctx);

    return `
    /**
     * ${ctx.description || ctx.methodName}
     * Migré depuis : ${ctx.sourceClassName}
     * Fichier source : ${ctx.sourceFilePath || "N/A"}
     * Codes Magix : ${transformResult.magixCodes.join(", ") || "N/A"}
     * Lignes migrées : ${transformResult.migratedLines} | Manuelles : ${transformResult.manualLines}
     */
    @Transactional(rollbackFor = Exception.class)
    public ${ctx.responseDtoClass} ${ctx.methodName}(
        @Valid ${ctx.requestDtoClass} request) {
${magixComment}${warningsComment}${todosComment}
        log.info("${ctx.methodName} — début, ref={}",
            ${mainIdExpr});
${transformResult.code}
    }
${helpers}`;
  }

  private getMainIdentifierExpr(ctx: ServiceMethodContext): string {
    const candidates = [
      "numCarte",
      "rib",
      "clientId",
      "reference",
      "dossierId",
      "numCompte",
      "id",
    ];
    for (const c of candidates) {
      if (ctx.requestDtoFields?.some((f) => f.name === c)) {
        return `request.get${c.charAt(0).toUpperCase() + c.slice(1)}()`;
      }
    }
    return "request.toString()";
  }

  generateMagixServiceStub(magixCodes: string[]): string {
    const uniqueCodes = [...new Set(magixCodes)];

    const codeMethods = uniqueCodes
      .map(
        (code) => `
    /**
     * Stub spécifique pour le code Magix ${code}.
     * Identifié dans : [voir UseCase source dans MIGRATION_REPORT.md]
     */
    public String ${code.toLowerCase()}(String param) {
        return executeTransaction("${code}", param);
    }`,
      )
      .join("\n");

    return `package ${this.packageName}.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Stub MagixService — Adaptateur vers le core banking BOA EAI.
 * Codes Magix identifiés dans ce projet : ${uniqueCodes.join(", ")}
 *
 * TODO: Remplacer les UnsupportedOperationException par les vrais appels
 * au middleware Magix via HTTP/SOAP/REST selon la configuration de votre SI.
 */
@Slf4j
@Service
public class MagixService {

    /**
     * Consulter une ressource via le core banking.
     * @param codeOperation Code Magix (ex: CART01, CPT001)
     * @param param Paramètre principal (numCarte, numCompte, etc.)
     * @return Résultat du core banking
     */
    public String consulter(String codeOperation, String param) {
        log.warn("MagixService.consulter({}, {}) — STUB à implémenter",
                 codeOperation, param);
        // TODO: Implémenter l'appel au middleware Magix
        // Documentation: voir contrat d'interface Magix v2.1
        throw new UnsupportedOperationException(
            "MagixService.consulter(" + codeOperation + ") non implémenté. " +
            "Intégration core banking requise."
        );
    }

    /**
     * Exécuter une transaction via le core banking.
     * @param codeOperation Code Magix (ex: CART02, VIR01)
     * @param param Données de la transaction
     * @return Résultat "OK" si succès
     */
    public String executeTransaction(String codeOperation, String param) {
        log.warn("MagixService.executeTransaction({}) — STUB à implémenter",
                 codeOperation);
        // TODO: Implémenter l'appel au middleware Magix
        throw new UnsupportedOperationException(
            "MagixService.executeTransaction(" + codeOperation + ") non implémenté."
        );
    }
${codeMethods}
}
`;
  }

  private generatePrivateHelper(helper: PrivateHelperMethod): string {
    return `
    /**
     * Méthode helper migrée depuis ${helper.sourceClassName}.${helper.name}()
     */
    private ${helper.returnType} ${helper.name}(${helper.params}) {
${helper.body}
    }`;
  }

  /**
   * Extraire les méthodes privées d'un ClassNode AST et les convertir en helpers.
   */
  static extractPrivateHelpers(
    privateMethods: MethodNode[],
    sourceClassName: string,
  ): PrivateHelperMethod[] {
    return privateMethods
      .filter((m) => m.isPrivate && m.name !== "execute")
      .map((m) => ({
        name: m.name,
        returnType: m.returnType,
        params: m.params.map((p) => `${p.type} ${p.name}`).join(", "),
        body: m.body
          ? m.body
              .split("\n")
              .map((l) => `        ${l}`)
              .join("\n")
          : "        // TODO: Implement",
        sourceClassName,
      }));
  }
}
