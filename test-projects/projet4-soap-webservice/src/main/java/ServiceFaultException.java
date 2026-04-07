package com.bank.soap.exception;

import javax.xml.ws.WebFault;

/**
 * Exception personnalisée pour les erreurs de service SOAP.
 * Utilisée pour créer des messages d'erreur SOAP standardisés.
 *
 * @author Hamza NORDINE
 */
@WebFault(name = "ServiceFault")
public class ServiceFaultException extends Exception {

    private static final long serialVersionUID = 1L;

    private ServiceFault faultInfo;

    public ServiceFaultException(String message, ServiceFault faultInfo) {
        super(message);
        this.faultInfo = faultInfo;
    }

    public ServiceFaultException(String message, ServiceFault faultInfo, Throwable cause) {
        super(message, cause);
        this.faultInfo = faultInfo;
    }

    public ServiceFault getFaultInfo() {
        return faultInfo;
    }
}
