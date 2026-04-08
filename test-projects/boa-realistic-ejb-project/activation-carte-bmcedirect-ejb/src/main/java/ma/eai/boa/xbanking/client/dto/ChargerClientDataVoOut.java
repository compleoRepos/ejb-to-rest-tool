package ma.eai.boa.xbanking.client.dto;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.common.dto.AdresseDto;
import ma.eai.boa.xbanking.carte.dto.CarteDto;
import javax.xml.bind.annotation.*;
import java.util.List;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ChargerClientDataVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String nom;
    @XmlElement private String prenom;
    @XmlElement private String cin;
    @XmlElement private String dateNaissance;
    @XmlElement private String email;
    @XmlElement private String telephone;
    @XmlElement private String segmentCommercial;
    @XmlElement private AdresseDto adresse;
    @XmlElementWrapper(name = "cartes") @XmlElement(name = "carte") private List<CarteDto> cartes;
    @XmlElementWrapper(name = "comptes") @XmlElement(name = "rib") private List<String> comptes;
    @XmlTransient private String scoreInterne;
    public String getCodeRetour() { return codeRetour; } public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; } public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getNom() { return nom; } public void setNom(String v) { this.nom = v; }
    public String getPrenom() { return prenom; } public void setPrenom(String v) { this.prenom = v; }
    public String getCin() { return cin; } public void setCin(String v) { this.cin = v; }
    public String getDateNaissance() { return dateNaissance; } public void setDateNaissance(String v) { this.dateNaissance = v; }
    public String getEmail() { return email; } public void setEmail(String v) { this.email = v; }
    public String getTelephone() { return telephone; } public void setTelephone(String v) { this.telephone = v; }
    public String getSegmentCommercial() { return segmentCommercial; } public void setSegmentCommercial(String v) { this.segmentCommercial = v; }
    public AdresseDto getAdresse() { return adresse; } public void setAdresse(AdresseDto v) { this.adresse = v; }
    public List<CarteDto> getCartes() { return cartes; } public void setCartes(List<CarteDto> v) { this.cartes = v; }
    public List<String> getComptes() { return comptes; } public void setComptes(List<String> v) { this.comptes = v; }
    public String getScoreInterne() { return scoreInterne; } public void setScoreInterne(String v) { this.scoreInterne = v; }
}
