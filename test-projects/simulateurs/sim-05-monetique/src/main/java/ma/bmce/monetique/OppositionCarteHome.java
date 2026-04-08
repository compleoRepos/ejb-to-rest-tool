package ma.bmce.monetique;

import javax.ejb.EJBHome;
import javax.ejb.CreateException;
import java.rmi.RemoteException;

public interface OppositionCarteHome extends EJBHome {
    OppositionCarteRemote create() throws CreateException, RemoteException;
}
