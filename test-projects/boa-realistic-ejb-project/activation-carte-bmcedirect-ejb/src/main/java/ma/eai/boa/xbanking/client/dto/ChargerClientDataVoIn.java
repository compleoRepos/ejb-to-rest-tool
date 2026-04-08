package ma.eai.boa.xbanking.client.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
import javax.validation.constraints.NotBlank;
import java.util.List;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ChargerClientDataVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) @NotBlank private String sasCC;
    @XmlElement private boolean includeComptes;
    @XmlElement private boolean includeCartes;
    @XmlElement private boolean includeAdresse;
    @XmlElementWrapper(name = "identifiants") @XmlElement(name = "id") private List<String> identifiantsSupplementaires;
    public String getSasCC() { return sasCC; } public void setSasCC(String v) { this.sasCC = v; }
    public boolean isIncludeComptes() { return includeComptes; } public void setIncludeComptes(boolean v) { this.includeComptes = v; }
    public boolean isIncludeCartes() { return includeCartes; } public void setIncludeCartes(boolean v) { this.includeCartes = v; }
    public boolean isIncludeAdresse() { return includeAdresse; } public void setIncludeAdresse(boolean v) { this.includeAdresse = v; }
    public List<String> getIdentifiantsSupplementaires() { return identifiantsSupplementaires; } public void setIdentifiantsSupplementaires(List<String> v) { this.identifiantsSupplementaires = v; }
}
