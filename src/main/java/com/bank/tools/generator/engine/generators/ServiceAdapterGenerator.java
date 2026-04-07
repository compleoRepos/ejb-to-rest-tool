package com.bank.tools.generator.engine.generators;

import com.bank.tools.generator.engine.util.CodeGenUtils;
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
 * Genere les ServiceAdapters (JNDI lookup) pour les trois patterns EJB :
 * BaseUseCase, Multi-methodes et MDB.
 * Extrait de CodeGenerationEngine pour respecter SRP.
 */
@Component
public class ServiceAdapterGenerator {

    private static final Logger log = LoggerFactory.getLogger(ServiceAdapterGenerator.class);
    private static final String BASE_PACKAGE = "com.bank.api";

    /**
     * Genere un ServiceAdapter pour un UseCase BaseUseCase.
     */
    public void generateBaseUseCaseAdapter(Path srcMain, UseCaseInfo useCase) throws IOException {
        String inputDto = useCase.getInputDtoClassName();
        String outputDto = useCase.getOutputDtoClassName();
        String adapterName = useCase.getServiceAdapterName();

        Set<String> imports = new TreeSet<>();
        imports.add(BASE_PACKAGE + ".dto." + inputDto);
        imports.add(BASE_PACKAGE + ".dto." + outputDto);
        imports.add("com.fasterxml.jackson.databind.ObjectMapper");
        imports.add("org.slf4j.Logger");
        imports.add("org.slf4j.LoggerFactory");
        imports.add("org.springframework.beans.factory.annotation.Value");
        imports.add("org.springframework.stereotype.Service");
        imports.add("javax.naming.Context");
        imports.add("javax.naming.InitialContext");
        imports.add("java.lang.reflect.Method");
        imports.add("java.util.Properties");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".service;\n\n");
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n/**\n * ServiceAdapter pour ").append(useCase.getClassName()).append(".\n");
        sb.append(" * Effectue le lookup JNDI et la conversion DTO.\n */\n");
        sb.append("@Service\n");
        sb.append("public class ").append(adapterName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n");
        sb.append("    private static final ObjectMapper objectMapper = new ObjectMapper();\n\n");
        sb.append("    @Value(\"${ejb.jndi.provider-url}\")\n");
        sb.append("    private String jndiProviderUrl;\n\n");
        sb.append("    @Value(\"${ejb.jndi.factory}\")\n");
        sb.append("    private String jndiFactory;\n\n");
        sb.append("    public ").append(outputDto).append(" execute(").append(inputDto).append(" input) throws Exception {\n");
        sb.append("        log.info(\"[JNDI] Lookup EJB pour ").append(useCase.getClassName()).append("\");\n");
        sb.append("        Properties props = new Properties();\n");
        sb.append("        props.put(Context.INITIAL_CONTEXT_FACTORY, jndiFactory);\n");
        sb.append("        props.put(Context.PROVIDER_URL, jndiProviderUrl);\n");
        sb.append("        Context ctx = new InitialContext(props);\n");
        sb.append("        try {\n");
        sb.append("            Object ejb = ctx.lookup(\"").append(useCase.getJndiName()).append("\");\n");
        sb.append("            Method executeMethod = findExecuteMethod(ejb);\n");
        sb.append("            String inputJson = objectMapper.writeValueAsString(input);\n");
        sb.append("            Object ejbInput = objectMapper.readValue(inputJson, executeMethod.getParameterTypes()[0]);\n");
        sb.append("            Object result = executeMethod.invoke(ejb, ejbInput);\n");
        sb.append("            String resultJson = objectMapper.writeValueAsString(result);\n");
        sb.append("            return objectMapper.readValue(resultJson, ").append(outputDto).append(".class);\n");
        sb.append("        } finally {\n");
        sb.append("            ctx.close();\n");
        sb.append("        }\n");
        sb.append("    }\n\n");
        sb.append("    private Method findExecuteMethod(Object ejb) throws NoSuchMethodException {\n");
        sb.append("        for (Method m : ejb.getClass().getMethods()) {\n");
        sb.append("            if (m.getName().equals(\"execute\") && m.getParameterCount() == 1) return m;\n");
        sb.append("        }\n");
        sb.append("        throw new NoSuchMethodException(\"execute(Object) not found on \" + ejb.getClass().getName());\n");
        sb.append("    }\n}\n");

        Files.writeString(srcMain.resolve("service/" + adapterName + ".java"), sb.toString());
        log.info("ServiceAdapter genere : {}", adapterName);
    }

    /**
     * Genere un ServiceAdapter multi-methodes.
     */
    public void generateMultiMethodAdapter(Path srcMain, UseCaseInfo useCase) throws IOException {
        String adapterName = useCase.getServiceAdapterName();

        Set<String> imports = new TreeSet<>();
        imports.add("org.slf4j.Logger");
        imports.add("org.slf4j.LoggerFactory");
        imports.add("org.springframework.beans.factory.annotation.Value");
        imports.add("org.springframework.stereotype.Service");
        imports.add("javax.naming.Context");
        imports.add("javax.naming.InitialContext");
        imports.add("java.util.Properties");

        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            CodeGenUtils.resolveTypeImports(method.getReturnType(), imports);
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                CodeGenUtils.resolveTypeImports(param.getType(), imports);
            }
            String returnBase = CodeGenUtils.extractBaseType(method.getReturnType());
            if (CodeGenUtils.isDtoType(returnBase)) {
                imports.add(BASE_PACKAGE + ".dto." + returnBase);
            }
            for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
                String paramBase = CodeGenUtils.extractBaseType(param.getType());
                if (CodeGenUtils.isDtoType(paramBase)) {
                    imports.add(BASE_PACKAGE + ".dto." + paramBase);
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".service;\n\n");
        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n/**\n * ServiceAdapter multi-methodes pour ").append(useCase.getClassName()).append(".\n */\n");
        sb.append("@Service\n");
        sb.append("public class ").append(adapterName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");
        sb.append("    @Value(\"${ejb.jndi.provider-url}\")\n");
        sb.append("    private String jndiProviderUrl;\n\n");
        sb.append("    @Value(\"${ejb.jndi.factory}\")\n");
        sb.append("    private String jndiFactory;\n\n");
        sb.append("    private Object lookupEjb() throws Exception {\n");
        sb.append("        Properties props = new Properties();\n");
        sb.append("        props.put(Context.INITIAL_CONTEXT_FACTORY, jndiFactory);\n");
        sb.append("        props.put(Context.PROVIDER_URL, jndiProviderUrl);\n");
        sb.append("        Context ctx = new InitialContext(props);\n");
        sb.append("        try {\n");
        sb.append("            return ctx.lookup(\"").append(useCase.getJndiName()).append("\");\n");
        sb.append("        } finally {\n");
        sb.append("            ctx.close();\n");
        sb.append("        }\n");
        sb.append("    }\n");

        for (UseCaseInfo.MethodInfo method : useCase.getPublicMethods()) {
            String returnType = method.getReturnType();
            String params = method.getParameters().stream()
                    .map(p -> p.getType() + " " + p.getName())
                    .collect(Collectors.joining(", "));
            String args = method.getParameters().stream()
                    .map(UseCaseInfo.ParameterInfo::getName)
                    .collect(Collectors.joining(", "));

            sb.append("\n    public ").append(returnType).append(" ").append(method.getName()).append("(").append(params).append(") throws Exception {\n");
            sb.append("        log.info(\"[JNDI] ").append(method.getName()).append("\");\n");
            sb.append("        Object ejb = lookupEjb();\n");
            if (returnType.equals("void")) {
                sb.append("        ejb.getClass().getMethod(\"").append(method.getName()).append("\"");
                for (UseCaseInfo.ParameterInfo p : method.getParameters()) {
                    sb.append(", ").append(p.getType()).append(".class");
                }
                sb.append(").invoke(ejb, ").append(args).append(");\n");
            } else {
                sb.append("        return (").append(returnType).append(") ejb.getClass().getMethod(\"").append(method.getName()).append("\"");
                for (UseCaseInfo.ParameterInfo p : method.getParameters()) {
                    sb.append(", ").append(p.getType()).append(".class");
                }
                sb.append(").invoke(ejb, ").append(args).append(");\n");
            }
            sb.append("    }\n");
        }

        sb.append("}\n");

        Files.writeString(srcMain.resolve("service/" + adapterName + ".java"), sb.toString());
        log.info("ServiceAdapter multi-methodes genere : {}", adapterName);
    }

    /**
     * Genere un ServiceAdapter MDB (async).
     */
    public void generateMdbAdapter(Path srcMain, UseCaseInfo useCase) throws IOException {
        String adapterName = useCase.getServiceAdapterName();
        String inputDto = useCase.getInputDtoClassName();

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(BASE_PACKAGE).append(".service;\n\n");
        sb.append("import ").append(BASE_PACKAGE).append(".dto.").append(inputDto).append(";\n");
        sb.append("import org.slf4j.Logger;\nimport org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.stereotype.Service;\n\n");
        sb.append("/**\n * ServiceAdapter MDB pour ").append(useCase.getClassName()).append(".\n */\n");
        sb.append("@Service\n");
        sb.append("public class ").append(adapterName).append(" {\n\n");
        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");
        sb.append("    public void process(").append(inputDto).append(" input) {\n");
        sb.append("        log.info(\"[MDB] Processing message for ").append(useCase.getClassName()).append("\");\n");
        sb.append("        // TODO: Implement message processing logic\n");
        sb.append("    }\n}\n");

        Files.writeString(srcMain.resolve("service/" + adapterName + ".java"), sb.toString());
        log.info("ServiceAdapter MDB genere : {}", adapterName);
    }
}
