package com.bank.tools.generator.model;

import java.util.List;

/**
 * Builder fluent pour la construction d'instances {@link DtoInfo}.
 * Remplace les instanciations directes avec setter chains.
 *
 * <pre>
 * DtoInfo dto = DtoInfoBuilder.builder()
 *     .className("SimulerCreditVoIn")
 *     .packageName("com.bank.ejb")
 *     .hasXmlRootElement(true)
 *     .build();
 * </pre>
 */
public final class DtoInfoBuilder {

    private final DtoInfo dto = new DtoInfo();

    private DtoInfoBuilder() {}

    public static DtoInfoBuilder builder() {
        return new DtoInfoBuilder();
    }

    public DtoInfoBuilder className(String className) {
        dto.setClassName(className);
        return this;
    }

    public DtoInfoBuilder packageName(String packageName) {
        dto.setPackageName(packageName);
        return this;
    }

    public DtoInfoBuilder fullyQualifiedName(String fqn) {
        dto.setFullyQualifiedName(fqn);
        return this;
    }

    public DtoInfoBuilder hasXmlRootElement(boolean has) {
        dto.setHasXmlRootElement(has);
        return this;
    }

    public DtoInfoBuilder hasXmlType(boolean has) {
        dto.setHasXmlType(has);
        return this;
    }

    public DtoInfoBuilder hasXmlAccessorType(boolean has) {
        dto.setHasXmlAccessorType(has);
        return this;
    }

    public DtoInfoBuilder fields(List<DtoInfo.FieldInfo> fields) {
        dto.setFields(fields);
        return this;
    }

    public DtoInfoBuilder parentClassName(String parent) {
        dto.setParentClassName(parent);
        return this;
    }

    public DtoInfoBuilder sourceCode(String source) {
        dto.setSourceCode(source);
        return this;
    }

    /**
     * Construit et retourne l'instance DtoInfo configuree.
     */
    public DtoInfo build() {
        return dto;
    }
}
