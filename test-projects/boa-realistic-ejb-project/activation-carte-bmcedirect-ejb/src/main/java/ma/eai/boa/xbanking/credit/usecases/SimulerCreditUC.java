package ma.eai.boa.xbanking.credit.usecases;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.services.MagixService;
import ma.eai.midw.usecases.BaseUseCase;
import ma.eai.midw.usecases.ValueObject;
import javax.ejb.EJB;
import javax.ejb.Stateless;

@Stateless
public class SimulerCreditUC implements BaseUseCase {
    @EJB private MagixService magixService;
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException { return null; }
}
