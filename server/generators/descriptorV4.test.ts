import { describe, it, expect } from "vitest";
import { domainFromText, isTestPath, parseResource } from "./descriptorGenerator";

const RESOURCE = `
@Path("/synchrone")
public class SynchroneResource {

    /**
     * Endpoint REST pour le code fonction <b>historyCmd</b>.
     */
    @GET
    @Path("/history-cmd")
    public Response historycmd(@QueryParam("numAccount") String numAccount) {
        return null;
    }

    /**
     * Endpoint REST pour le code fonction <b>LSTCRTS</b>.
     */
    @GET
    @Path("/test/lstcrts--tst")
    public Response lstcrtststTest(@Context UriInfo uriInfo) {
        return null;
    }
}
`;

describe("descripteur format 4", () => {
  it("lit le code fonction, les parametres de requete et les fonctions de test", async () => {
    const [history, test] = await parseResource(RESOURCE, new Map());
    expect(history.fonction).toBe("historyCmd");
    expect(history.path).toBe("/api/synchrone/history-cmd");
    expect(history.query_params).toEqual([{ name: "numAccount", type: "String", required: false }]);
    expect(history.request_fields).toEqual([]);
    expect(history.idempotence).toBe("sans");
    expect(history.test).toBe(false);
    expect(test.fonction).toBe("LSTCRTS");
    expect(test.test).toBe(true);
    expect(test.query_libre).toBe(true);
  });

  it("reconnait les chemins de test", () => {
    expect(isTestPath("/api/synchrone/test/lstcrts--tst")).toBe(true);
    expect(isTestPath("/api/synchrone/lsttrs--tst44")).toBe(true);
    expect(isTestPath("/api/synchrone/recalculpin--test")).toBe(true);
    expect(isTestPath("/api/synchrone/testrib")).toBe(false);
  });

  it("deduit le domaine de l'adresse GitLab du pom", () => {
    expect(domainFromText("<url>https://pic.ref.eurafric.com/gitlab/DVC/DGT/NEOBANK/CARD_CASE/neobank-x.git</url>")).toBe("card-case");
    expect(domainFromText("<url>git@h:autre/depot.git</url>")).toBe("");
  });
});
