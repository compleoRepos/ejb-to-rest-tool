package ma.bmce.core.framework;

public class FwkRollbackException extends Exception {
    private String codeErreur;
    private String messageErreur;

    public FwkRollbackException(String codeErreur, String messageErreur) {
        super(messageErreur);
        this.codeErreur = codeErreur;
        this.messageErreur = messageErreur;
    }

    public String getCodeErreur() { return codeErreur; }
    public String getMessageErreur() { return messageErreur; }
}
