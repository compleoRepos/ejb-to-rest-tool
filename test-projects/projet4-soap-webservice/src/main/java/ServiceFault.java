package com.bank.soap.exception;

import java.io.Serializable;

/**
 * Représente le contenu d'une erreur de service SOAP.
 * Contient un code d'erreur et un message pour le client.
 *
 * @author Hamza NORDINE
 */
public class ServiceFault implements Serializable {

    private static final long serialVersionUID = 1L;

    private String faultCode;
    private String faultString;

    public ServiceFault() {
    }

    public ServiceFault(String faultCode, String faultString) {
        this.faultCode = faultCode;
        this.faultString = faultString;
    }

    public String getFaultCode() {
        return faultCode;
    }

    public void setFaultCode(String faultCode) {
        this.faultCode = faultCode;
    }

    public String getFaultString() {
        return faultString;
    }

    public void setFaultString(String faultString) {
        this.faultString = faultString;
    }
}
