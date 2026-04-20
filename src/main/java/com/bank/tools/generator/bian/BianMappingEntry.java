package com.bank.tools.generator.bian;

/**
 * Represente une ligne du tableau de mapping BIAN dans le dashboard.
 * Chaque entry correspond a un UseCase et son mapping vers un Service Domain BIAN.
 */
public class BianMappingEntry {

    private String useCaseName;
    private String ejbClassName;
    private String packageName;
    private String inputDto;
    private String outputDto;

    // BIAN mapping fields (editable by user)
    private String serviceDomain;
    private String serviceDomainTitle;
    private String bianId;
    private String behaviorQualifier;
    private String action;
    private String httpMethod;
    private String generatedUrl;
    private String controllerName;
    private String summary;

    // Exclusion flag (user can exclude a UseCase from generation)
    private boolean excluded;

    // Auto-detection metadata
    private boolean autoDetected;
    private double confidence;

    public BianMappingEntry() {}

    /**
     * Construit une entry a partir d'un BianMapping existant.
     */
    public static BianMappingEntry fromBianMapping(BianMapping mapping) {
        BianMappingEntry entry = new BianMappingEntry();
        entry.setUseCaseName(mapping.getUseCaseName());
        entry.setServiceDomain(mapping.getServiceDomain());
        entry.setServiceDomainTitle(mapping.getServiceDomainTitle());
        entry.setBianId(mapping.getBianId());
        entry.setBehaviorQualifier(mapping.getBehaviorQualifier());
        entry.setAction(mapping.getAction());
        entry.setHttpMethod(mapping.getHttpMethod());
        entry.setGeneratedUrl(mapping.getUrl());
        entry.setControllerName(mapping.getControllerName());
        entry.setSummary(mapping.getSummary());
        entry.setAutoDetected(!mapping.isExplicit());
        return entry;
    }

    /**
     * Convertit cette entry en BianMapping pour le pipeline de generation.
     */
    public BianMapping toBianMapping() {
        BianMapping mapping = new BianMapping(serviceDomain, action, behaviorQualifier);
        mapping.setUseCaseName(useCaseName);
        mapping.setBianId(bianId);
        mapping.setHttpMethod(httpMethod);
        mapping.setUrl(generatedUrl);
        mapping.setControllerName(controllerName);
        mapping.setSummary(summary);
        mapping.setExplicit(true); // User-validated mapping
        return mapping;
    }

    // ===================== GETTERS / SETTERS =====================

    public String getUseCaseName() { return useCaseName; }
    public void setUseCaseName(String useCaseName) { this.useCaseName = useCaseName; }

    public String getEjbClassName() { return ejbClassName; }
    public void setEjbClassName(String ejbClassName) { this.ejbClassName = ejbClassName; }

    public String getPackageName() { return packageName; }
    public void setPackageName(String packageName) { this.packageName = packageName; }

    public String getInputDto() { return inputDto; }
    public void setInputDto(String inputDto) { this.inputDto = inputDto; }

    public String getOutputDto() { return outputDto; }
    public void setOutputDto(String outputDto) { this.outputDto = outputDto; }

    public String getServiceDomain() { return serviceDomain; }
    public void setServiceDomain(String serviceDomain) {
        this.serviceDomain = serviceDomain;
        if (serviceDomain != null && !serviceDomain.isEmpty()) {
            this.serviceDomainTitle = toTitleCase(serviceDomain);
        }
    }

    public String getServiceDomainTitle() { return serviceDomainTitle; }
    public void setServiceDomainTitle(String serviceDomainTitle) { this.serviceDomainTitle = serviceDomainTitle; }

    public String getBianId() { return bianId; }
    public void setBianId(String bianId) { this.bianId = bianId; }

    public String getBehaviorQualifier() { return behaviorQualifier; }
    public void setBehaviorQualifier(String behaviorQualifier) { this.behaviorQualifier = behaviorQualifier; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public String getGeneratedUrl() { return generatedUrl; }
    public void setGeneratedUrl(String generatedUrl) { this.generatedUrl = generatedUrl; }

    public String getControllerName() { return controllerName; }
    public void setControllerName(String controllerName) { this.controllerName = controllerName; }

    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }

    public boolean isAutoDetected() { return autoDetected; }
    public void setAutoDetected(boolean autoDetected) { this.autoDetected = autoDetected; }

    public boolean isExcluded() { return excluded; }
    public void setExcluded(boolean excluded) { this.excluded = excluded; }

    public double getConfidence() { return confidence; }
    public void setConfidence(double confidence) { this.confidence = confidence; }

    private String toTitleCase(String kebab) {
        if (kebab == null || kebab.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (String part : kebab.split("-")) {
            if (!part.isEmpty()) {
                if (sb.length() > 0) sb.append(" ");
                sb.append(Character.toUpperCase(part.charAt(0)));
                if (part.length() > 1) sb.append(part.substring(1));
            }
        }
        return sb.toString();
    }
}
