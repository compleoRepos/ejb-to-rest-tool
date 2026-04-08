package ma.eai.boa.xbanking.client.dto;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.common.dto.AdresseDto;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class MajClientVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) private String corporateId;
    @XmlElement private String email;
    @XmlElement private String telephone;
    @XmlElement private AdresseDto nouvelleAdresse;
    public String getCorporateId() { return corporateId; } public void setCorporateId(String v) { this.corporateId = v; }
    public String getEmail() { return email; } public void setEmail(String v) { this.email = v; }
    public String getTelephone() { return telephone; } public void setTelephone(String v) { this.telephone = v; }
    public AdresseDto getNouvelleAdresse() { return nouvelleAdresse; } public void setNouvelleAdresse(AdresseDto v) { this.nouvelleAdresse = v; }
}
