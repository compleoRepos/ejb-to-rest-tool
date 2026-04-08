package ma.bmce.monetique;

import javax.ejb.EJBHome;
import javax.ejb.CreateException;
import java.rmi.RemoteException;

public interface GestionPINHome extends EJBHome {
    GestionPINRemote create() throws CreateException, RemoteException;
}
