package ma.eai.boa.xbanking.compte.exceptions;
import ma.eai.midw.exceptions.FwkRollbackException;
public class CompteBloqueException extends FwkRollbackException {
    public CompteBloqueException(String rib) { super("COMPTE_BLOQUE", "Compte bloque : " + rib); }
}
