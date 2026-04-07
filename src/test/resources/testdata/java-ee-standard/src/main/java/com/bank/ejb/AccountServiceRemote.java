package com.bank.ejb;

import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.List;

@Remote
public interface AccountServiceRemote {

    AccountInfo getAccountDetails(String accountId);

    BigDecimal getBalance(String accountId);

    List<TransactionInfo> getTransactionHistory(String accountId, String fromDate, String toDate);
}
