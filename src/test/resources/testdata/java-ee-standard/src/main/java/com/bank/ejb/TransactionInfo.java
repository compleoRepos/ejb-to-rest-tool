package com.bank.ejb;

import java.io.Serializable;
import java.math.BigDecimal;

public class TransactionInfo implements Serializable {
    private String transactionId;
    private String date;
    private BigDecimal amount;
    private String description;

    public String getTransactionId() { return transactionId; }
    public void setTransactionId(String transactionId) { this.transactionId = transactionId; }
    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
