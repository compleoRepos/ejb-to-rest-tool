package ma.eai.boa.xbanking.credit.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class SimulerCreditVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private BigDecimal mensualite;
    @XmlElement private BigDecimal tauxInteret;
    @XmlElement private BigDecimal coutTotal;
    @XmlElement private BigDecimal coutAssurance;
    @XmlElement private BigDecimal taeg;
    @XmlElement private String datePremiereEcheance;
    public String getCodeRetour() { return codeRetour; } public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; } public void setMessageRetour(String v) { this.messageRetour = v; }
    public BigDecimal getMensualite() { return mensualite; } public void setMensualite(BigDecimal v) { this.mensualite = v; }
    public BigDecimal getTauxInteret() { return tauxInteret; } public void setTauxInteret(BigDecimal v) { this.tauxInteret = v; }
    public BigDecimal getCoutTotal() { return coutTotal; } public void setCoutTotal(BigDecimal v) { this.coutTotal = v; }
    public BigDecimal getCoutAssurance() { return coutAssurance; } public void setCoutAssurance(BigDecimal v) { this.coutAssurance = v; }
    public BigDecimal getTaeg() { return taeg; } public void setTaeg(BigDecimal v) { this.taeg = v; }
    public String getDatePremiereEcheance() { return datePremiereEcheance; } public void setDatePremiereEcheance(String v) { this.datePremiereEcheance = v; }
}
