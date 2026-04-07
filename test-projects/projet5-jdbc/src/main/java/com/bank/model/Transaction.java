package com.bank.model;

import java.math.BigDecimal;
import java.sql.Timestamp;

/**
 * Représente une transaction bancaire.
 * 
 * @author Hamza NORDINE
 */
public class Transaction {

    private long id;
    private long accountId;
    private BigDecimal amount;
    private Timestamp transactionDate;
    private String type;

    public Transaction() {
    }

    public Transaction(long id, long accountId, BigDecimal amount, Timestamp transactionDate, String type) {
        this.id = id;
        this.accountId = accountId;
        this.amount = amount;
        this.transactionDate = transactionDate;
        this.type = type;
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public long getAccountId() {
        return accountId;
    }

    public void setAccountId(long accountId) {
        this.accountId = accountId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public Timestamp getTransactionDate() {
        return transactionDate;
    }

    public void setTransactionDate(Timestamp transactionDate) {
        this.transactionDate = transactionDate;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    @Override
    public String toString() {
        return "Transaction{" +
                "id=" + id +
                ", accountId=" + accountId +
                ", amount=" + amount +
                ", transactionDate=" + transactionDate +
                ", type='" + type + '\'' +
                '}';
    }
}
