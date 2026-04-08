package ma.bmce.virement.dto;

import java.io.Serializable;
import java.math.BigDecimal;

public class InitierVirementInternationalVoIn implements Serializable {
    private String compteDebiteur;
    private String ibanDestinataire; // pas de @Pattern — FIN-002
    private String codeSwiftBanque;
    private String nomBeneficiaire;
    private String adresseBeneficiaire;
    private BigDecimal montant;
    private String deviseDestination;
    private BigDecimal tauxChange;
    private BigDecimal montantConverti;
    private String motif;
    private String justificatifBase64;

    public String getCompteDebiteur() { return compteDebiteur; }
    public void setCompteDebiteur(String v) { this.compteDebiteur = v; }
    public String getIbanDestinataire() { return ibanDestinataire; }
    public void setIbanDestinataire(String v) { this.ibanDestinataire = v; }
    public String getCodeSwiftBanque() { return codeSwiftBanque; }
    public void setCodeSwiftBanque(String v) { this.codeSwiftBanque = v; }
    public String getNomBeneficiaire() { return nomBeneficiaire; }
    public void setNomBeneficiaire(String v) { this.nomBeneficiaire = v; }
    public String getAdresseBeneficiaire() { return adresseBeneficiaire; }
    public void setAdresseBeneficiaire(String v) { this.adresseBeneficiaire = v; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal v) { this.montant = v; }
    public String getDeviseDestination() { return deviseDestination; }
    public void setDeviseDestination(String v) { this.deviseDestination = v; }
    public BigDecimal getTauxChange() { return tauxChange; }
    public void setTauxChange(BigDecimal v) { this.tauxChange = v; }
    public BigDecimal getMontantConverti() { return montantConverti; }
    public void setMontantConverti(BigDecimal v) { this.montantConverti = v; }
    public String getMotif() { return motif; }
    public void setMotif(String v) { this.motif = v; }
    public String getJustificatifBase64() { return justificatifBase64; }
    public void setJustificatifBase64(String v) { this.justificatifBase64 = v; }
}
