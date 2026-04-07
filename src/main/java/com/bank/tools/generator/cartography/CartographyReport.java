package com.bank.tools.generator.cartography;

import java.util.*;

/**
 * Rapport de cartographie du patrimoine applicatif legacy.
 * Contient les statistiques, les dependances, la complexite et les recommandations.
 */
public class CartographyReport {

    // ==================== STATS ====================
    private int totalClasses;
    private int totalLinesOfCode;
    private int totalServices;
    private int totalDtos;
    private int totalEntities;
    private int totalMdbs;
    private int totalInterfaces;
    private int totalEnums;

    // ==================== FRAMEWORK USAGE ====================
    /** Package/annotation → nombre d'occurrences */
    private Map<String, Integer> frameworkUsage = new LinkedHashMap<>();

    // ==================== COMPLEXITE ====================
    /** Service → complexite (LOW, MEDIUM, HIGH, CRITICAL) */
    private Map<String, ServiceComplexity> serviceComplexities = new LinkedHashMap<>();

    // ==================== DEPENDANCES ====================
    /** Service → Set de services dont il depend */
    private Map<String, Set<String>> dependencies = new LinkedHashMap<>();

    /** Cycles de dependances detectes */
    private List<List<String>> circularDependencies = new ArrayList<>();

    // ==================== PROBLEMES ====================
    /** God classes (>500 lignes) */
    private List<GodClassInfo> godClasses = new ArrayList<>();

    /** APIs deprecees detectees */
    private List<String> deprecatedApis = new ArrayList<>();

    // ==================== RECOMMANDATIONS ====================
    private MigrationStrategy suggestedStrategy = MigrationStrategy.STRANGLER_FIG;
    private List<String> recommendations = new ArrayList<>();

    // ==================== ENUMS ====================

    public enum Complexity {
        LOW, MEDIUM, HIGH, CRITICAL
    }

    public enum MigrationStrategy {
        BIG_BANG("Migration en une seule fois — risque eleve, delai court"),
        STRANGLER_FIG("Migration progressive — risque faible, delai moyen"),
        PARALLEL_RUN("Execution parallele — risque minimal, delai long");

        private final String description;
        MigrationStrategy(String description) { this.description = description; }
        public String getDescription() { return description; }
    }

    public static class ServiceComplexity {
        private String serviceName;
        private int methodCount;
        private int dependencyCount;
        private int transactionalCount;
        private int dtoCount;
        private int exceptionCount;
        private int linesOfCode;
        private int score;
        private Complexity complexity;

        public ServiceComplexity() {}

        public ServiceComplexity(String serviceName) {
            this.serviceName = serviceName;
        }

        public void calculateScore() {
            this.score = methodCount * 2 + dependencyCount * 3 + transactionalCount * 5 + dtoCount + exceptionCount * 2;
            if (score <= 10) complexity = Complexity.LOW;
            else if (score <= 25) complexity = Complexity.MEDIUM;
            else if (score <= 50) complexity = Complexity.HIGH;
            else complexity = Complexity.CRITICAL;
        }

        // Getters/Setters
        public String getServiceName() { return serviceName; }
        public void setServiceName(String serviceName) { this.serviceName = serviceName; }
        public int getMethodCount() { return methodCount; }
        public void setMethodCount(int methodCount) { this.methodCount = methodCount; }
        public int getDependencyCount() { return dependencyCount; }
        public void setDependencyCount(int dependencyCount) { this.dependencyCount = dependencyCount; }
        public int getTransactionalCount() { return transactionalCount; }
        public void setTransactionalCount(int transactionalCount) { this.transactionalCount = transactionalCount; }
        public int getDtoCount() { return dtoCount; }
        public void setDtoCount(int dtoCount) { this.dtoCount = dtoCount; }
        public int getExceptionCount() { return exceptionCount; }
        public void setExceptionCount(int exceptionCount) { this.exceptionCount = exceptionCount; }
        public int getLinesOfCode() { return linesOfCode; }
        public void setLinesOfCode(int linesOfCode) { this.linesOfCode = linesOfCode; }
        public int getScore() { return score; }
        public Complexity getComplexity() { return complexity; }
    }

    public static class GodClassInfo {
        private String className;
        private int lineCount;
        private int methodCount;

        public GodClassInfo(String className, int lineCount, int methodCount) {
            this.className = className;
            this.lineCount = lineCount;
            this.methodCount = methodCount;
        }

        public String getClassName() { return className; }
        public int getLineCount() { return lineCount; }
        public int getMethodCount() { return methodCount; }
    }

    // ==================== GETTERS / SETTERS ====================
    public int getTotalClasses() { return totalClasses; }
    public void setTotalClasses(int totalClasses) { this.totalClasses = totalClasses; }
    public int getTotalLinesOfCode() { return totalLinesOfCode; }
    public void setTotalLinesOfCode(int totalLinesOfCode) { this.totalLinesOfCode = totalLinesOfCode; }
    public int getTotalServices() { return totalServices; }
    public void setTotalServices(int totalServices) { this.totalServices = totalServices; }
    public int getTotalDtos() { return totalDtos; }
    public void setTotalDtos(int totalDtos) { this.totalDtos = totalDtos; }
    public int getTotalEntities() { return totalEntities; }
    public void setTotalEntities(int totalEntities) { this.totalEntities = totalEntities; }
    public int getTotalMdbs() { return totalMdbs; }
    public void setTotalMdbs(int totalMdbs) { this.totalMdbs = totalMdbs; }
    public int getTotalInterfaces() { return totalInterfaces; }
    public void setTotalInterfaces(int totalInterfaces) { this.totalInterfaces = totalInterfaces; }
    public int getTotalEnums() { return totalEnums; }
    public void setTotalEnums(int totalEnums) { this.totalEnums = totalEnums; }
    public Map<String, Integer> getFrameworkUsage() { return frameworkUsage; }
    public void setFrameworkUsage(Map<String, Integer> frameworkUsage) { this.frameworkUsage = frameworkUsage; }
    public Map<String, ServiceComplexity> getServiceComplexities() { return serviceComplexities; }
    public void setServiceComplexities(Map<String, ServiceComplexity> serviceComplexities) { this.serviceComplexities = serviceComplexities; }
    public Map<String, Set<String>> getDependencies() { return dependencies; }
    public void setDependencies(Map<String, Set<String>> dependencies) { this.dependencies = dependencies; }
    public List<List<String>> getCircularDependencies() { return circularDependencies; }
    public void setCircularDependencies(List<List<String>> circularDependencies) { this.circularDependencies = circularDependencies; }
    public List<GodClassInfo> getGodClasses() { return godClasses; }
    public void setGodClasses(List<GodClassInfo> godClasses) { this.godClasses = godClasses; }
    public List<String> getDeprecatedApis() { return deprecatedApis; }
    public void setDeprecatedApis(List<String> deprecatedApis) { this.deprecatedApis = deprecatedApis; }
    public MigrationStrategy getSuggestedStrategy() { return suggestedStrategy; }
    public void setSuggestedStrategy(MigrationStrategy suggestedStrategy) { this.suggestedStrategy = suggestedStrategy; }
    public List<String> getRecommendations() { return recommendations; }
    public void setRecommendations(List<String> recommendations) { this.recommendations = recommendations; }
}
