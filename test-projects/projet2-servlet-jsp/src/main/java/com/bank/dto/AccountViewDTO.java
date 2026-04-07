package com.bank.dto;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * DTO pour la vue des détails du compte.
 * Contient les informations à afficher à l'utilisateur.
 *
 * @author Hamza NORDINE
 */
public class AccountViewDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String accountNumber;
    private String accountType;
    private BigDecimal balance;
    private String currency;

    public AccountViewDTO() {
    }

    public AccountViewDTO(String accountNumber, String accountType, BigDecimal balance, String currency) {
        this.accountNumber = accountNumber;
        this.accountType = accountType;
        this.balance = balance;
        this.currency = currency;
    }

    // Getters and Setters

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    public String getAccountType() {
        return accountType;
    }

    public void setAccountType(String accountType) {
        this.accountType = accountType;
    }

    public BigDecimal getBalance() {
        return balance;
    }

    public void setBalance(BigDecimal balance) {
        this.balance = balance;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }
}
