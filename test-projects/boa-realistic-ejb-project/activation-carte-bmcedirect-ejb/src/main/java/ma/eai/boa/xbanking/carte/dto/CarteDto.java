package ma.eai.boa.xbanking.carte.dto;

import ma.eai.boa.xbanking.carte.enums.StatutCarte;
import ma.eai.boa.xbanking.carte.enums.TypeCarte;
import ma.eai.midw.usecases.ValueObject;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;

@XmlAccessorType(XmlAccessType.FIELD)
@XmlType(name = "CarteDto")
public class CarteDto implements ValueObject {
    private static final long serialVersionUID = 1L;

    @XmlElement(required = true) private String numeroCarte;
    @XmlElement private String numeroCarteMasque;
    @XmlElement private TypeCarte typeCarte;
    @XmlElement private StatutCarte statutCarte;
    @XmlElement private String dateExpiration;
    @XmlElement private String dateActivation;
    @XmlElement private String porteur;
    @XmlElement private BigDecimal plafondRetrait;
    @XmlElement private BigDecimal plafondPaiement;
    @XmlElement private String ribAssocie;
    @XmlTransient private String cvv;
    @XmlTransient private String codePin;

    public String getNumeroCarte() { return numeroCarte; }
    public void setNumeroCarte(String v) { this.numeroCarte = v; }
    public String getNumeroCarteMasque() { return numeroCarteMasque; }
    public void setNumeroCarteMasque(String v) { this.numeroCarteMasque = v; }
    public TypeCarte getTypeCarte() { return typeCarte; }
    public void setTypeCarte(TypeCarte v) { this.typeCarte = v; }
    public StatutCarte getStatutCarte() { return statutCarte; }
    public void setStatutCarte(StatutCarte v) { this.statutCarte = v; }
    public String getDateExpiration() { return dateExpiration; }
    public void setDateExpiration(String v) { this.dateExpiration = v; }
    public String getDateActivation() { return dateActivation; }
    public void setDateActivation(String v) { this.dateActivation = v; }
    public String getPorteur() { return porteur; }
    public void setPorteur(String v) { this.porteur = v; }
    public BigDecimal getPlafondRetrait() { return plafondRetrait; }
    public void setPlafondRetrait(BigDecimal v) { this.plafondRetrait = v; }
    public BigDecimal getPlafondPaiement() { return plafondPaiement; }
    public void setPlafondPaiement(BigDecimal v) { this.plafondPaiement = v; }
    public String getRibAssocie() { return ribAssocie; }
    public void setRibAssocie(String v) { this.ribAssocie = v; }
    public String getCvv() { return cvv; }
    public void setCvv(String v) { this.cvv = v; }
    public String getCodePin() { return codePin; }
    public void setCodePin(String v) { this.codePin = v; }
}
