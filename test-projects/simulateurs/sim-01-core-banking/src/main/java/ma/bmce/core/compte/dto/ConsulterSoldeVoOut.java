package ma.bmce.core.compte.dto;

import ma.bmce.core.framework.ValueObject;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public class ConsulterSoldeVoOut implements ValueObject, Serializable {
    private BigDecimal soldeDisponible;
    private BigDecimal soldeComptable;
    private BigDecimal soldeBloque;
    private String devise;
    private LocalDateTime dateArrete;

    public BigDecimal getSoldeDisponible() { return soldeDisponible; }
    public void setSoldeDisponible(BigDecimal soldeDisponible) { this.soldeDisponible = soldeDisponible; }
    public BigDecimal getSoldeComptable() { return soldeComptable; }
    public void setSoldeComptable(BigDecimal soldeComptable) { this.soldeComptable = soldeComptable; }
    public BigDecimal getSoldeBloque() { return soldeBloque; }
    public void setSoldeBloque(BigDecimal soldeBloque) { this.soldeBloque = soldeBloque; }
    public String getDevise() { return devise; }
    public void setDevise(String devise) { this.devise = devise; }
    public LocalDateTime getDateArrete() { return dateArrete; }
    public void setDateArrete(LocalDateTime dateArrete) { this.dateArrete = dateArrete; }
}
