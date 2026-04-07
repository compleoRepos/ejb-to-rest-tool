package com.bank.batch.service;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

/**
 * Service de rapprochement bancaire.
 * Vérifie la cohérence des soldes et des transactions.
 *
 * @author Hamza NORDINE
 */
@Stateless
public class AccountReconciliation {

    @PersistenceContext(unitName = "bank-pu")
    private EntityManager entityManager;

    /**
     * Exécute le processus de rapprochement bancaire.
     */
    public void reconcileAccounts() {
        System.out.println("Début du rapprochement bancaire...");

        // Logique de rapprochement
        Long countMismatched = (Long) entityManager.createQuery("SELECT count(t) FROM Transaction t WHERE t.status = 'UNRECONCILED'").getSingleResult();

        if (countMismatched > 0) {
            System.out.println("Attention: " + countMismatched + " transactions non rapprochées trouvées.");
        } else {
            System.out.println("Toutes les transactions sont rapprochées avec succès.");
        }

        System.out.println("Fin du rapprochement bancaire.");
    }
}
src/main/java/com/bank/batch/model/BatchJob.java
