package ma.bmce.kyc.dto;

import java.io.Serializable;

public class FacteurRisque implements Serializable {
    private String facteur;
    private Integer poids;
    private String detail;

    public String getFacteur() { return facteur; }
    public void setFacteur(String facteur) { this.facteur = facteur; }
    public Integer getPoids() { return poids; }
    public void setPoids(Integer poids) { this.poids = poids; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
}
