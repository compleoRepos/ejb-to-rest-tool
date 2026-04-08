package ma.eai.boa.xbanking.carte.exceptions;

import ma.eai.midw.exceptions.FwkRollbackException;

public class CodeActivationInvalideException extends FwkRollbackException {
    private static final long serialVersionUID = 1L;
    public CodeActivationInvalideException() {
        super("CODE_ACTIVATION_INVALIDE", "Le code d'activation est invalide ou expire");
    }
}
