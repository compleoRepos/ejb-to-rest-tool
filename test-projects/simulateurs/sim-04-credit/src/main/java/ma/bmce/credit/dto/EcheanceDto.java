package ma.bmce.credit.dto;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

public class EcheanceDto implements Serializable {
    private Integer numero;
    private LocalDate date;
    private BigDecimal capital;
    private BigDecimal interets;
    private BigDecimal assurance;
    private BigDecimal mensualite;
    private BigDecimal capitalRestant;

    public Integer getNumero() { return numero; }
    public void setNumero(Integer v) { this.numero = v; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate v) { this.date = v; }
    public BigDecimal getCapital() { return capital; }
    public void setCapital(BigDecimal v) { this.capital = v; }
    public BigDecimal getInterets() { return interets; }
    public void setInterets(BigDecimal v) { this.interets = v; }
    public BigDecimal getAssurance() { return assurance; }
    public void setAssurance(BigDecimal v) { this.assurance = v; }
    public BigDecimal getMensualite() { return mensualite; }
    public void setMensualite(BigDecimal v) { this.mensualite = v; }
    public BigDecimal getCapitalRestant() { return capitalRestant; }
    public void setCapitalRestant(BigDecimal v) { this.capitalRestant = v; }
}
