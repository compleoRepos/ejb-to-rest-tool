package ma.bmce.monetique;

import javax.ejb.EJBHome;
import javax.ejb.CreateException;
import java.rmi.RemoteException;

public interface PaiementCBHome extends EJBHome {
    PaiementCBRemote create() throws CreateException, RemoteException;
}
