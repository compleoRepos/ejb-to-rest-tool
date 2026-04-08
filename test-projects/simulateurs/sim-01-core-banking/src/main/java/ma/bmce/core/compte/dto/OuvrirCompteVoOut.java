package ma.bmce.core.compte.dto;

import ma.bmce.core.compte.enums.StatutCompte;
import ma.bmce.core.framework.ValueObject;
import java.io.Serializable;
import java.time.LocalDate;

public class OuvrirCompteVoOut implements ValueObject, Serializable {
    private String numCompte;
    private String ribComplet;
    private String iban;
    private LocalDate dateOuverture;
    private StatutCompte statut;

    public String getNumCompte() { return numCompte; }
    public void setNumCompte(String numCompte) { this.numCompte = numCompte; }
    public String getRibComplet() { return ribComplet; }
    public void setRibComplet(String ribComplet) { this.ribComplet = ribComplet; }
    public String getIban() { return iban; }
    public void setIban(String iban) { this.iban = iban; }
    public LocalDate getDateOuverture() { return dateOuverture; }
    public void setDateOuverture(LocalDate dateOuverture) { this.dateOuverture = dateOuverture; }
    public StatutCompte getStatut() { return statut; }
    public void setStatut(StatutCompte statut) { this.statut = statut; }
}
