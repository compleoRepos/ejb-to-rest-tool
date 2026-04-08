package ma.bmce.core.operation.dto;

import ma.bmce.core.framework.ValueObject;
import java.io.Serializable;
import java.math.BigDecimal;

public class DebitVoIn implements ValueObject, Serializable {
    private String numCompte;
    private BigDecimal montant;
    private String libelle;
    private String referenceExterne;

    public String getNumCompte() { return numCompte; }
    public void setNumCompte(String numCompte) { this.numCompte = numCompte; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal montant) { this.montant = montant; }
    public String getLibelle() { return libelle; }
    public void setLibelle(String libelle) { this.libelle = libelle; }
    public String getReferenceExterne() { return referenceExterne; }
    public void setReferenceExterne(String referenceExterne) { this.referenceExterne = referenceExterne; }
}
