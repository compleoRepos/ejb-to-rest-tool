package com.bank.tools.generator.annotation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.*;
import java.util.stream.Collectors;
import java.io.IOException;

/**
 * Registre des annotations custom bancaires.
 * Charge la configuration depuis custom-annotations.yml au demarrage
 * et fournit des methodes de lookup pour le parseur et le generateur.
 */
@Component
public class CustomAnnotationRegistry {

    private static final Logger log = LoggerFactory.getLogger(CustomAnnotationRegistry.class);

    private static final String CONFIG_FILE = "custom-annotations.yml";

    /** Index par nom d'annotation */
    private final Map<String, CustomAnnotationDefinition> definitionsByName = new LinkedHashMap<>();

    /** Prefixes de packages internes banque */
    private final List<String> internalPackages = new ArrayList<>();

    /** Prefixes de packages standard a ignorer */
    private final List<String> standardPackages = new ArrayList<>();

    /** Compteur de chargement */
    private int totalLoaded = 0;

    // ==================== INITIALIZATION ====================

    @PostConstruct
    public void init() {
        loadFromClasspath();
    }

    /**
     * Charge le registre depuis le fichier YAML dans le classpath.
     */
    @SuppressWarnings("unchecked")
    public void loadFromClasspath() {
        try {
            ClassPathResource resource = new ClassPathResource(CONFIG_FILE);
            if (!resource.exists()) {
                log.warn("Fichier {} non trouve dans le classpath. Registre vide.", CONFIG_FILE);
                return;
            }

            try (InputStream is = resource.getInputStream()) {
                Yaml yaml = new Yaml();
                Map<String, Object> config = yaml.load(is);

                // Charger les prefixes de packages internes
                if (config.containsKey("internal-packages")) {
                    List<String> pkgs = (List<String>) config.get("internal-packages");
                    internalPackages.addAll(pkgs);
                    log.info("Packages internes charges : {}", pkgs);
                }

                // Charger les prefixes de packages standard
                if (config.containsKey("standard-packages")) {
                    List<String> pkgs = (List<String>) config.get("standard-packages");
                    standardPackages.addAll(pkgs);
                }

                // Charger les definitions d'annotations
                if (config.containsKey("annotations")) {
                    List<Map<String, Object>> annotConfigs = (List<Map<String, Object>>) config.get("annotations");
                    for (Map<String, Object> annotConfig : annotConfigs) {
                        CustomAnnotationDefinition def = parseAnnotationDefinition(annotConfig);
                        if (def != null) {
                            definitionsByName.put(def.getName(), def);
                            totalLoaded++;
                        }
                    }
                }

                log.info("Registre d'annotations custom charge : {} annotations en {} categories",
                        totalLoaded, getCategoryCount());
            }
        } catch (IOException | RuntimeException e) {
            log.error("Erreur lors du chargement du registre d'annotations : {}", e.getMessage(), e);
        }
    }

    // ==================== LOOKUP METHODS ====================

    /**
     * Recherche une definition d'annotation par son nom simple.
     */
    public Optional<CustomAnnotationDefinition> lookup(String annotationName) {
        return Optional.ofNullable(definitionsByName.get(annotationName));
    }

    /**
     * Determine si une annotation est connue dans le registre.
     */
    public boolean isKnown(String annotationName) {
        return definitionsByName.containsKey(annotationName);
    }

    /**
     * Determine si un nom d'annotation correspond a un package interne banque.
     * Utilise pour les annotations non declarees dans le registre.
     */
    public boolean isInternalPackage(String packageName) {
        if (packageName == null || packageName.isEmpty()) return false;
        return internalPackages.stream().anyMatch(packageName::startsWith);
    }

    /**
     * Determine si un nom d'annotation correspond a un package standard (a ignorer).
     */
    public boolean isStandardPackage(String packageName) {
        if (packageName == null || packageName.isEmpty()) return false;
        return standardPackages.stream().anyMatch(packageName::startsWith);
    }

    /**
     * Determine si une annotation (par son nom simple) est standard Java/Spring/JPA.
     */
    public boolean isStandardAnnotation(String simpleName) {
        return STANDARD_ANNOTATION_NAMES.contains(simpleName);
    }

    /**
     * Classifie une annotation detectee :
     * - KNOWN si dans le registre
     * - UNKNOWN_INTERNAL si package interne mais pas dans le registre
     * - UNKNOWN_EXTERNAL sinon
     */
    public DetectedAnnotation.RecognitionStatus classify(String annotationName, String packageHint) {
        if (definitionsByName.containsKey(annotationName)) {
            return DetectedAnnotation.RecognitionStatus.KNOWN;
        }
        if (isStandardAnnotation(annotationName)) {
            return null; // Annotation standard, pas besoin de classifier
        }
        if (packageHint != null && isInternalPackage(packageHint)) {
            return DetectedAnnotation.RecognitionStatus.UNKNOWN_INTERNAL;
        }
        return DetectedAnnotation.RecognitionStatus.UNKNOWN_EXTERNAL;
    }

    /**
     * Retourne toutes les definitions par categorie.
     */
    public Map<CustomAnnotationDefinition.Category, List<CustomAnnotationDefinition>> getByCategory() {
        return definitionsByName.values().stream()
                .collect(Collectors.groupingBy(CustomAnnotationDefinition::getCategory));
    }

    /**
     * Retourne toutes les definitions de type SECURITY ou COMPLIANCE.
     */
    public List<CustomAnnotationDefinition> getSecurityAnnotations() {
        return definitionsByName.values().stream()
                .filter(d -> d.getCategory() == CustomAnnotationDefinition.Category.SECURITY ||
                             d.getCategory() == CustomAnnotationDefinition.Category.COMPLIANCE)
                .collect(Collectors.toList());
    }

    /**
     * Retourne le nombre total d'annotations chargees.
     */
    public int getTotalLoaded() { return totalLoaded; }

    /**
     * Retourne le nombre de categories distinctes.
     */
    public long getCategoryCount() {
        return definitionsByName.values().stream()
                .map(CustomAnnotationDefinition::getCategory)
                .distinct().count();
    }

    /**
     * Retourne toutes les definitions.
     */
    public Collection<CustomAnnotationDefinition> getAllDefinitions() {
        return Collections.unmodifiableCollection(definitionsByName.values());
    }

    // ==================== PARSING ====================

    @SuppressWarnings("unchecked")
    private CustomAnnotationDefinition parseAnnotationDefinition(Map<String, Object> config) {
        try {
            CustomAnnotationDefinition def = new CustomAnnotationDefinition();
            def.setName((String) config.get("name"));
            def.setCategory(CustomAnnotationDefinition.Category.valueOf(
                    ((String) config.get("category")).toUpperCase()));
            def.setDescription((String) config.get("description"));
            def.setPropagation(CustomAnnotationDefinition.PropagationStrategy.valueOf(
                    ((String) config.get("propagation")).toUpperCase().replace("-", "_")));

            if (config.containsKey("spring-equivalent")) {
                def.setSpringEquivalent((String) config.get("spring-equivalent"));
            }
            if (config.containsKey("example")) {
                def.setExample((String) config.get("example"));
            }

            // Parser les attributs
            if (config.containsKey("attributes")) {
                List<Map<String, Object>> attrConfigs = (List<Map<String, Object>>) config.get("attributes");
                for (Map<String, Object> attrConfig : attrConfigs) {
                    CustomAnnotationDefinition.AttributeDefinition attr =
                            new CustomAnnotationDefinition.AttributeDefinition(
                                    (String) attrConfig.get("name"),
                                    (String) attrConfig.get("type"),
                                    (String) attrConfig.get("description"),
                                    attrConfig.containsKey("default") ?
                                            String.valueOf(attrConfig.get("default")) : null
                            );
                    def.getAttributes().add(attr);
                }
            }

            return def;
        } catch (RuntimeException e) {
            log.warn("Impossible de parser la definition d'annotation : {}", e.getMessage());
            return null;
        }
    }

    // ==================== STANDARD ANNOTATIONS ====================

    /** Noms simples des annotations standard Java/Spring/JPA/EJB/JAXB */
    private static final Set<String> STANDARD_ANNOTATION_NAMES = Set.of(
            // Java
            "Override", "Deprecated", "SuppressWarnings", "FunctionalInterface",
            // EJB
            "Stateless", "Stateful", "Singleton", "MessageDriven",
            "Remote", "Local", "EJB", "Inject", "Resource",
            "TransactionAttribute", "TransactionManagement",
            "RolesAllowed", "PermitAll", "DenyAll", "RunAs",
            "Schedule", "Timeout", "Lock", "AccessTimeout",
            "Startup", "DependsOn", "PostConstruct", "PreDestroy",
            "AroundInvoke", "Interceptors", "ExcludeDefaultInterceptors",
            "ActivationConfigProperty",
            // JPA
            "Entity", "Table", "Id", "GeneratedValue", "Column",
            "ManyToOne", "OneToMany", "ManyToMany", "OneToOne",
            "JoinColumn", "Embeddable", "Embedded", "NamedQuery",
            "Transient", "Lob", "Temporal", "Enumerated",
            // JAXB
            "XmlRootElement", "XmlElement", "XmlAttribute", "XmlType",
            "XmlAccessorType", "XmlTransient", "XmlElementWrapper",
            "XmlEnum", "XmlEnumValue", "XmlSeeAlso", "XmlValue",
            // Spring
            "Component", "Service", "Repository", "Controller",
            "RestController", "Configuration", "Bean",
            "Autowired", "Qualifier", "Value", "Primary",
            "RequestMapping", "GetMapping", "PostMapping",
            "PutMapping", "DeleteMapping", "PatchMapping",
            "PathVariable", "RequestBody", "RequestParam",
            "ResponseBody", "ResponseStatus", "ExceptionHandler",
            "Transactional", "Cacheable", "Async", "Scheduled",
            "PreAuthorize", "Secured", "EnableWebSecurity",
            "CrossOrigin", "Valid", "Validated",
            // Lombok
            "Data", "Getter", "Setter", "NoArgsConstructor",
            "AllArgsConstructor", "Builder", "ToString", "EqualsAndHashCode",
            // Swagger
            "Api", "ApiOperation", "ApiParam", "ApiModel",
            "ApiModelProperty", "Tag", "Operation", "Schema",
            // Validation
            "NotNull", "NotBlank", "NotEmpty", "Size", "Min", "Max",
            "Pattern", "Email", "Past", "Future", "Positive", "Negative",
            "Constraint"
    );
}
