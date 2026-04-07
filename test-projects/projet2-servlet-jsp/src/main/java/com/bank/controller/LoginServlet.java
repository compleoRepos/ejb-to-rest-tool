package com.bank.controller;

import com.bank.dto.LoginDTO;
import com.bank.exception.AuthenticationException;
import com.bank.util.SessionManager;

import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Servlet pour la gestion de l'authentification des utilisateurs.
 * Gère les requêtes de connexion et de déconnexion.
 *
 * @author Hamza NORDINE
 */
@WebServlet("/login")
public class LoginServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        // Afficher le formulaire de connexion
        RequestDispatcher dispatcher = req.getRequestDispatcher("/WEB-INF/views/login.jsp");
        dispatcher.forward(req, resp);
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        LoginDTO loginDTO = new LoginDTO(req.getParameter("username"), req.getParameter("password"));

        try {
            // Simuler une authentification réussie
            if ("user".equals(loginDTO.getUsername()) && "password".equals(loginDTO.getPassword())) {
                SessionManager.createSession(req, loginDTO.getUsername());
                resp.sendRedirect(req.getContextPath() + "/account");
            } else {
                throw new AuthenticationException("Invalid credentials");
            }
        } catch (AuthenticationException e) {
            req.setAttribute("error", e.getMessage());
            RequestDispatcher dispatcher = req.getRequestDispatcher("/WEB-INF/views/login.jsp");
            dispatcher.forward(req, resp);
        }
    }
}
