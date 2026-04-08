package ma.eai.boa.xbanking.virement.dto;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.virement.validation.ValidRIB;
import ma.eai.boa.xbanking.virement.validation.ValidIBAN;
import ma.eai.boa.xbanking.common.enums.DeviseCode;
import javax.xml.bind.annotation.*;
import javax.validation.constraints.*;
import java.math.BigDecimal;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
@XmlType(name = "VirementVoIn", propOrder = {"ribEmetteur","ribBeneficiaire","ibanBeneficiaire","montantDemande","devise","motif","typVirement","dateExecution","corporateId"})
public class VirementVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) @NotBlank @ValidRIB private String ribEmetteur;
    @XmlElement @ValidRIB private String ribBeneficiaire;
    @XmlElement @ValidIBAN private String ibanBeneficiaire;
    @XmlElement(required = true) @NotNull @DecimalMin("0.01") private BigDecimal montantDemande;
    @XmlElement(required = true) private DeviseCode devise;
    @XmlElement(required = true) @NotBlank @Size(max = 140) private String motif;
    @XmlElement private String typVirement;
    @XmlElement private String dateExecution;
    @XmlElement(required = true) @NotBlank private String corporateId;
    public String getRibEmetteur() { return ribEmetteur; } public void setRibEmetteur(String v) { this.ribEmetteur = v; }
    public String getRibBeneficiaire() { return ribBeneficiaire; } public void setRibBeneficiaire(String v) { this.ribBeneficiaire = v; }
    public String getIbanBeneficiaire() { return ibanBeneficiaire; } public void setIbanBeneficiaire(String v) { this.ibanBeneficiaire = v; }
    public BigDecimal getMontantDemande() { return montantDemande; } public void setMontantDemande(BigDecimal v) { this.montantDemande = v; }
    public DeviseCode getDevise() { return devise; } public void setDevise(DeviseCode v) { this.devise = v; }
    public String getMotif() { return motif; } public void setMotif(String v) { this.motif = v; }
    public String getTypVirement() { return typVirement; } public void setTypVirement(String v) { this.typVirement = v; }
    public String getDateExecution() { return dateExecution; } public void setDateExecution(String v) { this.dateExecution = v; }
    public String getCorporateId() { return corporateId; } public void setCorporateId(String v) { this.corporateId = v; }
}
