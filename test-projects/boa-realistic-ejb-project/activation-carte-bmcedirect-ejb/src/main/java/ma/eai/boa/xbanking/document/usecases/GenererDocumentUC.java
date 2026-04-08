package ma.eai.boa.xbanking.document.usecases;
import ma.eai.midw.annotations.UseCase;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.usecases.BaseUseCase;
import ma.eai.midw.usecases.ValueObject;
import javax.annotation.security.RolesAllowed;

@UseCase(description = "Generation de documents bancaires (releves, attestations)")
public class GenererDocumentUC implements BaseUseCase {
    @RolesAllowed({"ADMIN", "MANAGER", "BACK_OFFICE"})
    @Override
    public ValueObject execute(ValueObject voIn) throws FwkRollbackException { return null; }
}
