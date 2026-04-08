package ma.bmce.core.operation.usecases;

import ma.bmce.core.operation.dto.DebitVoIn;
import ma.bmce.core.operation.dto.DebitVoOut;
import ma.bmce.core.framework.BaseUseCase;
import ma.bmce.core.framework.EaiLog;
import ma.bmce.core.framework.FwkRollbackException;
import ma.bmce.core.framework.MagixService;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.logging.Logger;

@Stateless
public class DebitCompteUC extends BaseUseCase<DebitVoIn, DebitVoOut> {

    private static final Logger log = Logger.getLogger(DebitCompteUC.class.getName());

    @EJB
    private MagixService magixService;

    @Override
    public DebitVoOut execute(DebitVoIn voIn) throws FwkRollbackException {
        String numCompte = voIn.getNumCompte();
        BigDecimal montant = voIn.getMontant();

        // SEC-003: Données sensibles dans les logs !
        log.info("Débit compte " + numCompte + " de " + montant + " MAD");

        // Vérification du solde
        // Exécution du débit via Magix
        EaiLog.info("OPE001", "Débit exécuté: " + numCompte);

        DebitVoOut voOut = new DebitVoOut();
        voOut.setReferenceOperation("OPE-" + UUID.randomUUID().toString().substring(0, 8));
        voOut.setSoldeApres(new BigDecimal("14000.00"));
        voOut.setDateOperation(LocalDateTime.now());

        return voOut;
    }
}
