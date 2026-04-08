package ma.bmce.core.compte.exceptions;

import ma.bmce.core.framework.FwkRollbackException;

public class CompteBloqueeException extends FwkRollbackException {
    public CompteBloqueeException(String numCompte) {
        super("CPT_BLOQUE", "Le compte " + numCompte + " est bloqué - opération impossible");
    }
}
