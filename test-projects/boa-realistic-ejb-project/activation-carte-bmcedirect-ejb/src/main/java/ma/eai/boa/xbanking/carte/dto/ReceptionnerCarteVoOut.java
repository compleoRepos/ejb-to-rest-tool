package ma.eai.boa.xbanking.carte.dto;

import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ReceptionnerCarteVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String numCarte;
    @XmlElement private String dateReception;
    @XmlElement private String agenceReception;

    public String getCodeRetour() { return codeRetour; }
    public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; }
    public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getNumCarte() { return numCarte; }
    public void setNumCarte(String v) { this.numCarte = v; }
    public String getDateReception() { return dateReception; }
    public void setDateReception(String v) { this.dateReception = v; }
    public String getAgenceReception() { return agenceReception; }
    public void setAgenceReception(String v) { this.agenceReception = v; }
}
