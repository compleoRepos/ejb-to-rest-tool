package com.bank.dto;

import java.math.BigDecimal;
import java.util.Date;

public class TransferResultDTO {
    private String reference; private String status; private Date executionDate;
    private BigDecimal amount; private String fromAccount; private String toAccount;
    public String getReference() { return reference; } public void setReference(String r) { this.reference = r; }
    public String getStatus() { return status; } public void setStatus(String s) { this.status = s; }
    public Date getExecutionDate() { return executionDate; } public void setExecutionDate(Date d) { this.executionDate = d; }
    public BigDecimal getAmount() { return amount; } public void setAmount(BigDecimal a) { this.amount = a; }
    public String getFromAccount() { return fromAccount; } public void setFromAccount(String f) { this.fromAccount = f; }
    public String getToAccount() { return toAccount; } public void setToAccount(String t) { this.toAccount = t; }
}
