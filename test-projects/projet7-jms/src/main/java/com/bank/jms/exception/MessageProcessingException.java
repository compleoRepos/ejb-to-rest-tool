package com.bank.jms.exception;

/**
 * Exception personnalisée pour les erreurs de traitement de message JMS.
 * @author Hamza NORDINE
 */
public class MessageProcessingException extends Exception {

    private static final long serialVersionUID = 1L;

    public MessageProcessingException(String message) {
        super(message);
    }

    public MessageProcessingException(String message, Throwable cause) {
        super(message, cause);
    }
}
