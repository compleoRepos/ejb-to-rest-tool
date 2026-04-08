/**
 * Ambiguity Detector — Detects ambiguities in the parsed EJB project IR
 * that require user input before code generation.
 *
 * 7 types of ambiguities:
 *   1. HTTP_VERB_AMBIGUOUS — unclear HTTP method
 *   2. URL_STRUCTURE_AMBIGUOUS — unclear URL path structure
 *   3. RETURN_TYPE_AMBIGUOUS — List return → paginate?
 *   4. CLASS_GROUPING_AMBIGUOUS — group UseCases into 1 or N controllers?
 *   5. TRANSACTION_AMBIGUOUS — no @Transactional annotation
 *   6. EXTERNAL_DEPENDENCY — injected bean not in the project
 *   7. DOMAIN_NAME_AMBIGUOUS — generic package name
 *
 * @author Hamza NORDINE
 */

import type { ProjectIR, UseCaseIR, InjectedService } from "./java-parser";

export type AmbiguitySeverity = "info" | "warning" | "blocking";

export interface AmbiguityOption {
  id: string;
  label: string;
  description: string;
}

export interface AmbiguityContext {
  className: string;
  methodName?: string;
  signature?: string;
  javadoc?: string;
  packageName?: string;
  relatedClasses?: string[];
  injectedType?: string;
}

export interface Ambiguity {
  id: string;
  type: string;
  severity: AmbiguitySeverity;
  context: AmbiguityContext;
  question: string;
  recommendation: string;
  recommendationReason: string;
  options: AmbiguityOption[];
}

export interface UserChoice {
  ambiguityId: string;
  choiceId: string;
}

// ─── Main Detection Function ────────────────────────────────────────────────

export function detectAmbiguities(ir: ProjectIR): Ambiguity[] {
  const ambiguities: Ambiguity[] = [];
  let counter = 0;

  const nextId = () => `amb_${String(++counter).padStart(3, "0")}`;

  // Build set of known classes in the project
  const knownClasses = new Set<string>();
  ir.useCases.forEach(uc => knownClasses.add(uc.className));
  ir.dtos.forEach(d => knownClasses.add(d.className));
  ir.services.forEach(s => knownClasses.add(s.className));
  ir.enums.forEach(e => knownClasses.add(e.className));
  ir.exceptions.forEach(e => knownClasses.add(e.className));
  ir.validators.forEach(v => knownClasses.add(v.className));
  ir.remoteInterfaces.forEach(r => knownClasses.add(r.className));

  // Group UseCases by domain
  const domainMap = new Map<string, UseCaseIR[]>();
  for (const uc of ir.useCases) {
    const domain = uc.domain || "general";
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain)!.push(uc);
  }

  for (const uc of ir.useCases) {
    // TYPE 1 — HTTP Verb Ambiguous
    const httpAmb = detectHttpVerbAmbiguity(uc, nextId);
    if (httpAmb) ambiguities.push(httpAmb);

    // TYPE 2 — URL Structure Ambiguous
    const urlAmb = detectUrlStructureAmbiguity(uc, nextId);
    if (urlAmb) ambiguities.push(urlAmb);

    // TYPE 3 — Return Type Ambiguous (List → paginate?)
    const returnAmb = detectReturnTypeAmbiguity(uc, ir, nextId);
    if (returnAmb) ambiguities.push(returnAmb);

    // TYPE 5 — Transaction Ambiguous
    const txAmb = detectTransactionAmbiguity(uc, nextId);
    if (txAmb) ambiguities.push(txAmb);

    // TYPE 6 — External Dependency
    for (const svc of uc.injectedServices) {
      const depAmb = detectExternalDependency(uc, svc, knownClasses, nextId);
      if (depAmb) ambiguities.push(depAmb);
    }
  }

  // TYPE 4 — Class Grouping Ambiguous (per domain)
  for (const [domain, useCases] of domainMap) {
    const groupAmb = detectClassGroupingAmbiguity(domain, useCases, nextId);
    if (groupAmb) ambiguities.push(groupAmb);
  }

  // TYPE 7 — Domain Name Ambiguous
  for (const uc of ir.useCases) {
    const domainAmb = detectDomainNameAmbiguity(uc, nextId);
    if (domainAmb) ambiguities.push(domainAmb);
  }

  return ambiguities;
}

// ─── Apply User Choices to IR ───────────────────────────────────────────────

export function applyChoicesToIR(ir: ProjectIR, ambiguities: Ambiguity[], choices: UserChoice[]): ProjectIR {
  const choiceMap = new Map(choices.map(c => [c.ambiguityId, c.choiceId]));

  // Deep clone the IR to avoid mutating the original
  const modifiedIR: ProjectIR = JSON.parse(JSON.stringify(ir));

  for (const amb of ambiguities) {
    const choiceId = choiceMap.get(amb.id) || amb.recommendation;

    switch (amb.type) {
      case "HTTP_VERB_AMBIGUOUS": {
        const uc = modifiedIR.useCases.find(u => u.className === amb.context.className);
        if (uc) {
          uc.httpMethod = choiceId; // A=POST, B=PUT, C=PATCH
        }
        break;
      }

      case "TRANSACTION_AMBIGUOUS": {
        const uc = modifiedIR.useCases.find(u => u.className === amb.context.className);
        if (uc) {
          if (choiceId === "A") {
            uc.transactional = { readOnly: false, propagation: "REQUIRED", rollbackFor: "" };
          } else if (choiceId === "B") {
            uc.transactional = { readOnly: true, propagation: "REQUIRED", rollbackFor: "" };
          } else {
            uc.transactional = null;
          }
        }
        break;
      }

      case "RETURN_TYPE_AMBIGUOUS": {
        // Store choice as metadata for the generator to use
        const uc = modifiedIR.useCases.find(u => u.className === amb.context.className);
        if (uc) {
          // We'll use a convention: store pagination choice in restPath metadata
          (uc as any).paginationChoice = choiceId; // A=List, B=Page, C=ResponseEntity+headers
        }
        break;
      }

      case "URL_STRUCTURE_AMBIGUOUS": {
        const uc = modifiedIR.useCases.find(u => u.className === amb.context.className);
        if (uc) {
          // Apply the chosen URL structure
          const option = amb.options.find(o => o.id === choiceId);
          if (option) {
            uc.restPath = option.label;
          }
        }
        break;
      }

      // TYPE 4 and TYPE 7 are informational — they don't modify the IR directly
      // but could be used by the generator for grouping/naming decisions
    }
  }

  return modifiedIR;
}

// ─── Individual Detectors ───────────────────────────────────────────────────

function detectHttpVerbAmbiguity(uc: UseCaseIR, nextId: () => string): Ambiguity | null {
  const name = uc.className.toLowerCase().replace(/uc$/, "").replace(/ejb$/, "");

  // Clear verbs that don't need user input
  const clearGetVerbs = /^(consulter|charger|get|find|list|count|rechercher|lire|afficher)/;
  const clearPostVerbs = /^(creer|create|ouvrir|envoyer|generer|simuler|virement|souscrire)/;
  const clearPutVerbs = /^(maj|update|modifier|bloquer|activer|receptionner|debloquer)/;
  const clearDeleteVerbs = /^(cloturer|supprimer|delete|annuler|resilier)/;

  if (clearGetVerbs.test(name) || clearPostVerbs.test(name) ||
      clearPutVerbs.test(name) || clearDeleteVerbs.test(name)) {
    return null; // No ambiguity
  }

  // Ambiguous verb — ask user
  const javadoc = uc.useCaseDescription || uc.javadoc || "";
  return {
    id: nextId(),
    type: "HTTP_VERB_AMBIGUOUS",
    severity: "warning",
    context: {
      className: uc.className,
      methodName: "execute",
      signature: `${uc.voOutType} execute(${uc.voInType} voIn)`,
      javadoc: javadoc || undefined,
      packageName: uc.packageName,
    },
    question: `Quelle méthode HTTP pour '${uc.className}.execute' ?`,
    recommendation: "POST",
    recommendationReason: `Le nom "${uc.className}" ne correspond pas clairement à un verbe CRUD standard. POST est recommandé pour les actions métier.`,
    options: [
      { id: "POST", label: "POST", description: "Crée ou déclenche une action (recommandé pour les actions métier)" },
      { id: "PUT", label: "PUT", description: "Remplace une ressource entière" },
      { id: "PATCH", label: "PATCH", description: "Modification partielle d'une ressource" },
      { id: "GET", label: "GET", description: "Lecture seule, sans effet de bord" },
    ],
  };
}

function detectUrlStructureAmbiguity(uc: UseCaseIR, nextId: () => string): Ambiguity | null {
  // Only relevant for UseCases with VoIn that has multiple potential path params
  if (uc.voInType === "ValueObject") return null;

  // Check if the UseCase name suggests a resource with an ID
  const name = uc.className.replace(/UC$/, "").replace(/EJB$/, "");
  const hasIdParam = /Charger|Consulter|Modifier|Bloquer|Activer|Supprimer|Cloturer/.test(name);

  if (!hasIdParam) return null;

  const domain = uc.domain || "general";
  const kebab = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const action = kebab.split("-")[0]; // e.g., "activer", "bloquer"
  const resource = domain;

  return {
    id: nextId(),
    type: "URL_STRUCTURE_AMBIGUOUS",
    severity: "info",
    context: {
      className: uc.className,
      packageName: uc.packageName,
    },
    question: `Quelle structure d'URL pour '${uc.className}' ?`,
    recommendation: "A",
    recommendationReason: `Le pattern RESTful standard utilise un identifiant dans le path pour les opérations sur une ressource spécifique.`,
    options: [
      { id: "A", label: `/api/v1/${resource}/{id}/${action}`, description: `Identifiant dans le path + action` },
      { id: "B", label: `/api/v1/${resource}/${kebab}`, description: `Action comme endpoint dédié` },
      { id: "C", label: `/api/v1/${resource}?action=${action}`, description: `Action comme query parameter` },
    ],
  };
}

function detectReturnTypeAmbiguity(uc: UseCaseIR, ir: ProjectIR, nextId: () => string): Ambiguity | null {
  // Check if the VoOut contains a List field → pagination question
  const voOut = ir.dtos.find(d => d.className === uc.voOutType);
  if (!voOut) return null;

  const hasListField = voOut.fields.some(f => f.isList);
  if (!hasListField) return null;

  // Only for GET methods (list operations)
  const name = uc.className.toLowerCase();
  if (!/list|consulter|charger|rechercher|find|get/.test(name)) return null;

  return {
    id: nextId(),
    type: "RETURN_TYPE_AMBIGUOUS",
    severity: "info",
    context: {
      className: uc.className,
      methodName: "execute",
      packageName: uc.packageName,
    },
    question: `Le résultat de '${uc.className}' contient une liste. Faut-il paginer ?`,
    recommendation: "A",
    recommendationReason: "Pour un premier livrable, une liste simple est plus rapide à intégrer. La pagination peut être ajoutée ultérieurement.",
    options: [
      { id: "A", label: "List<X> simple", description: "Tableau JSON sans pagination" },
      { id: "B", label: "Page<X> Spring Data", description: "Pagination automatique avec Spring Data (page, size, sort)" },
      { id: "C", label: "ResponseEntity<List<X>>", description: "Liste avec headers X-Total-Count pour pagination manuelle" },
    ],
  };
}

function detectClassGroupingAmbiguity(domain: string, useCases: UseCaseIR[], nextId: () => string): Ambiguity | null {
  // Only relevant if there are 2+ UseCases in the same domain
  if (useCases.length < 2) return null;
  // If domain is "general", always ask
  if (domain === "general" && useCases.length >= 2) {
    return {
      id: nextId(),
      type: "CLASS_GROUPING_AMBIGUOUS",
      severity: "warning",
      context: {
        className: useCases.map(uc => uc.className).join(", "),
        relatedClasses: useCases.map(uc => uc.className),
        packageName: useCases[0].packageName,
      },
      question: `${useCases.length} UseCases dans le domaine '${domain}'. Regrouper dans un seul Controller ?`,
      recommendation: "A",
      recommendationReason: `Les UseCases partagent le même domaine fonctionnel '${domain}'. Un Controller unique simplifie l'API.`,
      options: [
        { id: "A", label: "Un seul Controller", description: `${domain}Controller avec ${useCases.length} endpoints` },
        { id: "B", label: "Controllers séparés", description: `${useCases.length} Controllers distincts (un par UseCase)` },
      ],
    };
  }

  return null;
}

function detectTransactionAmbiguity(uc: UseCaseIR, nextId: () => string): Ambiguity | null {
  // If transaction info is already present, no ambiguity
  if (uc.transactional !== null) return null;

  // Check if the UseCase name gives a hint
  const name = uc.className.toLowerCase();
  const isReadOnly = /consulter|charger|get|find|list|count|rechercher|lire|afficher/.test(name);

  if (isReadOnly) {
    // Auto-resolve: readOnly = true (no need to ask)
    return null;
  }

  return {
    id: nextId(),
    type: "TRANSACTION_AMBIGUOUS",
    severity: "info",
    context: {
      className: uc.className,
      methodName: "execute",
      packageName: uc.packageName,
    },
    question: `Pas d'annotation @Transactional détectée pour '${uc.className}'. Quel comportement transactionnel ?`,
    recommendation: "A",
    recommendationReason: "Par défaut, les opérations d'écriture bancaires doivent être transactionnelles avec rollback en cas d'erreur.",
    options: [
      { id: "A", label: "@Transactional (readWrite)", description: "Transaction complète avec rollback automatique (REQUIRED)" },
      { id: "B", label: "@Transactional(readOnly)", description: "Transaction en lecture seule (optimisation)" },
      { id: "C", label: "Pas de transaction", description: "Opération sans effet de bord (pas de base de données)" },
    ],
  };
}

function detectExternalDependency(uc: UseCaseIR, svc: InjectedService, knownClasses: Set<string>, nextId: () => string): Ambiguity | null {
  // If the injected type is a known class, no ambiguity
  if (knownClasses.has(svc.type)) return null;

  return {
    id: nextId(),
    type: "EXTERNAL_DEPENDENCY",
    severity: "warning",
    context: {
      className: uc.className,
      injectedType: svc.type,
      packageName: uc.packageName,
    },
    question: `'${uc.className}' injecte '${svc.type}' qui n'est pas dans le projet. Comment le gérer ?`,
    recommendation: "A",
    recommendationReason: `'${svc.type}' est probablement un service du framework propriétaire. Un stub @Service permet de compiler le code et d'implémenter l'intégration plus tard.`,
    options: [
      { id: "A", label: "Générer un @Service stub", description: `Créer ${svc.type}Service avec méthodes TODO` },
      { id: "B", label: "Générer une interface", description: `Créer une interface ${svc.type} + TODO pour l'implémentation` },
      { id: "C", label: "Ignorer (commenter)", description: `Commenter l'injection dans le code généré` },
    ],
  };
}

function detectDomainNameAmbiguity(uc: UseCaseIR, nextId: () => string): Ambiguity | null {
  // Only for UseCases in generic packages
  const genericPackages = ["utils", "commons", "base", "common", "shared", "general"];
  const domain = uc.domain || "general";

  if (!genericPackages.includes(domain)) return null;

  return {
    id: nextId(),
    type: "DOMAIN_NAME_AMBIGUOUS",
    severity: "info",
    context: {
      className: uc.className,
      packageName: uc.packageName,
    },
    question: `'${uc.className}' est dans un package générique ('${domain}'). Quel nom de domaine REST utiliser ?`,
    recommendation: "A",
    recommendationReason: `Le nom de la classe suggère un domaine fonctionnel qui peut être déduit du contexte.`,
    options: [
      { id: "A", label: domain, description: `Garder '${domain}' comme domaine REST` },
      { id: "B", label: inferDomainFromClassName(uc.className), description: `Déduire du nom de la classe` },
      { id: "C", label: "custom", description: "Saisir un nom de domaine personnalisé" },
    ],
  };
}

function inferDomainFromClassName(className: string): string {
  const name = className.replace(/UC$/, "").replace(/EJB$/, "");
  // Try to extract the last noun from the CamelCase name
  const parts = name.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
  if (parts.length >= 2) {
    return parts[parts.length - 1].toLowerCase();
  }
  return name.toLowerCase();
}
