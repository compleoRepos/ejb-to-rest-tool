package ma.eai.boa.xbanking.compte.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class OuvrirCompteVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String numeroCompte;
    @XmlElement private String rib;
    @XmlElement private String iban;
    @XmlElement private String dateOuverture;
    @XmlElement private String statut;
    public String getCodeRetour() { return codeRetour; } public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; } public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getNumeroCompte() { return numeroCompte; } public void setNumeroCompte(String v) { this.numeroCompte = v; }
    public String getRib() { return rib; } public void setRib(String v) { this.rib = v; }
    public String getIban() { return iban; } public void setIban(String v) { this.iban = v; }
    public String getDateOuverture() { return dateOuverture; } public void setDateOuverture(String v) { this.dateOuverture = v; }
    public String getStatut() { return statut; } public void setStatut(String v) { this.statut = v; }
}
