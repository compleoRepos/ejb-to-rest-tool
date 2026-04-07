package com.bank.dao;

import com.bank.exception.DatabaseException;
import com.bank.model.Transaction;
import com.bank.util.ConnectionPool;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Transaction.
 * 
 * @author Hamza NORDINE
 */
public class TransactionDAO {

    public List<Transaction> findByAccountId(long accountId) {
        List<Transaction> transactions = new ArrayList<>();
        String sql = "SELECT * FROM transaction WHERE account_id = ? ORDER BY transaction_date DESC";
        try (Connection conn = ConnectionPool.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setLong(1, accountId);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    transactions.add(new Transaction(
                            rs.getLong("id"),
                            rs.getLong("account_id"),
                            rs.getBigDecimal("amount"),
                            rs.getTimestamp("transaction_date"),
                            rs.getString("type")
                    ));
                }
            }
        } catch (SQLException e) {
            throw new DatabaseException("Error finding transactions for account id: " + accountId, e);
        }
        return transactions;
    }

    public void save(Transaction transaction) {
        String sql = "INSERT INTO transaction (account_id, amount, transaction_date, type) VALUES (?, ?, ?, ?)";
        try (Connection conn = ConnectionPool.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setLong(1, transaction.getAccountId());
            stmt.setBigDecimal(2, transaction.getAmount());
            stmt.setTimestamp(3, transaction.getTransactionDate());
            stmt.setString(4, transaction.getType());
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new DatabaseException("Error saving transaction: " + transaction, e);
        }
    }
}
