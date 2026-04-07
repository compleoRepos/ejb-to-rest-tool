package com.bank.service;

import java.io.Serializable;
import java.math.BigDecimal;

public class PaymentResult implements Serializable {
    private String paymentId;
    private String status;
    private BigDecimal amount;
    private String timestamp;

    public String getPaymentId() { return paymentId; }
    public void setPaymentId(String paymentId) { this.paymentId = paymentId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
}
