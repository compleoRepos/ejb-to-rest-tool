package ma.eai.boa.xbanking.client.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class MajClientVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String dateModification;
    public String getCodeRetour() { return codeRetour; } public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; } public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getDateModification() { return dateModification; } public void setDateModification(String v) { this.dateModification = v; }
}
