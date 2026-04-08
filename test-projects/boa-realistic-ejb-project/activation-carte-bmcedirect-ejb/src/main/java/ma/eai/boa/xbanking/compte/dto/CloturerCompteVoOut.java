package ma.eai.boa.xbanking.compte.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class CloturerCompteVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String rib;
    @XmlElement private String dateCloture;
    @XmlElement private String soldeResiduel;
    public String getCodeRetour() { return codeRetour; } public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; } public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getRib() { return rib; } public void setRib(String v) { this.rib = v; }
    public String getDateCloture() { return dateCloture; } public void setDateCloture(String v) { this.dateCloture = v; }
    public String getSoldeResiduel() { return soldeResiduel; } public void setSoldeResiduel(String v) { this.soldeResiduel = v; }
}
