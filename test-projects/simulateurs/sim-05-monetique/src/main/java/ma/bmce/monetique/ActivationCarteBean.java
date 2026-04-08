package ma.bmce.monetique;

import javax.ejb.SessionBean;
import javax.ejb.SessionContext;
import java.rmi.RemoteException;
import java.util.logging.Logger;

public class ActivationCarteBean implements SessionBean {

    private static final Logger log = Logger.getLogger(ActivationCarteBean.class.getName());
    private SessionContext ctx;

    public String activerCarte(String numCarte, String codePin) throws RemoteException {
        // Pattern B: Numéro de carte dans les logs — PCI-004, SEC-003 CRITICAL
        log.info("Activation carte " + numCarte + " avec PIN fourni");
        return "ACTIVEE";
    }

    public String desactiverCarte(String numCarte, String motif) throws RemoteException {
        log.info("Désactivation carte " + numCarte + " motif: " + motif);
        return "DESACTIVEE";
    }

    public String consulterStatut(String numCarte) throws RemoteException {
        return "ACTIF";
    }

    public void setSessionContext(SessionContext ctx) { this.ctx = ctx; }
    public void ejbCreate() {}
    public void ejbRemove() {}
    public void ejbActivate() {}
    public void ejbPassivate() {}
}
