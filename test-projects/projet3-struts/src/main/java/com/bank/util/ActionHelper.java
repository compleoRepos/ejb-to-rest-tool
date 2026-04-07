package com.bank.util;

import javax.servlet.http.HttpServletRequest;

/**
 * Classe utilitaire pour les actions Struts.
 * Fournit des méthodes d'aide pour les tâches courantes dans les classes Action.
 *
 * @author Hamza NORDINE
 */
public class ActionHelper {

    /**
     * Extrait le paramètre 'id' de la requête HTTP et le convertit en Long.
     *
     * @param request La requête HTTP.
     * @return Le Long représentant l'ID, ou null si le paramètre est absent ou invalide.
     */
    public static Long getIdFromRequest(HttpServletRequest request) {
        String idStr = request.getParameter("id");
        if (idStr != null && !idStr.trim().isEmpty()) {
            try {
                return Long.parseLong(idStr);
            } catch (NumberFormatException e) {
                // Log l'erreur ou la gérer autrement si nécessaire
                return null;
            }
        }
        return null;
    }
}
