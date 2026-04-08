package ma.bmce.core.operation.dto;

import ma.bmce.core.framework.ValueObject;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public class DebitVoOut implements ValueObject, Serializable {
    private String referenceOperation;
    private BigDecimal soldeApres;
    private LocalDateTime dateOperation;

    public String getReferenceOperation() { return referenceOperation; }
    public void setReferenceOperation(String referenceOperation) { this.referenceOperation = referenceOperation; }
    public BigDecimal getSoldeApres() { return soldeApres; }
    public void setSoldeApres(BigDecimal soldeApres) { this.soldeApres = soldeApres; }
    public LocalDateTime getDateOperation() { return dateOperation; }
    public void setDateOperation(LocalDateTime dateOperation) { this.dateOperation = dateOperation; }
}
