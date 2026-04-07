package com.bank.soap.util;

import com.bank.soap.exception.ServiceFault;
import com.bank.soap.exception.ServiceFaultException;

/**
 * Classe utilitaire pour les services SOAP.
 * Fournit des méthodes pour la validation et la gestion des erreurs.
 *
 * @author Hamza NORDINE
 */
public class SoapHelper {

    /**
     * Valide qu'un objet n'est pas nul.
     *
     * @param object  l'objet à valider
     * @param message le message d'erreur
     * @throws ServiceFaultException si l'objet est nul
     */
    public static void validateNotNull(Object object, String message) throws ServiceFaultException {
        if (object == null) {
            throw new ServiceFaultException(message, new ServiceFault("E400", "Bad Request: " + message));
        }
    }

    /**
     * Valide qu'une chaîne de caractères n'est ni nulle ni vide.
     *
     * @param str     la chaîne à valider
     * @param message le message d'erreur
     * @throws ServiceFaultException si la chaîne est nulle ou vide
     */
    public static void validateNotEmpty(String str, String message) throws ServiceFaultException {
        if (str == null || str.trim().isEmpty()) {
            throw new ServiceFaultException(message, new ServiceFault("E400", "Bad Request: " + message));
        }
    }
}
