/**
 * Tests de régression v8.3 — Support du pattern Strategy/Handler.
 *
 * Couvre les 7 STEPs :
 *   STEP 1: handler-pattern-detector
 *   STEP 2: domain-grouper
 *   STEP 3: dao-splitter
 *   STEP 4: http-client-detector
 *   STEP 5: model-to-entity
 *   STEP 6: envelope-replacer
 *   STEP 7: Exclusion façade Strategy
 *
 * @author Compleo
 * @since v8.3
 */

import { describe, it, expect } from "vitest";

// STEP 1: handler-pattern-detector
import {
  detectHandlerPattern,
  getMethodNameForHandler,
  getDomainForHandler,
} from "../../server/engine/detectors/handler-pattern-detector";

// STEP 2: domain-grouper
import {
  groupByDomain,
  getServiceNameForDomain,
  getControllerNameForDomain,
  getBasePathForDomain,
} from "../../server/engine/detectors/domain-grouper";

// STEP 3: dao-splitter
import {
  isGodClassDao,
  splitDao,
  generateRepositories,
} from "../../server/engine/detectors/dao-splitter";

// STEP 4: http-client-detector
import {
  isHttpClientClass,
  detectHttpClient,
  generateRestTemplateService,
} from "../../server/engine/detectors/http-client-detector";

// STEP 5: model-to-entity
import {
  scanModels,
  generateEntities,
} from "../../server/engine/detectors/model-to-entity";

// STEP 6: envelope-replacer
import {
  analyzeEnvelope,
  generateEnvelopeDtos,
  rewriteHandlerBody,
} from "../../server/engine/detectors/envelope-replacer";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const HANDLER_INTERFACE = `
package ma.eai.boa.xbanking.services.handlers;
import ma.eai.commons.services.parsing.Envelope;
public interface ActionHandler {
    Envelope handle(Envelope envIn) throws Throwable;
}
`;

const HANDLER_IMPL = `
package ma.eai.boa.xbanking.services.handlers;
import ma.eai.commons.services.parsing.Envelope;
public class TraitementMadHandler implements ActionHandler {
    public Envelope handle(Envelope envIn) throws Throwable {
        String idClient = envIn.getNodeAsString("flux/idClient");
        String montant = envIn.getNodeAsString("flux/montant");
        Envelope envOut = new Envelope();
        envOut.setNodeValue("flux/result", "OK");
        envOut.setNodeValue("flux/reference", "REF123");
        return envOut;
    }
}
`;

const HANDLER_FACTORY = `
package ma.eai.boa.xbanking.services.handlers;
public class ActionHandlerFactory {
    public static ActionHandler getHandler(String action) {
        switch(action) {
            case "TRAITEMENT_MAD": return new TraitementMadHandler();
            case "ANNULATION_MAD": return new AnnulationMadHandler();
            case "LISTE_ATTENTE": return new ListeAttenteHandler();
            default: throw new IllegalArgumentException("Unknown action: " + action);
        }
    }
}
`;

const HANDLER_IMPL_2 = `
package ma.eai.boa.xbanking.services.handlers;
import ma.eai.commons.services.parsing.Envelope;
public class AnnulationMadHandler implements ActionHandler {
    public Envelope handle(Envelope envIn) throws Throwable {
        String reference = envIn.getNodeAsString("flux/reference");
        Envelope envOut = new Envelope();
        envOut.setNodeValue("flux/result", "ANNULE");
        return envOut;
    }
}
`;

const HANDLER_IMPL_3 = `
package ma.eai.boa.xbanking.services.handlers;
import ma.eai.commons.services.parsing.Envelope;
public class ListeAttenteHandler implements ActionHandler {
    public Envelope handle(Envelope envIn) throws Throwable {
        String idClient = envIn.getNodeAsString("flux/idClient");
        Envelope envOut = new Envelope();
        envOut.setNodeValue("flux/liste", "[]");
        return envOut;
    }
}
`;

const FACADE_EJB = `
package ma.eai.boa.xbanking.services;
import ma.eai.commons.services.parsing.Envelope;
public class MadServices {
    public Envelope process(Envelope envIn) {
        String action = envIn.getNodeAsString("flux/action");
        ActionHandler handler = ActionHandlerFactory.getHandler(action);
        return handler.handle(envIn);
    }
}
`;

const GOD_DAO = `
package org.eai.MadUnitaire.hibernate.dao;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
public class HibernateDao {
    public static String NUMIDENTITE = "NUM_IDENTITE";
    public static String UPDATEMADQUERY = "UPDATE MAD_MAD ";
    public static CompteClient getTierFromCpt(String compte, Connection connexion) throws Exception {
        // SELECT * FROM V_TIERS WHERE COMPTE = ?
        return null;
    }
    public static CompteClient getCompteClient(String rib, Connection connexion) throws SQLException {
        // SELECT * FROM COMPTE_CLIENT WHERE RIB = ?
        return null;
    }
    public static List<MadBeneficiaire> getListBenef(String idClient, Connection connexion) throws Exception {
        // SELECT * FROM MAD_BENEFICIAIRE WHERE ID_CLIENT = ?
        return null;
    }
    public static String insertMadDTV(String reference, String compte, Connection connexion) throws SQLException {
        // INSERT INTO MAD_MAD (REFERENCE, COMPTE) VALUES (?, ?)
        return "OK";
    }
    public static String annulMad(String ref, Connection connexionEbankDirect) throws SQLException {
        // UPDATE MAD_MAD SET STATUT = 'ANNULE' WHERE REFERENCE = ?
        return "OK";
    }
    public static MadPlafondMontant controlMontant(String marche, Connection connexion) throws SQLException {
        // SELECT * FROM MAD_PLAFOND WHERE MARCHE = ?
        return null;
    }
}
`;

const HTTP_CLIENT = `
package ma.eai.boa.xbanking.madCore;
import java.net.HttpURLConnection;
import java.io.InputStream;
import com.google.gson.Gson;
import ma.eai.commons.services.uddi.UddiClient;
public class MADCore {
    public MADCore() {}
    public GenericResponse<AuthResponse> auth() throws Exception {
        // HTTP POST /auth
        return null;
    }
    public GenericResponse<MADCoreDTO[]> listeAttenteMAD(String[] comptes, String token) throws Exception {
        // HTTP POST /mad/attente
        return null;
    }
    public GenericResponse<AnnulationResponse> annuler(String ref, String utilisateur, String centreFrais, String token) throws Exception {
        // HTTP POST /mad/annulation
        return null;
    }
    public InputStream executeCall(String method, String path, String body) throws Exception {
        return null;
    }
}
`;

const MODEL_ENTITY = `
package ma.eai.boa.xbanking.Model;
public class CompteClient {
    private String rib;
    private String nom;
    private String prenom;
    private double solde;
    public String getRib() { return rib; }
    public void setRib(String rib) { this.rib = rib; }
}
`;

const MODEL_DTO = `
package ma.eai.boa.xbanking.madCore.DTO.Request;
public class Emission {
    private String compte;
    private String montant;
    private String beneficiaire;
}
`;

// ─── STEP 1: handler-pattern-detector ───────────────────────────────────────

describe("v8.3 STEP 1: handler-pattern-detector", () => {
  it("détecte le pattern Strategy/Handler avec interface + impls + factory", () => {
    const files = [
      { path: "handlers/ActionHandler.java", content: HANDLER_INTERFACE },
      { path: "handlers/TraitementMadHandler.java", content: HANDLER_IMPL },
      { path: "handlers/AnnulationMadHandler.java", content: HANDLER_IMPL_2 },
      { path: "handlers/ListeAttenteHandler.java", content: HANDLER_IMPL_3 },
      { path: "handlers/ActionHandlerFactory.java", content: HANDLER_FACTORY },
      { path: "services/MadServices.java", content: FACADE_EJB },
    ];
    const result = detectHandlerPattern(files);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.interfaceClass).toBe("ActionHandler");
    expect(result!.handlers.length).toBeGreaterThanOrEqual(3);
  });

  it("retourne null si aucun handler pattern n'est trouvé", () => {
    const files = [
      { path: "services/SimpleService.java", content: "public class SimpleService { public void doStuff() {} }" },
    ];
    const result = detectHandlerPattern(files);
    expect(result === null || result.detected === false).toBe(true);
  });

  it("getMethodNameForHandler extrait un nom de méthode correct", () => {
    expect(getMethodNameForHandler("TraitementMadHandler")).toBe("traiterMad");
    expect(getMethodNameForHandler("AnnulationMadHandler")).toBe("annulerMad");
    expect(getMethodNameForHandler("AddBeneficiariHandler")).toBe("ajouterBeneficiari");
  });

  it("getDomainForHandler retourne le domaine métier correct", () => {
    expect(getDomainForHandler("TraitementMadHandler")).toBe("mad-operation");
    expect(getDomainForHandler("ListeAttenteHandler")).toBe("mad-consultation");
    expect(getDomainForHandler("AddBeneficiariHandler")).toBe("beneficiaire");
  });
});

// ─── STEP 2: domain-grouper ────────────────────────────────────────────────

describe("v8.3 STEP 2: domain-grouper", () => {
  it("groupByDomain regroupe les useCases par domaine", () => {
    const useCases = [
      { domain: "mad-operation", className: "TraitementMadHandler_traiterMad" },
      { domain: "mad-operation", className: "AnnulationMadHandler_annulerMad" },
      { domain: "beneficiaire", className: "AddBeneficiariHandler_ajouterBeneficiari" },
    ] as any[];

    const groups = groupByDomain(useCases);
    expect(groups.size).toBe(2);
    expect(groups.get("mad-operation")!.useCases.length).toBe(2);
    expect(groups.get("beneficiaire")!.useCases.length).toBe(1);
  });

  it("getServiceNameForDomain retourne le bon nom de service", () => {
    expect(getServiceNameForDomain("mad-operation")).toBe("MadOperationService");
    expect(getServiceNameForDomain("beneficiaire")).toBe("BeneficiaireService");
    expect(getServiceNameForDomain("unknown-domain")).toBe("UnknownDomainService");
  });

  it("getBasePathForDomain retourne le bon path REST", () => {
    expect(getBasePathForDomain("mad-operation")).toBe("/api/v1/mad-operations");
    expect(getBasePathForDomain("client")).toBe("/api/v1/clients");
  });
});

// ─── STEP 3: dao-splitter ──────────────────────────────────────────────────

describe("v8.3 STEP 3: dao-splitter", () => {
  it("isGodClassDao détecte un DAO avec >5 méthodes statiques + Connection", () => {
    expect(isGodClassDao(GOD_DAO, "HibernateDao")).toBe(true);
  });

  it("isGodClassDao retourne false pour une classe simple", () => {
    expect(isGodClassDao("public class SimpleService { public void doStuff() {} }", "SimpleService")).toBe(false);
  });

  it("splitDao décompose HibernateDao en repositories par entité", () => {
    const result = splitDao(GOD_DAO, "HibernateDao");
    expect(result.originalClass).toBe("HibernateDao");
    expect(result.totalMethods).toBeGreaterThanOrEqual(5);
    expect(result.repositories.length).toBeGreaterThanOrEqual(2);

    // Vérifier que CompteClient et MadMad ont des repositories séparés
    const repoNames = result.repositories.map(r => r.repositoryName);
    expect(repoNames.some(n => /Compte/i.test(n))).toBe(true);
  });

  it("generateRepositories génère des fichiers Java valides", () => {
    const result = splitDao(GOD_DAO, "HibernateDao");
    const files = generateRepositories(result, "com.example.app", "src/main/java/com/example/app");
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      expect(f.path).toContain("Repository.java");
      expect(f.content).toContain("@Repository");
      expect(f.content).toContain("JdbcTemplate");
    }
  });
});

// ─── STEP 4: http-client-detector ──────────────────────────────────────────

describe("v8.3 STEP 4: http-client-detector", () => {
  it("isHttpClientClass détecte MADCore comme client HTTP", () => {
    expect(isHttpClientClass(HTTP_CLIENT, "MADCore")).toBe(true);
  });

  it("detectHttpClient extrait les méthodes publiques (pas executeCall)", () => {
    const result = detectHttpClient(HTTP_CLIENT, "MADCore");
    expect(result.className).toBe("MADCore");
    expect(result.usesGson).toBe(true);
    expect(result.usesUddi).toBe(true);
    // executeCall est un utilitaire, ne doit pas être dans les méthodes
    const methodNames = result.methods.map(m => m.name);
    expect(methodNames).not.toContain("executeCall");
    expect(methodNames).toContain("auth");
    expect(methodNames).toContain("annuler");
  });

  it("generateRestTemplateService génère un service Spring valide", () => {
    const detection = detectHttpClient(HTTP_CLIENT, "MADCore");
    const file = generateRestTemplateService(detection, "com.example.app", "src/main/java/com/example/app");
    expect(file.path).toContain("IntegrationService.java");
    expect(file.content).toContain("@Service");
    expect(file.content).toContain("RestTemplate");
    expect(file.content).toContain("mad.core.base-url");
  });
});

// ─── STEP 5: model-to-entity ───────────────────────────────────────────────

describe("v8.3 STEP 5: model-to-entity", () => {
  it("scanModels classifie CompteClient comme entity et Emission comme dto", () => {
    const files = [
      { path: "Model/CompteClient.java", content: MODEL_ENTITY },
      { path: "DTO/Request/Emission.java", content: MODEL_DTO },
    ];
    const result = scanModels(files);
    expect(result.entities.length).toBe(1);
    expect(result.entities[0].className).toBe("CompteClient");
    expect(result.dtos.length).toBe(1);
    expect(result.dtos[0].className).toBe("Emission");
  });

  it("generateEntities génère des fichiers JPA Entity avec @Entity et @Table", () => {
    const files = [{ path: "Model/CompteClient.java", content: MODEL_ENTITY }];
    const result = scanModels(files);
    const entityFiles = generateEntities(result, "com.example.app", "src/main/java/com/example/app");
    expect(entityFiles.length).toBe(1);
    expect(entityFiles[0].content).toContain("@Entity");
    expect(entityFiles[0].content).toContain("@Table");
    expect(entityFiles[0].content).toContain("COMPTE_CLIENT");
  });
});

// ─── STEP 6: envelope-replacer ─────────────────────────────────────────────

describe("v8.3 STEP 6: envelope-replacer", () => {
  it("analyzeEnvelope extrait les champs input et output", () => {
    const analysis = analyzeEnvelope("TraitementMadHandler", HANDLER_IMPL);
    expect(analysis.inputFields.length).toBe(2); // idClient, montant
    expect(analysis.outputFields.length).toBe(2); // result, reference
    expect(analysis.requestDtoName).toBe("TraitementMadRequestDTO");
    expect(analysis.responseDtoName).toBe("TraitementMadResponseDTO");
  });

  it("generateEnvelopeDtos génère des DTOs Request et Response", () => {
    const analysis = analyzeEnvelope("TraitementMadHandler", HANDLER_IMPL);
    const files = generateEnvelopeDtos(analysis, "com.example.app", "src/main/java/com/example/app");
    expect(files.length).toBe(2);
    const reqDto = files.find(f => f.path.includes("RequestDTO"));
    const resDto = files.find(f => f.path.includes("ResponseDTO"));
    expect(reqDto).toBeDefined();
    expect(resDto).toBeDefined();
    expect(reqDto!.content).toContain("idClient");
    expect(reqDto!.content).toContain("montant");
    expect(resDto!.content).toContain("result");
    expect(resDto!.content).toContain("reference");
  });

  it("rewriteHandlerBody remplace getNodeAsString par des getters DTO", () => {
    const analysis = analyzeEnvelope("TraitementMadHandler", HANDLER_IMPL);
    const body = `String idClient = envIn.getNodeAsString("flux/idClient");`;
    const rewritten = rewriteHandlerBody(body, analysis);
    expect(rewritten).toContain("request.getIdClient()");
    expect(rewritten).not.toContain("getNodeAsString");
  });
});

// ─── STEP 7: Exclusion façade Strategy ─────────────────────────────────────

describe("v8.3 STEP 7: Exclusion façade Strategy", () => {
  it("la façade MadServices est détectée et exclue des handlers", () => {
    const files = [
      { path: "handlers/ActionHandler.java", content: HANDLER_INTERFACE },
      { path: "handlers/TraitementMadHandler.java", content: HANDLER_IMPL },
      { path: "handlers/AnnulationMadHandler.java", content: HANDLER_IMPL_2 },
      { path: "handlers/ListeAttenteHandler.java", content: HANDLER_IMPL_3 },
      { path: "handlers/ActionHandlerFactory.java", content: HANDLER_FACTORY },
      { path: "services/MadServices.java", content: FACADE_EJB },
    ];
    const result = detectHandlerPattern(files);
    expect(result).not.toBeNull();
    // La façade ne doit pas être dans les handlers
    const handlerNames = result!.handlers.map(h => h.className);
    expect(handlerNames).not.toContain("MadServices");
    // facadeClass doit être identifié
    expect(result!.facadeClass).toBeTruthy();
  });
});
