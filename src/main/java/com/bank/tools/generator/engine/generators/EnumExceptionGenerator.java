package com.bank.tools.generator.engine.generators;

import com.bank.tools.generator.engine.util.CodeGenUtils;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Génère les enums JAXB, exceptions custom, validateurs et interfaces @Remote.
 * Extrait de CodeGenerationEngine.
 */
@Component
public class EnumExceptionGenerator {

    private static final Logger log = LoggerFactory.getLogger(EnumExceptionGenerator.class);

    /**
     * Génère toutes les enums, exceptions, validateurs et interfaces.
     */
    public void generateAll(Path srcMain, ProjectAnalysisResult analysis, String basePackage) throws IOException {
        for (var enumInfo : analysis.getDetectedEnums()) {
            generateEnum(srcMain, enumInfo, basePackage);
        }
        for (var excInfo : analysis.getDetectedExceptions()) {
            generateException(srcMain, excInfo, basePackage);
        }
        for (var valInfo : analysis.getDetectedValidators()) {
            generateValidator(srcMain, valInfo, basePackage);
        }
        for (var ifaceInfo : analysis.getDetectedRemoteInterfaces()) {
            generateRemoteInterface(srcMain, ifaceInfo, basePackage);
        }
    }

    /**
     * Génère une enum JAXB avec migration javax → jakarta + Jackson annotations.
     */
    public void generateEnum(Path srcMain, ProjectAnalysisResult.EnumInfo enumInfo, String basePackage) throws IOException {
        String name = CodeGenUtils.sanitizeJavaIdentifier(enumInfo.getName());
        List<String> values = enumInfo.getValues();

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(basePackage).append(".enums;\n\n");
        sb.append("import com.fasterxml.jackson.annotation.JsonCreator;\n");
        sb.append("import com.fasterxml.jackson.annotation.JsonValue;\n");
        sb.append("import jakarta.xml.bind.annotation.XmlEnum;\n");
        sb.append("import jakarta.xml.bind.annotation.XmlType;\n\n");
        sb.append("@XmlType @XmlEnum\n");
        sb.append("public enum ").append(name).append(" {\n\n");

        for (int i = 0; i < values.size(); i++) {
            sb.append("    ").append(values.get(i));
            sb.append(i < values.size() - 1 ? ",\n" : ";\n");
        }

        sb.append("\n    @JsonValue\n");
        sb.append("    public String toValue() { return name(); }\n\n");
        sb.append("    @JsonCreator\n");
        sb.append("    public static ").append(name).append(" fromValue(String value) { return valueOf(value); }\n");
        sb.append("}\n");

        Files.writeString(srcMain.resolve("enums/" + name + ".java"), sb.toString());
        log.info("Enum générée : {} ({} valeurs)", name, values.size());
    }

    /**
     * Génère une exception custom avec mapping HTTP automatique.
     */
    public void generateException(Path srcMain, ProjectAnalysisResult.ExceptionInfo excInfo, String basePackage) throws IOException {
        String name = CodeGenUtils.sanitizeJavaIdentifier(excInfo.getName());
        String parent = excInfo.getParentClass() != null ? excInfo.getParentClass() : "RuntimeException";

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(basePackage).append(".exception;\n\n");
        sb.append("public class ").append(name).append(" extends ").append(parent).append(" {\n\n");
        sb.append("    private static final long serialVersionUID = 1L;\n\n");

        if (excInfo.getErrorCode() != null) {
            sb.append("    private final String errorCode = \"").append(excInfo.getErrorCode()).append("\";\n\n");
        }

        sb.append("    public ").append(name).append("() { super(); }\n");
        sb.append("    public ").append(name).append("(String message) { super(message); }\n");
        sb.append("    public ").append(name).append("(String message, Throwable cause) { super(message, cause); }\n\n");

        if (excInfo.getErrorCode() != null) {
            sb.append("    public String getErrorCode() { return errorCode; }\n");
        }

        sb.append("}\n");

        Files.writeString(srcMain.resolve("exception/" + name + ".java"), sb.toString());
        log.info("Exception générée : {} (extends {}, HTTP: {})", name, parent,
                CodeGenUtils.resolveExceptionHttpStatus(name));
    }

    /**
     * Génère un validateur custom avec migration javax → jakarta.
     */
    public void generateValidator(Path srcMain, ProjectAnalysisResult.ValidatorInfo valInfo, String basePackage) throws IOException {
        // Annotation
        if (valInfo.getAnnotationSource() != null && !valInfo.getAnnotationSource().isBlank()) {
            String source = valInfo.getAnnotationSource()
                    .replace("javax.validation", "jakarta.validation")
                    .replace("javax.annotation", "jakarta.annotation");
            String content = repackage(source, basePackage + ".validation");
            Files.writeString(srcMain.resolve("validation/" + valInfo.getAnnotationName() + ".java"), content);
        } else {
            generateFallbackAnnotation(srcMain, valInfo, basePackage);
        }

        // Validator
        if (valInfo.getValidatorSource() != null && !valInfo.getValidatorSource().isBlank()) {
            String source = valInfo.getValidatorSource()
                    .replace("javax.validation", "jakarta.validation")
                    .replace("javax.annotation", "jakarta.annotation");
            String content = repackage(source, basePackage + ".validation");
            Files.writeString(srcMain.resolve("validation/" + valInfo.getValidatorName() + ".java"), content);
        } else {
            generateFallbackValidator(srcMain, valInfo, basePackage);
        }

        log.info("Validateur généré : @{} / {}", valInfo.getAnnotationName(), valInfo.getValidatorName());
    }

    /**
     * Génère une interface @Remote avec migration javax → jakarta.
     */
    public void generateRemoteInterface(Path srcMain, ProjectAnalysisResult.RemoteInterfaceInfo ifaceInfo, String basePackage) throws IOException {
        String source = ifaceInfo.getSourceCode();
        if (source == null || source.isEmpty()) {
            log.warn("Source absente pour @Remote : {}", ifaceInfo.getName());
            return;
        }

        String content = repackage(source, basePackage + ".ejb.interfaces");
        // Supprimer @Remote/@Local annotations
        content = content.replaceAll("@Remote\\b.*\\n", "").replaceAll("@Local\\b.*\\n", "");

        Files.writeString(srcMain.resolve("ejb/interfaces/" + ifaceInfo.getName() + ".java"), content);
        log.info("Interface @Remote générée : {}", ifaceInfo.getName());
    }

    // --- Helpers ---

    private String repackage(String source, String newPackage) {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(newPackage).append(";\n\n");
        boolean inBody = false;
        for (String line : source.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("package ")) continue;
            if (trimmed.startsWith("import ")) {
                String migrated = trimmed
                        .replace("javax.validation", "jakarta.validation")
                        .replace("javax.ejb.", "jakarta.ejb.")
                        .replace("javax.xml.bind.", "jakarta.xml.bind.");
                if (!migrated.contains("jakarta.ejb.")) {
                    sb.append(migrated).append("\n");
                }
                continue;
            }
            sb.append(line).append("\n");
        }
        return sb.toString();
    }

    private void generateFallbackAnnotation(Path srcMain, ProjectAnalysisResult.ValidatorInfo valInfo, String basePackage) throws IOException {
        String code = """
                package %s.validation;
                
                import jakarta.validation.Constraint;
                import jakarta.validation.Payload;
                import java.lang.annotation.*;
                
                @Documented
                @Constraint(validatedBy = %s.class)
                @Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER})
                @Retention(RetentionPolicy.RUNTIME)
                public @interface %s {
                    String message() default "Validation failed";
                    Class<?>[] groups() default {};
                    Class<? extends Payload>[] payload() default {};
                }
                """.formatted(basePackage, valInfo.getValidatorName(), valInfo.getAnnotationName());
        Files.writeString(srcMain.resolve("validation/" + valInfo.getAnnotationName() + ".java"), code);
    }

    private void generateFallbackValidator(Path srcMain, ProjectAnalysisResult.ValidatorInfo valInfo, String basePackage) throws IOException {
        String code = """
                package %s.validation;
                
                import jakarta.validation.ConstraintValidator;
                import jakarta.validation.ConstraintValidatorContext;
                
                public class %s implements ConstraintValidator<%s, Object> {
                    @Override
                    public boolean isValid(Object value, ConstraintValidatorContext context) {
                        return value != null;
                    }
                }
                """.formatted(basePackage, valInfo.getValidatorName(), valInfo.getAnnotationName());
        Files.writeString(srcMain.resolve("validation/" + valInfo.getValidatorName() + ".java"), code);
    }
}
