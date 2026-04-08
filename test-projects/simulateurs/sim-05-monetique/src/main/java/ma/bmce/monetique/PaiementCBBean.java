package ma.bmce.monetique;

import javax.ejb.SessionBean;
import javax.ejb.SessionContext;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.DESKeySpec;
import java.math.BigDecimal;
import java.rmi.RemoteException;
import java.util.logging.Logger;

public class PaiementCBBean implements SessionBean {

    private static final Logger log = Logger.getLogger(PaiementCBBean.class.getName());
    private SessionContext ctx;
    private String pinKey = "BMCE_SECRET_KEY_12345678";

    public String autoriserPaiement(String numCarte, BigDecimal montant,
                                     String codeMarchand, String devise) throws RemoteException {
        // Pattern A: PIN stocké en clair — PCI-003, SEC-002, SEC-003 CRITICAL
        String pin = "1234"; // PIN en clair
        log.debug("Validation PIN: " + pin);

        // Pattern B: Numéro de carte dans les logs — PCI-004, SEC-003 CRITICAL
        log.info("Autorisation paiement carte " + numCarte + " montant " + montant);

        // Pattern C: DES encryption obsolète — SEC-002, CRY-001 CRITICAL
        try {
            DESKeySpec keySpec = new DESKeySpec(pinKey.getBytes());
            SecretKeyFactory factory = SecretKeyFactory.getInstance("DES");
            SecretKey key = factory.generateSecret(keySpec);
            Cipher cipher = Cipher.getInstance("DES/ECB/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] encrypted = cipher.doFinal(pin.getBytes());
        } catch (Exception e) {
            log.severe("Erreur chiffrement: " + e.getMessage());
        }

        // Pattern D: Pas de validation Luhn sur numCarte — FIN-003
        // Aucune validation sur le format de numCarte

        return "AUTORISE";
    }

    public String annulerPaiement(String referenceTransaction) throws RemoteException {
        return "ANNULE";
    }

    public String rembourserPaiement(String reference, BigDecimal montant) throws RemoteException {
        return "REMBOURSE";
    }

    public void setSessionContext(SessionContext ctx) { this.ctx = ctx; }
    public void ejbCreate() {}
    public void ejbRemove() {}
    public void ejbActivate() {}
    public void ejbPassivate() {}
}
