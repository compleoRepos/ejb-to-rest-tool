package ma.bmce.virement.dto;

import ma.bmce.virement.enums.StatutVirement;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

public class VirementResume implements Serializable {
    private String reference;
    private BigDecimal montant;
    private StatutVirement statut;
    private LocalDate date;

    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal montant) { this.montant = montant; }
    public StatutVirement getStatut() { return statut; }
    public void setStatut(StatutVirement statut) { this.statut = statut; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
}
