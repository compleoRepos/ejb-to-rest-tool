package ma.eai.boa.xbanking.compte.dto;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.virement.validation.ValidRIB;
import javax.xml.bind.annotation.*;
import javax.validation.constraints.NotBlank;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ConsulterSoldeVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) @NotBlank @ValidRIB private String rib;
    @XmlElement(required = true) @NotBlank private String corporateId;
    @XmlElement private boolean includeOperationsJour;
    public String getRib() { return rib; } public void setRib(String v) { this.rib = v; }
    public String getCorporateId() { return corporateId; } public void setCorporateId(String v) { this.corporateId = v; }
    public boolean isIncludeOperationsJour() { return includeOperationsJour; } public void setIncludeOperationsJour(boolean v) { this.includeOperationsJour = v; }
}
