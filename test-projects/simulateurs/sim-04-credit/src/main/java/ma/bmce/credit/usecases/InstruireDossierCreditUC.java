package ma.bmce.credit.usecases;

import javax.ejb.Stateless;
import java.math.BigDecimal;

@Stateless
public class InstruireDossierCreditUC {
    public Object execute(String referenceDossier, String decisionAnalyste,
                          BigDecimal tauxNegocie, String commentaire, Object conditionsSpeciales) {
        return null;
    }
}
