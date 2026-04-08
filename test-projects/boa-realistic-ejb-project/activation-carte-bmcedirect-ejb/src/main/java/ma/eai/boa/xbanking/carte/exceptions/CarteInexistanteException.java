package ma.eai.boa.xbanking.carte.exceptions;

import ma.eai.midw.exceptions.FwkRollbackException;

public class CarteInexistanteException extends FwkRollbackException {
    private static final long serialVersionUID = 1L;
    public CarteInexistanteException(String numeroCarte) {
        super("CARTE_INEXISTANTE", "La carte " + numeroCarte + " n'existe pas");
    }
}
