package com.bank.batch.util;

import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * Classe utilitaire pour les opérations de batch.
 *
 * @author Hamza NORDINE
 */
public class BatchHelper {

    /**
     * Formate une date en chaîne de caractères.
     *
     * @param date La date à formater.
     * @return La date formatée.
     */
    public static String formatDate(Date date) {
        if (date == null) {
            return "";
        }
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        return sdf.format(date);
    }
}
