package ma.bmce.credit.usecases;

import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.time.LocalDate;

@Stateless
public class RemboursementAnticipeUC {
    public Object execute(String referenceDossier, String typeRemboursement,
                          BigDecimal montant, LocalDate dateValeur) {
        return null;
    }
}
