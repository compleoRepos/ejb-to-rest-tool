package com.bank.exception;

/**
 * Exception personnalisée pour les erreurs d'authentification.
 * Levée lorsque les informations d'identification de l'utilisateur sont invalides.
 *
 * @author Hamza NORDINE
 */
public class AuthenticationException extends Exception {

    private static final long serialVersionUID = 1L;

    /**
     * Construit une nouvelle exception avec un message de détail.
     *
     * @param message le message de détail.
     */
    public AuthenticationException(String message) {
        super(message);
    }

    /**
     * Construit une nouvelle exception avec un message de détail et une cause.
     *
     * @param message le message de détail.
     * @param cause la cause de l'exception.
     */
    public AuthenticationException(String message, Throwable cause) {
        super(message, cause);
    }
}
