package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.WsdlContractInfo;
import com.bank.tools.generator.model.WsdlContractInfo.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

/**
 * Parseur de contrats WSDL (Web Services Description Language).
 * Parse un fichier WSDL 1.1 et extrait les operations, types complexes
 * et metadonnees necessaires a la generation de clients SOAP JAX-WS/CXF.
 *
 * Parseur XML leger sans dependance externe (pas de JAXB/DOM requis).
 * Utilise un parsing regex/string pour rester autonome.
 */
@Component
public class WsdlContractParser {

    private static final Logger log = LoggerFactory.getLogger(WsdlContractParser.class);

    /**
     * Parse un fichier WSDL et retourne le contrat structure.
     *
     * @param filePath chemin vers le fichier WSDL
     * @param partnerName nom du partenaire (ex: "RMA", "HPS")
     * @return contrat parse
     */
    public WsdlContractInfo parse(Path filePath, String partnerName) throws IOException {
        String content = Files.readString(filePath);
        log.info("[WSDL] Parsing du contrat : {} (partenaire: {})", filePath.getFileName(), partnerName);

        WsdlContractInfo contract = new WsdlContractInfo();
        contract.setPartnerName(partnerName);

        // Extraire le targetNamespace
        String targetNs = extractAttribute(content, "targetNamespace");
        contract.setTargetNamespace(targetNs);

        // Extraire le nom du service
        String serviceName = extractTagAttribute(content, "wsdl:service", "name");
        if (serviceName == null) serviceName = extractTagAttribute(content, "service", "name");
        contract.setServiceName(serviceName != null ? serviceName : partnerName + "Service");

        // Extraire le portType
        String portTypeName = extractTagAttribute(content, "wsdl:portType", "name");
        if (portTypeName == null) portTypeName = extractTagAttribute(content, "portType", "name");
        contract.setPortTypeName(portTypeName);

        // Extraire le binding
        String bindingName = extractTagAttribute(content, "wsdl:binding", "name");
        if (bindingName == null) bindingName = extractTagAttribute(content, "binding", "name");
        contract.setBindingName(bindingName);

        // Extraire l'endpoint URL
        String endpointUrl = extractEndpointUrl(content);
        contract.setEndpointUrl(endpointUrl);
        contract.setWsdlUrl(filePath.toAbsolutePath().toString());

        // Extraire les operations
        List<OperationInfo> operations = extractOperations(content);
        contract.setOperations(operations);

        // Extraire les types complexes
        List<ComplexTypeInfo> complexTypes = extractComplexTypes(content);
        contract.setComplexTypes(complexTypes);

        log.info("[WSDL] Contrat parse : {} operations, {} types complexes",
                operations.size(), complexTypes.size());

        return contract;
    }

    // ===================== EXTRACTION DES OPERATIONS =====================

    private List<OperationInfo> extractOperations(String content) {
        List<OperationInfo> operations = new ArrayList<>();

        // Pattern pour les operations dans portType
        Pattern opPattern = Pattern.compile(
                "<(?:wsdl:)?operation\\s+name=\"([^\"]+)\"[^>]*>(.*?)</(?:wsdl:)?operation>",
                Pattern.DOTALL);
        Matcher opMatcher = opPattern.matcher(content);

        while (opMatcher.find()) {
            String opName = opMatcher.group(1);
            String opBody = opMatcher.group(2);

            OperationInfo op = new OperationInfo();
            op.setName(opName);

            // Extraire input message
            String inputMsg = extractTagAttribute(opBody, "input", "message");
            if (inputMsg == null) inputMsg = extractTagAttribute(opBody, "wsdl:input", "message");
            op.setInputMessage(stripPrefix(inputMsg));

            // Extraire output message
            String outputMsg = extractTagAttribute(opBody, "output", "message");
            if (outputMsg == null) outputMsg = extractTagAttribute(opBody, "wsdl:output", "message");
            op.setOutputMessage(stripPrefix(outputMsg));

            // Deduire les types d'entree/sortie depuis les messages
            op.setInputType(deduceTypeFromMessage(content, op.getInputMessage()));
            op.setOutputType(deduceTypeFromMessage(content, op.getOutputMessage()));

            // Extraire le SOAPAction
            String soapAction = extractSoapAction(content, opName);
            op.setSoapAction(soapAction);

            // Extraire la documentation
            Pattern docPattern = Pattern.compile("<(?:wsdl:)?documentation>(.*?)</(?:wsdl:)?documentation>", Pattern.DOTALL);
            Matcher docMatcher = docPattern.matcher(opBody);
            if (docMatcher.find()) {
                op.setDocumentation(docMatcher.group(1).trim());
            }

            operations.add(op);
            log.debug("[WSDL]   Operation: {} (in: {}, out: {})", opName, op.getInputType(), op.getOutputType());
        }

        return operations;
    }

    // ===================== EXTRACTION DES TYPES COMPLEXES =====================

    private List<ComplexTypeInfo> extractComplexTypes(String content) {
        List<ComplexTypeInfo> types = new ArrayList<>();

        // Pattern pour les complexType dans les types/schema
        Pattern ctPattern = Pattern.compile(
                "<(?:xs:|xsd:)?complexType\\s+name=\"([^\"]+)\"[^>]*>(.*?)</(?:xs:|xsd:)?complexType>",
                Pattern.DOTALL);
        Matcher ctMatcher = ctPattern.matcher(content);

        while (ctMatcher.find()) {
            String typeName = ctMatcher.group(1);
            String typeBody = ctMatcher.group(2);

            ComplexTypeInfo ct = new ComplexTypeInfo();
            ct.setName(typeName);

            // Extraire les elements
            Pattern elemPattern = Pattern.compile(
                    "<(?:xs:|xsd:)?element\\s+([^>]+?)(?:/>|>)",
                    Pattern.DOTALL);
            Matcher elemMatcher = elemPattern.matcher(typeBody);

            while (elemMatcher.find()) {
                String elemAttrs = elemMatcher.group(1);

                ComplexTypeInfo.ElementInfo elem = new ComplexTypeInfo.ElementInfo();
                elem.setName(extractAttrValue(elemAttrs, "name"));
                elem.setType(stripPrefix(extractAttrValue(elemAttrs, "type")));
                elem.setNillable("true".equals(extractAttrValue(elemAttrs, "nillable")));

                String minOcc = extractAttrValue(elemAttrs, "minOccurs");
                elem.setMinOccurs(minOcc != null ? Integer.parseInt(minOcc) : 1);

                String maxOcc = extractAttrValue(elemAttrs, "maxOccurs");
                if ("unbounded".equals(maxOcc)) {
                    elem.setMaxOccurs(-1);
                } else if (maxOcc != null) {
                    elem.setMaxOccurs(Integer.parseInt(maxOcc));
                } else {
                    elem.setMaxOccurs(1);
                }

                ct.getElements().add(elem);
            }

            types.add(ct);
            log.debug("[WSDL]   ComplexType: {} ({} elements)", typeName, ct.getElements().size());
        }

        return types;
    }

    // ===================== UTILITAIRES =====================

    private String extractAttribute(String xml, String attrName) {
        Pattern pattern = Pattern.compile(attrName + "=\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(xml);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String extractTagAttribute(String xml, String tagName, String attrName) {
        Pattern pattern = Pattern.compile("<" + Pattern.quote(tagName) + "\\s+[^>]*" + attrName + "=\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(xml);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String extractAttrValue(String attrs, String attrName) {
        Pattern pattern = Pattern.compile(attrName + "=\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(attrs);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String extractEndpointUrl(String content) {
        // Chercher dans soap:address ou soap12:address
        Pattern pattern = Pattern.compile("<(?:soap|soap12):address\\s+location=\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(content);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String extractSoapAction(String content, String operationName) {
        // Chercher le SOAPAction dans le binding
        Pattern pattern = Pattern.compile(
                "<(?:wsdl:)?operation\\s+name=\"" + Pattern.quote(operationName) + "\"[^>]*>.*?" +
                "<(?:soap|soap12):operation\\s+[^>]*soapAction=\"([^\"]+)\"",
                Pattern.DOTALL);
        Matcher matcher = pattern.matcher(content);
        return matcher.find() ? matcher.group(1) : operationName;
    }

    private String deduceTypeFromMessage(String content, String messageName) {
        if (messageName == null) return "Object";

        // Chercher le message et son element/type
        Pattern msgPattern = Pattern.compile(
                "<(?:wsdl:)?message\\s+name=\"" + Pattern.quote(messageName) + "\"[^>]*>(.*?)</(?:wsdl:)?message>",
                Pattern.DOTALL);
        Matcher msgMatcher = msgPattern.matcher(content);

        if (msgMatcher.find()) {
            String msgBody = msgMatcher.group(1);
            // Chercher le part element ou type
            String element = extractTagAttribute(msgBody, "part", "element");
            if (element == null) element = extractTagAttribute(msgBody, "wsdl:part", "element");
            if (element != null) return stripPrefix(element);

            String type = extractTagAttribute(msgBody, "part", "type");
            if (type == null) type = extractTagAttribute(msgBody, "wsdl:part", "type");
            if (type != null) return stripPrefix(type);
        }

        return messageName;
    }

    private String stripPrefix(String qname) {
        if (qname == null) return null;
        int colon = qname.indexOf(':');
        return colon >= 0 ? qname.substring(colon + 1) : qname;
    }
}
