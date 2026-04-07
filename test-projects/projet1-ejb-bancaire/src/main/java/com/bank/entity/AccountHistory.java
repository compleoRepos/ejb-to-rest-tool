package com.bank.entity;

import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;

@Entity @Table(name = "ACCOUNT_HISTORY")
public class AccountHistory {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "ACCOUNT_ID") private Long accountId;
    @Column(name = "OPERATION") private String operation;
    @Column(name = "AMOUNT", precision = 15, scale = 2) private BigDecimal amount;
    @Column(name = "BALANCE_AFTER", precision = 15, scale = 2) private BigDecimal balanceAfter;
    @Temporal(TemporalType.TIMESTAMP) @Column(name = "OPERATION_DATE") private Date operationDate;
    @Column(name = "DESCRIPTION") private String description;

    public Long getId() { return id; } public void setId(Long id) { this.id = id; }
    public Long getAccountId() { return accountId; } public void setAccountId(Long a) { this.accountId = a; }
    public String getOperation() { return operation; } public void setOperation(String o) { this.operation = o; }
    public BigDecimal getAmount() { return amount; } public void setAmount(BigDecimal a) { this.amount = a; }
    public BigDecimal getBalanceAfter() { return balanceAfter; } public void setBalanceAfter(BigDecimal b) { this.balanceAfter = b; }
    public Date getOperationDate() { return operationDate; } public void setOperationDate(Date d) { this.operationDate = d; }
    public String getDescription() { return description; } public void setDescription(String d) { this.description = d; }
}
