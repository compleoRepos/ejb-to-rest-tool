/**
 * BusinessConceptTaxonomy v13.15 — Banking domain taxonomy for field classification.
 *
 * Defines 10 primary categories and ~70 sub-concepts with detection patterns.
 * Each sub-concept has:
 *   - Field name patterns (regex for legacy column names)
 *   - Variable name patterns (regex for Java variable names)
 *   - Java type hints (types that reinforce the classification)
 *   - Default sensitivity level
 *
 * @author Hamza NORDINE — Compleo
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type PrimaryCategory =
  | "IDENTITY"
  | "CONTACT"
  | "ACCOUNT"
  | "MONEY"
  | "TIME"
  | "TRANSACTION"
  | "CARD"
  | "COMPLIANCE"
  | "SYSTEM"
  | "UNKNOWN";

export type Sensitivity =
  | "public"
  | "internal"
  | "pii"
  | "banking-sensitive"
  | "pci-dss"
  | "critical";

export interface SubConcept {
  /** Unique key, e.g. "AccountNumber" */
  key: string;
  /** Human-readable label */
  label: string;
  /** Parent category */
  category: PrimaryCategory;
  /** Regex patterns matching field/column names (case-insensitive) */
  fieldPatterns: RegExp[];
  /** Regex patterns matching Java variable names (case-insensitive) */
  variablePatterns: RegExp[];
  /** Java types that reinforce this classification */
  javaTypeHints: string[];
  /** Default sensitivity */
  sensitivity: Sensitivity;
  /** Optional format constraint description */
  formatHint?: string;
  /** Optional regex for value validation */
  valuePattern?: string;
  /** Min/max length constraints */
  minLength?: number;
  maxLength?: number;
}

// ─── Category metadata ──────────────────────────────────────────────────────

export const CATEGORY_META: Record<PrimaryCategory, { label: string; labelFr: string; color: string; icon: string }> = {
  IDENTITY:    { label: "Identity",    labelFr: "Identité",     color: "#8b5cf6", icon: "👤" },
  CONTACT:     { label: "Contact",     labelFr: "Coordonnées",  color: "#06b6d4", icon: "📞" },
  ACCOUNT:     { label: "Account",     labelFr: "Compte",       color: "#2563eb", icon: "🏦" },
  MONEY:       { label: "Money",       labelFr: "Montant",      color: "#16a34a", icon: "💰" },
  TIME:        { label: "Time",        labelFr: "Temporel",     color: "#ca8a04", icon: "📅" },
  TRANSACTION: { label: "Transaction", labelFr: "Transaction",  color: "#ea580c", icon: "🔄" },
  CARD:        { label: "Card",        labelFr: "Monétique",    color: "#dc2626", icon: "💳" },
  COMPLIANCE:  { label: "Compliance",  labelFr: "Conformité",   color: "#7c3aed", icon: "🛡️" },
  SYSTEM:      { label: "System",      labelFr: "Système",      color: "#6b7280", icon: "⚙️" },
  UNKNOWN:     { label: "Unknown",     labelFr: "Inconnu",      color: "#9ca3af", icon: "❓" },
};

// ─── Sub-concepts registry ──────────────────────────────────────────────────

export const SUB_CONCEPTS: SubConcept[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // 1. IDENTITY
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: "ClientId",
    label: "Client / Customer Number",
    category: "IDENTITY",
    fieldPatterns: [/\b(client|customer|cust|cif|cli)[\W_]*(id|num|number|no|code)?\b/i, /\b(id|num|code)[\W_]*(client|customer|cust|cif|cli)\b/i, /^CLI$/i, /^CIF$/i, /^CUST_ID$/i, /^NUM_CLI$/i, /^COD_CLI$/i],
    variablePatterns: [/\b(client|customer|cust)(Id|Number|Code|Num)?\b/i, /\b(id|num|code)(Client|Customer|Cust)\b/i],
    javaTypeHints: ["String", "Long", "Integer"],
    sensitivity: "pii",
  },
  {
    key: "ClientName",
    label: "Client Name / Full Name",
    category: "IDENTITY",
    fieldPatterns: [/\b(nom|name|denomination|raison[\W_]*sociale|full[\W_]*name)\b/i, /^NOM$/i, /^NOM_CLI$/i, /^NOM_CLIENT$/i],
    variablePatterns: [/\b(name|nom|fullName|clientName|customerName|denomination|raisonSociale)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
  },
  {
    key: "FirstName",
    label: "First Name",
    category: "IDENTITY",
    fieldPatterns: [/\b(prenom|first[\W_]*name|given[\W_]*name)\b/i, /^PRENOM$/i],
    variablePatterns: [/\b(prenom|firstName|givenName)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
  },
  {
    key: "LastName",
    label: "Last Name",
    category: "IDENTITY",
    fieldPatterns: [/\b(nom[\W_]*famille|last[\W_]*name|family[\W_]*name|surname)\b/i],
    variablePatterns: [/\b(lastName|familyName|surname|nomFamille)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
  },
  {
    key: "Civility",
    label: "Civility / Title",
    category: "IDENTITY",
    fieldPatterns: [/\b(civilite|titre|salutation|title|gender[\W_]*title)\b/i, /^CIV$/i],
    variablePatterns: [/\b(civilite|title|salutation|civility)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "DateOfBirth",
    label: "Date of Birth",
    category: "IDENTITY",
    fieldPatterns: [/\b(date[\W_]*naissance|birth[\W_]*date|dob|dn|dt[\W_]*nais)\b/i],
    variablePatterns: [/\b(dateNaissance|birthDate|dob|dateOfBirth)\b/i],
    javaTypeHints: ["LocalDate", "Date", "java.util.Date"],
    sensitivity: "pii",
  },
  {
    key: "Nationality",
    label: "Nationality",
    category: "IDENTITY",
    fieldPatterns: [/\b(nationalite|nationality|country[\W_]*of[\W_]*birth|pays[\W_]*naissance)\b/i],
    variablePatterns: [/\b(nationalite|nationality|countryOfBirth)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
  },
  {
    key: "NationalId",
    label: "National ID (CIN, Passport)",
    category: "IDENTITY",
    fieldPatterns: [/\b(cin|passeport|passport|identifiant[\W_]*national|national[\W_]*id|carte[\W_]*identite|id[\W_]*card)\b/i, /^CIN$/i, /^NUM_CIN$/i],
    variablePatterns: [/\b(cin|passport|passportNumber|nationalId|carteIdentite|numCin)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
  },
  {
    key: "Gender",
    label: "Gender",
    category: "IDENTITY",
    fieldPatterns: [/\b(sexe|gender|sex)\b/i],
    variablePatterns: [/\b(sexe|gender|sex)\b/i],
    javaTypeHints: ["String", "Character"],
    sensitivity: "pii",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 2. CONTACT
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: "Address",
    label: "Address (street)",
    category: "CONTACT",
    fieldPatterns: [/\b(adresse|address|rue|street|adr[\W_]*(1|2|3)?|addr)\b/i, /^ADR$/i, /^ADR[0-9]$/i],
    variablePatterns: [/\b(adresse|address|street|rue|addr)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
  },
  {
    key: "PostalCode",
    label: "Postal Code",
    category: "CONTACT",
    fieldPatterns: [/\b(code[\W_]*postal|cp|zip[\W_]*code|postal[\W_]*code|zip)\b/i, /^CP$/i],
    variablePatterns: [/\b(codePostal|postalCode|zipCode|cp)\b/i],
    javaTypeHints: ["String", "Integer"],
    sensitivity: "internal",
    formatHint: "5-digit (Morocco)",
    maxLength: 5,
  },
  {
    key: "City",
    label: "City",
    category: "CONTACT",
    fieldPatterns: [/\b(ville|city|localite|commune)\b/i],
    variablePatterns: [/\b(ville|city|localite|commune)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "Country",
    label: "Country",
    category: "CONTACT",
    fieldPatterns: [/\b(pays|country)\b/i, /^PAYS$/i],
    variablePatterns: [/\b(pays|country|countryCode)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "Email",
    label: "Email",
    category: "CONTACT",
    fieldPatterns: [/\b(mail|email|e[\W_]*mail|courriel)\b/i],
    variablePatterns: [/\b(mail|email|eMail|courriel)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
  },
  {
    key: "PhoneFixed",
    label: "Phone (fixed)",
    category: "CONTACT",
    fieldPatterns: [/\b(tel|phone|telephone|tel[\W_]*fixe)\b/i, /^TEL$/i, /^TEL_FIXE$/i],
    variablePatterns: [/\b(tel|phone|telephone|phoneNumber|telFixe)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
  },
  {
    key: "Mobile",
    label: "Mobile Phone",
    category: "CONTACT",
    fieldPatterns: [/\b(mobile|gsm|portable|tel[\W_]*mobile|cell[\W_]*phone)\b/i],
    variablePatterns: [/\b(mobile|gsm|portable|mobilePhone|cellPhone)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
    formatHint: "Morocco: 06xx or 07xx",
  },
  {
    key: "Fax",
    label: "Fax",
    category: "CONTACT",
    fieldPatterns: [/\bfax\b/i],
    variablePatterns: [/\bfax\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 3. ACCOUNT
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: "AccountNumber",
    label: "Account Number (national)",
    category: "ACCOUNT",
    fieldPatterns: [/\b(compte|rib|num[\W_]*compte|account[\W_]*num|acct[\W_]*no|num[\W_]*account)\b/i, /^CPT$/i, /^RIB$/i, /^NUM_CPT$/i, /^NUM_COMPTE$/i],
    variablePatterns: [/\b(compte|rib|numCompte|numeroCompte|accountNumber|acctNo|numAccount|accountNum)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "banking-sensitive",
    formatHint: "RIB Maroc 24 chars",
    maxLength: 24,
    valuePattern: "^[0-9]{24}$",
  },
  {
    key: "IBAN",
    label: "IBAN",
    category: "ACCOUNT",
    fieldPatterns: [/\biban\b/i],
    variablePatterns: [/\biban\b/i],
    javaTypeHints: ["String"],
    sensitivity: "banking-sensitive",
    formatHint: "2 letters + 22 chars",
    maxLength: 34,
    valuePattern: "^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$",
  },
  {
    key: "BIC",
    label: "BIC / SWIFT",
    category: "ACCOUNT",
    fieldPatterns: [/\b(bic|swift)\b/i],
    variablePatterns: [/\b(bic|swift|swiftCode|bicCode)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
    formatHint: "8 or 11 chars",
  },
  {
    key: "AccountType",
    label: "Account Type",
    category: "ACCOUNT",
    fieldPatterns: [/\b(type[\W_]*compte|account[\W_]*type|typ[\W_]*cpt)\b/i],
    variablePatterns: [/\b(typeCompte|accountType|typeCpt)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "AccountStatus",
    label: "Account Status",
    category: "ACCOUNT",
    fieldPatterns: [/\b(etat[\W_]*compte|account[\W_]*status|status[\W_]*cpt)\b/i],
    variablePatterns: [/\b(etatCompte|accountStatus|statusCpt)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "AgencyCode",
    label: "Agency / Branch Code",
    category: "ACCOUNT",
    fieldPatterns: [/\b(agence|branch|agency|code[\W_]*agence|cod[\W_]*age)\b/i, /^AGE$/i, /^COD_AGE$/i, /^COD_AGENCE$/i],
    variablePatterns: [/\b(agence|branch|agency|codeAgence|branchCode)\b/i],
    javaTypeHints: ["String", "Integer"],
    sensitivity: "internal",
  },
  {
    key: "OpeningDate",
    label: "Account Opening Date",
    category: "ACCOUNT",
    fieldPatterns: [/\b(date[\W_]*ouverture|opening[\W_]*date|dt[\W_]*ouv)\b/i],
    variablePatterns: [/\b(dateOuverture|openingDate|dtOuv)\b/i],
    javaTypeHints: ["LocalDate", "Date"],
    sensitivity: "internal",
  },
  {
    key: "Currency",
    label: "Currency",
    category: "ACCOUNT",
    fieldPatterns: [/\b(devise|currency|cur|ccy|code[\W_]*devise)\b/i, /^DEV$/i, /^COD_DEVISE$/i, /^COD_DEV$/i],
    variablePatterns: [/\b(devise|currency|currencyCode|ccy)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
    formatHint: "ISO 4217 (MAD, EUR, USD)",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 4. MONEY
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: "Amount",
    label: "Amount (generic)",
    category: "MONEY",
    fieldPatterns: [/\b(montant|amount|mnt|mtt)\b/i, /^MNT$/i, /^MTT$/i, /^MNT_[A-Z]+$/i],
    variablePatterns: [/\b(montant|amount|mnt|mtt)\b/i],
    javaTypeHints: ["BigDecimal", "Double", "double", "Float"],
    sensitivity: "banking-sensitive",
    formatHint: "Decimal(15,2)",
  },
  {
    key: "Balance",
    label: "Balance (current)",
    category: "MONEY",
    fieldPatterns: [/\b(solde|balance|sold)\b/i, /^SOL$/i],
    variablePatterns: [/\b(solde|balance|currentBalance)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "AvailableBalance",
    label: "Available Balance",
    category: "MONEY",
    fieldPatterns: [/\b(solde[\W_]*disponible|available[\W_]*balance|disponible)\b/i],
    variablePatterns: [/\b(soldeDisponible|availableBalance|disponible)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "BlockedAmount",
    label: "Blocked Amount",
    category: "MONEY",
    fieldPatterns: [/\b(montant[\W_]*bloque|blocked[\W_]*amount|mnt[\W_]*bloque)\b/i],
    variablePatterns: [/\b(montantBloque|blockedAmount|mntBloque)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "TransactionAmount",
    label: "Transaction Amount",
    category: "MONEY",
    fieldPatterns: [/\b(mnt[\W_]*operation|montant[\W_]*transaction|tx[\W_]*amount)\b/i],
    variablePatterns: [/\b(mntOperation|montantTransaction|txAmount|transactionAmount)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "DebitAmount",
    label: "Debit Amount",
    category: "MONEY",
    fieldPatterns: [/\b(debit|mnt[\W_]*debit|debit[\W_]*amount)\b/i, /^DEB$/i],
    variablePatterns: [/\b(debit|mntDebit|debitAmount)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "CreditAmount",
    label: "Credit Amount",
    category: "MONEY",
    fieldPatterns: [/\b(credit|mnt[\W_]*credit|credit[\W_]*amount)\b/i, /^CRD$/i],
    variablePatterns: [/\b(credit|mntCredit|creditAmount)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "InterestAmount",
    label: "Interest Amount",
    category: "MONEY",
    fieldPatterns: [/\b(interet|interest|int[\W_]*amount|taux[\W_]*interet|tau[\W_]*interet)\b/i, /^INT$/i, /^TAU_INTERET$/i, /^TAUX_INT$/i],
    variablePatterns: [/\b(interet|interest|interestAmount)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "Fee",
    label: "Fee / Commission",
    category: "MONEY",
    fieldPatterns: [/\b(frais|commission|cost|fee|com[\W_]*amount)\b/i, /^FRA$/i, /^COM$/i],
    variablePatterns: [/\b(frais|commission|fee|cost|commissionAmount)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "OverdraftLimit",
    label: "Overdraft Limit",
    category: "MONEY",
    fieldPatterns: [/\b(decouvert|overdraft|overdraft[\W_]*limit)\b/i],
    variablePatterns: [/\b(decouvert|overdraft|overdraftLimit)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "AuthorizationLimit",
    label: "Authorization Limit",
    category: "MONEY",
    fieldPatterns: [/\b(plafond|limit|authorization[\W_]*limit|auth[\W_]*limit)\b/i],
    variablePatterns: [/\b(plafond|limit|authorizationLimit|authLimit)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "ExchangeRate",
    label: "Exchange Rate",
    category: "MONEY",
    fieldPatterns: [/\b(taux[\W_]*change|exchange[\W_]*rate|cours|fx[\W_]*rate)\b/i, /^TAU$/i],
    variablePatterns: [/\b(tauxChange|exchangeRate|cours|fxRate)\b/i],
    javaTypeHints: ["BigDecimal", "Double"],
    sensitivity: "internal",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 5. TIME
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: "CreationDate",
    label: "Creation / Registration Date",
    category: "TIME",
    fieldPatterns: [/\b(date[\W_]*creation|created[\W_]*at|dt[\W_]*cre|creation[\W_]*date|date[\W_]*enregistrement)\b/i, /^DT_CREATION$/i, /^DT_CRE$/i],
    variablePatterns: [/\b(dateCreation|createdAt|creationDate|dateEnregistrement)\b/i],
    javaTypeHints: ["LocalDate", "LocalDateTime", "Date", "Timestamp"],
    sensitivity: "internal",
  },
  {
    key: "OperationDate",
    label: "Operation / Transaction Date",
    category: "TIME",
    fieldPatterns: [/\b(date[\W_]*operation|op[\W_]*date|tx[\W_]*date|date[\W_]*transaction)\b/i, /^DT_OPERATION$/i, /^DT_OPER$/i, /^DT_OPE$/i],
    variablePatterns: [/\b(dateOperation|opDate|txDate|dateTransaction|operationDate)\b/i],
    javaTypeHints: ["LocalDate", "LocalDateTime", "Date"],
    sensitivity: "internal",
  },
  {
    key: "ValueDate",
    label: "Value Date",
    category: "TIME",
    fieldPatterns: [/\b(date[\W_]*valeur|value[\W_]*date|dt[\W_]*val)\b/i, /^DT_VALEUR$/i],
    variablePatterns: [/\b(dateValeur|valueDate|dtVal)\b/i],
    javaTypeHints: ["LocalDate", "Date"],
    sensitivity: "internal",
  },
  {
    key: "DueDate",
    label: "Due Date / Maturity",
    category: "TIME",
    fieldPatterns: [/\b(date[\W_]*echeance|maturity|due[\W_]*date|echeance)\b/i, /^ECH$/i, /^DT_ECHEANCE$/i, /^DT_ECH$/i],
    variablePatterns: [/\b(dateEcheance|maturity|dueDate|echeance)\b/i],
    javaTypeHints: ["LocalDate", "Date"],
    sensitivity: "internal",
  },
  {
    key: "EffectiveDate",
    label: "Effective Date",
    category: "TIME",
    fieldPatterns: [/\b(date[\W_]*effet|effective[\W_]*date|dt[\W_]*eff)\b/i],
    variablePatterns: [/\b(dateEffet|effectiveDate|dtEff)\b/i],
    javaTypeHints: ["LocalDate", "Date"],
    sensitivity: "internal",
  },
  {
    key: "ExpirationDate",
    label: "Expiration Date",
    category: "TIME",
    fieldPatterns: [/\b(date[\W_]*expiration|expiry|expiration[\W_]*date|date[\W_]*fin[\W_]*validite)\b/i, /^DT_EXPIRATION$/i],
    variablePatterns: [/\b(dateExpiration|expiry|expirationDate|dateFinValidite)\b/i],
    javaTypeHints: ["LocalDate", "Date"],
    sensitivity: "internal",
  },
  {
    key: "LastUpdateDate",
    label: "Last Update Date",
    category: "TIME",
    fieldPatterns: [/\b(date[\W_]*modif|last[\W_]*update|updated[\W_]*at|dt[\W_]*maj|date[\W_]*mise[\W_]*a[\W_]*jour)\b/i],
    variablePatterns: [/\b(dateModif|lastUpdate|updatedAt|dtMaj|dateMiseAJour)\b/i],
    javaTypeHints: ["LocalDate", "LocalDateTime", "Date", "Timestamp"],
    sensitivity: "internal",
  },
  {
    key: "Duration",
    label: "Duration / Term",
    category: "TIME",
    fieldPatterns: [/\b(duree|term|period|duration)\b/i, /^DUR$/i, /^DUR_[A-Z]+$/i],
    variablePatterns: [/\b(duree|term|period|duration)\b/i],
    javaTypeHints: ["Integer", "Long", "int"],
    sensitivity: "internal",
  },
  {
    key: "Frequency",
    label: "Frequency",
    category: "TIME",
    fieldPatterns: [/\b(frequence|frequency|periodicite)\b/i],
    variablePatterns: [/\b(frequence|frequency|periodicite)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 6. TRANSACTION
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: "TransactionReference",
    label: "Transaction Reference / Ref ID",
    category: "TRANSACTION",
    fieldPatterns: [/\b(ref|reference|tx[\W_]*ref|ref[\W_]*transaction|num[\W_]*transaction)\b/i, /^REF$/i],
    variablePatterns: [/\b(ref|reference|txRef|transactionRef|numTransaction)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "TransactionType",
    label: "Transaction Type",
    category: "TRANSACTION",
    fieldPatterns: [/\b(type[\W_]*op|tx[\W_]*type|type[\W_]*transaction|type[\W_]*operation|typ[\W_]*ope)\b/i],
    variablePatterns: [/\b(typeOp|txType|typeTransaction|typeOperation|typOpe)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "TransactionStatus",
    label: "Transaction Status",
    category: "TRANSACTION",
    fieldPatterns: [/\b(etat|status|statut|etat[\W_]*transaction|tx[\W_]*status)\b/i, /^STA$/i],
    variablePatterns: [/\b(etat|status|statut|etatTransaction|txStatus)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "Channel",
    label: "Channel (GAB, web, agency)",
    category: "TRANSACTION",
    fieldPatterns: [/\b(canal|channel|canaux)\b/i],
    variablePatterns: [/\b(canal|channel|canaux)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "Direction",
    label: "Direction (debit/credit)",
    category: "TRANSACTION",
    fieldPatterns: [/\b(sens|direction|sens[\W_]*operation)\b/i],
    variablePatterns: [/\b(sens|direction|sensOperation)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "Counterparty",
    label: "Counterparty / Beneficiary",
    category: "TRANSACTION",
    fieldPatterns: [/\b(beneficiaire|tireur|counterparty|payee|donneur[\W_]*ordre)\b/i, /^BNF$/i, /^DON$/i],
    variablePatterns: [/\b(beneficiaire|tireur|counterparty|payee|donneurOrdre)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pii",
  },
  {
    key: "Motif",
    label: "Motif / Description",
    category: "TRANSACTION",
    fieldPatterns: [/\b(libelle|motif|description|comment|label|lib[\W_]*ope)\b/i, /^LIB$/i, /^MOT$/i],
    variablePatterns: [/\b(libelle|motif|description|comment|label|libOpe)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "AuthorizationCode",
    label: "Authorization Code",
    category: "TRANSACTION",
    fieldPatterns: [/\b(code[\W_]*autorisation|auth[\W_]*code|authorization[\W_]*code)\b/i],
    variablePatterns: [/\b(codeAutorisation|authCode|authorizationCode)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "banking-sensitive",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 7. CARD
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: "PAN",
    label: "PAN (Card Number)",
    category: "CARD",
    fieldPatterns: [/\b(pan|card[\W_]*number|num[\W_]*carte|numero[\W_]*carte)\b/i, /^PAN$/i],
    variablePatterns: [/\b(pan|cardNumber|numCarte|numeroCarte)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "pci-dss",
    formatHint: "16 chars, possibly masked",
    maxLength: 19,
  },
  {
    key: "CardType",
    label: "Card Type (CB/Visa/MC)",
    category: "CARD",
    fieldPatterns: [/\b(type[\W_]*carte|card[\W_]*brand|card[\W_]*type)\b/i],
    variablePatterns: [/\b(typeCarte|cardBrand|cardType)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "CardExpiration",
    label: "Card Expiration (MM/YY)",
    category: "CARD",
    fieldPatterns: [/\b(exp[\W_]*month|exp[\W_]*year|expiry[\W_]*date|date[\W_]*expiration[\W_]*carte)\b/i, /^DT_EXPIRATION_CARTE$/i, /^DT_EXP_CARTE$/i],
    variablePatterns: [/\b(expMonth|expYear|expiryDate|cardExpiry)\b/i],
    javaTypeHints: ["String", "Integer"],
    sensitivity: "pci-dss",
  },
  {
    key: "CVV",
    label: "CVV / CVC",
    category: "CARD",
    fieldPatterns: [/\b(cvv|cvc|cvv2|cvc2)\b/i],
    variablePatterns: [/\b(cvv|cvc|cvv2|cvc2)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "critical",
    formatHint: "3 chars — MUST NOT store in production",
  },
  {
    key: "CardStatus",
    label: "Card Status",
    category: "CARD",
    fieldPatterns: [/\b(etat[\W_]*carte|card[\W_]*status|statut[\W_]*carte)\b/i],
    variablePatterns: [/\b(etatCarte|cardStatus|statutCarte)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "CardPin",
    label: "Card PIN (hash)",
    category: "CARD",
    fieldPatterns: [/\b(pin|pin[\W_]*code|code[\W_]*pin)\b/i],
    variablePatterns: [/\b(pin|pinCode|codePin)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "critical",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 8. COMPLIANCE
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: "KycStatus",
    label: "KYC Status",
    category: "COMPLIANCE",
    fieldPatterns: [/\b(kyc|know[\W_]*your[\W_]*customer|kyc[\W_]*status)\b/i, /^STATUT_KYC$/i, /^FLAG_KYC$/i],
    variablePatterns: [/\b(kyc|kycStatus|knowYourCustomer)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "AmlFlag",
    label: "AML Flag",
    category: "COMPLIANCE",
    fieldPatterns: [/\b(aml|lcb[\W_]*ft|blanchiment|anti[\W_]*money[\W_]*laundering)\b/i, /^FLAG_AML$/i, /^FLG_AML$/i],
    variablePatterns: [/\b(aml|lcbFt|blanchiment|antiMoneyLaundering)\b/i],
    javaTypeHints: ["String", "Boolean"],
    sensitivity: "critical",
  },
  {
    key: "RiskScore",
    label: "Risk Score",
    category: "COMPLIANCE",
    fieldPatterns: [/\b(risk[\W_]*score|score[\W_]*risque|risk[\W_]*level)\b/i],
    variablePatterns: [/\b(riskScore|scoreRisque|riskLevel)\b/i],
    javaTypeHints: ["Integer", "Double", "BigDecimal"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "FatcaStatus",
    label: "FATCA Status",
    category: "COMPLIANCE",
    fieldPatterns: [/\b(fatca|fatca[\W_]*status)\b/i],
    variablePatterns: [/\b(fatca|fatcaStatus)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "banking-sensitive",
  },
  {
    key: "PepFlag",
    label: "PEP Flag",
    category: "COMPLIANCE",
    fieldPatterns: [/\b(pep|ppe|politiquement[\W_]*expose|politically[\W_]*exposed)\b/i, /^FLAG_PPE$/i, /^FLG_PPE$/i, /^FLAG_PEP$/i],
    variablePatterns: [/\b(pep|pepFlag|politiquementExpose)\b/i],
    javaTypeHints: ["String", "Boolean"],
    sensitivity: "critical",
  },
  {
    key: "SanctionsHit",
    label: "Sanctions Hit",
    category: "COMPLIANCE",
    fieldPatterns: [/\b(ofac|sanctions|world[\W_]*check|sanction[\W_]*hit)\b/i],
    variablePatterns: [/\b(ofac|sanctions|worldCheck|sanctionHit)\b/i],
    javaTypeHints: ["String", "Boolean"],
    sensitivity: "critical",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 9. SYSTEM / METADATA
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: "TechnicalId",
    label: "Technical ID (UUID/PK)",
    category: "SYSTEM",
    fieldPatterns: [/^(id|pk|uuid)$/i, /\b(technical[\W_]*id|primary[\W_]*key)\b/i],
    variablePatterns: [/^(id|pk|uuid)$/i, /\b(technicalId|primaryKey)\b/i],
    javaTypeHints: ["Long", "Integer", "String", "UUID"],
    sensitivity: "internal",
  },
  {
    key: "Version",
    label: "Version",
    category: "SYSTEM",
    fieldPatterns: [/\b(version|vers|ver)\b/i, /^VER$/i],
    variablePatterns: [/\b(version|vers)\b/i],
    javaTypeHints: ["Integer", "Long"],
    sensitivity: "internal",
  },
  {
    key: "CreatedBy",
    label: "Created By / Updated By",
    category: "SYSTEM",
    fieldPatterns: [/\b(created[\W_]*by|user[\W_]*creation|updated[\W_]*by|user[\W_]*modif|modified[\W_]*by)\b/i],
    variablePatterns: [/\b(createdBy|userCreation|updatedBy|userModif|modifiedBy)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
  {
    key: "ActiveFlag",
    label: "Active Flag",
    category: "SYSTEM",
    fieldPatterns: [/\b(actif|active|is[\W_]*active|enabled|flag[\W_]*actif)\b/i, /^FLG$/i, /^IND$/i],
    variablePatterns: [/\b(actif|active|isActive|enabled|flagActif)\b/i],
    javaTypeHints: ["Boolean", "String", "Integer"],
    sensitivity: "internal",
  },
  {
    key: "TenantId",
    label: "Tenant ID",
    category: "SYSTEM",
    fieldPatterns: [/\b(tenant|entity[\W_]*id|tenant[\W_]*id)\b/i],
    variablePatterns: [/\b(tenant|entityId|tenantId)\b/i],
    javaTypeHints: ["String", "Long"],
    sensitivity: "internal",
  },
  {
    key: "ApplicationCode",
    label: "Application Code",
    category: "SYSTEM",
    fieldPatterns: [/\b(app[\W_]*code|module[\W_]*code|application[\W_]*code|cod[\W_]*application)\b/i, /^COD_APPLICATION$/i, /^COD_APP$/i],
    variablePatterns: [/\b(appCode|moduleCode|applicationCode)\b/i],
    javaTypeHints: ["String"],
    sensitivity: "internal",
  },
];

// ─── Lookup helpers ─────────────────────────────────────────────────────────

const _byKey = new Map<string, SubConcept>();
const _byCategory = new Map<PrimaryCategory, SubConcept[]>();

for (const sc of SUB_CONCEPTS) {
  _byKey.set(sc.key, sc);
  if (!_byCategory.has(sc.category)) _byCategory.set(sc.category, []);
  _byCategory.get(sc.category)!.push(sc);
}

export function getSubConceptByKey(key: string): SubConcept | undefined {
  return _byKey.get(key);
}

export function getSubConceptsByCategory(cat: PrimaryCategory): SubConcept[] {
  return _byCategory.get(cat) || [];
}

export function getAllCategories(): PrimaryCategory[] {
  return Object.keys(CATEGORY_META) as PrimaryCategory[];
}
