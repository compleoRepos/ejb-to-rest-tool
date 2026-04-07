package com.bank.tools.generator.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Configuration centralisee de Compleo v2.
 * Toutes les valeurs hardcodees sont desormais configurables via compleo-config.yml.
 * Les valeurs par defaut reproduisent le comportement de Compleo v1 (BOA).
 */
@Component
@ConfigurationProperties(prefix = "compleo")
public class CompleoConfig {

    private ClientConfig client = new ClientConfig();
    private OutputConfig output = new OutputConfig();
    private LegacyConfig legacy = new LegacyConfig();
    private JndiConfig jndi = new JndiConfig();
    private BianConfig bian = new BianConfig();
    private AclConfig acl = new AclConfig();
    private ReportConfig report = new ReportConfig();
    private ComplianceConfig compliance = new ComplianceConfig();
    private BrandingConfig branding = new BrandingConfig();

    // --- Getters / Setters ---
    public ClientConfig getClient() { return client; }
    public void setClient(ClientConfig client) { this.client = client; }
    public OutputConfig getOutput() { return output; }
    public void setOutput(OutputConfig output) { this.output = output; }
    public LegacyConfig getLegacy() { return legacy; }
    public void setLegacy(LegacyConfig legacy) { this.legacy = legacy; }
    public JndiConfig getJndi() { return jndi; }
    public void setJndi(JndiConfig jndi) { this.jndi = jndi; }
    public BianConfig getBian() { return bian; }
    public void setBian(BianConfig bian) { this.bian = bian; }
    public AclConfig getAcl() { return acl; }
    public void setAcl(AclConfig acl) { this.acl = acl; }
    public ReportConfig getReport() { return report; }
    public void setReport(ReportConfig report) { this.report = report; }
    public ComplianceConfig getCompliance() { return compliance; }
    public void setCompliance(ComplianceConfig compliance) { this.compliance = compliance; }
    public BrandingConfig getBranding() { return branding; }
    public void setBranding(BrandingConfig branding) { this.branding = branding; }

    // ========================================================================
    // SUB-CONFIGS
    // ========================================================================

    public static class ClientConfig {
        private String name = "Bank of Africa";
        private String logo = "logo-boa.png";

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getLogo() { return logo; }
        public void setLogo(String logo) { this.logo = logo; }
    }

    public static class OutputConfig {
        private String basePackage = "com.bank.api";
        private String artifactId = "generated-rest-api";
        private String groupId = "com.bank.api";
        private String javaVersion = "21";
        private String springBootVersion = "3.2.5";

        public String getBasePackage() { return basePackage; }
        public void setBasePackage(String basePackage) { this.basePackage = basePackage; }
        public String getArtifactId() { return artifactId; }
        public void setArtifactId(String artifactId) { this.artifactId = artifactId; }
        public String getGroupId() { return groupId; }
        public void setGroupId(String groupId) { this.groupId = groupId; }
        public String getJavaVersion() { return javaVersion; }
        public void setJavaVersion(String javaVersion) { this.javaVersion = javaVersion; }
        public String getSpringBootVersion() { return springBootVersion; }
        public void setSpringBootVersion(String springBootVersion) { this.springBootVersion = springBootVersion; }
    }

    public static class LegacyConfig {
        private List<String> useCaseAnnotations = new ArrayList<>(List.of("UseCase", "Stateless", "Service"));
        private List<String> baseClassNames = new ArrayList<>(List.of("BaseUseCase", "AbstractUseCase"));
        private List<String> executeMethodNames = new ArrayList<>(List.of("execute", "process", "handle"));
        private List<String> frameworkPackages = new ArrayList<>(List.of("ma.eai.", "com.framework.", "org.jboss."));
        private List<String> frameworkTypes = new ArrayList<>(List.of(
                "Envelope", "EaiLog", "SynchroneService", "BaseUseCase",
                "ValueObject", "FwkRollbackException"
        ));
        private List<String> excludedFields = new ArrayList<>(List.of(
                "codeRetour", "messageRetour", "serialVersionUID", "scoreInterne"
        ));
        private Map<String, String> fieldRenames = new LinkedHashMap<>(Map.of(
                "numCarte", "numeroCarte",
                "numLot", "numeroLot",
                "numToken", "numeroToken",
                "sasCC", "identifiantClient",
                "ribEmetteur", "compteEmetteur",
                "ribBeneficiaire", "compteBeneficiaire",
                "montantDemande", "montant"
        ));

        public List<String> getUseCaseAnnotations() { return useCaseAnnotations; }
        public void setUseCaseAnnotations(List<String> useCaseAnnotations) { this.useCaseAnnotations = useCaseAnnotations; }
        public List<String> getBaseClassNames() { return baseClassNames; }
        public void setBaseClassNames(List<String> baseClassNames) { this.baseClassNames = baseClassNames; }
        public List<String> getExecuteMethodNames() { return executeMethodNames; }
        public void setExecuteMethodNames(List<String> executeMethodNames) { this.executeMethodNames = executeMethodNames; }
        public List<String> getFrameworkPackages() { return frameworkPackages; }
        public void setFrameworkPackages(List<String> frameworkPackages) { this.frameworkPackages = frameworkPackages; }
        public List<String> getFrameworkTypes() { return frameworkTypes; }
        public void setFrameworkTypes(List<String> frameworkTypes) { this.frameworkTypes = frameworkTypes; }
        public List<String> getExcludedFields() { return excludedFields; }
        public void setExcludedFields(List<String> excludedFields) { this.excludedFields = excludedFields; }
        public Map<String, String> getFieldRenames() { return fieldRenames; }
        public void setFieldRenames(Map<String, String> fieldRenames) { this.fieldRenames = fieldRenames; }

        /** Verifie si un type est un type framework (configurable). */
        public boolean isFrameworkType(String type) {
            if (type == null) return false;
            String simple = type.contains(".") ? type.substring(type.lastIndexOf('.') + 1) : type;
            if (frameworkTypes.contains(simple)) return true;
            for (String pkg : frameworkPackages) {
                if (type.startsWith(pkg)) return true;
            }
            return type.contains("Envelope");
        }
    }

    public static class JndiConfig {
        private String prefix = "java:global/bank/";
        private String factory = "org.jboss.naming.remote.client.InitialContextFactory";
        private String providerUrl = "remote+http://serveur-ejb:8080";

        public String getPrefix() { return prefix; }
        public void setPrefix(String prefix) { this.prefix = prefix; }
        public String getFactory() { return factory; }
        public void setFactory(String factory) { this.factory = factory; }
        public String getProviderUrl() { return providerUrl; }
        public void setProviderUrl(String providerUrl) { this.providerUrl = providerUrl; }
    }

    public static class BianConfig {
        private boolean enabled = true;
        private String version = "12.0";
        private String basePath = "/api/v1";
        private boolean autoDetect = true;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getVersion() { return version; }
        public void setVersion(String version) { this.version = version; }
        public String getBasePath() { return basePath; }
        public void setBasePath(String basePath) { this.basePath = basePath; }
        public boolean isAutoDetect() { return autoDetect; }
        public void setAutoDetect(boolean autoDetect) { this.autoDetect = autoDetect; }
    }

    public static class AclConfig {
        private boolean enabled = true;
        private boolean generateMockAdapters = true;
        private boolean generateHttpAdapters = false;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public boolean isGenerateMockAdapters() { return generateMockAdapters; }
        public void setGenerateMockAdapters(boolean generateMockAdapters) { this.generateMockAdapters = generateMockAdapters; }
        public boolean isGenerateHttpAdapters() { return generateHttpAdapters; }
        public void setGenerateHttpAdapters(boolean generateHttpAdapters) { this.generateHttpAdapters = generateHttpAdapters; }
    }

    public static class ReportConfig {
        private String format = "pdf";
        private boolean includeImpactAnalysis = true;
        private boolean includeBianMapping = true;

        public String getFormat() { return format; }
        public void setFormat(String format) { this.format = format; }
        public boolean isIncludeImpactAnalysis() { return includeImpactAnalysis; }
        public void setIncludeImpactAnalysis(boolean includeImpactAnalysis) { this.includeImpactAnalysis = includeImpactAnalysis; }
        public boolean isIncludeBianMapping() { return includeBianMapping; }
        public void setIncludeBianMapping(boolean includeBianMapping) { this.includeBianMapping = includeBianMapping; }
    }

    public static class ComplianceConfig {
        private boolean auditTrail = true;
        private boolean dataMasking = true;
        private boolean securityHeaders = true;
        private List<String> sensitiveFields = new ArrayList<>(List.of(
                "numCarte", "numeroCarte", "cin", "rib", "iban",
                "telephone", "email", "motDePasse"
        ));

        public boolean isAuditTrail() { return auditTrail; }
        public void setAuditTrail(boolean auditTrail) { this.auditTrail = auditTrail; }
        public boolean isDataMasking() { return dataMasking; }
        public void setDataMasking(boolean dataMasking) { this.dataMasking = dataMasking; }
        public boolean isSecurityHeaders() { return securityHeaders; }
        public void setSecurityHeaders(boolean securityHeaders) { this.securityHeaders = securityHeaders; }
        public List<String> getSensitiveFields() { return sensitiveFields; }
        public void setSensitiveFields(List<String> sensitiveFields) { this.sensitiveFields = sensitiveFields; }
    }

    public static class BrandingConfig {
        private String productName = "Compleo";
        private String logoUrl = "/images/logo.png";
        private String primaryColor = "#1a237e";
        private String secondaryColor = "#ffffff";
        private String accentColor = "#4caf50";
        private String footerText = "\u00a9 2026 NEXA-IT \u2014 Compleo v2.0";

        public String getProductName() { return productName; }
        public void setProductName(String productName) { this.productName = productName; }
        public String getLogoUrl() { return logoUrl; }
        public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
        public String getPrimaryColor() { return primaryColor; }
        public void setPrimaryColor(String primaryColor) { this.primaryColor = primaryColor; }
        public String getSecondaryColor() { return secondaryColor; }
        public void setSecondaryColor(String secondaryColor) { this.secondaryColor = secondaryColor; }
        public String getAccentColor() { return accentColor; }
        public void setAccentColor(String accentColor) { this.accentColor = accentColor; }
        public String getFooterText() { return footerText; }
        public void setFooterText(String footerText) { this.footerText = footerText; }
    }
}
