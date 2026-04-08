package ma.bmce.core.operation.dto;

import ma.bmce.core.framework.ValueObject;
import java.io.Serializable;
import java.math.BigDecimal;

public class VirementInterneVoOut implements ValueObject, Serializable {
    private String referenceVirement;
    private String statut;
    private BigDecimal frais;

    public String getReferenceVirement() { return referenceVirement; }
    public void setReferenceVirement(String referenceVirement) { this.referenceVirement = referenceVirement; }
    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }
    public BigDecimal getFrais() { return frais; }
    public void setFrais(BigDecimal frais) { this.frais = frais; }
}
