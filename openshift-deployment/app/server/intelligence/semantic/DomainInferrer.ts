/**
 * DomainInferrer — Identifie le domaine métier bancaire d'une classe.
 * Score par comptage de mots-clés pondérés dans className, packageName,
 * fieldNames, methodNames, javadoc, body, imports.
 * 100% déterministe, 0 LLM.
 *
 * @author Compleo
 */

export type BankingDomain =
  | "CARTE_BANCAIRE"
  | "VIREMENT"
  | "CREDIT"
  | "CLIENT"
  | "COMPTE"
  | "DOCUMENT"
  | "NOTIFICATION"
  | "ASSURANCE"
  | "AUTHENTICATION"
  | "UNKNOWN";

export interface DomainInference {
  domain: BankingDomain;
  confidence: number;
  score: number;
  scores: Record<BankingDomain, number>;
  matchedKeywords: string[];
}

interface DomainVocabulary {
  domain: BankingDomain;
  weight: number;
  keywords: string[];
}

// ── Vocabulaire complet par domaine ────────────────────────────

const DOMAIN_VOCABULARIES: DomainVocabulary[] = [
  {
    domain: "CARTE_BANCAIRE",
    weight: 1.0,
    keywords: [
      "carte", "card", "activer", "bloquer", "opposition",
      "numCarte", "cardNumber", "pan", "cvv", "cvc", "pin",
      "codePin", "plafond", "retrait", "paiement", "activation",
      "desactivation", "renouvellement",
      "visa", "mastercard", "cb", "bancaire",
      "CART01", "CART02", "CART03", "CART04", "CART05",
      "CarteDto", "StatutCarte", "TypeCarte", "MotifBlocage",
      "ActiverCarte", "BloquerCarte", "ReceptionnerCarte",
    ],
  },
  {
    domain: "VIREMENT",
    weight: 1.0,
    keywords: [
      "virement", "transfer", "virer", "initier", "valider",
      "annuler", "rib", "iban", "bban", "donneur", "beneficiaire",
      "debiteur", "crediteur", "compteDonneur", "compteBeneficiaire",
      "montant", "devise", "libelle", "motif", "reference",
      "VIR01", "VIR02", "VIR03", "dateValeur", "dateExecution",
      "StatutVirement", "TypeVirement", "virementUC",
    ],
  },
  {
    domain: "CREDIT",
    weight: 1.0,
    keywords: [
      "credit", "pret", "loan", "simuler", "simulation",
      "mensualite", "taux", "tauxAnnuel", "taeg", "taea",
      "duree", "capital", "amortissement", "echeance",
      "scoring", "garantie", "hypotheque", "caution",
      "CRD01", "CRD02", "CRD03", "dossierCredit", "offreCredit",
      "coutTotal", "fraisDossier", "assuranceCredit",
    ],
  },
  {
    domain: "CLIENT",
    weight: 1.0,
    keywords: [
      "client", "customer", "tiers", "personne", "individu",
      "kyc", "kycClient", "identite", "cin", "cni", "passport",
      "adresse", "telephone", "email", "nationalite",
      "dateNaissance", "lieuNaissance", "civilite",
      "onboarding", "ouvertureCompte", "cloture",
      "chargerClient", "majClient", "ClientData",
    ],
  },
  {
    domain: "COMPTE",
    weight: 1.0,
    keywords: [
      "compte", "account", "solde", "balance", "encours",
      "extrait", "releve", "operation", "mouvement",
      "debit", "credit", "ecriture", "journal",
      "CPT01", "CPT02", "CPT03", "numCompte", "codeAgence",
      "blocageCompte", "deblocage", "typeCompte",
    ],
  },
  {
    domain: "DOCUMENT",
    weight: 0.9,
    keywords: [
      "document", "fichier", "pdf", "generer", "editer",
      "template", "modele", "attestation", "courrier",
      "releve", "justificatif", "GenererDocument",
    ],
  },
  {
    domain: "NOTIFICATION",
    weight: 0.9,
    keywords: [
      "notification", "sms", "email", "alerte", "message",
      "envoyer", "notifier", "push", "EnvoyerNotification",
      "destinataire", "contenu", "canal",
    ],
  },
  {
    domain: "ASSURANCE",
    weight: 1.0,
    keywords: [
      "contrat", "police", "sinistre", "prime", "cotisation",
      "beneficiaire", "souscripteur", "garantie", "avenant",
      "resiliation", "rachat", "versement", "valeurContrat",
      "dateEffet", "dateEcheance", "typeContrat",
    ],
  },
  {
    domain: "AUTHENTICATION",
    weight: 0.8,
    keywords: [
      "auth", "login", "logout", "password", "motDePasse",
      "token", "session", "connexion", "deconnexion",
      "otp", "codeOtp", "verification", "authentification",
    ],
  },
];

// ── Poids par zone de texte ────────────────────────────────────

const ZONE_WEIGHTS = {
  className: 2.0,
  packageName: 2.0,
  methodNames: 1.5,
  fieldNames: 1.0,
  body: 0.5,
  javadoc: 0.5,
  imports: 0.3,
};

// ── DomainInferrer ─────────────────────────────────────────────

export interface ClassDomainContext {
  className: string;
  packageName: string;
  fieldNames: string[];
  methodNames: string[];
  body: string;
  javadoc: string;
  imports: string[];
}

export class DomainInferrer {
  /**
   * Infère le domaine métier d'une classe.
   */
  inferDomain(ctx: ClassDomainContext): DomainInference {
    const scores: Record<string, number> = {};
    const matchedKeywords: string[] = [];

    for (const vocab of DOMAIN_VOCABULARIES) {
      let domainScore = 0;

      for (const keyword of vocab.keywords) {
        const kw = keyword.toLowerCase();

        // className (poids 2.0)
        if (ctx.className.toLowerCase().includes(kw)) {
          domainScore += ZONE_WEIGHTS.className * vocab.weight;
          matchedKeywords.push(`${keyword} (className)`);
        }

        // packageName (poids 2.0)
        if (ctx.packageName.toLowerCase().includes(kw)) {
          domainScore += ZONE_WEIGHTS.packageName * vocab.weight;
          matchedKeywords.push(`${keyword} (packageName)`);
        }

        // methodNames (poids 1.5)
        for (const mn of ctx.methodNames) {
          if (mn.toLowerCase().includes(kw)) {
            domainScore += ZONE_WEIGHTS.methodNames * vocab.weight;
            matchedKeywords.push(`${keyword} (method: ${mn})`);
          }
        }

        // fieldNames (poids 1.0)
        for (const fn of ctx.fieldNames) {
          if (fn.toLowerCase().includes(kw)) {
            domainScore += ZONE_WEIGHTS.fieldNames * vocab.weight;
            matchedKeywords.push(`${keyword} (field: ${fn})`);
          }
        }

        // body (poids 0.5)
        if (ctx.body.toLowerCase().includes(kw)) {
          domainScore += ZONE_WEIGHTS.body * vocab.weight;
          matchedKeywords.push(`${keyword} (body)`);
        }

        // javadoc (poids 0.5)
        if (ctx.javadoc.toLowerCase().includes(kw)) {
          domainScore += ZONE_WEIGHTS.javadoc * vocab.weight;
          matchedKeywords.push(`${keyword} (javadoc)`);
        }

        // imports (poids 0.3)
        for (const imp of ctx.imports) {
          if (imp.toLowerCase().includes(kw)) {
            domainScore += ZONE_WEIGHTS.imports * vocab.weight;
            matchedKeywords.push(`${keyword} (import: ${imp})`);
          }
        }
      }

      scores[vocab.domain] = domainScore;
    }

    // Trouver le domaine avec le meilleur score
    let bestDomain: BankingDomain = "UNKNOWN";
    let bestScore = 0;

    for (const [domain, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestDomain = domain as BankingDomain;
      }
    }

    // Calculer la confiance
    let confidence = 0;
    if (bestScore >= 3) {
      confidence = Math.min(0.95, 0.8 + bestScore * 0.01);
    } else if (bestScore >= 1) {
      confidence = 0.5 + (bestScore - 1) * 0.15;
    } else {
      bestDomain = "UNKNOWN";
      confidence = 0;
    }

    // Construire le record complet des scores
    const allScores: Record<BankingDomain, number> = {
      CARTE_BANCAIRE: 0, VIREMENT: 0, CREDIT: 0, CLIENT: 0,
      COMPTE: 0, DOCUMENT: 0, NOTIFICATION: 0, ASSURANCE: 0,
      AUTHENTICATION: 0, UNKNOWN: 0,
    };
    for (const [d, s] of Object.entries(scores)) {
      allScores[d as BankingDomain] = s;
    }

    return {
      domain: bestDomain,
      confidence,
      score: bestScore,
      scores: allScores,
      matchedKeywords: [...new Set(matchedKeywords)],
    };
  }

  /**
   * Infère les domaines pour un ensemble de classes.
   */
  inferDomains(contexts: ClassDomainContext[]): Map<string, DomainInference> {
    const results = new Map<string, DomainInference>();
    for (const ctx of contexts) {
      results.set(ctx.className, this.inferDomain(ctx));
    }
    return results;
  }

  /**
   * URL mapping par domaine.
   */
  static getUrlSegment(domain: BankingDomain): string {
    const mapping: Record<BankingDomain, string> = {
      CARTE_BANCAIRE: "cartes",
      VIREMENT: "virements",
      CREDIT: "credits",
      CLIENT: "clients",
      COMPTE: "comptes",
      DOCUMENT: "documents",
      NOTIFICATION: "notifications",
      ASSURANCE: "contrats-assurance",
      AUTHENTICATION: "auth",
      UNKNOWN: "resources",
    };
    return mapping[domain];
  }
}
