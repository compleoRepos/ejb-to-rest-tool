package com.bank.service;

import java.io.Serializable;
import java.math.BigDecimal;

public class PaymentRequest implements Serializable {
    private String fromAccount;
    private String toAccount;
    private BigDecimal amount;
    private String currency;
    private String motif;

    public String getFromAccount() { return fromAccount; }
    public void setFromAccount(String fromAccount) { this.fromAccount = fromAccount; }
    public String getToAccount() { return toAccount; }
    public void setToAccount(String toAccount) { this.toAccount = toAccount; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getMotif() { return motif; }
    public void setMotif(String motif) { this.motif = motif; }
}
