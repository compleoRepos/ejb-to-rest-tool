package com.bank.dto;

import java.math.BigDecimal;

/**
 * DTO pour le transfert de données de compte.
 * 
 * @author Hamza NORDINE
 */
public class AccountDTO {

    private String accountNumber;
    private BigDecimal balance;

    public AccountDTO() {
    }

    public AccountDTO(String accountNumber, BigDecimal balance) {
        this.accountNumber = accountNumber;
        this.balance = balance;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    public BigDecimal getBalance() {
        return balance;
    }

    public void setBalance(BigDecimal balance) {
        this.balance = balance;
    }

    @Override
    public String toString() {
        return "AccountDTO{" +
                "accountNumber='" + accountNumber + '\'' +
                ", balance=" + balance +
                '}';
    }
}
