/**
 * dao-splitter.ts — Décompose un God-class DAO (HibernateDao) en N JPA Repositories.
 *
 * Pattern cible :
 *   HibernateDao.java (1563 LOC, 25+ méthodes statiques avec Connection)
 *   → MadRepository, BeneficiaireRepository, CompteRepository, etc.
 *
 * Chaque méthode statique est classifiée par entité cible (via le nom de la méthode
 * et les tables SQL référencées), puis regroupée dans un repository JPA dédié.
 *
 * Impact sur les projets existants : AUCUN.
 * Le splitter n'est appelé que si un God-class DAO est détecté.
 *
 * @author Compleo
 * @since v8.3
 */

import type { GeneratedFile } from "../../spring/shared";

// ─── Types publics ──────────────────────────────────────────────────────────

export interface DaoMethod {
  /** Nom de la méthode (ex: "getListBenef") */
  name: string;
  /** Type de retour (ex: "List<MadBeneficiaire>") */
  returnType: string;
  /** Paramètres (ex: [{name: "idClient", type: "String"}, ...]) */
  parameters: { name: string; type: string }[];
  /** Tables SQL référencées dans le corps */
  referencedTables: string[];
  /** DataSources utilisées */
  dataSources: string[];
  /** Corps de la méthode */
  body: string;
  /** Entité cible inférée */
  targetEntity: string;
}

export interface RepositoryGroup {
  /** Nom de l'entité (ex: "MadBeneficiaire") */
  entity: string;
  /** Nom du repository (ex: "BeneficiaireRepository") */
  repositoryName: string;
  /** Méthodes regroupées */
  methods: DaoMethod[];
}

export interface DaoSplitResult {
  /** Nom de la classe DAO originale */
  originalClass: string;
  /** Nombre de méthodes extraites */
  totalMethods: number;
  /** Repositories générés */
  repositories: RepositoryGroup[];
  /** Constantes SQL extraites */
  sqlConstants: { name: string; value: string }[];
}

// ─── Mapping méthode → entité ───────────────────────────────────────────────

const METHOD_ENTITY_MAP: Record<string, string> = {
  // Compte
  "getTierFromCpt":       "CompteClient",
  "getCompteClient":      "CompteClient",
  "getSolde":             "CompteClient",
  "debitCompte":          "CompteClient",
  // Catégorie
  "getCategorie":         "Categorie",
  // Bénéficiaire
  "getListBenef":         "MadBeneficiaire",
  "addBenef":             "MadBeneficiaire",
  "modifBenef":           "MadBeneficiaire",
  "supBenef":             "MadBeneficiaire",
  "IsBenefEnregistre":    "MadBeneficiaire",
  "getIdBenef":           "MadBeneficiaire",
  "getNextIdBenef":       "MadBeneficiaire",
  "BeneficiaryPhoneUpdate": "MadBeneficiaire",
  // MAD (mise à disposition)
  "insertMadDTV":         "MadMad",
  "insertMadEbank":       "MadMad",
  "getListMadAttente":    "MadMad",
  "annulMad":             "MadMad",
  "getHistoMad":          "MadMad",
  "MajListeMadHisto":     "MadMad",
  "getReference":         "MadMad",
  "getNextSequence":      "MadMad",
  "getSequence":          "MadMad",
  // Plafond/Montant
  "controlMontant":       "MadPlafondMontant",
  "getSommeJour":         "MadPlafondMontant",
  "getSommeMois":         "MadPlafondMontant",
  "getOperationPerDay":   "MadPlafondMontant",
  "isDuplicateTransaction": "MadPlafondMontant",
  // Notification
  "addNotif":             "Notification",
};

// ─── Mapping entité → nom du repository ─────────────────────────────────────

const ENTITY_REPO_MAP: Record<string, string> = {
  "CompteClient":      "CompteClientRepository",
  "Categorie":         "CategorieRepository",
  "MadBeneficiaire":   "BeneficiaireRepository",
  "MadMad":            "MadRepository",
  "MadPlafondMontant": "PlafondMontantRepository",
  "Notification":      "NotificationRepository",
};

// ─── Tables SQL connues ─────────────────────────────────────────────────────

const TABLE_ENTITY_MAP: Record<string, string> = {
  "MAD_MAD":           "MadMad",
  "MAD_BENEFICIAIRE":  "MadBeneficiaire",
  "MAD_BENEF":         "MadBeneficiaire",
  "COMPTE_CLIENT":     "CompteClient",
  "CATEGORIE":         "Categorie",
  "MAD_PLAFOND":       "MadPlafondMontant",
  "NOTIFICATION":      "Notification",
  "TIERS":             "CompteClient",
  "V_TIERS":           "CompteClient",
  "MAD_SEQUENCE":      "MadMad",
};

// ─── Détection et split ─────────────────────────────────────────────────────

/**
 * Détecter si un fichier Java est un God-class DAO.
 * Critères : classe avec >10 méthodes statiques prenant Connection en paramètre.
 */
export function isGodClassDao(source: string, className: string): boolean {
  if (!/class\s+\w+/.test(source)) return false;
  const staticMethods = source.match(/public\s+static\s+\w[\w<>,\s\[\]]*\s+\w+\s*\([^)]*Connection[^)]*\)/g);
  return (staticMethods?.length ?? 0) >= 5;
}

/**
 * Splitter un God-class DAO en N repositories JPA.
 */
export function splitDao(source: string, className: string): DaoSplitResult {
  const methods = extractDaoMethods(source, className);
  const sqlConstants = extractSqlConstants(source);

  // Grouper par entité
  const entityGroups = new Map<string, DaoMethod[]>();
  for (const method of methods) {
    const entity = method.targetEntity || "Unknown";
    if (!entityGroups.has(entity)) entityGroups.set(entity, []);
    entityGroups.get(entity)!.push(method);
  }

  const repositories: RepositoryGroup[] = [];
  for (const [entity, groupMethods] of entityGroups) {
    repositories.push({
      entity,
      repositoryName: ENTITY_REPO_MAP[entity] ?? entity + "Repository",
      methods: groupMethods,
    });
  }

  return {
    originalClass: className,
    totalMethods: methods.length,
    repositories,
    sqlConstants,
  };
}

/**
 * Générer les fichiers JPA Repository à partir du résultat du split.
 */
export function generateRepositories(
  splitResult: DaoSplitResult,
  basePackage: string,
  basePath: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const repo of splitResult.repositories) {
    const content = generateRepositoryFile(repo, basePackage, splitResult.sqlConstants);
    files.push({
      path: `${basePath}/repository/${repo.repositoryName}.java`,
      content,
      category: "repository",
    });
  }

  return files;
}

// ─── Extraction des méthodes ────────────────────────────────────────────────

function extractDaoMethods(source: string, className: string): DaoMethod[] {
  const methods: DaoMethod[] = [];
  const methodRegex = /public\s+static\s+([\w<>,\s\[\]]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
  let match;

  while ((match = methodRegex.exec(source)) !== null) {
    const returnType = match[1].trim();
    const name = match[2];
    const paramsStr = match[3];

    // Skip constants (field declarations)
    if (returnType === "String" && /^\s*"/.test(source.substring(match.index + match[0].length).trim())) continue;

    const parameters = paramsStr
      .split(",")
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const parts = p.replace(/@\w+(?:\([^)]*\))?\s*/g, "").trim().split(/\s+/);
        return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" ") };
      });

    // Extraire le corps de la méthode
    const body = extractMethodBody(source, match.index + match[0].length);

    // Détecter les tables SQL
    const referencedTables = extractReferencedTables(body);

    // Détecter les DataSources
    const dataSources = extractDataSourcesFromBody(body, paramsStr);

    // Inférer l'entité cible
    const targetEntity = inferTargetEntity(name, referencedTables, returnType);

    methods.push({
      name,
      returnType,
      parameters: parameters.filter(p => p.type !== "Connection"), // Exclure Connection des params
      referencedTables,
      dataSources,
      body,
      targetEntity,
    });
  }

  return methods;
}

function extractMethodBody(source: string, startIdx: number): string {
  let depth = 1;
  let i = startIdx;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    i++;
  }
  return source.substring(startIdx, i - 1).trim();
}

function extractReferencedTables(body: string): string[] {
  const tables: string[] = [];
  // Pattern: FROM/INTO/UPDATE/JOIN table_name
  const sqlPatterns = /(?:FROM|INTO|UPDATE|JOIN)\s+(\w+)/gi;
  let m;
  while ((m = sqlPatterns.exec(body)) !== null) {
    const table = m[1].toUpperCase();
    if (!tables.includes(table) && table.length > 2) {
      tables.push(table);
    }
  }
  return tables;
}

function extractDataSourcesFromBody(body: string, paramsStr: string): string[] {
  const ds: string[] = [];
  if (/connexionEbankDirect|ebankdirect/i.test(body + paramsStr)) ds.push("ebankdirect");
  if (/connexionEbankInterface|ebankinterface/i.test(body + paramsStr)) ds.push("ebankinterface");
  if (/dataCenterDs|connexiondataCenterDs|dwhds/i.test(body + paramsStr)) ds.push("datacenter");
  return ds;
}

function inferTargetEntity(methodName: string, tables: string[], returnType: string): string {
  // 1. Mapping explicite par nom de méthode
  if (METHOD_ENTITY_MAP[methodName]) return METHOD_ENTITY_MAP[methodName];

  // 2. Inférence par tables SQL
  for (const table of tables) {
    if (TABLE_ENTITY_MAP[table]) return TABLE_ENTITY_MAP[table];
  }

  // 3. Inférence par type de retour
  if (/MadBeneficiaire/.test(returnType)) return "MadBeneficiaire";
  if (/MadMad/.test(returnType)) return "MadMad";
  if (/CompteClient/.test(returnType)) return "CompteClient";
  if (/Categorie/.test(returnType)) return "Categorie";
  if (/MadPlafondMontant/.test(returnType)) return "MadPlafondMontant";

  return "Unknown";
}

function extractSqlConstants(source: string): { name: string; value: string }[] {
  const constants: { name: string; value: string }[] = [];
  const constRegex = /public\s+static\s+String\s+(\w+)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = constRegex.exec(source)) !== null) {
    constants.push({ name: m[1], value: m[2] });
  }
  return constants;
}

// ─── Génération du fichier Repository ───────────────────────────────────────

function generateRepositoryFile(
  repo: RepositoryGroup,
  basePackage: string,
  sqlConstants: { name: string; value: string }[]
): string {
  const entityClass = repo.entity;
  const repoName = repo.repositoryName;

  // Déterminer les imports nécessaires
  const imports = new Set<string>();
  imports.add("import org.springframework.stereotype.Repository;");
  imports.add("import org.springframework.jdbc.core.JdbcTemplate;");
  imports.add("import org.springframework.jdbc.core.RowMapper;");
  imports.add("import lombok.RequiredArgsConstructor;");
  imports.add("import lombok.extern.slf4j.Slf4j;");
  imports.add("import java.sql.ResultSet;");
  imports.add("import java.sql.SQLException;");

  // Vérifier si des méthodes retournent des listes
  const hasListReturn = repo.methods.some(m => /^List/.test(m.returnType));
  if (hasListReturn) {
    imports.add("import java.util.List;");
    imports.add("import java.util.ArrayList;");
  }

  // Vérifier si des méthodes retournent Optional
  const hasOptionalReturn = repo.methods.some(m =>
    !m.returnType.startsWith("List") && !m.returnType.startsWith("void") && !m.returnType.startsWith("String") &&
    !m.returnType.startsWith("int") && !m.returnType.startsWith("boolean") && !m.returnType.startsWith("double")
  );

  // Générer les méthodes
  const methodsCode = repo.methods.map(m => generateRepositoryMethod(m, entityClass)).join("\n\n");

  // Générer les constantes SQL utilisées
  const usedConstants = sqlConstants.filter(c =>
    repo.methods.some(m => m.body.includes(c.name))
  );
  const constantsCode = usedConstants.length > 0
    ? usedConstants.map(c => `    private static final String ${c.name} = "${c.value}";`).join("\n") + "\n\n"
    : "";

  return `package ${basePackage}.repository;

${[...imports].sort().join("\n")}

/**
 * ${repoName} — Repository JPA pour l'entité ${entityClass}.
 * Migré depuis HibernateDao (méthodes statiques + Connection → JdbcTemplate).
 *
 * @author Compleo v8.3
 */
@Slf4j
@Repository
@RequiredArgsConstructor
public class ${repoName} {

    private final JdbcTemplate jdbcTemplate;

${constantsCode}${methodsCode}
}
`;
}

function generateRepositoryMethod(method: DaoMethod, entityClass: string): string {
  const params = method.parameters
    .map(p => `${mapToSpringType(p.type)} ${p.name}`)
    .join(", ");

  const returnType = mapToSpringType(method.returnType);
  const methodName = method.name;

  // v10.11: Générer un placeholder LLM au lieu d'un TODO
  // Le post-processeur async remplacera ce placeholder par du code migré via LLM
  const blockId = `DAO_LLM_BLOCK_${entityClass}_${methodName}`;

  // Encoder les métadonnées du bloc JDBC dans des commentaires structurés
  const bodyLines = method.body.split("\n").map(l => l.trim()).filter(l => l.length > 0).slice(0, 30);
  const bodyComment = `        // @@${blockId}@@
        // DAO_JDBC_BODY_START
        // ${bodyLines.join("\n        // ")}
        // DAO_JDBC_BODY_END
        // TABLES: ${method.referencedTables.join(",") || "N/A"}
        // DATASOURCES: ${method.dataSources.join(",") || "default"}
        // RETURN_TYPE: ${returnType}
        // ENTITY: ${entityClass}
        // METHOD: ${methodName}
        log.info("${methodName} appelé — en attente de migration LLM");`;

  return `    /**
     * Migré depuis HibernateDao.${methodName}().
     * Tables: ${method.referencedTables.join(", ") || "N/A"}
     */
    public ${returnType} ${methodName}(${params}) {
${bodyComment}
    }`;
}

function mapToSpringType(type: string): string {
  return type
    .replace(/Connection\s*,?\s*/g, "")
    .replace(/^\s*,\s*/, "")
    .replace(/,\s*$/, "")
    .trim() || "void";
}
