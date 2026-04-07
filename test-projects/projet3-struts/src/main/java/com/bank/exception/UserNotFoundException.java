package com.bank.exception;

/**
 * Exception levée lorsqu'un utilisateur demandé n'est pas trouvé dans le système.
 * 
 * @author Hamza NORDINE
 */
public class UserNotFoundException extends Exception {

    private static final long serialVersionUID = 1L;

    /**
     * Construit une nouvelle UserNotFoundException avec un message de détail.
     *
     * @param message le message de détail.
     */
    public UserNotFoundException(String message) {
        super(message);
    }

    /**
     * Construit une nouvelle UserNotFoundException avec un message et une cause.
     *
     * @param message le message de détail.
     * @param cause la cause de l'exception.
     */
    public UserNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
