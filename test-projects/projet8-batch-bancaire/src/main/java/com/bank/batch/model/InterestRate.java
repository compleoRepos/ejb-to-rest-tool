package com.bank.batch.model;

import javax.persistence.Entity;
import javax.persistence.Id;
import java.math.BigDecimal;

/**
 * Entité représentant un taux d'intérêt.
 *
 * @author Hamza NORDINE
 */
@Entity
public class InterestRate {

    @Id
    private String rateType; // e.g., SAVINGS, CHECKING
    private BigDecimal rateValue;

    public String getRateType() {
        return rateType;
    }

    public void setRateType(String rateType) {
        this.rateType = rateType;
    }

    public BigDecimal getRateValue() {
        return rateValue;
    }

    public void setRateValue(BigDecimal rateValue) {
        this.rateValue = rateValue;
    }
}
src/main/java/com/bank/batch/dto/BatchStatusDTO.java
