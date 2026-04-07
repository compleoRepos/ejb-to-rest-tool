package com.bank.entity;

import javax.persistence.*;
import java.util.Date;

@Entity @Table(name = "CUSTOMERS")
public class Customer {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "FIRST_NAME") private String firstName;
    @Column(name = "LAST_NAME") private String lastName;
    @Column(name = "EMAIL") private String email;
    @Column(name = "PHONE") private String phone;
    @Column(name = "ADDRESS") private String address;
    @Temporal(TemporalType.DATE) @Column(name = "DATE_OF_BIRTH") private Date dateOfBirth;
    @Column(name = "NATIONAL_ID") private String nationalId;
    @Column(name = "STATUS") private String status;
    @Column(name = "KYC_STATUS") private String kycStatus;
    @Temporal(TemporalType.TIMESTAMP) @Column(name = "CREATED_DATE") private Date createdDate;
    @Temporal(TemporalType.TIMESTAMP) @Column(name = "LAST_MODIFIED_DATE") private Date lastModifiedDate;

    public Long getId() { return id; } public void setId(Long id) { this.id = id; }
    public String getFirstName() { return firstName; } public void setFirstName(String n) { this.firstName = n; }
    public String getLastName() { return lastName; } public void setLastName(String n) { this.lastName = n; }
    public String getEmail() { return email; } public void setEmail(String e) { this.email = e; }
    public String getPhone() { return phone; } public void setPhone(String p) { this.phone = p; }
    public String getAddress() { return address; } public void setAddress(String a) { this.address = a; }
    public Date getDateOfBirth() { return dateOfBirth; } public void setDateOfBirth(Date d) { this.dateOfBirth = d; }
    public String getNationalId() { return nationalId; } public void setNationalId(String n) { this.nationalId = n; }
    public String getStatus() { return status; } public void setStatus(String s) { this.status = s; }
    public String getKycStatus() { return kycStatus; } public void setKycStatus(String k) { this.kycStatus = k; }
    public Date getCreatedDate() { return createdDate; } public void setCreatedDate(Date d) { this.createdDate = d; }
    public Date getLastModifiedDate() { return lastModifiedDate; } public void setLastModifiedDate(Date d) { this.lastModifiedDate = d; }
}
