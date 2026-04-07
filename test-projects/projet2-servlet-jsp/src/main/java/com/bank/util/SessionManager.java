package com.bank.util;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;

/**
 * Utilitaire pour la gestion des sessions.
 * Fournit des méthodes pour gérer les sessions utilisateur.
 *
 * @author Hamza NORDINE
 */
public final class SessionManager {

    private static final String USER_SESSION_KEY = "user";

    private SessionManager() {
        // Classe utilitaire, ne doit pas être instanciée
    }

    /**
     * Crée une session pour l'utilisateur.
     *
     * @param request L'objet HttpServletRequest.
     * @param username Le nom d'utilisateur.
     */
    public static void createSession(HttpServletRequest request, String username) {
        HttpSession session = request.getSession(true);
        session.setAttribute(USER_SESSION_KEY, username);
    }

    /**
     * Récupère la session utilisateur.
     *
     * @param request L'objet HttpServletRequest.
     * @return La session utilisateur, ou null si elle n'existe pas.
     */
    public static HttpSession getSession(HttpServletRequest request) {
        return request.getSession(false);
    }

    /**
     * Invalide la session utilisateur.
     *
     * @param request L'objet HttpServletRequest.
     */
    public static void invalidateSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }

    /**
     * Vérifie si l'utilisateur est connecté.
     *
     * @param request L'objet HttpServletRequest.
     * @return true si l'utilisateur est connecté, false sinon.
     */
    public static boolean isUserLoggedIn(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        return (session != null && session.getAttribute(USER_SESSION_KEY) != null);
    }

    /**
     * Récupère le nom d'utilisateur de la session.
     *
     * @param request L'objet HttpServletRequest.
     * @return Le nom d'utilisateur, ou null s'il n'est pas connecté.
     */
    public static String getUsername(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            return (String) session.getAttribute(USER_SESSION_KEY);
        }
        return null;
    }
}
