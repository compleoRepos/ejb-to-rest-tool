package com.bank.controller;

import com.bank.dto.AccountViewDTO;
import com.bank.model.Account;

import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.math.BigDecimal;

/**
 * Servlet pour la consultation des informations du compte.
 * Gère les requêtes pour afficher les détails du compte.
 *
 * @author Hamza NORDINE
 */
@WebServlet("/account")
public class AccountServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        // Simuler la récupération des informations du compte
        Account account = new Account("123456789", "Courant", new BigDecimal("1500.00"), "EUR");
        AccountViewDTO accountViewDTO = new AccountViewDTO(account.getAccountNumber(), account.getAccountType(), account.getBalance(), account.getCurrency());

        req.setAttribute("account", accountViewDTO);
        RequestDispatcher dispatcher = req.getRequestDispatcher("/WEB-INF/views/account.jsp");
        dispatcher.forward(req, resp);
    }
}
