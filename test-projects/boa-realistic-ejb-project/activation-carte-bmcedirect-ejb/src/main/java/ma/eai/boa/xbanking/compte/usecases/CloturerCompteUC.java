package ma.eai.boa.xbanking.compte.usecases;
import ma.eai.midw.annotations.UseCase;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.services.MagixService;
import ma.eai.midw.usecases.BaseUseCase;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.compte.dto.*;
import javax.ejb.EJB;
import javax.transaction.Transactional;

@UseCase(description = "UseCase CloturerCompteUC")
@Transactional(rollbackOn = FwkRollbackException.class)
public class CloturerCompteUC implements BaseUseCase {
    @EJB private MagixService magixService;
    @Override
    public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        return null; // Logique metier reelle dans le vrai projet
    }
}
