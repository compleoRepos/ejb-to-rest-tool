package com.bank.soap.ws;

import com.bank.soap.dto.AccountInfoDTO;
import com.bank.soap.exception.ServiceFault;
import com.bank.soap.exception.ServiceFaultException;
import com.bank.soap.model.Account;
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
 * Service Web SOAP pour la gestion des comptes bancaires.
 * Expose des opérations pour obtenir des informations sur les comptes et créer de nouveaux comptes.
 *
 * @author Hamza NORDINE
 */
@WebService(serviceName = "AccountService")
@SOAPBinding(style = SOAPBinding.Style.DOCUMENT, use = SOAPBinding.Use.LITERAL)
public class AccountWebService {

    private static final Map<String, Account> accounts = new HashMap<>();

    static {
        accounts.put("ACC12345", new Account("ACC12345", "John Doe", new BigDecimal("1000.00"), "USD"));
        accounts.put("ACC67890", new Account("ACC67890", "Jane Smith", new BigDecimal("5000.00"), "EUR"));
    }

    /**
     * Récupère les informations d'un compte.
     *
     * @param accountNumber le numéro du compte
     * @return les informations du compte
     * @throws ServiceFaultException si le compte n'est pas trouvé
     */
    @WebMethod
    @WebResult(name = "accountInfo")
    public AccountInfoDTO getAccountInfo(@WebParam(name = "accountNumber") String accountNumber) throws ServiceFaultException {
        SoapHelper.validateNotEmpty(accountNumber, "Account number cannot be empty");
        Account account = accounts.get(accountNumber);
        if (account == null) {
            throw new ServiceFaultException("Account not found", new ServiceFault("E404", "Account with number " + accountNumber + " not found."));
        }
        return new AccountInfoDTO(account.getAccountNumber(), account.getOwnerName(), account.getBalance(), account.getCurrency());
    }

    /**
     * Crée un nouveau compte.
     *
     * @param ownerName le nom du propriétaire
     * @param initialBalance le solde initial
     * @param currency la devise
     * @return les informations du compte créé
     * @throws ServiceFaultException si les paramètres sont invalides
     */
    @WebMethod
    @WebResult(name = "createdAccountInfo")
    public AccountInfoDTO createAccount(
            @WebParam(name = "ownerName") String ownerName,
            @WebParam(name = "initialBalance") BigDecimal initialBalance,
            @WebParam(name = "currency") String currency) throws ServiceFaultException {
        SoapHelper.validateNotEmpty(ownerName, "Owner name cannot be empty");
        SoapHelper.validateNotNull(initialBalance, "Initial balance cannot be null");
        SoapHelper.validateNotEmpty(currency, "Currency cannot be empty");

        String accountNumber = "ACC" + (accounts.size() + 1);
        Account newAccount = new Account(accountNumber, ownerName, initialBalance, currency);
        accounts.put(accountNumber, newAccount);

        return new AccountInfoDTO(newAccount.getAccountNumber(), newAccount.getOwnerName(), newAccount.getBalance(), newAccount.getCurrency());
    }
}
