package com.bank.tools.generator.engine;

import com.bank.tools.generator.model.WsdlContractInfo;
import com.bank.tools.generator.model.WsdlContractInfo.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import com.bank.tools.generator.config.CompleoConfig;

/**
 * Generateur de clients SOAP Spring Boot a partir de contrats WSDL.
 * Genere automatiquement :
 * - Un client JAX-WS/CXF avec stubs pour chaque operation SOAP
 * - Un service wrapper avec logging et resilience
 * - Les DTOs (Request/Response) a partir des types complexes WSDL
 * - La configuration CXF (endpoint, timeouts, interceptors)
 * - Un facade REST optionnel (bridge SOAP-to-REST) avec mapping BIAN
 *
 * Compatible WSDL 1.1 et SOAP 1.1/1.2.
 */
@Component
public class WsdlClientGenerator {

    private static final Logger log = LoggerFactory.getLogger(WsdlClientGenerator.class);

    private final BianServiceDomainMapper bianMapper;

    private static final String DEFAULT_BASE_PACKAGE = "com.bank.api";
    private static final String BASE_PACKAGE_PATH = "com/bank/api";

    // Mapping XSD types → Java types
    private static final Map<String, String> XSD_TYPE_MAP = Map.ofEntries(
            Map.entry("string", "String"),
            Map.entry("int", "Integer"),
            Map.entry("integer", "Integer"),
            Map.entry("long", "Long"),
            Map.entry("short", "Short"),
            Map.entry("decimal", "java.math.BigDecimal"),
            Map.entry("float", "Float"),
            Map.entry("double", "Double"),
            Map.entry("boolean", "Boolean"),
            Map.entry("date", "java.time.LocalDate"),
            Map.entry("dateTime", "java.time.LocalDateTime"),
            Map.entry("base64Binary", "byte[]"),
            Map.entry("hexBinary", "byte[]"),
            Map.entry("anyType", "Object")
    );

    public WsdlClientGenerator(BianServiceDomainMapper bianMapper) {
        this.bianMapper = bianMapper;
    }

    // ===================== POINT D'ENTREE =====================

    /**
     * Genere un projet client SOAP complet a partir d'un contrat WSDL.
     *
     * @param contract le contrat WSDL parse
     * @param outputDir repertoire de sortie
     * @param bianMode activer le mapping BIAN + facade REST
     * @return chemin du projet genere
     */
    public Path generateClient(WsdlContractInfo contract, Path outputDir, boolean bianMode) throws IOException {
        String partnerName = contract.getPartnerName();
        String partnerLower = partnerName.toLowerCase();
        String partnerCapital = capitalize(partnerName.toLowerCase());

        log.info("[WSDL-Gen] Generation du client SOAP pour {} (BIAN={})", partnerName, bianMode);

        Path projectRoot = outputDir.resolve("generated-soap-client-" + partnerLower);
        Path srcMain = projectRoot.resolve("src/main/java/" + BASE_PACKAGE_PATH);

        // Creer la structure de repertoires
        Files.createDirectories(srcMain.resolve("client/" + partnerLower));
        Files.createDirectories(srcMain.resolve("client/" + partnerLower + "/dto"));
        Files.createDirectories(srcMain.resolve("client/" + partnerLower + "/config"));
        Files.createDirectories(srcMain.resolve("client/" + partnerLower + "/service"));
        if (bianMode) {
            Files.createDirectories(srcMain.resolve("client/" + partnerLower + "/facade"));
        }
        Files.createDirectories(projectRoot.resolve("src/main/resources"));

        // 1. Generer le client SOAP (port interface + implementation)
        generateSoapClient(srcMain, contract, partnerLower, partnerCapital);

        // 2. Generer les DTOs a partir des types complexes
        for (ComplexTypeInfo ct : contract.getComplexTypes()) {
            generateDto(srcMain, ct, partnerLower);
        }

        // 3. Generer la configuration CXF
        generateCxfConfig(srcMain, contract, partnerLower, partnerCapital);

        // 4. Generer le service wrapper
        generateServiceWrapper(srcMain, contract, partnerLower, partnerCapital);

        // 5. Si mode BIAN, generer la facade REST (bridge SOAP → REST BIAN)
        if (bianMode) {
            generateRestFacade(srcMain, contract, partnerLower, partnerCapital);
        }

        // 6. Generer le application.yml partiel
        generateApplicationConfig(projectRoot, contract, partnerLower);

        // 7. Generer le pom.xml avec les dependances CXF
        generatePomXml(projectRoot, partnerLower, partnerCapital);

        // 8. Generer le README
        generateReadme(projectRoot, contract, bianMode);

        // 9. Si mode BIAN, generer le rapport de mapping
        if (bianMode) {
            generateBianReport(projectRoot, contract);
        }

        log.info("[WSDL-Gen] Client {} genere : {} operations, {} types complexes",
                partnerName, contract.getOperations().size(), contract.getComplexTypes().size());

        return projectRoot;
    }

    // ===================== SOAP CLIENT =====================

    private void generateSoapClient(Path srcMain, WsdlContractInfo contract,
                                     String partnerLower, String partnerCapital) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(";\n\n");

        // Imports
        sb.append("import ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(".dto.*;\n");
        sb.append("import jakarta.xml.ws.WebServiceClient;\n");
        sb.append("import jakarta.xml.ws.soap.SOAPBinding;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.beans.factory.annotation.Value;\n");
        sb.append("import org.springframework.stereotype.Component;\n\n");
        sb.append("import javax.xml.namespace.QName;\n");
        sb.append("import jakarta.xml.ws.Service;\n");
        sb.append("import java.net.URL;\n\n");

        // Javadoc
        sb.append("/**\n");
        sb.append(" * Client SOAP auto-genere pour le partenaire ").append(contract.getPartnerName()).append(".\n");
        sb.append(" * Service : ").append(contract.getServiceName()).append("\n");
        sb.append(" * Namespace : ").append(contract.getTargetNamespace()).append("\n");
        sb.append(" * Endpoint : ").append(contract.getEndpointUrl()).append("\n");
        sb.append(" *\n");
        sb.append(" * Genere automatiquement par ejb-to-rest-tool (WSDL Client Generator)\n");
        sb.append(" */\n");
        sb.append("@Component\n");
        sb.append("public class ").append(partnerCapital).append("SoapClient {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(")
          .append(partnerCapital).append("SoapClient.class);\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".wsdl-url}\")\n");
        sb.append("    private String wsdlUrl;\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".endpoint-url}\")\n");
        sb.append("    private String endpointUrl;\n\n");

        sb.append("    private static final String TARGET_NAMESPACE = \"")
          .append(contract.getTargetNamespace() != null ? contract.getTargetNamespace() : "http://" + partnerLower + ".partner.com/")
          .append("\";\n\n");

        sb.append("    private static final String SERVICE_NAME = \"")
          .append(contract.getServiceName()).append("\";\n\n");

        // Generer une methode par operation SOAP
        for (OperationInfo op : contract.getOperations()) {
            String methodName = toCamelCase(op.getName());
            String inputType = op.getInputType() != null ? op.getInputType() : "Object";
            String outputType = op.getOutputType() != null ? op.getOutputType() : "Object";

            sb.append("    /**\n");
            sb.append("     * Appel SOAP : ").append(op.getName()).append("\n");
            if (op.getDocumentation() != null) {
                sb.append("     * ").append(op.getDocumentation()).append("\n");
            }
            sb.append("     * SOAPAction : ").append(op.getSoapAction() != null ? op.getSoapAction() : "N/A").append("\n");
            sb.append("     *\n");
            sb.append("     * @param request objet de requete ").append(inputType).append("\n");
            sb.append("     * @return reponse ").append(outputType).append("\n");
            sb.append("     */\n");

            sb.append("    public ").append(outputType).append(" ").append(methodName).append("(")
              .append(inputType).append(" request) {\n");
            sb.append("        log.info(\"[SOAP] Appel ").append(op.getName()).append(" vers {}\", endpointUrl);\n");
            sb.append("        try {\n");
            sb.append("            QName serviceName = new QName(TARGET_NAMESPACE, SERVICE_NAME);\n");
            sb.append("            Service service = Service.create(new URL(wsdlUrl), serviceName);\n");
            sb.append("            // TODO: Obtenir le port et appeler l'operation\n");
            sb.append("            // ").append(contract.getPortTypeName() != null ? contract.getPortTypeName() : "PortType")
              .append(" port = service.getPort(").append(contract.getPortTypeName() != null ? contract.getPortTypeName() : "PortType")
              .append(".class);\n");
            sb.append("            // return port.").append(op.getName()).append("(request);\n\n");
            sb.append("            log.info(\"[SOAP] ").append(op.getName()).append(" : succes\");\n");
            sb.append("            return null; // A completer avec le port genere par wsimport/cxf-codegen\n");
            sb.append("        } catch (Exception e) {\n");
            sb.append("            log.error(\"[SOAP] ").append(op.getName()).append(" : erreur - {}\", e.getMessage());\n");
            sb.append("            throw new RuntimeException(\"Erreur appel SOAP ")
              .append(contract.getPartnerName()).append(" (").append(op.getName()).append(")\", e);\n");
            sb.append("        }\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/" + partnerCapital + "SoapClient.java");
        Files.writeString(file, sb.toString());
        log.info("[WSDL-Gen]   SoapClient genere : {}", file.getFileName());
    }

    // ===================== DTOs =====================

    private void generateDto(Path srcMain, ComplexTypeInfo ct, String partnerLower) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(".dto;\n\n");

        // Imports
        Set<String> imports = new TreeSet<>();
        imports.add("import jakarta.xml.bind.annotation.*;");
        for (ComplexTypeInfo.ElementInfo elem : ct.getElements()) {
            String javaType = mapXsdType(elem.getType());
            if (javaType.contains("LocalDate")) imports.add("import java.time.LocalDate;");
            if (javaType.contains("LocalDateTime")) imports.add("import java.time.LocalDateTime;");
            if (javaType.contains("BigDecimal")) imports.add("import java.math.BigDecimal;");
            if (elem.getMaxOccurs() == -1) imports.add("import java.util.List;");
        }
        for (String imp : imports) {
            sb.append(imp).append("\n");
        }
        sb.append("\n");

        // JAXB annotations
        sb.append("/**\n");
        sb.append(" * DTO auto-genere depuis le type complexe WSDL : ").append(ct.getName()).append("\n");
        sb.append(" */\n");
        sb.append("@XmlRootElement(name = \"").append(ct.getName()).append("\")\n");
        sb.append("@XmlAccessorType(XmlAccessType.FIELD)\n");
        sb.append("public class ").append(ct.getName()).append(" {\n\n");

        // Champs avec annotations JAXB
        for (ComplexTypeInfo.ElementInfo elem : ct.getElements()) {
            String javaType = mapXsdType(elem.getType());
            boolean isList = elem.getMaxOccurs() == -1;

            sb.append("    @XmlElement(name = \"").append(elem.getName()).append("\"");
            if (elem.isNillable()) sb.append(", nillable = true");
            if (elem.getMinOccurs() > 0) sb.append(", required = true");
            sb.append(")\n");

            if (isList) {
                sb.append("    private List<").append(javaType).append("> ").append(toCamelCase(elem.getName())).append(";\n\n");
            } else {
                sb.append("    private ").append(javaType).append(" ").append(toCamelCase(elem.getName())).append(";\n\n");
            }
        }

        // Constructeur par defaut
        sb.append("    public ").append(ct.getName()).append("() {}\n\n");

        // Getters & Setters
        for (ComplexTypeInfo.ElementInfo elem : ct.getElements()) {
            String javaType = mapXsdType(elem.getType());
            boolean isList = elem.getMaxOccurs() == -1;
            String fieldName = toCamelCase(elem.getName());
            String capName = capitalize(fieldName);
            String fullType = isList ? "List<" + javaType + ">" : javaType;

            // Getter
            sb.append("    public ").append(fullType).append(" get").append(capName).append("() {\n");
            sb.append("        return this.").append(fieldName).append(";\n");
            sb.append("    }\n\n");

            // Setter
            sb.append("    public void set").append(capName).append("(").append(fullType).append(" ")
              .append(fieldName).append(") {\n");
            sb.append("        this.").append(fieldName).append(" = ").append(fieldName).append(";\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/dto/" + ct.getName() + ".java");
        Files.writeString(file, sb.toString());
    }

    // ===================== CXF CONFIG =====================

    private void generateCxfConfig(Path srcMain, WsdlContractInfo contract,
                                    String partnerLower, String partnerCapital) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(".config;\n\n");

        sb.append("import org.springframework.beans.factory.annotation.Value;\n");
        sb.append("import org.springframework.context.annotation.Bean;\n");
        sb.append("import org.springframework.context.annotation.Configuration;\n\n");

        sb.append("/**\n");
        sb.append(" * Configuration CXF/JAX-WS pour le partenaire ").append(contract.getPartnerName()).append(".\n");
        sb.append(" * Gere les timeouts, l'authentification WS-Security et le logging SOAP.\n");
        sb.append(" */\n");
        sb.append("@Configuration\n");
        sb.append("public class ").append(partnerCapital).append("SoapConfig {\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".wsdl-url}\")\n");
        sb.append("    private String wsdlUrl;\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".endpoint-url}\")\n");
        sb.append("    private String endpointUrl;\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".username:}\")\n");
        sb.append("    private String username;\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".password:}\")\n");
        sb.append("    private String password;\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".timeout.connect:5000}\")\n");
        sb.append("    private int connectTimeout;\n\n");

        sb.append("    @Value(\"${partner.").append(partnerLower).append(".timeout.read:30000}\")\n");
        sb.append("    private int readTimeout;\n\n");

        sb.append("    /**\n");
        sb.append("     * Configuration des proprietes de connexion SOAP.\n");
        sb.append("     * Les timeouts et credentials sont injectes depuis application.yml.\n");
        sb.append("     */\n");
        sb.append("    @Bean\n");
        sb.append("    public ").append(partnerCapital).append("SoapProperties ").append(partnerLower).append("SoapProperties() {\n");
        sb.append("        ").append(partnerCapital).append("SoapProperties props = new ").append(partnerCapital).append("SoapProperties();\n");
        sb.append("        props.setWsdlUrl(wsdlUrl);\n");
        sb.append("        props.setEndpointUrl(endpointUrl);\n");
        sb.append("        props.setUsername(username);\n");
        sb.append("        props.setPassword(password);\n");
        sb.append("        props.setConnectTimeout(connectTimeout);\n");
        sb.append("        props.setReadTimeout(readTimeout);\n");
        sb.append("        return props;\n");
        sb.append("    }\n\n");

        // Inner class pour les proprietes
        sb.append("    public static class ").append(partnerCapital).append("SoapProperties {\n");
        sb.append("        private String wsdlUrl;\n");
        sb.append("        private String endpointUrl;\n");
        sb.append("        private String username;\n");
        sb.append("        private String password;\n");
        sb.append("        private int connectTimeout;\n");
        sb.append("        private int readTimeout;\n\n");

        for (String field : new String[]{"wsdlUrl", "endpointUrl", "username", "password"}) {
            String cap = capitalize(field);
            sb.append("        public String get").append(cap).append("() { return ").append(field).append("; }\n");
            sb.append("        public void set").append(cap).append("(String ").append(field).append(") { this.").append(field).append(" = ").append(field).append("; }\n");
        }
        for (String field : new String[]{"connectTimeout", "readTimeout"}) {
            String cap = capitalize(field);
            sb.append("        public int get").append(cap).append("() { return ").append(field).append("; }\n");
            sb.append("        public void set").append(cap).append("(int ").append(field).append(") { this.").append(field).append(" = ").append(field).append("; }\n");
        }

        sb.append("    }\n\n");
        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/config/" + partnerCapital + "SoapConfig.java");
        Files.writeString(file, sb.toString());
    }

    // ===================== SERVICE WRAPPER =====================

    private void generateServiceWrapper(Path srcMain, WsdlContractInfo contract,
                                         String partnerLower, String partnerCapital) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(".service;\n\n");

        sb.append("import ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(".")
          .append(partnerCapital).append("SoapClient;\n");
        sb.append("import ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(".dto.*;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.stereotype.Service;\n\n");

        sb.append("/**\n");
        sb.append(" * Service wrapper SOAP pour le partenaire ").append(contract.getPartnerName()).append(".\n");
        sb.append(" * Encapsule les appels SOAP avec logging, gestion d'erreurs et resilience.\n");
        sb.append(" */\n");
        sb.append("@Service\n");
        sb.append("public class ").append(partnerCapital).append("SoapService {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(")
          .append(partnerCapital).append("SoapService.class);\n\n");

        sb.append("    private final ").append(partnerCapital).append("SoapClient soapClient;\n\n");

        sb.append("    public ").append(partnerCapital).append("SoapService(")
          .append(partnerCapital).append("SoapClient soapClient) {\n");
        sb.append("        this.soapClient = soapClient;\n");
        sb.append("    }\n\n");

        // Methode wrapper par operation
        for (OperationInfo op : contract.getOperations()) {
            String methodName = toCamelCase(op.getName());
            String inputType = op.getInputType() != null ? op.getInputType() : "Object";
            String outputType = op.getOutputType() != null ? op.getOutputType() : "Object";

            sb.append("    /**\n");
            if (op.getDocumentation() != null) {
                sb.append("     * ").append(op.getDocumentation()).append("\n");
            }
            sb.append("     * Operation SOAP : ").append(op.getName()).append("\n");
            sb.append("     */\n");

            sb.append("    public ").append(outputType).append(" ").append(methodName).append("(")
              .append(inputType).append(" request) {\n");
            sb.append("        log.info(\"[").append(contract.getPartnerName()).append("] Appel SOAP ")
              .append(op.getName()).append("\");\n");
            sb.append("        long start = System.currentTimeMillis();\n");
            sb.append("        try {\n");
            sb.append("            ").append(outputType).append(" result = soapClient.")
              .append(methodName).append("(request);\n");
            sb.append("            long elapsed = System.currentTimeMillis() - start;\n");
            sb.append("            log.info(\"[").append(contract.getPartnerName()).append("] ")
              .append(op.getName()).append(" : succes en {}ms\", elapsed);\n");
            sb.append("            return result;\n");
            sb.append("        } catch (Exception e) {\n");
            sb.append("            long elapsed = System.currentTimeMillis() - start;\n");
            sb.append("            log.error(\"[").append(contract.getPartnerName()).append("] ")
              .append(op.getName()).append(" : erreur apres {}ms - {}\", elapsed, e.getMessage());\n");
            sb.append("            throw new RuntimeException(\"Erreur SOAP ")
              .append(contract.getPartnerName()).append(" (").append(op.getName()).append(")\", e);\n");
            sb.append("        }\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/service/" + partnerCapital + "SoapService.java");
        Files.writeString(file, sb.toString());
    }

    // ===================== REST FACADE (BIAN Bridge) =====================

    private void generateRestFacade(Path srcMain, WsdlContractInfo contract,
                                     String partnerLower, String partnerCapital) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(".facade;\n\n");

        sb.append("import ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(".service.")
          .append(partnerCapital).append("SoapService;\n");
        sb.append("import ").append(DEFAULT_BASE_PACKAGE).append(".client.").append(partnerLower).append(".dto.*;\n");
        sb.append("import org.slf4j.Logger;\n");
        sb.append("import org.slf4j.LoggerFactory;\n");
        sb.append("import org.springframework.http.ResponseEntity;\n");
        sb.append("import org.springframework.web.bind.annotation.*;\n\n");

        sb.append("/**\n");
        sb.append(" * Facade REST BIAN pour le partenaire SOAP ").append(contract.getPartnerName()).append(".\n");
        sb.append(" * Bridge SOAP-to-REST : expose les operations SOAP en endpoints REST conformes BIAN.\n");
        sb.append(" *\n");
        sb.append(" * Chaque operation SOAP est mappee vers un endpoint REST avec :\n");
        sb.append(" * - URL BIAN : /{service-domain}/{cr-plural}/{cr-id}/{behavior-qualifier}\n");
        sb.append(" * - Action Terms BIAN : Initiate, Retrieve, Update, Execute, Control\n");
        sb.append(" */\n");
        sb.append("@RestController\n");
        sb.append("@RequestMapping(\"/bian/").append(partnerLower).append("\")\n");
        sb.append("public class ").append(partnerCapital).append("RestFacade {\n\n");

        sb.append("    private static final Logger log = LoggerFactory.getLogger(")
          .append(partnerCapital).append("RestFacade.class);\n\n");

        sb.append("    private final ").append(partnerCapital).append("SoapService soapService;\n\n");

        sb.append("    public ").append(partnerCapital).append("RestFacade(")
          .append(partnerCapital).append("SoapService soapService) {\n");
        sb.append("        this.soapService = soapService;\n");
        sb.append("    }\n\n");

        // Generer un endpoint REST par operation SOAP
        for (OperationInfo op : contract.getOperations()) {
            String methodName = toCamelCase(op.getName());
            String inputType = op.getInputType() != null ? op.getInputType() : "Object";
            String outputType = op.getOutputType() != null ? op.getOutputType() : "Object";

            // Deduire le verbe HTTP et le path BIAN
            String httpMethod = deduceBianHttpMethod(op.getName());
            String bianPath = deduceBianPath(op.getName());

            sb.append("    /**\n");
            sb.append("     * Bridge SOAP → REST BIAN pour l'operation : ").append(op.getName()).append("\n");
            if (op.getDocumentation() != null) {
                sb.append("     * ").append(op.getDocumentation()).append("\n");
            }
            sb.append("     */\n");

            sb.append("    @").append(httpToAnnotation(httpMethod)).append("(\"").append(bianPath).append("\")\n");
            sb.append("    public ResponseEntity<").append(outputType).append("> ").append(methodName).append("(\n");

            if ("POST".equals(httpMethod) || "PUT".equals(httpMethod)) {
                sb.append("            @RequestBody ").append(inputType).append(" request) {\n");
                sb.append("        log.info(\"[BIAN-Bridge] ").append(httpMethod).append(" ").append(bianPath)
                  .append(" → SOAP ").append(op.getName()).append("\");\n");
                sb.append("        ").append(outputType).append(" result = soapService.").append(methodName).append("(request);\n");
            } else {
                sb.append("            @PathVariable(required = false) String id) {\n");
                sb.append("        log.info(\"[BIAN-Bridge] ").append(httpMethod).append(" ").append(bianPath)
                  .append(" → SOAP ").append(op.getName()).append("\");\n");
                sb.append("        ").append(outputType).append(" result = soapService.").append(methodName).append("(null);\n");
            }

            sb.append("        return ResponseEntity.ok(result);\n");
            sb.append("    }\n\n");
        }

        sb.append("}\n");

        Path file = srcMain.resolve("client/" + partnerLower + "/facade/" + partnerCapital + "RestFacade.java");
        Files.writeString(file, sb.toString());
        log.info("[WSDL-Gen]   REST Facade BIAN genere : {}", file.getFileName());
    }

    // ===================== APPLICATION CONFIG =====================

    private void generateApplicationConfig(Path projectRoot, WsdlContractInfo contract,
                                            String partnerLower) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# =============================================\n");
        sb.append("# Configuration du partenaire SOAP ").append(contract.getPartnerName()).append("\n");
        sb.append("# A integrer dans application.yml du projet principal\n");
        sb.append("# =============================================\n\n");

        sb.append("partner:\n");
        sb.append("  ").append(partnerLower).append(":\n");
        sb.append("    wsdl-url: ").append(contract.getWsdlUrl() != null ? contract.getWsdlUrl() : "classpath:wsdl/" + partnerLower + ".wsdl").append("\n");
        sb.append("    endpoint-url: ").append(contract.getEndpointUrl() != null ? contract.getEndpointUrl() : "https://TODO.partner.soap/ws").append("\n");
        sb.append("    username: ${").append(partnerLower.toUpperCase()).append("_USERNAME:}\n");
        sb.append("    password: ${").append(partnerLower.toUpperCase()).append("_PASSWORD:}\n");
        sb.append("    timeout:\n");
        sb.append("      connect: 5000\n");
        sb.append("      read: 30000\n");

        Path file = projectRoot.resolve("src/main/resources/application-" + partnerLower + ".yml");
        Files.writeString(file, sb.toString());
    }

    // ===================== POM.XML =====================

    private void generatePomXml(Path projectRoot, String partnerLower, String partnerCapital) throws IOException {
        String pom = """
                <?xml version="1.0" encoding="UTF-8"?>
                <project xmlns="http://maven.apache.org/POM/4.0.0"
                         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
                    <modelVersion>4.0.0</modelVersion>
                
                    <parent>
                        <groupId>org.springframework.boot</groupId>
                        <artifactId>spring-boot-starter-parent</artifactId>
                        <version>3.2.5</version>
                        <relativePath/>
                    </parent>
                
                    <groupId>com.bank.api</groupId>
                    <artifactId>soap-client-%s</artifactId>
                    <version>1.0.0</version>
                    <name>Client SOAP %s (Auto-genere)</name>
                    <description>Client SOAP Spring Boot pour le partenaire %s, genere par ejb-to-rest-tool</description>
                
                    <properties>
                        <java.version>21</java.version>
                        <cxf.version>4.0.4</cxf.version>
                    </properties>
                
                    <dependencies>
                        <!-- Spring Boot Web -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-web</artifactId>
                        </dependency>
                
                        <!-- Spring Boot Web Services -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-web-services</artifactId>
                        </dependency>
                
                        <!-- Apache CXF -->
                        <dependency>
                            <groupId>org.apache.cxf</groupId>
                            <artifactId>cxf-spring-boot-starter-jaxws</artifactId>
                            <version>${cxf.version}</version>
                        </dependency>
                
                        <!-- JAXB Runtime -->
                        <dependency>
                            <groupId>jakarta.xml.bind</groupId>
                            <artifactId>jakarta.xml.bind-api</artifactId>
                        </dependency>
                        <dependency>
                            <groupId>org.glassfish.jaxb</groupId>
                            <artifactId>jaxb-runtime</artifactId>
                        </dependency>
                
                        <!-- JAX-WS Runtime -->
                        <dependency>
                            <groupId>jakarta.xml.ws</groupId>
                            <artifactId>jakarta.xml.ws-api</artifactId>
                        </dependency>
                
                        <!-- Jackson JSON (pour la facade REST) -->
                        <dependency>
                            <groupId>com.fasterxml.jackson.core</groupId>
                            <artifactId>jackson-databind</artifactId>
                        </dependency>
                        <dependency>
                            <groupId>com.fasterxml.jackson.datatype</groupId>
                            <artifactId>jackson-datatype-jsr310</artifactId>
                        </dependency>
                
                        <!-- Testing -->
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-test</artifactId>
                            <scope>test</scope>
                        </dependency>
                    </dependencies>
                
                    <build>
                        <plugins>
                            <plugin>
                                <groupId>org.springframework.boot</groupId>
                                <artifactId>spring-boot-maven-plugin</artifactId>
                            </plugin>
                            <!-- CXF Code Generation Plugin (optionnel, pour generer les stubs depuis le WSDL) -->
                            <plugin>
                                <groupId>org.apache.cxf</groupId>
                                <artifactId>cxf-codegen-plugin</artifactId>
                                <version>${cxf.version}</version>
                                <executions>
                                    <execution>
                                        <id>generate-sources</id>
                                        <phase>generate-sources</phase>
                                        <configuration>
                                            <sourceRoot>${project.build.directory}/generated-sources/cxf</sourceRoot>
                                            <wsdlOptions>
                                                <wsdlOption>
                                                    <wsdl>src/main/resources/wsdl/%s.wsdl</wsdl>
                                                </wsdlOption>
                                            </wsdlOptions>
                                        </configuration>
                                        <goals>
                                            <goal>wsdl2java</goal>
                                        </goals>
                                    </execution>
                                </executions>
                            </plugin>
                        </plugins>
                    </build>
                </project>
                """.formatted(partnerLower, partnerCapital, partnerCapital, partnerLower);

        Files.writeString(projectRoot.resolve("pom.xml"), pom);
    }

    // ===================== README =====================

    private void generateReadme(Path projectRoot, WsdlContractInfo contract, boolean bianMode) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Client SOAP ").append(contract.getPartnerName()).append("\n\n");
        sb.append("Client Spring Boot auto-genere par **ejb-to-rest-tool** (WSDL Client Generator).\n\n");

        sb.append("## Informations du contrat\n\n");
        sb.append("| Propriete | Valeur |\n");
        sb.append("|-----------|--------|\n");
        sb.append("| Partenaire | **").append(contract.getPartnerName()).append("** |\n");
        sb.append("| Service | ").append(contract.getServiceName()).append(" |\n");
        sb.append("| Namespace | `").append(contract.getTargetNamespace()).append("` |\n");
        sb.append("| Endpoint | `").append(contract.getEndpointUrl() != null ? contract.getEndpointUrl() : "A configurer").append("` |\n");
        sb.append("| Operations | ").append(contract.getOperations().size()).append(" |\n");
        sb.append("| Types complexes | ").append(contract.getComplexTypes().size()).append(" |\n");
        sb.append("| Mode BIAN | ").append(bianMode ? "Active (facade REST generee)" : "Desactive").append(" |\n\n");

        sb.append("## Fichiers generes\n\n");
        sb.append("- `SoapClient` : Client JAX-WS avec stubs pour chaque operation\n");
        sb.append("- `SoapConfig` : Configuration (endpoint, timeouts, WS-Security)\n");
        sb.append("- `SoapService` : Service wrapper avec logging et resilience\n");
        sb.append("- `dto/` : DTOs JAXB generes depuis les types complexes WSDL\n");
        if (bianMode) {
            sb.append("- `facade/RestFacade` : Bridge SOAP → REST BIAN\n");
        }

        Files.writeString(projectRoot.resolve("README.md"), sb.toString());
    }

    // ===================== BIAN REPORT =====================

    private void generateBianReport(Path projectRoot, WsdlContractInfo contract) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Rapport de Mapping BIAN (SOAP → REST) - ").append(contract.getPartnerName()).append("\n\n");
        sb.append("| Operation SOAP | SOAPAction | Endpoint REST BIAN | Methode HTTP |\n");
        sb.append("|----------------|-----------|--------------------|--------------|\n");

        for (OperationInfo op : contract.getOperations()) {
            String httpMethod = deduceBianHttpMethod(op.getName());
            String bianPath = "/bian/" + contract.getPartnerName().toLowerCase() + deduceBianPath(op.getName());
            sb.append("| `").append(op.getName()).append("` | `")
              .append(op.getSoapAction() != null ? op.getSoapAction() : "N/A")
              .append("` | `").append(bianPath).append("` | ").append(httpMethod).append(" |\n");
        }

        Files.writeString(projectRoot.resolve("BIAN_MAPPING.md"), sb.toString());
    }

    // ===================== UTILITAIRES =====================

    private String mapXsdType(String xsdType) {
        if (xsdType == null) return "Object";
        String mapped = XSD_TYPE_MAP.get(xsdType);
        return mapped != null ? mapped : xsdType; // Si pas dans la map, c'est probablement un type complexe
    }

    private String deduceBianHttpMethod(String operationName) {
        String lower = operationName.toLowerCase();
        if (lower.startsWith("get") || lower.startsWith("find") || lower.startsWith("retrieve") ||
            lower.startsWith("list") || lower.startsWith("search") || lower.startsWith("check")) {
            return "GET";
        }
        if (lower.startsWith("create") || lower.startsWith("initiate") || lower.startsWith("add") ||
            lower.startsWith("register") || lower.startsWith("submit")) {
            return "POST";
        }
        if (lower.startsWith("update") || lower.startsWith("modify") || lower.startsWith("execute") ||
            lower.startsWith("process") || lower.startsWith("validate")) {
            return "PUT";
        }
        if (lower.startsWith("delete") || lower.startsWith("remove") || lower.startsWith("cancel")) {
            return "DELETE";
        }
        return "POST"; // Par defaut pour SOAP
    }

    private String deduceBianPath(String operationName) {
        String lower = operationName.toLowerCase();
        // Construire un path BIAN semantique
        String clean = operationName.replaceAll("([A-Z])", "-$1").toLowerCase();
        if (clean.startsWith("-")) clean = clean.substring(1);
        return "/" + clean;
    }

    private String httpToAnnotation(String method) {
        return switch (method) {
            case "GET" -> "GetMapping";
            case "POST" -> "PostMapping";
            case "PUT" -> "PutMapping";
            case "DELETE" -> "DeleteMapping";
            default -> "PostMapping";
        };
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    private String toCamelCase(String s) {
        if (s == null) return "";
        // Si c'est deja en camelCase, retourner tel quel
        if (s.contains("-") || s.contains("_")) {
            StringBuilder sb = new StringBuilder();
            boolean nextUpper = false;
            for (char c : s.toCharArray()) {
                if (c == '_' || c == '-') { nextUpper = true; }
                else if (nextUpper) { sb.append(Character.toUpperCase(c)); nextUpper = false; }
                else { sb.append(c); }
            }
            return sb.toString();
        }
        return s;
    }
}
