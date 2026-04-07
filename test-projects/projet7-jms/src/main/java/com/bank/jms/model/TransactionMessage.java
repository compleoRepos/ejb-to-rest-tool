package com.bank.jms.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

/**
 * Représente un message de transaction bancaire.
 * Ce modèle est utilisé pour transporter les détails d'une transaction via JMS.
 *
 * @author Hamza NORDINE
 */
public class TransactionMessage implements Serializable {

    private static final long serialVersionUID = 1L;

    private String transactionId;
    private String accountNumber;
    private BigDecimal amount;
    private String currency;
    private Date transactionDate;
    private String type;
    private String merchant;

    public TransactionMessage() {
    }

    public TransactionMessage(String transactionId, String accountNumber, BigDecimal amount, String currency, Date transactionDate, String type, String merchant) {
        this.transactionId = transactionId;
        this.accountNumber = accountNumber;
        this.amount = amount;
        this.currency = currency;
        this.transactionDate = transactionDate;
        this.type = type;
        this.merchant = merchant;
    }

    // Getters and Setters

    public String getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(String transactionId) {
        this.transactionId = transactionId;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public Date getTransactionDate() {
        return transactionDate;
    }

    public void setTransactionDate(Date transactionDate) {
        this.transactionDate = transactionDate;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getMerchant() {
        return merchant;
    }

    public void setMerchant(String merchant) {
        this.merchant = merchant;
    }

    @Override
    public String toString() {
        return "TransactionMessage{" +
                "transactionId='" + transactionId + '\'' +
                ", accountNumber='" + accountNumber + '\'' +
                ", amount=" + amount +
                ", currency='" + currency + '\'' +
                ", transactionDate=" + transactionDate +
                ", type='" + type + '\'' +
                ", merchant='" + merchant + '\'' +
                '}';
    }
}
