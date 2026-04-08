package ma.eai.boa.xbanking.client.exceptions;
import ma.eai.midw.exceptions.FwkRollbackException;
public class ClientInexistantException extends FwkRollbackException {
    public ClientInexistantException(String id) { super("CLIENT_INEXISTANT", "Client inexistant : " + id); }
}
