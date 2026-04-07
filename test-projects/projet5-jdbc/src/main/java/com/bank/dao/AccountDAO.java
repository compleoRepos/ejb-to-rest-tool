package com.bank.dao;

import com.bank.exception.DatabaseException;
import com.bank.model.Account;
import com.bank.util.ConnectionPool;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Account.
 * 
 * @author Hamza NORDINE
 */
public class AccountDAO {

    public Account findById(long id) {
        String sql = "SELECT * FROM account WHERE id = ?";
        try (Connection conn = ConnectionPool.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setLong(1, id);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return new Account(
                            rs.getLong("id"),
                            rs.getString("account_number"),
                            rs.getBigDecimal("balance"),
                            rs.getLong("customer_id")
                    );
                }
            }
        } catch (SQLException e) {
            throw new DatabaseException("Error finding account by id: " + id, e);
        }
        return null;
    }

    public List<Account> findAll() {
        List<Account> accounts = new ArrayList<>();
        String sql = "SELECT * FROM account";
        try (Connection conn = ConnectionPool.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            while (rs.next()) {
                accounts.add(new Account(
                        rs.getLong("id"),
                        rs.getString("account_number"),
                        rs.getBigDecimal("balance"),
                        rs.getLong("customer_id")
                ));
            }
        } catch (SQLException e) {
            throw new DatabaseException("Error finding all accounts", e);
        }
        return accounts;
    }

    public void save(Account account) {
        String sql = "INSERT INTO account (account_number, balance, customer_id) VALUES (?, ?, ?)";
        try (Connection conn = ConnectionPool.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, account.getAccountNumber());
            stmt.setBigDecimal(2, account.getBalance());
            stmt.setLong(3, account.getCustomerId());
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new DatabaseException("Error saving account: " + account, e);
        }
    }
}
