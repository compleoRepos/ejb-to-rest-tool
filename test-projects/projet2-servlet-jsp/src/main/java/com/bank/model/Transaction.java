package com.bank.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;

/**
 * Représente une transaction bancaire.
 * Cette classe est un modèle de données pour les transactions.
 *
 * @author Hamza NORDINE
 */
public class Transaction implements Serializable {

    private static final long serialVersionUID = 1L;

    private String transactionId;
    private LocalDate date;
    private String description;
    private BigDecimal amount;
    private String type; // e.g., DEBIT, CREDIT

    /**
     * Constructeur par défaut.
     */
    public Transaction() {
    }

    /**
     * Constructeur avec paramètres.
     *
     * @param transactionId L'identifiant de la transaction.
     * @param date          La date de la transaction.
     * @param description   La description de la transaction.
     * @param amount        Le montant de la transaction.
     * @param type          Le type de transaction.
     */
    public Transaction(String transactionId, LocalDate date, String description, BigDecimal amount, String type) {
        this.transactionId = transactionId;
        this.date = date;
        this.description = description;
        this.amount = amount;
        this.type = type;
    }

    // Getters and Setters

    public String getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(String transactionId) {
        this.transactionId = transactionId;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Transaction that = (Transaction) o;
        return Objects.equals(transactionId, that.transactionId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(transactionId);
    }

    @Override
    public String toString() {
        return "Transaction{" +
                "transactionId='" + transactionId + '\'' +
                ", date=" + date +
                ", description='" + description + '\'' +
                ", amount=" + amount +
                ", type='" + type + '\'' +
                '}';
    }
}
