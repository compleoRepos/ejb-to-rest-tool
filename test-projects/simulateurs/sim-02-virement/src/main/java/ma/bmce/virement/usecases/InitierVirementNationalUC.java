package ma.bmce.virement.usecases;

import ma.bmce.virement.dto.InitierVirementNationalVoIn;
import javax.ejb.EJB;
import javax.ejb.Stateless;
import java.math.BigDecimal;

@Stateless
public class InitierVirementNationalUC {

    @EJB(lookup = "java:global/bmce-core-banking-ejb/ConsulterSoldeUC")
    private Object soldeService;

    public Object execute(InitierVirementNationalVoIn voIn) {
        // Vérification solde
        // Calcul frais
        double tauxFrais = 0.001;
        double frais = voIn.getMontant().doubleValue() * tauxFrais;
        return null;
    }
}
