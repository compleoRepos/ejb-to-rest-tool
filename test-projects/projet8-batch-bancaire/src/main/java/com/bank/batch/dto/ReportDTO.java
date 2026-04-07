package com.bank.batch.dto;

import java.util.Date;
import java.util.List;

/**
 * DTO pour les rapports de batch.
 *
 * @author Hamza NORDINE
 */
public class ReportDTO {

    private String reportName;
    private Date generationDate;
    private List<String> data;

    public String getReportName() {
        return reportName;
    }

    public void setReportName(String reportName) {
        this.reportName = reportName;
    }

    public Date getGenerationDate() {
        return generationDate;
    }

    public void setGenerationDate(Date generationDate) {
        this.generationDate = generationDate;
    }

    public List<String> getData() {
        return data;
    }

    public void setData(List<String> data) {
        this.data = data;
    }
}
src/main/java/com/bank/batch/exception/BatchProcessingException.java
