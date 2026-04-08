package ma.eai.boa.xbanking.carte.dto;

import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
import javax.validation.constraints.NotBlank;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ReceptionnerCarteVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) @NotBlank private String numCarte;
    @XmlElement(required = true) @NotBlank private String numLot;
    @XmlElement private String numToken;
    @XmlElement(required = true) @NotBlank private String corporateId;
    @XmlElement private String codeAgence;

    public String getNumCarte() { return numCarte; }
    public void setNumCarte(String v) { this.numCarte = v; }
    public String getNumLot() { return numLot; }
    public void setNumLot(String v) { this.numLot = v; }
    public String getNumToken() { return numToken; }
    public void setNumToken(String v) { this.numToken = v; }
    public String getCorporateId() { return corporateId; }
    public void setCorporateId(String v) { this.corporateId = v; }
    public String getCodeAgence() { return codeAgence; }
    public void setCodeAgence(String v) { this.codeAgence = v; }
}
