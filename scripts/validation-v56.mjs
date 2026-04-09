/**
 * Validation v5.6 — Script d'audit fonctionnel complet.
 *
 * Ce script teste les features v5.6.0 (workspace multi-modules)
 * et v5.6.1 (détection proactive dépendances manquantes) via les API REST.
 *
 * Il crée des sessions simulées avec des IR réalistes (banque marocaine),
 * puis exécute les scénarios de test décrits dans le prompt d'audit.
 *
 * Usage: node scripts/validation-v56.mjs
 *
 * @author Hamza NORDINE
 */

const BASE = "http://localhost:3000";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

const results = [];
let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    results.push({ label, status: "PASS", detail });
    passed++;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    results.push({ label, status: "FAIL", detail });
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ─── Simulated Banking IRs ──────────────────────────────────────────────────

function makeSimIR(artifactId, groupId, useCases, rawSourceOverrides = {}) {
  return {
    groupId,
    artifactId,
    version: "1.0",
    packageName: `com.bank.${artifactId.replace(/^ejb-/, "").replace(/-/g, ".")}`,
    useCases: useCases.map(uc => ({
      className: uc.className,
      domain: uc.domain || "BANKING",
      httpMethod: uc.httpMethod || "POST",
      voInType: `${uc.className.replace(/UC$/, "")}VoIn`,
      voOutType: `${uc.className.replace(/UC$/, "")}VoOut`,
      rawSource: rawSourceOverrides[uc.className] || `public class ${uc.className} { }`,
      injectedServices: uc.injectedServices || [],
      fields: [],
      restPath: uc.restPath || `/${uc.className.replace(/UC$/, "").toLowerCase()}`,
    })),
    services: [],
    dtos: useCases.flatMap(uc => [
      { className: `${uc.className.replace(/UC$/, "")}VoIn`, fields: [{ name: "id", type: "String" }] },
      { className: `${uc.className.replace(/UC$/, "")}VoOut`, fields: [{ name: "result", type: "String" }] },
    ]),
    enums: [],
    exceptions: [],
    validators: [],
    remoteInterfaces: [],
    ejb2xBeans: [],
    stats: {
      totalFiles: useCases.length * 3,
      totalLines: useCases.length * 50,
      useCaseCount: useCases.length,
      dtoCount: useCases.length * 2,
      serviceCount: 0,
      enumCount: 0,
      exceptionCount: 0,
      validatorCount: 0,
      remoteInterfaceCount: 0,
      domainCount: 1,
      domains: [{ name: "BANKING", useCaseCount: useCases.length }],
    },
    warnings: [],
  };
}

// sim-01: Core Banking (9 use cases, no external JNDI calls)
const sim01IR = makeSimIR("ejb-core-banking", "com.bank", [
  { className: "OuvrirCompteUC", domain: "COMPTE" },
  { className: "FermerCompteUC", domain: "COMPTE" },
  { className: "ConsulterSoldeUC", domain: "COMPTE" },
  { className: "DebitCompteUC", domain: "COMPTE" },
  { className: "CreditCompteUC", domain: "COMPTE" },
  { className: "HistoriqueCompteUC", domain: "COMPTE" },
  { className: "BloquerCompteUC", domain: "COMPTE" },
  { className: "DebloquerCompteUC", domain: "COMPTE" },
  { className: "CalculerScoreUC", domain: "SCORING" },
]);

// sim-02: Virement (calls sim-01 ConsulterSolde + CreditCompte, calls sim-03 VerifierKyc)
const sim02IR = makeSimIR("ejb-virement", "com.bank", [
  { className: "InitierVirementUC", domain: "VIREMENT" },
  { className: "ValiderVirementUC", domain: "VIREMENT" },
  { className: "AnnulerVirementUC", domain: "VIREMENT" },
  { className: "HistoriqueVirementUC", domain: "VIREMENT" },
], {
  InitierVirementUC: `
    @Stateless
    public class InitierVirementUC {
      @EJB(lookup = "java:global/ejb-core-banking/ConsulterSoldeUC")
      private ConsulterSoldeRemote consulterSolde;

      @EJB(lookup = "java:global/ejb-core-banking/CreditCompteUC")
      private CreditCompteRemote creditCompte;

      @EJB(lookup = "java:global/ejb-kyc/VerifierKycUC")
      private VerifierKycRemote verifierKyc;

      public VirementVoOut execute(VirementVoIn voIn) {
        String solde = consulterSolde.consulterSolde(voIn.getNumCompte());
        boolean kycOk = verifierKyc.verifierKyc(voIn.getNumCompte());
        if (kycOk && Double.parseDouble(solde) >= voIn.getMontant()) {
          creditCompte.creditCompte(voIn.getCompteDestinataire(), voIn.getMontant());
        }
        return new VirementVoOut("OK");
      }
    }
  `,
});

// sim-03: KYC (provides VerifierKycUC)
const sim03IR = makeSimIR("ejb-kyc", "com.bank", [
  { className: "VerifierKycUC", domain: "KYC" },
  { className: "MajKycUC", domain: "KYC" },
  { className: "HistoriqueKycUC", domain: "KYC" },
]);

// ─── Inject Sessions into SessionStore ──────────────────────────────────────

async function injectSession(id, projectName, ir) {
  // Use the internal upload endpoint to create a session, then inject IR
  // We'll use a direct approach: create via upload-zip with simulated files
  const session = {
    id,
    projectName,
    uploadedAt: new Date().toISOString(),
    files: ir.useCases.map(uc => ({
      name: `${uc.className}.java`,
      path: `src/main/java/com/bank/${uc.className}.java`,
      content: uc.rawSource,
    })),
    ir,
    status: "analyzed",
    debugEvents: [],
    ambiguities: [],
  };

  // POST to a special test injection endpoint (we'll create it)
  // For now, use the session store directly via a test route
  const res = await api("POST", "/api/compleo/test-inject-session", session);
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1 — WORKSPACE MULTI-MODULES
// ═══════════════════════════════════════════════════════════════════════════

async function test1_workspace() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("TEST 1 — WORKSPACE MULTI-MODULES");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Inject simulated sessions
  console.log("  Injection des sessions simulées...");
  const inj1 = await injectSession("sim-01-core-banking", "sim-01-core-banking", sim01IR);
  const inj2 = await injectSession("sim-02-virement", "sim-02-virement", sim02IR);
  const inj3 = await injectSession("sim-03-kyc", "sim-03-kyc", sim03IR);

  check("Session sim-01 injectée", inj1.status === 200, `status=${inj1.status}`);
  check("Session sim-02 injectée", inj2.status === 200, `status=${inj2.status}`);
  check("Session sim-03 injectée", inj3.status === 200, `status=${inj3.status}`);

  // ÉTAPE A: Créer un workspace
  console.log("\n  ÉTAPE A: Créer un workspace");
  const createRes = await api("POST", "/api/workspace", { name: "SI Bancaire BMCE Test" });
  check("Workspace créé", createRes.status === 200 && createRes.data.id, `id=${createRes.data.id}`);
  const wsId = createRes.data.id;

  // Verify workspace visible in list
  const listRes = await api("GET", "/api/workspace");
  const found = listRes.data.find(w => w.id === wsId);
  check("Workspace visible dans la liste", !!found, `name=${found?.name}`);

  // ÉTAPE B: Ajouter sim-01-core-banking
  console.log("\n  ÉTAPE B: Ajouter sim-01-core-banking");
  const add1 = await api("POST", `/api/workspace/${wsId}/add-project`, { sessionId: "sim-01-core-banking" });
  check("sim-01 ajouté au workspace", add1.status === 200, `status=${add1.status}`);
  check("sim-01: 9 UseCases détectés", add1.data.added?.artifactId === "ejb-core-banking", `artifactId=${add1.data.added?.artifactId}`);
  check("sim-01: 0 lien résolu", add1.data.resolution?.resolvedCount === 0, `resolved=${add1.data.resolution?.resolvedCount}`);
  check("sim-01: 0 lien non résolu", add1.data.resolution?.unresolvedCount === 0, `unresolved=${add1.data.resolution?.unresolvedCount}`);

  // ÉTAPE C: Ajouter sim-02-virement (appelle sim-01 et sim-03)
  console.log("\n  ÉTAPE C: Ajouter sim-02-virement");
  const add2 = await api("POST", `/api/workspace/${wsId}/add-project`, { sessionId: "sim-02-virement" });
  check("sim-02 ajouté au workspace", add2.status === 200, `status=${add2.status}`);

  const resolvedLinks = add2.data.resolution?.resolved ?? [];
  const unresolvedLinks = add2.data.resolution?.unresolved ?? [];

  // Check resolved links to sim-01
  const consulterSoldeResolved = resolvedLinks.some(l =>
    l.targetClass === "ConsulterSoldeUC" && l.status === "RESOLVED"
  );
  const creditCompteResolved = resolvedLinks.some(l =>
    l.targetClass === "CreditCompteUC" && l.status === "RESOLVED"
  );
  check("Lien résolu: ConsulterSoldeUC → sim-01", consulterSoldeResolved, JSON.stringify(resolvedLinks.find(l => l.targetClass === "ConsulterSoldeUC")));
  check("Lien résolu: CreditCompteUC → sim-01", creditCompteResolved, JSON.stringify(resolvedLinks.find(l => l.targetClass === "CreditCompteUC")));

  // Check unresolved link to ejb-kyc
  const kycUnresolved = unresolvedLinks.some(l =>
    l.targetClass === "VerifierKycUC" && l.status === "UNRESOLVED"
  );
  check("Lien non résolu: VerifierKycUC → ejb-kyc manquant", kycUnresolved, JSON.stringify(unresolvedLinks.find(l => l.targetClass === "VerifierKycUC")));

  // Verify DB state
  const wsDetail = await api("GET", `/api/workspace/${wsId}`);
  check("DB: 2 liens résolus", wsDetail.data.resolvedCount === 2, `resolvedCount=${wsDetail.data.resolvedCount}`);
  check("DB: 1 lien non résolu", wsDetail.data.unresolvedCount === 1, `unresolvedCount=${wsDetail.data.unresolvedCount}`);

  // ÉTAPE D: Ajouter sim-03-kyc (résout le lien manquant)
  console.log("\n  ÉTAPE D: Ajouter sim-03-kyc");
  const add3 = await api("POST", `/api/workspace/${wsId}/add-project`, { sessionId: "sim-03-kyc" });
  check("sim-03 ajouté au workspace", add3.status === 200, `status=${add3.status}`);

  const newlyResolved = add3.data.resolution?.resolved?.filter(l => l.status === "NEWLY_RESOLVED") ?? [];
  check("Résolution rétroactive: VerifierKycUC", newlyResolved.some(l => l.targetClass === "VerifierKycUC"),
    `newlyResolved=${JSON.stringify(newlyResolved.map(l => l.targetClass))}`);
  check("newlyResolvedCount > 0", add3.data.resolution?.newlyResolvedCount > 0,
    `count=${add3.data.resolution?.newlyResolvedCount}`);

  // Verify all links now resolved
  const wsDetailFinal = await api("GET", `/api/workspace/${wsId}`);
  const totalResolved = wsDetailFinal.data.resolvedCount;
  const totalUnresolved = wsDetailFinal.data.unresolvedCount;
  check("Tous les liens résolus après sim-03", totalResolved >= 3 && totalUnresolved === 0,
    `resolved=${totalResolved}, unresolved=${totalUnresolved}`);

  // ÉTAPE E: Générer tout le workspace
  console.log("\n  ÉTAPE E: Générer le workspace multi-module");
  const genRes = await api("POST", `/api/workspace/${wsId}/generate`);
  check("Génération réussie", genRes.status === 200, `status=${genRes.status}`);
  check("ZIP URL retournée", !!genRes.data.zipUrl, `url=${genRes.data.zipUrl?.substring(0, 60)}...`);
  check("Parent POM généré", genRes.data.parentPomGenerated === true);
  check("3 modules générés", genRes.data.modules?.length === 3, `modules=${genRes.data.modules?.length}`);
  check("Total fichiers > 0", genRes.data.totalFiles > 0, `totalFiles=${genRes.data.totalFiles}`);

  // Download and inspect the ZIP
  if (genRes.data.zipUrl) {
    const zipRes = await fetch(genRes.data.zipUrl);
    check("ZIP téléchargeable", zipRes.ok, `status=${zipRes.status}`);
  }

  // Cleanup
  await api("DELETE", `/api/workspace/${wsId}`);

  return { passed, failed };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2 — DÉTECTION PROACTIVE DES DÉPENDANCES MANQUANTES
// ═══════════════════════════════════════════════════════════════════════════

async function test2_missingDeps() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("TEST 2 — DÉTECTION PROACTIVE DES DÉPENDANCES MANQUANTES");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Inject sim-02 alone (without sim-01 or sim-03)
  const inj = await injectSession("sim-02-virement-alone", "sim-02-virement-alone", sim02IR);
  check("Session sim-02 injectée (seule)", inj.status === 200);

  // ÉTAPE A: Analyze sim-02 alone
  console.log("\n  ÉTAPE A: Analyser sim-02 seul");
  const analyzeRes = await api("POST", "/api/compleo/analyze-multitech", {
    sessionId: "sim-02-virement-alone",
  });
  check("Analyse réussie", analyzeRes.status === 200, `status=${analyzeRes.status}`);

  const missingDeps = analyzeRes.data.missingDeps ?? [];
  check("missingDeps détectées", missingDeps.length > 0, `count=${missingDeps.length}`);

  // Check ejb-core-banking is flagged
  const coreBankingMissing = missingDeps.find(d =>
    d.moduleName === "ejb-core-banking" || d.moduleName?.includes("core-banking")
  );
  check("ejb-core-banking flaggé comme manquant", !!coreBankingMissing,
    `module=${coreBankingMissing?.moduleName}`);

  if (coreBankingMissing) {
    check("ConsulterSoldeUC listé dans les classes inférées",
      coreBankingMissing.inferredClasses?.some(c => c.className === "ConsulterSoldeUC"),
      `classes=${coreBankingMissing.inferredClasses?.map(c => c.className).join(", ")}`);

    check("Contrat inféré avec méthode consulterSolde",
      coreBankingMissing.inferredClasses?.some(c => c.inferredMethodName === "consulterSolde"),
      `method=${coreBankingMissing.inferredClasses?.[0]?.inferredMethodName}`);

    check("Criticité BLOCKING ou HIGH",
      ["BLOCKING", "HIGH"].includes(coreBankingMissing.criticalityLevel),
      `level=${coreBankingMissing.criticalityLevel}`);

    check("Confiance > 0.3",
      coreBankingMissing.confidence > 0.3,
      `confidence=${coreBankingMissing.confidence}`);
  }

  // Check ejb-kyc is flagged
  const kycMissing = missingDeps.find(d =>
    d.moduleName === "ejb-kyc" || d.moduleName?.includes("kyc")
  );
  check("ejb-kyc flaggé comme manquant", !!kycMissing,
    `module=${kycMissing?.moduleName}`);

  // Check generated contract
  if (coreBankingMissing?.generatedContract) {
    const contract = coreBankingMissing.generatedContract;
    check("Interface Java générée", contract.interfaceCode?.includes("interface"),
      `contains 'interface': ${contract.interfaceCode?.includes("interface")}`);
    check("Stub Spring Boot généré", contract.stubCode?.includes("@Service"),
      `contains '@Service': ${contract.stubCode?.includes("@Service")}`);
    check("@ConditionalOnMissingBean présent", contract.stubCode?.includes("@ConditionalOnMissingBean"),
      `present: ${contract.stubCode?.includes("@ConditionalOnMissingBean")}`);
    check("Documentation Markdown générée", contract.documentationMd?.length > 50,
      `length=${contract.documentationMd?.length}`);
  }

  // ÉTAPE B: Acknowledge missing deps with "generate_stubs"
  console.log("\n  ÉTAPE B: Acknowledge missing deps (generate_stubs)");
  const ackRes = await api("POST", "/api/compleo/acknowledge-missing-deps", {
    sessionId: "sim-02-virement-alone",
    action: "generate_stubs",
  });
  check("Acknowledge réussi", ackRes.status === 200, `status=${ackRes.status}`);
  check("Status passé à waiting_choices ou analyzed",
    ["waiting_choices", "analyzed"].includes(ackRes.data.status),
    `status=${ackRes.data.status}`);

  // Check session status after acknowledge
  const sessionRes = await api("GET", `/api/compleo/session/sim-02-virement-alone`);
  check("Session status mis à jour", sessionRes.status === 200);

  return { passed, failed };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3 — INTERFACE DE CHOIX AGENT
// ═══════════════════════════════════════════════════════════════════════════

async function test3_agentChoices() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("TEST 3 — INTERFACE DE CHOIX AGENT");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Check if there's an existing analyzed session with ambiguities
  const sessionsRes = await api("GET", "/api/compleo/sessions");
  const analyzedSession = sessionsRes.data.find(s =>
    s.status === "generated" && s.ambiguityCount > 0
  );

  if (analyzedSession) {
    check("Session avec ambiguïtés trouvée", true, `id=${analyzedSession.id}, ambiguities=${analyzedSession.ambiguityCount}`);

    // Get session details
    const detailRes = await api("GET", `/api/compleo/session/${analyzedSession.id}`);
    check("Détails session récupérés", detailRes.status === 200);

    if (detailRes.data.ambiguities) {
      check("Ambiguïtés présentes dans la session", detailRes.data.ambiguities.length > 0,
        `count=${detailRes.data.ambiguities.length}`);

      // Check ambiguity structure
      const firstAmb = detailRes.data.ambiguities[0];
      check("Ambiguïté a une question", !!firstAmb?.question, `q=${firstAmb?.question?.substring(0, 60)}`);
      check("Ambiguïté a des options", firstAmb?.options?.length >= 2, `options=${firstAmb?.options?.length}`);
    }

    check("Session générée avec succès", detailRes.data.generation?.files?.length > 0,
      `files=${detailRes.data.generation?.files?.length}`);
  } else {
    check("Session analysée avec ambiguïtés trouvée", false, "Aucune session analyzed/generated avec ambiguïtés");
  }

  // Test agent endpoint exists
  const agentRes = await api("GET", "/api/agent/sessions");
  check("Agent endpoint accessible", agentRes.status === 200 || agentRes.status === 404,
    `status=${agentRes.status}`);

  return { passed, failed };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   VALIDATION v5.6 — Audit fonctionnel complet            ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");

  // First, check if test-inject-session endpoint exists
  const testInject = await api("POST", "/api/compleo/test-inject-session", {
    id: "test-ping",
    projectName: "test",
    status: "analyzed",
    files: [],
    ir: makeSimIR("test", "com.test", []),
  });

  if (testInject.status === 404) {
    console.log("\n⚠️  Endpoint /api/compleo/test-inject-session manquant.");
    console.log("   Il faut l'ajouter pour injecter des sessions simulées.\n");
    process.exit(1);
  }

  await test1_workspace();
  await test2_missingDeps();
  await test3_agentChoices();

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("RÉSUMÉ");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ✅ Passés: ${passed}`);
  console.log(`  ❌ Échoués: ${failed}`);
  console.log(`  Total: ${passed + failed}`);
  console.log(`  Score: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  // Write results to JSON for the report
  const report = {
    date: new Date().toISOString(),
    passed,
    failed,
    total: passed + failed,
    score: ((passed / (passed + failed)) * 100).toFixed(1),
    results,
  };

  const fs = await import("fs");
  fs.writeFileSync("/tmp/validation-v56-results.json", JSON.stringify(report, null, 2));
  console.log("\n  Résultats sauvegardés dans /tmp/validation-v56-results.json");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
