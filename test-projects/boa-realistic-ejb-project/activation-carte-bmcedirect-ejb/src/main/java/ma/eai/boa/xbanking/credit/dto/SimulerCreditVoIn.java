package ma.eai.boa.xbanking.credit.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class SimulerCreditVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) private String corporateId;
    @XmlElement(required = true) private BigDecimal montant;
    @XmlElement(required = true) private int dureeMois;
    @XmlElement private String devise;
    @XmlElement private boolean avecAssurance;
    @XmlElement private String typeCredit;
    public String getCorporateId() { return corporateId; } public void setCorporateId(String v) { this.corporateId = v; }
    public BigDecimal getMontant() { return montant; } public void setMontant(BigDecimal v) { this.montant = v; }
    public int getDureeMois() { return dureeMois; } public void setDureeMois(int v) { this.dureeMois = v; }
    public String getDevise() { return devise; } public void setDevise(String v) { this.devise = v; }
    public boolean isAvecAssurance() { return avecAssurance; } public void setAvecAssurance(boolean v) { this.avecAssurance = v; }
    public String getTypeCredit() { return typeCredit; } public void setTypeCredit(String v) { this.typeCredit = v; }
}
