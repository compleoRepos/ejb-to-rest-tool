package com.bank.model;

import java.math.BigDecimal;

/**
 * Représente un compte bancaire.
 * 
 * @author Hamza NORDINE
 */
public class Account {

    private long id;
    private String accountNumber;
    private BigDecimal balance;
    private long customerId;

    public Account() {
    }

    public Account(long id, String accountNumber, BigDecimal balance, long customerId) {
        this.id = id;
        this.accountNumber = accountNumber;
        this.balance = balance;
        this.customerId = customerId;
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    public BigDecimal getBalance() {
        return balance;
    }

    public void setBalance(BigDecimal balance) {
        this.balance = balance;
    }

    public long getCustomerId() {
        return customerId;
    }

    public void setCustomerId(long customerId) {
        this.customerId = customerId;
    }

    @Override
    public String toString() {
        return "Account{" +
                "id=" + id +
                ", accountNumber='" + accountNumber + '\'' +
                ", balance=" + balance +
                ", customerId=" + customerId +
                '}';
    }
}
