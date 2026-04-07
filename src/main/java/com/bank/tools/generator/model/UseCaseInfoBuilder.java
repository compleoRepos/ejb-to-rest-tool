package com.bank.tools.generator.model;

import java.util.List;

/**
 * Builder fluent pour la construction d'instances {@link UseCaseInfo}.
 * Remplace les instanciations directes avec setter chains.
 *
 * <pre>
 * UseCaseInfo info = UseCaseInfoBuilder.builder()
 *     .className("SimulerCredit")
 *     .packageName("com.bank.ejb")
 *     .ejbType(EjbType.STATELESS)
 *     .ejbPattern(EjbPattern.BASE_USE_CASE)
 *     .build();
 * </pre>
 */
public final class UseCaseInfoBuilder {

    private final UseCaseInfo info = new UseCaseInfo();

    private UseCaseInfoBuilder() {}

    public static UseCaseInfoBuilder builder() {
        return new UseCaseInfoBuilder();
    }

    public UseCaseInfoBuilder className(String className) {
        info.setClassName(className);
        return this;
    }

    public UseCaseInfoBuilder packageName(String packageName) {
        info.setPackageName(packageName);
        return this;
    }

    public UseCaseInfoBuilder fullyQualifiedName(String fqn) {
        info.setFullyQualifiedName(fqn);
        return this;
    }

    public UseCaseInfoBuilder inputDtoClassName(String inputDto) {
        info.setInputDtoClassName(inputDto);
        return this;
    }

    public UseCaseInfoBuilder outputDtoClassName(String outputDto) {
        info.setOutputDtoClassName(outputDto);
        return this;
    }

    public UseCaseInfoBuilder inputDtoPackage(String pkg) {
        info.setInputDtoPackage(pkg);
        return this;
    }

    public UseCaseInfoBuilder outputDtoPackage(String pkg) {
        info.setOutputDtoPackage(pkg);
        return this;
    }

    public UseCaseInfoBuilder implementedInterface(String iface) {
        info.setImplementedInterface(iface);
        return this;
    }

    public UseCaseInfoBuilder restEndpoint(String endpoint) {
        info.setRestEndpoint(endpoint);
        return this;
    }

    public UseCaseInfoBuilder controllerName(String name) {
        info.setControllerName(name);
        return this;
    }

    public UseCaseInfoBuilder serviceAdapterName(String name) {
        info.setServiceAdapterName(name);
        return this;
    }

    public UseCaseInfoBuilder jndiName(String jndi) {
        info.setJndiName(jndi);
        return this;
    }

    public UseCaseInfoBuilder stateless(boolean stateless) {
        info.setStateless(stateless);
        return this;
    }

    public UseCaseInfoBuilder hasExecuteMethod(boolean has) {
        info.setHasExecuteMethod(has);
        return this;
    }

    public UseCaseInfoBuilder inputDtoHasJaxb(boolean has) {
        info.setInputDtoHasJaxb(has);
        return this;
    }

    public UseCaseInfoBuilder outputDtoHasJaxb(boolean has) {
        info.setOutputDtoHasJaxb(has);
        return this;
    }

    public UseCaseInfoBuilder ejbType(UseCaseInfo.EjbType type) {
        info.setEjbType(type);
        return this;
    }

    public UseCaseInfoBuilder ejbPattern(UseCaseInfo.EjbPattern pattern) {
        info.setEjbPattern(pattern);
        return this;
    }

    public UseCaseInfoBuilder httpMethod(String method) {
        info.setHttpMethod(method);
        return this;
    }

    public UseCaseInfoBuilder httpStatusCode(int code) {
        info.setHttpStatusCode(code);
        return this;
    }

    public UseCaseInfoBuilder javadoc(String javadoc) {
        info.setJavadoc(javadoc);
        return this;
    }

    public UseCaseInfoBuilder swaggerSummary(String summary) {
        info.setSwaggerSummary(summary);
        return this;
    }

    public UseCaseInfoBuilder parentEntityName(String name) {
        info.setParentEntityName(name);
        return this;
    }

    public UseCaseInfoBuilder remoteInterfaceName(String name) {
        info.setRemoteInterfaceName(name);
        return this;
    }

    public UseCaseInfoBuilder publicMethods(List<UseCaseInfo.MethodInfo> methods) {
        info.setPublicMethods(methods);
        return this;
    }

    public UseCaseInfoBuilder implementedInterfaces(List<String> interfaces) {
        info.setImplementedInterfaces(interfaces);
        return this;
    }

    public UseCaseInfoBuilder sourceAnnotations(List<String> annotations) {
        info.setSourceAnnotations(annotations);
        return this;
    }

    public UseCaseInfoBuilder rolesAllowed(List<String> roles) {
        info.setRolesAllowed(roles);
        return this;
    }

    /**
     * Construit et retourne l'instance UseCaseInfo configuree.
     */
    public UseCaseInfo build() {
        return info;
    }
}
