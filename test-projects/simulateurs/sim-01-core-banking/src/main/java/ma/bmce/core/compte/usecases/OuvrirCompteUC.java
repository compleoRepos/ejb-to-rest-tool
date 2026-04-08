package ma.bmce.core.compte.usecases;

import ma.bmce.core.compte.dto.OuvrirCompteVoIn;
import ma.bmce.core.compte.dto.OuvrirCompteVoOut;
import ma.bmce.core.compte.enums.StatutCompte;
import ma.bmce.core.framework.BaseUseCase;
import ma.bmce.core.framework.EaiLog;
import ma.bmce.core.framework.FwkRollbackException;
import ma.bmce.core.framework.MagixService;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import java.time.LocalDate;
import java.util.UUID;

@Stateless
public class OuvrirCompteUC extends BaseUseCase<OuvrirCompteVoIn, OuvrirCompteVoOut> {

    @EJB
    private MagixService magixService;

    @Override
    public OuvrirCompteVoOut execute(OuvrirCompteVoIn voIn) throws FwkRollbackException {
        EaiLog.info("CPT001", "Ouverture compte type=" + voIn.getTypeCompte()
            + " client=" + voIn.getClientId() + " agence=" + voIn.getAgenceCode());

        // Génération du numéro de compte (format BMCE)
        String numCompte = voIn.getAgenceCode() + String.format("%010d", System.nanoTime() % 10000000000L);
        String rib = voIn.getAgenceCode() + numCompte + "00";
        String iban = "MA76" + rib;

        OuvrirCompteVoOut voOut = new OuvrirCompteVoOut();
        voOut.setNumCompte(numCompte);
        voOut.setRibComplet(rib);
        voOut.setIban(iban);
        voOut.setDateOuverture(LocalDate.now());
        voOut.setStatut(StatutCompte.ACTIF);

        EaiLog.info("CPT001", "Compte créé: " + numCompte);
        return voOut;
    }
}
