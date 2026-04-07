package com.bank.soap.ws;

import com.bank.soap.dto.TransferRequestDTO;
import com.bank.soap.exception.ServiceFault;
import com.bank.soap.exception.ServiceFaultException;
import com.bank.soap.model.Account;
import com.bank.soap.model.Transfer;
import com.bank.soap.util.SoapHelper;

import javax.jws.WebMethod;
import javax.jws.WebParam;
import javax.jws.WebResult;
import javax.jws.WebService;
import javax.jws.soap.SOAPBinding;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

/**
 * Service Web SOAP pour les virements bancaires.
 * Permet d'exécuter des virements entre comptes.
 *
 * @author Hamza NORDINE
 */
@WebService(serviceName = "TransferService")
@SOAPBinding(style = SOAPBinding.Style.DOCUMENT, use = SOAPBinding.Use.LITERAL)
public class TransferWebService {

    // Simule une base de données de comptes
    private static final Map<String, Account> accounts = new HashMap<>();

    static {
        accounts.put("ACC12345", new Account("ACC12345", "John Doe", new BigDecimal("1000.00"), "USD"));
        accounts.put("ACC67890", new Account("ACC67890", "Jane Smith", new BigDecimal("5000.00"), "EUR"));
    }

    /**
     * Exécute un virement entre deux comptes.
     *
     * @param transferRequest les détails du virement
     * @return l'identifiant de la transaction
     * @throws ServiceFaultException si une erreur survient
     */
    @WebMethod
    @WebResult(name = "transactionId")
    public String executeTransfer(@WebParam(name = "transferRequest") TransferRequestDTO transferRequest) throws ServiceFaultException {
        SoapHelper.validateNotNull(transferRequest, "Transfer request cannot be null");

        String fromAccountNum = transferRequest.getFromAccountNumber();
        String toAccountNum = transferRequest.getToAccountNumber();
        BigDecimal amount = transferRequest.getAmount();

        SoapHelper.validateNotEmpty(fromAccountNum, "From account number cannot be empty");
        SoapHelper.validateNotEmpty(toAccountNum, "To account number cannot be empty");
        SoapHelper.validateNotNull(amount, "Amount cannot be null");

        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ServiceFaultException("Invalid amount", new ServiceFault("E400", "Transfer amount must be positive."));
        }

        Account fromAccount = accounts.get(fromAccountNum);
        Account toAccount = accounts.get(toAccountNum);

        if (fromAccount == null) {
            throw new ServiceFaultException("Source account not found", new ServiceFault("E404", "Source account " + fromAccountNum + " not found."));
        }
        if (toAccount == null) {
            throw new ServiceFaultException("Destination account not found", new ServiceFault("E404", "Destination account " + toAccountNum + " not found."));
        }

        if (!fromAccount.getCurrency().equals(toAccount.getCurrency())) {
            throw new ServiceFaultException("Currency mismatch", new ServiceFault("E400", "Currency conversion not supported in this version."));
        }

        if (fromAccount.getBalance().compareTo(amount) < 0) {
            throw new ServiceFaultException("Insufficient funds", new ServiceFault("E402", "Insufficient funds in account " + fromAccountNum));
        }

        // Exécution du virement
        fromAccount.setBalance(fromAccount.getBalance().subtract(amount));
        toAccount.setBalance(toAccount.getBalance().add(amount));

        Transfer transfer = new Transfer(fromAccountNum, toAccountNum, amount, fromAccount.getCurrency());
        transfer.setStatus("COMPLETED");

        // Logique de persistance du virement (simulée)
        System.out.println("Transfer executed: " + transfer);

        return transfer.getTransactionId();
    }
}
