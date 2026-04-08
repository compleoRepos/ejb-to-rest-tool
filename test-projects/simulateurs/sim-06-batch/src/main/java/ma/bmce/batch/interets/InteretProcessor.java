package ma.bmce.batch.interets;

import javax.batch.api.chunk.ItemProcessor;

public class InteretProcessor implements ItemProcessor {

    // Pattern A: Calcul d'intérêts en double — FIN-001 CRITICAL
    @Override
    public Object processItem(Object item) throws Exception {
        try {
            double solde = 50000.00; // from ResultSet
            double taux = 3.5;

            // FIN-001: Calcul financier en double !
            double interet = solde * (taux / 100) / 365;

            // Pattern B: Division entière — FIN-010
            long fin = System.currentTimeMillis();
            long debut = fin - 86400000L;
            int joursInterets = (int)((fin - debut) / 86400000);
            // Division de long par int = risk overflow

            return interet * joursInterets;
        } catch (Exception e) {
            // Pattern C: Retourne null silencieusement — TST-013, BATCH-007
            return null;
        }
    }
}
