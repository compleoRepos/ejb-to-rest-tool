package com.bank.soap.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

/**
 * Représente un taux de change entre deux devises.
 * Ce modèle est utilisé pour stocker et fournir les taux de change actuels.
 *
 * @author Hamza NORDINE
 */
public class ExchangeRate implements Serializable {

    private static final long serialVersionUID = 1L;

    private String fromCurrency;
    private String toCurrency;
    private BigDecimal rate;
    private Date lastUpdated;

    public ExchangeRate() {
    }

    public ExchangeRate(String fromCurrency, String toCurrency, BigDecimal rate) {
        this.fromCurrency = fromCurrency;
        this.toCurrency = toCurrency;
        this.rate = rate;
        this.lastUpdated = new Date();
    }

    // Getters and Setters

    public String getFromCurrency() {
        return fromCurrency;
    }

    public void setFromCurrency(String fromCurrency) {
        this.fromCurrency = fromCurrency;
    }

    public String getToCurrency() {
        return toCurrency;
    }

    public void setToCurrency(String toCurrency) {
        this.toCurrency = toCurrency;
    }

    public BigDecimal getRate() {
        return rate;
    }

    public void setRate(BigDecimal rate) {
        this.rate = rate;
    }

    public Date getLastUpdated() {
        return lastUpdated;
    }

    public void setLastUpdated(Date lastUpdated) {
        this.lastUpdated = lastUpdated;
    }

    @Override
    public String toString() {
        return "ExchangeRate{" +
                "fromCurrency='" + fromCurrency + '\'' +
                ", toCurrency='" + toCurrency + '\'' +
                ", rate=" + rate +
                ", lastUpdated=" + lastUpdated +
                '}';
    }
}
