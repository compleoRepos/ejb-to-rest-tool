package ma.bmce.kyc.usecases;

import javax.ejb.Stateless;
import java.time.LocalDate;

@Stateless
public class ValiderDocumentKycUC {

    public Object execute(String dossierKycId, String typeDocument,
                          String contenuBase64, String nomFichier,
                          LocalDate dateExpiration) {

        // Pattern C: Base64 sans validation de taille — VAL-006, API-019
        // contenuBase64 peut être 50MB - pas de @Size
        // Pas de limite sur la taille du payload

        return null;
    }
}
