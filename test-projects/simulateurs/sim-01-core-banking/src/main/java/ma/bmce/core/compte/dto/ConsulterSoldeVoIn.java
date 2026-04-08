package ma.bmce.core.compte.dto;

import ma.bmce.core.framework.ValueObject;
import java.io.Serializable;

public class ConsulterSoldeVoIn implements ValueObject, Serializable {
    private String numCompte;

    public String getNumCompte() { return numCompte; }
    public void setNumCompte(String numCompte) { this.numCompte = numCompte; }
}
