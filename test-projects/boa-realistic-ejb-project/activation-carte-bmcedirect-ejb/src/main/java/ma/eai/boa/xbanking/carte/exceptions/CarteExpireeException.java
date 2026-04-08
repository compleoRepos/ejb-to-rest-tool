package ma.eai.boa.xbanking.carte.exceptions;

import ma.eai.midw.exceptions.FwkRollbackException;

public class CarteExpireeException extends FwkRollbackException {
    private static final long serialVersionUID = 1L;
    public CarteExpireeException(String numeroCarte) {
        super("CARTE_EXPIREE", "La carte " + numeroCarte + " est expiree");
    }
}
