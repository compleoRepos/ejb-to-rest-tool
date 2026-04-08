package ma.bmce.virement.dto;

import java.io.Serializable;
import java.time.LocalDateTime;

public class EtapeVirement implements Serializable {
    private String etape;
    private LocalDateTime date;
    private String statut;

    public String getEtape() { return etape; }
    public void setEtape(String etape) { this.etape = etape; }
    public LocalDateTime getDate() { return date; }
    public void setDate(LocalDateTime date) { this.date = date; }
    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }
}
