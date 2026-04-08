package ma.eai.boa.xbanking.common.dto;

import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;

@XmlAccessorType(XmlAccessType.FIELD)
@XmlType(name = "AdresseDto", propOrder = {"ligne1", "ligne2", "codePostal", "ville", "pays"})
public class AdresseDto implements ValueObject {
    private static final long serialVersionUID = 1L;

    @XmlElement(required = true) private String ligne1;
    @XmlElement private String ligne2;
    @XmlElement(required = true) private String codePostal;
    @XmlElement(required = true) private String ville;
    @XmlElement(required = true) private String pays;

    public String getLigne1() { return ligne1; }
    public void setLigne1(String v) { this.ligne1 = v; }
    public String getLigne2() { return ligne2; }
    public void setLigne2(String v) { this.ligne2 = v; }
    public String getCodePostal() { return codePostal; }
    public void setCodePostal(String v) { this.codePostal = v; }
    public String getVille() { return ville; }
    public void setVille(String v) { this.ville = v; }
    public String getPays() { return pays; }
    public void setPays(String v) { this.pays = v; }
}
