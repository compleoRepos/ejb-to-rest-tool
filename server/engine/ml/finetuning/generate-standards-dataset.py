#!/usr/bin/env python3
"""
generate-standards-dataset.py
Generates fine-tuning dataset entries for 6 industry standards:
BIAN (Banking), ACORD (Insurance), HL7/FHIR (Healthcare),
TMForum (Telecom), DDD (E-Commerce), TOGAF (Enterprise).

Each entry teaches the model to:
1. Detect the business domain from Java legacy code
2. Generate Spring Boot code aligned with the corresponding industry standard
3. Add proper documentation referencing the standard
"""

import json
import os
from datetime import datetime

SYSTEM_PROMPT = (
    "You are ejb-modernizer, a specialized AI for migrating Java EE legacy applications "
    "to modern Spring Boot microservices. You detect business domains and align generated "
    "code with industry standards (BIAN, ACORD, HL7/FHIR, TMForum, DDD, TOGAF)."
)

entries = []

# ============================================================================
# 1. BIAN — Banking Industry Architecture Network
# ============================================================================

# 1a. EJB Account Service → Spring Boot BIAN-aligned Service
entries.append({
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": """Migrate this EJB banking service to Spring Boot aligned with BIAN standard:

```java
@Stateless
@Remote(AccountServiceRemote.class)
public class AccountServiceBean implements AccountServiceRemote {
    @PersistenceContext
    private EntityManager em;
    
    @Resource
    private SessionContext ctx;
    
    public AccountDTO getAccount(String accountNumber) {
        Account account = em.find(Account.class, accountNumber);
        if (account == null) throw new AccountNotFoundException(accountNumber);
        return new AccountDTO(account.getNumber(), account.getBalance(), 
                             account.getCurrency(), account.getStatus());
    }
    
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public TransferResult transfer(String fromAccount, String toAccount, 
                                    BigDecimal amount, String currency) {
        Account from = em.find(Account.class, fromAccount);
        Account to = em.find(Account.class, toAccount);
        if (from.getBalance().compareTo(amount) < 0) {
            throw new InsufficientFundsException(fromAccount, amount);
        }
        from.debit(amount);
        to.credit(amount);
        em.merge(from);
        em.merge(to);
        
        TransactionLog log = new TransactionLog(fromAccount, toAccount, amount, currency);
        em.persist(log);
        return new TransferResult(log.getId(), "COMPLETED");
    }
}
```"""},
        {"role": "assistant", "content": """```java
package com.bank.currentaccount.service;

import com.bank.currentaccount.dto.AccountDTO;
import com.bank.currentaccount.dto.TransferRequest;
import com.bank.currentaccount.dto.TransferResult;
import com.bank.currentaccount.entity.Account;
import com.bank.currentaccount.entity.TransactionLog;
import com.bank.currentaccount.exception.AccountNotFoundException;
import com.bank.currentaccount.exception.InsufficientFundsException;
import com.bank.currentaccount.repository.AccountRepository;
import com.bank.currentaccount.repository.TransactionLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Current Account Service — BIAN Service Domain: Current Account.
 * 
 * Aligned with BIAN v12 Service Domain "Current Account":
 * - Service Operations: Retrieve, Initiate (Transfer), Update
 * - Business Object: CurrentAccountFacility
 * - Behavior Qualifier: AccountBalance, PaymentOrder
 * 
 * @see https://bian.org/servicelandscape-12-0/apis/CurrentAccount/
 * 
 * TODO: [BIAN Compliance] Implement BIAN-standard error codes (e.g., CR-001 for insufficient funds).
 *       WHY: BIAN defines standardized error responses for interoperability between banking systems.
 *       HOW: Create a BianErrorMapper that maps domain exceptions to BIAN error response format.
 * 
 * TODO: [BIAN Compliance] Add BIAN Service Operation headers (x-bian-service-domain, x-bian-operation).
 *       WHY: BIAN APIs require standard headers for service mesh routing and audit.
 *       HOW: Create a BianHeaderInterceptor that adds headers to all outgoing responses.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CurrentAccountService {

    private final AccountRepository accountRepository;
    private final TransactionLogRepository transactionLogRepository;

    /**
     * BIAN Service Operation: Retrieve Current Account Facility.
     * Retrieves account details by account number.
     *
     * @param accountNumber the unique account identifier
     * @return account details as DTO
     * @throws AccountNotFoundException if account does not exist
     */
    @Transactional(readOnly = true)
    public AccountDTO getAccount(String accountNumber) {
        log.info("[BIAN:CurrentAccount:Retrieve] accountNumber={}", accountNumber);
        Account account = accountRepository.findByNumber(accountNumber)
            .orElseThrow(() -> new AccountNotFoundException(accountNumber));
        return AccountDTO.fromEntity(account);
    }

    /**
     * BIAN Service Operation: Initiate Payment Order.
     * Executes a fund transfer between two current accounts.
     *
     * @param request the transfer request containing source, target, amount, currency
     * @return transfer result with transaction ID and status
     * @throws InsufficientFundsException if source account has insufficient balance
     */
    @Transactional
    public TransferResult transfer(TransferRequest request) {
        log.info("[BIAN:CurrentAccount:Initiate:PaymentOrder] from={} to={} amount={} currency={}",
                request.fromAccount(), request.toAccount(), request.amount(), request.currency());

        Account from = accountRepository.findByNumber(request.fromAccount())
            .orElseThrow(() -> new AccountNotFoundException(request.fromAccount()));
        Account to = accountRepository.findByNumber(request.toAccount())
            .orElseThrow(() -> new AccountNotFoundException(request.toAccount()));

        if (from.getBalance().compareTo(request.amount()) < 0) {
            throw new InsufficientFundsException(request.fromAccount(), request.amount());
        }

        from.debit(request.amount());
        to.credit(request.amount());
        accountRepository.save(from);
        accountRepository.save(to);

        TransactionLog txLog = TransactionLog.builder()
            .fromAccount(request.fromAccount())
            .toAccount(request.toAccount())
            .amount(request.amount())
            .currency(request.currency())
            .status("COMPLETED")
            .build();
        transactionLogRepository.save(txLog);

        log.info("[BIAN:CurrentAccount:Initiate:PaymentOrder] completed txId={}", txLog.getId());
        return new TransferResult(txLog.getId(), "COMPLETED");
    }
}
```"""}
    ],
    "category": "bian_banking",
    "standard": "BIAN",
    "domain": "Current Account"
})

# 1b. BIAN Loan Service
entries.append({
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": """Migrate this EJB loan service to Spring Boot aligned with BIAN standard:

```java
@Stateless
public class LoanServiceBean implements LoanServiceRemote {
    @PersistenceContext
    private EntityManager em;
    
    public LoanDTO createLoan(String customerId, BigDecimal amount, 
                               int durationMonths, double interestRate) {
        Customer customer = em.find(Customer.class, customerId);
        Loan loan = new Loan(customer, amount, durationMonths, interestRate);
        loan.setStatus("PENDING_APPROVAL");
        loan.calculateSchedule();
        em.persist(loan);
        return LoanDTO.from(loan);
    }
    
    public List<EcheanceDTO> getRepaymentSchedule(Long loanId) {
        Loan loan = em.find(Loan.class, loanId);
        return loan.getEcheances().stream()
            .map(e -> new EcheanceDTO(e.getDate(), e.getAmount(), e.getCapital(), e.getInterest()))
            .collect(Collectors.toList());
    }
    
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void processRepayment(Long loanId, BigDecimal amount) {
        Loan loan = em.find(Loan.class, loanId);
        Echeance nextDue = loan.getNextDueEcheance();
        nextDue.markPaid(amount);
        loan.updateOutstandingBalance();
        em.merge(loan);
    }
}
```"""},
        {"role": "assistant", "content": """```java
package com.bank.loanfacility.service;

import com.bank.loanfacility.dto.LoanDTO;
import com.bank.loanfacility.dto.RepaymentScheduleDTO;
import com.bank.loanfacility.entity.Loan;
import com.bank.loanfacility.entity.RepaymentScheduleEntry;
import com.bank.loanfacility.repository.LoanRepository;
import com.bank.loanfacility.repository.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.math.BigDecimal;
import java.util.List;

/**
 * Loan Facility Service — BIAN Service Domain: Loan.
 *
 * Aligned with BIAN v12 Service Domain "Loan":
 * - Service Operations: Initiate (Create Loan), Retrieve (Schedule), Execute (Repayment)
 * - Business Object: LoanFacility
 * - Behavior Qualifiers: RepaymentSchedule, Disbursement, Collateral
 *
 * @see https://bian.org/servicelandscape-12-0/apis/Loan/
 *
 * TODO: [BIAN Compliance] Implement credit scoring integration before loan approval.
 *       WHY: BIAN Loan domain requires credit assessment as a pre-condition for Initiate.
 *       HOW: Create CreditAssessmentService calling the BIAN "Credit Administration" domain.
 *
 * TODO: [BIAN Compliance] Add collateral management for secured loans.
 *       WHY: BIAN defines Collateral as a Behavior Qualifier of the Loan domain.
 *       HOW: Create CollateralService with valuation and lien management.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class LoanFacilityService {

    private final LoanRepository loanRepository;
    private final CustomerRepository customerRepository;

    /**
     * BIAN Service Operation: Initiate Loan Facility.
     * Creates a new loan application with repayment schedule calculation.
     */
    @Transactional
    public LoanDTO createLoan(String customerId, BigDecimal amount,
                               int durationMonths, double interestRate) {
        log.info("[BIAN:Loan:Initiate] customerId={} amount={} duration={}m rate={}%",
                customerId, amount, durationMonths, interestRate);

        var customer = customerRepository.findById(customerId)
            .orElseThrow(() -> new IllegalArgumentException("Customer not found: " + customerId));

        Loan loan = Loan.builder()
            .customer(customer)
            .principalAmount(amount)
            .durationMonths(durationMonths)
            .interestRate(interestRate)
            .status("PENDING_APPROVAL")
            .build();
        loan.calculateRepaymentSchedule();
        loanRepository.save(loan);

        log.info("[BIAN:Loan:Initiate] created loanId={} status={}", loan.getId(), loan.getStatus());
        return LoanDTO.fromEntity(loan);
    }

    /**
     * BIAN Service Operation: Retrieve Repayment Schedule.
     */
    @Transactional(readOnly = true)
    public List<RepaymentScheduleDTO> getRepaymentSchedule(Long loanId) {
        log.info("[BIAN:Loan:Retrieve:RepaymentSchedule] loanId={}", loanId);
        Loan loan = loanRepository.findById(loanId)
            .orElseThrow(() -> new IllegalArgumentException("Loan not found: " + loanId));
        return loan.getScheduleEntries().stream()
            .map(RepaymentScheduleDTO::fromEntity)
            .toList();
    }

    /**
     * BIAN Service Operation: Execute Repayment.
     */
    @Transactional
    public void processRepayment(Long loanId, BigDecimal amount) {
        log.info("[BIAN:Loan:Execute:Repayment] loanId={} amount={}", loanId, amount);
        Loan loan = loanRepository.findById(loanId)
            .orElseThrow(() -> new IllegalArgumentException("Loan not found: " + loanId));
        RepaymentScheduleEntry nextDue = loan.getNextDueEntry();
        nextDue.markPaid(amount);
        loan.updateOutstandingBalance();
        loanRepository.save(loan);
        log.info("[BIAN:Loan:Execute:Repayment] completed, remainingBalance={}", loan.getOutstandingBalance());
    }
}
```"""}
    ],
    "category": "bian_banking",
    "standard": "BIAN",
    "domain": "Loan"
})

# ============================================================================
# 2. ACORD — Insurance
# ============================================================================

entries.append({
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": """Migrate this EJB insurance policy service to Spring Boot aligned with ACORD standard:

```java
@Stateless
public class PolicyServiceBean implements PolicyServiceRemote {
    @PersistenceContext
    private EntityManager em;
    
    public PolicyDTO createPolicy(String clientId, String productCode, 
                                   Date startDate, Date endDate, BigDecimal premium) {
        Client client = em.find(Client.class, clientId);
        Policy policy = new Policy(client, productCode, startDate, endDate);
        policy.setPremium(premium);
        policy.setStatus("DRAFT");
        policy.calculateCoverage();
        em.persist(policy);
        return PolicyDTO.from(policy);
    }
    
    public ClaimDTO fileClaim(Long policyId, String description, 
                               BigDecimal claimedAmount, Date incidentDate) {
        Policy policy = em.find(Policy.class, policyId);
        if (!policy.isActive()) throw new PolicyNotActiveException(policyId);
        Claim claim = new Claim(policy, description, claimedAmount, incidentDate);
        claim.setStatus("FILED");
        em.persist(claim);
        return ClaimDTO.from(claim);
    }
    
    public BigDecimal calculatePremium(String productCode, int age, 
                                        String riskProfile, BigDecimal insuredAmount) {
        PremiumGrid grid = em.createQuery(
            "SELECT g FROM PremiumGrid g WHERE g.productCode = :code AND g.ageRange = :age", 
            PremiumGrid.class)
            .setParameter("code", productCode)
            .setParameter("age", getAgeRange(age))
            .getSingleResult();
        return grid.getBasePremium()
            .multiply(getRiskFactor(riskProfile))
            .multiply(insuredAmount.divide(new BigDecimal("10000")));
    }
}
```"""},
        {"role": "assistant", "content": """```java
package com.insurance.policy.service;

import com.insurance.policy.dto.PolicyDTO;
import com.insurance.policy.dto.ClaimDTO;
import com.insurance.policy.dto.PremiumCalculationRequest;
import com.insurance.policy.entity.Policy;
import com.insurance.policy.entity.Claim;
import com.insurance.policy.repository.PolicyRepository;
import com.insurance.policy.repository.ClaimRepository;
import com.insurance.policy.repository.PremiumGridRepository;
import com.insurance.policy.exception.PolicyNotActiveException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Policy Administration Service — ACORD Standard Alignment.
 *
 * Aligned with ACORD (Association for Cooperative Operations Research and Development):
 * - ACORD Data Model: Policy, Claim, Coverage, Premium
 * - ACORD Messages: PolicyRq/Rs, ClaimRq/Rs, PremiumRq/Rs
 * - ACORD Life & Annuity / Property & Casualty standards
 *
 * @see https://www.acord.org/standards-architecture/acord-data-standards
 *
 * TODO: [ACORD Compliance] Implement ACORD XML message format for policy exchange.
 *       WHY: ACORD defines standard XML schemas (AL3, PC) for inter-insurer communication.
 *       HOW: Create AcordMessageMapper to serialize/deserialize ACORD XML messages.
 *
 * TODO: [ACORD Compliance] Add underwriting rules engine integration.
 *       WHY: ACORD separates underwriting logic from policy administration.
 *       HOW: Create UnderwritingService with rule-based premium adjustments.
 *
 * TODO: [ACORD Compliance] Implement coverage validation against product definition.
 *       WHY: ACORD requires coverage amounts to be validated against product limits.
 *       HOW: Create CoverageValidator checking min/max limits from product catalog.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PolicyAdministrationService {

    private final PolicyRepository policyRepository;
    private final ClaimRepository claimRepository;
    private final PremiumGridRepository premiumGridRepository;

    /**
     * ACORD Operation: Create Policy (PolicyAddRq).
     * Creates a new insurance policy with coverage calculation.
     */
    @Transactional
    public PolicyDTO createPolicy(String clientId, String productCode,
                                   LocalDate startDate, LocalDate endDate, BigDecimal premium) {
        log.info("[ACORD:Policy:Create] clientId={} product={} period={}/{}", 
                clientId, productCode, startDate, endDate);

        Policy policy = Policy.builder()
            .clientId(clientId)
            .productCode(productCode)
            .effectiveDate(startDate)
            .expirationDate(endDate)
            .annualPremium(premium)
            .status("DRAFT")
            .build();
        policy.calculateCoverage();
        policyRepository.save(policy);

        log.info("[ACORD:Policy:Create] policyId={} status={}", policy.getId(), policy.getStatus());
        return PolicyDTO.fromEntity(policy);
    }

    /**
     * ACORD Operation: File Claim (ClaimAddRq).
     * Registers a new claim against an active policy.
     */
    @Transactional
    public ClaimDTO fileClaim(Long policyId, String description,
                               BigDecimal claimedAmount, LocalDate incidentDate) {
        log.info("[ACORD:Claim:File] policyId={} amount={}", policyId, claimedAmount);

        Policy policy = policyRepository.findById(policyId)
            .orElseThrow(() -> new IllegalArgumentException("Policy not found: " + policyId));
        if (!policy.isActive()) {
            throw new PolicyNotActiveException(policyId);
        }

        Claim claim = Claim.builder()
            .policy(policy)
            .description(description)
            .claimedAmount(claimedAmount)
            .incidentDate(incidentDate)
            .status("FILED")
            .build();
        claimRepository.save(claim);

        log.info("[ACORD:Claim:File] claimId={} status={}", claim.getId(), claim.getStatus());
        return ClaimDTO.fromEntity(claim);
    }

    /**
     * ACORD Operation: Calculate Premium (PremiumCalcRq).
     * Computes premium based on product grid, age, risk profile, and insured amount.
     */
    @Transactional(readOnly = true)
    public BigDecimal calculatePremium(PremiumCalculationRequest request) {
        log.info("[ACORD:Premium:Calculate] product={} age={} risk={}",
                request.productCode(), request.age(), request.riskProfile());

        var grid = premiumGridRepository.findByProductCodeAndAgeRange(
            request.productCode(), getAgeRange(request.age()));
        return grid.getBasePremium()
            .multiply(getRiskFactor(request.riskProfile()))
            .multiply(request.insuredAmount().divide(new BigDecimal("10000")));
    }

    private String getAgeRange(int age) {
        if (age < 30) return "18-29";
        if (age < 45) return "30-44";
        if (age < 60) return "45-59";
        return "60+";
    }

    private BigDecimal getRiskFactor(String riskProfile) {
        return switch (riskProfile.toUpperCase()) {
            case "LOW" -> new BigDecimal("0.8");
            case "MEDIUM" -> BigDecimal.ONE;
            case "HIGH" -> new BigDecimal("1.5");
            default -> BigDecimal.ONE;
        };
    }
}
```"""}
    ],
    "category": "acord_insurance",
    "standard": "ACORD",
    "domain": "Policy Administration"
})

# 2b. ACORD Claim Processing
entries.append({
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": """Migrate this EJB claim processing service to Spring Boot aligned with ACORD standard:

```java
@Stateless
public class SinistreServiceBean implements SinistreServiceRemote {
    @PersistenceContext
    private EntityManager em;
    
    @EJB
    private ExpertServiceRemote expertService;
    
    public SinistreDTO declarerSinistre(Long contratId, String description, 
                                         Date dateSinistre, BigDecimal montantEstime) {
        Contrat contrat = em.find(Contrat.class, contratId);
        Sinistre sinistre = new Sinistre(contrat, description, dateSinistre, montantEstime);
        sinistre.setStatut("DECLARE");
        em.persist(sinistre);
        return SinistreDTO.from(sinistre);
    }
    
    public void assignerExpert(Long sinistreId, Long expertId) {
        Sinistre sinistre = em.find(Sinistre.class, sinistreId);
        Expert expert = em.find(Expert.class, expertId);
        sinistre.setExpert(expert);
        sinistre.setStatut("EN_EXPERTISE");
        em.merge(sinistre);
    }
    
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void reglerSinistre(Long sinistreId, BigDecimal montantRegle) {
        Sinistre sinistre = em.find(Sinistre.class, sinistreId);
        sinistre.setMontantRegle(montantRegle);
        sinistre.setStatut("REGLE");
        sinistre.setDateReglement(new Date());
        Contrat contrat = sinistre.getContrat();
        contrat.incrementerSinistralite(montantRegle);
        em.merge(sinistre);
        em.merge(contrat);
    }
}
```"""},
        {"role": "assistant", "content": """```java
package com.insurance.claims.service;

import com.insurance.claims.dto.ClaimDTO;
import com.insurance.claims.entity.Claim;
import com.insurance.claims.entity.Policy;
import com.insurance.claims.repository.ClaimRepository;
import com.insurance.claims.repository.PolicyRepository;
import com.insurance.claims.repository.ExpertRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Claims Processing Service — ACORD Standard Alignment.
 *
 * Aligned with ACORD Claims Processing:
 * - ACORD Messages: ClaimAddRq, ClaimStatusRq, ClaimPaymentRq
 * - Workflow: Declaration → Expert Assignment → Assessment → Settlement
 * - ACORD Data Model: ClaimActivity, ClaimPayment, LossInfo
 *
 * @see https://www.acord.org/standards-architecture/acord-data-standards
 *
 * TODO: [ACORD Compliance] Implement ACORD claim status tracking with standard codes.
 *       WHY: ACORD defines standard claim status codes (FNOL, Open, Closed, Reopened).
 *       HOW: Create ClaimStatusMapper aligning internal statuses to ACORD codes.
 *
 * TODO: [ACORD Compliance] Add fraud detection scoring before settlement.
 *       WHY: Industry best practice requires fraud screening per ACORD guidelines.
 *       HOW: Create FraudScoringService with rule-based indicators.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClaimsProcessingService {

    private final ClaimRepository claimRepository;
    private final PolicyRepository policyRepository;
    private final ExpertRepository expertRepository;

    /**
     * ACORD Operation: First Notice of Loss (FNOL).
     */
    @Transactional
    public ClaimDTO declareClaim(Long policyId, String description,
                                  LocalDate incidentDate, BigDecimal estimatedAmount) {
        log.info("[ACORD:Claim:FNOL] policyId={} estimated={}", policyId, estimatedAmount);
        Policy policy = policyRepository.findById(policyId)
            .orElseThrow(() -> new IllegalArgumentException("Policy not found: " + policyId));

        Claim claim = Claim.builder()
            .policy(policy)
            .description(description)
            .incidentDate(incidentDate)
            .estimatedAmount(estimatedAmount)
            .status("DECLARED")
            .build();
        claimRepository.save(claim);
        return ClaimDTO.fromEntity(claim);
    }

    /**
     * ACORD Operation: Assign Expert for Assessment.
     */
    @Transactional
    public void assignExpert(Long claimId, Long expertId) {
        log.info("[ACORD:Claim:AssignExpert] claimId={} expertId={}", claimId, expertId);
        var claim = claimRepository.findById(claimId)
            .orElseThrow(() -> new IllegalArgumentException("Claim not found"));
        var expert = expertRepository.findById(expertId)
            .orElseThrow(() -> new IllegalArgumentException("Expert not found"));
        claim.setExpert(expert);
        claim.setStatus("UNDER_ASSESSMENT");
        claimRepository.save(claim);
    }

    /**
     * ACORD Operation: Settle Claim (ClaimPaymentRq).
     */
    @Transactional
    public void settleClaim(Long claimId, BigDecimal settlementAmount) {
        log.info("[ACORD:Claim:Settle] claimId={} amount={}", claimId, settlementAmount);
        var claim = claimRepository.findById(claimId)
            .orElseThrow(() -> new IllegalArgumentException("Claim not found"));
        claim.setSettlementAmount(settlementAmount);
        claim.setStatus("SETTLED");
        claim.setSettlementDate(LocalDate.now());

        Policy policy = claim.getPolicy();
        policy.incrementClaimRatio(settlementAmount);
        policyRepository.save(policy);
        claimRepository.save(claim);
    }
}
```"""}
    ],
    "category": "acord_insurance",
    "standard": "ACORD",
    "domain": "Claims Processing"
})

# ============================================================================
# 3. HL7/FHIR — Healthcare
# ============================================================================

entries.append({
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": """Migrate this EJB patient service to Spring Boot aligned with HL7/FHIR standard:

```java
@Stateless
public class PatientServiceBean implements PatientServiceRemote {
    @PersistenceContext
    private EntityManager em;
    
    public PatientDTO getPatient(String patientId) {
        Patient patient = em.find(Patient.class, patientId);
        return PatientDTO.from(patient);
    }
    
    public ConsultationDTO createConsultation(String patientId, String medecinId,
                                               String motif, Date dateConsultation) {
        Patient patient = em.find(Patient.class, patientId);
        Medecin medecin = em.find(Medecin.class, medecinId);
        Consultation consultation = new Consultation(patient, medecin, motif, dateConsultation);
        consultation.setStatut("PLANIFIEE");
        em.persist(consultation);
        return ConsultationDTO.from(consultation);
    }
    
    public OrdonnanceDTO prescrire(Long consultationId, List<MedicamentDTO> medicaments) {
        Consultation consultation = em.find(Consultation.class, consultationId);
        Ordonnance ordonnance = new Ordonnance(consultation);
        for (MedicamentDTO med : medicaments) {
            LigneOrdonnance ligne = new LigneOrdonnance(med.getCode(), med.getDosage(), med.getDuree());
            ordonnance.addLigne(ligne);
        }
        em.persist(ordonnance);
        return OrdonnanceDTO.from(ordonnance);
    }
}
```"""},
        {"role": "assistant", "content": """```java
package com.healthcare.patient.service;

import com.healthcare.patient.dto.PatientDTO;
import com.healthcare.patient.dto.EncounterDTO;
import com.healthcare.patient.dto.MedicationRequestDTO;
import com.healthcare.patient.entity.Patient;
import com.healthcare.patient.entity.Encounter;
import com.healthcare.patient.entity.MedicationRequest;
import com.healthcare.patient.entity.MedicationRequestItem;
import com.healthcare.patient.repository.PatientRepository;
import com.healthcare.patient.repository.EncounterRepository;
import com.healthcare.patient.repository.PractitionerRepository;
import com.healthcare.patient.repository.MedicationRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Patient Service — HL7 FHIR R4 Standard Alignment.
 *
 * Aligned with HL7 FHIR R4 Resources:
 * - Patient (https://www.hl7.org/fhir/patient.html)
 * - Encounter (https://www.hl7.org/fhir/encounter.html)
 * - MedicationRequest (https://www.hl7.org/fhir/medicationrequest.html)
 *
 * FHIR Resource Mapping:
 * - Patient → Patient entity (demographics, identifiers, contact)
 * - Consultation → Encounter resource (class, status, period, participant)
 * - Ordonnance → MedicationRequest resource (medication, dosage, dispenseRequest)
 *
 * @see https://www.hl7.org/fhir/
 *
 * TODO: [HL7 Compliance] Implement FHIR REST API endpoints (/Patient, /Encounter, /MedicationRequest).
 *       WHY: HL7 FHIR defines standard RESTful API patterns for healthcare interoperability.
 *       HOW: Create FhirPatientController with FHIR-compliant search parameters (_id, identifier, name).
 *
 * TODO: [HL7 Compliance] Add FHIR resource validation using HAPI FHIR library.
 *       WHY: FHIR resources must conform to profiles and value sets for interoperability.
 *       HOW: Add org.hl7.fhir.r4 dependency and create FhirValidator service.
 *
 * TODO: [HL7 Compliance] Implement FHIR Bundle for batch operations.
 *       WHY: FHIR uses Bundle resources for transactions and batch processing.
 *       HOW: Create FhirBundleProcessor handling transaction/batch Bundle types.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PatientService {

    private final PatientRepository patientRepository;
    private final EncounterRepository encounterRepository;
    private final PractitionerRepository practitionerRepository;
    private final MedicationRequestRepository medicationRequestRepository;

    /**
     * FHIR Operation: Read Patient resource.
     * Maps to GET /Patient/{id}
     */
    @Transactional(readOnly = true)
    public PatientDTO getPatient(String patientId) {
        log.info("[FHIR:Patient:Read] id={}", patientId);
        Patient patient = patientRepository.findById(patientId)
            .orElseThrow(() -> new IllegalArgumentException("Patient not found: " + patientId));
        return PatientDTO.fromEntity(patient);
    }

    /**
     * FHIR Operation: Create Encounter resource.
     * Maps to POST /Encounter
     */
    @Transactional
    public EncounterDTO createEncounter(String patientId, String practitionerId,
                                         String reasonCode, LocalDateTime scheduledDate) {
        log.info("[FHIR:Encounter:Create] patient={} practitioner={} reason={}",
                patientId, practitionerId, reasonCode);

        var patient = patientRepository.findById(patientId)
            .orElseThrow(() -> new IllegalArgumentException("Patient not found"));
        var practitioner = practitionerRepository.findById(practitionerId)
            .orElseThrow(() -> new IllegalArgumentException("Practitioner not found"));

        Encounter encounter = Encounter.builder()
            .patient(patient)
            .practitioner(practitioner)
            .reasonCode(reasonCode)
            .scheduledDate(scheduledDate)
            .status("PLANNED")
            .encounterClass("AMB") // FHIR Encounter class: ambulatory
            .build();
        encounterRepository.save(encounter);
        return EncounterDTO.fromEntity(encounter);
    }

    /**
     * FHIR Operation: Create MedicationRequest resource.
     * Maps to POST /MedicationRequest
     */
    @Transactional
    public MedicationRequestDTO prescribe(Long encounterId, List<MedicationRequestItem> medications) {
        log.info("[FHIR:MedicationRequest:Create] encounterId={} items={}", encounterId, medications.size());

        var encounter = encounterRepository.findById(encounterId)
            .orElseThrow(() -> new IllegalArgumentException("Encounter not found"));

        MedicationRequest request = MedicationRequest.builder()
            .encounter(encounter)
            .patient(encounter.getPatient())
            .requester(encounter.getPractitioner())
            .status("ACTIVE")
            .intent("ORDER")
            .build();
        medications.forEach(request::addItem);
        medicationRequestRepository.save(request);
        return MedicationRequestDTO.fromEntity(request);
    }
}
```"""}
    ],
    "category": "hl7_healthcare",
    "standard": "HL7_FHIR",
    "domain": "Patient Management"
})

# ============================================================================
# 4. TMForum — Telecom
# ============================================================================

entries.append({
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": """Migrate this EJB telecom subscriber service to Spring Boot aligned with TMForum standard:

```java
@Stateless
public class AbonneServiceBean implements AbonneServiceRemote {
    @PersistenceContext
    private EntityManager em;
    
    public AbonneDTO creerAbonne(String nom, String prenom, String telephone,
                                  String forfaitCode) {
        Forfait forfait = em.find(Forfait.class, forfaitCode);
        Abonne abonne = new Abonne(nom, prenom, telephone, forfait);
        abonne.setStatut("ACTIF");
        abonne.setDateActivation(new Date());
        em.persist(abonne);
        return AbonneDTO.from(abonne);
    }
    
    public FactureDTO genererFacture(Long abonneId, int mois, int annee) {
        Abonne abonne = em.find(Abonne.class, abonneId);
        List<ConsommationDTO> consos = getConsommations(abonneId, mois, annee);
        BigDecimal total = abonne.getForfait().getPrixMensuel();
        for (ConsommationDTO conso : consos) {
            if (conso.isHorsForfait()) {
                total = total.add(conso.getMontant());
            }
        }
        Facture facture = new Facture(abonne, mois, annee, total);
        em.persist(facture);
        return FactureDTO.from(facture);
    }
    
    public void changerForfait(Long abonneId, String nouveauForfaitCode) {
        Abonne abonne = em.find(Abonne.class, abonneId);
        Forfait nouveauForfait = em.find(Forfait.class, nouveauForfaitCode);
        abonne.setForfait(nouveauForfait);
        abonne.setDateChangementForfait(new Date());
        em.merge(abonne);
    }
}
```"""},
        {"role": "assistant", "content": """```java
package com.telecom.subscriber.service;

import com.telecom.subscriber.dto.SubscriberDTO;
import com.telecom.subscriber.dto.BillingAccountDTO;
import com.telecom.subscriber.entity.Subscriber;
import com.telecom.subscriber.entity.ServicePlan;
import com.telecom.subscriber.entity.BillingAccount;
import com.telecom.subscriber.repository.SubscriberRepository;
import com.telecom.subscriber.repository.ServicePlanRepository;
import com.telecom.subscriber.repository.BillingAccountRepository;
import com.telecom.subscriber.repository.UsageRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Subscriber Management Service — TMForum / eTOM Standard Alignment.
 *
 * Aligned with TMForum Open APIs and eTOM Process Framework:
 * - TMF629: Customer Management API
 * - TMF676: Payment Management API
 * - TMF678: Customer Bill Management API
 * - eTOM Level 2: Customer Relationship Management (CRM)
 *
 * TMForum Resource Mapping:
 * - Abonne → Customer / Individual (TMF629)
 * - Forfait → ProductOffering / ServicePlan (TMF620)
 * - Facture → CustomerBill (TMF678)
 * - Consommation → UsageRecord (TMF635)
 *
 * @see https://www.tmforum.org/open-apis/
 *
 * TODO: [TMForum Compliance] Implement TMF629 Customer Management API endpoints.
 *       WHY: TMForum defines standard REST APIs for customer lifecycle management.
 *       HOW: Create CustomerApiController with TMF629-compliant CRUD operations.
 *
 * TODO: [TMForum Compliance] Add SID (Shared Information/Data) model alignment.
 *       WHY: TMForum SID provides canonical data model for telecom entities.
 *       HOW: Map entity fields to SID attributes (e.g., Individual.givenName, Individual.familyName).
 *
 * TODO: [TMForum Compliance] Implement event-driven notifications per TMF688.
 *       WHY: TMForum uses event-based architecture for state change notifications.
 *       HOW: Create TmfEventPublisher publishing CustomerStateChangeEvent on status changes.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SubscriberManagementService {

    private final SubscriberRepository subscriberRepository;
    private final ServicePlanRepository servicePlanRepository;
    private final BillingAccountRepository billingAccountRepository;
    private final UsageRecordRepository usageRecordRepository;

    /**
     * TMF629 Operation: Create Customer (Individual).
     * Provisions a new subscriber with an active service plan.
     */
    @Transactional
    public SubscriberDTO createSubscriber(String lastName, String firstName,
                                           String phoneNumber, String planCode) {
        log.info("[TMF629:Customer:Create] name={} {} phone={} plan={}",
                firstName, lastName, phoneNumber, planCode);

        ServicePlan plan = servicePlanRepository.findByCode(planCode)
            .orElseThrow(() -> new IllegalArgumentException("Service plan not found: " + planCode));

        Subscriber subscriber = Subscriber.builder()
            .lastName(lastName)
            .firstName(firstName)
            .phoneNumber(phoneNumber)
            .servicePlan(plan)
            .status("ACTIVE")
            .activationDate(LocalDate.now())
            .build();
        subscriberRepository.save(subscriber);

        log.info("[TMF629:Customer:Create] subscriberId={}", subscriber.getId());
        return SubscriberDTO.fromEntity(subscriber);
    }

    /**
     * TMF678 Operation: Generate Customer Bill.
     * Calculates monthly bill including base plan + overage charges.
     */
    @Transactional
    public BillingAccountDTO generateBill(Long subscriberId, int month, int year) {
        log.info("[TMF678:CustomerBill:Create] subscriberId={} period={}/{}",
                subscriberId, month, year);

        var subscriber = subscriberRepository.findById(subscriberId)
            .orElseThrow(() -> new IllegalArgumentException("Subscriber not found"));

        var usageRecords = usageRecordRepository.findBySubscriberAndPeriod(subscriberId, month, year);
        BigDecimal total = subscriber.getServicePlan().getMonthlyPrice();
        for (var usage : usageRecords) {
            if (usage.isOverage()) {
                total = total.add(usage.getChargeAmount());
            }
        }

        BillingAccount bill = BillingAccount.builder()
            .subscriber(subscriber)
            .billingMonth(month)
            .billingYear(year)
            .totalAmount(total)
            .status("GENERATED")
            .build();
        billingAccountRepository.save(bill);
        return BillingAccountDTO.fromEntity(bill);
    }

    /**
     * TMF620 Operation: Change Service Plan (Product Offering).
     */
    @Transactional
    public void changeServicePlan(Long subscriberId, String newPlanCode) {
        log.info("[TMF620:ProductOffering:Change] subscriberId={} newPlan={}",
                subscriberId, newPlanCode);

        var subscriber = subscriberRepository.findById(subscriberId)
            .orElseThrow(() -> new IllegalArgumentException("Subscriber not found"));
        var newPlan = servicePlanRepository.findByCode(newPlanCode)
            .orElseThrow(() -> new IllegalArgumentException("Plan not found: " + newPlanCode));

        subscriber.setServicePlan(newPlan);
        subscriber.setPlanChangeDate(LocalDate.now());
        subscriberRepository.save(subscriber);
    }
}
```"""}
    ],
    "category": "tmforum_telecom",
    "standard": "TMFORUM",
    "domain": "Subscriber Management"
})

# ============================================================================
# 5. DDD — E-Commerce
# ============================================================================

entries.append({
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": """Migrate this EJB order service to Spring Boot aligned with DDD patterns:

```java
@Stateless
public class CommandeServiceBean implements CommandeServiceRemote {
    @PersistenceContext
    private EntityManager em;
    
    @EJB
    private StockServiceRemote stockService;
    
    public CommandeDTO creerCommande(String clientId, List<LigneCommandeDTO> lignes) {
        Client client = em.find(Client.class, clientId);
        Commande commande = new Commande(client);
        for (LigneCommandeDTO ligne : lignes) {
            Produit produit = em.find(Produit.class, ligne.getProduitId());
            if (!stockService.verifierDisponibilite(produit.getId(), ligne.getQuantite())) {
                throw new StockInsuffisantException(produit.getId());
            }
            commande.addLigne(produit, ligne.getQuantite(), produit.getPrix());
        }
        commande.calculerTotal();
        commande.setStatut("CREEE");
        em.persist(commande);
        stockService.reserverStock(commande);
        return CommandeDTO.from(commande);
    }
    
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void validerCommande(Long commandeId) {
        Commande commande = em.find(Commande.class, commandeId);
        commande.setStatut("VALIDEE");
        commande.setDateValidation(new Date());
        em.merge(commande);
    }
    
    public void annulerCommande(Long commandeId) {
        Commande commande = em.find(Commande.class, commandeId);
        commande.setStatut("ANNULEE");
        stockService.libererStock(commande);
        em.merge(commande);
    }
}
```"""},
        {"role": "assistant", "content": """```java
package com.ecommerce.order.service;

import com.ecommerce.order.dto.OrderDTO;
import com.ecommerce.order.dto.OrderLineRequest;
import com.ecommerce.order.entity.Order;
import com.ecommerce.order.entity.OrderLine;
import com.ecommerce.order.entity.OrderStatus;
import com.ecommerce.order.repository.OrderRepository;
import com.ecommerce.order.repository.ProductRepository;
import com.ecommerce.order.repository.CustomerRepository;
import com.ecommerce.order.event.OrderCreatedEvent;
import com.ecommerce.order.event.OrderCancelledEvent;
import com.ecommerce.inventory.service.InventoryService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.util.List;

/**
 * Order Service — DDD (Domain-Driven Design) Pattern Alignment.
 *
 * DDD Tactical Patterns Applied:
 * - Aggregate Root: Order (controls OrderLines lifecycle)
 * - Value Object: Money (amount + currency), Address
 * - Repository: OrderRepository (persistence abstraction)
 * - Domain Event: OrderCreatedEvent, OrderCancelledEvent
 * - Domain Service: InventoryService (cross-aggregate coordination)
 *
 * Bounded Context: Order Management
 * - Upstream: Inventory (stock reservation via domain events)
 * - Downstream: Payment (payment processing), Shipping (fulfillment)
 *
 * @see Eric Evans, "Domain-Driven Design: Tackling Complexity in the Heart of Software"
 *
 * TODO: [DDD Pattern] Extract Money as a proper Value Object with currency support.
 *       WHY: DDD recommends Value Objects for concepts defined by their attributes, not identity.
 *       HOW: Create Money record(BigDecimal amount, Currency currency) with arithmetic methods.
 *
 * TODO: [DDD Pattern] Implement domain events with Spring ApplicationEventPublisher.
 *       WHY: DDD uses domain events for loose coupling between bounded contexts.
 *       HOW: Publish OrderCreatedEvent after persist, consume in InventoryService for stock reservation.
 *
 * TODO: [DDD Pattern] Add anti-corruption layer for legacy inventory integration.
 *       WHY: DDD recommends ACL when integrating with external/legacy systems.
 *       HOW: Create InventoryAdapter translating between Order context and Inventory context models.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final CustomerRepository customerRepository;
    private final InventoryService inventoryService;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * DDD: Create Order Aggregate.
     * The Order is the Aggregate Root controlling all OrderLines.
     * Stock verification is delegated to the Inventory bounded context.
     */
    @Transactional
    public OrderDTO createOrder(String customerId, List<OrderLineRequest> lineRequests) {
        log.info("[DDD:Order:Create] customerId={} lines={}", customerId, lineRequests.size());

        var customer = customerRepository.findById(customerId)
            .orElseThrow(() -> new IllegalArgumentException("Customer not found"));

        Order order = Order.create(customer);

        for (var lineReq : lineRequests) {
            var product = productRepository.findById(lineReq.productId())
                .orElseThrow(() -> new IllegalArgumentException("Product not found: " + lineReq.productId()));

            if (!inventoryService.checkAvailability(product.getId(), lineReq.quantity())) {
                throw new InsufficientStockException(product.getId());
            }
            order.addLine(product, lineReq.quantity());
        }

        order.calculateTotal();
        orderRepository.save(order);

        // Publish domain event for cross-context coordination
        eventPublisher.publishEvent(new OrderCreatedEvent(order.getId(), order.getLines()));
        log.info("[DDD:Order:Create] orderId={} total={}", order.getId(), order.getTotal());
        return OrderDTO.fromEntity(order);
    }

    /**
     * DDD: Confirm Order (state transition on Aggregate Root).
     */
    @Transactional
    public void confirmOrder(Long orderId) {
        log.info("[DDD:Order:Confirm] orderId={}", orderId);
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order not found"));
        order.confirm(); // Aggregate enforces invariants
        orderRepository.save(order);
    }

    /**
     * DDD: Cancel Order with compensating action (stock release).
     */
    @Transactional
    public void cancelOrder(Long orderId) {
        log.info("[DDD:Order:Cancel] orderId={}", orderId);
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order not found"));
        order.cancel();
        orderRepository.save(order);

        // Publish domain event for stock release in Inventory context
        eventPublisher.publishEvent(new OrderCancelledEvent(order.getId(), order.getLines()));
    }
}
```"""}
    ],
    "category": "ddd_ecommerce",
    "standard": "DDD",
    "domain": "Order Management"
})

# ============================================================================
# 6. TOGAF — Enterprise / ERP
# ============================================================================

entries.append({
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": """Migrate this EJB workflow service to Spring Boot aligned with TOGAF/Enterprise patterns:

```java
@Stateless
public class WorkflowServiceBean implements WorkflowServiceRemote {
    @PersistenceContext
    private EntityManager em;
    
    @EJB
    private NotificationServiceRemote notificationService;
    
    public DemandeDTO creerDemande(String type, String demandeurId, 
                                    Map<String, String> donnees) {
        Demande demande = new Demande(type, demandeurId, donnees);
        demande.setStatut("EN_ATTENTE");
        demande.setDateCreation(new Date());
        
        List<Approbateur> approbateurs = getApprobateurs(type);
        for (Approbateur app : approbateurs) {
            EtapeValidation etape = new EtapeValidation(demande, app, app.getOrdre());
            em.persist(etape);
        }
        em.persist(demande);
        notificationService.notifier(approbateurs.get(0).getUserId(), 
            "Nouvelle demande " + type + " en attente de validation");
        return DemandeDTO.from(demande);
    }
    
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void valider(Long demandeId, String valideurId, boolean approuve, String commentaire) {
        Demande demande = em.find(Demande.class, demandeId);
        EtapeValidation etape = getEtapeCourante(demande);
        etape.setDecision(approuve ? "APPROUVE" : "REJETE");
        etape.setCommentaire(commentaire);
        etape.setDateDecision(new Date());
        em.merge(etape);
        
        if (!approuve) {
            demande.setStatut("REJETEE");
        } else if (isLastStep(demande, etape)) {
            demande.setStatut("APPROUVEE");
        } else {
            EtapeValidation nextStep = getNextStep(demande, etape);
            notificationService.notifier(nextStep.getApprobateur().getUserId(),
                "Demande " + demande.getType() + " en attente de votre validation");
        }
        em.merge(demande);
    }
}
```"""},
        {"role": "assistant", "content": """```java
package com.enterprise.workflow.service;

import com.enterprise.workflow.dto.WorkflowRequestDTO;
import com.enterprise.workflow.entity.WorkflowRequest;
import com.enterprise.workflow.entity.ApprovalStep;
import com.enterprise.workflow.entity.ApprovalDecision;
import com.enterprise.workflow.repository.WorkflowRequestRepository;
import com.enterprise.workflow.repository.ApprovalStepRepository;
import com.enterprise.workflow.repository.ApproverRepository;
import com.enterprise.notification.service.NotificationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * Workflow Service — TOGAF / Enterprise Architecture Alignment.
 *
 * Aligned with TOGAF (The Open Group Architecture Framework):
 * - Architecture Building Block (ABB): Workflow Management
 * - Solution Building Block (SBB): Approval Chain Engine
 * - TOGAF ADM Phase D: Technology Architecture (BPM integration point)
 *
 * ArchiMate Mapping:
 * - Business Process: Approval Workflow
 * - Application Service: WorkflowService
 * - Application Component: ApprovalEngine
 * - Business Object: WorkflowRequest, ApprovalStep
 *
 * @see https://www.opengroup.org/togaf
 *
 * TODO: [TOGAF Compliance] Implement BPMN 2.0 process definition support.
 *       WHY: TOGAF recommends standardized process modeling for enterprise workflows.
 *       HOW: Integrate Camunda or Flowable BPMN engine for complex approval chains.
 *
 * TODO: [TOGAF Compliance] Add enterprise audit trail with ArchiMate traceability.
 *       WHY: TOGAF requires full traceability from business process to technology component.
 *       HOW: Create AuditService logging each step with ArchiMate element references.
 *
 * TODO: [TOGAF Compliance] Implement SLA monitoring for approval steps.
 *       WHY: Enterprise workflows require SLA tracking per TOGAF governance framework.
 *       HOW: Create SlaMonitorService with configurable thresholds and escalation rules.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkflowService {

    private final WorkflowRequestRepository requestRepository;
    private final ApprovalStepRepository approvalStepRepository;
    private final ApproverRepository approverRepository;
    private final NotificationService notificationService;

    /**
     * TOGAF ABB: Initiate Workflow Request.
     * Creates a new approval workflow with multi-level approval chain.
     */
    @Transactional
    public WorkflowRequestDTO createRequest(String type, String requesterId,
                                              Map<String, String> data) {
        log.info("[TOGAF:Workflow:Initiate] type={} requester={}", type, requesterId);

        WorkflowRequest request = WorkflowRequest.builder()
            .type(type)
            .requesterId(requesterId)
            .data(data)
            .status("PENDING")
            .createdAt(LocalDateTime.now())
            .build();

        var approvers = approverRepository.findByWorkflowTypeOrderBySequence(type);
        for (var approver : approvers) {
            ApprovalStep step = ApprovalStep.builder()
                .request(request)
                .approverId(approver.getUserId())
                .sequence(approver.getSequence())
                .status("PENDING")
                .build();
            request.addStep(step);
        }

        requestRepository.save(request);

        // Notify first approver in chain
        if (!approvers.isEmpty()) {
            notificationService.notify(approvers.get(0).getUserId(),
                String.format("New %s request pending your approval", type));
        }

        log.info("[TOGAF:Workflow:Initiate] requestId={} steps={}", request.getId(), approvers.size());
        return WorkflowRequestDTO.fromEntity(request);
    }

    /**
     * TOGAF ABB: Process Approval Decision.
     * Handles approval/rejection with automatic chain progression.
     */
    @Transactional
    public void processDecision(Long requestId, String approverId,
                                 boolean approved, String comment) {
        log.info("[TOGAF:Workflow:Decision] requestId={} approver={} approved={}",
                requestId, approverId, approved);

        WorkflowRequest request = requestRepository.findById(requestId)
            .orElseThrow(() -> new IllegalArgumentException("Request not found"));

        ApprovalStep currentStep = request.getCurrentPendingStep();
        currentStep.setDecision(approved ? ApprovalDecision.APPROVED : ApprovalDecision.REJECTED);
        currentStep.setComment(comment);
        currentStep.setDecisionDate(LocalDateTime.now());

        if (!approved) {
            request.setStatus("REJECTED");
            log.info("[TOGAF:Workflow:Decision] request REJECTED at step {}", currentStep.getSequence());
        } else if (request.isLastStep(currentStep)) {
            request.setStatus("APPROVED");
            log.info("[TOGAF:Workflow:Decision] request FULLY APPROVED");
        } else {
            ApprovalStep nextStep = request.getNextStep(currentStep);
            notificationService.notify(nextStep.getApproverId(),
                String.format("%s request pending your approval (step %d)",
                    request.getType(), nextStep.getSequence()));
            log.info("[TOGAF:Workflow:Decision] escalated to step {}", nextStep.getSequence());
        }

        requestRepository.save(request);
    }
}
```"""}
    ],
    "category": "togaf_enterprise",
    "standard": "TOGAF",
    "domain": "Workflow Management"
})

# ============================================================================
# Write output
# ============================================================================

output_dir = os.path.dirname(os.path.abspath(__file__))
output_file = os.path.join(output_dir, "finetuning-standards-dataset.jsonl")

with open(output_file, "w", encoding="utf-8") as f:
    for entry in entries:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

print(f"Generated {len(entries)} training entries for industry standards:")
standards_count = {}
for entry in entries:
    std = entry["standard"]
    standards_count[std] = standards_count.get(std, 0) + 1

for std, count in sorted(standards_count.items()):
    print(f"  - {std}: {count} entries")

print(f"\nOutput: {output_file}")
print(f"Total entries: {len(entries)}")
