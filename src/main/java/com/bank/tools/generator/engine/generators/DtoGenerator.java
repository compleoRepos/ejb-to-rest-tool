package com.bank.tools.generator.engine.generators;

import com.bank.tools.generator.engine.util.CodeGenUtils;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import static com.bank.tools.generator.engine.constants.GeneratorConstants.*;

/**
 * Genere les classes DTO (VoIn, VoOut, DTO generiques) et les interfaces @Remote.
 * Extrait de CodeGenerationEngine pour respecter SRP.
 *
 * Regles appliquees :
 * - G1 : Imports complets et corrects
 * - G2 : Deduplication des annotations via Set
 * - G3 : Migration javax → jakarta
 * - BUG 10/11 : Validation annotations (@NotBlank, @NotNull, @Size)
 * - BUG H : Annotations custom (@ValidIBAN, @ValidRIB)
 * - BUG M : @XmlTransient preserve
 */
@Component
public class DtoGenerator {

    private static final Logger log = LoggerFactory.getLogger(DtoGenerator.class);
    private static final String DEFAULT_BASE_PACKAGE = "com.bank.api";

    /**
     * Genere tous les DTOs du projet.
     */
    public void generateAll(Path srcMain, ProjectAnalysisResult analysisResult) throws IOException {
        for (DtoInfo dto : analysisResult.getDtos()) {
            generateDtoClass(srcMain, dto);
        }
        for (var ifaceInfo : analysisResult.getDetectedRemoteInterfaces()) {
            generateRemoteInterface(srcMain, ifaceInfo);
        }
    }

    /**
     * Genere un fichier DTO Java complet avec JAXB, validation et Serializable.
     */
    public void generateDtoClass(Path srcMain, DtoInfo dto) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(DEFAULT_BASE_PACKAGE).append(".dto;\n\n");

        Set<String> imports = new TreeSet<>();

        boolean isVoIn = dto.getClassName().endsWith("VoIn") || dto.getClassName().endsWith("VOIn")
                || dto.getClassName().endsWith("Input") || dto.getClassName().endsWith("Request");
        boolean isVoOut = dto.getClassName().endsWith("VoOut") || dto.getClassName().endsWith("VOOut")
                || dto.getClassName().endsWith("Output") || dto.getClassName().endsWith("Response");
        boolean isDto = isVoIn || isVoOut || dto.getClassName().endsWith("Dto") || dto.getClassName().endsWith("DTO");

        if (isVoIn || isVoOut || isDto) {
            imports.add("java.io.Serializable");
        }

        boolean hasJaxb = dto.hasJaxbAnnotations();
        if (hasJaxb) {
            if (dto.isHasXmlRootElement()) imports.add("jakarta.xml.bind.annotation.XmlRootElement");
            imports.add("jakarta.xml.bind.annotation.XmlAccessorType");
            imports.add("jakarta.xml.bind.annotation.XmlAccessType");
            if (dto.isHasXmlType()) imports.add("jakarta.xml.bind.annotation.XmlType");
            boolean hasXmlElement = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isHasXmlElement);
            if (hasXmlElement) imports.add("jakarta.xml.bind.annotation.XmlElement");
            boolean hasXmlAttribute = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isHasXmlAttribute);
            if (hasXmlAttribute) imports.add("jakarta.xml.bind.annotation.XmlAttribute");
            boolean hasXmlElementWrapper = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isHasXmlElementWrapper);
            if (hasXmlElementWrapper) imports.add("jakarta.xml.bind.annotation.XmlElementWrapper");
            boolean hasXmlTransient = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isHasXmlTransient);
            if (hasXmlTransient) imports.add("jakarta.xml.bind.annotation.XmlTransient");
        }
        if (dto.isHasXmlRootElement() || hasJaxb) {
            imports.add("com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlRootElement");
        }

        Set<String> annotationsUsed = new LinkedHashSet<>();
        for (DtoInfo.FieldInfo field : dto.getFields()) {
            if (field.isStatic() && field.isFinal()) continue;
            if (field.getName().equals("serialVersionUID")) continue;
            if (CodeGenUtils.isLoggerField(field)) continue;

            CodeGenUtils.resolveTypeImports(field.getType(), imports);

            if (field.isRequired()) {
                String baseType = CodeGenUtils.extractBaseType(field.getType());
                if (baseType.equals("String")) {
                    annotationsUsed.add("NotBlank");
                    imports.add("jakarta.validation.constraints.NotBlank");
                } else if (baseType.equals("List") || baseType.equals("Set") || baseType.equals("Collection")) {
                    annotationsUsed.add("NotNull");
                    annotationsUsed.add("Size");
                    imports.add("jakarta.validation.constraints.NotNull");
                    imports.add("jakarta.validation.constraints.Size");
                } else if (!PRIMITIVE_TYPES.contains(baseType)) {
                    annotationsUsed.add("NotNull");
                    imports.add("jakarta.validation.constraints.NotNull");
                }
            }
        }

        for (DtoInfo.FieldInfo field : dto.getFields()) {
            for (String customAnnot : field.getCustomAnnotations()) {
                imports.add(DEFAULT_BASE_PACKAGE + ".validation." + customAnnot);
            }
        }

        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }

        sb.append("\n/**\n * DTO genere pour ").append(dto.getClassName()).append(".\n */\n");

        if (dto.isHasXmlRootElement()) {
            String rootName = dto.getXmlRootElementName() != null ? dto.getXmlRootElementName()
                    : Character.toLowerCase(dto.getClassName().charAt(0)) + dto.getClassName().substring(1);
            sb.append("@XmlRootElement(name = \"").append(rootName).append("\")\n");
            sb.append("@JacksonXmlRootElement(localName = \"").append(rootName).append("\")\n");
        } else if (hasJaxb) {
            String rootName = Character.toLowerCase(dto.getClassName().charAt(0)) + dto.getClassName().substring(1);
            sb.append("@XmlRootElement(name = \"").append(rootName).append("\")\n");
            sb.append("@JacksonXmlRootElement(localName = \"").append(rootName).append("\")\n");
        }

        if (dto.isHasXmlAccessorType()) {
            sb.append("@XmlAccessorType(").append(dto.getXmlAccessorTypeValue() != null ? dto.getXmlAccessorTypeValue() : "XmlAccessType.FIELD").append(")\n");
        } else if (hasJaxb) {
            sb.append("@XmlAccessorType(XmlAccessType.FIELD)\n");
        }

        if (dto.isHasXmlType()) {
            sb.append("@XmlType\n");
        }

        sb.append("public class ").append(dto.getClassName());

        String parentClass = dto.getParentClassName();
        boolean isEjbFrameworkParent = parentClass == null
                || parentClass.equals("Object") || parentClass.equals("ValueObject")
                || parentClass.equals("UCStrategie") || parentClass.equals("BaseUseCase")
                || parentClass.equals("AbstractUseCase") || parentClass.equals("SynchroneService")
                || parentClass.equals("AsynchroneService") || parentClass.equals("Envelope")
                || parentClass.equals("EaiLog") || parentClass.equals("CommonFunction");
        if (!isEjbFrameworkParent) {
            sb.append(" extends ").append(parentClass);
        }

        if (isVoIn || isVoOut || isDto) {
            sb.append(" implements Serializable");
        }
        sb.append(" {\n\n");

        if (isVoIn || isVoOut || isDto) {
            sb.append("    private static final long serialVersionUID = 1L;\n\n");
        }

        List<DtoInfo.FieldInfo> instanceFields = new ArrayList<>();
        List<DtoInfo.FieldInfo> constantFields = new ArrayList<>();

        for (DtoInfo.FieldInfo field : dto.getFields()) {
            if (field.getName().equals("serialVersionUID")) continue;
            if (CodeGenUtils.isLoggerField(field)) continue;
            if (field.isStatic() && field.isFinal()) {
                constantFields.add(field);
            } else {
                instanceFields.add(field);
            }
        }

        for (DtoInfo.FieldInfo field : constantFields) {
            sb.append("    private static final ").append(field.getType()).append(" ").append(field.getName()).append(";\n");
        }
        if (!constantFields.isEmpty()) sb.append("\n");

        for (DtoInfo.FieldInfo field : instanceFields) {
            Set<String> fieldAnnotations = new LinkedHashSet<>();

            if (field.isHasXmlElementWrapper()) {
                String wrapperAnnot = field.getXmlElementWrapperName() != null
                        ? "@XmlElementWrapper(name = \"" + field.getXmlElementWrapperName() + "\")"
                        : "@XmlElementWrapper";
                fieldAnnotations.add(wrapperAnnot);
            }
            if (field.isHasXmlElement()) {
                StringBuilder xmlEl = new StringBuilder("@XmlElement");
                List<String> attrs = new ArrayList<>();
                if (field.getXmlName() != null) attrs.add("name = \"" + field.getXmlName() + "\"");
                if (field.isRequired()) attrs.add("required = true");
                if (!attrs.isEmpty()) xmlEl.append("(").append(String.join(", ", attrs)).append(")");
                fieldAnnotations.add(xmlEl.toString());
            }
            if (field.isHasXmlAttribute()) {
                String attrAnnot = field.getXmlName() != null
                        ? "@XmlAttribute(name = \"" + field.getXmlName() + "\")"
                        : "@XmlAttribute";
                fieldAnnotations.add(attrAnnot);
            }
            if (field.isHasXmlTransient()) {
                fieldAnnotations.add("@XmlTransient");
            }

            if (field.isRequired()) {
                String baseType = CodeGenUtils.extractBaseType(field.getType());
                if (baseType.equals("String")) {
                    fieldAnnotations.add("@NotBlank");
                } else if (baseType.equals("List") || baseType.equals("Set") || baseType.equals("Collection")) {
                    fieldAnnotations.add("@NotNull");
                    fieldAnnotations.add("@Size(min = 1)");
                } else if (!PRIMITIVE_TYPES.contains(baseType)) {
                    fieldAnnotations.add("@NotNull");
                }
            }

            for (String customAnnot : field.getCustomAnnotations()) {
                fieldAnnotations.add("@" + customAnnot);
            }

            for (String annot : fieldAnnotations) {
                sb.append("    ").append(annot).append("\n");
            }
            sb.append("    private ").append(field.getType()).append(" ").append(field.getName()).append(";\n");
        }

        sb.append("\n");
        sb.append("    public ").append(dto.getClassName()).append("() {\n    }\n\n");

        for (DtoInfo.FieldInfo field : instanceFields) {
            String cap = Character.toUpperCase(field.getName().charAt(0)) + field.getName().substring(1);
            String prefix = field.getType().equals("boolean") ? "is" : "get";
            sb.append("    public ").append(field.getType()).append(" ").append(prefix).append(cap).append("() {\n");
            sb.append("        return ").append(field.getName()).append(";\n    }\n\n");
            sb.append("    public void set").append(cap).append("(").append(field.getType()).append(" ").append(field.getName()).append(") {\n");
            sb.append("        this.").append(field.getName()).append(" = ").append(field.getName()).append(";\n    }\n\n");
        }

        sb.append("    @Override\n    public String toString() {\n");
        sb.append("        return \"").append(dto.getClassName()).append("{");
        for (int i = 0; i < instanceFields.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(instanceFields.get(i).getName()).append("='\" + ").append(instanceFields.get(i).getName()).append(" + \"'");
        }
        sb.append("}\";\n    }\n}\n");

        Files.writeString(srcMain.resolve("dto/" + dto.getClassName() + ".java"), sb.toString());
        log.info("DTO genere : {} (JAXB: {}, Serializable: {})", dto.getClassName(), hasJaxb, isVoIn || isVoOut || isDto);
    }

    /**
     * Genere une interface @Remote migrée (sans annotations EJB, avec migration javax → jakarta).
     */
    public void generateRemoteInterface(Path srcMain, ProjectAnalysisResult.RemoteInterfaceInfo ifaceInfo) throws IOException {
        String sourceCode = ifaceInfo.getSourceCode();
        if (sourceCode == null || sourceCode.isEmpty()) {
            log.warn("Source code absent pour l'interface @Remote : {}", ifaceInfo.getName());
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(DEFAULT_BASE_PACKAGE).append(".ejb.interfaces;\n\n");

        Set<String> imports = new TreeSet<>();
        StringBuilder interfaceBody = new StringBuilder();

        for (String line : sourceCode.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("package ")) continue;
            if (trimmed.startsWith("import ")) continue;
            if (trimmed.equals("@Remote") || trimmed.equals("@Local")) continue;
            if (trimmed.startsWith("@Remote(") || trimmed.startsWith("@Local(")) continue;
            interfaceBody.append(line).append("\n");
        }

        imports.add("java.util.List");
        imports.add("java.math.BigDecimal");

        for (String imp : imports) {
            sb.append("import ").append(imp).append(";\n");
        }
        sb.append("\n").append(interfaceBody);

        Files.writeString(srcMain.resolve("ejb/interfaces/" + ifaceInfo.getName() + ".java"), sb.toString());
        log.info("Interface @Remote generee : {}", ifaceInfo.getName());
    }
}
