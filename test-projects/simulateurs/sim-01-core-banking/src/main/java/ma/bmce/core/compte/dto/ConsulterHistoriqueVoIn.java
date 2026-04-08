package ma.bmce.core.compte.dto;

import ma.bmce.core.framework.ValueObject;
import java.io.Serializable;
import java.time.LocalDate;

public class ConsulterHistoriqueVoIn implements ValueObject, Serializable {
    private String numCompte;
    private LocalDate dateDebut;
    private LocalDate dateFin;
    private Integer page;
    private Integer size;

    public String getNumCompte() { return numCompte; }
    public void setNumCompte(String numCompte) { this.numCompte = numCompte; }
    public LocalDate getDateDebut() { return dateDebut; }
    public void setDateDebut(LocalDate dateDebut) { this.dateDebut = dateDebut; }
    public LocalDate getDateFin() { return dateFin; }
    public void setDateFin(LocalDate dateFin) { this.dateFin = dateFin; }
    public Integer getPage() { return page; }
    public void setPage(Integer page) { this.page = page; }
    public Integer getSize() { return size; }
    public void setSize(Integer size) { this.size = size; }
}
