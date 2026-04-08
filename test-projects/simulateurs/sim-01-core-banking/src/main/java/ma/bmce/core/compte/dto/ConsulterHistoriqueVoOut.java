package ma.bmce.core.compte.dto;

import ma.bmce.core.framework.ValueObject;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.List;

public class ConsulterHistoriqueVoOut implements ValueObject, Serializable {
    private List<OperationDto> operations;
    private Long totalElements;
    private BigDecimal soldeOuverture;
    private BigDecimal soldeCloture;

    public List<OperationDto> getOperations() { return operations; }
    public void setOperations(List<OperationDto> operations) { this.operations = operations; }
    public Long getTotalElements() { return totalElements; }
    public void setTotalElements(Long totalElements) { this.totalElements = totalElements; }
    public BigDecimal getSoldeOuverture() { return soldeOuverture; }
    public void setSoldeOuverture(BigDecimal soldeOuverture) { this.soldeOuverture = soldeOuverture; }
    public BigDecimal getSoldeCloture() { return soldeCloture; }
    public void setSoldeCloture(BigDecimal soldeCloture) { this.soldeCloture = soldeCloture; }
}
