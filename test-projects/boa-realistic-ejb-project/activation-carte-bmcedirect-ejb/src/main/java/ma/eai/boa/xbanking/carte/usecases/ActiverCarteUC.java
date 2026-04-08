package ma.eai.boa.xbanking.carte.usecases;

import ma.eai.midw.annotations.UseCase;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.services.MagixService;
import ma.eai.midw.usecases.BaseUseCase;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.carte.dto.ActiverCarteVoIn;
import ma.eai.boa.xbanking.carte.dto.ActiverCarteVoOut;
import ma.eai.boa.xbanking.carte.enums.StatutCarte;
import ma.eai.boa.xbanking.carte.exceptions.CarteDejaActiveException;
import ma.eai.boa.xbanking.carte.exceptions.CarteInexistanteException;
import ma.eai.boa.xbanking.carte.exceptions.CodeActivationInvalideException;

import javax.ejb.EJB;
import javax.transaction.Transactional;

/**
 * UC-CARTE-001 : Activation d'une carte bancaire BMCE Direct.
 *
 * Flux :
 *   1. Verification existence carte (Magix CART01)
 *   2. Verification statut carte (doit etre NON_ACTIVEE)
 *   3. Validation code activation (Magix CART02)
 *   4. Activation carte (Magix CART03)
 *   5. Envoi SMS confirmation
 *
 * @author Equipe Digital Factory — BOA
 * @since BMCE Direct v3.2
 */
@UseCase(description = "Activation d'une carte bancaire via BMCE Direct")
@Transactional(rollbackOn = FwkRollbackException.class)
public class ActiverCarteUC implements BaseUseCase {

    private static final EaiLog log = new EaiLog(ActiverCarteUC.class);

    @EJB
    private MagixService magixService;

    @Override
    public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        log.info("Debut activation carte");
        ActiverCarteVoIn input = (ActiverCarteVoIn) voIn;
        ActiverCarteVoOut output = new ActiverCarteVoOut();

        try {
            // 1. Verifier existence carte
            String carteInfo = magixService.consulter("CART01", input.getNumCarte());
            if (carteInfo == null || carteInfo.isEmpty()) {
                throw new CarteInexistanteException(input.getNumCarte());
            }

            // 2. Verifier que la carte n'est pas deja active
            if (carteInfo.contains("ACTIVE")) {
                throw new CarteDejaActiveException(input.getNumCarte());
            }

            // 3. Valider le code d'activation
            String validationResult = magixService.executeTransaction("CART02",
                    input.getNumCarte() + "|" + input.getCodeActivation());
            if (!"OK".equals(validationResult)) {
                throw new CodeActivationInvalideException();
            }

            // 4. Activer la carte
            String activationResult = magixService.executeTransaction("CART03", input.getNumCarte());

            // 5. Construire la reponse
            output.setCodeRetour("000");
            output.setMessageRetour("Carte activee avec succes");
            output.setNumCarte(input.getNumCarte());
            output.setStatutCarte(StatutCarte.ACTIVE);
            output.setDateActivation(java.time.LocalDateTime.now().toString());

            log.info("Carte {} activee avec succes", input.getNumCarte());

        } catch (FwkRollbackException e) {
            throw e;
        } catch (Exception e) {
            log.error("Erreur technique activation carte {} : {}", input.getNumCarte(), e.getMessage());
            throw new FwkRollbackException("ERR_TECH", "Erreur technique lors de l'activation : " + e.getMessage());
        }

        return output;
    }
}
