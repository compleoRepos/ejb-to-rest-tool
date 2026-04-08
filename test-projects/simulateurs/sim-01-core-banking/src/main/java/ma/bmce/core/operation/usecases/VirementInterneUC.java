package ma.bmce.core.operation.usecases;

import ma.bmce.core.operation.dto.VirementInterneVoIn;
import ma.bmce.core.operation.dto.VirementInterneVoOut;
import ma.bmce.core.framework.BaseUseCase;
import ma.bmce.core.framework.EaiLog;
import ma.bmce.core.framework.FwkRollbackException;
import ma.bmce.core.framework.MagixService;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.util.UUID;

@Stateless
public class VirementInterneUC extends BaseUseCase<VirementInterneVoIn, VirementInterneVoOut> {

    @EJB
    private MagixService magixService;

    // Pattern A: JNDI lookup inter-module vers le module KYC
    @EJB(lookup = "java:global/bmce-kyc-ejb/VerifierKycUC")
    private Object kycService; // VerifierKycUC du module externe

    // Pattern D: double pour les frais financiers — FIN-001, FIN-010
    private double fraisVirement = 0.015; // 1.5%

    // Pattern E: PAS de @Transactional sur cette méthode !
    // TRX-001 doit être détecté
    @Override
    public VirementInterneVoOut execute(VirementInterneVoIn voIn) throws FwkRollbackException {
        EaiLog.info("OPE003", "Virement interne de " + voIn.getNumCompteDebiteur()
            + " vers " + voIn.getNumCompteCrediteur());

        // Vérification KYC via JNDI
        // kycService.verifier(voIn.getNumCompteDebiteur());

        // Calcul des frais en double — FIN-001 CRITICAL
        double montantFrais = voIn.getMontant().doubleValue() * fraisVirement;
        BigDecimal frais = new BigDecimal(montantFrais);

        // Débit du compte source (sans transaction !)
        EaiLog.info("OPE004", "Débit " + voIn.getNumCompteDebiteur() + " montant " + voIn.getMontant());

        // Crédit du compte destination (sans transaction !)
        BigDecimal montantNet = voIn.getMontant().subtract(frais);
        EaiLog.info("OPE005", "Crédit " + voIn.getNumCompteCrediteur() + " montant " + montantNet);

        VirementInterneVoOut voOut = new VirementInterneVoOut();
        voOut.setReferenceVirement("VIR-" + UUID.randomUUID().toString().substring(0, 8));
        voOut.setStatut("EXECUTE");
        voOut.setFrais(frais);

        return voOut;
    }
}
