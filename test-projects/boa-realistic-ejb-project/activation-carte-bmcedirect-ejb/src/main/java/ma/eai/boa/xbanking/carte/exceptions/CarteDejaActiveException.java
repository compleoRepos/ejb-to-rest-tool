package ma.eai.boa.xbanking.carte.exceptions;

import ma.eai.midw.exceptions.FwkRollbackException;

public class CarteDejaActiveException extends FwkRollbackException {
    private static final long serialVersionUID = 1L;
    private final String numeroCarte;
    public CarteDejaActiveException(String numeroCarte) {
        super("CARTE_DEJA_ACTIVE", "La carte " + numeroCarte + " est deja active");
        this.numeroCarte = numeroCarte;
    }
    public String getNumeroCarte() { return numeroCarte; }
}
