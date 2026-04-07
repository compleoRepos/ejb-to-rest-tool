package com.bank.tools.generator.engine.generators;

import com.bank.tools.generator.engine.constants.GeneratorConstants;
import com.bank.tools.generator.engine.util.CodeGenUtils;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

import static com.bank.tools.generator.engine.constants.GeneratorConstants.*;

/**
 * Génère les controllers REST (pattern BaseUseCase et multi-méthodes).
 * Extrait de CodeGenerationEngine pour respecter SRP.
 *
 * Patterns supportés :
 * - BaseUseCase : 1 controller avec 1 méthode execute()
 * - Multi-méthodes : 1 controller avec N méthodes (interface @Remote)
 * - MDB : 1 controller async avec EventPublisher
 */
@Component
public class ControllerGenerator {

    private static final Logger log = LoggerFactory.getLogger(ControllerGenerator.class);

    /**
     * Génère un controller pour un UseCase BaseUseCase (1 endpoint POST).
     */
    public void generateBaseUseCaseController(Path srcMain, UseCaseInfo useCase, String basePackage) throws IOException {
        String inputDto = useCase.getInputDtoClassName();
        String outputDto = useCase.getOutputDtoClassName();
        String controllerName = useCase.getControllerName();
        String adapterName = useCase.getServiceAdapterName();
        String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
        String endpoint = useCase.getRestEndpoint();
        boolean hasXml = useCase.hasXmlSupport();

        String swaggerSummary = CodeGenUtils.deriveSwaggerSummary(useCase.getClassName());
        String swaggerDescription = useCase.getJavadoc() != null ? useCase.getJavadoc() : swaggerSummary;

        Set<String> imports = new TreeSet<>();
        imports.add(basePackage + ".dto." + inputDto);
        imports.add(basePackage + ".dto." + outputDto);
        imports.add(basePackage + ".service." + adapterName);
        imports.add("org.slf4j.Logger");
        imports.add("org.slf4j.LoggerFactory");
        imports.add("org.springframework.http.ResponseEntity");
        imports.add("org.springframework.web.bind.annotation.*");
        imports.add("io.swagger.v3.oas.annotations.Operation");
        imports.add("io.swagger.v3.oas.annotations.responses.ApiResponse");
        imports.add("io.swagger.v3.oas.annotations.responses.ApiResponses");
        imports.add("io.swagger.v3.oas.annotations.media.Content");
        imports.add("io.swagger.v3.oas.annotations.media.Schema");

        if (useCase.isInputDtoHasRequiredFields()) {
            imports.add("jakarta.validation.Valid");
        }

        String validAnnotation = useCase.isInputDtoHasRequiredFields() ? "@Valid " : "";
        String producesConsumes = hasXml
                ? ",\n        produces = { \"application/json\", \"application/xml\" },\n        consumes = { \"application/json\", \"application/xml\" }"
                : "";

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(basePackage).append(".controller;\n\n");
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n");
        sb.append("/**\n");
        sb.append(" * Controller REST pour ").append(useCase.getClassName()).append(".\n");
        sb.append(" * Endpoint : ").append(endpoint).append("\n");
        sb.append(" */\n");
        sb.append("@RestController\n");
        sb.append("@RequestMapping(value = \"").append(endpoint).append("\"").append(producesConsumes).append(")\n");
        sb.append("public class ").append(controllerName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(controllerName).append(".class);\n\n");
        sb.append("    private final ").append(adapterName).append(" ").append(adapterField).append(";\n\n");
        sb.append("    public ").append(controllerName).append("(").append(adapterName).append(" ").append(adapterField).append(") {\n");
        sb.append("        this.").append(adapterField).append(" = ").append(adapterField).append(";\n");
        sb.append("    }\n\n");

        sb.append("    @Operation(\n");
        sb.append("        summary = \"").append(CodeGenUtils.escapeJavaString(swaggerSummary)).append("\",\n");
        sb.append("        description = \"").append(CodeGenUtils.escapeJavaString(swaggerDescription)).append("\"\n");
        sb.append("    )\n");
        sb.append("    @ApiResponses(value = {\n");
        sb.append("        @ApiResponse(responseCode = \"200\", description = \"Succes\",\n");
        sb.append("            content = @Content(schema = @Schema(implementation = ").append(outputDto).append(".class))),\n");
        sb.append("        @ApiResponse(responseCode = \"400\", description = \"Requete invalide\"),\n");
        sb.append("        @ApiResponse(responseCode = \"503\", description = \"Service EJB indisponible\")\n");
        sb.append("    })\n");
        sb.append("    @PostMapping\n");
        sb.append("    public ResponseEntity<").append(outputDto).append("> execute(").append(validAnnotation).append("@RequestBody ").append(inputDto).append(" input) {\n");
        sb.append("        log.info(\"[REST-IN] POST ").append(endpoint).append(" - UC: ").append(useCase.getClassName()).append("\");\n");
        sb.append("        try {\n");
        sb.append("            ").append(outputDto).append(" result = ").append(adapterField).append(".execute(input);\n");
        sb.append("            log.info(\"[REST-OUT] 200 OK\");\n");
        sb.append("            return ResponseEntity.ok(result);\n");
        sb.append("        } catch (Exception e) {\n");
        sb.append("            log.error(\"[REST-ERROR] ").append(useCase.getClassName()).append(" : {}\", e.getMessage());\n");
        sb.append("            throw new RuntimeException(e.getMessage(), e);\n");
        sb.append("        }\n");
        sb.append("    }\n");
        sb.append("}\n");

        Files.writeString(srcMain.resolve("controller/" + controllerName + ".java"), sb.toString());
        log.info("Controller généré : {}", controllerName);
    }

    /**
     * Génère un controller multi-méthodes (interface @Remote avec N méthodes).
     */
    public void generateMultiMethodController(Path srcMain, UseCaseInfo useCase, String basePackage) throws IOException {
        String controllerName = useCase.getControllerName();
        String adapterName = useCase.getServiceAdapterName();
        String adapterField = Character.toLowerCase(adapterName.charAt(0)) + adapterName.substring(1);
        String baseEndpoint = useCase.getRestEndpoint();

        Set<String> imports = new TreeSet<>();
        imports.add(basePackage + ".service." + adapterName);
        imports.add("org.slf4j.Logger");
        imports.add("org.slf4j.LoggerFactory");
        imports.add("org.springframework.http.ResponseEntity");
        imports.add("org.springframework.http.HttpStatus");
        imports.add("org.springframework.web.bind.annotation.*");
        imports.add("io.swagger.v3.oas.annotations.Operation");

        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            CodeGenUtils.resolveTypeImports(method.getReturnType(), imports);
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                CodeGenUtils.resolveTypeImports(param.getType(), imports);
            }
            String returnBase = CodeGenUtils.extractBaseType(method.getReturnType());
            if (CodeGenUtils.isDtoType(returnBase)) {
                imports.add(basePackage + ".dto." + returnBase);
            }
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                String paramBase = CodeGenUtils.extractBaseType(param.getType());
                if (CodeGenUtils.isDtoType(paramBase)) {
                    imports.add(basePackage + ".dto." + paramBase);
                }
            }
        }

        if (useCase.getPublicMethods().stream().anyMatch(m -> m.getReturnType().equals("byte[]"))) {
            imports.add("org.springframework.http.HttpHeaders");
            imports.add("org.springframework.http.MediaType");
        }

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(basePackage).append(".controller;\n\n");
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n/**\n");
        sb.append(" * Controller REST multi-méthodes pour ").append(useCase.getClassName()).append(".\n");
        sb.append(" */\n");
        sb.append("@RestController\n");
        sb.append("@RequestMapping(\"").append(baseEndpoint).append("\")\n");
        sb.append("public class ").append(controllerName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(controllerName).append(".class);\n\n");
        sb.append("    private final ").append(adapterName).append(" ").append(adapterField).append(";\n\n");
        sb.append("    public ").append(controllerName).append("(").append(adapterName).append(" ").append(adapterField).append(") {\n");
        sb.append("        this.").append(adapterField).append(" = ").append(adapterField).append(";\n");
        sb.append("    }\n");

        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            sb.append("\n");
            String subPath = "/" + CodeGenUtils.toKebabCase(method.getName());
            String httpAnnotation = resolveHttpAnnotation(method.getName(), method.getReturnType());
            String returnType = method.getReturnType();
            String responseType = CodeGenUtils.mapReturnType(returnType);

            sb.append("    @Operation(summary = \"").append(CodeGenUtils.escapeJavaString(CodeGenUtils.deriveSwaggerSummary(method.getName()))).append("\")\n");
            sb.append("    @").append(httpAnnotation).append("(\"").append(subPath).append("\")\n");
            sb.append("    public ResponseEntity<").append(responseType).append("> ").append(method.getName()).append("(");

            List<String> paramDecls = new ArrayList<>();
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                String annotation = resolveParamAnnotation(param);
                paramDecls.add(annotation + param.getType() + " " + param.getName());
            }
            sb.append(String.join(", ", paramDecls));
            sb.append(") {\n");

            sb.append("        log.info(\"[REST-IN] ").append(baseEndpoint).append(subPath).append(" - ").append(method.getName()).append("\");\n");
            sb.append("        try {\n");

            String args = method.getParameters().stream().map(UseCaseInfo.ParameterInfo::getName).collect(Collectors.joining(", "));
            if (returnType.equals("void")) {
                sb.append("            ").append(adapterField).append(".").append(method.getName()).append("(").append(args).append(");\n");
                sb.append("            log.info(\"[REST-OUT] 204 No Content\");\n");
                sb.append("            return ResponseEntity.noContent().build();\n");
            } else if (returnType.equals("byte[]")) {
                sb.append("            byte[] data = ").append(adapterField).append(".").append(method.getName()).append("(").append(args).append(");\n");
                sb.append("            log.info(\"[REST-OUT] 200 OK - {} octets\", data.length);\n");
                sb.append("            return ResponseEntity.ok()\n");
                sb.append("                .header(HttpHeaders.CONTENT_DISPOSITION, \"attachment; filename=export.bin\")\n");
                sb.append("                .contentType(MediaType.APPLICATION_OCTET_STREAM)\n");
                sb.append("                .body(data);\n");
            } else {
                sb.append("            ").append(returnType).append(" result = ").append(adapterField).append(".").append(method.getName()).append("(").append(args).append(");\n");
                sb.append("            log.info(\"[REST-OUT] 200 OK\");\n");
                sb.append("            return ResponseEntity.ok(result);\n");
            }

            sb.append("        } catch (Exception e) {\n");
            sb.append("            log.error(\"[REST-ERROR] ").append(method.getName()).append(" : {}\", e.getMessage());\n");
            sb.append("            throw new RuntimeException(e.getMessage(), e);\n");
            sb.append("        }\n");
            sb.append("    }\n");
        }

        sb.append("}\n");
        Files.writeString(srcMain.resolve("controller/" + controllerName + ".java"), sb.toString());
        log.info("Controller multi-méthodes généré : {} ({} routes)", controllerName, useCase.getPublicMethods().size());
    }

    // --- Helpers ---

    private String resolveHttpAnnotation(String methodName, String returnType) {
        String name = methodName.toLowerCase();
        if (name.startsWith("generate") && "byte[]".equals(returnType)) return "GetMapping";
        if (name.startsWith("find") || name.startsWith("get") || name.startsWith("list") || name.startsWith("search") || name.startsWith("count") || name.startsWith("is") || name.startsWith("has")) return "GetMapping";
        if (name.startsWith("update") || name.startsWith("modify") || name.startsWith("edit")) return "PutMapping";
        if (name.startsWith("delete") || name.startsWith("remove")) return "DeleteMapping";
        return "PostMapping";
    }

    private String resolveParamAnnotation(UseCaseInfo.ParameterInfo param) {
        String name = param.getName().toLowerCase();
        String type = CodeGenUtils.extractBaseType(param.getType());
        if (name.equals("id") || name.endsWith("id")) return "@PathVariable ";
        if (PRIMITIVE_TYPES.contains(type) || JAVA_LANG_TYPES.contains(type) || type.equals("BigDecimal")) return "@RequestParam ";
        if (CodeGenUtils.isDtoType(type)) return "@RequestBody ";
        return "@RequestBody ";
    }
}
