package com.bank.exception;

/**
 * Exception personnalisée pour les erreurs de repository.
 * Auteur: Hamza NORDINE
 */
public class RepositoryException extends Exception {

    public RepositoryException(String message) {
        super(message);
    }

    public RepositoryException(String message, Throwable cause) {
        super(message, cause);
    }
}
