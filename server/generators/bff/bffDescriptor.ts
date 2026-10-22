/**
 * Lecture et validation du descripteur d'endpoints au format 4, entrée du générateur
 * de couche API sur le squelette archetype-bff-api.
 */

export interface BffField {
  name: string;
  type: string;
  required?: boolean;
  isList?: boolean;
  children?: BffField[];
}

export interface BffReturnCodes {
  succes?: string[];
  metier?: string[];
  saisie?: string[];
}

export interface BffEndpoint {
  fonction: string;
  operation: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  test: boolean;
  exposer: boolean;
  idempotence: "cle" | "sans";
  query_params: BffField[];
  query_libre?: boolean;
  request_fields: BffField[];
  response_fields: BffField[];
  codes_retour?: BffReturnCodes;
  securite?: { ressource?: string };
}

export interface BffDescriptor {
  format: 4;
  adapter_name: string;
  adapter_base_url: string;
  bian: { service_domain: string };
  codes_retour: BffReturnCodes;
  securite?: { ressource?: string };
  endpoints: BffEndpoint[];
}

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

/**
 * Valide un descripteur brut et le complète des valeurs par défaut. Lève une erreur
 * dont le message nomme le descripteur et le champ fautif.
 */
export function parseBffDescriptor(raw: unknown, source: string): BffDescriptor {
  const fail = (msg: string): never => {
    throw new Error(`Descripteur ${source} : ${msg}`);
  };
  if (!raw || typeof raw !== "object") fail("contenu JSON attendu");
  const d = raw as Record<string, any>;
  if (d.format !== 4) fail("format 4 attendu, regénérer le descripteur depuis le dépôt exposé");
  if (typeof d.adapter_name !== "string" || !d.adapter_name.startsWith("neobank-")) {
    fail("adapter_name doit commencer par neobank-");
  }
  if (typeof d.adapter_base_url !== "string" || /\/api\/?$/.test(d.adapter_base_url)) {
    fail("adapter_base_url doit être le context root, sans /api");
  }
  if (!Array.isArray(d.endpoints)) fail("endpoints manquant");

  const endpoints: BffEndpoint[] = d.endpoints.map((e: any, i: number) => {
    const where = `endpoint ${i + 1}`;
    if (!e || typeof e !== "object") fail(`${where} invalide`);
    const method = String(e.method || "").toUpperCase();
    if (!METHODS.includes(method)) fail(`${where} : verbe ${e.method} inconnu`);
    if (typeof e.path !== "string" || !e.path.startsWith("/api/")) fail(`${where} : path doit commencer par /api/`);
    if (typeof e.fonction !== "string" || !e.fonction) fail(`${where} : fonction manquante`);
    return {
      fonction: e.fonction,
      operation: e.operation || e.fonction,
      method: method as BffEndpoint["method"],
      path: e.path,
      test: e.test === true,
      exposer: e.exposer !== false,
      idempotence: e.idempotence === "cle" || e.idempotence === "sans" ? e.idempotence : method === "GET" ? "sans" : "cle",
      query_params: Array.isArray(e.query_params) ? e.query_params : [],
      query_libre: e.query_libre === true,
      request_fields: Array.isArray(e.request_fields) ? e.request_fields : [],
      response_fields: Array.isArray(e.response_fields) ? e.response_fields : [],
      codes_retour: e.codes_retour,
      securite: e.securite,
    };
  });

  return {
    format: 4,
    adapter_name: d.adapter_name,
    adapter_base_url: d.adapter_base_url,
    bian: { service_domain: d.bian?.service_domain || "" },
    codes_retour: d.codes_retour || {},
    securite: d.securite,
    endpoints,
  };
}
