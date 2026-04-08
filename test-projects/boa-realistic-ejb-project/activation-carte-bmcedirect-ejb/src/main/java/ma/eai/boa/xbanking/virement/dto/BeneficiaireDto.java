package ma.eai.boa.xbanking.virement.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;

@XmlAccessorType(XmlAccessType.FIELD)
public class BeneficiaireDto implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String nom;
    @XmlElement private String prenom;
    @XmlElement private String rib;
    @XmlElement private String iban;
    @XmlElement private String banque;
    public String getNom() { return nom; } public void setNom(String v) { this.nom = v; }
    public String getPrenom() { return prenom; } public void setPrenom(String v) { this.prenom = v; }
    public String getRib() { return rib; } public void setRib(String v) { this.rib = v; }
    public String getIban() { return iban; } public void setIban(String v) { this.iban = v; }
    public String getBanque() { return banque; } public void setBanque(String v) { this.banque = v; }
}
