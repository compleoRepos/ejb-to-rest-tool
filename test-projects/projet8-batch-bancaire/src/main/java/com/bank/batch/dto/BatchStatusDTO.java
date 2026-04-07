package com.bank.batch.dto;

import java.util.Date;

/**
 * DTO pour le statut d'un batch.
 *
 * @author Hamza NORDINE
 */
public class BatchStatusDTO {

    private Long jobId;
    private String status;
    private Date lastExecution;

    public Long getJobId() {
        return jobId;
    }

    public void setJobId(Long jobId) {
        this.jobId = jobId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Date getLastExecution() {
        return lastExecution;
    }

    public void setLastExecution(Date lastExecution) {
        this.lastExecution = lastExecution;
    }
}
src/main/java/com/bank/batch/dto/ReportDTO.java
