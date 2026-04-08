package ma.bmce.core.compte.dto;

import ma.bmce.core.compte.enums.SensOperation;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

public class OperationDto implements Serializable {
    private String reference;
    private LocalDate date;
    private String libelle;
    private BigDecimal montant;
    private SensOperation sens;
    private BigDecimal soldeApres;

    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    public String getLibelle() { return libelle; }
    public void setLibelle(String libelle) { this.libelle = libelle; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal montant) { this.montant = montant; }
    public SensOperation getSens() { return sens; }
    public void setSens(SensOperation sens) { this.sens = sens; }
    public BigDecimal getSoldeApres() { return soldeApres; }
    public void setSoldeApres(BigDecimal soldeApres) { this.soldeApres = soldeApres; }
}
