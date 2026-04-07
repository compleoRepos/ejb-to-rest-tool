package com.bank.ejb;

import javax.ejb.Stateless;
import javax.ejb.EJB;
import java.math.BigDecimal;
import java.util.logging.Logger;

import com.bank.dto.TransferRequestDTO;

/**
 * Service EJB de conformité et anti-blanchiment.
 * @author Hamza NORDINE
 */
@Stateless
public class ComplianceServiceBean {

    private static final Logger LOGGER = Logger.getLogger(ComplianceServiceBean.class.getName());
    private static final BigDecimal AML_THRESHOLD = new BigDecimal("15000.00");

    @EJB
    private AuditServiceBean auditService;

    @EJB
    private NotificationServiceBean notificationService;

    public boolean checkTransferCompliance(TransferRequestDTO request) {
        LOGGER.info("Vérification de conformité pour le virement: " + request.getFromAccount());

        // Vérification du seuil anti-blanchiment
        if (request.getAmount().compareTo(AML_THRESHOLD) > 0) {
            auditService.logSecurityEvent("AML_CHECK", "SYSTEM",
                "Virement de " + request.getAmount() + " EUR soumis au contrôle AML");
            
            // Vérification des listes de sanctions
            if (isOnSanctionsList(request.getToAccount())) {
                notificationService.sendFraudAlert(request.getFromAccount(),
                    "Tentative de virement vers un compte sous sanctions");
                return false;
            }
        }

        // Vérification des patterns suspects
        if (isSuspiciousPattern(request)) {
            auditService.logSecurityEvent("SUSPICIOUS_PATTERN", "SYSTEM",
                "Pattern suspect détecté sur " + request.getFromAccount());
            return false;
        }

        return true;
    }

    private boolean isOnSanctionsList(String accountNumber) {
        // Simulation - en production, appel à un service externe
        return false;
    }

    private boolean isSuspiciousPattern(TransferRequestDTO request) {
        // Simulation de détection de patterns suspects
        return false;
    }
}
