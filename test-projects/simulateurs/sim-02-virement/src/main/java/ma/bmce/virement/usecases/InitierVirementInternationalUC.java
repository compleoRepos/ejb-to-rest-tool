package ma.bmce.virement.usecases;

import ma.bmce.virement.dto.InitierVirementInternationalVoIn;
import ma.bmce.virement.enums.StatutVirement;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.util.logging.Logger;

@Stateless
public class InitierVirementInternationalUC {

    private static final Logger log = Logger.getLogger(InitierVirementInternationalUC.class.getName());

    // Pattern A: JNDI lookup vers sim-01 pour vérifier le solde
    @EJB(lookup = "java:global/bmce-core-banking-ejb/ConsulterSoldeUC")
    private Object soldeService;

    // Pattern B: JNDI lookup vers sim-03 pour screening OFAC
    @EJB(lookup = "java:global/bmce-kyc-ejb/ScreeningOfacUC")
    private Object ofacService;

    // Pattern D: double pour calcul de frais — FIN-001, FIN-010, FIN-011
    public Object execute(InitierVirementInternationalVoIn voIn) {
        log.info("Initiation virement international vers " + voIn.getIbanDestinataire());

        // Vérification solde via JNDI
        // soldeService.execute(...)

        // Screening OFAC
        // ofacService.execute(...)

        // Calcul frais en double — FIN-001
        double tauxFrais = 0.002; // 0.2%
        double frais = voIn.getMontant().doubleValue() * tauxFrais;

        // Pattern F: Conversion sans setScale — FIN-025, FIN-032
        BigDecimal montantConverti = voIn.getMontant().multiply(
            new BigDecimal(voIn.getTauxChange().toString())); // pas de setScale

        // Pattern G: Appel SWIFT sans circuit breaker — RES-001, RES-002
        // swiftClient.envoyer(message);

        return null;
    }
}
