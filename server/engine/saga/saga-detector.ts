/**
 * Saga Detector — Compleo v7.9 (Post-Audit STEP 1)
 *
 * Détecte les EJBs orchestrateurs éligibles au pattern Saga.
 * Un EJB est éligible quand il remplit TOUTES ces conditions :
 *   1. ≥ 2 dépendances @EJB vers d'autres services (inter-services)
 *   2. Au moins 1 opération d'écriture (INSERT/UPDATE/DELETE)
 *   3. Le flux est séquentiel avec dépendance entre steps
 *
 * Post-Audit: Itère sur useCases + ejb2xBeans + services pour ne rater aucun candidat.
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
 * Post-Audit STEP 1: Itère sur TOUTES les sources (useCases + ejb2xBeans + services)
 * pour ne rater aucun candidat.
 */
export function detectSagaCandidates(ir: ProjectIR): SagaCandidate[] {
  const candidates: SagaCandidate[] = [];
  const seenClassNames = new Set<string>();

  // 1. Scanner les UseCases (classes annotées @UseCase)
  for (const uc of ir.useCases) {
    const candidate = analyzeSagaEligibility(uc, ir);
    if (candidate && !seenClassNames.has(candidate.className)) {
      seenClassNames.add(candidate.className);
      candidates.push(candidate);
    }
  }

  // 2. Scanner les EJB 2.x beans (SessionBean, EntityBean)
  for (const ejb of (ir.ejb2xBeans ?? [])) {
    if (seenClassNames.has(ejb.className)) continue;
    // Convertir en pseudo-UseCaseIR pour réutiliser analyzeSagaEligibility
    const pseudoUc = ejb2xToUseCaseIR(ejb);
    const candidate = analyzeSagaEligibility(pseudoUc, ir);
    if (candidate && !seenClassNames.has(candidate.className)) {
      seenClassNames.add(candidate.className);
      candidates.push(candidate);
    }
  }

  // 3. Scanner les Services (classes @Service/@Stateless non-UseCase)
  for (const svc of (ir.services ?? [])) {
    if (seenClassNames.has(svc.className)) continue;
    const pseudoUc = serviceToUseCaseIR(svc);
    const candidate = analyzeSagaEligibility(pseudoUc, ir);
    if (candidate && !seenClassNames.has(candidate.className)) {
      seenClassNames.add(candidate.className);
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Convertit un Ejb2xBeanIR en pseudo-UseCaseIR pour analyse Saga.
 */
function ejb2xToUseCaseIR(ejb: ProjectIR["ejb2xBeans"][0]): UseCaseIR {
  return {
    className: ejb.className,
    packageName: ejb.packageName,
    domain: inferDomainFromClassName(ejb.className),
    bianDomain: "",
    bianAction: "",
    voInType: ejb.methods[0]?.parameters[0]?.type ?? "Object",
    voOutType: ejb.methods[0]?.returnType ?? "void",
    useCaseDescription: "",
    javadoc: "",
    injectedServices: extractInjectedServicesFromSource(ejb.rawSource),
    transactional: null,
    exceptionsCaught: [],
    exceptionsThrown: [],
    sourceFile: ejb.sourceFile,
    rawSource: ejb.rawSource,
    httpMethod: "",
    restPath: "",
  };
}

/**
 * Convertit un ServiceIR en pseudo-UseCaseIR pour analyse Saga.
 */
function serviceToUseCaseIR(svc: ProjectIR["services"][0]): UseCaseIR {
  // Récupérer le rawSource depuis les fichiers bruts si disponible
  const rawSource = (svc as any).rawSource ?? "";
  return {
    className: svc.className,
    packageName: svc.packageName,
    domain: inferDomainFromClassName(svc.className),
    bianDomain: "",
    bianAction: "",
    voInType: svc.methods[0]?.parameters[0]?.type ?? "Object",
    voOutType: svc.methods[0]?.returnType ?? "void",
    useCaseDescription: "",
    javadoc: "",
    injectedServices: svc.injectedDependencies ?? extractInjectedServicesFromSource(rawSource),
    transactional: null,
    exceptionsCaught: [],
    exceptionsThrown: [],
    sourceFile: svc.sourceFile,
    rawSource,
    httpMethod: "",
    restPath: "",
  };
}

/**
 * Extrait les services injectés depuis le code source brut.
 * Détecte les patterns @EJB, @Inject, @Autowired.
 */
function extractInjectedServicesFromSource(source: string): InjectedService[] {
  const services: InjectedService[] = [];
  const seen = new Set<string>();

  // Pattern: @EJB private TypeEJBLocal fieldName;
  const ejbPattern = /@(?:EJB|Inject|Autowired)\s+(?:private\s+)?(\w+)\s+(\w+)\s*;/g;
  for (const m of source.matchAll(ejbPattern)) {
    const type = m[1];
    const name = m[2];
    if (!seen.has(name)) {
      seen.add(name);
      services.push({ type, name });
    }
  }

  // Pattern: private TypeEJBLocal fieldName; (sans annotation, mais avec EJB dans le type)
  const fieldPattern = /private\s+(\w*(?:EJB|Service|Remote)\w*)\s+(\w+)\s*;/g;
  for (const m of source.matchAll(fieldPattern)) {
    const type = m[1];
    const name = m[2];
    if (!seen.has(name) && !DAO_PATTERNS.test(type)) {
      seen.add(name);
      services.push({ type, name });
    }
  }

  return services;
}

/**
 * Infère le domaine depuis un nom de classe.
 */
function inferDomainFromClassName(className: string): string {
  if (/virement|sepa|transfer/i.test(className)) return "virement";
  if (/credit|scoring|score/i.test(className)) return "credit";
  if (/client|onboarding|kyc/i.test(className)) return "client";
  if (/compliance|lbcft|sanction|aml/i.test(className)) return "compliance";
  if (/notification|notif/i.test(className)) return "notification";
  if (/compte|account/i.test(className)) return "compte";
  if (/garantie|collateral/i.test(className)) return "garantie";
  if (/risque|risk/i.test(className)) return "risque";

  const match = className.match(/^([A-Z][a-z]+)/);
  return match ? match[1].toLowerCase() : "unknown";
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

  // Si le type correspond à un EJB 2.x bean, c'est inter-service
  const matchesEjb2x = (ir.ejb2xBeans ?? []).some(
    (ejb) =>
      ejb.className === type ||
      ejb.className === type.replace(/Local$|Remote$/, "") ||
      type.startsWith(ejb.className),
  );
  if (matchesEjb2x) return true;

  // Si le type correspond à un Service, c'est inter-service
  const matchesService = (ir.services ?? []).some(
    (svc) =>
      svc.className === type ||
      type.startsWith(svc.className),
  );
  if (matchesService) return true;

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

  return inferDomainFromClassName(uc.className);
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
