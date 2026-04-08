package ma.bmce.monetique;

import javax.ejb.SessionBean;
import javax.ejb.SessionContext;
import java.rmi.RemoteException;
import java.util.logging.Logger;

public class OppositionCarteBean implements SessionBean {

    private static final Logger log = Logger.getLogger(OppositionCarteBean.class.getName());
    private SessionContext ctx;

    public String poserOpposition(String numCarte, String motif, String declarantCin) throws RemoteException {
        log.info("Opposition carte " + numCarte + " par " + declarantCin);
        return "OPPOSEE";
    }

    public String leverOpposition(String numCarte, String codeAutorisation) throws RemoteException {
        return "LEVEE";
    }

    public void setSessionContext(SessionContext ctx) { this.ctx = ctx; }
    public void ejbCreate() {}
    public void ejbRemove() {}
    public void ejbActivate() {}
    public void ejbPassivate() {}
}
