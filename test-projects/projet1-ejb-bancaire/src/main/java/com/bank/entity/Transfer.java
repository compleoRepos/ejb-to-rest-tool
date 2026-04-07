package com.bank.entity;

import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;

@Entity
@Table(name = "TRANSFERS")
public class Transfer {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "REFERENCE", unique = true) private String reference;
    @Column(name = "FROM_ACCOUNT") private String fromAccount;
    @Column(name = "TO_ACCOUNT") private String toAccount;
    @Column(name = "AMOUNT", precision = 15, scale = 2) private BigDecimal amount;
    @Column(name = "CURRENCY", length = 3) private String currency;
    @Column(name = "MOTIF") private String motif;
    @Column(name = "STATUS", length = 20) private String status;
    @Column(name = "TRANSFER_TYPE", length = 20) private String transferType;
    @Temporal(TemporalType.TIMESTAMP) @Column(name = "EXECUTION_DATE") private Date executionDate;
    @Temporal(TemporalType.TIMESTAMP) @Column(name = "CREATED_DATE") private Date createdDate;
    @Temporal(TemporalType.TIMESTAMP) @Column(name = "LAST_MODIFIED_DATE") private Date lastModifiedDate;

    public Long getId() { return id; } public void setId(Long id) { this.id = id; }
    public String getReference() { return reference; } public void setReference(String r) { this.reference = r; }
    public String getFromAccount() { return fromAccount; } public void setFromAccount(String f) { this.fromAccount = f; }
    public String getToAccount() { return toAccount; } public void setToAccount(String t) { this.toAccount = t; }
    public BigDecimal getAmount() { return amount; } public void setAmount(BigDecimal a) { this.amount = a; }
    public String getCurrency() { return currency; } public void setCurrency(String c) { this.currency = c; }
    public String getMotif() { return motif; } public void setMotif(String m) { this.motif = m; }
    public String getStatus() { return status; } public void setStatus(String s) { this.status = s; }
    public String getTransferType() { return transferType; } public void setTransferType(String t) { this.transferType = t; }
    public Date getExecutionDate() { return executionDate; } public void setExecutionDate(Date d) { this.executionDate = d; }
    public Date getCreatedDate() { return createdDate; } public void setCreatedDate(Date d) { this.createdDate = d; }
    public Date getLastModifiedDate() { return lastModifiedDate; } public void setLastModifiedDate(Date d) { this.lastModifiedDate = d; }
}
