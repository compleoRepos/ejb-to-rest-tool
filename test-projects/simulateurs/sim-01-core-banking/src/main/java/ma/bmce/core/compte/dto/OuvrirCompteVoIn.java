package ma.bmce.core.compte.dto;

import ma.bmce.core.compte.enums.TypeCompte;
import ma.bmce.core.framework.ValueObject;
import java.math.BigDecimal;
import java.io.Serializable;

public class OuvrirCompteVoIn implements ValueObject, Serializable {
    private TypeCompte typeCompte;
    private Long clientId;
    private String deviseCode;
    private String agenceCode;
    private BigDecimal soldeInitial;
    private String ribComplet; // pas de @Pattern - FIN-021

    public TypeCompte getTypeCompte() { return typeCompte; }
    public void setTypeCompte(TypeCompte typeCompte) { this.typeCompte = typeCompte; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public String getDeviseCode() { return deviseCode; }
    public void setDeviseCode(String deviseCode) { this.deviseCode = deviseCode; }
    public String getAgenceCode() { return agenceCode; }
    public void setAgenceCode(String agenceCode) { this.agenceCode = agenceCode; }
    public BigDecimal getSoldeInitial() { return soldeInitial; }
    public void setSoldeInitial(BigDecimal soldeInitial) { this.soldeInitial = soldeInitial; }
    public String getRibComplet() { return ribComplet; }
    public void setRibComplet(String ribComplet) { this.ribComplet = ribComplet; }
}
