package com.bank.jms.dto;

import java.io.Serializable;

/**
 * DTO pour les alertes.
 * @author Hamza NORDINE
 */
public class AlertDTO implements Serializable {

    private static final long serialVersionUID = 1L;
    private String alertId;
    private String message;

    public AlertDTO() {}

    public AlertDTO(String alertId, String message) {
        this.alertId = alertId;
        this.message = message;
    }

    public String getAlertId() {
        return alertId;
    }

    public void setAlertId(String alertId) {
        this.alertId = alertId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
