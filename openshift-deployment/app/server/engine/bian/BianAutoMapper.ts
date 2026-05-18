/**
 * BianAutoMapper — Mapping automatique des use cases vers les domaines BIAN v13 via LLM.
 *
 * Stratégie :
 *   1. Envoie au LLM un batch de use cases avec leur contexte métier
 *   2. Le LLM retourne le mapping BIAN structuré (domaine, action, code SD)
 *   3. Fallback sur un dictionnaire statique si le LLM est indisponible
 *
 * Le LLM est bien meilleur qu'un dictionnaire car il comprend le contexte
 * métier, les noms en français/anglais, et les nuances entre domaines BIAN.
 *
 * @since v10.11
 */

import { llmGenerateJSON, isLLMAvailable } from "../ml/llm-adapter";
import type { LLMAdapterConfig } from "../ml/llm-adapter";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface BianMappingResult {
  className: string;
  bianDomain: string;
  bianSdCode: string;
  bianAction: string;
  confidence: number;
  source: "llm" | "dictionary" | "manual";
  reasoning?: string;
}

export interface UseCaseInput {
  className: string;
  packageName: string;
  domain: string;
  useCaseDescription: string;
  javadoc: string;
  httpMethod: string;
  injectedServices: Array<{ type: string; name: string }>;
}

/** Structure JSON retournée par le LLM */
interface LLMBianMapping {
  className: string;
  bianDomain: string;
  bianSdCode: string;
  bianAction: string;
  confidence: number;
  reasoning: string;
}

// ═══════════════════════════════════════════════════════════════════════
// BIAN LLM PROMPT
// ═══════════════════════════════════════════════════════════════════════

function buildBianMappingPrompt(useCases: UseCaseInput[]): string {
  const ucList = useCases.map((uc, i) => {
    const services = uc.injectedServices.map(s => `${s.type} ${s.name}`).join(", ") || "aucun";
    return [
      `  ${i + 1}. className: "${uc.className}"`,
      `     package: "${uc.packageName}"`,
      `     domain: "${uc.domain}"`,
      `     description: "${uc.useCaseDescription}"`,
      `     httpMethod: ${uc.httpMethod}`,
      `     injectedServices: [${services}]`,
      uc.javadoc ? `     javadoc: "${uc.javadoc.slice(0, 200)}"` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return `Tu es un expert en architecture bancaire BIAN (Banking Industry Architecture Network) v13.
Tu dois mapper chaque use case Java legacy vers le domaine BIAN le plus pertinent.

BIAN v13 définit ~300 Service Domains. Voici les principaux domaines bancaires :
- Current Account (SD-CUA) : comptes courants, solde, RIB
- Savings Account (SD-SVA) : épargne, livrets, placements
- Card Administration (SD-CA) : cartes bancaires, activation, blocage, opposition
- Consumer Loan (SD-CL) : crédits consommation, simulation, amortissement
- Mortgage Loan (SD-ML) : crédits immobiliers, hypothèques
- Payment Initiation (SD-PI) : virements, paiements, SEPA, SWIFT
- Cheque Processing (SD-CP) : chèques, chéquiers, compensation, LCN
- Customer Management (SD-CM) : gestion client, KYC, onboarding
- Party Reference Data Directory (SD-PRDD) : bénéficiaires, tiers
- Trade Finance (SD-TF) : commerce international, crédits documentaires
- Corporate Loan (SD-COL) : crédits entreprises, syndication
- Cash Management (SD-CSM) : trésorerie, liquidité, pooling
- Credit Risk Management (SD-CRM) : scoring, notation, risque crédit
- Compliance (SD-CMP) : conformité, LBC-FT, AML, KYC
- Regulatory Reporting (SD-RR) : reporting réglementaire, BAM, ACPR
- Fraud Detection (SD-FD) : détection fraude, alertes
- Currency Exchange (SD-CE) : change, forex, devises
- Market Trading (SD-MT) : trading, bourse, titres
- Document Services (SD-DS) : documents, relevés, attestations
- Customer Contact (SD-CC) : notifications, SMS, email, alertes
- Customer Workstation (SD-CW) : authentification, sessions, OTP
- Branch Operations (SD-BO) : opérations agence, guichet
- Financial Accounting (SD-FA) : comptabilité, écritures, grand livre
- Operational Reporting (SD-OR) : reporting opérationnel, KPI
- Insurance (SD-INS) : assurance, polices, sinistres
- E-Branch Management (SD-EBM) : canaux digitaux, e-banking
- Transaction Processing (SD-TP) : batch, traitements de masse
- Product Directory (SD-PD) : catalogue produits, tarifs
- Guarantee (SD-GR) : garanties, cautions
- Leasing (SD-LS) : crédit-bail, leasing
- Factoring (SD-FC) : affacturage

Les actions BIAN possibles sont :
- Initiate : créer, ouvrir, souscrire, demander
- Execute : exécuter, effectuer, virer, payer, envoyer
- Evaluate : évaluer, simuler, calculer, scorer
- Retrieve : consulter, charger, lire, rechercher, lister
- Update : modifier, mettre à jour, corriger
- Control : bloquer, suspendre, geler, opposition
- Activate : activer, réceptionner, débloquer
- Terminate : clôturer, résilier, supprimer, archiver
- Notify : notifier, alerter, informer
- Report : rapporter, générer, exporter, statistiques

Voici les use cases à mapper :

${ucList}

Retourne un tableau JSON avec pour chaque use case :
{
  "className": "nom exact de la classe",
  "bianDomain": "nom du domaine BIAN en anglais",
  "bianSdCode": "code SD (ex: SD-CUA)",
  "bianAction": "action BIAN (ex: Initiate, Execute, etc.)",
  "confidence": nombre entre 0.5 et 1.0,
  "reasoning": "explication courte en français du choix"
}

IMPORTANT :
- Chaque use case DOIT avoir un mapping (pas de champ vide)
- Utilise le nom de classe, le package, le domaine et la description pour déterminer le mapping
- Si le use case est ambigu, choisis le domaine le plus probable avec une confiance plus basse
- Les noms peuvent être en français ou anglais
- Retourne UNIQUEMENT le tableau JSON, sans texte additionnel`;
}

// ═══════════════════════════════════════════════════════════════════════
// DICTIONNAIRE STATIQUE (FALLBACK)
// ═══════════════════════════════════════════════════════════════════════

interface StaticBianDomain {
  name: string;
  sdCode: string;
  keywords: string[];
  domainMatch: string[];
}

const STATIC_BIAN_DOMAINS: StaticBianDomain[] = [
  { name: "Current Account", sdCode: "SD-CUA", keywords: ["compte", "account", "solde", "balance", "ouvrir", "cloturer", "rib", "iban"], domainMatch: ["compte", "account"] },
  { name: "Savings Account", sdCode: "SD-SVA", keywords: ["epargne", "saving", "livret", "placement", "depot"], domainMatch: ["epargne", "saving"] },
  { name: "Card Administration", sdCode: "SD-CA", keywords: ["carte", "card", "activer", "bloquer", "opposition", "receptionner", "pin", "plafond"], domainMatch: ["carte", "card"] },
  { name: "Consumer Loan", sdCode: "SD-CL", keywords: ["credit", "loan", "pret", "simuler", "simulation", "amortissement", "echeance"], domainMatch: ["credit", "loan", "pret"] },
  { name: "Payment Initiation", sdCode: "SD-PI", keywords: ["virement", "transfer", "paiement", "payment", "sepa", "swift"], domainMatch: ["virement", "paiement", "payment", "transfer"] },
  { name: "Cheque Processing", sdCode: "SD-CP", keywords: ["cheque", "check", "chequier", "carnet", "encaissement", "compensation", "lcn"], domainMatch: ["cheque", "check", "chequier"] },
  { name: "Customer Management", sdCode: "SD-CM", keywords: ["client", "customer", "prospect", "kyc", "profil", "onboarding"], domainMatch: ["client", "customer", "prospect"] },
  { name: "Party Reference Data Directory", sdCode: "SD-PRDD", keywords: ["beneficiaire", "beneficiary", "tiers", "destinataire"], domainMatch: ["beneficiaire", "beneficiary", "tiers"] },
  { name: "Trade Finance", sdCode: "SD-TF", keywords: ["trade", "commerce", "import", "export", "credoc"], domainMatch: ["trade", "commerce"] },
  { name: "Credit Risk Management", sdCode: "SD-CRM", keywords: ["risque", "risk", "scoring", "notation", "rating", "provision"], domainMatch: ["risque", "risk", "scoring"] },
  { name: "Compliance", sdCode: "SD-CMP", keywords: ["compliance", "conformite", "lbc", "aml", "kyc", "embargo", "sanction"], domainMatch: ["compliance", "conformite", "lbc"] },
  { name: "Currency Exchange", sdCode: "SD-CE", keywords: ["devise", "currency", "change", "forex", "conversion", "cotation"], domainMatch: ["devise", "currency", "change", "forex"] },
  { name: "Document Services", sdCode: "SD-DS", keywords: ["document", "pdf", "releve", "attestation", "generer", "edition"], domainMatch: ["document", "pdf", "releve"] },
  { name: "Customer Contact", sdCode: "SD-CC", keywords: ["notification", "sms", "email", "alerte", "envoyer", "push"], domainMatch: ["notification", "sms", "email", "alerte"] },
  { name: "Customer Workstation", sdCode: "SD-CW", keywords: ["session", "connexion", "login", "auth", "token", "authentification"], domainMatch: ["session", "connexion", "login", "auth"] },
  { name: "Branch Operations", sdCode: "SD-BO", keywords: ["agence", "branch", "guichet", "caisse", "operateur"], domainMatch: ["agence", "branch", "guichet"] },
  { name: "Financial Accounting", sdCode: "SD-FA", keywords: ["comptabilite", "accounting", "ecriture", "journal", "mouvement"], domainMatch: ["comptabilite", "accounting", "mouvement"] },
  { name: "Operational Reporting", sdCode: "SD-OR", keywords: ["reporting", "rapport", "statistique", "dashboard", "kpi"], domainMatch: ["reporting", "rapport", "statistique"] },
  { name: "Insurance", sdCode: "SD-INS", keywords: ["assurance", "insurance", "police", "sinistre", "prime"], domainMatch: ["assurance", "insurance"] },
  { name: "Transaction Processing", sdCode: "SD-TP", keywords: ["batch", "job", "scheduler", "traitement", "nuit"], domainMatch: ["batch", "job", "scheduler"] },
  { name: "Fraud Detection", sdCode: "SD-FD", keywords: ["fraude", "fraud", "suspicion", "anomalie", "detection"], domainMatch: ["fraude", "fraud"] },
  { name: "Mortgage Loan", sdCode: "SD-ML", keywords: ["hypotheque", "mortgage", "immobilier", "logement"], domainMatch: ["hypotheque", "mortgage", "immobilier"] },
  { name: "Guarantee", sdCode: "SD-GR", keywords: ["garantie", "guarantee", "caution", "aval"], domainMatch: ["garantie", "guarantee", "caution"] },
  { name: "Product Directory", sdCode: "SD-PD", keywords: ["produit", "product", "catalogue", "offre", "tarif"], domainMatch: ["produit", "product", "catalogue"] },
  { name: "E-Branch Management", sdCode: "SD-EBM", keywords: ["ebanking", "digital", "mobile", "web", "canal"], domainMatch: ["ebanking", "digital", "mobile"] },
  { name: "Cash Management", sdCode: "SD-CSM", keywords: ["tresorerie", "cash", "liquidite", "pooling"], domainMatch: ["tresorerie", "cash"] },
  { name: "Regulatory Reporting", sdCode: "SD-RR", keywords: ["regulatoire", "regulatory", "bam", "acpr", "bale"], domainMatch: ["regulatoire", "regulatory"] },
  { name: "Market Trading", sdCode: "SD-MT", keywords: ["trading", "marche", "bourse", "titre", "opcvm"], domainMatch: ["trading", "marche", "bourse"] },
  { name: "Leasing", sdCode: "SD-LS", keywords: ["leasing", "location", "lld", "loa"], domainMatch: ["leasing", "location"] },
  { name: "Factoring", sdCode: "SD-FC", keywords: ["affacturage", "factoring", "cession", "creance"], domainMatch: ["affacturage", "factoring"] },
];

const STATIC_BIAN_ACTIONS: Array<{ action: string; keywords: string[] }> = [
  { action: "Initiate", keywords: ["creer", "create", "ouvrir", "open", "initier", "nouveau", "souscrire", "demander", "commander"] },
  { action: "Execute", keywords: ["executer", "execute", "effectuer", "lancer", "traiter", "virer", "payer", "envoyer", "valider"] },
  { action: "Evaluate", keywords: ["evaluer", "evaluate", "simuler", "calculer", "scorer", "noter", "estimer", "verifier"] },
  { action: "Retrieve", keywords: ["consulter", "consult", "charger", "load", "lire", "obtenir", "get", "rechercher", "lister", "afficher"] },
  { action: "Update", keywords: ["modifier", "modify", "maj", "update", "changer", "editer", "corriger"] },
  { action: "Control", keywords: ["bloquer", "block", "suspendre", "geler", "opposition", "desactiver", "annuler"] },
  { action: "Activate", keywords: ["activer", "activate", "receptionner", "debloquer", "reactiver"] },
  { action: "Terminate", keywords: ["cloturer", "close", "terminer", "resilier", "supprimer", "archiver"] },
  { action: "Notify", keywords: ["notifier", "notify", "alerter", "informer", "prevenir"] },
  { action: "Report", keywords: ["rapporter", "report", "generer", "generate", "exporter", "statistique"] },
];

// ═══════════════════════════════════════════════════════════════════════
// BIAN AUTO-MAPPER CLASS
// ═══════════════════════════════════════════════════════════════════════

export class BianAutoMapper {
  private llmConfig?: LLMAdapterConfig;

  constructor(llmConfig?: LLMAdapterConfig) {
    this.llmConfig = llmConfig;
  }

  /**
   * Mappe automatiquement une liste de use cases vers les domaines BIAN.
   * Utilise le LLM en priorité, avec fallback sur le dictionnaire statique.
   */
  async mapUseCases(useCases: UseCaseInput[]): Promise<{
    results: BianMappingResult[];
    mappedCount: number;
    source: "llm" | "dictionary";
  }> {
    if (useCases.length === 0) {
      return { results: [], mappedCount: 0, source: "dictionary" };
    }

    // 1. Essayer le LLM
    try {
      const llmAvailable = await isLLMAvailable();
      if (llmAvailable) {
        const llmResults = await this.mapViaLLM(useCases);
        if (llmResults && llmResults.length > 0) {
          const mappedCount = llmResults.filter(r => r.bianDomain && r.bianDomain.trim() !== "").length;
          console.log(`[BianAutoMapper] LLM mapping: ${mappedCount}/${useCases.length} use cases mappés`);
          return { results: llmResults, mappedCount, source: "llm" };
        }
      }
    } catch (err) {
      console.warn("[BianAutoMapper] LLM mapping failed, falling back to dictionary:", err);
    }

    // 2. Fallback sur le dictionnaire statique
    const dictResults = this.mapViaDictionary(useCases);
    const mappedCount = dictResults.filter(r => r.bianDomain && r.bianDomain.trim() !== "").length;
    console.log(`[BianAutoMapper] Dictionary fallback: ${mappedCount}/${useCases.length} use cases mappés`);
    return { results: dictResults, mappedCount, source: "dictionary" };
  }

  /**
   * Mapping via LLM — envoie un batch de use cases au LLM.
   * Le LLM retourne un tableau JSON structuré.
   */
  private async mapViaLLM(useCases: UseCaseInput[]): Promise<BianMappingResult[] | null> {
    // Limiter à 30 use cases par batch pour éviter les prompts trop longs
    const BATCH_SIZE = 30;
    const allResults: BianMappingResult[] = [];

    for (let i = 0; i < useCases.length; i += BATCH_SIZE) {
      const batch = useCases.slice(i, i + BATCH_SIZE);
      const prompt = buildBianMappingPrompt(batch);

      const llmResult = await llmGenerateJSON<LLMBianMapping[]>(
        prompt,
        { temperature: 0.2, maxTokens: 4000 },
        this.llmConfig,
      );

      if (!llmResult || !Array.isArray(llmResult)) {
        console.warn(`[BianAutoMapper] LLM returned invalid result for batch ${i / BATCH_SIZE + 1}`);
        return null;
      }

      // Mapper les résultats LLM vers nos types
      for (const uc of batch) {
        const llmMapping = llmResult.find(
          m => m.className === uc.className ||
               m.className === uc.className.replace(/_/g, "")
        );

        if (llmMapping && llmMapping.bianDomain) {
          allResults.push({
            className: uc.className,
            bianDomain: llmMapping.bianDomain,
            bianSdCode: llmMapping.bianSdCode || "",
            bianAction: llmMapping.bianAction || "Execute",
            confidence: typeof llmMapping.confidence === "number" ? llmMapping.confidence : 0.7,
            source: "llm",
            reasoning: llmMapping.reasoning || "",
          });
        } else {
          // Le LLM n'a pas mappé ce use case — fallback dictionnaire pour celui-ci
          const dictResult = this.mapSingleViaDictionary(uc);
          allResults.push(dictResult);
        }
      }
    }

    return allResults;
  }

  /**
   * Mapping via dictionnaire statique — fallback si LLM indisponible.
   */
  private mapViaDictionary(useCases: UseCaseInput[]): BianMappingResult[] {
    return useCases.map(uc => this.mapSingleViaDictionary(uc));
  }

  /**
   * Mappe un seul use case via le dictionnaire statique.
   */
  private mapSingleViaDictionary(uc: UseCaseInput): BianMappingResult {
    const className = uc.className.toLowerCase()
      .replace(/_/g, "")
      .replace(/uc$/, "")
      .replace(/ejb$/, "")
      .replace(/bean$/, "")
      .replace(/service$/, "")
      .replace(/impl$/, "")
      .replace(/local$/, "");

    // 1. Chercher par domaine métier détecté
    for (const sd of STATIC_BIAN_DOMAINS) {
      for (const dm of sd.domainMatch) {
        if (uc.domain.toLowerCase() === dm) {
          return {
            className: uc.className,
            bianDomain: sd.name,
            bianSdCode: sd.sdCode,
            bianAction: this.detectActionStatic(className),
            confidence: 0.75,
            source: "dictionary",
          };
        }
      }
    }

    // 2. Chercher par mots-clés dans le nom de classe
    let bestDomain: StaticBianDomain | null = null;
    let bestScore = 0;
    for (const sd of STATIC_BIAN_DOMAINS) {
      let score = 0;
      for (const kw of sd.keywords) {
        if (className.includes(kw.replace(/_/g, ""))) {
          score += kw.length / className.length + 0.3;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestDomain = sd;
      }
    }

    if (bestDomain && bestScore > 0.15) {
      return {
        className: uc.className,
        bianDomain: bestDomain.name,
        bianSdCode: bestDomain.sdCode,
        bianAction: this.detectActionStatic(className),
        confidence: Math.min(bestScore + 0.2, 0.7),
        source: "dictionary",
      };
    }

    // 3. Chercher par package
    const pkg = uc.packageName.toLowerCase();
    for (const sd of STATIC_BIAN_DOMAINS) {
      for (const dm of sd.domainMatch) {
        if (pkg.includes(`.${dm}.`) || pkg.endsWith(`.${dm}`)) {
          return {
            className: uc.className,
            bianDomain: sd.name,
            bianSdCode: sd.sdCode,
            bianAction: this.detectActionStatic(className),
            confidence: 0.6,
            source: "dictionary",
          };
        }
      }
    }

    // 4. Fallback — domaine générique basé sur le domaine détecté
    return {
      className: uc.className,
      bianDomain: this.inferGenericBianDomain(uc.domain),
      bianSdCode: "",
      bianAction: this.detectActionStatic(className),
      confidence: 0.4,
      source: "dictionary",
    };
  }

  /**
   * Détecte l'action BIAN via le dictionnaire statique.
   */
  private detectActionStatic(className: string): string {
    for (const ap of STATIC_BIAN_ACTIONS) {
      for (const kw of ap.keywords) {
        if (className.includes(kw.replace(/_/g, ""))) {
          return ap.action;
        }
      }
    }
    return "Execute";
  }

  /**
   * Infère un domaine BIAN générique à partir du domaine métier détecté.
   */
  private inferGenericBianDomain(domain: string): string {
    if (!domain || domain === "general") return "Transaction Processing";
    // Capitaliser le domaine
    return domain.charAt(0).toUpperCase() + domain.slice(1) + " Management";
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Applique le mapping BIAN automatique (LLM + fallback dictionnaire) sur les use cases.
 * Modifie les use cases en place (bianDomain, bianAction).
 * Retourne les résultats détaillés.
 */
export async function applyBianAutoMapping(
  useCases: Array<{
    className: string;
    packageName: string;
    domain: string;
    bianDomain: string;
    bianAction: string;
    useCaseDescription: string;
    javadoc: string;
    httpMethod: string;
    injectedServices: Array<{ type: string; name: string }>;
  }>,
  llmConfig?: LLMAdapterConfig,
): Promise<{
  mappedCount: number;
  results: BianMappingResult[];
  source: "llm" | "dictionary";
}> {
  // Séparer les use cases déjà mappés manuellement
  const alreadyMapped = useCases.filter(uc => uc.bianDomain && uc.bianDomain.trim() !== "");
  const toMap = useCases.filter(uc => !uc.bianDomain || uc.bianDomain.trim() === "");

  const manualResults: BianMappingResult[] = alreadyMapped.map(uc => ({
    className: uc.className,
    bianDomain: uc.bianDomain,
    bianSdCode: "",
    bianAction: uc.bianAction,
    confidence: 1.0,
    source: "manual" as const,
  }));

  if (toMap.length === 0) {
    return {
      mappedCount: alreadyMapped.length,
      results: manualResults,
      source: "dictionary",
    };
  }

  // Mapper les use cases non mappés via LLM + fallback
  const mapper = new BianAutoMapper(llmConfig);
  const { results: autoResults, mappedCount: autoMapped, source } = await mapper.mapUseCases(toMap);

  // Appliquer les résultats sur les use cases (mutation en place)
  for (const result of autoResults) {
    if (result.bianDomain) {
      const uc = useCases.find(u => u.className === result.className);
      if (uc) {
        uc.bianDomain = result.bianDomain;
        uc.bianAction = result.bianAction;
      }
    }
  }

  return {
    mappedCount: alreadyMapped.length + autoMapped,
    results: [...manualResults, ...autoResults],
    source,
  };
}
