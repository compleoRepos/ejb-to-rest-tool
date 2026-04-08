package ma.eai.boa.xbanking.virement.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class VirementVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String referenceVirement;
    @XmlElement private String statut;
    @XmlElement private BigDecimal nouveauSolde;
    @XmlElement private BigDecimal fraisOperation;
    @XmlElement private String dateExecution;
    public String getCodeRetour() { return codeRetour; } public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; } public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getReferenceVirement() { return referenceVirement; } public void setReferenceVirement(String v) { this.referenceVirement = v; }
    public String getStatut() { return statut; } public void setStatut(String v) { this.statut = v; }
    public BigDecimal getNouveauSolde() { return nouveauSolde; } public void setNouveauSolde(BigDecimal v) { this.nouveauSolde = v; }
    public BigDecimal getFraisOperation() { return fraisOperation; } public void setFraisOperation(BigDecimal v) { this.fraisOperation = v; }
    public String getDateExecution() { return dateExecution; } public void setDateExecution(String v) { this.dateExecution = v; }
}
