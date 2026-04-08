package ma.bmce.core.operation.dto;

import ma.bmce.core.framework.ValueObject;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

public class VirementInterneVoIn implements ValueObject, Serializable {
    private String numCompteDebiteur;
    private String numCompteCrediteur;
    private BigDecimal montant;
    private String libelle;
    private LocalDate dateValeur;

    public String getNumCompteDebiteur() { return numCompteDebiteur; }
    public void setNumCompteDebiteur(String numCompteDebiteur) { this.numCompteDebiteur = numCompteDebiteur; }
    public String getNumCompteCrediteur() { return numCompteCrediteur; }
    public void setNumCompteCrediteur(String numCompteCrediteur) { this.numCompteCrediteur = numCompteCrediteur; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal montant) { this.montant = montant; }
    public String getLibelle() { return libelle; }
    public void setLibelle(String libelle) { this.libelle = libelle; }
    public LocalDate getDateValeur() { return dateValeur; }
    public void setDateValeur(LocalDate dateValeur) { this.dateValeur = dateValeur; }
}
