package com.bank.util;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Classe utilitaire pour les opérations JDBC.
 * 
 * @author Hamza NORDINE
 */
public final class JdbcHelper {

    private JdbcHelper() {
        // Classe utilitaire
    }

    /**
     * Ferme la connexion, le statement et le result set.
     *
     * @param conn la connexion à fermer
     * @param stmt le statement à fermer
     * @param rs   le result set à fermer
     */
    public static void close(Connection conn, Statement stmt, ResultSet rs) {
        try {
            if (rs != null) {
                rs.close();
            }
        } catch (SQLException e) {
            // Ignorer
        }
        try {
            if (stmt != null) {
                stmt.close();
            }
        } catch (SQLException e) {
            // Ignorer
        }
        // La connexion est retournée au pool, donc ne pas la fermer ici
    }

    /**
     * Ferme la connexion et le statement.
     *
     * @param conn la connexion à fermer
     * @param stmt le statement à fermer
     */
    public static void close(Connection conn, Statement stmt) {
        close(conn, stmt, null);
    }
}
