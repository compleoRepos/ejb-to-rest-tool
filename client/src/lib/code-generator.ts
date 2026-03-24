/**
 * EJB Client Modernizer — Générateur de code API Client moderne.
 * Transforme les appels EJB détectés en clients REST utilisant Spring WebClient.
 *
 * @author Hamza NORDINE
 * @version 1.0.0
 */

import type { AnalysisReport, MethodCall } from "./ejb-analyzer";

// ============================================================
// Types
// ============================================================

export interface GeneratedFile {
  fileName: string;
  path: string;
  content: string;
  type: "client" | "config" | "dto" | "exception" | "util" | "test";
}

export interface GenerationResult {
  files: GeneratedFile[];
  projectStructure: string;
}

// ============================================================
// Génération du projet complet
// ============================================================

export function generateModernCode(
  report: AnalysisReport,
  basePackage: string = "com.bank.client"
): GenerationResult {
  const files: GeneratedFile[] = [];
  const packagePath = basePackage.replace(/\./g, "/");

  // Regrouper les appels par service
  const serviceMap = new Map<string, MethodCall[]>();
  for (const call of report.methodCalls) {
    const existing = serviceMap.get(call.serviceName) || [];
    existing.push(call);
    serviceMap.set(call.serviceName, existing);
  }

  // Aussi ajouter les services détectés via injection/lookup sans appels
  for (const inj of report.ejbInjections) {
    if (!serviceMap.has(inj.serviceType)) {
      serviceMap.set(inj.serviceType, []);
    }
  }
  for (const lookup of report.jndiLookups) {
    if (!serviceMap.has(lookup.serviceType)) {
      serviceMap.set(lookup.serviceType, []);
    }
  }

  // Générer les clients API pour chaque service
  const generatedPaths = new Set<string>();
  for (const [serviceName, calls] of Array.from(serviceMap.entries())) {
    const clientName = serviceName.replace(/Service$/, "").replace(/Bean$/, "") + "ApiClient";
    files.push(generateApiClient(serviceName, clientName, calls, basePackage, packagePath));
    generatedPaths.add(files[files.length - 1].path);

    // Générer les DTOs (dédupliquer par chemin pour éviter les doublons)
    for (const call of calls) {
      if (call.parameters.length > 0) {
        const reqDto = generateRequestDto(serviceName, call, basePackage, packagePath);
        if (!generatedPaths.has(reqDto.path)) {
          files.push(reqDto);
          generatedPaths.add(reqDto.path);
        }
      }
      if (call.returnType !== "void") {
        const resDto = generateResponseDto(serviceName, call, basePackage, packagePath);
        if (!generatedPaths.has(resDto.path)) {
          files.push(resDto);
          generatedPaths.add(resDto.path);
        }
      }
    }

    // Générer les tests
    files.push(generateClientTest(clientName, calls, basePackage, packagePath));
    generatedPaths.add(files[files.length - 1].path);
  }

  // Générer la configuration WebClient
  files.push(generateWebClientConfig(basePackage, packagePath));

  // Générer la gestion d'erreurs
  files.push(generateApiClientException(basePackage, packagePath));
  files.push(generateApiErrorHandler(basePackage, packagePath));

  // Générer le POM
  files.push(generatePom(basePackage));

  // Générer application.yml
  files.push(generateApplicationYml());

  const projectStructure = generateProjectStructureText(files);

  return { files, projectStructure };
}

// ============================================================
// Générateurs individuels
// ============================================================

function generateApiClient(
  serviceName: string,
  clientName: string,
  calls: MethodCall[],
  basePackage: string,
  packagePath: string
): GeneratedFile {
  const basePath = inferRestBasePath(serviceName);

  let code = `package ${basePackage}.client;\n\n`;
  code += `import ${basePackage}.config.WebClientConfig;\n`;
  code += `import ${basePackage}.exception.ApiClientException;\n`;
  code += `import ${basePackage}.dto.*;\n`;
  code += `import lombok.RequiredArgsConstructor;\n`;
  code += `import lombok.extern.slf4j.Slf4j;\n`;
  code += `import org.springframework.stereotype.Service;\n`;
  code += `import org.springframework.web.reactive.function.client.WebClient;\n`;
  code += `import org.springframework.web.reactive.function.client.WebClientResponseException;\n`;
  code += `import reactor.core.publisher.Mono;\n\n`;
  code += `import java.time.Duration;\n`;
  code += `import java.util.List;\n\n`;

  code += `/**\n`;
  code += ` * Client API REST moderne remplaçant les appels EJB vers ${serviceName}.\n`;
  code += ` * Généré automatiquement par EJB Client Modernizer.\n`;
  code += ` *\n`;
  code += ` * @author Hamza NORDINE\n`;
  code += ` */\n`;
  code += `@Service\n`;
  code += `@Slf4j\n`;
  code += `@RequiredArgsConstructor\n`;
  code += `public class ${clientName} {\n\n`;
  code += `    private final WebClient webClient;\n\n`;
  code += `    private static final Duration TIMEOUT = Duration.ofSeconds(30);\n\n`;

  if (calls.length === 0) {
    // Service détecté mais sans appels de méthodes
    code += `    // TODO: Ajouter les méthodes correspondant aux appels EJB détectés\n`;
  }

  for (const call of calls) {
    const httpMethod = inferHttpMethod(call.methodName);
    const restPath = inferRestPath(call.methodName, basePath);
    const responseType = mapReturnType(call);
    const methodParams = buildMethodParams(call);

    code += `    /**\n`;
    code += `     * Appel REST ${httpMethod} ${restPath}\n`;
    code += `     * Remplace l'appel EJB : ${call.serviceName}.${call.methodName}()\n`;
    code += `     */\n`;

    switch (httpMethod) {
      case "GET":
        code += generateGetMethod(call, restPath, responseType, methodParams);
        break;
      case "POST":
        code += generatePostMethod(call, restPath, responseType, methodParams);
        break;
      case "PUT":
        code += generatePutMethod(call, restPath, responseType, methodParams);
        break;
      case "DELETE":
        code += generateDeleteMethod(call, restPath, methodParams);
        break;
      default:
        code += generatePostMethod(call, restPath, responseType, methodParams);
    }
    code += `\n`;
  }

  code += `}\n`;

  return {
    fileName: `${clientName}.java`,
    path: `src/main/java/${packagePath}/client/${clientName}.java`,
    content: code,
    type: "client",
  };
}

function generateGetMethod(call: MethodCall, restPath: string, responseType: string, params: string): string {
  let code = `    public ${responseType} ${call.methodName}(${params}) {\n`;
  code += `        log.info("Appel GET ${restPath}");\n`;
  code += `        try {\n`;
  code += `            return webClient.get()\n`;

  if (call.parameters.length > 0) {
    code += `                    .uri("${restPath}", ${call.parameters[0]})\n`;
  } else {
    code += `                    .uri("${restPath}")\n`;
  }

  code += `                    .retrieve()\n`;
  code += `                    .bodyToMono(${responseType}.class)\n`;
  code += `                    .timeout(TIMEOUT)\n`;
  code += `                    .block();\n`;
  code += `        } catch (WebClientResponseException e) {\n`;
  code += `            log.error("Erreur HTTP {} lors de l'appel à ${restPath}: {}", e.getStatusCode(), e.getMessage());\n`;
  code += `            throw new ApiClientException("Erreur lors de l'appel à ${call.methodName}", e);\n`;
  code += `        } catch (Exception e) {\n`;
  code += `            log.error("Erreur lors de l'appel à ${restPath}: {}", e.getMessage());\n`;
  code += `            throw new ApiClientException("Erreur réseau lors de l'appel à ${call.methodName}", e);\n`;
  code += `        }\n`;
  code += `    }\n`;
  return code;
}

function generatePostMethod(call: MethodCall, restPath: string, responseType: string, params: string): string {
  const requestParam = call.parameters.length > 0 ? call.parameters[0] : "request";
  let code = `    public ${responseType} ${call.methodName}(${params}) {\n`;
  code += `        log.info("Appel POST ${restPath}");\n`;
  code += `        try {\n`;
  code += `            return webClient.post()\n`;
  code += `                    .uri("${restPath}")\n`;
  code += `                    .bodyValue(${requestParam})\n`;
  code += `                    .retrieve()\n`;
  code += `                    .bodyToMono(${responseType}.class)\n`;
  code += `                    .timeout(TIMEOUT)\n`;
  code += `                    .block();\n`;
  code += `        } catch (WebClientResponseException e) {\n`;
  code += `            log.error("Erreur HTTP {} lors de l'appel à ${restPath}: {}", e.getStatusCode(), e.getMessage());\n`;
  code += `            throw new ApiClientException("Erreur lors de l'appel à ${call.methodName}", e);\n`;
  code += `        } catch (Exception e) {\n`;
  code += `            log.error("Erreur réseau lors de l'appel à ${restPath}: {}", e.getMessage());\n`;
  code += `            throw new ApiClientException("Erreur réseau lors de l'appel à ${call.methodName}", e);\n`;
  code += `        }\n`;
  code += `    }\n`;
  return code;
}

function generatePutMethod(call: MethodCall, restPath: string, responseType: string, params: string): string {
  const requestParam = call.parameters.length > 1 ? call.parameters[1] : call.parameters[0] || "request";
  let code = `    public ${responseType} ${call.methodName}(${params}) {\n`;
  code += `        log.info("Appel PUT ${restPath}");\n`;
  code += `        try {\n`;
  code += `            return webClient.put()\n`;

  if (call.parameters.length > 1) {
    code += `                    .uri("${restPath}", ${call.parameters[0]})\n`;
  } else {
    code += `                    .uri("${restPath}")\n`;
  }

  code += `                    .bodyValue(${requestParam})\n`;
  code += `                    .retrieve()\n`;
  code += `                    .bodyToMono(${responseType}.class)\n`;
  code += `                    .timeout(TIMEOUT)\n`;
  code += `                    .block();\n`;
  code += `        } catch (WebClientResponseException e) {\n`;
  code += `            log.error("Erreur HTTP {} lors de l'appel à ${restPath}: {}", e.getStatusCode(), e.getMessage());\n`;
  code += `            throw new ApiClientException("Erreur lors de l'appel à ${call.methodName}", e);\n`;
  code += `        } catch (Exception e) {\n`;
  code += `            log.error("Erreur réseau lors de l'appel à ${restPath}: {}", e.getMessage());\n`;
  code += `            throw new ApiClientException("Erreur réseau lors de l'appel à ${call.methodName}", e);\n`;
  code += `        }\n`;
  code += `    }\n`;
  return code;
}

function generateDeleteMethod(call: MethodCall, restPath: string, params: string): string {
  let code = `    public void ${call.methodName}(${params}) {\n`;
  code += `        log.info("Appel DELETE ${restPath}");\n`;
  code += `        try {\n`;
  code += `            webClient.delete()\n`;

  if (call.parameters.length > 0) {
    code += `                    .uri("${restPath}", ${call.parameters[0]})\n`;
  } else {
    code += `                    .uri("${restPath}")\n`;
  }

  code += `                    .retrieve()\n`;
  code += `                    .toBodilessEntity()\n`;
  code += `                    .timeout(TIMEOUT)\n`;
  code += `                    .block();\n`;
  code += `        } catch (WebClientResponseException e) {\n`;
  code += `            log.error("Erreur HTTP {} lors de l'appel à ${restPath}: {}", e.getStatusCode(), e.getMessage());\n`;
  code += `            throw new ApiClientException("Erreur lors de l'appel à ${call.methodName}", e);\n`;
  code += `        } catch (Exception e) {\n`;
  code += `            log.error("Erreur réseau lors de l'appel à ${restPath}: {}", e.getMessage());\n`;
  code += `            throw new ApiClientException("Erreur réseau lors de l'appel à ${call.methodName}", e);\n`;
  code += `        }\n`;
  code += `    }\n`;
  return code;
}

function generateWebClientConfig(basePackage: string, packagePath: string): GeneratedFile {
  let code = `package ${basePackage}.config;\n\n`;
  code += `import io.netty.channel.ChannelOption;\n`;
  code += `import io.netty.handler.timeout.ReadTimeoutHandler;\n`;
  code += `import io.netty.handler.timeout.WriteTimeoutHandler;\n`;
  code += `import org.springframework.beans.factory.annotation.Value;\n`;
  code += `import org.springframework.context.annotation.Bean;\n`;
  code += `import org.springframework.context.annotation.Configuration;\n`;
  code += `import org.springframework.http.client.reactive.ReactorClientHttpConnector;\n`;
  code += `import org.springframework.web.reactive.function.client.ExchangeFilterFunction;\n`;
  code += `import org.springframework.web.reactive.function.client.WebClient;\n`;
  code += `import reactor.core.publisher.Mono;\n`;
  code += `import reactor.netty.http.client.HttpClient;\n`;
  code += `import lombok.extern.slf4j.Slf4j;\n\n`;
  code += `import java.time.Duration;\n`;
  code += `import java.util.concurrent.TimeUnit;\n\n`;
  code += `/**\n`;
  code += ` * Configuration centralisée du WebClient pour les appels API REST.\n`;
  code += ` * Remplace les connexions EJB/JNDI par des appels HTTP modernes.\n`;
  code += ` *\n`;
  code += ` * @author Hamza NORDINE\n`;
  code += ` */\n`;
  code += `@Configuration\n`;
  code += `@Slf4j\n`;
  code += `public class WebClientConfig {\n\n`;
  code += `    @Value("\${api.base-url:http://bank-api}")\n`;
  code += `    private String baseUrl;\n\n`;
  code += `    @Value("\${api.timeout.connect:5000}")\n`;
  code += `    private int connectTimeout;\n\n`;
  code += `    @Value("\${api.timeout.read:30000}")\n`;
  code += `    private int readTimeout;\n\n`;
  code += `    @Bean\n`;
  code += `    public WebClient webClient() {\n`;
  code += `        HttpClient httpClient = HttpClient.create()\n`;
  code += `                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, connectTimeout)\n`;
  code += `                .responseTimeout(Duration.ofMillis(readTimeout))\n`;
  code += `                .doOnConnected(conn ->\n`;
  code += `                        conn.addHandlerLast(new ReadTimeoutHandler(readTimeout, TimeUnit.MILLISECONDS))\n`;
  code += `                            .addHandlerLast(new WriteTimeoutHandler(readTimeout, TimeUnit.MILLISECONDS)));\n\n`;
  code += `        return WebClient.builder()\n`;
  code += `                .baseUrl(baseUrl)\n`;
  code += `                .clientConnector(new ReactorClientHttpConnector(httpClient))\n`;
  code += `                .filter(logRequest())\n`;
  code += `                .filter(logResponse())\n`;
  code += `                .build();\n`;
  code += `    }\n\n`;
  code += `    private ExchangeFilterFunction logRequest() {\n`;
  code += `        return ExchangeFilterFunction.ofRequestProcessor(clientRequest -> {\n`;
  code += `            log.debug("Request: {} {}", clientRequest.method(), clientRequest.url());\n`;
  code += `            return Mono.just(clientRequest);\n`;
  code += `        });\n`;
  code += `    }\n\n`;
  code += `    private ExchangeFilterFunction logResponse() {\n`;
  code += `        return ExchangeFilterFunction.ofResponseProcessor(clientResponse -> {\n`;
  code += `            log.debug("Response: {}", clientResponse.statusCode());\n`;
  code += `            return Mono.just(clientResponse);\n`;
  code += `        });\n`;
  code += `    }\n`;
  code += `}\n`;

  return {
    fileName: "WebClientConfig.java",
    path: `src/main/java/${packagePath}/config/WebClientConfig.java`,
    content: code,
    type: "config",
  };
}

function generateApiClientException(basePackage: string, packagePath: string): GeneratedFile {
  let code = `package ${basePackage}.exception;\n\n`;
  code += `/**\n`;
  code += ` * Exception personnalisée pour les erreurs des clients API.\n`;
  code += ` *\n`;
  code += ` * @author Hamza NORDINE\n`;
  code += ` */\n`;
  code += `public class ApiClientException extends RuntimeException {\n\n`;
  code += `    public ApiClientException(String message) {\n`;
  code += `        super(message);\n`;
  code += `    }\n\n`;
  code += `    public ApiClientException(String message, Throwable cause) {\n`;
  code += `        super(message, cause);\n`;
  code += `    }\n`;
  code += `}\n`;

  return {
    fileName: "ApiClientException.java",
    path: `src/main/java/${packagePath}/exception/ApiClientException.java`,
    content: code,
    type: "exception",
  };
}

function generateApiErrorHandler(basePackage: string, packagePath: string): GeneratedFile {
  let code = `package ${basePackage}.util;\n\n`;
  code += `import ${basePackage}.exception.ApiClientException;\n`;
  code += `import lombok.extern.slf4j.Slf4j;\n`;
  code += `import org.springframework.web.reactive.function.client.WebClientResponseException;\n\n`;
  code += `/**\n`;
  code += ` * Utilitaire de gestion des erreurs pour les clients API.\n`;
  code += ` *\n`;
  code += ` * @author Hamza NORDINE\n`;
  code += ` */\n`;
  code += `@Slf4j\n`;
  code += `public class ApiErrorHandler {\n\n`;
  code += `    private ApiErrorHandler() {}\n\n`;
  code += `    public static void handleError(String operation, Exception e) {\n`;
  code += `        if (e instanceof WebClientResponseException wce) {\n`;
  code += `            log.error("Erreur HTTP {} pour {}: {}", wce.getStatusCode(), operation, wce.getResponseBodyAsString());\n`;
  code += `            throw new ApiClientException("Erreur HTTP " + wce.getStatusCode() + " pour " + operation, e);\n`;
  code += `        }\n`;
  code += `        log.error("Erreur réseau pour {}: {}", operation, e.getMessage());\n`;
  code += `        throw new ApiClientException("Erreur réseau pour " + operation, e);\n`;
  code += `    }\n`;
  code += `}\n`;

  return {
    fileName: "ApiErrorHandler.java",
    path: `src/main/java/${packagePath}/util/ApiErrorHandler.java`,
    content: code,
    type: "util",
  };
}

function generateRequestDto(
  serviceName: string,
  call: MethodCall,
  basePackage: string,
  packagePath: string
): GeneratedFile {
  const dtoName = capitalize(call.methodName) + "RequestDTO";

  let code = `package ${basePackage}.dto;\n\n`;
  code += `import jakarta.validation.constraints.NotNull;\n`;
  code += `import lombok.AllArgsConstructor;\n`;
  code += `import lombok.Builder;\n`;
  code += `import lombok.Data;\n`;
  code += `import lombok.NoArgsConstructor;\n\n`;
  code += `/**\n`;
  code += ` * DTO de requête pour ${serviceName}.${call.methodName}().\n`;
  code += ` *\n`;
  code += ` * @author Hamza NORDINE\n`;
  code += ` */\n`;
  code += `@Data\n`;
  code += `@Builder\n`;
  code += `@NoArgsConstructor\n`;
  code += `@AllArgsConstructor\n`;
  code += `public class ${dtoName} {\n\n`;

  for (const param of call.parameters) {
    const paramName = param.replace(/[^a-zA-Z0-9]/g, "");
    code += `    @NotNull\n`;
    code += `    private Object ${paramName || "param"};\n\n`;
  }

  code += `}\n`;

  return {
    fileName: `${dtoName}.java`,
    path: `src/main/java/${packagePath}/dto/${dtoName}.java`,
    content: code,
    type: "dto",
  };
}

function generateResponseDto(
  serviceName: string,
  call: MethodCall,
  basePackage: string,
  packagePath: string
): GeneratedFile {
  const dtoName = capitalize(call.methodName) + "ResponseDTO";

  let code = `package ${basePackage}.dto;\n\n`;
  code += `import lombok.AllArgsConstructor;\n`;
  code += `import lombok.Builder;\n`;
  code += `import lombok.Data;\n`;
  code += `import lombok.NoArgsConstructor;\n\n`;
  code += `/**\n`;
  code += ` * DTO de réponse pour ${serviceName}.${call.methodName}().\n`;
  code += ` *\n`;
  code += ` * @author Hamza NORDINE\n`;
  code += ` */\n`;
  code += `@Data\n`;
  code += `@Builder\n`;
  code += `@NoArgsConstructor\n`;
  code += `@AllArgsConstructor\n`;
  code += `public class ${dtoName} {\n\n`;
  code += `    // TODO: Ajouter les champs correspondant au type de retour ${call.returnType}\n`;
  code += `    private Object data;\n\n`;
  code += `}\n`;

  return {
    fileName: `${dtoName}.java`,
    path: `src/main/java/${packagePath}/dto/${dtoName}.java`,
    content: code,
    type: "dto",
  };
}

function generateClientTest(
  clientName: string,
  calls: MethodCall[],
  basePackage: string,
  packagePath: string
): GeneratedFile {
  let code = `package ${basePackage}.client;\n\n`;
  code += `import ${basePackage}.exception.ApiClientException;\n`;
  code += `import org.junit.jupiter.api.BeforeEach;\n`;
  code += `import org.junit.jupiter.api.DisplayName;\n`;
  code += `import org.junit.jupiter.api.Test;\n`;
  code += `import org.junit.jupiter.api.extension.ExtendWith;\n`;
  code += `import org.mockito.Mock;\n`;
  code += `import org.mockito.junit.jupiter.MockitoExtension;\n`;
  code += `import org.springframework.web.reactive.function.client.WebClient;\n\n`;
  code += `import static org.junit.jupiter.api.Assertions.*;\n`;
  code += `import static org.mockito.Mockito.*;\n\n`;
  code += `/**\n`;
  code += ` * Tests unitaires pour ${clientName}.\n`;
  code += ` *\n`;
  code += ` * @author Hamza NORDINE\n`;
  code += ` */\n`;
  code += `@ExtendWith(MockitoExtension.class)\n`;
  code += `class ${clientName}Test {\n\n`;
  code += `    @Mock\n`;
  code += `    private WebClient webClient;\n\n`;
  code += `    private ${clientName} apiClient;\n\n`;
  code += `    @BeforeEach\n`;
  code += `    void setUp() {\n`;
  code += `        apiClient = new ${clientName}(webClient);\n`;
  code += `    }\n\n`;

  for (const call of calls) {
    code += `    @Test\n`;
    code += `    @DisplayName("${call.methodName} doit appeler l'API REST correctement")\n`;
    code += `    void test_${call.methodName}() {\n`;
    code += `        // TODO: Implémenter le test avec WebClient mock\n`;
    code += `        assertNotNull(apiClient);\n`;
    code += `    }\n\n`;
  }

  code += `}\n`;

  return {
    fileName: `${clientName}Test.java`,
    path: `src/test/java/${packagePath}/client/${clientName}Test.java`,
    content: code,
    type: "test",
  };
}

function generatePom(basePackage: string): GeneratedFile {
  const artifactId = "api-client-modernized";
  const code = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.2</version>
    </parent>

    <groupId>${basePackage}</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <name>API Client Modernized</name>
    <description>Clients API REST modernes générés par EJB Client Modernizer — Hamza NORDINE</description>

    <properties>
        <java.version>21</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webflux</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>io.projectreactor</groupId>
            <artifactId>reactor-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`;

  return {
    fileName: "pom.xml",
    path: "pom.xml",
    content: code,
    type: "config",
  };
}

function generateApplicationYml(): GeneratedFile {
  const code = `# Configuration de l'application API Client Modernized
# Généré par EJB Client Modernizer — Hamza NORDINE

api:
  base-url: \${API_BASE_URL:http://bank-api}
  timeout:
    connect: 5000
    read: 30000

spring:
  application:
    name: api-client-modernized

logging:
  level:
    com.bank.client: DEBUG
    org.springframework.web.reactive: DEBUG
`;

  return {
    fileName: "application.yml",
    path: "src/main/resources/application.yml",
    content: code,
    type: "config",
  };
}

// ============================================================
// Utilitaires
// ============================================================

function inferRestBasePath(serviceName: string): string {
  const name = serviceName
    .replace(/Service$/, "")
    .replace(/Bean$/, "")
    .replace(/EJB$/, "");
  return `/api/v1/${camelToKebab(name)}s`;
}

function inferHttpMethod(methodName: string): string {
  const lower = methodName.toLowerCase();
  if (lower.startsWith("get") || lower.startsWith("find") || lower.startsWith("search") || lower.startsWith("list") || lower.startsWith("fetch")) return "GET";
  if (lower.startsWith("create") || lower.startsWith("add") || lower.startsWith("save") || lower.startsWith("insert") || lower.startsWith("transfer")) return "POST";
  if (lower.startsWith("update") || lower.startsWith("modify") || lower.startsWith("edit")) return "PUT";
  if (lower.startsWith("delete") || lower.startsWith("remove")) return "DELETE";
  return "POST";
}

function inferRestPath(methodName: string, basePath: string): string {
  const httpMethod = inferHttpMethod(methodName);
  if (httpMethod === "GET" && methodName.toLowerCase().match(/^get[A-Z]/)) {
    return `${basePath}/{id}`;
  }
  if (httpMethod === "PUT" || httpMethod === "DELETE") {
    return `${basePath}/{id}`;
  }
  return basePath;
}

function mapReturnType(call: MethodCall): string {
  if (call.returnType === "void") return "Void";
  if (call.returnType.startsWith("List<")) return call.returnType;
  return capitalize(call.methodName) + "ResponseDTO";
}

function buildMethodParams(call: MethodCall): string {
  if (call.parameters.length === 0) return "";
  return call.parameters.map((p) => `Object ${p.replace(/[^a-zA-Z0-9]/g, "") || "param"}`).join(", ");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function generateProjectStructureText(files: GeneratedFile[]): string {
  let structure = "api-client-modernized/\n";
  const paths = files.map((f) => f.path).sort();
  for (const p of paths) {
    const indent = "  ".repeat(p.split("/").length - 1);
    const fileName = p.split("/").pop();
    structure += `${indent}${fileName}\n`;
  }
  return structure;
}
