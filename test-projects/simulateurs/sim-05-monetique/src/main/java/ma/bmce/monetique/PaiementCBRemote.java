package ma.bmce.monetique;

import javax.ejb.EJBObject;
import java.math.BigDecimal;
import java.rmi.RemoteException;

public interface PaiementCBRemote extends EJBObject {
    String autoriserPaiement(String numCarte, BigDecimal montant, String codeMarchand, String devise) throws RemoteException;
    String annulerPaiement(String referenceTransaction) throws RemoteException;
    String rembourserPaiement(String reference, BigDecimal montant) throws RemoteException;
}
