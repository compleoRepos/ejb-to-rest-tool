package com.bank.ejb;

import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.util.List;

@Stateless
public class AccountServiceBean implements AccountServiceRemote {

    @Override
    public AccountInfo getAccountDetails(String accountId) {
        // Business logic
        return new AccountInfo();
    }

    @Override
    public BigDecimal getBalance(String accountId) {
        return BigDecimal.ZERO;
    }

    @Override
    public List<TransactionInfo> getTransactionHistory(String accountId, String fromDate, String toDate) {
        return List.of();
    }
}
