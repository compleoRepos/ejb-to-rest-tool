package ma.eai.boa.xbanking.carte.dto;

import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.carte.enums.StatutCarte;
import javax.xml.bind.annotation.*;

@XmlRootElement
@XmlAccessorType(XmlAccessType.FIELD)
public class BloquerCarteVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String numCarte;
    @XmlElement private StatutCarte nouveauStatut;
    @XmlElement private String dateBlocage;
    @XmlElement private String referenceOpposition;

    public String getCodeRetour() { return codeRetour; }
    public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; }
    public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getNumCarte() { return numCarte; }
    public void setNumCarte(String v) { this.numCarte = v; }
    public StatutCarte getNouveauStatut() { return nouveauStatut; }
    public void setNouveauStatut(StatutCarte v) { this.nouveauStatut = v; }
    public String getDateBlocage() { return dateBlocage; }
    public void setDateBlocage(String v) { this.dateBlocage = v; }
    public String getReferenceOpposition() { return referenceOpposition; }
    public void setReferenceOpposition(String v) { this.referenceOpposition = v; }
}
