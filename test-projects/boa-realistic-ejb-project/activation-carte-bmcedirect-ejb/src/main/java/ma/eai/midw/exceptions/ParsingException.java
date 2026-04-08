package ma.eai.midw.exceptions;

public class ParsingException extends FwkRollbackException {
    private static final long serialVersionUID = 1L;
    public ParsingException(String message) { super("ERR_PARSING", message); }
    public ParsingException(String message, Throwable cause) { super(message, cause); }
}
