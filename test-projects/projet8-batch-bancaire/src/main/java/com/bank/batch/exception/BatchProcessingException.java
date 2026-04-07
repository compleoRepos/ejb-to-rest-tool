package com.bank.batch.exception;

/**
 * Exception personnalisée pour les erreurs de traitement de batch.
 *
 * @author Hamza NORDINE
 */
public class BatchProcessingException extends Exception {

    public BatchProcessingException(String message) {
        super(message);
    }

    public BatchProcessingException(String message, Throwable cause) {
        super(message, cause);
    }
}
src/main/java/com/bank/batch/util/BatchHelper.java
