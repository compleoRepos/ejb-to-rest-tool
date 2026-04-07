package com.bank.jms.model;

import java.io.Serializable;
import java.util.Date;

/**
 * Représente un message de notification.
 * Ce modèle est utilisé pour envoyer des notifications aux clients.
 *
 * @author Hamza NORDINE
 */
public class NotificationMessage implements Serializable {

    private static final long serialVersionUID = 1L;

    private String notificationId;
    private String accountNumber;
    private String message;
    private Date notificationDate;

    public NotificationMessage() {
    }

    public NotificationMessage(String notificationId, String accountNumber, String message, Date notificationDate) {
        this.notificationId = notificationId;
        this.accountNumber = accountNumber;
        this.message = message;
        this.notificationDate = notificationDate;
    }

    // Getters and Setters

    public String getNotificationId() {
        return notificationId;
    }

    public void setNotificationId(String notificationId) {
        this.notificationId = notificationId;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Date getNotificationDate() {
        return notificationDate;
    }

    public void setNotificationDate(Date notificationDate) {
        this.notificationDate = notificationDate;
    }

    @Override
    public String toString() {
        return "NotificationMessage{" +
                "notificationId='" + notificationId + '\'' +
                ", accountNumber='" + accountNumber + '\'' +
                ", message='" + message + '\'' +
                ", notificationDate=" + notificationDate +
                '}';
    }
}
