package ma.bmce.core.compte.usecases;

import ma.bmce.core.compte.dto.ConsulterSoldeVoIn;
import ma.bmce.core.compte.dto.ConsulterSoldeVoOut;
import ma.bmce.core.framework.BaseUseCase;
import ma.bmce.core.framework.EaiLog;
import ma.bmce.core.framework.FwkRollbackException;

import javax.ejb.Stateless;

@Stateless
public class DebloquerCompteUC extends BaseUseCase<ConsulterSoldeVoIn, ConsulterSoldeVoOut> {

    @Override
    public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) throws FwkRollbackException {
        EaiLog.info("CPT006", "Déblocage du compte " + voIn.getNumCompte());
        return new ConsulterSoldeVoOut();
    }
}
