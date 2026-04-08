package ma.bmce.kyc.usecases;

import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.logging.Logger;

@Stateless
public class InitierKycUC {

    private static final Logger log = Logger.getLogger(InitierKycUC.class.getName());

    public Object execute(String cin, String nom, String prenom,
                          LocalDate dateNaissance, String nationalite,
                          String adresseEmail, String telephone,
                          String adressePostale, String situationFamiliale,
                          String activiteProfessionnelle, BigDecimal revenuMensuelEstime) {

        // Pattern A: Données personnelles sans chiffrement — PCI-001, DL-001, RGPD-001
        // cin, adresseEmail, telephone stockés en clair

        // Pattern B: Log de données personnelles — SEC-003, DL-001 CRITIQUE
        log.info("KYC initié pour " + cin + " - " + nom + " " + prenom);

        // Pattern F: CIN sans validation pattern marocain — FIN-004
        // Pas de validation regex sur le CIN marocain (format: 1-2 lettres + 6 chiffres)

        return null;
    }
}
