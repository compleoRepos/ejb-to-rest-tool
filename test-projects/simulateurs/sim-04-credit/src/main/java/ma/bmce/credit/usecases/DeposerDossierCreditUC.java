package ma.bmce.credit.usecases;

import javax.ejb.Stateless;
import java.math.BigDecimal;

@Stateless
public class DeposerDossierCreditUC {
    public Object execute(Long clientId, String typeCredit, BigDecimal montant,
                          Integer dureeAns, Object bienFinance, Object revenus,
                          Object charges, BigDecimal apport) {
        return null;
    }
}
