package ma.bmce.monetique;

import javax.ejb.SessionBean;
import javax.ejb.SessionContext;
import java.rmi.RemoteException;

public class GestionPINBean implements SessionBean {

    private SessionContext ctx;
    private String numCarte;
    private String ancienPin;
    private boolean initiated = false;

    public String initierChangementPin(String numCarte, String ancienPin) throws RemoteException {
        this.numCarte = numCarte;
        this.ancienPin = ancienPin;
        this.initiated = true;
        return "INITIATED";
    }

    public String validerNouveauPin(String nouveauPin, String confirmPin) throws RemoteException {
        if (!initiated) throw new RemoteException("Workflow non initié");
        if (!nouveauPin.equals(confirmPin)) throw new RemoteException("PINs ne correspondent pas");
        return "PIN_CHANGE";
    }

    public void annulerChangement() throws RemoteException {
        this.initiated = false;
    }

    public void setSessionContext(SessionContext ctx) { this.ctx = ctx; }
    public void ejbCreate() {}
    public void ejbRemove() {}
    public void ejbActivate() {}
    public void ejbPassivate() {}
}
