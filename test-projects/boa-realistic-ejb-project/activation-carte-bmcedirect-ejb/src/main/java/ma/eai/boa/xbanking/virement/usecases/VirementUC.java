package ma.eai.boa.xbanking.virement.usecases;
import ma.eai.midw.annotations.UseCase;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.services.MagixService;
import ma.eai.midw.usecases.BaseUseCase;
import ma.eai.midw.usecases.ValueObject;
import javax.ejb.EJB;
import javax.transaction.Transactional;

@UseCase(description = "Initiation d'un virement bancaire")
@Transactional(rollbackOn = FwkRollbackException.class)
public class VirementUC implements BaseUseCase {
    @EJB private MagixService magixService;
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException { return null; }
}
