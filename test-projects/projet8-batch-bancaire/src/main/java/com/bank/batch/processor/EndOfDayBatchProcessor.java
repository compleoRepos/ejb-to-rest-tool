package com.bank.batch.processor;

import com.bank.batch.model.BatchJob;
import com.bank.batch.model.BatchResult;
import com.bank.batch.exception.BatchProcessingException;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.util.Date;

/**
 * Processeur de batch pour les traitements de fin de journée.
 * Gère la clôture des transactions et la préparation des rapports.
 *
 * @author Hamza NORDINE
 */
public class EndOfDayBatchProcessor {

    @PersistenceContext(unitName = "bank-pu")
    private EntityManager entityManager;

    /**
     * Exécute le traitement de fin de journée.
     *
     * @param job Le travail de batch à exécuter.
     * @return Le résultat du batch.
     * @throws BatchProcessingException si une erreur survient lors du traitement.
     */
    public BatchResult process(BatchJob job) throws BatchProcessingException {
        System.out.println("Début du traitement de fin de journée pour le job: " + job.getJobName());
        BatchResult result = new BatchResult(job.getId(), "SUCCESS");
        result.setStartDate(new Date());

        try {
            // Simulation de traitement
            Thread.sleep(5000);

            long processedItems = entityManager.createQuery("SELECT COUNT(a) FROM Account a").getSingleResult();

            result.setProcessedItems(processedItems);
            System.out.println("Traitement de fin de journée terminé. " + processedItems + " comptes traités.");

        } catch (Exception e) {
            result.setStatus("FAILED");
            result.setErrorMessage(e.getMessage());
            throw new BatchProcessingException("Erreur lors du traitement de fin de journée", e);
        } finally {
            result.setEndDate(new Date());
        }

        return result;
    }
}
src/main/java/com/bank/batch/service/ReportGeneratorBatch.java
