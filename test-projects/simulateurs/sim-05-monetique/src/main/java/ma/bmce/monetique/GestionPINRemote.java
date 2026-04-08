package ma.bmce.monetique;

import javax.ejb.EJBObject;
import java.rmi.RemoteException;

public interface GestionPINRemote extends EJBObject {
    String initierChangementPin(String numCarte, String ancienPin) throws RemoteException;
    String validerNouveauPin(String nouveauPin, String confirmPin) throws RemoteException;
    void annulerChangement() throws RemoteException;
}
