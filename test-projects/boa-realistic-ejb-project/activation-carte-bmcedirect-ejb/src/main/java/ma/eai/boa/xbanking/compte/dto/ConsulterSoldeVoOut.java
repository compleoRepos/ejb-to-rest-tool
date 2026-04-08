package ma.eai.boa.xbanking.compte.dto;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;

@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ConsulterSoldeVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String codeRetour;
    @XmlElement private String messageRetour;
    @XmlElement private String rib;
    @XmlElement private BigDecimal soldeComptable;
    @XmlElement private BigDecimal soldeDisponible;
    @XmlElement private BigDecimal montantAutorise;
    @XmlElement private String deviseCompte;
    @XmlElement private String dateValeur;
    public String getCodeRetour() { return codeRetour; } public void setCodeRetour(String v) { this.codeRetour = v; }
    public String getMessageRetour() { return messageRetour; } public void setMessageRetour(String v) { this.messageRetour = v; }
    public String getRib() { return rib; } public void setRib(String v) { this.rib = v; }
    public BigDecimal getSoldeComptable() { return soldeComptable; } public void setSoldeComptable(BigDecimal v) { this.soldeComptable = v; }
    public BigDecimal getSoldeDisponible() { return soldeDisponible; } public void setSoldeDisponible(BigDecimal v) { this.soldeDisponible = v; }
    public BigDecimal getMontantAutorise() { return montantAutorise; } public void setMontantAutorise(BigDecimal v) { this.montantAutorise = v; }
    public String getDeviseCompte() { return deviseCompte; } public void setDeviseCompte(String v) { this.deviseCompte = v; }
    public String getDateValeur() { return dateValeur; } public void setDateValeur(String v) { this.dateValeur = v; }
}
