package ma.bmce.monetique;

import javax.ejb.EJBHome;
import javax.ejb.CreateException;
import java.rmi.RemoteException;

public interface ActivationCarteHome extends EJBHome {
    ActivationCarteRemote create() throws CreateException, RemoteException;
}
