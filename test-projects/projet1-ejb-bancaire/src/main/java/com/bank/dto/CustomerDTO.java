package com.bank.dto;

import java.util.Date;

public class CustomerDTO {
    private String firstName; private String lastName; private String email;
    private String phone; private String address; private Date dateOfBirth; private String nationalId;
    public String getFirstName() { return firstName; } public void setFirstName(String f) { this.firstName = f; }
    public String getLastName() { return lastName; } public void setLastName(String l) { this.lastName = l; }
    public String getEmail() { return email; } public void setEmail(String e) { this.email = e; }
    public String getPhone() { return phone; } public void setPhone(String p) { this.phone = p; }
    public String getAddress() { return address; } public void setAddress(String a) { this.address = a; }
    public Date getDateOfBirth() { return dateOfBirth; } public void setDateOfBirth(Date d) { this.dateOfBirth = d; }
    public String getNationalId() { return nationalId; } public void setNationalId(String n) { this.nationalId = n; }
}
