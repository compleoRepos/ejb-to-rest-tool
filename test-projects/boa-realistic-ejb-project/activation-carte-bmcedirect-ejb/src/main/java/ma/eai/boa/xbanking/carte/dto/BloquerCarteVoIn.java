package ma.eai.boa.xbanking.carte.dto;

import ma.eai.midw.usecases.ValueObject;
import ma.eai.boa.xbanking.carte.enums.MotifBlocage;
import ma.eai.boa.xbanking.carte.validation.ValidNumCarte;
import javax.xml.bind.annotation.*;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@XmlRootElement(name = "bloquerCarteVoIn")
@XmlAccessorType(XmlAccessType.FIELD)
public class BloquerCarteVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;

    @XmlElement(required = true) @NotBlank @ValidNumCarte private String numCarte;
    @XmlElement(required = true) @NotNull private MotifBlocage motifBlocage;
    @XmlElement(required = true) @NotBlank private String corporateId;
    @XmlElement private String commentaire;
    @XmlElement private boolean blocageImmediat;

    public String getNumCarte() { return numCarte; }
    public void setNumCarte(String v) { this.numCarte = v; }
    public MotifBlocage getMotifBlocage() { return motifBlocage; }
    public void setMotifBlocage(MotifBlocage v) { this.motifBlocage = v; }
    public String getCorporateId() { return corporateId; }
    public void setCorporateId(String v) { this.corporateId = v; }
    public String getCommentaire() { return commentaire; }
    public void setCommentaire(String v) { this.commentaire = v; }
    public boolean isBlocageImmediat() { return blocageImmediat; }
    public void setBlocageImmediat(boolean v) { this.blocageImmediat = v; }
}
