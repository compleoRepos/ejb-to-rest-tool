package ma.bmce.core.operation.usecases;

import ma.bmce.core.operation.dto.CreditVoIn;
import ma.bmce.core.operation.dto.CreditVoOut;
import ma.bmce.core.framework.BaseUseCase;
import ma.bmce.core.framework.EaiLog;
import ma.bmce.core.framework.FwkRollbackException;
import ma.bmce.core.framework.MagixService;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import java.time.LocalDateTime;
import java.util.UUID;

@Stateless
public class CreditCompteUC extends BaseUseCase<CreditVoIn, CreditVoOut> {

    @EJB
    private MagixService magixService;

    @Override
    public CreditVoOut execute(CreditVoIn voIn) throws FwkRollbackException {
        EaiLog.info("OPE002", "Crédit compte " + voIn.getNumCompte()
            + " montant " + voIn.getMontant());

        CreditVoOut voOut = new CreditVoOut();
        voOut.setReferenceOperation("OPE-" + UUID.randomUUID().toString().substring(0, 8));
        voOut.setSoldeApres(voIn.getMontant());
        voOut.setDateOperation(LocalDateTime.now());

        return voOut;
    }
}
