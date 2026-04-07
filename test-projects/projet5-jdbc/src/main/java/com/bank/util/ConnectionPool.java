package com.bank.util;

import com.bank.exception.DatabaseException;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * Gère un pool de connexions à la base de données.
 * 
 * @author Hamza NORDINE
 */
public class ConnectionPool {

    private static final String URL = "jdbc:h2:mem:bank;DB_CLOSE_DELAY=-1";
    private static final String USER = "sa";
    private static final String PASSWORD = "";
    private static final int INITIAL_POOL_SIZE = 10;

    private static final List<Connection> connectionPool = new ArrayList<>(INITIAL_POOL_SIZE);
    private static final List<Connection> usedConnections = new ArrayList<>();

    static {
        try {
            for (int i = 0; i < INITIAL_POOL_SIZE; i++) {
                connectionPool.add(createConnection());
            }
        } catch (SQLException e) {
            throw new DatabaseException("Failed to initialize connection pool", e);
        }
    }

    private static Connection createConnection() throws SQLException {
        return DriverManager.getConnection(URL, USER, PASSWORD);
    }

    public static synchronized Connection getConnection() {
        if (connectionPool.isEmpty()) {
            throw new DatabaseException("Connection pool is exhausted");
        }
        Connection connection = connectionPool.remove(connectionPool.size() - 1);
        usedConnections.add(connection);
        return connection;
    }

    public static synchronized void releaseConnection(Connection connection) {
        if (connection != null) {
            usedConnections.remove(connection);
            connectionPool.add(connection);
        }
    }

    public static int getPoolSize() {
        return connectionPool.size() + usedConnections.size();
    }
}
