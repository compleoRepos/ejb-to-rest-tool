/**
 * Exemples de code Java legacy pour démonstration.
 * @author Hamza NORDINE
 */

export const SAMPLE_EJB_INJECTION = `package com.bank.legacy.client;

import javax.ejb.EJB;
import javax.ejb.Stateless;

/**
 * Service client legacy utilisant des injections EJB.
 */
@Stateless
public class PaymentProcessor {

    @EJB
    TransferService transferService;

    @EJB
    AccountService accountService;

    @EJB
    AuditService auditService;

    public void processPayment(String fromAccount, String toAccount, double amount) {
        // Vérification du solde
        Account account = accountService.getAccount(fromAccount);

        // Exécution du virement
        TransferResult result = transferService.transferMoney(fromAccount, toAccount, amount);

        // Audit
        auditService.logAction("PAYMENT", result.getId());
    }

    public Account getAccountDetails(String accountId) {
        return accountService.getAccount(accountId);
    }

    public List<Transfer> getTransferHistory(String accountId) {
        return transferService.findTransfersByAccount(accountId);
    }
}`;

export const SAMPLE_JNDI_LOOKUP = `package com.bank.legacy.client;

import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;

/**
 * Service client legacy utilisant des lookups JNDI.
 */
public class LegacyPaymentClient {

    public TransferResult executeTransfer(String from, String to, double amount) {
        try {
            Context ctx = new InitialContext();

            TransferService service =
                (TransferService) ctx.lookup("java:global/bank/TransferService");

            TransferResult result = service.transferMoney(from, to, amount);

            AccountService accountService =
                (AccountService) ctx.lookup("java:global/bank/AccountService");

            Account fromAccount = accountService.getAccount(from);

            return result;
        } catch (NamingException e) {
            throw new RuntimeException("Erreur JNDI", e);
        }
    }
}`;

export const SAMPLE_COMPLEX = `package com.bank.legacy.batch;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.jms.JMSContext;
import javax.jms.Queue;
import javax.annotation.Resource;

/**
 * Service complexe avec transactions, JMS et dépendances multiples.
 */
@Stateless
public class BatchPaymentProcessor {

    @EJB
    TransferService transferService;

    @EJB
    AccountService accountService;

    @EJB
    NotificationService notificationService;

    @Resource(mappedName = "jms/PaymentQueue")
    private Queue paymentQueue;

    @Resource
    private JMSContext jmsContext;

    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void processBatchPayments(List<PaymentRequest> payments) {
        for (PaymentRequest payment : payments) {
            TransferResult result = transferService.transferMoney(
                payment.getFrom(), payment.getTo(), payment.getAmount()
            );

            notificationService.sendNotification(payment.getFrom(), "Virement effectué");

            // Envoi JMS pour traitement asynchrone
            jmsContext.createProducer().send(paymentQueue, result.getId());
        }
    }

    @TransactionAttribute(TransactionAttributeType.REQUIRES_NEW)
    public Account validateAccount(String accountId) {
        return accountService.getAccount(accountId);
    }

    public List<Transfer> getRecentTransfers(String accountId) {
        return transferService.findTransfersByAccount(accountId);
    }
}`;

export const SAMPLE_CODES = [
  { name: "Injection @EJB", code: SAMPLE_EJB_INJECTION },
  { name: "Lookup JNDI", code: SAMPLE_JNDI_LOOKUP },
  { name: "Complexe (JMS + Transactions)", code: SAMPLE_COMPLEX },
];
