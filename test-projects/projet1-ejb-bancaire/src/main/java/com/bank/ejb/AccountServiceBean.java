package com.bank.ejb;

import javax.ejb.Stateless;
import javax.ejb.EJB;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.TypedQuery;
import java.math.BigDecimal;
import java.util.List;
import java.util.Date;
import java.util.logging.Logger;

import com.bank.entity.Account;
import com.bank.entity.AccountHistory;
import com.bank.dto.AccountDTO;
import com.bank.dto.AccountSummaryDTO;
import com.bank.exception.AccountNotFoundException;
import com.bank.exception.InsufficientFundsException;

/**
 * Service EJB de gestion des comptes bancaires.
 * Gère les opérations CRUD, les soldes et l'historique des comptes.
 * 
 * @author Hamza NORDINE
 */
@Stateless
public class AccountServiceBean implements AccountServiceRemote {

    private static final Logger LOGGER = Logger.getLogger(AccountServiceBean.class.getName());

    @PersistenceContext(unitName = "bankPU")
    private EntityManager entityManager;

    @EJB
    private AuditServiceBean auditService;

    @EJB
    private NotificationServiceBean notificationService;

    @EJB
    private CustomerServiceBean customerService;

    /**
     * Crée un nouveau compte bancaire pour un client.
     */
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public Account createAccount(String customerId, String accountType, BigDecimal initialDeposit) {
        LOGGER.info("Création du compte pour le client: " + customerId);

        if (initialDeposit.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("Le dépôt initial ne peut pas être négatif");
        }

        // Vérifier que le client existe
        if (!customerService.customerExists(customerId)) {
            throw new IllegalArgumentException("Client introuvable: " + customerId);
        }

        Account account = new Account();
        account.setCustomerId(customerId);
        account.setAccountType(accountType);
        account.setBalance(initialDeposit);
        account.setStatus("ACTIVE");
        account.setCreatedDate(new Date());
        account.setLastModifiedDate(new Date());
        account.setAccountNumber(generateAccountNumber());

        entityManager.persist(account);
        entityManager.flush();

        // Enregistrer dans l'historique
        AccountHistory history = new AccountHistory();
        history.setAccountId(account.getId());
        history.setOperation("CREATION");
        history.setAmount(initialDeposit);
        history.setBalanceAfter(initialDeposit);
        history.setOperationDate(new Date());
        history.setDescription("Ouverture de compte - Dépôt initial");
        entityManager.persist(history);

        // Audit
        auditService.logAction("ACCOUNT_CREATED", "Compte créé: " + account.getAccountNumber());

        // Notification
        notificationService.sendAccountCreationNotification(customerId, account.getAccountNumber());

        LOGGER.info("Compte créé avec succès: " + account.getAccountNumber());
        return account;
    }

    /**
     * Récupère un compte par son numéro.
     */
    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public Account getAccountByNumber(String accountNumber) throws AccountNotFoundException {
        TypedQuery<Account> query = entityManager.createQuery(
            "SELECT a FROM Account a WHERE a.accountNumber = :num AND a.status != 'CLOSED'",
            Account.class
        );
        query.setParameter("num", accountNumber);

        List<Account> results = query.getResultList();
        if (results.isEmpty()) {
            throw new AccountNotFoundException("Compte introuvable: " + accountNumber);
        }
        return results.get(0);
    }

    /**
     * Récupère tous les comptes d'un client.
     */
    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public List<Account> getAccountsByCustomer(String customerId) {
        TypedQuery<Account> query = entityManager.createQuery(
            "SELECT a FROM Account a WHERE a.customerId = :cid AND a.status = 'ACTIVE' ORDER BY a.createdDate DESC",
            Account.class
        );
        query.setParameter("cid", customerId);
        return query.getResultList();
    }

    /**
     * Consulte le solde d'un compte.
     */
    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public BigDecimal getBalance(String accountNumber) throws AccountNotFoundException {
        Account account = getAccountByNumber(accountNumber);
        return account.getBalance();
    }

    /**
     * Effectue un dépôt sur un compte.
     */
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public Account deposit(String accountNumber, BigDecimal amount, String description)
            throws AccountNotFoundException {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Le montant du dépôt doit être positif");
        }

        Account account = getAccountByNumber(accountNumber);
        BigDecimal newBalance = account.getBalance().add(amount);
        account.setBalance(newBalance);
        account.setLastModifiedDate(new Date());

        entityManager.merge(account);

        // Historique
        AccountHistory history = new AccountHistory();
        history.setAccountId(account.getId());
        history.setOperation("DEPOSIT");
        history.setAmount(amount);
        history.setBalanceAfter(newBalance);
        history.setOperationDate(new Date());
        history.setDescription(description != null ? description : "Dépôt");
        entityManager.persist(history);

        auditService.logAction("DEPOSIT", "Dépôt de " + amount + " sur " + accountNumber);

        // Notification si dépôt important
        if (amount.compareTo(new BigDecimal("10000")) > 0) {
            notificationService.sendLargeTransactionAlert(accountNumber, amount, "DEPOSIT");
        }

        return account;
    }

    /**
     * Effectue un retrait sur un compte.
     */
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public Account withdraw(String accountNumber, BigDecimal amount, String description)
            throws AccountNotFoundException, InsufficientFundsException {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Le montant du retrait doit être positif");
        }

        Account account = getAccountByNumber(accountNumber);

        if (account.getBalance().compareTo(amount) < 0) {
            throw new InsufficientFundsException(
                "Solde insuffisant. Disponible: " + account.getBalance() + ", Demandé: " + amount
            );
        }

        BigDecimal newBalance = account.getBalance().subtract(amount);
        account.setBalance(newBalance);
        account.setLastModifiedDate(new Date());

        entityManager.merge(account);

        // Historique
        AccountHistory history = new AccountHistory();
        history.setAccountId(account.getId());
        history.setOperation("WITHDRAWAL");
        history.setAmount(amount.negate());
        history.setBalanceAfter(newBalance);
        history.setOperationDate(new Date());
        history.setDescription(description != null ? description : "Retrait");
        entityManager.persist(history);

        auditService.logAction("WITHDRAWAL", "Retrait de " + amount + " sur " + accountNumber);

        if (amount.compareTo(new BigDecimal("10000")) > 0) {
            notificationService.sendLargeTransactionAlert(accountNumber, amount, "WITHDRAWAL");
        }

        return account;
    }

    /**
     * Clôture un compte bancaire.
     */
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void closeAccount(String accountNumber) throws AccountNotFoundException {
        Account account = getAccountByNumber(accountNumber);

        if (account.getBalance().compareTo(BigDecimal.ZERO) != 0) {
            throw new IllegalStateException("Le compte doit avoir un solde nul pour être clôturé");
        }

        account.setStatus("CLOSED");
        account.setLastModifiedDate(new Date());
        entityManager.merge(account);

        auditService.logAction("ACCOUNT_CLOSED", "Compte clôturé: " + accountNumber);
        notificationService.sendAccountClosureNotification(account.getCustomerId(), accountNumber);
    }

    /**
     * Récupère l'historique des opérations d'un compte.
     */
    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public List<AccountHistory> getAccountHistory(String accountNumber, Date fromDate, Date toDate)
            throws AccountNotFoundException {
        Account account = getAccountByNumber(accountNumber);

        TypedQuery<AccountHistory> query = entityManager.createQuery(
            "SELECT h FROM AccountHistory h WHERE h.accountId = :aid " +
            "AND h.operationDate BETWEEN :from AND :to ORDER BY h.operationDate DESC",
            AccountHistory.class
        );
        query.setParameter("aid", account.getId());
        query.setParameter("from", fromDate);
        query.setParameter("to", toDate);

        return query.getResultList();
    }

    /**
     * Calcule le résumé d'un compte.
     */
    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public AccountSummaryDTO getAccountSummary(String accountNumber) throws AccountNotFoundException {
        Account account = getAccountByNumber(accountNumber);

        AccountSummaryDTO summary = new AccountSummaryDTO();
        summary.setAccountNumber(accountNumber);
        summary.setAccountType(account.getAccountType());
        summary.setBalance(account.getBalance());
        summary.setStatus(account.getStatus());
        summary.setCustomerId(account.getCustomerId());
        summary.setOpenDate(account.getCreatedDate());

        // Calculer le nombre d'opérations du mois
        TypedQuery<Long> countQuery = entityManager.createQuery(
            "SELECT COUNT(h) FROM AccountHistory h WHERE h.accountId = :aid " +
            "AND h.operationDate >= :startOfMonth",
            Long.class
        );
        countQuery.setParameter("aid", account.getId());
        countQuery.setParameter("startOfMonth", getStartOfMonth());
        summary.setMonthlyTransactionCount(countQuery.getSingleResult().intValue());

        return summary;
    }

    /**
     * Convertit un compte en DTO.
     */
    public AccountDTO toDTO(Account account) {
        AccountDTO dto = new AccountDTO();
        dto.setId(account.getId());
        dto.setAccountNumber(account.getAccountNumber());
        dto.setCustomerId(account.getCustomerId());
        dto.setAccountType(account.getAccountType());
        dto.setBalance(account.getBalance());
        dto.setStatus(account.getStatus());
        dto.setCreatedDate(account.getCreatedDate());
        return dto;
    }

    private String generateAccountNumber() {
        return "FR76" + String.format("%020d", System.nanoTime() % 100000000000000L);
    }

    private Date getStartOfMonth() {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.set(java.util.Calendar.DAY_OF_MONTH, 1);
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0);
        cal.set(java.util.Calendar.MINUTE, 0);
        cal.set(java.util.Calendar.SECOND, 0);
        cal.set(java.util.Calendar.MILLISECOND, 0);
        return cal.getTime();
    }
}
