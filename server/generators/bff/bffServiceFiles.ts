/**
 * Fichiers Java propres à un service exposé : port de sortie, cas d'utilisation, requêtes,
 * contrôleur, adaptateur et test de l'adaptateur.
 */
import type { BffDescriptor, BffEndpoint, BffField } from "./bffDescriptor";
import { camel, channelSubPath, isJavaKeyword, packageSegment, pascal, serviceKey } from "./bffNaming";

export const DEFAULT_SECURITY_RESOURCE = "S05VTKRC";

const BASE_PACKAGE = "ma.eai.msiboa.api";
const JAVA_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

interface Param {
  javaName: string;
  javaType: string;
  annotation: string;
}

export interface ServiceOperation {
  endpoint: BffEndpoint;
  methodName: string;
  requestClass: string | null;
  queryParams: Param[];
  route: string;
  securityResource: string;
  defaultSecurity: boolean;
  businessCodes: string[];
  validationCodes: string[];
  hasCodeOverride: boolean;
}

export interface ServiceModel {
  descriptor: BffDescriptor;
  key: string;
  className: string;
  segment: string;
  operations: ServiceOperation[];
  excluded: { fonction: string; path: string; reason: string }[];
  businessCodes: string[];
  validationCodes: string[];
}

export interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * Construit le modèle d'un service : opérations retenues, noms Java, routes du canal,
 * classement des codes retour. Lève une erreur sur une collision de nom ou de route.
 */
export function buildServiceModel(descriptor: BffDescriptor): ServiceModel {
  const key = serviceKey(descriptor.adapter_name);
  const businessCodes = descriptor.codes_retour.metier ?? [];
  const validationCodes = descriptor.codes_retour.saisie ?? [];
  const serviceResource = descriptor.securite?.ressource;
  const excluded: ServiceModel["excluded"] = [];
  const operations: ServiceOperation[] = [];
  const names = new Set<string>();
  const routes = new Set<string>();

  for (const endpoint of descriptor.endpoints) {
    if (endpoint.test) {
      excluded.push({ fonction: endpoint.fonction, path: endpoint.path, reason: "fonction de test" });
      continue;
    }
    if (!endpoint.exposer) {
      excluded.push({ fonction: endpoint.fonction, path: endpoint.path, reason: "non exposée au canal" });
      continue;
    }
    let methodName = camel(endpoint.fonction);
    for (let i = 2; names.has(methodName); i++) methodName = camel(endpoint.fonction) + i;
    names.add(methodName);

    const route = channelSubPath(endpoint.path);
    const routeKey = `${endpoint.method} ${route}`;
    if (routes.has(routeKey)) {
      throw new Error(`Service ${descriptor.adapter_name} : route du canal en double ${routeKey}`);
    }
    routes.add(routeKey);

    const resource = endpoint.securite?.ressource || serviceResource;
    const override = endpoint.codes_retour;
    const opBusiness = new Set(businessCodes);
    const opValidation = new Set(validationCodes);
    for (const c of override?.metier ?? []) {
      opBusiness.add(c);
      opValidation.delete(c);
    }
    for (const c of override?.saisie ?? []) {
      opValidation.add(c);
      opBusiness.delete(c);
    }

    operations.push({
      endpoint,
      methodName,
      requestClass: endpoint.request_fields.length > 0 ? pascal(methodName) + "Request" : null,
      queryParams: endpoint.query_libre ? [] : endpoint.query_params.map(queryParam),
      route,
      securityResource: resource || DEFAULT_SECURITY_RESOURCE,
      defaultSecurity: !resource,
      businessCodes: [...opBusiness],
      validationCodes: [...opValidation],
      hasCodeOverride: !!override && ((override.metier?.length ?? 0) > 0 || (override.saisie?.length ?? 0) > 0),
    });
  }

  return {
    descriptor,
    key,
    className: pascal(key),
    segment: packageSegment(key),
    operations,
    excluded,
    businessCodes,
    validationCodes,
  };
}

function queryParam(field: BffField): Param {
  const javaName = JAVA_IDENTIFIER.test(field.name) && camel(field.name) === field.name ? field.name : camel(field.name);
  return {
    javaName,
    javaType: scalarType(field.type),
    annotation: `@RequestParam(name = "${field.name}", required = false)`,
  };
}

function scalarType(type: string): string {
  switch (type) {
    case "String":
    case "Integer":
    case "Long":
    case "Boolean":
    case "Double":
      return type;
    case "BigDecimal":
      return "BigDecimal";
    default:
      return "String";
  }
}

/** Fichiers à écrire pour un service, chemins relatifs à la racine du dépôt. */
export function serviceFiles(model: ServiceModel, modulePrefix: string): GeneratedFile[] {
  const javaRoot = "src/main/java/ma/eai/msiboa/api";
  const appService = `${modulePrefix}-domain/${modulePrefix}-application-service/${javaRoot}`;
  const files: GeneratedFile[] = [
    { path: `${appService}/domain/ports/output/client/${model.className}Client.java`, content: clientPort(model) },
    { path: `${appService}/domain/${model.segment}/${model.className}UseCase.java`, content: useCase(model) },
    {
      path: `${modulePrefix}-application/${javaRoot}/application/${model.segment}/${model.className}Controller.java`,
      content: controller(model),
    },
    {
      path: `${modulePrefix}-container/${javaRoot}/integration/${model.segment}/${model.className}RestAdapter.java`,
      content: adapter(model),
    },
    {
      path: `${modulePrefix}-container/src/test/java/ma/eai/msiboa/api/integration/${model.segment}/${model.className}RestAdapterTest.java`,
      content: adapterTest(model),
    },
  ];
  for (const op of model.operations) {
    if (op.requestClass) {
      files.push({
        path: `${appService}/domain/${model.segment}/model/${op.requestClass}.java`,
        content: requestRecord(model, op),
      });
    }
  }
  return files;
}

// ─── Assemblage ─────────────────────────────────────────────────────────────

function javaFile(pkg: string, imports: Iterable<string>, body: string): string {
  const all = [...new Set(imports)].sort();
  const javaImports = all.filter((i) => i.startsWith("java."));
  const others = all.filter((i) => !i.startsWith("java."));
  const blocks: string[] = [`package ${pkg};`];
  if (javaImports.length > 0) blocks.push(javaImports.map((i) => `import ${i};`).join("\n"));
  if (others.length > 0) blocks.push(others.map((i) => `import ${i};`).join("\n"));
  blocks.push(body);
  return blocks.join("\n\n");
}

function staticImports(imports: string[]): string {
  return [...imports].sort().map((i) => `import static ${i};`).join("\n");
}

function signatureParams(model: ServiceModel, op: ServiceOperation): { type: string; name: string }[] {
  const params = op.queryParams.map((p) => ({ type: p.javaType, name: p.javaName }));
  if (op.endpoint.query_libre) params.push({ type: "Map<String, String>", name: "params" });
  if (op.requestClass) params.push({ type: op.requestClass, name: "request" });
  return params;
}

function typeImports(model: ServiceModel, op: ServiceOperation, imports: string[]): void {
  if (op.endpoint.query_libre) imports.push("java.util.Map");
  if (op.queryParams.some((p) => p.javaType === "BigDecimal")) imports.push("java.math.BigDecimal");
  if (op.requestClass) imports.push(`${BASE_PACKAGE}.domain.${model.segment}.model.${op.requestClass}`);
}

function declaration(params: { type: string; name: string }[]): string {
  return params.map((p) => `${p.type} ${p.name}`).join(", ");
}

function callArgs(params: { name: string }[]): string {
  return params.map((p) => p.name).join(", ");
}

// ─── Port et cas d'utilisation ──────────────────────────────────────────────

function clientPort(model: ServiceModel): string {
  const imports = ["tools.jackson.databind.JsonNode"];
  const methods = model.operations.map((op) => {
    typeImports(model, op, imports);
    return `    JsonNode ${op.methodName}(${declaration(signatureParams(model, op))});`;
  });
  return javaFile(
    `${BASE_PACKAGE}.domain.ports.output.client`,
    imports,
    `/**
 * Acces au service expose ${model.descriptor.adapter_name}.
 */
public interface ${model.className}Client {

${methods.join("\n\n")}
}
`
  );
}

function useCase(model: ServiceModel): string {
  const imports = [
    `${BASE_PACKAGE}.domain.ports.output.client.${model.className}Client`,
    "org.springframework.stereotype.Component",
    "tools.jackson.databind.JsonNode",
  ];
  const methods = model.operations.map((op) => {
    typeImports(model, op, imports);
    const params = signatureParams(model, op);
    return `    public JsonNode ${op.methodName}(${declaration(params)}) {
        return client.${op.methodName}(${callArgs(params)});
    }`;
  });
  return javaFile(
    `${BASE_PACKAGE}.domain.${model.segment}`,
    imports,
    `/**
 * Cas d'utilisation du service expose ${model.descriptor.adapter_name}.
 */
@Component
public class ${model.className}UseCase {

    private final ${model.className}Client client;

    public ${model.className}UseCase(${model.className}Client client) {
        this.client = client;
    }

${methods.join("\n\n")}
}
`
  );
}

// ─── Requêtes ───────────────────────────────────────────────────────────────

function requestRecord(model: ServiceModel, op: ServiceOperation): string {
  const imports = new Set<string>(["io.swagger.v3.oas.annotations.media.Schema", "lombok.Builder"]);
  const body = recordBody(op.requestClass!, op.endpoint.request_fields, 0, imports, true);
  return javaFile(
    `${BASE_PACKAGE}.domain.${model.segment}.model`,
    imports,
    `/**
 * Requete de l'operation ${op.endpoint.fonction}.
 */
@Builder
@Schema(name = "${op.requestClass}")
${body}
`
  );
}

function recordBody(name: string, fields: BffField[], depth: number, imports: Set<string>, root: boolean): string {
  const pad = "    ".repeat(depth);
  const nested: string[] = [];
  const usedNames = new Set<string>([name]);
  const components = fields.map((field) => {
    const javaName = JAVA_IDENTIFIER.test(field.name) && !isKeyword(field.name) ? field.name : camel(field.name);
    let type: string;
    if (field.children && field.children.length > 0) {
      let nestedName = pascal(field.name);
      while (usedNames.has(nestedName)) nestedName += "Item";
      usedNames.add(nestedName);
      nested.push(recordBody(nestedName, field.children, depth + 1, imports, false));
      type = nestedName;
    } else {
      type = fieldType(field.type, imports);
    }
    if (field.isList) {
      imports.add("java.util.List");
      type = `List<${type}>`;
    }
    const annotations: string[] = [];
    if (field.required) {
      imports.add("jakarta.validation.constraints.NotNull");
      annotations.push("@NotNull");
    }
    if (field.children && field.children.length > 0) {
      imports.add("jakarta.validation.Valid");
      annotations.push("@Valid");
    }
    if (javaName !== field.name) {
      imports.add("com.fasterxml.jackson.annotation.JsonProperty");
      annotations.push(`@JsonProperty("${field.name}")`);
    }
    return `${pad}        ${[...annotations, `${type} ${javaName}`].join(" ")}`;
  });

  const header = `${root ? "" : pad}public record ${name}(`;
  if (nested.length === 0) {
    return `${header}\n${components.join(",\n")}\n${pad}) {}`;
  }
  return `${header}\n${components.join(",\n")}\n${pad}) {\n\n${nested.join("\n\n")}\n${pad}}`;
}

function fieldType(type: string, imports: Set<string>): string {
  switch (type) {
    case "String":
    case "Integer":
    case "Long":
    case "Boolean":
    case "Double":
      return type;
    case "BigDecimal":
      imports.add("java.math.BigDecimal");
      return "BigDecimal";
    case "Map":
      imports.add("java.util.Map");
      return "Map<String, Object>";
    default:
      return "Object";
  }
}

function isKeyword(name: string): boolean {
  return isJavaKeyword(name);
}

// ─── Contrôleur ─────────────────────────────────────────────────────────────

const MAPPINGS: Record<string, string> = {
  GET: "GetMapping",
  POST: "PostMapping",
  PUT: "PutMapping",
  DELETE: "DeleteMapping",
  PATCH: "PatchMapping",
};

function controller(model: ServiceModel): string {
  const idempotent = model.operations.some((op) => op.endpoint.idempotence === "cle");
  const imports = [
    "io.swagger.v3.oas.annotations.Operation",
    "io.swagger.v3.oas.annotations.tags.Tag",
    `${BASE_PACKAGE}.domain.${model.segment}.${model.className}UseCase`,
    "org.springframework.http.ResponseEntity",
    "org.springframework.security.access.prepost.PreAuthorize",
    "org.springframework.web.bind.annotation.RequestMapping",
    "org.springframework.web.bind.annotation.RestController",
    "tools.jackson.databind.JsonNode",
  ];
  if (idempotent) {
    imports.push(`${BASE_PACKAGE}.application.idempotency.OperationIdempotencyService`);
    imports.push("org.springframework.web.bind.annotation.RequestHeader");
  }

  const methods = model.operations.map((op) => {
    imports.push(`org.springframework.web.bind.annotation.${MAPPINGS[op.endpoint.method]}`);
    typeImports(model, op, imports);
    const params: string[] = [];
    const idem = op.endpoint.idempotence === "cle";
    if (idem) params.push(`@RequestHeader(value = "Idempotency-Key", required = true) String idempotencyKey`);
    for (const p of op.queryParams) {
      imports.push("org.springframework.web.bind.annotation.RequestParam");
      params.push(`${p.annotation} ${p.javaType} ${p.javaName}`);
    }
    if (op.endpoint.query_libre) {
      imports.push("org.springframework.web.bind.annotation.RequestParam");
      params.push("@RequestParam Map<String, String> params");
    }
    if (op.requestClass) {
      imports.push("jakarta.validation.Valid", "org.springframework.web.bind.annotation.RequestBody");
      params.push(`@Valid @RequestBody ${op.requestClass} request`);
    }
    const head = `    public ResponseEntity<JsonNode> ${op.methodName}(`;
    const signature = head + params.join(",\n" + " ".repeat(head.length)) + ") {";
    const args = callArgs(signatureParams(model, op));
    let statement: string;
    if (idem) {
      const hashed = hashedObject(model, op, imports);
      statement = `        return ResponseEntity.ok(idempotencyService.execute(idempotencyKey, SERVICE, "${op.methodName}", ${hashed},
                () -> useCase.${op.methodName}(${args})));`;
    } else {
      statement = `        return ResponseEntity.ok(useCase.${op.methodName}(${args}));`;
    }
    return `    @${MAPPINGS[op.endpoint.method]}("${op.route}")
    @Operation(summary = "${op.endpoint.fonction}")
    @PreAuthorize("@resourceAccessChecker.hasResource(authentication, '${op.securityResource}')")
${signature}
${statement}
    }`;
  });

  const ctorHead = `    public ${model.className}Controller(`;
  const fields = idempotent
    ? `    private final ${model.className}UseCase useCase;
    private final OperationIdempotencyService idempotencyService;

${ctorHead}${model.className}UseCase useCase,
${" ".repeat(ctorHead.length)}OperationIdempotencyService idempotencyService) {
        this.useCase = useCase;
        this.idempotencyService = idempotencyService;
    }`
    : `    private final ${model.className}UseCase useCase;

    public ${model.className}Controller(${model.className}UseCase useCase) {
        this.useCase = useCase;
    }`;

  return javaFile(
    `${BASE_PACKAGE}.application.${model.segment}`,
    imports,
    `/**
 * Operations du service ${model.descriptor.adapter_name} exposees au canal.
 */
@RestController
@RequestMapping("/api/v1/${model.key}")
@Tag(name = "${model.key}")
public class ${model.className}Controller {
${idempotent ? `\n    private static final String SERVICE = "${model.key}";\n` : ""}
${fields}

${methods.join("\n\n")}
}
`
  );
}

function hashedObject(model: ServiceModel, op: ServiceOperation, imports: string[]): string {
  const params = signatureParams(model, op);
  if (params.length === 1 && op.requestClass) return "request";
  if (params.length === 0) {
    imports.push("java.util.List");
    return "List.of()";
  }
  imports.push("java.util.Arrays");
  return `Arrays.asList(${callArgs(params)})`;
}

// ─── Adaptateur ─────────────────────────────────────────────────────────────

function codesLiteral(codes: string[]): string {
  return `List.of(${codes.map((c) => `"${c}"`).join(", ")})`;
}

function constantName(methodName: string): string {
  return methodName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase() + "_RETURN_CODES";
}

function adapter(model: ServiceModel): string {
  const imports = [
    "java.util.List",
    `${BASE_PACKAGE}.domain.ports.output.client.${model.className}Client`,
    `${BASE_PACKAGE}.integration.upstream.UpstreamErrorDecoder`,
    `${BASE_PACKAGE}.integration.upstream.UpstreamRestClients`,
    `${BASE_PACKAGE}.integration.upstream.UpstreamReturnCodes`,
    "org.springframework.beans.factory.annotation.Autowired",
    "org.springframework.beans.factory.annotation.Value",
    "org.springframework.http.HttpStatusCode",
    "org.springframework.stereotype.Component",
    "org.springframework.web.client.RestClient",
    "tools.jackson.databind.JsonNode",
    "tools.jackson.databind.ObjectMapper",
  ];
  const overrides = model.operations.filter((op) => op.hasCodeOverride);
  const constants = [
    `    static final UpstreamReturnCodes RETURN_CODES = UpstreamReturnCodes.of(
            ${codesLiteral(model.businessCodes)},
            ${codesLiteral(model.validationCodes)});`,
    ...overrides.map(
      (op) => `    static final UpstreamReturnCodes ${constantName(op.methodName)} = UpstreamReturnCodes.of(
            ${codesLiteral(op.businessCodes)},
            ${codesLiteral(op.validationCodes)});`
    ),
  ];
  const decoderFields = [
    "    private final UpstreamErrorDecoder errorDecoder;",
    ...overrides.map((op) => `    private final UpstreamErrorDecoder ${op.methodName}ErrorDecoder;`),
  ];
  const decoderInits = [
    "        this.errorDecoder = new UpstreamErrorDecoder(SERVICE, RETURN_CODES, objectMapper);",
    ...overrides.map(
      (op) =>
        `        this.${op.methodName}ErrorDecoder = new UpstreamErrorDecoder(SERVICE, ${constantName(op.methodName)}, objectMapper);`
    ),
  ];

  const methods = model.operations.map((op) => {
    typeImports(model, op, imports);
    const params = signatureParams(model, op);
    const decoder = op.hasCodeOverride ? `${op.methodName}ErrorDecoder` : "errorDecoder";
    const verb = op.endpoint.method.toLowerCase();
    const lines: string[] = [];
    if (op.endpoint.method === "DELETE" && op.requestClass) {
      imports.push("org.springframework.http.HttpMethod");
      lines.push("        return restClient.method(HttpMethod.DELETE)");
    } else {
      lines.push(`        return restClient.${verb}()`);
    }
    if (op.endpoint.query_libre) {
      lines.push(
        "                .uri(uri -> {",
        `                    uri.path("${op.endpoint.path}");`,
        "                    params.forEach((name, value) -> uri.queryParam(name, value));",
        "                    return uri.build();",
        "                })"
      );
    } else if (op.queryParams.length > 0) {
      imports.push("java.util.Optional");
      lines.push(`                .uri(uri -> uri.path("${op.endpoint.path}")`);
      for (const p of op.queryParams) {
        const name = p.annotation.match(/name = "([^"]+)"/)![1];
        lines.push(`                        .queryParamIfPresent("${name}", Optional.ofNullable(${p.javaName}))`);
      }
      lines.push("                        .build())");
    } else {
      lines.push(`                .uri("${op.endpoint.path}")`);
    }
    if (op.requestClass) {
      imports.push("org.springframework.http.MediaType");
      lines.push("                .contentType(MediaType.APPLICATION_JSON)", "                .body(request)");
    }
    lines.push(
      "                .retrieve()",
      `                .onStatus(HttpStatusCode::isError, ${decoder}::handle)`,
      "                .body(JsonNode.class);"
    );
    return `    @Override
    public JsonNode ${op.methodName}(${declaration(params)}) {
${lines.join("\n")}
    }`;
  });

  const ctorHead = `    public ${model.className}RestAdapter(`;
  const ctorPad = " ".repeat(ctorHead.length);
  return javaFile(
    `${BASE_PACKAGE}.integration.${model.segment}`,
    imports,
    `/**
 * Appel du service expose ${model.descriptor.adapter_name}.
 */
@Component
public class ${model.className}RestAdapter implements ${model.className}Client {

    static final String SERVICE = "${model.key}";

${constants.join("\n\n")}

    private final RestClient restClient;
${decoderFields.join("\n")}

    @Autowired
${ctorHead}UpstreamRestClients upstreamRestClients,
${ctorPad}ObjectMapper objectMapper,
${ctorPad}@Value("\${neobank.upstream.${model.key}.base-url}") String baseUrl) {
        this(upstreamRestClients.build(SERVICE, baseUrl), objectMapper);
    }

    ${model.className}RestAdapter(RestClient restClient, ObjectMapper objectMapper) {
        this.restClient = restClient;
${decoderInits.join("\n")}
    }

${methods.join("\n\n")}
}
`
  );
}

// ─── Test de l'adaptateur ───────────────────────────────────────────────────

const TEST_VALUES: Record<string, { java: string; query: string }> = {
  String: { java: `"1"`, query: "1" },
  Integer: { java: "1", query: "1" },
  Long: { java: "1L", query: "1" },
  Boolean: { java: "true", query: "true" },
  Double: { java: "1.0", query: "1.0" },
  BigDecimal: { java: "BigDecimal.ONE", query: "1" },
};

function testUrl(op: ServiceOperation): string {
  if (op.queryParams.length === 0) return op.endpoint.path;
  const query = op.queryParams
    .map((p) => `${p.annotation.match(/name = "([^"]+)"/)![1]}=${TEST_VALUES[p.javaType].query}`)
    .join("&");
  return `${op.endpoint.path}?${query}`;
}

function testArgs(model: ServiceModel, op: ServiceOperation, imports: string[]): string {
  if (op.queryParams.some((p) => p.javaType === "BigDecimal")) imports.push("java.math.BigDecimal");
  const args: string[] = op.queryParams.map((p) => TEST_VALUES[p.javaType].java);
  if (op.endpoint.query_libre) {
    imports.push("java.util.Map");
    args.push("Map.of()");
  }
  if (op.requestClass) {
    imports.push(`${BASE_PACKAGE}.domain.${model.segment}.model.${op.requestClass}`);
    args.push(`${op.requestClass}.builder().build()`);
  }
  return args.join(", ");
}

function adapterTest(model: ServiceModel): string {
  const imports = [
    "org.junit.jupiter.api.BeforeEach",
    "org.junit.jupiter.api.Test",
    "org.springframework.http.HttpMethod",
    "org.springframework.http.MediaType",
    "org.springframework.test.web.client.MockRestServiceServer",
    "org.springframework.web.client.RestClient",
    "tools.jackson.databind.json.JsonMapper",
  ];
  const statics = [
    "org.springframework.test.web.client.match.MockRestRequestMatchers.method",
    "org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo",
    "org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess",
  ];
  const baseUrl = `http://localhost:9080/${model.descriptor.adapter_name}`;
  const tests = model.operations.map((op) => {
    const args = testArgs(model, op, imports);
    return `    @Test
    void ${op.methodName}CallsUpstream() {
        server.expect(requestTo(BASE_URL + "${testUrl(op)}"))
                .andExpect(method(HttpMethod.${op.endpoint.method}))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        adapter.${op.methodName}(${args});

        server.verify();
    }`;
  });

  const first = model.operations.find((op) => !op.hasCodeOverride);
  if (first) {
    imports.push(
      "org.springframework.http.HttpStatus",
      `${BASE_PACKAGE}.domain.exception.UpstreamTechnicalException`,
      `${BASE_PACKAGE}.domain.exception.UpstreamValidationException`
    );
    statics.push(
      "org.assertj.core.api.Assertions.assertThatThrownBy",
      "org.springframework.test.web.client.response.MockRestResponseCreators.withStatus"
    );
    const args = testArgs(model, first, imports);
    const errorTest = (name: string, status: string, code: string, exception: string) => `    @Test
    void ${name}() {
        server.expect(requestTo(BASE_URL + "${testUrl(first)}"))
                .andRespond(withStatus(HttpStatus.${status})
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\\"code\\":\\"${code}\\",\\"message\\":\\"Motif\\",\\"timestamp\\":0}"));

        assertThatThrownBy(() -> adapter.${first.methodName}(${args}))
                .isInstanceOf(${exception}.class);
    }`;
    if (model.businessCodes.length > 0) {
      imports.push(`${BASE_PACKAGE}.domain.exception.UpstreamBusinessException`);
      tests.push(errorTest("businessCodeRaisesBusinessException", "CONFLICT", model.businessCodes[0], "UpstreamBusinessException"));
    }
    tests.push(errorTest("badRequestRaisesValidationException", "BAD_REQUEST", "400", "UpstreamValidationException"));
    tests.push(errorTest("unknownCodeRaisesTechnicalException", "INTERNAL_SERVER_ERROR", "999", "UpstreamTechnicalException"));
  }

  const javaImports = [...new Set(imports)].sort();
  const body = `class ${model.className}RestAdapterTest {

    private static final String BASE_URL = "${baseUrl}";

    private MockRestServiceServer server;
    private ${model.className}RestAdapter adapter;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        adapter = new ${model.className}RestAdapter(builder.build(), JsonMapper.builder().build());
    }

${tests.join("\n\n")}
}
`;
  const javaOnly = javaImports.filter((i) => i.startsWith("java."));
  const others = javaImports.filter((i) => !i.startsWith("java."));
  const blocks = [`package ${BASE_PACKAGE}.integration.${model.segment};`, staticImports(statics)];
  if (javaOnly.length > 0) blocks.push(javaOnly.map((i) => `import ${i};`).join("\n"));
  blocks.push(others.map((i) => `import ${i};`).join("\n"));
  blocks.push(body);
  return blocks.join("\n\n");
}
