package com.bank.dto;

import java.math.BigDecimal;
import java.util.Date;

public class AccountDTO {
    private Long id;
    private String accountNumber;
    private String customerId;
    private String accountType;
    private BigDecimal balance;
    private String status;
    private Date createdDate;

    public Long getId() { return id; } public void setId(Long id) { this.id = id; }
    public String getAccountNumber() { return accountNumber; } public void setAccountNumber(String a) { this.accountNumber = a; }
    public String getCustomerId() { return customerId; } public void setCustomerId(String c) { this.customerId = c; }
    public String getAccountType() { return accountType; } public void setAccountType(String a) { this.accountType = a; }
    public BigDecimal getBalance() { return balance; } public void setBalance(BigDecimal b) { this.balance = b; }
    public String getStatus() { return status; } public void setStatus(String s) { this.status = s; }
    public Date getCreatedDate() { return createdDate; } public void setCreatedDate(Date d) { this.createdDate = d; }
}
