package com.bank.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Représente un compte bancaire.
 * Cette classe est un modèle de données pour les informations de compte.
 *
 * @author Hamza NORDINE
 */
public class Account implements Serializable {

    private static final long serialVersionUID = 1L;

    private String accountNumber;
    private String accountType;
    private BigDecimal balance;
    private String currency;
    private List<Transaction> transactions;

    /**
     * Constructeur par défaut.
     */
    public Account() {
        this.transactions = new ArrayList<>();
    }

    /**
     * Constructeur avec paramètres.
     *
     * @param accountNumber Le numéro de compte.
     * @param accountType   Le type de compte.
     * @param balance       Le solde du compte.
     * @param currency      La devise du compte.
     */
    public Account(String accountNumber, String accountType, BigDecimal balance, String currency) {
        this.accountNumber = accountNumber;
        this.accountType = accountType;
        this.balance = balance;
        this.currency = currency;
        this.transactions = new ArrayList<>();
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

    public List<Transaction> getTransactions() {
        return transactions;
    }

    public void setTransactions(List<Transaction> transactions) {
        this.transactions = transactions;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Account account = (Account) o;
        return Objects.equals(accountNumber, account.accountNumber);
    }

    @Override
    public int hashCode() {
        return Objects.hash(accountNumber);
    }

    @Override
    public String toString() {
        return "Account{" +
                "accountNumber='" + accountNumber + '\'' +
                ", accountType='" + accountType + '\'' +
                ", balance=" + balance +
                ", currency='" + currency + '\'' +
                '}';
    }
}
