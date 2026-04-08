package ma.eai.boa.xbanking.carte.dto;

import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.carte.validation.ValidNumCarte;
import javax.xml.bind.annotation.*;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

@XmlRootElement(name = "activerCarteVoIn")
@XmlAccessorType(XmlAccessType.FIELD)
@XmlType(name = "ActiverCarteVoIn", propOrder = {"numCarte", "codeActivation", "corporateId", "canal", "numTelephone"})
public class ActiverCarteVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;

    @XmlElement(required = true)
    @NotBlank
    @ValidNumCarte
    private String numCarte;

    @XmlElement(required = true)
    @NotBlank
    @Size(min = 6, max = 8)
    private String codeActivation;

    @XmlElement(required = true)
    @NotBlank
    private String corporateId;

    @XmlElement
    private String canal;

    @XmlElement
    private String numTelephone;

    public String getNumCarte() { return numCarte; }
    public void setNumCarte(String v) { this.numCarte = v; }
    public String getCodeActivation() { return codeActivation; }
    public void setCodeActivation(String v) { this.codeActivation = v; }
    public String getCorporateId() { return corporateId; }
    public void setCorporateId(String v) { this.corporateId = v; }
    public String getCanal() { return canal; }
    public void setCanal(String v) { this.canal = v; }
    public String getNumTelephone() { return numTelephone; }
    public void setNumTelephone(String v) { this.numTelephone = v; }
}
