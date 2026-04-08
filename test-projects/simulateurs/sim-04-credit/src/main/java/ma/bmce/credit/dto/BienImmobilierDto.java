package ma.bmce.credit.dto;

import java.io.Serializable;
import java.math.BigDecimal;

public class BienImmobilierDto implements Serializable {
    private String type;
    private String adresse;
    private BigDecimal superficie;
    private BigDecimal prixAcquisition;
    private String ville;

    public String getType() { return type; }
    public void setType(String v) { this.type = v; }
    public String getAdresse() { return adresse; }
    public void setAdresse(String v) { this.adresse = v; }
    public BigDecimal getSuperficie() { return superficie; }
    public void setSuperficie(BigDecimal v) { this.superficie = v; }
    public BigDecimal getPrixAcquisition() { return prixAcquisition; }
    public void setPrixAcquisition(BigDecimal v) { this.prixAcquisition = v; }
    public String getVille() { return ville; }
    public void setVille(String v) { this.ville = v; }
}
