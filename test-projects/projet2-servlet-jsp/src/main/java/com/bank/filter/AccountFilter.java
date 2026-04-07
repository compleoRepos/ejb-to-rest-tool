package com.bank.filter;

import com.bank.util.SessionManager;

import javax.servlet.*;
import javax.servlet.annotation.WebFilter;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Filtre de sécurité pour la consultation des informations du compte.
 * Vérifie si l'utilisateur est authentifié avant d'autoriser l'accès.
 *
 * @author Hamza NORDINE
 */
@WebFilter(
    urlPatterns = {
        "/account",
        "/transactions"
    }
)
public class AccountFilter implements Filter {

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
        // Initialisation du filtre
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        if (SessionManager.isUserLoggedIn(httpRequest)) {
            chain.doFilter(request, response);
        } else {
            httpResponse.sendRedirect(httpRequest.getContextPath() + "/login");
        }
    }

    @Override
    public void destroy() {
        // Nettoyage du filtre
    }
}
