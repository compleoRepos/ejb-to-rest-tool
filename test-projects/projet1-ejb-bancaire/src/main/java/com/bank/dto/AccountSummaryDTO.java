package com.bank.dto;

import java.math.BigDecimal;
import java.util.Date;

public class AccountSummaryDTO {
    private String accountNumber; private String accountType; private BigDecimal balance;
    private String status; private String customerId; private Date openDate; private int monthlyTransactionCount;
    public String getAccountNumber() { return accountNumber; } public void setAccountNumber(String a) { this.accountNumber = a; }
    public String getAccountType() { return accountType; } public void setAccountType(String a) { this.accountType = a; }
    public BigDecimal getBalance() { return balance; } public void setBalance(BigDecimal b) { this.balance = b; }
    public String getStatus() { return status; } public void setStatus(String s) { this.status = s; }
    public String getCustomerId() { return customerId; } public void setCustomerId(String c) { this.customerId = c; }
    public Date getOpenDate() { return openDate; } public void setOpenDate(Date d) { this.openDate = d; }
    public int getMonthlyTransactionCount() { return monthlyTransactionCount; } public void setMonthlyTransactionCount(int c) { this.monthlyTransactionCount = c; }
}
