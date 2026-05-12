/**
 * IndustryStandardMapper — Mapping LLM multi-standards (BIAN, ACORD, HL7/FHIR, TMForum, DDD, TOGAF).
 *
 * Stratégie :
 *   1. L'utilisateur coche un standard dans l'IHM (options dynamiques)
 *   2. Si coché → on envoie les use cases au LLM avec le prompt du standard choisi
 *   3. Le LLM retourne le mapping structuré (domaine, action, code)
 *   4. Fallback sur dictionnaire statique si LLM indisponible
 *   5. Si non coché → on garde les noms originaux du code legacy
 *
 * @since v10.12
 */

import { llmGenerateJSON, isLLMAvailable } from "../ml/llm-adapter";
import type { LLMAdapterConfig } from "../ml/llm-adapter";
import type { IndustryStandard } from "../frontend/DynamicOptionsResolver";

// Re-export BianAutoMapper for backward compatibility
export { BianAutoMapper, applyBianAutoMapping } from "./BianAutoMapper";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface StandardMappingResult {
  className: string;
  standardDomain: string;
  standardCode: string;
  standardAction: string;
  confidence: number;
  source: "llm" | "dictionary" | "manual";
  reasoning?: string;
  standard: IndustryStandard;
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
interface LLMStandardMapping {
  className: string;
  standardDomain: string;
  standardCode: string;
  standardAction: string;
  confidence: number;
  reasoning: string;
}

// ═══════════════════════════════════════════════════════════════════════
// PROMPTS PAR STANDARD
// ═══════════════════════════════════════════════════════════════════════

function buildUseCaseList(useCases: UseCaseInput[]): string {
  return useCases.map((uc, i) => {
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
}

const STANDARD_PROMPTS: Record<Exclude<IndustryStandard, "NONE">, (ucList: string) => string> = {
  BIAN: (ucList) => `Tu es un expert en architecture bancaire BIAN (Banking Industry Architecture Network) v13.
Tu dois mapper chaque use case Java legacy vers le domaine BIAN le plus pertinent.

BIAN v13 définit ~300 Service Domains. Voici les principaux :
- Current Account (SD-CUA), Savings Account (SD-SVA), Card Administration (SD-CA)
- Consumer Loan (SD-CL), Mortgage Loan (SD-ML), Payment Initiation (SD-PI)
- Cheque Processing (SD-CP), Customer Management (SD-CM), Party Reference Data Directory (SD-PRDD)
- Trade Finance (SD-TF), Corporate Loan (SD-COL), Cash Management (SD-CSM)
- Credit Risk Management (SD-CRM), Compliance (SD-CMP), Regulatory Reporting (SD-RR)
- Fraud Detection (SD-FD), Currency Exchange (SD-CE), Market Trading (SD-MT)
- Document Services (SD-DS), Customer Contact (SD-CC), Customer Workstation (SD-CW)
- Branch Operations (SD-BO), Financial Accounting (SD-FA), Operational Reporting (SD-OR)
- Insurance (SD-INS), E-Branch Management (SD-EBM), Transaction Processing (SD-TP)
- Product Directory (SD-PD), Guarantee (SD-GR), Leasing (SD-LS), Factoring (SD-FC)

Actions BIAN : Initiate, Execute, Evaluate, Retrieve, Update, Control, Activate, Terminate, Notify, Report

${ucList}

Retourne un tableau JSON :
[{ "className": "...", "standardDomain": "...", "standardCode": "SD-XXX", "standardAction": "...", "confidence": 0.5-1.0, "reasoning": "..." }]
Chaque use case DOIT avoir un mapping. Retourne UNIQUEMENT le JSON.`,

  ACORD: (ucList) => `Tu es un expert en architecture assurance ACORD (Association for Cooperative Operations Research and Development).
Tu dois mapper chaque use case Java legacy vers le domaine ACORD le plus pertinent.

Domaines ACORD principaux :
- Policy Administration (POL) : gestion des polices, contrats, avenants
- Claims Management (CLM) : sinistres, déclarations, indemnisations, expertises
- Underwriting (UW) : souscription, tarification, évaluation des risques
- Billing & Collections (BIL) : facturation, primes, encaissements, quittances
- Reinsurance (RE) : réassurance, traités, cessions
- Party Management (PTY) : assurés, bénéficiaires, courtiers, agents
- Product Management (PRD) : catalogue produits, garanties, options
- Document Management (DOC) : documents, attestations, relevés
- Compliance & Regulatory (CMP) : conformité, Solvabilité II, reporting
- Risk Assessment (RSK) : évaluation des risques, scoring, actuariat
- Commission Management (COM) : commissions, rétrocessions
- Customer Service (CS) : service client, réclamations, assistance
- Analytics & Reporting (RPT) : tableaux de bord, KPI, statistiques

Actions ACORD : Create, Submit, Evaluate, Process, Retrieve, Update, Cancel, Renew, Endorse, Notify

${ucList}

Retourne un tableau JSON :
[{ "className": "...", "standardDomain": "...", "standardCode": "ACORD-XXX", "standardAction": "...", "confidence": 0.5-1.0, "reasoning": "..." }]
Chaque use case DOIT avoir un mapping. Retourne UNIQUEMENT le JSON.`,

  HL7_FHIR: (ucList) => `Tu es un expert en interopérabilité santé HL7 FHIR (Fast Healthcare Interoperability Resources) R4.
Tu dois mapper chaque use case Java legacy vers la ressource FHIR la plus pertinente.

Ressources FHIR principales :
- Patient (PAT) : données patient, identité, démographie
- Practitioner (PRC) : médecins, soignants, professionnels de santé
- Encounter (ENC) : consultations, hospitalisations, passages aux urgences
- Condition (CND) : diagnostics, pathologies, problèmes de santé
- Observation (OBS) : résultats de laboratoire, signes vitaux, mesures
- MedicationRequest (MRQ) : prescriptions, ordonnances
- Medication (MED) : médicaments, posologies
- Procedure (PRO) : actes médicaux, interventions chirurgicales
- DiagnosticReport (DGR) : comptes rendus, résultats d'examens
- Appointment (APT) : rendez-vous, planification
- AllergyIntolerance (ALG) : allergies, intolérances
- Immunization (IMM) : vaccinations
- Coverage (COV) : couverture assurance maladie, mutuelle
- Claim (CLM) : facturation, remboursements
- Organization (ORG) : établissements, services, unités
- Location (LOC) : lieux de soins, chambres, blocs
- DocumentReference (DOC) : documents médicaux, CDA, PDF
- ServiceRequest (SRQ) : demandes d'examens, prescriptions d'actes

Actions FHIR : Create, Read, Update, Delete, Search, Validate, Submit, Process

${ucList}

Retourne un tableau JSON :
[{ "className": "...", "standardDomain": "...", "standardCode": "FHIR-XXX", "standardAction": "...", "confidence": 0.5-1.0, "reasoning": "..." }]
Chaque use case DOIT avoir un mapping. Retourne UNIQUEMENT le JSON.`,

  TMFORUM: (ucList) => `Tu es un expert en architecture télécom TMForum (TM Forum Open APIs / eTOM / SID).
Tu dois mapper chaque use case Java legacy vers le domaine TMForum le plus pertinent.

Domaines TMForum / eTOM principaux :
- Product Catalog Management (TMF620) : catalogue produits, offres, forfaits
- Product Ordering (TMF622) : commandes, souscriptions, activations
- Customer Management (TMF629) : gestion clients, comptes, profils
- Service Inventory (TMF638) : inventaire services, instances
- Resource Inventory (TMF639) : inventaire réseau, équipements
- Billing Management (TMF678) : facturation, factures, paiements
- Usage Management (TMF635) : consommation, CDR, données d'usage
- Trouble Ticket (TMF621) : incidents, tickets, réclamations
- SLA Management (TMF623) : niveaux de service, SLA, QoS
- Network Function (TMF640) : fonctions réseau, provisioning
- Party Management (TMF632) : tiers, partenaires, fournisseurs
- Geographic Address (TMF673) : adresses, couverture, zones
- Communication (TMF681) : notifications, SMS, email, push
- Payment Management (TMF676) : paiements, encaissements
- Loyalty Management (TMF658) : fidélité, points, récompenses
- Agreement Management (TMF651) : contrats, accords
- Service Qualification (TMF645) : éligibilité, qualification technique

Actions TMForum : Create, Retrieve, Update, Delete, Activate, Deactivate, Suspend, Resume, Notify

${ucList}

Retourne un tableau JSON :
[{ "className": "...", "standardDomain": "...", "standardCode": "TMF-XXX", "standardAction": "...", "confidence": 0.5-1.0, "reasoning": "..." }]
Chaque use case DOIT avoir un mapping. Retourne UNIQUEMENT le JSON.`,

  DDD: (ucList) => `Tu es un expert en Domain-Driven Design (DDD) appliqué au e-commerce et retail.
Tu dois mapper chaque use case Java legacy vers l'agrégat/bounded context DDD le plus pertinent.

Bounded Contexts DDD e-commerce principaux :
- Product Catalog (BC-CAT) : produits, catégories, attributs, variantes
- Shopping Cart (BC-CART) : panier, ajout/suppression articles, calcul total
- Order Management (BC-ORD) : commandes, statuts, historique
- Payment Processing (BC-PAY) : paiements, transactions, remboursements
- Inventory Management (BC-INV) : stock, réservations, réapprovisionnement
- Shipping & Delivery (BC-SHIP) : expédition, suivi, livraison
- Customer Identity (BC-CID) : comptes clients, authentification, profils
- Pricing & Promotions (BC-PRICE) : tarification, remises, coupons, soldes
- Review & Rating (BC-REV) : avis, notes, commentaires
- Recommendation (BC-REC) : suggestions, personnalisation
- Notification (BC-NOTIF) : emails, SMS, push, alertes
- Warehouse (BC-WH) : entrepôt, picking, packing
- Returns & Refunds (BC-RET) : retours, échanges, remboursements
- Analytics (BC-ANA) : tableaux de bord, KPI, rapports
- Content Management (BC-CMS) : pages, médias, SEO

Actions DDD : Create, Execute, Query, Update, Delete, Publish, Archive, Validate

${ucList}

Retourne un tableau JSON :
[{ "className": "...", "standardDomain": "...", "standardCode": "BC-XXX", "standardAction": "...", "confidence": 0.5-1.0, "reasoning": "..." }]
Chaque use case DOIT avoir un mapping. Retourne UNIQUEMENT le JSON.`,

  TOGAF: (ucList) => `Tu es un expert en architecture d'entreprise TOGAF (The Open Group Architecture Framework).
Tu dois mapper chaque use case Java legacy vers le building block TOGAF le plus pertinent.

Building Blocks TOGAF principaux :
- Business Process Management (BB-BPM) : workflows, processus métier, orchestration
- Enterprise Integration (BB-EAI) : intégration, ESB, middleware, connecteurs
- Identity & Access Management (BB-IAM) : authentification, autorisation, SSO, LDAP
- Document Management (BB-DMS) : GED, documents, archivage, versioning
- Notification Services (BB-NS) : notifications, alertes, messaging
- Audit & Compliance (BB-AUD) : audit trail, conformité, traçabilité
- Reporting & Analytics (BB-RPT) : reporting, BI, tableaux de bord, KPI
- Master Data Management (BB-MDM) : référentiels, données maîtres, synchronisation
- Workflow Engine (BB-WF) : moteur de workflow, approbations, circuits
- Scheduling & Batch (BB-SCH) : planification, jobs batch, ordonnancement
- Configuration Management (BB-CFG) : paramétrage, configuration, feature flags
- User Interface (BB-UI) : portails, interfaces utilisateur, front-end
- API Gateway (BB-API) : API management, gateway, rate limiting
- Data Persistence (BB-DB) : accès données, repositories, cache
- External Integration (BB-EXT) : partenaires, APIs externes, fichiers

Actions TOGAF : Create, Process, Manage, Monitor, Configure, Integrate, Report, Archive

${ucList}

Retourne un tableau JSON :
[{ "className": "...", "standardDomain": "...", "standardCode": "BB-XXX", "standardAction": "...", "confidence": 0.5-1.0, "reasoning": "..." }]
Chaque use case DOIT avoir un mapping. Retourne UNIQUEMENT le JSON.`,
};

// ═══════════════════════════════════════════════════════════════════════
// DICTIONNAIRES STATIQUES (FALLBACK PAR STANDARD)
// ═══════════════════════════════════════════════════════════════════════

interface StaticDomain {
  name: string;
  code: string;
  keywords: string[];
}

const STATIC_DOMAINS: Record<Exclude<IndustryStandard, "NONE">, StaticDomain[]> = {
  BIAN: [
    { name: "Current Account", code: "SD-CUA", keywords: ["compte", "account", "solde", "balance", "rib", "iban", "courant", "epargne", "livret"] },
    { name: "Card Administration", code: "SD-CA", keywords: ["carte", "card", "activer", "bloquer", "opposition", "pin", "plafond", "retrait", "cb", "visa", "mastercard"] },
    { name: "Payment Initiation", code: "SD-PI", keywords: ["virement", "transfer", "paiement", "payment", "sepa", "swift", "beneficiaire", "prelevement"] },
    { name: "Cheque Processing", code: "SD-CP", keywords: ["cheque", "check", "chequier", "carnet", "lcn", "remise", "encaissement"] },
    { name: "Consumer Loan", code: "SD-CL", keywords: ["credit", "loan", "pret", "simulation", "echeance", "amortissement", "taux", "mensualite", "emprunt"] },
    { name: "Customer Management", code: "SD-CM", keywords: ["client", "customer", "prospect", "kyc", "profil", "onboarding", "segment", "relation"] },
    { name: "Compliance", code: "SD-CMP", keywords: ["compliance", "conformite", "lbc", "aml", "lcbft", "fatca", "crs", "embargo", "sanctions"] },
    { name: "Credit Risk Management", code: "SD-CRM", keywords: ["risque", "risk", "scoring", "notation", "rating", "provision", "defaut", "perte"] },
    { name: "Document Services", code: "SD-DS", keywords: ["document", "pdf", "releve", "attestation", "courrier", "ged", "archivage"] },
    { name: "Financial Accounting", code: "SD-FA", keywords: ["comptabilite", "accounting", "ecriture", "mouvement", "grand livre", "journal", "bilan"] },
    { name: "Transaction Processing", code: "SD-TP", keywords: ["batch", "job", "traitement", "nuit", "compensation", "clearing", "settlement"] },
    { name: "Savings Account", code: "SD-SAV", keywords: ["epargne", "savings", "livret", "placement", "depot", "terme", "remuneration"] },
    { name: "Mortgage Loan", code: "SD-ML", keywords: ["hypotheque", "mortgage", "immobilier", "garantie", "nantissement", "caution"] },
    { name: "Trade Finance", code: "SD-TF", keywords: ["trade finance", "lettre credit", "lc", "remise documentaire", "credoc", "import", "export"] },
    { name: "Foreign Exchange", code: "SD-FX", keywords: ["change", "forex", "devise", "taux change", "conversion", "spot", "forward"] },
    { name: "Securities Trading", code: "SD-ST", keywords: ["bourse", "titre", "action", "obligation", "opcvm", "sicav", "portefeuille", "trading"] },
    { name: "Custody Services", code: "SD-CUS", keywords: ["conservation", "custody", "depot titre", "garde", "reglement livraison"] },
    { name: "Fraud Detection", code: "SD-FD", keywords: ["fraude", "fraud", "detection", "alerte", "suspicion", "anomalie", "blanchiment"] },
    { name: "Customer Offer", code: "SD-CO", keywords: ["offre", "offer", "proposition", "package", "bundle", "tarification"] },
    { name: "Party Routing", code: "SD-PR", keywords: ["routage", "routing", "agence", "branch", "canal", "guichet", "conseiller"] },
    { name: "Regulatory Reporting", code: "SD-RR", keywords: ["reporting", "bam", "regulateur", "declaration", "bale", "ifrs", "surfi"] },
    { name: "Cash Management", code: "SD-CASH", keywords: ["tresorerie", "cash", "liquidite", "flux", "position", "pool", "centralisation"] },
    { name: "Standing Order", code: "SD-SO", keywords: ["ordre permanent", "standing order", "recurrent", "periodique", "automatique"] },
    { name: "Direct Debit", code: "SD-DD", keywords: ["prelevement", "direct debit", "mandat", "sdd", "creancier"] },
    { name: "Correspondent Banking", code: "SD-CB", keywords: ["correspondant", "nostro", "vostro", "loro", "interbancaire", "bic"] },
    { name: "ATM Network", code: "SD-ATM", keywords: ["gab", "atm", "distributeur", "automate", "retrait", "depot especes"] },
    { name: "Digital Channel", code: "SD-DC", keywords: ["mobile banking", "ebanking", "digital", "application", "web banking", "selfcare"] },
    { name: "Guarantee", code: "SD-GAR", keywords: ["garantie", "caution", "aval", "engagement", "lettre garantie", "sblc"] },
    { name: "Leasing", code: "SD-LEAS", keywords: ["leasing", "location", "ijara", "mourabaha", "financement", "bien"] },
    { name: "Islamic Finance", code: "SD-IF", keywords: ["mourabaha", "ijara", "moucharaka", "sukuk", "halal", "charia", "participatif"] },
  ],
  ACORD: [
    { name: "Policy Administration", code: "ACORD-POL", keywords: ["police", "policy", "contrat", "avenant", "souscription", "attestation", "conditions", "particulieres"] },
    { name: "Claims Management", code: "ACORD-CLM", keywords: ["sinistre", "claim", "declaration", "indemnisation", "expertise", "recours", "franchise", "reglement", "dommage"] },
    { name: "Underwriting", code: "ACORD-UW", keywords: ["souscription", "underwriting", "tarification", "risque", "acceptation", "derogation", "questionnaire"] },
    { name: "Billing & Collections", code: "ACORD-BIL", keywords: ["prime", "premium", "facturation", "quittance", "encaissement", "cotisation", "echeancier", "impaye"] },
    { name: "Reinsurance", code: "ACORD-RE", keywords: ["reassurance", "reinsurance", "traite", "cession", "retention", "excedent", "proportionnel", "catastrophe"] },
    { name: "Party Management", code: "ACORD-PTY", keywords: ["assure", "beneficiaire", "courtier", "agent", "intermediaire", "souscripteur", "tiers", "mandataire"] },
    { name: "Product Management", code: "ACORD-PRD", keywords: ["produit", "garantie", "option", "formule", "catalogue", "branche", "multirisque", "prevoyance"] },
    { name: "Risk Assessment", code: "ACORD-RSK", keywords: ["risque", "evaluation", "scoring", "actuariat", "sinistralite", "probabilite", "exposition"] },
    { name: "Commission Management", code: "ACORD-COM", keywords: ["commission", "retrocession", "remuneration", "apporteur", "honoraires", "courtage"] },
    { name: "Compliance & Regulatory", code: "ACORD-CMP", keywords: ["conformite", "solvabilite", "regulatory", "reporting", "solvency", "acpr", "dda"] },
    { name: "Auto Insurance", code: "ACORD-AUTO", keywords: ["automobile", "vehicule", "conducteur", "bonus", "malus", "responsabilite civile", "bris de glace", "vol"] },
    { name: "Health Insurance", code: "ACORD-HLTH", keywords: ["sante", "mutuelle", "complementaire", "hospitalisation", "optique", "dentaire", "tiers payant"] },
    { name: "Life Insurance", code: "ACORD-LIFE", keywords: ["vie", "deces", "capital", "rente", "epargne", "rachat", "beneficiaire", "clause"] },
    { name: "Property Insurance", code: "ACORD-PROP", keywords: ["habitation", "immeuble", "incendie", "degat des eaux", "catastrophe naturelle", "mrh"] },
    { name: "Professional Liability", code: "ACORD-PRO", keywords: ["responsabilite professionnelle", "rc pro", "erreur", "omission", "faute", "prejudice"] },
    { name: "Travel Insurance", code: "ACORD-TRV", keywords: ["voyage", "assistance", "rapatriement", "annulation", "bagages", "etranger"] },
    { name: "Crop Insurance", code: "ACORD-CROP", keywords: ["agricole", "recolte", "grele", "secheresse", "calamite", "exploitation"] },
  ],
  HL7_FHIR: [
    { name: "Patient", code: "FHIR-PAT", keywords: ["patient", "malade", "dossier", "identite", "ipp", "ins", "nir", "demographique"] },
    { name: "Practitioner", code: "FHIR-PRC", keywords: ["medecin", "doctor", "praticien", "soignant", "infirmier", "rpps", "adeli", "specialiste"] },
    { name: "Encounter", code: "FHIR-ENC", keywords: ["consultation", "hospitalisation", "sejour", "urgence", "visite", "admission", "sortie", "transfert"] },
    { name: "Observation", code: "FHIR-OBS", keywords: ["resultat", "labo", "analyse", "mesure", "signe", "vital", "biologie", "constante"] },
    { name: "MedicationRequest", code: "FHIR-MRQ", keywords: ["prescription", "ordonnance", "medicament", "posologie", "dispensation", "pharmacie"] },
    { name: "Procedure", code: "FHIR-PRO", keywords: ["acte", "intervention", "chirurgie", "operation", "examen", "ccam", "ngap", "bloc"] },
    { name: "DiagnosticReport", code: "FHIR-DGR", keywords: ["compte rendu", "rapport", "diagnostic", "resultat", "imagerie", "radiologie", "pathologie"] },
    { name: "Appointment", code: "FHIR-APT", keywords: ["rendez-vous", "rdv", "planification", "agenda", "creneau", "annulation", "rappel"] },
    { name: "Coverage", code: "FHIR-COV", keywords: ["couverture", "mutuelle", "assurance", "securite sociale", "amo", "amc", "cmu", "carte vitale"] },
    { name: "Claim", code: "FHIR-CLM", keywords: ["facturation", "remboursement", "tarification", "acte", "t2a", "ghs", "finess"] },
    { name: "Organization", code: "FHIR-ORG", keywords: ["etablissement", "hopital", "clinique", "service", "unite", "pole", "uf", "structure"] },
    { name: "Condition", code: "FHIR-CND", keywords: ["diagnostic", "pathologie", "maladie", "cim10", "antecedent", "allergie", "chronique"] },
    { name: "AllergyIntolerance", code: "FHIR-ALG", keywords: ["allergie", "intolerance", "reaction", "substance", "gravite", "anaphylaxie"] },
    { name: "Immunization", code: "FHIR-IMM", keywords: ["vaccination", "vaccin", "immunisation", "rappel", "dose", "carnet", "calendrier"] },
    { name: "Specimen", code: "FHIR-SPE", keywords: ["prelevement", "echantillon", "specimen", "tube", "biopsie", "ponction"] },
    { name: "ImagingStudy", code: "FHIR-IMG", keywords: ["imagerie", "scanner", "irm", "radio", "echographie", "dicom", "pacs"] },
    { name: "CarePlan", code: "FHIR-CPL", keywords: ["plan soin", "protocole", "parcours", "prise en charge", "objectif", "suivi"] },
    { name: "ServiceRequest", code: "FHIR-SRQ", keywords: ["demande", "prescription", "bon", "ordonnance", "bilan", "exploration"] },
    { name: "MedicationAdministration", code: "FHIR-MAD", keywords: ["administration", "injection", "perfusion", "voie", "dose", "horaire"] },
    { name: "DocumentReference", code: "FHIR-DOC", keywords: ["document", "cda", "pdf", "compte rendu", "lettre", "certificat", "dmp"] },
    { name: "Consent", code: "FHIR-CNS", keywords: ["consentement", "rgpd", "autorisation", "refus", "directive", "personne confiance"] },
    { name: "QuestionnaireResponse", code: "FHIR-QR", keywords: ["questionnaire", "formulaire", "reponse", "evaluation", "echelle", "score"] },
  ],
  TMFORUM: [
    { name: "Product Catalog Management", code: "TMF-620", keywords: ["catalogue", "produit", "offre", "forfait", "option", "bundle", "specification"] },
    { name: "Product Ordering", code: "TMF-622", keywords: ["commande", "souscription", "activation", "order", "portabilite", "migration", "changement"] },
    { name: "Customer Management", code: "TMF-629", keywords: ["client", "customer", "abonne", "compte", "profil", "segment", "fidélite"] },
    { name: "Billing Management", code: "TMF-678", keywords: ["facturation", "facture", "billing", "paiement", "avoir", "contentieux", "recouvrement"] },
    { name: "Usage Management", code: "TMF-635", keywords: ["consommation", "usage", "cdr", "data", "appel", "roaming", "hors forfait"] },
    { name: "Trouble Ticket", code: "TMF-621", keywords: ["incident", "ticket", "reclamation", "panne", "support", "escalade", "resolution"] },
    { name: "Network Function", code: "TMF-640", keywords: ["reseau", "network", "provisioning", "equipement", "nfv", "sdn", "topologie"] },
    { name: "Communication", code: "TMF-681", keywords: ["notification", "sms", "email", "push", "message", "campagne", "template"] },
    { name: "Payment Management", code: "TMF-676", keywords: ["paiement", "payment", "encaissement", "recharge", "prépaye", "solde", "top-up"] },
    { name: "Service Qualification", code: "TMF-645", keywords: ["eligibilite", "qualification", "couverture", "debit", "fibre", "adsl", "4g", "5g"] },
    { name: "Resource Inventory", code: "TMF-639", keywords: ["inventaire", "ressource", "equipement", "sim", "numero", "msisdn", "imsi"] },
    { name: "Service Inventory", code: "TMF-638", keywords: ["service", "ligne", "abonnement", "voix", "data", "tv", "fixe", "mobile"] },
    { name: "Party Management", code: "TMF-632", keywords: ["tiers", "partenaire", "distributeur", "revendeur", "mvno", "operateur"] },
    { name: "SLA Management", code: "TMF-623", keywords: ["sla", "qualite service", "disponibilite", "latence", "engagement", "penalite"] },
    { name: "Promotion Management", code: "TMF-671", keywords: ["promotion", "remise", "bonus", "parrainage", "campagne", "offre speciale"] },
    { name: "Geographic Address", code: "TMF-673", keywords: ["adresse", "geolocalisation", "couverture", "zone", "nra", "olt", "central"] },
    { name: "Appointment", code: "TMF-646", keywords: ["rendez-vous", "intervention", "technicien", "installation", "raccordement"] },
  ],
  DDD: [
    { name: "Product Catalog", code: "BC-CAT", keywords: ["produit", "product", "categorie", "catalogue", "article", "reference", "sku", "variante"] },
    { name: "Shopping Cart", code: "BC-CART", keywords: ["panier", "cart", "ajout", "article", "quantite", "abandon", "sauvegarde"] },
    { name: "Order Management", code: "BC-ORD", keywords: ["commande", "order", "statut", "historique", "suivi", "confirmation", "annulation", "modification"] },
    { name: "Payment Processing", code: "BC-PAY", keywords: ["paiement", "payment", "transaction", "remboursement", "stripe", "cb", "virement", "3ds"] },
    { name: "Inventory Management", code: "BC-INV", keywords: ["stock", "inventory", "reservation", "disponibilite", "entrepot", "warehouse", "reappro"] },
    { name: "Shipping & Delivery", code: "BC-SHIP", keywords: ["expedition", "shipping", "livraison", "delivery", "suivi", "transporteur", "colis", "tracking"] },
    { name: "Customer Identity", code: "BC-CID", keywords: ["client", "customer", "compte", "profil", "authentification", "adresse", "historique"] },
    { name: "Pricing & Promotions", code: "BC-PRICE", keywords: ["prix", "price", "remise", "coupon", "promotion", "solde", "flash sale", "code promo"] },
    { name: "Returns & Refunds", code: "BC-RET", keywords: ["retour", "return", "echange", "remboursement", "refund", "avoir", "reclamation"] },
    { name: "Notification", code: "BC-NOTIF", keywords: ["notification", "email", "sms", "alerte", "push", "newsletter", "marketing"] },
    { name: "Review & Rating", code: "BC-REV", keywords: ["avis", "review", "note", "rating", "commentaire", "etoile", "recommandation"] },
    { name: "Wishlist", code: "BC-WISH", keywords: ["favoris", "wishlist", "liste envies", "sauvegarde", "comparaison"] },
    { name: "Marketplace", code: "BC-MKT", keywords: ["marketplace", "vendeur", "seller", "marchand", "commission", "plateforme"] },
    { name: "Search & Discovery", code: "BC-SRCH", keywords: ["recherche", "search", "filtre", "tri", "facette", "suggestion", "autocomplete"] },
    { name: "Loyalty Program", code: "BC-LOY", keywords: ["fidelite", "loyalty", "points", "recompense", "programme", "tier", "cashback"] },
  ],
  TOGAF: [
    { name: "Business Process Management", code: "BB-BPM", keywords: ["workflow", "processus", "process", "orchestration", "bpm", "bpmn", "camunda", "activiti"] },
    { name: "Enterprise Integration", code: "BB-EAI", keywords: ["integration", "esb", "middleware", "connecteur", "api", "mq", "kafka", "rabbitmq", "jms"] },
    { name: "Identity & Access Management", code: "BB-IAM", keywords: ["authentification", "autorisation", "sso", "ldap", "login", "oauth", "saml", "keycloak", "rbac"] },
    { name: "Document Management", code: "BB-DMS", keywords: ["document", "ged", "archivage", "fichier", "version", "alfresco", "nuxeo", "cmis"] },
    { name: "Audit & Compliance", code: "BB-AUD", keywords: ["audit", "trace", "conformite", "log", "historique", "piste", "rgpd", "cnil"] },
    { name: "Reporting & Analytics", code: "BB-RPT", keywords: ["reporting", "rapport", "bi", "dashboard", "kpi", "statistique", "jasper", "crystal"] },
    { name: "Master Data Management", code: "BB-MDM", keywords: ["referentiel", "master", "donnee", "synchronisation", "golden record", "deduplication"] },
    { name: "Workflow Engine", code: "BB-WF", keywords: ["approbation", "circuit", "validation", "etape", "workflow", "signature", "delegation"] },
    { name: "Scheduling & Batch", code: "BB-SCH", keywords: ["batch", "job", "scheduler", "planification", "cron", "quartz", "spring batch"] },
    { name: "Data Persistence", code: "BB-DB", keywords: ["base", "donnee", "repository", "dao", "persistence", "cache", "redis", "jpa", "hibernate"] },
    { name: "API Gateway", code: "BB-APIGW", keywords: ["gateway", "api management", "rate limit", "throttling", "proxy", "kong", "apigee"] },
    { name: "Event Driven Architecture", code: "BB-EDA", keywords: ["evenement", "event", "cqrs", "event sourcing", "saga", "choreographie", "pub sub"] },
    { name: "Service Registry", code: "BB-SREG", keywords: ["registre", "discovery", "eureka", "consul", "service mesh", "istio"] },
    { name: "Configuration Management", code: "BB-CFG", keywords: ["configuration", "parametre", "feature flag", "toggle", "environnement", "profil"] },
    { name: "Monitoring & Observability", code: "BB-MON", keywords: ["monitoring", "observabilite", "prometheus", "grafana", "elk", "apm", "metriques"] },
    { name: "Email & Messaging", code: "BB-MSG", keywords: ["email", "smtp", "notification", "template", "campagne", "newsletter", "push"] },
    { name: "File Storage", code: "BB-FS", keywords: ["stockage", "s3", "minio", "blob", "upload", "telechargement", "cdn"] },
    { name: "Search Engine", code: "BB-SE", keywords: ["recherche", "elasticsearch", "solr", "indexation", "full text", "autocomplete"] },
  ],
};

const STATIC_ACTIONS: Record<Exclude<IndustryStandard, "NONE">, Array<{ action: string; keywords: string[] }>> = {
  BIAN: [
    { action: "Initiate", keywords: ["creer", "create", "ouvrir", "souscrire", "demander", "ajouter"] },
    { action: "Execute", keywords: ["executer", "execute", "effectuer", "virer", "payer", "envoyer", "valider"] },
    { action: "Evaluate", keywords: ["evaluer", "evaluate", "simuler", "calculer", "scorer", "verifier"] },
    { action: "Retrieve", keywords: ["consulter", "consult", "charger", "lire", "obtenir", "get", "rechercher", "lister"] },
    { action: "Update", keywords: ["modifier", "modify", "update", "changer", "editer", "corriger"] },
    { action: "Control", keywords: ["bloquer", "block", "suspendre", "geler", "opposition", "annuler"] },
    { action: "Terminate", keywords: ["cloturer", "close", "terminer", "resilier", "supprimer", "archiver"] },
    { action: "Notify", keywords: ["notifier", "notify", "alerter", "informer"] },
  ],
  ACORD: [
    { action: "Create", keywords: ["creer", "create", "ouvrir", "souscrire", "ajouter"] },
    { action: "Submit", keywords: ["soumettre", "submit", "declarer", "envoyer"] },
    { action: "Evaluate", keywords: ["evaluer", "evaluate", "tarifer", "scorer", "calculer"] },
    { action: "Process", keywords: ["traiter", "process", "indemniser", "rembourser", "executer"] },
    { action: "Retrieve", keywords: ["consulter", "consult", "lire", "obtenir", "rechercher"] },
    { action: "Update", keywords: ["modifier", "update", "avenant", "corriger"] },
    { action: "Cancel", keywords: ["annuler", "cancel", "resilier", "rejeter"] },
    { action: "Renew", keywords: ["renouveler", "renew", "reconduire", "prolonger"] },
    { action: "Notify", keywords: ["notifier", "notify", "alerter", "informer"] },
  ],
  HL7_FHIR: [
    { action: "Create", keywords: ["creer", "create", "ajouter", "enregistrer", "admettre"] },
    { action: "Read", keywords: ["lire", "read", "consulter", "obtenir", "afficher"] },
    { action: "Update", keywords: ["modifier", "update", "corriger", "mettre a jour"] },
    { action: "Search", keywords: ["rechercher", "search", "lister", "filtrer", "trouver"] },
    { action: "Submit", keywords: ["soumettre", "submit", "envoyer", "transmettre"] },
    { action: "Process", keywords: ["traiter", "process", "executer", "valider"] },
    { action: "Delete", keywords: ["supprimer", "delete", "annuler", "archiver"] },
    { action: "Validate", keywords: ["valider", "validate", "verifier", "controler"] },
  ],
  TMFORUM: [
    { action: "Create", keywords: ["creer", "create", "ajouter", "souscrire", "commander"] },
    { action: "Retrieve", keywords: ["consulter", "retrieve", "lire", "obtenir", "rechercher"] },
    { action: "Update", keywords: ["modifier", "update", "changer", "corriger"] },
    { action: "Activate", keywords: ["activer", "activate", "demarrer", "provisionner"] },
    { action: "Deactivate", keywords: ["desactiver", "deactivate", "suspendre", "couper"] },
    { action: "Delete", keywords: ["supprimer", "delete", "resilier", "annuler"] },
    { action: "Notify", keywords: ["notifier", "notify", "alerter", "informer", "envoyer"] },
  ],
  DDD: [
    { action: "Create", keywords: ["creer", "create", "ajouter", "commander", "placer"] },
    { action: "Execute", keywords: ["executer", "execute", "traiter", "payer", "valider"] },
    { action: "Query", keywords: ["consulter", "query", "lire", "rechercher", "lister", "afficher"] },
    { action: "Update", keywords: ["modifier", "update", "changer", "corriger", "editer"] },
    { action: "Delete", keywords: ["supprimer", "delete", "retirer", "annuler"] },
    { action: "Publish", keywords: ["publier", "publish", "diffuser", "activer"] },
    { action: "Archive", keywords: ["archiver", "archive", "cloturer", "fermer"] },
  ],
  TOGAF: [
    { action: "Create", keywords: ["creer", "create", "ajouter", "initialiser"] },
    { action: "Process", keywords: ["traiter", "process", "executer", "orchestrer", "lancer"] },
    { action: "Manage", keywords: ["gerer", "manage", "administrer", "configurer"] },
    { action: "Monitor", keywords: ["surveiller", "monitor", "auditer", "tracer", "logger"] },
    { action: "Integrate", keywords: ["integrer", "integrate", "connecter", "synchroniser"] },
    { action: "Report", keywords: ["rapporter", "report", "generer", "exporter", "statistique"] },
    { action: "Archive", keywords: ["archiver", "archive", "sauvegarder", "historiser"] },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// INDUSTRY STANDARD MAPPER CLASS
// ═══════════════════════════════════════════════════════════════════════

export class IndustryStandardMapper {
  private llmConfig?: LLMAdapterConfig;

  constructor(llmConfig?: LLMAdapterConfig) {
    this.llmConfig = llmConfig;
  }

  /**
   * Mappe les use cases vers le standard choisi par l'utilisateur.
   * Si le standard est NONE, retourne un tableau vide (on garde les noms originaux).
   */
  async mapUseCases(
    useCases: UseCaseInput[],
    standard: IndustryStandard,
  ): Promise<{
    results: StandardMappingResult[];
    mappedCount: number;
    source: "llm" | "dictionary";
    standard: IndustryStandard;
  }> {
    if (standard === "NONE" || useCases.length === 0) {
      return { results: [], mappedCount: 0, source: "dictionary", standard };
    }

    // 1. Essayer le LLM
    try {
      const llmAvailable = await isLLMAvailable();
      if (llmAvailable) {
        const llmResults = await this.mapViaLLM(useCases, standard);
        if (llmResults && llmResults.length > 0) {
          const mappedCount = llmResults.filter(r => r.standardDomain && r.standardDomain.trim() !== "").length;
          console.log(`[IndustryStandardMapper] LLM mapping (${standard}): ${mappedCount}/${useCases.length} use cases mappés`);
          return { results: llmResults, mappedCount, source: "llm", standard };
        }
      }
    } catch (err) {
      console.warn(`[IndustryStandardMapper] LLM mapping failed for ${standard}, falling back to dictionary:`, err);
    }

    // 2. Fallback dictionnaire statique
    const dictResults = this.mapViaDictionary(useCases, standard);
    const mappedCount = dictResults.filter(r => r.standardDomain && r.standardDomain.trim() !== "").length;
    console.log(`[IndustryStandardMapper] Dictionary fallback (${standard}): ${mappedCount}/${useCases.length} use cases mappés`);
    return { results: dictResults, mappedCount, source: "dictionary", standard };
  }

  /**
   * Mapping via LLM — batch de use cases.
   */
  private async mapViaLLM(useCases: UseCaseInput[], standard: Exclude<IndustryStandard, "NONE">): Promise<StandardMappingResult[] | null> {
    const BATCH_SIZE = 30;
    const allResults: StandardMappingResult[] = [];
    const promptBuilder = STANDARD_PROMPTS[standard];
    if (!promptBuilder) return null;

    for (let i = 0; i < useCases.length; i += BATCH_SIZE) {
      const batch = useCases.slice(i, i + BATCH_SIZE);
      const ucList = buildUseCaseList(batch);
      const prompt = promptBuilder(ucList);

      const llmResult = await llmGenerateJSON<LLMStandardMapping[]>(
        prompt,
        { temperature: 0.2, maxTokens: 4000 },
        this.llmConfig,
      );

      if (!llmResult || !Array.isArray(llmResult)) {
        console.warn(`[IndustryStandardMapper] LLM returned invalid result for batch ${i / BATCH_SIZE + 1} (${standard})`);
        return null;
      }

      for (const uc of batch) {
        const llmMapping = llmResult.find(
          m => m.className === uc.className || m.className === uc.className.replace(/_/g, "")
        );

        if (llmMapping && llmMapping.standardDomain) {
          allResults.push({
            className: uc.className,
            standardDomain: llmMapping.standardDomain,
            standardCode: llmMapping.standardCode || "",
            standardAction: llmMapping.standardAction || "Execute",
            confidence: typeof llmMapping.confidence === "number" ? llmMapping.confidence : 0.7,
            source: "llm",
            reasoning: llmMapping.reasoning || "",
            standard,
          });
        } else {
          const dictResult = this.mapSingleViaDictionary(uc, standard);
          allResults.push(dictResult);
        }
      }
    }

    return allResults;
  }

  /**
   * Mapping via dictionnaire statique.
   */
  private mapViaDictionary(useCases: UseCaseInput[], standard: Exclude<IndustryStandard, "NONE">): StandardMappingResult[] {
    return useCases.map(uc => this.mapSingleViaDictionary(uc, standard));
  }

  private mapSingleViaDictionary(uc: UseCaseInput, standard: Exclude<IndustryStandard, "NONE">): StandardMappingResult {
    const className = uc.className.toLowerCase()
      .replace(/_/g, "").replace(/uc$/, "").replace(/ejb$/, "")
      .replace(/bean$/, "").replace(/service$/, "").replace(/impl$/, "").replace(/local$/, "");

    const domains = STATIC_DOMAINS[standard] || [];
    const actions = STATIC_ACTIONS[standard] || [];

    // Chercher par mots-clés
    let bestDomain: StaticDomain | null = null;
    let bestScore = 0;
    for (const sd of domains) {
      let score = 0;
      for (const kw of sd.keywords) {
        if (className.includes(kw.replace(/_/g, "").replace(/ /g, ""))) {
          score += kw.length / className.length + 0.3;
        }
        // Aussi chercher dans le domaine détecté
        if (uc.domain.toLowerCase().includes(kw)) {
          score += 0.4;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestDomain = sd;
      }
    }

    // Détecter l'action
    let detectedAction = standard === "BIAN" ? "Execute" : "Create";
    for (const ap of actions) {
      for (const kw of ap.keywords) {
        if (className.includes(kw.replace(/_/g, ""))) {
          detectedAction = ap.action;
          break;
        }
      }
    }

    if (bestDomain && bestScore > 0.15) {
      return {
        className: uc.className,
        standardDomain: bestDomain.name,
        standardCode: bestDomain.code,
        standardAction: detectedAction,
        confidence: Math.min(bestScore + 0.2, 0.7),
        source: "dictionary",
        standard,
      };
    }

    // Fallback générique
    return {
      className: uc.className,
      standardDomain: uc.domain ? `${uc.domain.charAt(0).toUpperCase() + uc.domain.slice(1)} Management` : "General Processing",
      standardCode: "",
      standardAction: detectedAction,
      confidence: 0.35,
      source: "dictionary",
      standard,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Applique le mapping du standard choisi sur les use cases.
 * Modifie les use cases en place (bianDomain → standardDomain, bianAction → standardAction).
 * Si standard === "NONE", ne fait rien (on garde les noms originaux).
 */
export async function applyIndustryStandardMapping(
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
  standard: IndustryStandard,
  llmConfig?: LLMAdapterConfig,
): Promise<{
  mappedCount: number;
  results: StandardMappingResult[];
  source: "llm" | "dictionary";
  standard: IndustryStandard;
}> {
  if (standard === "NONE") {
    return { mappedCount: 0, results: [], source: "dictionary", standard };
  }

  // Séparer les use cases déjà mappés manuellement
  const alreadyMapped = useCases.filter(uc => uc.bianDomain && uc.bianDomain.trim() !== "");
  const toMap = useCases.filter(uc => !uc.bianDomain || uc.bianDomain.trim() === "");

  const manualResults: StandardMappingResult[] = alreadyMapped.map(uc => ({
    className: uc.className,
    standardDomain: uc.bianDomain,
    standardCode: "",
    standardAction: uc.bianAction,
    confidence: 1.0,
    source: "manual" as const,
    standard,
  }));

  if (toMap.length === 0) {
    return { mappedCount: alreadyMapped.length, results: manualResults, source: "dictionary", standard };
  }

  // Mapper via LLM + fallback
  const mapper = new IndustryStandardMapper(llmConfig);
  const { results: autoResults, mappedCount: autoMapped, source } = await mapper.mapUseCases(toMap, standard);

  // Appliquer les résultats sur les use cases (mutation en place)
  for (const result of autoResults) {
    if (result.standardDomain) {
      const uc = useCases.find(u => u.className === result.className);
      if (uc) {
        uc.bianDomain = result.standardDomain;
        uc.bianAction = result.standardAction;
      }
    }
  }

  return {
    mappedCount: alreadyMapped.length + autoMapped,
    results: [...manualResults, ...autoResults],
    source,
    standard,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// STANDARD LABELS (for reports)
// ═══════════════════════════════════════════════════════════════════════

export const STANDARD_LABELS: Record<IndustryStandard, { name: string; fullName: string; reportFile: string }> = {
  BIAN: { name: "BIAN", fullName: "Banking Industry Architecture Network v13", reportFile: "BIAN_MAPPING.md" },
  ACORD: { name: "ACORD", fullName: "Association for Cooperative Operations Research and Development", reportFile: "ACORD_MAPPING.md" },
  HL7_FHIR: { name: "HL7/FHIR", fullName: "Health Level 7 / FHIR R4", reportFile: "HL7_FHIR_MAPPING.md" },
  TMFORUM: { name: "TMForum", fullName: "TM Forum Open APIs / eTOM / SID", reportFile: "TMFORUM_MAPPING.md" },
  DDD: { name: "DDD", fullName: "Domain-Driven Design", reportFile: "DDD_MAPPING.md" },
  TOGAF: { name: "TOGAF", fullName: "The Open Group Architecture Framework", reportFile: "TOGAF_MAPPING.md" },
  NONE: { name: "Aucun", fullName: "Pas de standard métier", reportFile: "" },
};
