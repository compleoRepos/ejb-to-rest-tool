package ma.bmce.core.framework;

import javax.ejb.Stateless;
import java.util.HashMap;
import java.util.Map;

@Stateless
public class MagixService {
    // Codes Magix pour le module Core Banking
    // CPT001: Ouverture de compte
    // CPT002: Clôture de compte
    // CPT003: Consultation solde
    // CPT004: Consultation historique
    // CPT005: Blocage compte
    // CPT006: Déblocage compte
    // OPE001: Débit compte
    // OPE002: Crédit compte
    // OPE003: Virement interne initiation
    // OPE004: Virement interne validation
    // OPE005: Virement interne exécution
    // VIR001: Virement reçu
    // VIR002: Virement émis
    // VIR003: Virement rejeté

    public void executerTransaction(String codeMagix, Map<String, Object> params) {
        EaiLog.info(codeMagix, "Exécution transaction Magix: " + codeMagix);
        // Appel au middleware EAI BOA
    }

    public Map<String, Object> consulter(String codeMagix, Map<String, Object> params) {
        EaiLog.info(codeMagix, "Consultation Magix: " + codeMagix);
        return new HashMap<>();
    }
}
