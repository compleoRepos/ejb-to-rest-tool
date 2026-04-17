/**
 * domain-grouper.ts — Groupement des handlers par domaine métier.
 *
 * Quand le handler-pattern-detector identifie N handlers, ce module
 * les regroupe en services Spring cohérents par domaine métier.
 *
 * Résultat : au lieu d'un seul "GeneralService" avec toutes les méthodes,
 * on obtient :
 *   - MadOperationService   (traiterMad, annulerMad, controlerMontant)
 *   - MadConsultationService (getListeEnAttente, getHistorique, consulterEligibilite)
 *   - BeneficiaireService    (ajouterBeneficiaire, modifierBeneficiaire, ...)
 *   - MadCoreIntegrationService (authentifier)
 *   - ClientService           (modifierTelephone)
 *
 * Impact sur les projets existants : AUCUN.
 * Le grouper n'est appelé que si handlerPattern.detected === true.
 *
 * @author Hamza NORDINE
 * @since v8.3
 */

import type { UseCaseIR } from "../../java-parser";

// ─── Types publics ──────────────────────────────────────────────────────────

export interface DomainGroup {
  /** Nom du domaine (ex: "mad-operation") */
  domain: string;
  /** Nom du service Spring (ex: "MadOperationService") */
  serviceName: string;
  /** Nom du controller Spring (ex: "MadOperationController") */
  controllerName: string;
  /** Base path REST (ex: "/api/v1/mad-operations") */
  basePath: string;
  /** UseCases regroupés dans ce domaine */
  useCases: UseCaseIR[];
}

// ─── Mapping domaine → noms de service/controller ───────────────────────────

const DOMAIN_SERVICE_MAP: Record<string, { service: string; controller: string; basePath: string }> = {
  "mad-operation":        { service: "MadOperationService",        controller: "MadOperationController",        basePath: "/api/v1/mad-operations" },
  "mad-consultation":     { service: "MadConsultationService",     controller: "MadConsultationController",     basePath: "/api/v1/mad-consultations" },
  "beneficiaire":         { service: "BeneficiaireService",        controller: "BeneficiaireController",        basePath: "/api/v1/beneficiaires" },
  "mad-core-integration": { service: "MadCoreIntegrationService",  controller: "MadCoreIntegrationController",  basePath: "/api/v1/mad-core" },
  "client":               { service: "ClientService",              controller: "ClientController",              basePath: "/api/v1/clients" },
};

// ─── Groupement principal ───────────────────────────────────────────────────

/**
 * Grouper les UseCases (issus de handlers) par domaine métier.
 *
 * @param useCases Tous les UseCases du projet (y compris ceux issus de handlers)
 * @returns Map<domain, DomainGroup> — un groupe par domaine
 */
export function groupByDomain(useCases: UseCaseIR[]): Map<string, DomainGroup> {
  const groups = new Map<string, DomainGroup>();

  for (const uc of useCases) {
    const domain = uc.domain || "general";
    if (!groups.has(domain)) {
      const mapping = DOMAIN_SERVICE_MAP[domain];
      groups.set(domain, {
        domain,
        serviceName: mapping?.service ?? toPascalCase(domain) + "Service",
        controllerName: mapping?.controller ?? toPascalCase(domain) + "Controller",
        basePath: mapping?.basePath ?? `/api/v1/${pluralize(domain)}`,
        useCases: [],
      });
    }
    groups.get(domain)!.useCases.push(uc);
  }

  return groups;
}

/**
 * Obtenir le nom du service Spring pour un domaine donné.
 */
export function getServiceNameForDomain(domain: string): string {
  const mapping = DOMAIN_SERVICE_MAP[domain];
  return mapping?.service ?? toPascalCase(domain) + "Service";
}

/**
 * Obtenir le nom du controller Spring pour un domaine donné.
 */
export function getControllerNameForDomain(domain: string): string {
  const mapping = DOMAIN_SERVICE_MAP[domain];
  return mapping?.controller ?? toPascalCase(domain) + "Controller";
}

/**
 * Obtenir le base path REST pour un domaine donné.
 */
export function getBasePathForDomain(domain: string): string {
  const mapping = DOMAIN_SERVICE_MAP[domain];
  return mapping?.basePath ?? `/api/v1/${pluralize(domain)}`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function pluralize(word: string): string {
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z")) return word;
  if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  return word + "s";
}
