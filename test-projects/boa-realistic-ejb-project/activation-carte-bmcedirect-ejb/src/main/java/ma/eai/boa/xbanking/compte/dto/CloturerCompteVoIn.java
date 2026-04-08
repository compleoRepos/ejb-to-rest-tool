package ma.eai.boa.xbanking.compte.dto;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.virement.validation.ValidRIB;
import javax.xml.bind.annotation.*;
import javax.validation.constraints.NotBlank;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class CloturerCompteVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) @NotBlank @ValidRIB private String rib;
    @XmlElement(required = true) @NotBlank private String corporateId;
    @XmlElement(required = true) @NotBlank private String motifCloture;
    @XmlElement private String ribTransfert;
    public String getRib() { return rib; } public void setRib(String v) { this.rib = v; }
    public String getCorporateId() { return corporateId; } public void setCorporateId(String v) { this.corporateId = v; }
    public String getMotifCloture() { return motifCloture; } public void setMotifCloture(String v) { this.motifCloture = v; }
    public String getRibTransfert() { return ribTransfert; } public void setRibTransfert(String v) { this.ribTransfert = v; }
}
