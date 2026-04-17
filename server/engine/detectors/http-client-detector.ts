/**
 * http-client-detector.ts — Détecte les clients HTTP legacy et génère des services Spring RestTemplate.
 *
 * Pattern cible :
 *   MADCore.java — HttpURLConnection + Gson → @Service + RestTemplate
 *   Méthodes: auth(), listeAttenteMAD(), listHistoMad(), eligibilite(), authenticate(),
 *             annuler(), emettre(), getValidToken()
 *
 * Chaque méthode publique (non-utilitaire) est convertie en appel RestTemplate
 * avec les DTOs Request/Response correspondants.
 *
 * Impact sur les projets existants : AUCUN.
 * Le détecteur n'est appelé que si un client HTTP legacy est trouvé.
 *
 * @author Hamza NORDINE
 * @since v8.3
 */

import type { GeneratedFile } from "../../spring/shared";

// ─── Types publics ──────────────────────────────────────────────────────────

export interface HttpClientMethod {
  /** Nom de la méthode (ex: "auth") */
  name: string;
  /** Type de retour (ex: "GenericResponse<AuthResponse>") */
  returnType: string;
  /** Paramètres */
  parameters: { name: string; type: string }[];
  /** Méthode HTTP (GET, POST, PUT, DELETE) */
  httpMethod: string;
  /** Path de l'API (ex: "/api/v1/auth") */
  apiPath: string;
  /** DTO Request utilisé */
  requestDto: string;
  /** DTO Response utilisé */
  responseDto: string;
}

export interface HttpClientDetection {
  /** Nom de la classe client (ex: "MADCore") */
  className: string;
  /** Package */
  packageName: string;
  /** Base URL pattern (ex: "UDDI lookup") */
  baseUrlPattern: string;
  /** Méthodes détectées */
  methods: HttpClientMethod[];
  /** DTOs Request utilisés */
  requestDtos: string[];
  /** DTOs Response utilisés */
  responseDtos: string[];
  /** Utilise UDDI pour la résolution d'URL */
  usesUddi: boolean;
  /** Utilise Gson pour la sérialisation */
  usesGson: boolean;
}

// ─── Mapping méthode → HTTP ─────────────────────────────────────────────────

const METHOD_HTTP_MAP: Record<string, { httpMethod: string; path: string }> = {
  "auth":              { httpMethod: "POST", path: "/auth" },
  "authenticate":      { httpMethod: "POST", path: "/authenticate" },
  "listeAttenteMAD":   { httpMethod: "POST", path: "/mad/attente" },
  "listHistoMad":      { httpMethod: "POST", path: "/mad/historique" },
  "eligibilite":       { httpMethod: "POST", path: "/mad/eligibilite" },
  "annuler":           { httpMethod: "POST", path: "/mad/annulation" },
  "emettre":           { httpMethod: "POST", path: "/mad/emission" },
  "getValidToken":     { httpMethod: "GET",  path: "/auth/token" },
};

// ─── Détection ──────────────────────────────────────────────────────────────

/**
 * Détecter si un fichier Java est un client HTTP legacy.
 * Critères : HttpURLConnection + au moins 3 méthodes publiques avec InputStream/Response.
 */
export function isHttpClientClass(source: string, className: string): boolean {
  if (!/HttpURLConnection|HttpClient|URLConnection/.test(source)) return false;
  if (!/class\s+\w+/.test(source)) return false;
  const publicMethods = source.match(/public\s+(?:GenericResponse|InputStream|String)\s*(?:<[\w\[\]]+>)?\s+\w+\s*\(/g);
  return (publicMethods?.length ?? 0) >= 3;
}

/**
 * Analyser un client HTTP legacy et extraire ses méthodes.
 */
export function detectHttpClient(source: string, className: string): HttpClientDetection {
  const packageMatch = source.match(/package\s+([\w.]+)\s*;/);
  const packageName = packageMatch ? packageMatch[1] : "";

  const methods = extractHttpMethods(source, className);
  const requestDtos = [...new Set(methods.map(m => m.requestDto).filter(Boolean))];
  const responseDtos = [...new Set(methods.map(m => m.responseDto).filter(Boolean))];

  return {
    className,
    packageName,
    baseUrlPattern: /UddiClient|UddiServiceInfos/.test(source) ? "UDDI" : "hardcoded",
    methods,
    requestDtos,
    responseDtos,
    usesUddi: /UddiClient|UddiServiceInfos/.test(source),
    usesGson: /Gson/.test(source),
  };
}

/**
 * Générer le service Spring RestTemplate à partir de la détection.
 */
export function generateRestTemplateService(
  detection: HttpClientDetection,
  basePackage: string,
  basePath: string
): GeneratedFile {
  const serviceName = detection.className.replace(/Core$/, "") + "IntegrationService";

  const imports = new Set<string>();
  imports.add("import org.springframework.stereotype.Service;");
  imports.add("import org.springframework.web.client.RestTemplate;");
  imports.add("import org.springframework.http.HttpEntity;");
  imports.add("import org.springframework.http.HttpHeaders;");
  imports.add("import org.springframework.http.HttpMethod;");
  imports.add("import org.springframework.http.ResponseEntity;");
  imports.add("import org.springframework.beans.factory.annotation.Value;");
  imports.add("import lombok.extern.slf4j.Slf4j;");
  imports.add("import lombok.RequiredArgsConstructor;");

  const methodsCode = detection.methods.map(m => generateRestTemplateMethod(m)).join("\n\n");

  const content = `package ${basePackage}.integration;

${[...imports].sort().join("\n")}

/**
 * ${serviceName} — Client HTTP migré depuis ${detection.className}.
 * HttpURLConnection + Gson → RestTemplate + Jackson.
 * ${detection.usesUddi ? "Base URL résolue via configuration (anciennement UDDI)." : ""}
 *
 * @author Compleo v8.3
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ${serviceName} {

    private final RestTemplate restTemplate;

    @Value("\${mad.core.base-url}")
    private String baseUrl;

${methodsCode}
}
`;

  return {
    path: `${basePath}/integration/${serviceName}.java`,
    content,
    category: "service",
  };
}

// ─── Extraction des méthodes ────────────────────────────────────────────────

function extractHttpMethods(source: string, className: string): HttpClientMethod[] {
  const methods: HttpClientMethod[] = [];
  const methodRegex = /public\s+([\w<>\[\],\s]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
  let match;

  while ((match = methodRegex.exec(source)) !== null) {
    const returnType = match[1].trim();
    const name = match[2];
    const paramsStr = match[3];

    // Skip constructor et méthodes utilitaires
    if (name === className) continue;
    if (name === "executeCall" || name === "executeCallPostSecret") continue;

    const parameters = paramsStr
      .split(",")
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const parts = p.replace(/@\w+(?:\([^)]*\))?\s*/g, "").trim().split(/\s+/);
        return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" ") };
      });

    // Inférer le HTTP method et le path
    const httpConfig = METHOD_HTTP_MAP[name] ?? { httpMethod: "POST", path: `/${name.toLowerCase()}` };

    // Extraire le DTO Response du type de retour
    const responseMatch = returnType.match(/GenericResponse<(\w+)(?:\[\])?>/);
    const responseDto = responseMatch ? responseMatch[1] : "";

    // Inférer le DTO Request depuis les paramètres
    const requestParam = parameters.find(p =>
      /Auth|Emission|Annulation|Consultation|MADList/.test(p.type)
    );
    const requestDto = requestParam?.type ?? "";

    methods.push({
      name,
      returnType: mapReturnType(returnType),
      parameters: parameters.filter(p => p.type !== "String" || !/token/i.test(p.name)),
      httpMethod: httpConfig.httpMethod,
      apiPath: httpConfig.path,
      requestDto,
      responseDto,
    });
  }

  return methods;
}

function mapReturnType(type: string): string {
  return type
    .replace(/GenericResponse<(\w+)\[\]>/, "ResponseEntity<List<$1>>")
    .replace(/GenericResponse<(\w+)>/, "ResponseEntity<$1>")
    .replace(/InputStream/, "ResponseEntity<String>");
}

function generateRestTemplateMethod(method: HttpClientMethod): string {
  const params = method.parameters
    .map(p => `${p.type} ${p.name}`)
    .join(", ");

  const tokenParam = method.parameters.some(p => /token/i.test(p.name))
    ? ""
    : "String token";
  const allParams = [params, tokenParam].filter(Boolean).join(", ");

  return `    /**
     * ${method.name} — Migré depuis MADCore.${method.name}().
     * ${method.httpMethod} ${method.apiPath}
     */
    public ${method.returnType} ${method.name}(${allParams}) {
        String url = baseUrl + "${method.apiPath}";
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);

        // TODO: Mapper les paramètres vers le body/query selon le type de requête
        HttpEntity<?> entity = new HttpEntity<>(${method.requestDto ? method.parameters[0]?.name ?? "null" : "null"}, headers);

        log.info("Appel ${method.httpMethod} {}", url);
        // TODO: Implémenter le mapping de réponse exact
        throw new UnsupportedOperationException("À implémenter — migration depuis MADCore.${method.name}");
    }`;
}
