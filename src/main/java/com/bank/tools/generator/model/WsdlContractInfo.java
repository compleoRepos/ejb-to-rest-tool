package com.bank.tools.generator.model;

import java.util.*;

/**
 * Modele representant un contrat WSDL parse.
 * Contient les informations necessaires pour generer un client SOAP JAX-WS/CXF.
 */
public class WsdlContractInfo {

    private String serviceName;
    private String targetNamespace;
    private String wsdlUrl;
    private String partnerName;       // ex: "RMA", "HPS", "DEVBOSTER"
    private String portTypeName;
    private String bindingName;
    private String endpointUrl;       // URL du service SOAP
    private List<OperationInfo> operations = new ArrayList<>();
    private List<ComplexTypeInfo> complexTypes = new ArrayList<>();

    // ===================== OPERATION =====================

    public static class OperationInfo {
        private String name;              // nom de l'operation SOAP
        private String soapAction;        // SOAPAction header
        private String inputMessage;      // nom du message d'entree
        private String outputMessage;     // nom du message de sortie
        private String inputType;         // type complexe d'entree
        private String outputType;        // type complexe de sortie
        private String documentation;

        // Getters & Setters
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getSoapAction() { return soapAction; }
        public void setSoapAction(String soapAction) { this.soapAction = soapAction; }
        public String getInputMessage() { return inputMessage; }
        public void setInputMessage(String inputMessage) { this.inputMessage = inputMessage; }
        public String getOutputMessage() { return outputMessage; }
        public void setOutputMessage(String outputMessage) { this.outputMessage = outputMessage; }
        public String getInputType() { return inputType; }
        public void setInputType(String inputType) { this.inputType = inputType; }
        public String getOutputType() { return outputType; }
        public void setOutputType(String outputType) { this.outputType = outputType; }
        public String getDocumentation() { return documentation; }
        public void setDocumentation(String documentation) { this.documentation = documentation; }
    }

    // ===================== COMPLEX TYPE =====================

    public static class ComplexTypeInfo {
        private String name;
        private String namespace;
        private List<ElementInfo> elements = new ArrayList<>();

        public static class ElementInfo {
            private String name;
            private String type;          // "string", "int", "boolean", "complexType ref"
            private boolean nillable;
            private int minOccurs;
            private int maxOccurs;        // -1 = unbounded
            private String documentation;

            // Getters & Setters
            public String getName() { return name; }
            public void setName(String name) { this.name = name; }
            public String getType() { return type; }
            public void setType(String type) { this.type = type; }
            public boolean isNillable() { return nillable; }
            public void setNillable(boolean nillable) { this.nillable = nillable; }
            public int getMinOccurs() { return minOccurs; }
            public void setMinOccurs(int minOccurs) { this.minOccurs = minOccurs; }
            public int getMaxOccurs() { return maxOccurs; }
            public void setMaxOccurs(int maxOccurs) { this.maxOccurs = maxOccurs; }
            public String getDocumentation() { return documentation; }
            public void setDocumentation(String documentation) { this.documentation = documentation; }
        }

        // Getters & Setters
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getNamespace() { return namespace; }
        public void setNamespace(String namespace) { this.namespace = namespace; }
        public List<ElementInfo> getElements() { return elements; }
        public void setElements(List<ElementInfo> elements) { this.elements = elements; }
    }

    // ===================== MAIN GETTERS & SETTERS =====================

    public String getServiceName() { return serviceName; }
    public void setServiceName(String serviceName) { this.serviceName = serviceName; }
    public String getTargetNamespace() { return targetNamespace; }
    public void setTargetNamespace(String targetNamespace) { this.targetNamespace = targetNamespace; }
    public String getWsdlUrl() { return wsdlUrl; }
    public void setWsdlUrl(String wsdlUrl) { this.wsdlUrl = wsdlUrl; }
    public String getPartnerName() { return partnerName; }
    public void setPartnerName(String partnerName) { this.partnerName = partnerName; }
    public String getPortTypeName() { return portTypeName; }
    public void setPortTypeName(String portTypeName) { this.portTypeName = portTypeName; }
    public String getBindingName() { return bindingName; }
    public void setBindingName(String bindingName) { this.bindingName = bindingName; }
    public String getEndpointUrl() { return endpointUrl; }
    public void setEndpointUrl(String endpointUrl) { this.endpointUrl = endpointUrl; }
    public List<OperationInfo> getOperations() { return operations; }
    public void setOperations(List<OperationInfo> operations) { this.operations = operations; }
    public List<ComplexTypeInfo> getComplexTypes() { return complexTypes; }
    public void setComplexTypes(List<ComplexTypeInfo> complexTypes) { this.complexTypes = complexTypes; }
}
