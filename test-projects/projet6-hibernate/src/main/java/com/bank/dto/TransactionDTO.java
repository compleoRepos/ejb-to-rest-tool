package com.bank.dto;

import java.util.Date;

/**
 * DTO pour le transfert des données de transaction.
 * Auteur: Hamza NORDINE
 */
public class TransactionDTO {

    private Date date;
    private double amount;
    private String type;
    private String accountNumber;

    public TransactionDTO(Date date, double amount, String type, String accountNumber) {
        this.date = date;
        this.amount = amount;
        this.type = type;
        this.accountNumber = accountNumber;
    }

    // Getters and Setters

    public Date getDate() {
        return date;
    }

    public void setDate(Date date) {
        this.date = date;
    }

    public double getAmount() {
        return amount;
    }

    public void setAmount(double amount) {
        this.amount = amount;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }
}
