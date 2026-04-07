package com.bank.soap.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

/**
 * Représente un compte bancaire.
 * Ce modèle est utilisé pour la persistance et l'échange de données de base sur les comptes.
 *
 * @author Hamza NORDINE
 */
public class Account implements Serializable {

    private static final long serialVersionUID = 1L;

    private String accountNumber;
    private String ownerName;
    private BigDecimal balance;
    private String currency;
    private Date creationDate;
    private boolean active;

    public Account() {
    }

    public Account(String accountNumber, String ownerName, BigDecimal balance, String currency) {
        this.accountNumber = accountNumber;
        this.ownerName = ownerName;
        this.balance = balance;
        this.currency = currency;
        this.creationDate = new Date();
        this.active = true;
    }

    // Getters and Setters

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    public String getOwnerName() {
        return ownerName;
    }

    public void setOwnerName(String ownerName) {
        this.ownerName = ownerName;
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

    public Date getCreationDate() {
        return creationDate;
    }

    public void setCreationDate(Date creationDate) {
        this.creationDate = creationDate;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    @Override
    public String toString() {
        return "Account{" +
                "accountNumber='" + accountNumber + '\'' +
                ", ownerName='" + ownerName + '\'' +
                ", balance=" + balance +
                ", currency='" + currency + '\'' +
                ", creationDate=" + creationDate +
                ", active=" + active +
                '}';
    }
}
