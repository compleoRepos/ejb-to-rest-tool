package com.bank.entity;

import javax.persistence.*;
import java.util.Date;

@Entity @Table(name = "AUDIT_LOG")
public class AuditLog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "ACTION_TYPE") private String actionType;
    @Column(name = "DESCRIPTION", length = 1000) private String description;
    @Temporal(TemporalType.TIMESTAMP) @Column(name = "TIMESTAMP") private Date timestamp;
    @Column(name = "USER_ID") private String userId;
    @Column(name = "IP_ADDRESS") private String ipAddress;
    @Column(name = "MODULE") private String module;
    @Column(name = "SEVERITY") private String severity;

    public Long getId() { return id; } public void setId(Long id) { this.id = id; }
    public String getActionType() { return actionType; } public void setActionType(String a) { this.actionType = a; }
    public String getDescription() { return description; } public void setDescription(String d) { this.description = d; }
    public Date getTimestamp() { return timestamp; } public void setTimestamp(Date t) { this.timestamp = t; }
    public String getUserId() { return userId; } public void setUserId(String u) { this.userId = u; }
    public String getIpAddress() { return ipAddress; } public void setIpAddress(String i) { this.ipAddress = i; }
    public String getModule() { return module; } public void setModule(String m) { this.module = m; }
    public String getSeverity() { return severity; } public void setSeverity(String s) { this.severity = s; }
}
