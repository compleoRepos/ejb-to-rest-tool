package ma.eai.boa.xbanking.client.usecases;
import ma.eai.midw.annotations.UseCase;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.services.MagixService;
import ma.eai.midw.usecases.BaseUseCase;
import ma.eai.midw.usecases.ValueObject;
import javax.ejb.EJB;
@UseCase(description = "ChargerClientDataUC")
public class ChargerClientDataUC implements BaseUseCase {
    @EJB private MagixService magixService;
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException { return null; }
}
