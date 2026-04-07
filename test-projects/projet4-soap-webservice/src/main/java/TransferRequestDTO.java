package com.bank.soap.dto;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * DTO pour les requêtes de virement.
 * Cet objet transporte les données nécessaires pour initier un virement via le service web.
 *
 * @author Hamza NORDINE
 */
public class TransferRequestDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String fromAccountNumber;
    private String toAccountNumber;
    private BigDecimal amount;
    private String currency;

    public TransferRequestDTO() {
    }

    public TransferRequestDTO(String fromAccountNumber, String toAccountNumber, BigDecimal amount, String currency) {
        this.fromAccountNumber = fromAccountNumber;
        this.toAccountNumber = toAccountNumber;
        this.amount = amount;
        this.currency = currency;
    }

    // Getters and Setters

    public String getFromAccountNumber() {
        return fromAccountNumber;
    }

    public void setFromAccountNumber(String fromAccountNumber) {
        this.fromAccountNumber = fromAccountNumber;
    }

    public String getToAccountNumber() {
        return toAccountNumber;
    }

    public void setToAccountNumber(String toAccountNumber) {
        this.toAccountNumber = toAccountNumber;
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

    @Override
    public String toString() {
        return "TransferRequestDTO{" +
                "fromAccountNumber='" + fromAccountNumber + '\'' +
                ", toAccountNumber='" + toAccountNumber + '\'' +
                ", amount=" + amount +
                ", currency='" + currency + '\'' +
                '}';
    }
}
