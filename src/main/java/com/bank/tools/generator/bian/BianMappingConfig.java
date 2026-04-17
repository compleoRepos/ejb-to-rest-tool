package com.bank.tools.generator.bian;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.*;
import java.io.IOException;

/**
 * Charge et expose la configuration BIAN depuis bian-mapping.yml.
 *
 * Le generateur est autonome : il embarque son propre bian-mapping.yml
 * dans le classpath. Le mapping automatique par mots-cles couvre tous
 * les cas courants, et les explicit-mappings servent de catalogue
 * de reference pour les UseCases connus.
 *
 * Fournit :
 * - Le mapping explicite UseCase → Service Domain
 * - Le mapping automatique par mots-cles
 * - Les actions BIAN par mots-cles
 */
@Component
public class BianMappingConfig {

    private static final Logger log = LoggerFactory.getLogger(BianMappingConfig.class);

    private String bianVersion = "12.0";
    private String basePath = "/api/v1";

    private final List<KeywordDomainMapping> keywordsToDomain = new ArrayList<>();
    private final List<KeywordActionMapping> keywordsToAction = new ArrayList<>();
    private final List<ExplicitMapping> explicitMappings = new ArrayList<>();

    // ===================== CHARGEMENT YAML =====================

    @PostConstruct
    public void init() {
        loadFromClasspath("bian-mapping.yml");
    }

    @SuppressWarnings("unchecked")
    public void loadFromClasspath(String resourceName) {
        try {
            ClassPathResource resource = new ClassPathResource(resourceName);
            if (!resource.exists()) {
                log.warn("[BianConfig] Fichier {} non trouve dans le classpath — mapping BIAN desactive", resourceName);
                return;
            }

            try (InputStream is = resource.getInputStream()) {
                Yaml yaml = new Yaml();
                Map<String, Object> root = yaml.load(is);
                if (root == null || !root.containsKey("bian")) {
                    log.warn("[BianConfig] Fichier {} invalide — cle 'bian' manquante", resourceName);
                    return;
                }

                Map<String, Object> bian = (Map<String, Object>) root.get("bian");

                // Version et base path
                if (bian.containsKey("version")) bianVersion = bian.get("version").toString();
                if (bian.containsKey("base-path")) basePath = bian.get("base-path").toString();

                // Auto-mapping
                if (bian.containsKey("auto-mapping")) {
                    Map<String, Object> autoMapping = (Map<String, Object>) bian.get("auto-mapping");
                    parseKeywordsToDomain(autoMapping);
                    parseKeywordsToAction(autoMapping);
                }

                // Explicit mapping
                if (bian.containsKey("explicit-mapping")) {
                    List<Map<String, Object>> explicits = (List<Map<String, Object>>) bian.get("explicit-mapping");
                    parseExplicitMappings(explicits);
                }

                log.info("[BianConfig] Configuration BIAN v{} chargee : {} domaines, {} actions, {} mappings explicites",
                        bianVersion, keywordsToDomain.size(), keywordsToAction.size(), explicitMappings.size());
            }
        } catch (IOException | RuntimeException e) {
            log.error("[BianConfig] Erreur chargement {} : {}", resourceName, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void parseKeywordsToDomain(Map<String, Object> autoMapping) {
        if (!autoMapping.containsKey("keywords-to-domain")) return;
        List<Map<String, Object>> entries = (List<Map<String, Object>>) autoMapping.get("keywords-to-domain");
        for (Map<String, Object> entry : entries) {
            KeywordDomainMapping kdm = new KeywordDomainMapping();
            kdm.keywords = (List<String>) entry.get("keywords");
            kdm.serviceDomain = (String) entry.get("service-domain");
            kdm.bianId = (String) entry.getOrDefault("bian-id", "");
            kdm.behaviorQualifier = (String) entry.getOrDefault("behavior-qualifier", null);
            keywordsToDomain.add(kdm);
        }
    }

    /**
     * Parse les keywords-to-action avec le tableau BIAN definitif :
     *
     * | Action       | HTTP | {cr-reference-id} | Code |
     * |-------------|------|-------------------|------|
     * | initiation   | POST | NON               | 201  |
     * | evaluation   | POST | NON               | 200  |
     * | notification | POST | NON               | 201  |
     * | retrieval    | POST | OUI               | 200  |
     * | execution    | POST | OUI               | 200  |
     * | control      | PUT  | OUI               | 200  |
     * | update       | PUT  | OUI               | 200  |
     * | termination  | PUT  | OUI               | 200  |
     */
    @SuppressWarnings("unchecked")
    private void parseKeywordsToAction(Map<String, Object> autoMapping) {
        if (!autoMapping.containsKey("keywords-to-action")) return;
        List<Map<String, Object>> entries = (List<Map<String, Object>>) autoMapping.get("keywords-to-action");
        for (Map<String, Object> entry : entries) {
            KeywordActionMapping kam = new KeywordActionMapping();
            kam.keywords = (List<String>) entry.get("keywords");
            kam.action = (String) entry.get("action");
            // Deduire le httpMethod de l'action BIAN
            String defaultMethod = deriveDefaultHttpMethod(kam.action);
            kam.httpMethod = (String) entry.getOrDefault("http-method", defaultMethod);
            // Deduire le httpStatus de l'action BIAN
            int defaultStatus = deriveDefaultHttpStatus(kam.action);
            kam.httpStatus = entry.containsKey("http-status") ? ((Number) entry.get("http-status")).intValue() : defaultStatus;
            keywordsToAction.add(kam);
        }
    }

    @SuppressWarnings("unchecked")
    private void parseExplicitMappings(List<Map<String, Object>> explicits) {
        for (Map<String, Object> entry : explicits) {
            ExplicitMapping em = new ExplicitMapping();
            em.useCase = (String) entry.get("use-case");
            em.serviceDomain = (String) entry.get("service-domain");
            em.bianId = (String) entry.getOrDefault("bian-id", "");
            em.behaviorQualifier = (String) entry.getOrDefault("behavior-qualifier", null);
            em.action = (String) entry.get("action");
            em.url = (String) entry.getOrDefault("url", null);
            // Deduire le httpMethod de l'action BIAN si non specifie
            String defaultMethod = deriveDefaultHttpMethod(em.action);
            em.httpMethod = (String) entry.getOrDefault("http-method", defaultMethod);
            // Deduire le httpStatus de l'action BIAN
            int defaultStatus = deriveDefaultHttpStatus(em.action);
            em.httpStatus = entry.containsKey("http-status") ? ((Number) entry.get("http-status")).intValue() : defaultStatus;
            em.summary = (String) entry.getOrDefault("summary", "");
            explicitMappings.add(em);
        }
    }

    // ===================== DEFAULTS BIAN =====================

    /**
     * Tableau BIAN definitif des methodes HTTP par action.
     * retrieval = POST (car les UseCases prennent un VoIn → body requis)
     */
    private String deriveDefaultHttpMethod(String action) {
        if (action == null) return "POST";
        return switch (action) {
            case "control", "update", "termination" -> "PUT";
            default -> "POST"; // initiation, evaluation, notification, retrieval, execution, request, exchange, grant
        };
    }

    /**
     * Tableau BIAN definitif des codes HTTP par action.
     * initiation = 201, notification = 201, tout le reste = 200
     */
    private int deriveDefaultHttpStatus(String action) {
        if (action == null) return 200;
        return switch (action) {
            case "initiation", "notification" -> 201;
            default -> 200; // evaluation, retrieval, execution, control, update, termination
        };
    }

    // ===================== ACCESSEURS =====================

    public String getBianVersion() { return bianVersion; }
    public String getBasePath() { return basePath; }
    public List<KeywordDomainMapping> getKeywordsToDomain() { return keywordsToDomain; }
    public List<KeywordActionMapping> getKeywordsToAction() { return keywordsToAction; }
    public List<ExplicitMapping> getExplicitMappings() { return explicitMappings; }

    public boolean isLoaded() {
        return !keywordsToDomain.isEmpty() || !explicitMappings.isEmpty();
    }

    // ===================== INNER CLASSES =====================

    public static class KeywordDomainMapping {
        public List<String> keywords;
        public String serviceDomain;
        public String bianId;
        public String behaviorQualifier;
    }

    public static class KeywordActionMapping {
        public List<String> keywords;
        public String action;
        public String httpMethod;
        public int httpStatus;
    }

    public static class ExplicitMapping {
        public String useCase;
        public String serviceDomain;
        public String bianId;
        public String behaviorQualifier;
        public String action;
        public String url;
        public String httpMethod;
        public int httpStatus;
        public String summary;
    }
}
