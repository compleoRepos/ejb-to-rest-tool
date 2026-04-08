package ma.bmce.monetique;

import javax.ejb.EJBObject;
import java.rmi.RemoteException;

public interface OppositionCarteRemote extends EJBObject {
    String poserOpposition(String numCarte, String motif, String declarantCin) throws RemoteException;
    String leverOpposition(String numCarte, String codeAutorisation) throws RemoteException;
}
