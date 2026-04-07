package com.bank.dto;

import java.math.BigDecimal;
import java.sql.Timestamp;

/**
 * DTO pour le transfert de données de transaction.
 * 
 * @author Hamza NORDINE
 */
public class TransactionDTO {

    private BigDecimal amount;
    private Timestamp transactionDate;
    private String type;

    public TransactionDTO() {
    }

    public TransactionDTO(BigDecimal amount, Timestamp transactionDate, String type) {
        this.amount = amount;
        this.transactionDate = transactionDate;
        this.type = type;
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
        return "TransactionDTO{" +
                "amount=" + amount +
                ", transactionDate=" + transactionDate +
                ", type='" + type + "'" +
                '}';
    }
}
