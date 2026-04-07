package com.bank.batch.service;

import com.bank.batch.dto.ReportDTO;
import com.bank.batch.model.BatchResult;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.util.Date;
import java.util.List;
import java.util.ArrayList;

/**
 * Service de génération de rapports pour les batchs.
 * Crée des rapports sur l'état des comptes et les transactions.
 *
 * @author Hamza NORDINE
 */
@Stateless
public class ReportGeneratorBatch {

    @PersistenceContext(unitName = "bank-pu")
    private EntityManager entityManager;

    /**
     * Génère les rapports quotidiens.
     *
     * @param result Le résultat du batch précédent.
     * @return Un DTO contenant les informations du rapport.
     */
    public ReportDTO generateDailyReports(BatchResult result) {
        System.out.println("Génération des rapports quotidiens...");
        ReportDTO report = new ReportDTO();
        report.setReportName("Rapport Quotidien des Transactions");
        report.setGenerationDate(new Date());

        // Logique de récupération des données et de génération du rapport
        List<String> reportData = new ArrayList<>();
        reportData.add("Date: " + new Date());
        reportData.add("Nombre de transactions: 1234");
        reportData.add("Montant total: 56789.01 EUR");
        report.setData(reportData);

        System.out.println("Rapports quotidiens générés.");
        return report;
    }
}
src/main/java/com/bank/batch/service/AccountReconciliation.java
