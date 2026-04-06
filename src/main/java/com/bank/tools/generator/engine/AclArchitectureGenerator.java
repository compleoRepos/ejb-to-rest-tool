package com.bank.tools.generator.engine;

import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Generateur d'architecture decouplée avec Anti-Corruption Layer.
 * Genere les 4 couches : API, Domain, Anti-Corruption, Infrastructure.
 *
 * Regle d'or : aucun type EJB (VoIn, VoOut, BaseUseCase, ValueObject)
 * n'est visible au-dessus de la couche Anti-Corruption.
 */
@Component
public class AclArchitectureGenerator {

    private static final Logger log = LoggerFactory.getLogger(AclArchitectureGenerator.class);

    // Package de base du projet genere
    private static final String BASE_PKG = "com.bank.api";
    private static final String BASE_PKG_PATH = "com/bank/api";

    // Sous-packages (BASE_PKG = com.bank.api, donc pas de double .api)
    private static final String PKG_API_CONTROLLER = BASE_PKG + ".controller";
    private static final String PKG_API_DTO_REQUEST = BASE_PKG + ".dto.request";
    private static final String PKG_API_DTO_RESPONSE = BASE_PKG + ".dto.response";
    private static final String PKG_DOMAIN_SERVICE = BASE_PKG + ".domain.service";
    private static final String PKG_DOMAIN_EXCEPTION = BASE_PKG + ".domain.exception";
    private static final String PKG_DOMAIN_MODEL = BASE_PKG + ".domain.model";
    private static final String PKG_INFRA_EJB_ADAPTER = BASE_PKG + ".infrastructure.ejb.adapter";
    private static final String PKG_INFRA_EJB_MAPPER = BASE_PKG + ".infrastructure.ejb.mapper";
    private static final String PKG_INFRA_EJB_EXCEPTION = BASE_PKG + ".infrastructure.ejb.exception";
    private static final String PKG_INFRA_EJB_TYPES = BASE_PKG + ".infrastructure.ejb.types";
    private static final String PKG_INFRA_MOCK = BASE_PKG + ".infrastructure.mock";
    private static final String PKG_CONFIG = BASE_PKG + ".config";

    // Types EJB framework a filtrer
    private static final Set<String> FRAMEWORK_TYPES = Set.of(
            "Envelope", "BaseUseCase", "ValueObject", "FwkRollbackException",
            "UCStrategie", "AbstractUseCase", "IUseCase"
    );

    // Champs EJB legacy a supprimer des RestDTOs
    private static final Set<String> LEGACY_FIELDS = Set.of(
            "codeRetour", "messageRetour", "serialVersionUID"
    );

    // Mapping verbe francais → nom d'action
    private static final Map<String, String> VERB_TO_NOUN = new LinkedHashMap<>();
    static {
        VERB_TO_NOUN.put("Activer", "Activation");
        VERB_TO_NOUN.put("Receptionner", "Reception");
        VERB_TO_NOUN.put("Charger", "Consultation");
        VERB_TO_NOUN.put("Consulter", "Consultation");
        VERB_TO_NOUN.put("Ouvrir", "Ouverture");
        VERB_TO_NOUN.put("Fermer", "Fermeture");
        VERB_TO_NOUN.put("Modifier", "Modification");
        VERB_TO_NOUN.put("Supprimer", "Suppression");
        VERB_TO_NOUN.put("Creer", "Creation");
        VERB_TO_NOUN.put("Valider", "Validation");
        VERB_TO_NOUN.put("Annuler", "Annulation");
        VERB_TO_NOUN.put("Rechercher", "Recherche");
        VERB_TO_NOUN.put("Lister", "Liste");
        VERB_TO_NOUN.put("Verifier", "Verification");
        VERB_TO_NOUN.put("Envoyer", "Envoi");
        VERB_TO_NOUN.put("Recevoir", "Reception");
        VERB_TO_NOUN.put("Traiter", "Traitement");
        VERB_TO_NOUN.put("Executer", "Execution");
    }

    // Mapping abreviations champs EJB → noms propres
    private static final Map<String, String> FIELD_RENAME = new LinkedHashMap<>();
    static {
        FIELD_RENAME.put("numCarte", "numeroCarte");
        FIELD_RENAME.put("numTelephone", "numeroTelephone");
        FIELD_RENAME.put("sasCC", "identifiantClient");
        FIELD_RENAME.put("numCompte", "numeroCompte");
        FIELD_RENAME.put("numClient", "numeroClient");
        FIELD_RENAME.put("dtNaissance", "dateNaissance");
        FIELD_RENAME.put("dtCreation", "dateCreation");
        FIELD_RENAME.put("dtExpiration", "dateExpiration");
        FIELD_RENAME.put("mntOperation", "montantOperation");
        FIELD_RENAME.put("mnt", "montant");
        FIELD_RENAME.put("lib", "libelle");
        FIELD_RENAME.put("cpt", "compte");
    }

    /**
     * Represente un mapping entre un UseCase EJB et un service BIAN.
     */
    public static class ServiceDomainGroup {
        public String serviceDomainName; // ex: "CardManagement"
        public String serviceInterfaceName; // ex: "CarteService"
        public List<UseCaseEndpoint> endpoints = new ArrayList<>();
    }

    /**
     * Represente un endpoint dans un service domain.
     */
    public static class UseCaseEndpoint {
        public UseCaseInfo useCase;
        public String methodName; // ex: "activerCarte"
        public String requestDtoName; // ex: "ActivationCarteRequest"
        public String responseDtoName; // ex: "ActivationCarteResponse"
        public String ejbInputDtoName; // ex: "ActiverCarteVoIn"
        public String ejbOutputDtoName; // ex: "ActiverCarteVoOut"
        public String mapperClassName; // ex: "ActiverCarteMapper"
        public DtoInfo ejbInputDto; // reference au DTO EJB original
        public DtoInfo ejbOutputDto; // reference au DTO EJB original
        public String bianAction; // ex: "activation"
        public String bianPath; // ex: "/{cr-reference-id}/activation/execution"
        public UseCaseInfo.MethodInfo sourceMethod; // methode EJB source (pour multi-method)
    }

    // =====================================================================
    // METHODE PRINCIPALE
    // =====================================================================

    /**
     * Genere l'architecture decouplée complete.
     */
    public void generateAclArchitecture(Path srcMain, ProjectAnalysisResult analysis,
                                         Map<String, List<UseCaseInfo>> bianGroups) throws IOException {
        log.info("[ACL] Debut de la generation de l'architecture decouplée");

        // Creer les repertoires
        createDirectories(srcMain);

        // Construire les groupes de service domain
        List<ServiceDomainGroup> groups = buildServiceDomainGroups(bianGroups, analysis);
        log.info("[ACL] {} Service Domains detectes avec {} endpoints au total",
                groups.size(), groups.stream().mapToInt(g -> g.endpoints.size()).sum());

        // COUCHE DOMAIN : Exceptions wrapper
        generateApiException(srcMain);
        generateWrapperExceptions(srcMain);
        log.info("[ACL] Exceptions wrapper generees");

        // COUCHE DOMAIN : Enums propres
        generateDomainEnums(srcMain, analysis);

        // Pour chaque service domain
        for (ServiceDomainGroup group : groups) {

            // COUCHE API : RestDTOs (Request/Response)
            for (UseCaseEndpoint ep : group.endpoints) {
                generateRestRequestDto(srcMain, ep);
                generateRestResponseDto(srcMain, ep);
            }

            // COUCHE DOMAIN : Interface de service
            generateServiceInterface(srcMain, group);

            // COUCHE ANTI-CORRUPTION : Mappers
            for (UseCaseEndpoint ep : group.endpoints) {
                generateMapper(srcMain, ep);
            }

            // COUCHE ANTI-CORRUPTION : ExceptionTranslator
            generateExceptionTranslator(srcMain);

            // COUCHE INFRASTRUCTURE : Types EJB isoles
            for (UseCaseEndpoint ep : group.endpoints) {
                relocateEjbTypes(srcMain, ep, analysis);
            }

            // COUCHE INFRASTRUCTURE : JNDI Adapter
            generateJndiAdapter(srcMain, group);

            // COUCHE INFRASTRUCTURE : Mock Adapter
            generateMockAdapter(srcMain, group);

            // COUCHE API : Controller BIAN (utilise interface service + RestDTOs)
            generateAclBianController(srcMain, group);
        }

        // COUCHE CONFIG : GlobalExceptionHandler simplifie
        generateAclGlobalExceptionHandler(srcMain);

        // Profils Spring
        generateSpringProfiles(srcMain);

        log.info("[ACL] Generation de l'architecture decouplée terminee");
    }

    // =====================================================================
    // CREATION DES REPERTOIRES
    // =====================================================================

    private void createDirectories(Path srcMain) throws IOException {
        Path base = srcMain.getParent().getParent().getParent(); // back to src/main/java (com/bank/api -> 3 parents)
        Path pkg = base.resolve(BASE_PKG_PATH);
        Files.createDirectories(pkg.resolve("controller"));
        Files.createDirectories(pkg.resolve("dto/request"));
        Files.createDirectories(pkg.resolve("dto/response"));
        Files.createDirectories(pkg.resolve("dto/common"));
        Files.createDirectories(pkg.resolve("domain/service"));
        Files.createDirectories(pkg.resolve("domain/exception"));
        Files.createDirectories(pkg.resolve("domain/model"));
        Files.createDirectories(pkg.resolve("infrastructure/ejb/adapter"));
        Files.createDirectories(pkg.resolve("infrastructure/ejb/mapper"));
        Files.createDirectories(pkg.resolve("infrastructure/ejb/exception"));
        Files.createDirectories(pkg.resolve("infrastructure/ejb/types"));
        Files.createDirectories(pkg.resolve("infrastructure/mock"));
        Files.createDirectories(pkg.resolve("config"));
    }

    private Path resolvePackagePath(Path srcMain, String packageName) {
        Path base = srcMain.getParent().getParent().getParent(); // back to src/main/java
        return base.resolve(packageName.replace('.', '/'));
    }

    // =====================================================================
    // CONSTRUCTION DES GROUPES
    // =====================================================================

    private List<ServiceDomainGroup> buildServiceDomainGroups(
            Map<String, List<UseCaseInfo>> bianGroups, ProjectAnalysisResult analysis) {

        List<ServiceDomainGroup> result = new ArrayList<>();

        for (Map.Entry<String, List<UseCaseInfo>> entry : bianGroups.entrySet()) {
            String sdName = entry.getKey(); // ex: "CardManagement"
            List<UseCaseInfo> useCases = entry.getValue();

            ServiceDomainGroup group = new ServiceDomainGroup();
            group.serviceDomainName = sdName;
            group.serviceInterfaceName = deriveServiceInterfaceName(sdName);

            for (UseCaseInfo uc : useCases) {
                if (uc.getEjbPattern() == UseCaseInfo.EjbPattern.GENERIC_SERVICE) {
                    // Multi-method : un endpoint par methode publique
                    for (UseCaseInfo.MethodInfo method : uc.getPublicMethods()) {
                        UseCaseEndpoint ep = buildEndpointFromMethod(uc, method, analysis);
                        if (ep != null) {
                            group.endpoints.add(ep);
                        }
                    }
                } else {
                    // BaseUseCase : un seul endpoint
                    UseCaseEndpoint ep = buildEndpointFromUseCase(uc, analysis);
                    if (ep != null) {
                        group.endpoints.add(ep);
                    }
                }
            }

            if (!group.endpoints.isEmpty()) {
                result.add(group);
            }
        }

        return result;
    }

    private UseCaseEndpoint buildEndpointFromUseCase(UseCaseInfo uc, ProjectAnalysisResult analysis) {
        UseCaseEndpoint ep = new UseCaseEndpoint();
        ep.useCase = uc;
        ep.ejbInputDtoName = uc.getInputDtoClassName();
        ep.ejbOutputDtoName = uc.getOutputDtoClassName();

        // Trouver les DtoInfo correspondants
        ep.ejbInputDto = findDto(analysis, ep.ejbInputDtoName);
        ep.ejbOutputDto = findDto(analysis, ep.ejbOutputDtoName);

        // Deriver les noms REST
        String baseName = uc.getClassName().replaceAll("(UC|UseCase)$", "");
        ep.methodName = toLowerCamel(baseName);
        ep.requestDtoName = deriveRestDtoName(ep.ejbInputDtoName, "Request");
        ep.responseDtoName = deriveRestDtoName(ep.ejbOutputDtoName, "Response");
        ep.mapperClassName = baseName + "Mapper";

        // BIAN
        if (uc.getBianMapping() != null) {
            ep.bianAction = uc.getBianMapping().getAction();
            ep.bianPath = uc.getBianMapping().getUrl();
        }

        return ep;
    }

    private UseCaseEndpoint buildEndpointFromMethod(UseCaseInfo uc, UseCaseInfo.MethodInfo method,
                                                     ProjectAnalysisResult analysis) {
        UseCaseEndpoint ep = new UseCaseEndpoint();
        ep.useCase = uc;
        ep.sourceMethod = method;
        ep.methodName = method.getName();

        // Trouver le DTO input (premier parametre complexe)
        String inputType = null;
        for (UseCaseInfo.ParameterInfo param : method.getParameters()) {
            if (param.isComplexType() && !isFrameworkType(param.getType())) {
                inputType = param.getType();
                break;
            }
        }
        ep.ejbInputDtoName = inputType;
        ep.ejbInputDto = findDto(analysis, inputType);

        // Trouver le DTO output
        String returnType = method.getReturnType();
        if (returnType != null && !"void".equals(returnType) && !isFrameworkType(returnType)
                && !isPrimitiveOrString(returnType)) {
            ep.ejbOutputDtoName = returnType;
            ep.ejbOutputDto = findDto(analysis, returnType);
        }

        // Deriver les noms REST
        String baseName = capitalize(method.getName());
        ep.requestDtoName = deriveRestDtoName(ep.ejbInputDtoName, "Request");
        ep.responseDtoName = deriveRestDtoName(ep.ejbOutputDtoName, "Response");

        // Si pas de DTO input EJB, deriver du nom de methode
        if (ep.requestDtoName == null) {
            ep.requestDtoName = deriveActionName(baseName) + "Request";
        }
        if (ep.responseDtoName == null) {
            ep.responseDtoName = deriveActionName(baseName) + "Response";
        }

        ep.mapperClassName = baseName + "Mapper";

        // BIAN
        if (uc.getBianMapping() != null) {
            ep.bianAction = toLowerCamel(method.getName());
            ep.bianPath = "/{cr-reference-id}/" + toKebabCase(method.getName()) + "/execution";
        }

        return ep;
    }

    // =====================================================================
    // COUCHE API : RestDTOs
    // =====================================================================

    private void generateRestRequestDto(Path srcMain, UseCaseEndpoint ep) throws IOException {
        if (ep.requestDtoName == null) return;

        Path dir = resolvePackagePath(srcMain, PKG_API_DTO_REQUEST);
        Path file = dir.resolve(ep.requestDtoName + ".java");
        if (Files.exists(file)) return; // deja genere

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_REQUEST).append(";\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        imports.add("import jakarta.validation.constraints.NotBlank;");

        List<RestField> fields = deriveRestFields(ep.ejbInputDto, true);
        for (RestField f : fields) {
            if (f.type.contains("Canal") || f.type.contains("Statut") || f.type.contains("Type")) {
                imports.add("import " + PKG_DOMAIN_MODEL + "." + f.type + ";");
            }
        }

        for (String imp : imports) {
            sb.append(imp).append("\n");
        }
        sb.append("\n");

        // Javadoc
        sb.append("/**\n");
        sb.append(" * Requete ").append(humanize(ep.requestDtoName.replace("Request", ""))).append(".\n");
        if (ep.bianAction != null && ep.useCase.getBianMapping() != null) {
            sb.append(" * BIAN: ").append(ep.useCase.getBianMapping().getServiceDomain()).append("\n");
        }
        sb.append(" */\n");

        sb.append("public class ").append(ep.requestDtoName).append(" {\n\n");

        // Champs
        for (RestField f : fields) {
            if (f.required) {
                sb.append("    @NotBlank(message = \"Le champ ").append(f.name).append(" est obligatoire\")\n");
            }
            sb.append("    private ").append(f.type).append(" ").append(f.name).append(";\n\n");
        }

        // Constructeur vide
        sb.append("    public ").append(ep.requestDtoName).append("() {}\n\n");

        // Getters/Setters
        for (RestField f : fields) {
            String cap = capitalize(f.name);
            sb.append("    public ").append(f.type).append(" get").append(cap).append("() { return ").append(f.name).append("; }\n");
            sb.append("    public void set").append(cap).append("(").append(f.type).append(" v) { this.").append(f.name).append(" = v; }\n\n");
        }

        // toString
        sb.append("    @Override\n");
        sb.append("    public String toString() {\n");
        sb.append("        return \"").append(ep.requestDtoName).append("{\" +\n");
        for (int i = 0; i < fields.size(); i++) {
            RestField f = fields.get(i);
            sb.append("            \"").append(f.name).append("='\" + ").append(f.name).append(" + \"'");
            if (i < fields.size() - 1) sb.append(", ");
            sb.append("\" +\n");
        }
        sb.append("            \"}\";\n");
        sb.append("    }\n");

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.debug("[ACL] RestDTO Request genere : {}", ep.requestDtoName);
    }

    private void generateRestResponseDto(Path srcMain, UseCaseEndpoint ep) throws IOException {
        if (ep.responseDtoName == null) return;

        Path dir = resolvePackagePath(srcMain, PKG_API_DTO_RESPONSE);
        Path file = dir.resolve(ep.responseDtoName + ".java");
        if (Files.exists(file)) return;

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_DTO_RESPONSE).append(";\n\n");

        List<RestField> fields = deriveRestFields(ep.ejbOutputDto, false);
        // Ajouter un champ "message" s'il n'existe pas
        boolean hasMessage = fields.stream().anyMatch(f -> "message".equals(f.name));
        if (!hasMessage) {
            fields.add(new RestField("message", "String", false));
        }

        // Imports pour enums
        Set<String> imports = new TreeSet<>();
        for (RestField f : fields) {
            if (f.type.contains("Canal") || f.type.contains("Statut") || f.type.contains("Type")) {
                imports.add("import " + PKG_DOMAIN_MODEL + "." + f.type + ";");
            }
        }
        for (String imp : imports) {
            sb.append(imp).append("\n");
        }
        if (!imports.isEmpty()) sb.append("\n");

        sb.append("/**\n");
        sb.append(" * Reponse ").append(humanize(ep.responseDtoName.replace("Response", ""))).append(".\n");
        sb.append(" */\n");
        sb.append("public class ").append(ep.responseDtoName).append(" {\n\n");

        for (RestField f : fields) {
            sb.append("    private ").append(f.type).append(" ").append(f.name).append(";\n");
        }
        sb.append("\n");

        sb.append("    public ").append(ep.responseDtoName).append("() {}\n\n");

        // Builder static success
        sb.append("    public static ").append(ep.responseDtoName).append(" success(String message) {\n");
        sb.append("        ").append(ep.responseDtoName).append(" r = new ").append(ep.responseDtoName).append("();\n");
        sb.append("        r.setMessage(message);\n");
        sb.append("        return r;\n");
        sb.append("    }\n\n");

        for (RestField f : fields) {
            String cap = capitalize(f.name);
            sb.append("    public ").append(f.type).append(" get").append(cap).append("() { return ").append(f.name).append("; }\n");
            sb.append("    public void set").append(cap).append("(").append(f.type).append(" v) { this.").append(f.name).append(" = v; }\n\n");
        }

        // toString
        sb.append("    @Override\n");
        sb.append("    public String toString() {\n");
        sb.append("        return \"").append(ep.responseDtoName).append("{\" +\n");
        for (int i = 0; i < fields.size(); i++) {
            RestField f = fields.get(i);
            sb.append("            \"").append(f.name).append("='\" + ").append(f.name).append(" + \"'");
            if (i < fields.size() - 1) sb.append(", ");
            sb.append("\" +\n");
        }
        sb.append("            \"}\";\n");
        sb.append("    }\n");

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.debug("[ACL] RestDTO Response genere : {}", ep.responseDtoName);
    }

    // =====================================================================
    // COUCHE DOMAIN : Interface Service
    // =====================================================================

    private void generateServiceInterface(Path srcMain, ServiceDomainGroup group) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_DOMAIN_SERVICE);
        Path file = dir.resolve(group.serviceInterfaceName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_DOMAIN_SERVICE).append(";\n\n");

        // Imports - uniquement des types du wrapper
        Set<String> imports = new TreeSet<>();
        for (UseCaseEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) {
                imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            }
            if (ep.responseDtoName != null) {
                imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
            }
        }
        for (String imp : imports) {
            sb.append(imp).append("\n");
        }
        sb.append("\n");

        sb.append("/**\n");
        sb.append(" * Service de ").append(humanize(group.serviceDomainName)).append(".\n");
        sb.append(" * BIAN: ").append(group.serviceDomainName).append("\n");
        sb.append(" *\n");
        sb.append(" * Contrat stable. L'implementation peut etre JNDI, HTTP, Mock, etc.\n");
        sb.append(" */\n");
        sb.append("public interface ").append(group.serviceInterfaceName).append(" {\n\n");

        for (UseCaseEndpoint ep : group.endpoints) {
            String returnType = ep.responseDtoName != null ? ep.responseDtoName : "void";
            String paramType = ep.requestDtoName != null ? ep.requestDtoName + " request" : "";
            sb.append("    ").append(returnType).append(" ").append(ep.methodName).append("(").append(paramType).append(");\n\n");
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] Interface service generee : {}", group.serviceInterfaceName);
    }

    // =====================================================================
    // COUCHE DOMAIN : Exceptions wrapper
    // =====================================================================

    private void generateApiException(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_DOMAIN_EXCEPTION);
        Path file = dir.resolve("ApiException.java");

        String code = """
                package %s;

                /**
                 * Exception de base du wrapper REST.
                 * Aucune dependance EJB.
                 */
                public abstract class ApiException extends RuntimeException {
                    private final String code;
                    private final int httpStatus;

                    protected ApiException(String message, String code, int httpStatus) {
                        super(message);
                        this.code = code;
                        this.httpStatus = httpStatus;
                    }

                    protected ApiException(String message, String code, int httpStatus, Throwable cause) {
                        super(message, cause);
                        this.code = code;
                        this.httpStatus = httpStatus;
                    }

                    public String getCode() { return code; }
                    public int getHttpStatus() { return httpStatus; }
                }
                """.formatted(PKG_DOMAIN_EXCEPTION);

        Files.writeString(file, code);
    }

    private void generateWrapperExceptions(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_DOMAIN_EXCEPTION);

        // BusinessRuleException
        Files.writeString(dir.resolve("BusinessRuleException.java"), """
                package %s;

                public class BusinessRuleException extends ApiException {
                    public BusinessRuleException(String message) {
                        super(message, "BUSINESS_ERROR", 409);
                    }
                }
                """.formatted(PKG_DOMAIN_EXCEPTION));

        // ServiceUnavailableException
        Files.writeString(dir.resolve("ServiceUnavailableException.java"), """
                package %s;

                public class ServiceUnavailableException extends ApiException {
                    public ServiceUnavailableException(String serviceName) {
                        super("Service " + serviceName + " indisponible", "SERVICE_UNAVAILABLE", 503);
                    }
                }
                """.formatted(PKG_DOMAIN_EXCEPTION));

        // ResourceNotFoundException
        Files.writeString(dir.resolve("ResourceNotFoundException.java"), """
                package %s;

                public class ResourceNotFoundException extends ApiException {
                    public ResourceNotFoundException(String resourceType, String id) {
                        super(resourceType + " introuvable : " + id, "NOT_FOUND", 404);
                    }
                }
                """.formatted(PKG_DOMAIN_EXCEPTION));

        // AuthenticationFailedException
        Files.writeString(dir.resolve("AuthenticationFailedException.java"), """
                package %s;

                public class AuthenticationFailedException extends ApiException {
                    public AuthenticationFailedException(String reason) {
                        super("Authentification echouee : " + reason, "AUTH_FAILED", 401);
                    }
                }
                """.formatted(PKG_DOMAIN_EXCEPTION));

        // InsufficientBalanceException
        Files.writeString(dir.resolve("InsufficientBalanceException.java"), """
                package %s;

                public class InsufficientBalanceException extends ApiException {
                    public InsufficientBalanceException(String compte, String detail) {
                        super("Solde insuffisant sur " + compte + ". " + detail, "INSUFFICIENT_BALANCE", 422);
                    }
                }
                """.formatted(PKG_DOMAIN_EXCEPTION));

        log.info("[ACL] 5 exceptions wrapper generees");
    }

    // =====================================================================
    // COUCHE DOMAIN : Enums propres
    // =====================================================================

    private void generateDomainEnums(Path srcMain, ProjectAnalysisResult analysis) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_DOMAIN_MODEL);

        for (ProjectAnalysisResult.EnumInfo enumInfo : analysis.getDetectedEnums()) {
            String enumName = enumInfo.getName();
            Path file = dir.resolve(enumName + ".java");

            StringBuilder sb = new StringBuilder();
            sb.append("package ").append(PKG_DOMAIN_MODEL).append(";\n\n");
            sb.append("/**\n");
            sb.append(" * Enum ").append(enumName).append(" (propre au wrapper).\n");
            sb.append(" */\n");
            sb.append("public enum ").append(enumName).append(" {\n");

            List<String> values = enumInfo.getValues();
            for (int i = 0; i < values.size(); i++) {
                sb.append("    ").append(values.get(i));
                if (i < values.size() - 1) sb.append(",");
                sb.append("\n");
            }
            sb.append("}\n");

            Files.writeString(file, sb.toString());
        }

        log.info("[ACL] {} enums generes dans domain/model", analysis.getDetectedEnums().size());
    }

    // =====================================================================
    // COUCHE ANTI-CORRUPTION : Mapper
    // =====================================================================

    private void generateMapper(Path srcMain, UseCaseEndpoint ep) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_EJB_MAPPER);
        Path file = dir.resolve(ep.mapperClassName + ".java");
        if (Files.exists(file)) return;

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_EJB_MAPPER).append(";\n\n");

        // Imports
        if (ep.requestDtoName != null) {
            sb.append("import ").append(PKG_API_DTO_REQUEST).append(".").append(ep.requestDtoName).append(";\n");
        }
        if (ep.responseDtoName != null) {
            sb.append("import ").append(PKG_API_DTO_RESPONSE).append(".").append(ep.responseDtoName).append(";\n");
        }
        if (ep.ejbInputDtoName != null) {
            sb.append("import ").append(PKG_INFRA_EJB_TYPES).append(".").append(ep.ejbInputDtoName).append(";\n");
        }
        if (ep.ejbOutputDtoName != null) {
            sb.append("import ").append(PKG_INFRA_EJB_TYPES).append(".").append(ep.ejbOutputDtoName).append(";\n");
        }
        sb.append("import org.springframework.stereotype.Component;\n\n");

        sb.append("/**\n");
        sb.append(" * Mapper : traduit RestDTO <-> VoIn/VoOut EJB.\n");
        sb.append(" * SEULE classe qui connait les types EJB pour cette operation.\n");
        sb.append(" */\n");
        sb.append("@Component\n");
        sb.append("public class ").append(ep.mapperClassName).append(" {\n\n");

        // toEjb
        if (ep.ejbInputDtoName != null && ep.requestDtoName != null && ep.ejbInputDto != null) {
            sb.append("    /**\n");
            sb.append("     * Traduit la requete REST vers le VoIn EJB.\n");
            sb.append("     */\n");
            sb.append("    public ").append(ep.ejbInputDtoName).append(" toEjb(").append(ep.requestDtoName).append(" request) {\n");
            sb.append("        ").append(ep.ejbInputDtoName).append(" voIn = new ").append(ep.ejbInputDtoName).append("();\n");

            for (DtoInfo.FieldInfo field : ep.ejbInputDto.getFields()) {
                if (field.isSerializationField() || field.isStatic() || LEGACY_FIELDS.contains(field.getName())) continue;
                String restFieldName = renameField(field.getName());
                String ejbCap = capitalize(field.getName());
                String restCap = capitalize(restFieldName);
                sb.append("        voIn.set").append(ejbCap).append("(request.get").append(restCap).append("());\n");
            }

            sb.append("        return voIn;\n");
            sb.append("    }\n\n");
        }

        // toRest
        if (ep.ejbOutputDtoName != null && ep.responseDtoName != null && ep.ejbOutputDto != null) {
            sb.append("    /**\n");
            sb.append("     * Traduit la reponse EJB vers le DTO REST.\n");
            sb.append("     */\n");
            sb.append("    public ").append(ep.responseDtoName).append(" toRest(").append(ep.ejbOutputDtoName).append(" voOut) {\n");
            sb.append("        ").append(ep.responseDtoName).append(" response = new ").append(ep.responseDtoName).append("();\n");

            for (DtoInfo.FieldInfo field : ep.ejbOutputDto.getFields()) {
                if (field.isSerializationField() || field.isStatic() || LEGACY_FIELDS.contains(field.getName())) continue;
                String restFieldName = renameField(field.getName());
                String ejbCap = capitalize(field.getName());
                String restCap = capitalize(restFieldName);
                sb.append("        response.set").append(restCap).append("(voOut.get").append(ejbCap).append("());\n");
            }

            sb.append("        return response;\n");
            sb.append("    }\n");
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.debug("[ACL] Mapper genere : {}", ep.mapperClassName);
    }

    // =====================================================================
    // COUCHE ANTI-CORRUPTION : ExceptionTranslator
    // =====================================================================

    private void generateExceptionTranslator(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_EJB_EXCEPTION);
        Path file = dir.resolve("EjbExceptionTranslator.java");
        if (Files.exists(file)) return;

        String code = """
                package %s;

                import %s.*;
                import org.springframework.stereotype.Component;

                /**
                 * Traduit les exceptions EJB en exceptions du wrapper.
                 * Seule classe qui analyse les messages d'erreur EJB.
                 */
                @Component
                public class EjbExceptionTranslator {

                    public RuntimeException translate(Exception ejbException, String useCaseName) {
                        String msg = ejbException.getMessage() != null ? ejbException.getMessage() : "";
                        String msgLower = msg.toLowerCase();

                        if (msgLower.contains("introuvable") || msgLower.contains("not found")) {
                            return new ResourceNotFoundException(useCaseName, extractId(msg));
                        }
                        if (msgLower.contains("authentification") || msgLower.contains("auth") || msgLower.contains("token")) {
                            return new AuthenticationFailedException(msg);
                        }
                        if (msgLower.contains("solde insuffisant") || msgLower.contains("insufficient")) {
                            return new InsufficientBalanceException(extractId(msg), msg);
                        }

                        String exName = ejbException.getClass().getSimpleName();
                        if (exName.contains("FwkRollback") || exName.contains("Business")) {
                            return new BusinessRuleException(msg);
                        }

                        return new BusinessRuleException("Erreur lors de l'appel a " + useCaseName + " : " + msg);
                    }

                    private String extractId(String msg) {
                        int idx = msg.lastIndexOf(':');
                        return idx >= 0 ? msg.substring(idx + 1).trim() : msg;
                    }
                }
                """.formatted(PKG_INFRA_EJB_EXCEPTION, PKG_DOMAIN_EXCEPTION);

        Files.writeString(file, code);
        log.info("[ACL] EjbExceptionTranslator genere");
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : Types EJB isoles
    // =====================================================================

    private void relocateEjbTypes(Path srcMain, UseCaseEndpoint ep, ProjectAnalysisResult analysis) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_EJB_TYPES);

        // Recopier les DTOs EJB dans infrastructure/ejb/types/ avec le bon package
        if (ep.ejbInputDto != null) {
            rewriteDtoToEjbTypes(dir, ep.ejbInputDto);
        }
        if (ep.ejbOutputDto != null) {
            rewriteDtoToEjbTypes(dir, ep.ejbOutputDto);
        }
    }

    private void rewriteDtoToEjbTypes(Path dir, DtoInfo dto) throws IOException {
        Path file = dir.resolve(dto.getClassName() + ".java");
        if (Files.exists(file)) return;

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_EJB_TYPES).append(";\n\n");

        // Classe simple avec les champs
        sb.append("/**\n");
        sb.append(" * Type EJB isole (recopie depuis le projet EJB source).\n");
        sb.append(" * NE PAS utiliser en dehors de la couche infrastructure.\n");
        sb.append(" */\n");
        sb.append("public class ").append(dto.getClassName()).append(" {\n\n");

        for (DtoInfo.FieldInfo field : dto.getFields()) {
            if (field.isSerializationField()) continue;
            sb.append("    private ").append(cleanType(field.getType())).append(" ").append(field.getName()).append(";\n");
        }
        sb.append("\n");

        sb.append("    public ").append(dto.getClassName()).append("() {}\n\n");

        for (DtoInfo.FieldInfo field : dto.getFields()) {
            if (field.isSerializationField()) continue;
            String cap = capitalize(field.getName());
            String type = cleanType(field.getType());
            sb.append("    public ").append(type).append(" get").append(cap).append("() { return ").append(field.getName()).append("; }\n");
            sb.append("    public void set").append(cap).append("(").append(type).append(" v) { this.").append(field.getName()).append(" = v; }\n\n");
        }

        sb.append("}\n");
        Files.writeString(file, sb.toString());
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : JNDI Adapter
    // =====================================================================

    private void generateJndiAdapter(Path srcMain, ServiceDomainGroup group) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_EJB_ADAPTER);
        String adapterName = group.serviceInterfaceName + "JndiAdapter";
        Path file = dir.resolve(adapterName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_EJB_ADAPTER).append(";\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        for (UseCaseEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
            if (ep.ejbInputDtoName != null) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbInputDtoName + ";");
            if (ep.ejbOutputDtoName != null) imports.add("import " + PKG_INFRA_EJB_TYPES + "." + ep.ejbOutputDtoName + ";");
            imports.add("import " + PKG_INFRA_EJB_MAPPER + "." + ep.mapperClassName + ";");
        }
        imports.add("import " + PKG_DOMAIN_EXCEPTION + ".ServiceUnavailableException;");
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + group.serviceInterfaceName + ";");
        imports.add("import " + PKG_INFRA_EJB_EXCEPTION + ".EjbExceptionTranslator;");
        imports.add("import org.slf4j.Logger;");
        imports.add("import org.slf4j.LoggerFactory;");
        imports.add("import org.springframework.beans.factory.annotation.Value;");
        imports.add("import org.springframework.context.annotation.Profile;");
        imports.add("import org.springframework.stereotype.Service;");
        imports.add("import javax.naming.*;");
        imports.add("import java.util.Properties;");

        for (String imp : imports) {
            sb.append(imp).append("\n");
        }
        sb.append("\n");

        sb.append("/**\n");
        sb.append(" * Implementation JNDI du service ").append(group.serviceInterfaceName).append(".\n");
        sb.append(" * Active uniquement avec le profil \"jndi\" (production EJB).\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        sb.append("@Profile(\"jndi\")\n");
        sb.append("public class ").append(adapterName).append(" implements ").append(group.serviceInterfaceName).append(" {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(adapterName).append(".class);\n\n");
        sb.append("    @Value(\"${ejb.jndi.provider.url}\") private String jndiProviderUrl;\n");
        sb.append("    @Value(\"${ejb.jndi.factory}\") private String jndiFactory;\n\n");

        // Injecter les mappers et l'exception translator
        for (UseCaseEndpoint ep : group.endpoints) {
            String mapperField = toLowerCamel(ep.mapperClassName);
            sb.append("    private final ").append(ep.mapperClassName).append(" ").append(mapperField).append(";\n");
        }
        sb.append("    private final EjbExceptionTranslator exceptionTranslator;\n\n");

        // Constructeur
        sb.append("    public ").append(adapterName).append("(\n");
        List<String> ctorParams = new ArrayList<>();
        for (UseCaseEndpoint ep : group.endpoints) {
            ctorParams.add("            " + ep.mapperClassName + " " + toLowerCamel(ep.mapperClassName));
        }
        ctorParams.add("            EjbExceptionTranslator exceptionTranslator");
        sb.append(String.join(",\n", ctorParams)).append(") {\n");
        for (UseCaseEndpoint ep : group.endpoints) {
            String mapperField = toLowerCamel(ep.mapperClassName);
            sb.append("        this.").append(mapperField).append(" = ").append(mapperField).append(";\n");
        }
        sb.append("        this.exceptionTranslator = exceptionTranslator;\n");
        sb.append("    }\n\n");

        // Methodes
        for (UseCaseEndpoint ep : group.endpoints) {
            String returnType = ep.responseDtoName != null ? ep.responseDtoName : "void";
            String paramType = ep.requestDtoName != null ? ep.requestDtoName + " request" : "";
            String mapperField = toLowerCamel(ep.mapperClassName);
            String ucName = ep.useCase.getClassName();
            String jndiName = ep.useCase.getJndiName() != null ? ep.useCase.getJndiName() :
                    "java:global/bank/" + ucName;

            sb.append("    @Override\n");
            sb.append("    public ").append(returnType).append(" ").append(ep.methodName).append("(").append(paramType).append(") {\n");
            sb.append("        log.info(\"[EJB-CALL] ").append(ucName).append(".").append(ep.methodName).append("()\");\n\n");

            // Mapper RestDTO → VoIn
            if (ep.ejbInputDtoName != null && ep.requestDtoName != null) {
                sb.append("        ").append(ep.ejbInputDtoName).append(" voIn = ").append(mapperField).append(".toEjb(request);\n\n");
            }

            sb.append("        InitialContext ctx = null;\n");
            sb.append("        try {\n");
            sb.append("            ctx = createContext();\n");
            sb.append("            log.debug(\"[EJB-LOOKUP] ").append(jndiName).append("\");\n");
            sb.append("            Object ejb = ctx.lookup(\"").append(jndiName).append("\");\n\n");

            sb.append("            long start = System.currentTimeMillis();\n");

            // Appel EJB via reflection
            if (ep.sourceMethod != null) {
                // Multi-method
                String methodName = ep.sourceMethod.getName();
                if (ep.ejbInputDtoName != null) {
                    sb.append("            java.lang.reflect.Method m = ejb.getClass().getMethod(\"").append(methodName).append("\", ").append(ep.ejbInputDtoName).append(".class);\n");
                    sb.append("            Object result = m.invoke(ejb, voIn);\n");
                } else {
                    sb.append("            java.lang.reflect.Method m = ejb.getClass().getMethod(\"").append(methodName).append("\");\n");
                    sb.append("            Object result = m.invoke(ejb);\n");
                }
            } else {
                // BaseUseCase : execute(voIn)
                if (ep.ejbInputDtoName != null) {
                    sb.append("            java.lang.reflect.Method m = ejb.getClass().getMethod(\"execute\", Object.class);\n");
                    sb.append("            Object result = m.invoke(ejb, voIn);\n");
                } else {
                    sb.append("            java.lang.reflect.Method m = ejb.getClass().getMethod(\"execute\");\n");
                    sb.append("            Object result = m.invoke(ejb);\n");
                }
            }

            sb.append("            log.info(\"[EJB-EXECUTE] termine en {}ms\", System.currentTimeMillis() - start);\n\n");

            // Mapper VoOut → RestDTO
            if (ep.ejbOutputDtoName != null && ep.responseDtoName != null) {
                sb.append("            ").append(ep.ejbOutputDtoName).append(" voOut = (").append(ep.ejbOutputDtoName).append(") result;\n");
                sb.append("            return ").append(mapperField).append(".toRest(voOut);\n\n");
            } else {
                sb.append("            return ").append(ep.responseDtoName).append(".success(\"Operation reussie\");\n\n");
            }

            sb.append("        } catch (javax.naming.NamingException e) {\n");
            sb.append("            log.error(\"[EJB-ERROR] JNDI : {}\", e.getMessage());\n");
            sb.append("            throw new ServiceUnavailableException(\"").append(ucName).append("\");\n");
            sb.append("        } catch (Exception e) {\n");
            sb.append("            log.error(\"[EJB-ERROR] Metier : {}\", e.getMessage());\n");
            sb.append("            Throwable cause = e.getCause() != null ? e.getCause() : e;\n");
            sb.append("            throw exceptionTranslator.translate((Exception) cause, \"").append(ucName).append("\");\n");
            sb.append("        } finally {\n");
            sb.append("            closeContext(ctx);\n");
            sb.append("        }\n");
            sb.append("    }\n\n");
        }

        // Methodes utilitaires JNDI
        sb.append("    private InitialContext createContext() throws NamingException {\n");
        sb.append("        Properties props = new Properties();\n");
        sb.append("        props.put(Context.INITIAL_CONTEXT_FACTORY, jndiFactory);\n");
        sb.append("        props.put(Context.PROVIDER_URL, jndiProviderUrl);\n");
        sb.append("        return new InitialContext(props);\n");
        sb.append("    }\n\n");

        sb.append("    private void closeContext(InitialContext ctx) {\n");
        sb.append("        if (ctx != null) {\n");
        sb.append("            try { ctx.close(); log.debug(\"[EJB-CLEANUP] Contexte ferme\"); }\n");
        sb.append("            catch (NamingException e) { log.warn(\"[EJB-CLEANUP] Erreur\", e); }\n");
        sb.append("        }\n");
        sb.append("    }\n");

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] JNDI Adapter genere : {}", adapterName);
    }

    // =====================================================================
    // COUCHE INFRASTRUCTURE : Mock Adapter
    // =====================================================================

    private void generateMockAdapter(Path srcMain, ServiceDomainGroup group) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_INFRA_MOCK);
        String adapterName = group.serviceInterfaceName + "MockAdapter";
        Path file = dir.resolve(adapterName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_INFRA_MOCK).append(";\n\n");

        Set<String> imports = new TreeSet<>();
        for (UseCaseEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
        }
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + group.serviceInterfaceName + ";");
        imports.add("import org.springframework.context.annotation.Profile;");
        imports.add("import org.springframework.stereotype.Service;");
        imports.add("import java.time.LocalDateTime;");

        for (String imp : imports) {
            sb.append(imp).append("\n");
        }
        sb.append("\n");

        sb.append("/**\n");
        sb.append(" * Implementation Mock du service ").append(group.serviceInterfaceName).append(".\n");
        sb.append(" * Active uniquement avec le profil \"mock\" (tests/demo).\n");
        sb.append(" * AUCUN import EJB — le mock ne connait que les types du wrapper.\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        sb.append("@Profile(\"mock\")\n");
        sb.append("public class ").append(adapterName).append(" implements ").append(group.serviceInterfaceName).append(" {\n\n");

        for (UseCaseEndpoint ep : group.endpoints) {
            String returnType = ep.responseDtoName != null ? ep.responseDtoName : "void";
            String paramType = ep.requestDtoName != null ? ep.requestDtoName + " request" : "";

            sb.append("    @Override\n");
            sb.append("    public ").append(returnType).append(" ").append(ep.methodName).append("(").append(paramType).append(") {\n");

            if (ep.responseDtoName != null) {
                sb.append("        ").append(ep.responseDtoName).append(" response = new ").append(ep.responseDtoName).append("();\n");

                // Remplir les champs de la reponse avec des valeurs mock
                List<RestField> fields = deriveRestFields(ep.ejbOutputDto, false);
                for (RestField f : fields) {
                    String cap = capitalize(f.name);
                    if ("String".equals(f.type)) {
                        sb.append("        response.set").append(cap).append("(\"mock-").append(f.name).append("\");\n");
                    }
                }
                sb.append("        response.setMessage(\"[MOCK] Operation ").append(ep.methodName).append(" reussie\");\n");
                sb.append("        return response;\n");
            }

            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] Mock Adapter genere : {}", adapterName);
    }

    // =====================================================================
    // COUCHE API : Controller BIAN (decouple)
    // =====================================================================

    private void generateAclBianController(Path srcMain, ServiceDomainGroup group) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_API_CONTROLLER);
        // serviceDomainName peut déjà contenir "Controller" (ex: PartyController)
        String controllerName = group.serviceDomainName.endsWith("Controller")
                ? group.serviceDomainName
                : group.serviceDomainName + "Controller";
        Path file = dir.resolve(controllerName + ".java");

        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(PKG_API_CONTROLLER).append(";\n\n");

        Set<String> imports = new TreeSet<>();
        for (UseCaseEndpoint ep : group.endpoints) {
            if (ep.requestDtoName != null) imports.add("import " + PKG_API_DTO_REQUEST + "." + ep.requestDtoName + ";");
            if (ep.responseDtoName != null) imports.add("import " + PKG_API_DTO_RESPONSE + "." + ep.responseDtoName + ";");
        }
        imports.add("import " + PKG_DOMAIN_SERVICE + "." + group.serviceInterfaceName + ";");
        imports.add("import io.swagger.v3.oas.annotations.Operation;");
        imports.add("import io.swagger.v3.oas.annotations.Parameter;");
        imports.add("import io.swagger.v3.oas.annotations.tags.Tag;");
        imports.add("import jakarta.validation.Valid;");
        imports.add("import org.slf4j.Logger;");
        imports.add("import org.slf4j.LoggerFactory;");
        imports.add("import org.springframework.http.ResponseEntity;");
        imports.add("import org.springframework.web.bind.annotation.*;");

        for (String imp : imports) {
            sb.append(imp).append("\n");
        }
        sb.append("\n");

        // AUCUN import EJB
        sb.append("// AUCUN import de VoIn, VoOut, BaseUseCase, ValueObject, FwkRollbackException\n");
        sb.append("// Le controller ne sait pas que des EJBs existent derriere\n\n");

        String sdTag = humanize(group.serviceDomainName);
        String basePath = "/api/v1/" + toKebabCase(group.serviceDomainName);

        sb.append("@RestController\n");
        sb.append("@RequestMapping(\"").append(basePath).append("\")\n");
        sb.append("@Tag(name = \"").append(sdTag).append("\", description = \"BIAN — ").append(sdTag).append("\")\n");
        sb.append("public class ").append(controllerName).append(" {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(").append(controllerName).append(".class);\n");
        String serviceField = toLowerCamel(group.serviceInterfaceName);
        sb.append("    private final ").append(group.serviceInterfaceName).append(" ").append(serviceField).append(";\n\n");

        sb.append("    public ").append(controllerName).append("(").append(group.serviceInterfaceName).append(" ").append(serviceField).append(") {\n");
        sb.append("        this.").append(serviceField).append(" = ").append(serviceField).append(";\n");
        sb.append("    }\n\n");

        for (UseCaseEndpoint ep : group.endpoints) {
            String operationId = "execute" + group.serviceDomainName + capitalize(ep.methodName);
            String summary = humanize(ep.methodName);
            String path = ep.bianPath != null ? ep.bianPath : "/{cr-reference-id}/" + toKebabCase(ep.methodName) + "/execution";

            sb.append("    @Operation(operationId = \"").append(operationId).append("\",\n");
            sb.append("               summary = \"").append(summary).append("\")\n");
            sb.append("    @PostMapping(\"").append(path).append("\")\n");

            String returnType = ep.responseDtoName != null ? ep.responseDtoName : "Void";
            sb.append("    public ResponseEntity<").append(returnType).append("> ").append(ep.methodName).append("(\n");
            sb.append("            @Parameter(description = \"Control Record Reference ID\")\n");
            sb.append("            @PathVariable(\"cr-reference-id\") String crReferenceId");

            if (ep.requestDtoName != null) {
                sb.append(",\n            @Valid @RequestBody ").append(ep.requestDtoName).append(" request");
            }
            sb.append(") {\n\n");

            sb.append("        log.info(\"[REST-IN] POST ").append(basePath).append("/{}/").append(toKebabCase(ep.methodName)).append("/execution\", crReferenceId);\n\n");

            if (ep.responseDtoName != null) {
                String callParam = ep.requestDtoName != null ? "request" : "";
                sb.append("        ").append(ep.responseDtoName).append(" response = ").append(serviceField).append(".").append(ep.methodName).append("(").append(callParam).append(");\n\n");
                sb.append("        log.info(\"[REST-OUT] 200 OK\");\n");
                sb.append("        return ResponseEntity.ok(response);\n");
            } else {
                sb.append("        ").append(serviceField).append(".").append(ep.methodName).append("();\n");
                sb.append("        log.info(\"[REST-OUT] 200 OK\");\n");
                sb.append("        return ResponseEntity.ok().build();\n");
            }

            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Files.writeString(file, sb.toString());
        log.info("[ACL] Controller BIAN genere : {}", controllerName);
    }

    // =====================================================================
    // CONFIG : GlobalExceptionHandler simplifie
    // =====================================================================

    private void generateAclGlobalExceptionHandler(Path srcMain) throws IOException {
        Path dir = resolvePackagePath(srcMain, PKG_CONFIG);
        Path file = dir.resolve("GlobalExceptionHandler.java");

        String code = """
                package %s;

                import %s.ApiException;
                import org.springframework.http.HttpStatus;
                import org.springframework.http.ResponseEntity;
                import org.springframework.web.bind.MethodArgumentNotValidException;
                import org.springframework.web.bind.annotation.ControllerAdvice;
                import org.springframework.web.bind.annotation.ExceptionHandler;

                import java.time.LocalDateTime;
                import java.util.LinkedHashMap;
                import java.util.Map;
                import java.util.stream.Collectors;

                @ControllerAdvice
                public class GlobalExceptionHandler {

                    @ExceptionHandler(ApiException.class)
                    public ResponseEntity<Map<String, Object>> handleApiException(ApiException ex) {
                        Map<String, Object> body = new LinkedHashMap<>();
                        body.put("timestamp", LocalDateTime.now().toString());
                        body.put("status", ex.getHttpStatus());
                        body.put("code", ex.getCode());
                        body.put("message", ex.getMessage());
                        return new ResponseEntity<>(body, HttpStatus.valueOf(ex.getHttpStatus()));
                    }

                    @ExceptionHandler(MethodArgumentNotValidException.class)
                    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
                        String errors = ex.getBindingResult().getFieldErrors().stream()
                            .map(e -> e.getField() + ": " + e.getDefaultMessage())
                            .collect(Collectors.joining(", "));
                        Map<String, Object> body = new LinkedHashMap<>();
                        body.put("timestamp", LocalDateTime.now().toString());
                        body.put("status", 400);
                        body.put("code", "VALIDATION_ERROR");
                        body.put("message", errors);
                        return new ResponseEntity<>(body, HttpStatus.BAD_REQUEST);
                    }

                    @ExceptionHandler(Exception.class)
                    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
                        Map<String, Object> body = new LinkedHashMap<>();
                        body.put("timestamp", LocalDateTime.now().toString());
                        body.put("status", 500);
                        body.put("code", "INTERNAL_ERROR");
                        body.put("message", "Erreur interne du serveur");
                        return new ResponseEntity<>(body, HttpStatus.INTERNAL_SERVER_ERROR);
                    }
                }
                """.formatted(PKG_CONFIG, PKG_DOMAIN_EXCEPTION);

        Files.writeString(file, code);
        log.info("[ACL] GlobalExceptionHandler simplifie genere");
    }

    // =====================================================================
    // CONFIG : Profils Spring
    // =====================================================================

    private void generateSpringProfiles(Path srcMain) throws IOException {
        // srcMain = .../src/main/java/com/bank/api → 3 parents = src/main/java → 1 parent = src/main
        Path resourcesDir = srcMain.getParent().getParent().getParent().getParent().resolve("resources");
        Files.createDirectories(resourcesDir);

        // application-jndi.properties
        Files.writeString(resourcesDir.resolve("application-jndi.properties"), """
                # Profil JNDI (production EJB)
                ejb.jndi.factory=org.jboss.naming.remote.client.InitialContextFactory
                ejb.jndi.provider.url=remote+http://serveur-ejb:8080
                """);

        // application-mock.properties
        Files.writeString(resourcesDir.resolve("application-mock.properties"), """
                # Profil Mock (tests/demo)
                # Pas de configuration JNDI necessaire
                """);

        // application-http.properties
        Files.writeString(resourcesDir.resolve("application-http.properties"), """
                # Profil HTTP (futur microservices)
                # carte-service.url=http://carte-service:8080
                # compte-service.url=http://compte-service:8080
                """);

        log.info("[ACL] Profils Spring generes (jndi, mock, http)");
    }

    // =====================================================================
    // METHODES UTILITAIRES
    // =====================================================================

    private DtoInfo findDto(ProjectAnalysisResult analysis, String className) {
        if (className == null) return null;
        return analysis.getDtos().stream()
                .filter(d -> d.getClassName().equals(className))
                .findFirst().orElse(null);
    }

    /**
     * Derive le nom du RestDTO a partir du nom du VoIn/VoOut EJB.
     */
    private String deriveRestDtoName(String ejbDtoName, String suffix) {
        if (ejbDtoName == null) return null;

        // Retirer VoIn/VoOut
        String base = ejbDtoName.replaceAll("(VoIn|VoOut|Vo)$", "");
        // Retirer UC
        base = base.replaceAll("(UC|UseCase)$", "");

        // Convertir le verbe en nom d'action
        base = deriveActionName(base);

        return base + suffix;
    }

    private String deriveActionName(String name) {
        for (Map.Entry<String, String> entry : VERB_TO_NOUN.entrySet()) {
            if (name.startsWith(entry.getKey())) {
                return entry.getValue() + name.substring(entry.getKey().length());
            }
        }
        return name;
    }

    private String deriveServiceInterfaceName(String serviceDomainName) {
        // CardManagement → CarteService, Party → PartyService, etc.
        // Garder simple : ServiceDomainName + "Service"
        return serviceDomainName.replaceAll("Management$", "") + "Service";
    }

    /**
     * Derive les champs REST a partir d'un DTO EJB.
     */
    private List<RestField> deriveRestFields(DtoInfo ejbDto, boolean isRequest) {
        List<RestField> fields = new ArrayList<>();
        if (ejbDto == null) {
            // Generer un champ generique
            if (isRequest) {
                fields.add(new RestField("identifiant", "String", true));
            }
            return fields;
        }

        for (DtoInfo.FieldInfo field : ejbDto.getFields()) {
            if (field.isSerializationField() || field.isStatic()) continue;
            if (LEGACY_FIELDS.contains(field.getName())) continue;
            if (isFrameworkType(field.getType())) continue;

            String restName = renameField(field.getName());
            String restType = cleanType(field.getType());
            boolean required = field.isRequired() && isRequest;

            fields.add(new RestField(restName, restType, required));
        }

        return fields;
    }

    private String renameField(String ejbFieldName) {
        return FIELD_RENAME.getOrDefault(ejbFieldName, ejbFieldName);
    }

    private String cleanType(String type) {
        if (type == null) return "String";
        if (isFrameworkType(type)) return "Object";
        // Nettoyer les types generiques
        return type.replace("java.lang.", "").replace("java.util.", "");
    }

    private boolean isFrameworkType(String type) {
        if (type == null) return false;
        return FRAMEWORK_TYPES.contains(type) || type.startsWith("ma.eai.") || type.contains("Envelope");
    }

    private boolean isPrimitiveOrString(String type) {
        return type != null && (type.equals("String") || type.equals("int") || type.equals("long")
                || type.equals("boolean") || type.equals("double") || type.equals("float")
                || type.equals("Integer") || type.equals("Long") || type.equals("Boolean")
                || type.equals("Double") || type.equals("BigDecimal") || type.equals("void"));
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    private String toLowerCamel(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toLowerCase() + s.substring(1);
    }

    private String toKebabCase(String camelCase) {
        if (camelCase == null) return "";
        return camelCase.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
    }

    private String humanize(String camelCase) {
        if (camelCase == null) return "";
        return camelCase.replaceAll("([a-z])([A-Z])", "$1 $2");
    }

    /**
     * Represente un champ dans un RestDTO.
     */
    private static class RestField {
        String name;
        String type;
        boolean required;

        RestField(String name, String type, boolean required) {
            this.name = name;
            this.type = type;
            this.required = required;
        }
    }
}
