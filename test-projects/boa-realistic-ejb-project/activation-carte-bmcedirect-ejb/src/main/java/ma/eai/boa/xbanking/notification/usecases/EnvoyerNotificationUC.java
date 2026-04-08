package ma.eai.boa.xbanking.notification.usecases;
import ma.eai.midw.annotations.UseCase;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.usecases.BaseUseCase;
import ma.eai.midw.usecases.ValueObject;
@UseCase(description = "Envoi de notification client multicanal")
public class EnvoyerNotificationUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException { return null; }
}
