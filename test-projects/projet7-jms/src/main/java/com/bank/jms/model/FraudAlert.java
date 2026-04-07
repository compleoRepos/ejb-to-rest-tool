package com.bank.jms.model;

import java.io.Serializable;
import java.util.Date;

/**
 * Représente une alerte de fraude.
 * Ce modèle est utilisé pour notifier une suspicion de fraude.
 *
 * @author Hamza NORDINE
 */
public class FraudAlert implements Serializable {

    private static final long serialVersionUID = 1L;

    private String alertId;
    private String transactionId;
    private String accountNumber;
    private Date alertDate;
    private String reason;
    private double score;

    public FraudAlert() {
    }

    public FraudAlert(String alertId, String transactionId, String accountNumber, Date alertDate, String reason, double score) {
        this.alertId = alertId;
        this.transactionId = transactionId;
        this.accountNumber = accountNumber;
        this.alertDate = alertDate;
        this.reason = reason;
        this.score = score;
    }

    // Getters and Setters

    public String getAlertId() {
        return alertId;
    }

    public void setAlertId(String alertId) {
        this.alertId = alertId;
    }

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

    public Date getAlertDate() {
        return alertDate;
    }

    public void setAlertDate(Date alertDate) {
        this.alertDate = alertDate;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public double getScore() {
        return score;
    }

    public void setScore(double score) {
        this.score = score;
    }

    @Override
    public String toString() {
        return "FraudAlert{" +
                "alertId='" + alertId + '\'' +
                ", transactionId='" + transactionId + '\'' +
                ", accountNumber='" + accountNumber + '\'' +
                ", alertDate=" + alertDate +
                ", reason='" + reason + '\'' +
                ", score=" + score +
                '}';
    }
}
