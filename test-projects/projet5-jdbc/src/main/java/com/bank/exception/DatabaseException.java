package com.bank.exception;

/**
 * Exception personnalisée pour les erreurs de base de données.
 * 
 * @author Hamza NORDINE
 */
public class DatabaseException extends RuntimeException {

    public DatabaseException(String message) {
        super(message);
    }

    public DatabaseException(String message, Throwable cause) {
        super(message, cause);
    }
}
