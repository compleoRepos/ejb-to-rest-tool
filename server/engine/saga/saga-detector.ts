/**
 * Saga Detector — Compleo v7.9
 *
 * Détecte les EJBs orchestrateurs éligibles au pattern Saga.
 * Un EJB est éligible quand il remplit TOUTES ces conditions :
 *   1. ≥ 2 dépendances @EJB vers d'autres services (inter-services)
 *   2. Au moins 1 opération d'écriture (INSERT/UPDATE/DELETE)
 *   3. Le flux est séquentiel avec dépendance entre steps
 *
 * @author Hamza NORDINE
 */

import type { ProjectIR, UseCaseIR, InjectedService } from "../../java-parser";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EjbDependency {
  /** Nom du type injecté (ex: ComplianceLBCFTEJBLocal) */
  type: string;
  /** Nom du champ (ex: complianceService) */
  name: string;
  /** Est-ce une dépendance inter-service (pas un DAO local) ? */
  isInterService: boolean;
  /** Nom du microservice cible inféré (ex: compliance-service) */
  serviceName: string | null;
}

export interface SagaCandidate {
  /** Nom de la classe EJB source (ex: VirementSEPAOrchestrateurEJB) */
  className: string;
  /** Domaine métier inféré (ex: virement) */
  domain: string;
  /** Toutes les dépendances @EJB */
  ejbDependencies: EjbDependency[];
  /** Nombre de dépendances inter-services */
  interServiceCount: number;
  /** Opérations d'écriture détectées */
  writeOperations: string[];
  /** L'EJB a des opérations d'écriture */
  hasWriteOps: boolean;
  /** L'EJB a au moins un step compensable */
  hasCompensation: boolean;
  /** L'EJB a un mode dégradé (try-catch sur services externes) */
  hasGracefulDegradation: boolean;
  /** Type du VO d'entrée principal */
  inputType: string;
  /** Code source brut de l'EJB */
  rawSource: string;
}

// ── Patterns ─────────────────────────────────────────────────────────────────

/** Patterns indiquant un DAO local (pas un service inter-microservice) */
const DAO_PATTERNS = /DAO|Repository|Dao|dao|EntityManager|PersistenceContext/i;

/** Patterns indiquant une opération d'écriture SQL */
const WRITE_SQL_PATTERNS = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|MERGE\s+INTO)\b/i;

/** Patterns indiquant une écriture via API Java */
const WRITE_API_PATTERNS = /\.(persist|save|update|merge|remove|delete|flush|execute(?:Update|Batch))\s*\(/;

/** Patterns indiquant un mode dégradé (try-catch sur service externe) */
const DEGRADED_MODE_PATTERNS = /catch\s*\(\s*(?:Exception|ExternalServiceException|ServiceException|TimeoutException|ConnectException)\s+\w+\s*\)\s*\{[^}]*(?:mode\s*[Dd]égra|fallback|dégradé|degraded|continuer|continue\s+avec)/s;

// ── Détecteur ────────────────────────────────────────────────────────────────

/**
 * Détecte les EJBs éligibles au pattern Saga dans le projet.
 */
export function detectSagaCandidates(ir: ProjectIR): SagaCandidate[] {
  const candidates: SagaCandidate[] = [];

  for (const uc of ir.useCases) {
    const candidate = analyzeSagaEligibility(uc, ir);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Analyse un UseCase pour déterminer s'il est éligible Saga.
 */
function analyzeSagaEligibility(
  uc: UseCaseIR,
  ir: ProjectIR,
): SagaCandidate | null {
  const source = uc.rawSource || "";

  // Mapper les InjectedService vers EjbDependency
  const ejbDeps = mapDependencies(uc.injectedServices, source, ir);

  // Condition 1 : ≥ 2 dépendances @EJB inter-services
  const interServiceDeps = ejbDeps.filter((d) => d.isInterService);
  if (interServiceDeps.length < 2) return null;

  // Condition 2 : au moins 1 opération d'écriture
  const writeOps = detectWriteOperations(source);
  if (writeOps.length === 0) return null;

  // Condition 3 : flux séquentiel avec dépendance entre steps
  if (!hasSequentialDependency(source, ejbDeps)) return null;

  // Inférer le domaine
  const domain = inferDomain(uc);

  // Détecter le mode dégradé
  const hasGracefulDegradation = DEGRADED_MODE_PATTERNS.test(source);

  return {
    className: uc.className,
    domain,
    ejbDependencies: ejbDeps,
    interServiceCount: interServiceDeps.length,
    writeOperations: writeOps,
    hasWriteOps: true,
    hasCompensation: writeOps.length > 0,
    hasGracefulDegradation,
    inputType: uc.voInType || "Object",
    rawSource: source,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mappe les InjectedService du parser vers des EjbDependency enrichies.
 */
function mapDependencies(
  services: InjectedService[],
  source: string,
  ir: ProjectIR,
): EjbDependency[] {
  return services.map((svc) => {
    const isDao = DAO_PATTERNS.test(svc.type);
    const isInterService = !isDao && isExternalService(svc.type, ir);
    return {
      type: svc.type,
      name: svc.name,
      isInterService,
      serviceName: isInterService ? inferServiceName(svc.type) : null,
    };
  });
}

/**
 * Détermine si un type injecté est un service externe (pas local au même module).
 * Un service est considéré externe s'il correspond à un autre UseCase/EJB
 * ou s'il a un pattern de nom de service (xxxEJB, xxxService, xxxRemote).
 */
function isExternalService(type: string, ir: ProjectIR): boolean {
  // Si le type correspond à un autre UseCase dans le projet, c'est inter-service
  const matchesOtherUseCase = ir.useCases.some(
    (uc) =>
      uc.className === type ||
      uc.className === type.replace(/Local$|Remote$/, "") ||
      type.startsWith(uc.className),
  );
  if (matchesOtherUseCase) return true;

  // Patterns de noms de services externes
  if (/EJB|Remote|Service(?!DAO|Dao)/i.test(type) && !DAO_PATTERNS.test(type)) {
    return true;
  }

  return false;
}

/**
 * Détecte les opérations d'écriture dans le code source.
 */
function detectWriteOperations(source: string): string[] {
  const ops: string[] = [];

  // Écriture SQL
  const sqlMatches = source.matchAll(
    /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+(\w+)/gi,
  );
  for (const m of sqlMatches) {
    ops.push(`${m[1].toUpperCase()} ${m[2]}`);
  }

  // Écriture via API JPA/Hibernate
  const apiMatches = source.matchAll(
    /\.(persist|save|update|merge|remove|delete)\s*\(/g,
  );
  for (const m of apiMatches) {
    ops.push(`API:${m[1]}`);
  }

  // Dédupliquer
  return [...new Set(ops)];
}

/**
 * Vérifie que le flux est séquentiel (pas juste des appels parallèles indépendants).
 * Un flux est séquentiel si :
 *   - Il y a des commentaires "ÉTAPE N" numérotés
 *   - OU les résultats d'un appel sont utilisés dans un appel suivant
 *   - OU il y a des blocs try-catch englobant plusieurs appels
 */
function hasSequentialDependency(
  source: string,
  deps: EjbDependency[],
): boolean {
  // Stratégie 1 : commentaires numérotés "ÉTAPE N" ou "Step N"
  const stepComments = source.match(
    /\/\/\s*[ÉE]TAPE\s+\d+|\/\/\s*Step\s+\d+|\/\/\s*STEP\s+\d+/gi,
  );
  if (stepComments && stepComments.length >= 2) return true;

  // Stratégie 2 : résultat d'un service utilisé dans un appel suivant
  const interServiceDeps = deps.filter((d) => d.isInterService);
  if (interServiceDeps.length >= 2) {
    // Si au moins 2 services sont appelés dans le même bloc de code,
    // on considère que c'est séquentiel (heuristique conservative)
    const callCount = interServiceDeps.filter((d) =>
      new RegExp(`${escapeRegex(d.name)}\\s*\\.\\s*\\w+\\s*\\(`).test(source),
    ).length;
    if (callCount >= 2) return true;
  }

  // Stratégie 3 : try-catch englobant avec plusieurs appels de service
  if (/try\s*\{[\s\S]{100,}catch/g.test(source)) {
    return true;
  }

  return false;
}

/**
 * Infère le domaine métier depuis le UseCase.
 */
function inferDomain(uc: UseCaseIR): string {
  // Utiliser le domain du parser s'il est défini
  if (uc.domain && uc.domain !== "UNKNOWN" && uc.domain !== "unknown") {
    return uc.domain.toLowerCase();
  }

  // Inférer depuis le nom de classe
  const name = uc.className;
  if (/virement|sepa|transfer/i.test(name)) return "virement";
  if (/credit|scoring|score/i.test(name)) return "credit";
  if (/compliance|lbcft|sanction/i.test(name)) return "compliance";
  if (/notification|notif/i.test(name)) return "notification";
  if (/compte|account/i.test(name)) return "compte";

  // Fallback : extraire le premier mot significatif
  const match = name.match(/^([A-Z][a-z]+)/);
  return match ? match[1].toLowerCase() : "unknown";
}

/**
 * Infère le nom du microservice cible depuis le type injecté.
 */
function inferServiceName(type: string): string {
  // Retirer les suffixes EJB
  let base = type.replace(
    /EJB(?:Local|Remote)?$|Local$|Remote$|Bean$/,
    "",
  );

  // Convertir PascalCase en kebab-case
  base = base
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

  return `${base}-service`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
