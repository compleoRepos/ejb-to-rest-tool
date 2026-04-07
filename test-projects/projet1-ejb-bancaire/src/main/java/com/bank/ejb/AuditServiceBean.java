package com.bank.ejb;

import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.util.Date;
import java.util.logging.Logger;

import com.bank.entity.AuditLog;

/**
 * Service EJB d'audit et de traçabilité.
 * Enregistre toutes les actions critiques du système bancaire.
 * 
 * @author Hamza NORDINE
 */
@Stateless
public class AuditServiceBean {

    private static final Logger LOGGER = Logger.getLogger(AuditServiceBean.class.getName());

    @PersistenceContext(unitName = "bankPU")
    private EntityManager entityManager;

    @TransactionAttribute(TransactionAttributeType.REQUIRES_NEW)
    public void logAction(String actionType, String description) {
        AuditLog log = new AuditLog();
        log.setActionType(actionType);
        log.setDescription(description);
        log.setTimestamp(new Date());
        log.setUserId(getCurrentUserId());
        log.setIpAddress(getCurrentIpAddress());
        log.setModule("BANKING");

        entityManager.persist(log);
        LOGGER.info("[AUDIT] " + actionType + ": " + description);
    }

    @TransactionAttribute(TransactionAttributeType.REQUIRES_NEW)
    public void logSecurityEvent(String eventType, String userId, String details) {
        AuditLog log = new AuditLog();
        log.setActionType("SECURITY_" + eventType);
        log.setDescription(details);
        log.setTimestamp(new Date());
        log.setUserId(userId);
        log.setIpAddress(getCurrentIpAddress());
        log.setModule("SECURITY");
        log.setSeverity("HIGH");

        entityManager.persist(log);
        LOGGER.warning("[SECURITY] " + eventType + " - User: " + userId + " - " + details);
    }

    private String getCurrentUserId() {
        // Simulation - en production, récupéré du contexte de sécurité
        return "SYSTEM";
    }

    private String getCurrentIpAddress() {
        return "127.0.0.1";
    }
}
