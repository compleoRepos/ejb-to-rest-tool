package com.bank.dao;

import com.bank.exception.DatabaseException;
import com.bank.model.Customer;
import com.bank.util.ConnectionPool;

import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * DAO pour l'entité Customer, utilisant des procédures stockées.
 * 
 * @author Hamza NORDINE
 */
public class CustomerDAO {

    /**
     * Récupère un client par son ID en utilisant une procédure stockée.
     *
     * @param id L'ID du client.
     * @return Le client, ou null s'il n'est pas trouvé.
     */
    public Customer findById(long id) {
        String sql = "{CALL get_customer_by_id(?)}";
        try (Connection conn = ConnectionPool.getConnection();
             CallableStatement stmt = conn.prepareCall(sql)) {
            stmt.setLong(1, id);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return new Customer(
                            rs.getLong("id"),
                            rs.getString("first_name"),
                            rs.getString("last_name"),
                            rs.getString("email")
                    );
                }
            }
        } catch (SQLException e) {
            throw new DatabaseException("Error finding customer by id: " + id, e);
        }
        return null;
    }

    /**
     * Enregistre un nouveau client en utilisant une procédure stockée.
     *
     * @param customer Le client à enregistrer.
     */
    public void save(Customer customer) {
        String sql = "{CALL create_customer(?, ?, ?)}";
        try (Connection conn = ConnectionPool.getConnection();
             CallableStatement stmt = conn.prepareCall(sql)) {
            stmt.setString(1, customer.getFirstName());
            stmt.setString(2, customer.getLastName());
            stmt.setString(3, customer.getEmail());
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new DatabaseException("Error saving customer: " + customer, e);
        }
    }
}
