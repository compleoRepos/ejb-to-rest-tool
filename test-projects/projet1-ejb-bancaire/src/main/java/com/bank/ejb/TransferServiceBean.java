package com.bank.ejb;

import javax.ejb.Stateless;
import javax.ejb.EJB;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.TypedQuery;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

import com.bank.entity.Transfer;
import com.bank.entity.Account;
import com.bank.dto.TransferRequestDTO;
import com.bank.dto.TransferResultDTO;
import com.bank.exception.AccountNotFoundException;
import com.bank.exception.InsufficientFundsException;
import com.bank.exception.TransferException;

/**
 * Service EJB de gestion des virements bancaires.
 * Gère les virements internes, externes, et les virements programmés.
 * 
 * @author Hamza NORDINE
 */
@Stateless
public class TransferServiceBean implements TransferServiceRemote {

    private static final Logger LOGGER = Logger.getLogger(TransferServiceBean.class.getName());
    private static final BigDecimal MAX_SINGLE_TRANSFER = new BigDecimal("50000.00");
    private static final BigDecimal DAILY_LIMIT = new BigDecimal("100000.00");

    @PersistenceContext(unitName = "bankPU")
    private EntityManager entityManager;

    @EJB
    private AccountServiceBean accountService;

    @EJB
    private AuditServiceBean auditService;

    @EJB
    private NotificationServiceBean notificationService;

    @EJB
    private ComplianceServiceBean complianceService;

    /**
     * Exécute un virement entre deux comptes.
     */
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public TransferResultDTO executeTransfer(TransferRequestDTO request) 
            throws AccountNotFoundException, InsufficientFundsException, TransferException {
        
        LOGGER.info("Exécution du virement: " + request.getFromAccount() + " -> " + request.getToAccount());

        // Validation du montant
        validateTransferAmount(request.getAmount());

        // Vérification des limites journalières
        checkDailyLimit(request.getFromAccount(), request.getAmount());

        // Vérification de conformité (anti-blanchiment)
        if (!complianceService.checkTransferCompliance(request)) {
            throw new TransferException("Virement bloqué par le contrôle de conformité");
        }

        // Récupération des comptes
        Account sourceAccount = accountService.getAccountByNumber(request.getFromAccount());
        Account targetAccount = accountService.getAccountByNumber(request.getToAccount());

        // Vérification du solde
        if (sourceAccount.getBalance().compareTo(request.getAmount()) < 0) {
            throw new InsufficientFundsException(
                "Solde insuffisant sur le compte " + request.getFromAccount()
            );
        }

        // Exécution du virement
        String transferReference = generateTransferReference();

        // Débit du compte source
        accountService.withdraw(request.getFromAccount(), request.getAmount(), 
            "Virement vers " + request.getToAccount() + " - Réf: " + transferReference);

        // Crédit du compte destination
        accountService.deposit(request.getToAccount(), request.getAmount(),
            "Virement de " + request.getFromAccount() + " - Réf: " + transferReference);

        // Enregistrement du virement
        Transfer transfer = new Transfer();
        transfer.setReference(transferReference);
        transfer.setFromAccount(request.getFromAccount());
        transfer.setToAccount(request.getToAccount());
        transfer.setAmount(request.getAmount());
        transfer.setCurrency(request.getCurrency() != null ? request.getCurrency() : "EUR");
        transfer.setMotif(request.getMotif());
        transfer.setStatus("COMPLETED");
        transfer.setExecutionDate(new Date());
        transfer.setCreatedDate(new Date());
        transfer.setTransferType(determineTransferType(request));

        entityManager.persist(transfer);

        // Audit
        auditService.logAction("TRANSFER_EXECUTED", 
            "Virement " + transferReference + ": " + request.getAmount() + " EUR de " + 
            request.getFromAccount() + " vers " + request.getToAccount());

        // Notifications
        notificationService.sendTransferConfirmation(
            sourceAccount.getCustomerId(), transferReference, request.getAmount(), "DEBIT");
        notificationService.sendTransferConfirmation(
            targetAccount.getCustomerId(), transferReference, request.getAmount(), "CREDIT");

        // Résultat
        TransferResultDTO result = new TransferResultDTO();
        result.setReference(transferReference);
        result.setStatus("COMPLETED");
        result.setExecutionDate(new Date());
        result.setAmount(request.getAmount());
        result.setFromAccount(request.getFromAccount());
        result.setToAccount(request.getToAccount());

        LOGGER.info("Virement exécuté avec succès: " + transferReference);
        return result;
    }

    /**
     * Récupère l'historique des virements d'un compte.
     */
    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public List<Transfer> getTransferHistory(String accountNumber, Date fromDate, Date toDate) {
        TypedQuery<Transfer> query = entityManager.createQuery(
            "SELECT t FROM Transfer t WHERE (t.fromAccount = :acc OR t.toAccount = :acc) " +
            "AND t.executionDate BETWEEN :from AND :to ORDER BY t.executionDate DESC",
            Transfer.class
        );
        query.setParameter("acc", accountNumber);
        query.setParameter("from", fromDate);
        query.setParameter("to", toDate);
        return query.getResultList();
    }

    /**
     * Annule un virement en attente.
     */
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void cancelTransfer(String transferReference) throws TransferException {
        TypedQuery<Transfer> query = entityManager.createQuery(
            "SELECT t FROM Transfer t WHERE t.reference = :ref", Transfer.class
        );
        query.setParameter("ref", transferReference);

        List<Transfer> results = query.getResultList();
        if (results.isEmpty()) {
            throw new TransferException("Virement introuvable: " + transferReference);
        }

        Transfer transfer = results.get(0);
        if (!"PENDING".equals(transfer.getStatus())) {
            throw new TransferException("Seuls les virements en attente peuvent être annulés");
        }

        transfer.setStatus("CANCELLED");
        transfer.setLastModifiedDate(new Date());
        entityManager.merge(transfer);

        auditService.logAction("TRANSFER_CANCELLED", "Virement annulé: " + transferReference);
    }

    /**
     * Récupère le total des virements du jour pour un compte.
     */
    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public BigDecimal getDailyTransferTotal(String accountNumber) {
        TypedQuery<BigDecimal> query = entityManager.createQuery(
            "SELECT COALESCE(SUM(t.amount), 0) FROM Transfer t " +
            "WHERE t.fromAccount = :acc AND t.status = 'COMPLETED' " +
            "AND t.executionDate >= :today",
            BigDecimal.class
        );
        query.setParameter("acc", accountNumber);
        query.setParameter("today", getStartOfDay());

        BigDecimal result = query.getSingleResult();
        return result != null ? result : BigDecimal.ZERO;
    }

    private void validateTransferAmount(BigDecimal amount) throws TransferException {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new TransferException("Le montant du virement doit être positif");
        }
        if (amount.compareTo(MAX_SINGLE_TRANSFER) > 0) {
            throw new TransferException(
                "Le montant dépasse la limite par virement: " + MAX_SINGLE_TRANSFER + " EUR"
            );
        }
    }

    private void checkDailyLimit(String accountNumber, BigDecimal amount) throws TransferException {
        BigDecimal dailyTotal = getDailyTransferTotal(accountNumber);
        if (dailyTotal.add(amount).compareTo(DAILY_LIMIT) > 0) {
            throw new TransferException(
                "Limite journalière dépassée. Total du jour: " + dailyTotal + 
                ", Limite: " + DAILY_LIMIT + " EUR"
            );
        }
    }

    private String determineTransferType(TransferRequestDTO request) {
        if (request.getFromAccount().substring(0, 4).equals(request.getToAccount().substring(0, 4))) {
            return "INTERNAL";
        }
        return "EXTERNAL";
    }

    private String generateTransferReference() {
        return "VIR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    private Date getStartOfDay() {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0);
        cal.set(java.util.Calendar.MINUTE, 0);
        cal.set(java.util.Calendar.SECOND, 0);
        cal.set(java.util.Calendar.MILLISECOND, 0);
        return cal.getTime();
    }
}
