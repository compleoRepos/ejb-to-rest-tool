package ma.bmce.core.compte.exceptions;

import ma.bmce.core.framework.FwkRollbackException;

public class SoldeInsuffisantException extends FwkRollbackException {
    public SoldeInsuffisantException(String numCompte, java.math.BigDecimal solde, java.math.BigDecimal montant) {
        super("SOLDE_INSUFFISANT", "Solde insuffisant sur le compte " + numCompte
            + " : solde=" + solde + " montant demandé=" + montant);
    }
}
