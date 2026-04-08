package ma.bmce.core.compte.usecases;

import ma.bmce.core.compte.dto.ConsulterSoldeVoIn;
import ma.bmce.core.compte.dto.ConsulterSoldeVoOut;
import ma.bmce.core.framework.BaseUseCase;
import ma.bmce.core.framework.EaiLog;
import ma.bmce.core.framework.FwkRollbackException;

import javax.ejb.Stateless;
import java.io.Serializable;

@Stateless
public class ClotureCompteUC extends BaseUseCase<ConsulterSoldeVoIn, ConsulterSoldeVoOut> {

    @Override
    public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) throws FwkRollbackException {
        EaiLog.info("CPT002", "Clôture du compte " + voIn.getNumCompte());
        // Vérifier que le solde est à zéro
        // Marquer le compte comme CLOTURE
        return new ConsulterSoldeVoOut();
    }
}
