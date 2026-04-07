package com.bank.tools.generator.engine.constants;

import java.util.*;

/**
 * Constantes centralisées pour la génération de code.
 * Remplace les constantes dupliquées dans CodeGenerationEngine,
 * AclArchitectureGenerator et EjbProjectParser.
 */
/**
 * Ces valeurs sont les fallbacks quand aucune config n'est fournie.
 */
public final class GeneratorConstants {

    private GeneratorConstants() {}

    // ===================== PACKAGES =====================

    public static final String DEFAULT_BASE_PACKAGE = "com.bank.api";
    public static final String DEFAULT_BASE_PACKAGE_PATH = "com/bank/api";

    // ===================== TYPES JAVA =====================

    /** Types java.lang qui ne nécessitent pas d'import */
    public static final Set<String> JAVA_LANG_TYPES = Set.of(
            "String", "Integer", "Long", "Double", "Float", "Boolean",
            "Byte", "Short", "Character", "Object", "Number", "Void"
    );

    /** Types primitifs Java */
    public static final Set<String> PRIMITIVE_TYPES = Set.of(
            "int", "long", "double", "float", "boolean", "byte", "short", "char", "void"
    );

    // ===================== IMPORTS UNIVERSELS =====================

    /** Table de mapping type → import (G1) */
    public static final Map<String, String> TYPE_IMPORT_MAP;
    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("BigDecimal", "java.math.BigDecimal");
        m.put("BigInteger", "java.math.BigInteger");
        m.put("List", "java.util.List");
        m.put("ArrayList", "java.util.ArrayList");
        m.put("Map", "java.util.Map");
        m.put("HashMap", "java.util.HashMap");
        m.put("Set", "java.util.Set");
        m.put("HashSet", "java.util.HashSet");
        m.put("LinkedList", "java.util.LinkedList");
        m.put("Optional", "java.util.Optional");
        m.put("Date", "java.util.Date");
        m.put("UUID", "java.util.UUID");
        m.put("Arrays", "java.util.Arrays");
        m.put("Collections", "java.util.Collections");
        m.put("Collection", "java.util.Collection");
        m.put("LocalDate", "java.time.LocalDate");
        m.put("LocalDateTime", "java.time.LocalDateTime");
        m.put("LocalTime", "java.time.LocalTime");
        m.put("Instant", "java.time.Instant");
        m.put("ZonedDateTime", "java.time.ZonedDateTime");
        m.put("Duration", "java.time.Duration");
        m.put("Serializable", "java.io.Serializable");
        TYPE_IMPORT_MAP = Collections.unmodifiableMap(m);
    }

    // ===================== TYPES FRAMEWORK EAI =====================

    /** Types framework BOA/EAI à ne pas recopier dans le wrapper */
    public static final Set<String> FRAMEWORK_TYPES = Set.of(
            "Envelope", "Parser", "ParsingException", "UtilHash",
            "SynchroneService", "Services", "EaiLog", "Log",
            "FwkRollbackException", "BaseUseCase", "ValueObject",
            "UCStrategie", "AbstractUseCase", "AsynchroneService",
            "CommonFunction"
    );

    // ===================== CHAMPS LEGACY =====================

    /** Champs legacy EJB à ne pas exposer dans les RestDTOs */
    public static final Set<String> LEGACY_FIELDS = Set.of(
            "codeRetour", "messageRetour", "serialVersionUID",
            "scoreInterne", "segmentCommercial"
    );

    // ===================== RENOMMAGE CHAMPS =====================

    /** Mapping champs EJB → champs REST pour les RestDTOs ACL */
    public static final Map<String, String> FIELD_RENAME = Map.ofEntries(
            Map.entry("numCarte", "numeroCarte"),
            Map.entry("numLot", "numeroLot"),
            Map.entry("numToken", "numeroToken"),
            Map.entry("numTelephone", "numeroTelephone"),
            Map.entry("motifBlocage", "motif"),
            Map.entry("sasCC", "identifiantClient"),
            Map.entry("ribEmetteur", "compteEmetteur"),
            Map.entry("ribBeneficiaire", "compteBeneficiaire"),
            Map.entry("montantDemande", "montant")
    );

    // ===================== BIAN =====================

    /** Mapping action BIAN → méthode HTTP */
    public static final Map<String, String> BIAN_ACTION_HTTP_METHOD = Map.of(
            "initiation", "POST",
            "evaluation", "POST",
            "notification", "POST",
            "retrieval", "POST",
            "execution", "POST",
            "control", "PUT",
            "update", "PUT",
            "termination", "PUT"
    );

    /** Actions BIAN sans {cr-reference-id} (création de nouvelles ressources) */
    public static final Set<String> BIAN_ACTIONS_WITHOUT_CR_ID = Set.of(
            "initiation", "evaluation", "notification"
    );

    /** Actions BIAN qui retournent 201 Created */
    public static final Set<String> BIAN_ACTIONS_201 = Set.of(
            "initiation", "notification"
    );

    // ===================== EXCEPTION → HTTP STATUS =====================

    /** Patterns dans le nom d'exception → code HTTP (ordre de priorité) */
    public static final List<Map.Entry<String, String>> EXCEPTION_HTTP_PATTERNS = List.of(
            Map.entry("notfound|inexistant|introuvable|missing", "HttpStatus.NOT_FOUND"),
            Map.entry("authentification|authentication|unauthenticated|login|token|credentials", "HttpStatus.UNAUTHORIZED"),
            Map.entry("forbidden|permission|denied|interdit|nonautorise", "HttpStatus.FORBIDDEN"),
            Map.entry("validation|invalid|malformed|badrequest", "HttpStatus.BAD_REQUEST"),
            Map.entry("conflict|duplicate|already|exists|deja|doublon|active|fwkrollback|rollback|business|metier|bloque|cloture|ferme", "HttpStatus.CONFLICT"),
            Map.entry("insufficient|insuffisant|limit|exceeded|depasse|plafond|seuil", "HttpStatus.UNPROCESSABLE_ENTITY"),
            Map.entry("parsing|technique|format|conversion", "HttpStatus.BAD_REQUEST"),
            Map.entry("unavailable|indisponible|nondisponible|timeout|naming|jndi", "HttpStatus.SERVICE_UNAVAILABLE"),
            Map.entry("ratelimit|throttle|toomany", "HttpStatus.TOO_MANY_REQUESTS")
    );

    // ===================== SPRING IMPORTS =====================

    /** Import ResponseEntity */
    public static final String IMPORT_RESPONSE_ENTITY = "org.springframework.http.ResponseEntity";
    /** Import HttpStatus */
    public static final String IMPORT_HTTP_STATUS = "org.springframework.http.HttpStatus";
    /** Import RestController annotations */
    public static final String IMPORT_WEB_ANNOTATIONS = "org.springframework.web.bind.annotation.*";
    /** Import Valid */
    public static final String IMPORT_VALID = "jakarta.validation.Valid";
    /** Import HttpHeaders */
    public static final String IMPORT_HTTP_HEADERS = "org.springframework.http.HttpHeaders";
    /** Import MediaType */
    public static final String IMPORT_MEDIA_TYPE = "org.springframework.http.MediaType";

    // ===================== STRUCTURE PROJET =====================

    /** Chemin relatif des sources principales */
    public static final String SRC_MAIN_JAVA = "src/main/java";
    /** Chemin relatif des ressources */
    public static final String SRC_MAIN_RESOURCES = "src/main/resources";
    /** Chemin relatif des sources de test */
    public static final String SRC_TEST_JAVA = "src/test/java";
    /** Fichier POM */
    public static final String POM_XML = "pom.xml";
    /** Fichier application.properties */
    public static final String APPLICATION_PROPERTIES = "application.properties";

    // ===================== JAVAX → JAKARTA =====================

    /** Mapping javax → jakarta pour la migration */
    public static final Map<String, String> JAVAX_TO_JAKARTA = Map.of(
            "javax.validation", "jakarta.validation",
            "javax.annotation", "jakarta.annotation",
            "javax.persistence", "jakarta.persistence",
            "javax.servlet", "jakarta.servlet"
    );

    // ===================== NOM VALIDATION =====================

    /** Pattern regex pour valider un identifiant Java */
    public static final String JAVA_IDENTIFIER_PATTERN = "^[a-zA-Z_$][a-zA-Z0-9_$]*$";
}
