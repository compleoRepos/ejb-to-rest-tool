package ma.bmce.kyc.usecases;

import javax.cache.annotation.CacheResult;
import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.time.LocalDate;

@Stateless
public class ScreeningOfacUC {

    // Pattern E: Résultat mis en cache sans expiration — CACHE-001
    @CacheResult(cacheName = "screening") // pas d'expiration configurée
    public Object execute(String nom, String prenom, LocalDate dateNaissance,
                          String nationalite, BigDecimal montant, String pays) {

        // Pattern D: Appel OFAC externe sans timeout — RES-002
        // ofacApi.verifier(request); // pas de timeout

        return null;
    }
}
