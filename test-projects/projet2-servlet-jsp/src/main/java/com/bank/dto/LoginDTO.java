package com.bank.dto;

import java.io.Serializable;

/**
 * DTO pour les informations de connexion.
 * Utilisé pour transférer les données de connexion de la vue au contrôleur.
 *
 * @author Hamza NORDINE
 */
public class LoginDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String username;
    private String password;

    public LoginDTO() {
    }

    public LoginDTO(String username, String password) {
        this.username = username;
        this.password = password;
    }

    // Getters and Setters

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
