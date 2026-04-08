package ma.eai.boa.xbanking.notification.dto;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.common.enums.Canal;
import javax.xml.bind.annotation.*;
import java.util.List;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class EnvoyerNotificationVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) private String corporateId;
    @XmlElement(required = true) private String sujet;
    @XmlElement(required = true) private String contenu;
    @XmlElement private Canal canal;
    @XmlElementWrapper(name = "destinataires") @XmlElement(name = "dest") private List<String> destinataires;
    @XmlElement private String templateId;
    public String getCorporateId() { return corporateId; } public void setCorporateId(String v) { this.corporateId = v; }
    public String getSujet() { return sujet; } public void setSujet(String v) { this.sujet = v; }
    public String getContenu() { return contenu; } public void setContenu(String v) { this.contenu = v; }
    public Canal getCanal() { return canal; } public void setCanal(Canal v) { this.canal = v; }
    public List<String> getDestinataires() { return destinataires; } public void setDestinataires(List<String> v) { this.destinataires = v; }
    public String getTemplateId() { return templateId; } public void setTemplateId(String v) { this.templateId = v; }
}
