package ma.bmce.credit.usecases;

import ma.bmce.credit.dto.EcheanceDto;
import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Stateless
public class SimulerCreditUC {

    public Object execute(BigDecimal montantCapital, BigDecimal apportPersonnel,
                          Integer dureeAns, String typeCredit,
                          BigDecimal tauxPropose, Boolean assuranceInclusse,
                          Integer agePrimaire, Integer ageSecondaire) {

        // Pattern A: Tableau d'amortissement avec calcul en double — FIN-001, FIN-010, FIN-011
        double capital = montantCapital.doubleValue() - apportPersonnel.doubleValue();
        double tauxMensuel = tauxPropose.doubleValue() / 100 / 12;
        int nbreMois = dureeAns * 12;

        // Calcul mensualité en double — CRITICAL FIN-001
        double mensualite = capital * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -nbreMois));

        // Pattern F: Calcul TEG incorrect — FIN-023
        BigDecimal taux = tauxPropose;
        BigDecimal assurance = new BigDecimal("0.36");
        BigDecimal fraisDossier = new BigDecimal("0.50");
        BigDecimal teg = taux.add(assurance).add(fraisDossier);
        // Calcul simplifié, pas la formule officielle du TEG

        // Génération tableau d'amortissement
        List<EcheanceDto> tableau = new ArrayList<>();
        double capitalRestant = capital;
        for (int i = 1; i <= nbreMois; i++) {
            double interets = capitalRestant * tauxMensuel;
            double capitalRembourse = mensualite - interets;
            capitalRestant -= capitalRembourse;

            EcheanceDto echeance = new EcheanceDto();
            echeance.setNumero(i);
            echeance.setDate(LocalDate.now().plusMonths(i));
            echeance.setCapital(new BigDecimal(capitalRembourse));
            echeance.setInterets(new BigDecimal(interets));
            echeance.setMensualite(new BigDecimal(mensualite));
            echeance.setCapitalRestant(new BigDecimal(capitalRestant));
            tableau.add(echeance);
        }

        return null;
    }
}
