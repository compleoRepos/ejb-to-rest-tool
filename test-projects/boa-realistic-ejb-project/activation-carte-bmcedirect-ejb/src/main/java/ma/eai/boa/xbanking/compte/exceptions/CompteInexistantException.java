package ma.eai.boa.xbanking.compte.exceptions;
import ma.eai.midw.exceptions.FwkRollbackException;
public class CompteInexistantException extends FwkRollbackException {
    public CompteInexistantException(String rib) { super("COMPTE_INEXISTANT", "Compte inexistant : " + rib); }
}
