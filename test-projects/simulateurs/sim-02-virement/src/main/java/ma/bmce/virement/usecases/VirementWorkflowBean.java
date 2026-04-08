package ma.bmce.virement.usecases;

import javax.ejb.Stateful;
import javax.ejb.SessionBean;
import javax.ejb.SessionContext;
import java.rmi.RemoteException;
import java.io.Serializable;

@Stateful
public class VirementWorkflowBean implements Serializable {
    private String virementReference;
    private String otp;
    private boolean validated = false;

    public void initierWorkflow(String reference) {
        this.virementReference = reference;
        this.validated = false;
    }

    public boolean validerOTP(String codeOTP) {
        this.otp = codeOTP;
        this.validated = true;
        return true;
    }

    public void annuler() {
        this.virementReference = null;
        this.validated = false;
    }
}
