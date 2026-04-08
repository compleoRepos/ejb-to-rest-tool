package ma.bmce.core.framework;

import javax.ejb.Stateless;
import java.io.Serializable;

public abstract class BaseUseCase<I extends Serializable, O extends Serializable> {
    public abstract O execute(I voIn) throws FwkRollbackException;
}
