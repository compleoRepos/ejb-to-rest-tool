package ma.bmce.core.compte.exceptions;

import ma.bmce.core.framework.FwkRollbackException;

public class CompteDejaClotureeException extends FwkRollbackException {
    public CompteDejaClotureeException(String numCompte) {
        super("CPT_CLOTURE", "Le compte " + numCompte + " est déjà clôturé");
    }
}
