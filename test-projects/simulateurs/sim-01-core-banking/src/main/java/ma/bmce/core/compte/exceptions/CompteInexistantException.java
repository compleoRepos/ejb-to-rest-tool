package ma.bmce.core.compte.exceptions;

import ma.bmce.core.framework.FwkRollbackException;

public class CompteInexistantException extends FwkRollbackException {
    public CompteInexistantException(String numCompte) {
        super("CPT_INEXISTANT", "Le compte " + numCompte + " n'existe pas dans le système");
    }
}
