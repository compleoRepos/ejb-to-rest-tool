package ma.bmce.monetique;

import javax.ejb.EJBObject;
import java.rmi.RemoteException;

public interface ActivationCarteRemote extends EJBObject {
    String activerCarte(String numCarte, String codePin) throws RemoteException;
    String desactiverCarte(String numCarte, String motif) throws RemoteException;
    String consulterStatut(String numCarte) throws RemoteException;
}
