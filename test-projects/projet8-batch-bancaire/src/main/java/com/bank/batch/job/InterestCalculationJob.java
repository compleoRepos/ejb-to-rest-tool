package com.bank.batch.job;

import com.bank.batch.service.ReportGeneratorBatch;

import javax.ejb.Schedule;
import javax.ejb.Singleton;
import javax.ejb.Startup;
import javax.ejb.Timer;
import javax.ejb.TimerService;
import javax.annotation.Resource;

/**
 * Tâche planifiée pour le calcul des intérêts.
 * S'exécute toutes les nuits à 2h du matin.
 *
 * @author Hamza NORDINE
 */
@Singleton
@Startup
public class InterestCalculationJob {

    @Resource
    private TimerService timerService;

    /**
     * Planifie l'exécution du batch de calcul des intérêts.
     * Se déclenche tous les jours à 2h du matin.
     */
    @Schedule(hour = "2", minute = "0", second = "0", persistent = false)
    public void executeInterestCalculation() {
        System.out.println("Début du batch de calcul des intérêts...");
        // Logique de calcul des intérêts pour tous les comptes éligibles
        // ...
        System.out.println("Fin du batch de calcul des intérêts.");

        // Déclenchement du batch de génération de rapports
        ReportGeneratorBatch reportGenerator = new ReportGeneratorBatch();
        reportGenerator.generateDailyReports(null);
    }

    /**
     * Méthode de timeout pour les timers programmatiques.
     * @param timer Le timer qui a expiré.
     */
    public void timeout(Timer timer) {
        System.out.println("Timeout du timer: " + timer.getInfo());
    }
}
src/main/java/com/bank/batch/processor/EndOfDayBatchProcessor.java
