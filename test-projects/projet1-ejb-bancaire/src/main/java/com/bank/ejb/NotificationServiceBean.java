package com.bank.ejb;

import javax.ejb.Stateless;
import javax.ejb.Asynchronous;
import javax.ejb.EJB;
import java.math.BigDecimal;
import java.util.logging.Logger;

/**
 * Service EJB de notification client.
 * Gère l'envoi de notifications par email, SMS et push.
 * 
 * @author Hamza NORDINE
 */
@Stateless
public class NotificationServiceBean {

    private static final Logger LOGGER = Logger.getLogger(NotificationServiceBean.class.getName());

    @EJB
    private AuditServiceBean auditService;

    @Asynchronous
    public void sendAccountCreationNotification(String customerId, String accountNumber) {
        LOGGER.info("Notification de création de compte envoyée au client " + customerId);
        sendEmail(customerId, "Nouveau compte créé", 
            "Votre compte " + accountNumber + " a été créé avec succès.");
    }

    @Asynchronous
    public void sendAccountClosureNotification(String customerId, String accountNumber) {
        LOGGER.info("Notification de clôture de compte envoyée au client " + customerId);
        sendEmail(customerId, "Compte clôturé",
            "Votre compte " + accountNumber + " a été clôturé.");
    }

    @Asynchronous
    public void sendTransferConfirmation(String customerId, String reference, BigDecimal amount, String type) {
        String subject = "DEBIT".equals(type) ? "Virement émis" : "Virement reçu";
        String body = "Virement " + reference + " de " + amount + " EUR - " + type;
        LOGGER.info("Notification de virement envoyée au client " + customerId);
        sendEmail(customerId, subject, body);
    }

    @Asynchronous
    public void sendLargeTransactionAlert(String accountNumber, BigDecimal amount, String operationType) {
        LOGGER.warning("ALERTE: Transaction importante détectée - " + operationType + 
            " de " + amount + " EUR sur " + accountNumber);
        auditService.logSecurityEvent("LARGE_TRANSACTION", "SYSTEM",
            operationType + " de " + amount + " EUR sur " + accountNumber);
    }

    @Asynchronous
    public void sendFraudAlert(String accountNumber, String reason) {
        LOGGER.severe("ALERTE FRAUDE: " + accountNumber + " - " + reason);
        auditService.logSecurityEvent("FRAUD_ALERT", "SYSTEM",
            "Alerte fraude sur " + accountNumber + ": " + reason);
    }

    private void sendEmail(String customerId, String subject, String body) {
        // Simulation d'envoi d'email
        LOGGER.info("Email envoyé à " + customerId + ": " + subject);
    }
}
