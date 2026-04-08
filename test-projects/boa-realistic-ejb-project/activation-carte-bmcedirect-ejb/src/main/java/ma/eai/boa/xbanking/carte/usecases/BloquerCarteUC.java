package ma.eai.boa.xbanking.carte.usecases;

import ma.eai.midw.annotations.UseCase;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.services.MagixService;
import ma.eai.midw.usecases.BaseUseCase;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.carte.dto.BloquerCarteVoIn;
import ma.eai.boa.xbanking.carte.dto.BloquerCarteVoOut;
import ma.eai.boa.xbanking.carte.enums.StatutCarte;

import javax.ejb.EJB;
import javax.transaction.Transactional;

@UseCase(description = "Blocage d'une carte bancaire")
@Transactional(rollbackOn = FwkRollbackException.class)
public class BloquerCarteUC implements BaseUseCase {

    private static final EaiLog log = new EaiLog(BloquerCarteUC.class);
    @EJB private MagixService magixService;

    @Override
    public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        BloquerCarteVoIn input = (BloquerCarteVoIn) voIn;
        BloquerCarteVoOut output = new BloquerCarteVoOut();

        magixService.executeTransaction("CART05", input.getNumCarte() + "|" + input.getMotifBlocage());

        output.setCodeRetour("000");
        output.setMessageRetour("Carte bloquee");
        output.setNumCarte(input.getNumCarte());
        output.setNouveauStatut(StatutCarte.BLOQUEE);
        output.setDateBlocage(java.time.LocalDateTime.now().toString());
        output.setReferenceOpposition("OPP-" + System.currentTimeMillis());

        return output;
    }
}
