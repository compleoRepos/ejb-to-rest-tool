package ma.bmce.credit.usecases;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import javax.transaction.Transactional;
import java.math.BigDecimal;

@Stateless
public class DebloquerFondsUC {

    // Pattern C: JNDI lookup vers sim-01 pour le déblocage
    @EJB(lookup = "java:global/bmce-core-banking-ejb/CreditCompteUC")
    private Object creditService;

    // Pattern D: JNDI lookup vers sim-03 pour le scoring
    @EJB(lookup = "java:global/bmce-kyc-ejb/CalculerScoreRisqueUC")
    private Object scoringService;

    public Object execute(String referenceDossier, BigDecimal montantDeblocage,
                          String numCompteBeneficiaire, String justificatif) {

        // Pattern B: Self-invocation @Transactional — JPA-011 CRITICAL
        this.creerEcriture(referenceDossier, montantDeblocage);

        return null;
    }

    // Self-invocation: cette méthode @Transactional est appelée par this.
    // Le proxy Spring ne sera pas utilisé → la transaction ne sera pas créée !
    @Transactional
    private void creerEcriture(String reference, BigDecimal montant) {
        // Écriture comptable
        // creditService.execute(...)
    }
}
