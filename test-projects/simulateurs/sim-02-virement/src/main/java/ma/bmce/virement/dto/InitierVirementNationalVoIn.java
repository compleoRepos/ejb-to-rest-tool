package ma.bmce.virement.dto;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

public class InitierVirementNationalVoIn implements Serializable {
    private String compteDebiteur;
    private String iban;
    private BigDecimal montant;
    private String deviseCode;
    private String motif;
    private Boolean urgence;
    private LocalDate dateExecution;

    public String getCompteDebiteur() { return compteDebiteur; }
    public void setCompteDebiteur(String v) { this.compteDebiteur = v; }
    public String getIban() { return iban; }
    public void setIban(String v) { this.iban = v; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal v) { this.montant = v; }
    public String getDeviseCode() { return deviseCode; }
    public void setDeviseCode(String v) { this.deviseCode = v; }
    public String getMotif() { return motif; }
    public void setMotif(String v) { this.motif = v; }
    public Boolean getUrgence() { return urgence; }
    public void setUrgence(Boolean v) { this.urgence = v; }
    public LocalDate getDateExecution() { return dateExecution; }
    public void setDateExecution(LocalDate v) { this.dateExecution = v; }
}
