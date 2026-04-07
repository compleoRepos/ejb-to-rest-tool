package com.bank.controller;

import com.bank.model.Transaction;

import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Servlet pour la consultation de l'historique des transactions.
 * Gère les requêtes pour afficher la liste des transactions.
 *
 * @author Hamza NORDINE
 */
@WebServlet("/transactions")
public class TransactionServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        // Simuler la récupération de l'historique des transactions
        List<Transaction> transactions = new ArrayList<>();
        transactions.add(new Transaction("TXN001", LocalDate.now().minusDays(5), "Salaire", new BigDecimal("2500.00"), "CREDIT"));
        transactions.add(new Transaction("TXN002", LocalDate.now().minusDays(3), "Loyer", new BigDecimal("-800.00"), "DEBIT"));
        transactions.add(new Transaction("TXN003", LocalDate.now().minusDays(1), "Courses", new BigDecimal("-150.00"), "DEBIT"));

        req.setAttribute("transactions", transactions);
        RequestDispatcher dispatcher = req.getRequestDispatcher("/WEB-INF/views/transactions.jsp");
        dispatcher.forward(req, resp);
    }
}
