package ma.bmce.credit.entity;

import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

// Pattern E: @Entity sans @Version — lost update — JPA-011, CON-003
@Entity
@Table(name = "T_DOSSIERS_CREDIT")
public class CreditDossier implements Serializable {

    @Id
    private Long id;
    // PAS de @Version ! → CON-003 (lost update)

    private String referenceClient;
    private String typeCredit;
    private BigDecimal montant;
    private Integer dureeAns;
    private String statut;
    private BigDecimal tauxNegocie;
    private LocalDate dateCreation;
    private LocalDate dateDecision;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getReferenceClient() { return referenceClient; }
    public void setReferenceClient(String v) { this.referenceClient = v; }
    public String getTypeCredit() { return typeCredit; }
    public void setTypeCredit(String v) { this.typeCredit = v; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal v) { this.montant = v; }
    public Integer getDureeAns() { return dureeAns; }
    public void setDureeAns(Integer v) { this.dureeAns = v; }
    public String getStatut() { return statut; }
    public void setStatut(String v) { this.statut = v; }
    public BigDecimal getTauxNegocie() { return tauxNegocie; }
    public void setTauxNegocie(BigDecimal v) { this.tauxNegocie = v; }
    public LocalDate getDateCreation() { return dateCreation; }
    public void setDateCreation(LocalDate v) { this.dateCreation = v; }
    public LocalDate getDateDecision() { return dateDecision; }
    public void setDateDecision(LocalDate v) { this.dateDecision = v; }
}
