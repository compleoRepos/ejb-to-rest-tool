package ma.eai.boa.xbanking.carte.usecases;

import ma.eai.midw.annotations.UseCase;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.services.MagixService;
import ma.eai.midw.usecases.BaseUseCase;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.carte.dto.ReceptionnerCarteVoIn;
import ma.eai.boa.xbanking.carte.dto.ReceptionnerCarteVoOut;

import javax.ejb.EJB;

@UseCase(description = "Reception d'une carte en agence")
public class ReceptionnerCarteUC implements BaseUseCase {
    @EJB private MagixService magixService;

    @Override
    public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        ReceptionnerCarteVoIn input = (ReceptionnerCarteVoIn) voIn;
        ReceptionnerCarteVoOut output = new ReceptionnerCarteVoOut();
        magixService.executeTransaction("CART04", input.getNumCarte() + "|" + input.getNumLot());
        output.setCodeRetour("000");
        output.setMessageRetour("Carte receptionnee");
        output.setNumCarte(input.getNumCarte());
        output.setDateReception(java.time.LocalDate.now().toString());
        output.setAgenceReception(input.getCodeAgence());
        return output;
    }
}
