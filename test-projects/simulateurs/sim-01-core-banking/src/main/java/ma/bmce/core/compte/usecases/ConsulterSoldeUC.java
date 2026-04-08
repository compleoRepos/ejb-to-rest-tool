package ma.bmce.core.compte.usecases;

import ma.bmce.core.compte.dto.ConsulterSoldeVoIn;
import ma.bmce.core.compte.dto.ConsulterSoldeVoOut;
import ma.bmce.core.framework.BaseUseCase;
import ma.bmce.core.framework.EaiLog;
import ma.bmce.core.framework.FwkRollbackException;
import ma.bmce.core.framework.MagixService;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Stateless
public class ConsulterSoldeUC extends BaseUseCase<ConsulterSoldeVoIn, ConsulterSoldeVoOut> {

    @EJB
    private MagixService magixService;

    @Override
    public ConsulterSoldeVoOut execute(ConsulterSoldeVoIn voIn) throws FwkRollbackException {
        EaiLog.info("CPT003", "Consultation solde compte " + voIn.getNumCompte());

        ConsulterSoldeVoOut voOut = new ConsulterSoldeVoOut();
        voOut.setSoldeDisponible(new BigDecimal("14500.00"));
        voOut.setSoldeComptable(new BigDecimal("15000.00"));
        voOut.setSoldeBloque(new BigDecimal("500.00"));
        voOut.setDevise("MAD");
        voOut.setDateArrete(LocalDateTime.now());

        return voOut;
    }
}
