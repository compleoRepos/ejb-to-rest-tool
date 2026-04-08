package ma.eai.boa.xbanking.compte.dto;
import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.compte.enums.TypeCompte;
import javax.xml.bind.annotation.*;
import javax.validation.constraints.NotBlank;
import java.math.BigDecimal;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class OuvrirCompteVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required = true) @NotBlank private String corporateId;
    @XmlElement(required = true) private TypeCompte typeCompte;
    @XmlElement(required = true) private String devise;
    @XmlElement private BigDecimal versementInitial;
    @XmlElement private String codeAgence;
    @XmlElement private String commentaire;
    public String getCorporateId() { return corporateId; } public void setCorporateId(String v) { this.corporateId = v; }
    public TypeCompte getTypeCompte() { return typeCompte; } public void setTypeCompte(TypeCompte v) { this.typeCompte = v; }
    public String getDevise() { return devise; } public void setDevise(String v) { this.devise = v; }
    public BigDecimal getVersementInitial() { return versementInitial; } public void setVersementInitial(BigDecimal v) { this.versementInitial = v; }
    public String getCodeAgence() { return codeAgence; } public void setCodeAgence(String v) { this.codeAgence = v; }
    public String getCommentaire() { return commentaire; } public void setCommentaire(String v) { this.commentaire = v; }
}
