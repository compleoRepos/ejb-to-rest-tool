package ma.eai.midw.exceptions;

/**
 * Exception framework declenchant un rollback automatique
 * de la transaction JTA en cours.
 *
 * Toutes les exceptions metier du framework EAI doivent
 * heriter de cette classe pour garantir l'integrite transactionnelle.
 *
 * @author Framework EAI — Direction SI BOA
 * @since 2018
 */
public class FwkRollbackException extends Exception {

    private static final long serialVersionUID = 1L;

    private String codeErreur;
    private String codeRetour;

    public FwkRollbackException() {
        super();
    }

    public FwkRollbackException(String message) {
        super(message);
    }

    public FwkRollbackException(String message, Throwable cause) {
        super(message, cause);
    }

    public FwkRollbackException(String codeErreur, String message) {
        super(message);
        this.codeErreur = codeErreur;
    }

    public String getCodeErreur() { return codeErreur; }
    public void setCodeErreur(String codeErreur) { this.codeErreur = codeErreur; }
    public String getCodeRetour() { return codeRetour; }
    public void setCodeRetour(String codeRetour) { this.codeRetour = codeRetour; }
}
