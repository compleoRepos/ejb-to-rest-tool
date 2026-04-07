package com.bank.soap.dto;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * DTO pour transporter les informations de base d'un compte.
 * Utilisé comme objet de retour pour les services web afin de ne pas exposer le modèle de domaine.
 *
 * @author Hamza NORDINE
 */
public class AccountInfoDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String accountNumber;
    private String ownerName;
    private BigDecimal balance;
    private String currency;

    public AccountInfoDTO() {
    }

    public AccountInfoDTO(String accountNumber, String ownerName, BigDecimal balance, String currency) {
        this.accountNumber = accountNumber;
        this.ownerName = ownerName;
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

    @Override
    public String toString() {
        return "AccountInfoDTO{" +
                "accountNumber='" + accountNumber + '\'' +
                ", ownerName='" + ownerName + '\'' +
                ", balance=" + balance +
                ", currency='" + currency + '\'' +
                '}';
    }
}
