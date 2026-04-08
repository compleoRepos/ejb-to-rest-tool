package ma.eai.boa.xbanking.carte.dto;

import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.carte.enums.StatutCarte;
import javax.xml.bind.annotation.*;

@XmlRootElement(name = "activerCarteVoOut")
@XmlAccessorType(XmlAccessType.FIELD)
public class ActiverCarteVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;

    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String numCarte;
    @XmlElement private StatutCarte statutCarte;
    @XmlElement private String dateActivation;
    @XmlElement private String heureActivation;
    @XmlElement private CarteDto detailCarte;
    @XmlTransient private String scoreInterne;

    public String getCodeRetour() { return codeRetour; }
    public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; }
    public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getNumCarte() { return numCarte; }
    public void setNumCarte(String v) { this.numCarte = v; }
    public StatutCarte getStatutCarte() { return statutCarte; }
    public void setStatutCarte(StatutCarte v) { this.statutCarte = v; }
    public String getDateActivation() { return dateActivation; }
    public void setDateActivation(String v) { this.dateActivation = v; }
    public String getHeureActivation() { return heureActivation; }
    public void setHeureActivation(String v) { this.heureActivation = v; }
    public CarteDto getDetailCarte() { return detailCarte; }
    public void setDetailCarte(CarteDto v) { this.detailCarte = v; }
    public String getScoreInterne() { return scoreInterne; }
    public void setScoreInterne(String v) { this.scoreInterne = v; }
}
