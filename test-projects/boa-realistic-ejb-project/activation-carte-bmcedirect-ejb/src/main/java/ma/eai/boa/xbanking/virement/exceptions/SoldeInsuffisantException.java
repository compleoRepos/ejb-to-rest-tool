package ma.eai.boa.xbanking.virement.exceptions;
import ma.eai.midw.exceptions.FwkRollbackException;
import java.math.BigDecimal;
public class SoldeInsuffisantException extends FwkRollbackException {
    public SoldeInsuffisantException(BigDecimal solde, BigDecimal montant) {
        super("SOLDE_INSUFFISANT", "Solde insuffisant : disponible=" + solde + ", demande=" + montant);
    }
}
