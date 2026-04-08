package ma.eai.boa.xbanking.notification.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class EnvoyerNotificationVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String referenceNotification;
    @XmlElement private int nbDestinataires;
    @XmlElement private String dateEnvoi;
    public String getCodeRetour() { return codeRetour; } public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; } public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getReferenceNotification() { return referenceNotification; } public void setReferenceNotification(String v) { this.referenceNotification = v; }
    public int getNbDestinataires() { return nbDestinataires; } public void setNbDestinataires(int v) { this.nbDestinataires = v; }
    public String getDateEnvoi() { return dateEnvoi; } public void setDateEnvoi(String v) { this.dateEnvoi = v; }
}
