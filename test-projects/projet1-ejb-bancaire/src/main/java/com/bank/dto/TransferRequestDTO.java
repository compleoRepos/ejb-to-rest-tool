package com.bank.dto;

import java.math.BigDecimal;

public class TransferRequestDTO {
    private String fromAccount; private String toAccount; private BigDecimal amount;
    private String currency; private String motif;
    public String getFromAccount() { return fromAccount; } public void setFromAccount(String f) { this.fromAccount = f; }
    public String getToAccount() { return toAccount; } public void setToAccount(String t) { this.toAccount = t; }
    public BigDecimal getAmount() { return amount; } public void setAmount(BigDecimal a) { this.amount = a; }
    public String getCurrency() { return currency; } public void setCurrency(String c) { this.currency = c; }
    public String getMotif() { return motif; } public void setMotif(String m) { this.motif = m; }
}
