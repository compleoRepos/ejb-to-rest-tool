package com.bank.tools.generator.bian;

import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Regroupe les UseCases par Service Domain BIAN et genere
 * un controller unique par Service Domain au lieu d'un controller par UseCase.
 *
 * Exemple :
 * - ActiverCarteUC + ReceptionnerCarteUC → CardManagementController
 * - CreateAccountUC + CloseAccountUC + AccountBalanceUC → CurrentAccountController
 */
@Component
public class BianControllerGrouper {

    private static final Logger log = LoggerFactory.getLogger(BianControllerGrouper.class);

    /**
     * Regroupe les UseCases par Service Domain BIAN.
     *
     * @param useCases liste des UseCases avec leur BianMapping
     * @return Map<controllerName, List<UseCaseInfo>> regroupes
     */
    public Map<String, List<UseCaseInfo>> groupByServiceDomain(List<UseCaseInfo> useCases) {
        Map<String, List<UseCaseInfo>> grouped = new LinkedHashMap<>();

        for (UseCaseInfo uc : useCases) {
            BianMapping mapping = uc.getBianMapping();
            if (mapping == null) continue;

            String controllerName = buildGroupedControllerName(mapping);
            grouped.computeIfAbsent(controllerName, k -> new ArrayList<>()).add(uc);
        }

        log.info("[BianGrouper] {} UseCases regroupes en {} controllers BIAN",
                useCases.size(), grouped.size());
        grouped.forEach((name, ucs) ->
                log.debug("[BianGrouper]   {} → {} endpoints", name, ucs.size()));

        return grouped;
    }

    /**
     * Genere un controller BIAN regroupe contenant tous les endpoints
     * d'un meme Service Domain.
     *
     * @param srcMain chemin vers src/main/java
     * @param controllerName nom du controller (ex: CurrentAccountController)
     * @param useCases liste des UseCases de ce Service Domain
     * @param basePackage package racine du projet genere
     */
    public void generateGroupedController(Path srcMain, String controllerName,
                                           List<UseCaseInfo> useCases, String basePackage) throws IOException {
        if (useCases.isEmpty()) return;

        BianMapping firstMapping = useCases.get(0).getBianMapping();
        String serviceDomainTitle = firstMapping.getServiceDomainTitle();
        String bianId = firstMapping.getBianId();
        String tagName = serviceDomainTitle;
        String tagDescription = "BIAN " + (bianId != null ? bianId + " — " : "") + serviceDomainTitle;

        StringBuilder sb = new StringBuilder();

        // Package
        sb.append("package ").append(basePackage).append(".controller;\n\n");

        // Imports
        sb.append("import ").append(basePackage).append(".service.*;\n");
        sb.append("import ").append(basePackage).append(".dto.*;\n");
        sb.append("import io.swagger.v3.oas.annotations.Operation;\n");
        sb.append("import io.swagger.v3.oas.annotations.Parameter;\n");
        sb.append("import io.swagger.v3.oas.annotations.responses.ApiResponse;\n");
        sb.append("import io.swagger.v3.oas.annotations.tags.Tag;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.http.HttpStatus;\n");
        sb.append("import org.springframework.http.ResponseEntity;\n");
        sb.append("import org.springframework.web.bind.annotation.*;\n");
        sb.append("import jakarta.validation.Valid;\n\n");

        // Classe
        sb.append("/**\n");
        sb.append(" * Controller BIAN regroupe pour le Service Domain : ").append(serviceDomainTitle).append("\n");
        if (bianId != null && !bianId.isEmpty()) {
            sb.append(" * BIAN ID : ").append(bianId).append("\n");
        }
        sb.append(" *\n");
        sb.append(" * Endpoints regroupes :\n");
        for (UseCaseInfo uc : useCases) {
            BianMapping m = uc.getBianMapping();
            sb.append(" *   - ").append(m.getHttpMethod()).append(" ")
              .append(m.buildUrl("/api/v1")).append(" (").append(uc.getClassName()).append(")\n");
        }
        sb.append(" *\n");
        sb.append(" * @generated par Compleo — Direction Digitale Factory BMCE Bank\n");
        sb.append(" */\n");
        sb.append("@RestController\n");
        sb.append("@RequestMapping(\"/api/v1/").append(firstMapping.getServiceDomain()).append("\")\n");
        sb.append("@Tag(name = \"").append(tagName).append("\", description = \"").append(tagDescription).append("\")\n");
        sb.append("public class ").append(controllerName).append(" {\n\n");

        // Logger
        sb.append("    private static final Logger log = LoggerFactory.getLogger(")
          .append(controllerName).append(".class);\n\n");

        // Injections des adapters
        Set<String> injectedAdapters = new LinkedHashSet<>();
        for (UseCaseInfo uc : useCases) {
            String adapterName = uc.getServiceAdapterName();
            if (adapterName != null && injectedAdapters.add(adapterName)) {
                String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
                sb.append("    private final ").append(adapterName).append(" ").append(adapterField).append(";\n");
            }
        }

        // Constructeur
        sb.append("\n    public ").append(controllerName).append("(");
        List<String> adapterList = new ArrayList<>(injectedAdapters);
        for (int i = 0; i < adapterList.size(); i++) {
            String adapterName = adapterList.get(i);
            String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
            if (i > 0) sb.append(",\n            ");
            sb.append(adapterName).append(" ").append(adapterField);
        }
        sb.append(") {\n");
        for (String adapterName : adapterList) {
            String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
            sb.append("        this.").append(adapterField).append(" = ").append(adapterField).append(";\n");
        }
        sb.append("    }\n\n");

        // Endpoints
        for (UseCaseInfo uc : useCases) {
            BianMapping mapping = uc.getBianMapping();
            if (mapping == null) continue;

            String operationId = mapping.buildOperationId();
            String summary = mapping.getSummary() != null ? mapping.getSummary() : "Operation " + uc.getClassName();
            String httpMethod = mapping.getHttpMethod() != null ? mapping.getHttpMethod() : "POST";
            int httpStatus = mapping.getHttpStatus();
            String adapterName = uc.getServiceAdapterName();
            String adapterField = adapterName != null ?
                    Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1) : "adapter";

            // URL relative (sans le base path du controller)
            String relativeUrl = buildRelativeUrl(mapping, firstMapping.getServiceDomain());

            // Input/Output
            String inputDto = uc.getInputDtoClassName();
            String outputDto = uc.getOutputDtoClassName();
            boolean hasInput = inputDto != null && !inputDto.isEmpty() && !"Void".equals(inputDto);
            boolean hasOutput = outputDto != null && !outputDto.isEmpty() && !"Void".equals(outputDto);

            // Javadoc
            sb.append("    /**\n");
            sb.append("     * ").append(summary).append("\n");
            sb.append("     * UseCase source : ").append(uc.getClassName()).append("\n");
            sb.append("     * Action BIAN : ").append(mapping.getAction()).append("\n");
            if (mapping.getBehaviorQualifier() != null) {
                sb.append("     * Behavior Qualifier : ").append(mapping.getBehaviorQualifier()).append("\n");
            }
            sb.append("     */\n");

            // @Operation
            sb.append("    @Operation(\n");
            sb.append("        operationId = \"").append(operationId).append("\",\n");
            sb.append("        summary = \"").append(summary).append("\",\n");
            sb.append("        responses = @ApiResponse(responseCode = \"").append(httpStatus).append("\")\n");
            sb.append("    )\n");

            // @RequestMapping
            // BUG 4 FIX : Si le UseCase prend un VoIn en entree (@RequestBody),
            // toujours utiliser POST meme si l'action BIAN est retrieval.
            // Les GET ne doivent jamais avoir de @RequestBody (standard HTTP).
            String springAnnotation;
            if (hasInput) {
                springAnnotation = "@PostMapping";
            } else {
                springAnnotation = switch (httpMethod.toUpperCase()) {
                    case "GET" -> "@GetMapping";
                    case "PUT" -> "@PutMapping";
                    case "DELETE" -> "@DeleteMapping";
                    case "PATCH" -> "@PatchMapping";
                    default -> "@PostMapping";
                };
            }
            sb.append("    ").append(springAnnotation).append("(\"").append(relativeUrl).append("\")\n");

            // Methode
            String returnType = hasOutput ? "ResponseEntity<" + outputDto + ">" : "ResponseEntity<Void>";
            sb.append("    public ").append(returnType).append(" ").append(operationId).append("(\n");

            // Parametres
            boolean hasPathParam = relativeUrl.contains("{cr-reference-id}");
            boolean hasBqPathParam = relativeUrl.contains("{bq-reference-id}");
            List<String> params = new ArrayList<>();

            if (hasPathParam) {
                params.add("            @Parameter(description = \"Control Record Reference ID\") @PathVariable(\"cr-reference-id\") String crReferenceId");
            }
            if (hasBqPathParam) {
                params.add("            @Parameter(description = \"Behavior Qualifier Reference ID\") @PathVariable(\"bq-reference-id\") String bqReferenceId");
            }
            if (hasInput) {
                params.add("            @Valid @RequestBody " + inputDto + " request");
            }

            sb.append(String.join(",\n", params));
            sb.append(") {\n");

            // Corps — Prefixes [REST-IN] / [REST-OUT] / [REST-ERROR]
            String fullBianUrl = "/api/v1/" + firstMapping.getServiceDomain() + relativeUrl;
            String httpMethodUpper = hasInput ? "POST" : httpMethod.toUpperCase();

            // [REST-IN] Reception de la requete
            if (hasPathParam) {
                sb.append("        log.info(\"[REST-IN] ").append(httpMethodUpper).append(" ").append(fullBianUrl.replace("{cr-reference-id}", "{}")).append("\", crReferenceId);\n");
            } else {
                sb.append("        log.info(\"[REST-IN] ").append(httpMethodUpper).append(" ").append(fullBianUrl).append("\");\n");
            }
            sb.append("        try {\n");

            if (hasOutput && hasInput) {
                sb.append("            ").append(outputDto).append(" response = ").append(adapterField)
                  .append(".execute(request);\n");
                if (httpStatus == 201) {
                    sb.append("            log.info(\"[REST-OUT] 201 Created\");\n");
                    sb.append("            return ResponseEntity.status(HttpStatus.CREATED).body(response);\n");
                } else {
                    sb.append("            log.info(\"[REST-OUT] 200 OK\");\n");
                    sb.append("            return ResponseEntity.ok(response);\n");
                }
            } else if (hasOutput) {
                sb.append("            ").append(outputDto).append(" response = ").append(adapterField)
                  .append(".execute();\n");
                sb.append("            log.info(\"[REST-OUT] 200 OK\");\n");
                sb.append("            return ResponseEntity.ok(response);\n");
            } else if (hasInput) {
                sb.append("            ").append(adapterField).append(".execute(request);\n");
                sb.append("            log.info(\"[REST-OUT] 200 OK\");\n");
                sb.append("            return ResponseEntity.ok().build();\n");
            } else {
                sb.append("            ").append(adapterField).append(".execute();\n");
                sb.append("            log.info(\"[REST-OUT] 200 OK\");\n");
                sb.append("            return ResponseEntity.ok().build();\n");
            }

            // [REST-ERROR]
            sb.append("        } catch (Exception e) {\n");
            sb.append("            log.error(\"[REST-ERROR] ").append(operationId).append(" : {}\", e.getMessage());\n");
            sb.append("            throw new RuntimeException(e.getMessage(), e);\n");
            sb.append("        }\n");

            sb.append("    }\n\n");
        }

        sb.append("}\n");

        // Ecrire le fichier — srcMain pointe deja vers src/main/java/{basePackage}/
        // NE PAS re-resoudre le basePackage pour eviter le double prefixe
        Path controllerDir = srcMain.resolve("controller");
        Files.createDirectories(controllerDir);
        Path controllerFile = controllerDir.resolve(controllerName + ".java");
        Files.writeString(controllerFile, sb.toString());

        log.info("[BianGrouper] Controller genere : {} ({} endpoints)", controllerName, useCases.size());
    }

    // ===================== UTILITAIRES =====================

    /**
     * Construit le nom du controller regroupe a partir du Service Domain.
     */
    private String buildGroupedControllerName(BianMapping mapping) {
        String domain = mapping.getServiceDomain();
        StringBuilder sb = new StringBuilder();
        for (String part : domain.split("-")) {
            if (!part.isEmpty()) {
                sb.append(Character.toUpperCase(part.charAt(0)));
                if (part.length() > 1) sb.append(part.substring(1));
            }
        }
        sb.append("Controller");
        return sb.toString();
    }

    /**
     * Construit l'URL relative par rapport au base path du controller.
     * Ex: si controller = /api/v1/current-account et URL BIAN = /current-account/{cr-reference-id}/balance/retrieval
     * → URL relative = /{cr-reference-id}/balance/retrieval
     */
    private String buildRelativeUrl(BianMapping mapping, String serviceDomain) {
        String fullUrl = mapping.getUrl();
        if (fullUrl == null) {
            fullUrl = mapping.buildUrl("");
        }
        // Retirer le prefixe du service domain
        String prefix = "/" + serviceDomain;
        if (fullUrl.startsWith(prefix)) {
            return fullUrl.substring(prefix.length());
        }
        return fullUrl;
    }
}
