package com.bank.soap.dto;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

/**
 * DTO pour les réponses de taux de change.
 * Cet objet est retourné par le service web de taux de change.
 *
 * @author Hamza NORDINE
 */
public class RateResponseDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String fromCurrency;
    private String toCurrency;
    private BigDecimal rate;
    private Date lastUpdated;

    public RateResponseDTO() {
    }

    public RateResponseDTO(String fromCurrency, String toCurrency, BigDecimal rate, Date lastUpdated) {
        this.fromCurrency = fromCurrency;
        this.toCurrency = toCurrency;
        this.rate = rate;
        this.lastUpdated = lastUpdated;
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
        return "RateResponseDTO{" +
                "fromCurrency='" + fromCurrency + "\''" +
                ", toCurrency='" + toCurrency + "\''" +
                ", rate=" + rate +
                ", lastUpdated=" + lastUpdated +
                '}';
    }
}
