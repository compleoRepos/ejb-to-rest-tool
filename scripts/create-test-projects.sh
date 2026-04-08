#!/bin/bash
# Create test projects 02-05 for Phase 6 regression testing
set -e

BASE="/home/ubuntu/test-projects"

# ═══════════════════════════════════════════════════════════════════════════════
# PROJET 02 — Virement bancaire
# ═══════════════════════════════════════════════════════════════════════════════
P02="$BASE/projet-02-virement"
P02_UC="$P02/src/main/java/ma/eai/boa/xbanking/virement/usecases"
P02_DTO="$P02/src/main/java/ma/eai/boa/xbanking/virement/dto"
P02_ENUM="$P02/src/main/java/ma/eai/boa/xbanking/virement/enums"
P02_EXC="$P02/src/main/java/ma/eai/boa/xbanking/virement/exception"
P02_VO="$P02/src/main/java/ma/eai/boa/xbanking/vo"
P02_ANN="$P02/src/main/java/ma/eai/boa/xbanking/annotations"
P02_MIDW="$P02/src/main/java/ma/eai/midw"

mkdir -p "$P02_UC" "$P02_DTO" "$P02_ENUM" "$P02_EXC" "$P02_VO" "$P02_ANN" "$P02_MIDW/exceptions" "$P02_MIDW/usecases" "$P02_MIDW/log" "$P02_MIDW/services"

# pom.xml
cat > "$P02/pom.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>ma.eai.boa</groupId><artifactId>projet-02-virement</artifactId><version>2.1.0</version>
<description>Projet EJB BOA — Virement bancaire multi-domaines</description>
<parent><groupId>ma.eai.idev</groupId><artifactId>general-settings-spring-boot</artifactId><version>2024.3</version></parent>
</project>
EOF

# Base classes
cat > "$P02_VO/ValueObject.java" << 'EOF'
package ma.eai.boa.xbanking.vo;
import java.io.Serializable;
public interface ValueObject extends Serializable {}
EOF

cat > "$P02_ANN/UseCase.java" << 'EOF'
package ma.eai.boa.xbanking.annotations;
import java.lang.annotation.*;
@Target(ElementType.TYPE) @Retention(RetentionPolicy.RUNTIME)
public @interface UseCase { String description() default ""; }
EOF

cat > "$P02_MIDW/usecases/BaseUseCase.java" << 'EOF'
package ma.eai.midw.usecases;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
public interface BaseUseCase { ValueObject execute(ValueObject voIn) throws FwkRollbackException; }
EOF

cat > "$P02_MIDW/exceptions/FwkRollbackException.java" << 'EOF'
package ma.eai.midw.exceptions;
public class FwkRollbackException extends Exception {
    public FwkRollbackException(String msg) { super(msg); }
}
EOF

cat > "$P02_MIDW/log/EaiLog.java" << 'EOF'
package ma.eai.midw.log;
public class EaiLog {
    public static void info(String msg) {}
    public static void error(String msg, Throwable t) {}
}
EOF

cat > "$P02_MIDW/services/MagixService.java" << 'EOF'
package ma.eai.midw.services;
import java.util.Map;
public interface MagixService {
    Map<String, String> executeTransaction(String codeTransaction, Map<String, String> params);
}
EOF

# Enum
cat > "$P02_ENUM/StatutVirement.java" << 'EOF'
package ma.eai.boa.xbanking.virement.enums;
public enum StatutVirement { EN_ATTENTE, VALIDE, EXECUTE, ANNULE, REJETE }
EOF

# Exceptions
cat > "$P02_EXC/VirementInexistantException.java" << 'EOF'
package ma.eai.boa.xbanking.virement.exception;
import ma.eai.midw.exceptions.FwkRollbackException;
public class VirementInexistantException extends FwkRollbackException {
    public VirementInexistantException(String ref) { super("Virement inexistant: " + ref); }
}
EOF

cat > "$P02_EXC/SoldeInsuffisantException.java" << 'EOF'
package ma.eai.boa.xbanking.virement.exception;
import ma.eai.midw.exceptions.FwkRollbackException;
public class SoldeInsuffisantException extends FwkRollbackException {
    public SoldeInsuffisantException(String msg) { super(msg); }
}
EOF

cat > "$P02_EXC/CompteBloquéException.java" << 'EOF'
package ma.eai.boa.xbanking.virement.exception;
import ma.eai.midw.exceptions.FwkRollbackException;
public class CompteBloquéException extends FwkRollbackException {
    public CompteBloquéException(String msg) { super(msg); }
}
EOF

# DTOs — InitierVirement
cat > "$P02_DTO/InitierVirementVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.virement.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class InitierVirementVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String numCompteDebiteur;
    @XmlElement(required=true) private String numCompteCrediteur;
    @XmlElement(required=true) private BigDecimal montant;
    @XmlElement private String devise;
    @XmlElement private String motif;
    public String getNumCompteDebiteur() { return numCompteDebiteur; }
    public void setNumCompteDebiteur(String v) { this.numCompteDebiteur = v; }
    public String getNumCompteCrediteur() { return numCompteCrediteur; }
    public void setNumCompteCrediteur(String v) { this.numCompteCrediteur = v; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal v) { this.montant = v; }
    public String getDevise() { return devise; }
    public void setDevise(String v) { this.devise = v; }
    public String getMotif() { return motif; }
    public void setMotif(String v) { this.motif = v; }
}
EOF

cat > "$P02_DTO/InitierVirementVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.virement.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.boa.xbanking.virement.enums.StatutVirement;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class InitierVirementVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String referenceVirement;
    @XmlElement private StatutVirement statut;
    @XmlElement private BigDecimal frais;
    @XmlElement private LocalDate dateExecution;
    public String getReferenceVirement() { return referenceVirement; }
    public void setReferenceVirement(String v) { this.referenceVirement = v; }
    public StatutVirement getStatut() { return statut; }
    public void setStatut(StatutVirement v) { this.statut = v; }
    public BigDecimal getFrais() { return frais; }
    public void setFrais(BigDecimal v) { this.frais = v; }
    public LocalDate getDateExecution() { return dateExecution; }
    public void setDateExecution(LocalDate v) { this.dateExecution = v; }
}
EOF

# DTOs — ValiderVirement
cat > "$P02_DTO/ValiderVirementVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.virement.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ValiderVirementVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String referenceVirement;
    @XmlElement(required=true) private String codeOTP;
    public String getReferenceVirement() { return referenceVirement; }
    public void setReferenceVirement(String v) { this.referenceVirement = v; }
    public String getCodeOTP() { return codeOTP; }
    public void setCodeOTP(String v) { this.codeOTP = v; }
}
EOF

cat > "$P02_DTO/ValiderVirementVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.virement.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.boa.xbanking.virement.enums.StatutVirement;
import javax.xml.bind.annotation.*;
import java.time.LocalDate;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ValiderVirementVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private StatutVirement statut;
    @XmlElement private LocalDate dateValeur;
    @XmlElement private String message;
    public StatutVirement getStatut() { return statut; }
    public void setStatut(StatutVirement v) { this.statut = v; }
    public LocalDate getDateValeur() { return dateValeur; }
    public void setDateValeur(LocalDate v) { this.dateValeur = v; }
    public String getMessage() { return message; }
    public void setMessage(String v) { this.message = v; }
}
EOF

# DTOs — AnnulerVirement
cat > "$P02_DTO/AnnulerVirementVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.virement.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class AnnulerVirementVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String referenceVirement;
    @XmlElement private String motifAnnulation;
    public String getReferenceVirement() { return referenceVirement; }
    public void setReferenceVirement(String v) { this.referenceVirement = v; }
    public String getMotifAnnulation() { return motifAnnulation; }
    public void setMotifAnnulation(String v) { this.motifAnnulation = v; }
}
EOF

cat > "$P02_DTO/AnnulerVirementVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.virement.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.boa.xbanking.virement.enums.StatutVirement;
import javax.xml.bind.annotation.*;
import java.time.LocalDateTime;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class AnnulerVirementVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private StatutVirement statut;
    @XmlElement private LocalDateTime timestampAnnulation;
    public StatutVirement getStatut() { return statut; }
    public void setStatut(StatutVirement v) { this.statut = v; }
    public LocalDateTime getTimestampAnnulation() { return timestampAnnulation; }
    public void setTimestampAnnulation(LocalDateTime v) { this.timestampAnnulation = v; }
}
EOF

# DTOs — ConsulterHistoriqueVirement
cat > "$P02_DTO/ConsulterHistoriqueVirementVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.virement.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
import java.time.LocalDate;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ConsulterHistoriqueVirementVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String numCompte;
    @XmlElement private LocalDate dateDebut;
    @XmlElement private LocalDate dateFin;
    @XmlElement private Integer pageSize;
    @XmlElement private Integer pageNumber;
    public String getNumCompte() { return numCompte; }
    public void setNumCompte(String v) { this.numCompte = v; }
    public LocalDate getDateDebut() { return dateDebut; }
    public void setDateDebut(LocalDate v) { this.dateDebut = v; }
    public LocalDate getDateFin() { return dateFin; }
    public void setDateFin(LocalDate v) { this.dateFin = v; }
    public Integer getPageSize() { return pageSize; }
    public void setPageSize(Integer v) { this.pageSize = v; }
    public Integer getPageNumber() { return pageNumber; }
    public void setPageNumber(Integer v) { this.pageNumber = v; }
}
EOF

cat > "$P02_DTO/ConsulterHistoriqueVirementVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.virement.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
import java.util.List;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ConsulterHistoriqueVirementVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private List<VirementDto> virements;
    @XmlElement private Long totalElements;
    @XmlElement private Integer totalPages;
    public List<VirementDto> getVirements() { return virements; }
    public void setVirements(List<VirementDto> v) { this.virements = v; }
    public Long getTotalElements() { return totalElements; }
    public void setTotalElements(Long v) { this.totalElements = v; }
    public Integer getTotalPages() { return totalPages; }
    public void setTotalPages(Integer v) { this.totalPages = v; }
}
EOF

cat > "$P02_DTO/VirementDto.java" << 'EOF'
package ma.eai.boa.xbanking.virement.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.boa.xbanking.virement.enums.StatutVirement;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class VirementDto implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String referenceVirement;
    @XmlElement private String numCompteDebiteur;
    @XmlElement private String numCompteCrediteur;
    @XmlElement private BigDecimal montant;
    @XmlElement private String devise;
    @XmlElement private StatutVirement statut;
    @XmlElement private LocalDate dateExecution;
    public String getReferenceVirement() { return referenceVirement; }
    public void setReferenceVirement(String v) { this.referenceVirement = v; }
    public String getNumCompteDebiteur() { return numCompteDebiteur; }
    public void setNumCompteDebiteur(String v) { this.numCompteDebiteur = v; }
    public String getNumCompteCrediteur() { return numCompteCrediteur; }
    public void setNumCompteCrediteur(String v) { this.numCompteCrediteur = v; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal v) { this.montant = v; }
    public String getDevise() { return devise; }
    public void setDevise(String v) { this.devise = v; }
    public StatutVirement getStatut() { return statut; }
    public void setStatut(StatutVirement v) { this.statut = v; }
    public LocalDate getDateExecution() { return dateExecution; }
    public void setDateExecution(LocalDate v) { this.dateExecution = v; }
}
EOF

# UseCases
cat > "$P02_UC/InitierVirementUC.java" << 'EOF'
package ma.eai.boa.xbanking.virement.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.virement.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.services.MagixService;
import ma.eai.midw.usecases.BaseUseCase;
import javax.ejb.EJB;
import org.springframework.transaction.annotation.Transactional;
/** BIAN: Payment Initiation (SD0123) / Initiate */
@UseCase(description="Initier un virement bancaire entre deux comptes")
@Transactional(rollbackFor=FwkRollbackException.class)
public class InitierVirementUC implements BaseUseCase {
    @EJB private MagixService magixService;
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== InitierVirementUC ===");
        InitierVirementVoIn in = (InitierVirementVoIn) voIn;
        InitierVirementVoOut out = new InitierVirementVoOut();
        out.setReferenceVirement("VIR-" + System.currentTimeMillis());
        return out;
    }
}
EOF

cat > "$P02_UC/ValiderVirementUC.java" << 'EOF'
package ma.eai.boa.xbanking.virement.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.virement.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.usecases.BaseUseCase;
import org.springframework.transaction.annotation.Transactional;
/** BIAN: Payment Execution (SD0124) / Execute */
@UseCase(description="Valider un virement via code OTP")
@Transactional(rollbackFor=FwkRollbackException.class)
public class ValiderVirementUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== ValiderVirementUC ===");
        ValiderVirementVoIn in = (ValiderVirementVoIn) voIn;
        ValiderVirementVoOut out = new ValiderVirementVoOut();
        out.setMessage("Virement valide");
        return out;
    }
}
EOF

cat > "$P02_UC/AnnulerVirementUC.java" << 'EOF'
package ma.eai.boa.xbanking.virement.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.virement.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.usecases.BaseUseCase;
/** BIAN: Payment Initiation (SD0123) / Cancel */
@UseCase(description="Annuler un virement en attente")
public class AnnulerVirementUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== AnnulerVirementUC ===");
        AnnulerVirementVoIn in = (AnnulerVirementVoIn) voIn;
        AnnulerVirementVoOut out = new AnnulerVirementVoOut();
        return out;
    }
}
EOF

cat > "$P02_UC/ConsulterHistoriqueVirementUC.java" << 'EOF'
package ma.eai.boa.xbanking.virement.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.virement.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.usecases.BaseUseCase;
/** BIAN: Payment Initiation (SD0123) / Retrieve */
@UseCase(description="Consulter l'historique des virements d'un compte")
public class ConsulterHistoriqueVirementUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== ConsulterHistoriqueVirementUC ===");
        ConsulterHistoriqueVirementVoIn in = (ConsulterHistoriqueVirementVoIn) voIn;
        ConsulterHistoriqueVirementVoOut out = new ConsulterHistoriqueVirementVoOut();
        return out;
    }
}
EOF

echo "Projet 02 created"

# ═══════════════════════════════════════════════════════════════════════════════
# PROJET 03 — KYC Client
# ═══════════════════════════════════════════════════════════════════════════════
P03="$BASE/projet-03-kyc"
P03_UC="$P03/src/main/java/ma/eai/boa/xbanking/kyc/usecases"
P03_DTO="$P03/src/main/java/ma/eai/boa/xbanking/kyc/dto"
P03_ENUM="$P03/src/main/java/ma/eai/boa/xbanking/kyc/enums"
P03_VO="$P03/src/main/java/ma/eai/boa/xbanking/vo"
P03_ANN="$P03/src/main/java/ma/eai/boa/xbanking/annotations"
P03_MIDW="$P03/src/main/java/ma/eai/midw"

mkdir -p "$P03_UC" "$P03_DTO" "$P03_ENUM" "$P03_VO" "$P03_ANN" "$P03_MIDW/exceptions" "$P03_MIDW/usecases" "$P03_MIDW/log"

cat > "$P03/pom.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>ma.eai.boa</groupId><artifactId>projet-03-kyc</artifactId><version>1.5.0</version>
<description>Projet EJB BOA — KYC Client avec patterns complexes</description>
<parent><groupId>ma.eai.idev</groupId><artifactId>general-settings-spring-boot</artifactId><version>2024.3</version></parent>
</project>
EOF

# Reuse base classes
cp "$P02_VO/ValueObject.java" "$P03_VO/"
cp "$P02_ANN/UseCase.java" "$P03_ANN/"
cp "$P02_MIDW/usecases/BaseUseCase.java" "$P03_MIDW/usecases/"
cp "$P02_MIDW/exceptions/FwkRollbackException.java" "$P03_MIDW/exceptions/"
cp "$P02_MIDW/log/EaiLog.java" "$P03_MIDW/log/"

# Enums
cat > "$P03_ENUM/StatutKyc.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.enums;
public enum StatutKyc { EN_COURS, COMPLET, REJETE, EXPIRE }
EOF

cat > "$P03_ENUM/TypeDocument.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.enums;
public enum TypeDocument { CIN, PASSEPORT, PERMIS_CONDUIRE, JUSTIFICATIF_DOMICILE, RELEVE_BANCAIRE }
EOF

cat > "$P03_ENUM/NiveauRisque.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.enums;
public enum NiveauRisque { FAIBLE, MOYEN, ELEVE, CRITIQUE }
EOF

# DTOs — InitierKyc
cat > "$P03_DTO/InitierKycVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
import java.time.LocalDate;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class InitierKycVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String cin;
    @XmlElement(required=true) private String nom;
    @XmlElement(required=true) private String prenom;
    @XmlElement private LocalDate dateNaissance;
    @XmlElement private String nationalite;
    @XmlElement private String adresseEmail;
    public String getCin() { return cin; } public void setCin(String v) { this.cin = v; }
    public String getNom() { return nom; } public void setNom(String v) { this.nom = v; }
    public String getPrenom() { return prenom; } public void setPrenom(String v) { this.prenom = v; }
    public LocalDate getDateNaissance() { return dateNaissance; } public void setDateNaissance(LocalDate v) { this.dateNaissance = v; }
    public String getNationalite() { return nationalite; } public void setNationalite(String v) { this.nationalite = v; }
    public String getAdresseEmail() { return adresseEmail; } public void setAdresseEmail(String v) { this.adresseEmail = v; }
}
EOF

cat > "$P03_DTO/InitierKycVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.boa.xbanking.kyc.enums.StatutKyc;
import javax.xml.bind.annotation.*;
import java.util.List;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class InitierKycVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String dossierKycId;
    @XmlElement private StatutKyc statut;
    @XmlElement private List<String> documentsRequis;
    public String getDossierKycId() { return dossierKycId; } public void setDossierKycId(String v) { this.dossierKycId = v; }
    public StatutKyc getStatut() { return statut; } public void setStatut(StatutKyc v) { this.statut = v; }
    public List<String> getDocumentsRequis() { return documentsRequis; } public void setDocumentsRequis(List<String> v) { this.documentsRequis = v; }
}
EOF

# DTOs — ValiderDocument
cat > "$P03_DTO/ValiderDocumentVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.boa.xbanking.kyc.enums.TypeDocument;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ValiderDocumentVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String dossierKycId;
    @XmlElement(required=true) private TypeDocument typeDocument;
    @XmlElement(required=true) private String contenuBase64;
    @XmlElement private String nomFichier;
    public String getDossierKycId() { return dossierKycId; } public void setDossierKycId(String v) { this.dossierKycId = v; }
    public TypeDocument getTypeDocument() { return typeDocument; } public void setTypeDocument(TypeDocument v) { this.typeDocument = v; }
    public String getContenuBase64() { return contenuBase64; } public void setContenuBase64(String v) { this.contenuBase64 = v; }
    public String getNomFichier() { return nomFichier; } public void setNomFichier(String v) { this.nomFichier = v; }
}
EOF

cat > "$P03_DTO/ValiderDocumentVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
import java.util.List;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ValiderDocumentVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String documentId;
    @XmlElement private String statutValidation;
    @XmlElement private List<String> erreurs;
    @XmlElement private Boolean estValide;
    public String getDocumentId() { return documentId; } public void setDocumentId(String v) { this.documentId = v; }
    public String getStatutValidation() { return statutValidation; } public void setStatutValidation(String v) { this.statutValidation = v; }
    public List<String> getErreurs() { return erreurs; } public void setErreurs(List<String> v) { this.erreurs = v; }
    public Boolean getEstValide() { return estValide; } public void setEstValide(Boolean v) { this.estValide = v; }
}
EOF

# DTOs — ConsulterScoreKyc
cat > "$P03_DTO/ConsulterScoreKycVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ConsulterScoreKycVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String cin;
    public String getCin() { return cin; } public void setCin(String v) { this.cin = v; }
}
EOF

cat > "$P03_DTO/ConsulterScoreKycVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.boa.xbanking.kyc.enums.NiveauRisque;
import javax.xml.bind.annotation.*;
import java.util.List;
import java.time.LocalDateTime;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ConsulterScoreKycVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private Integer score;
    @XmlElement private NiveauRisque niveau;
    @XmlElement private List<String> alertes;
    @XmlElement private LocalDateTime dateCalcul;
    @XmlElement private Boolean estAJour;
    public Integer getScore() { return score; } public void setScore(Integer v) { this.score = v; }
    public NiveauRisque getNiveau() { return niveau; } public void setNiveau(NiveauRisque v) { this.niveau = v; }
    public List<String> getAlertes() { return alertes; } public void setAlertes(List<String> v) { this.alertes = v; }
    public LocalDateTime getDateCalcul() { return dateCalcul; } public void setDateCalcul(LocalDateTime v) { this.dateCalcul = v; }
    public Boolean getEstAJour() { return estAJour; } public void setEstAJour(Boolean v) { this.estAJour = v; }
}
EOF

# UseCases
cat > "$P03_UC/InitierKycUC.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.kyc.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.usecases.BaseUseCase;
import org.springframework.transaction.annotation.Transactional;
/** BIAN: Party Reference Data Directory (SD0332) / Initiate */
@UseCase(description="Initier un dossier KYC pour un nouveau client")
@Transactional(rollbackFor=FwkRollbackException.class)
public class InitierKycUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== InitierKycUC ===");
        InitierKycVoIn in = (InitierKycVoIn) voIn;
        InitierKycVoOut out = new InitierKycVoOut();
        out.setDossierKycId("KYC-" + System.currentTimeMillis());
        return out;
    }
}
EOF

cat > "$P03_UC/ValiderDocumentUC.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.kyc.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.usecases.BaseUseCase;
/** BIAN: Document Services (SD0317) / Execute */
@UseCase(description="Valider un document KYC soumis par le client")
public class ValiderDocumentUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== ValiderDocumentUC ===");
        ValiderDocumentVoIn in = (ValiderDocumentVoIn) voIn;
        ValiderDocumentVoOut out = new ValiderDocumentVoOut();
        out.setDocumentId("DOC-" + System.currentTimeMillis());
        out.setEstValide(true);
        return out;
    }
}
EOF

cat > "$P03_UC/ConsulterScoreKycUC.java" << 'EOF'
package ma.eai.boa.xbanking.kyc.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.kyc.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.usecases.BaseUseCase;
/** BIAN: Party Reference Data Directory (SD0332) / Retrieve */
@UseCase(description="Consulter le score KYC et le niveau de risque d'un client")
public class ConsulterScoreKycUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== ConsulterScoreKycUC ===");
        ConsulterScoreKycVoIn in = (ConsulterScoreKycVoIn) voIn;
        ConsulterScoreKycVoOut out = new ConsulterScoreKycVoOut();
        out.setScore(85);
        return out;
    }
}
EOF

echo "Projet 03 created"

# ═══════════════════════════════════════════════════════════════════════════════
# PROJET 04 — Assurance vie (non-BOA, @Stateless standard)
# ═══════════════════════════════════════════════════════════════════════════════
P04="$BASE/projet-04-assurance"
P04_EJB="$P04/src/main/java/com/assurance/vie/ejb"
P04_DTO="$P04/src/main/java/com/assurance/vie/dto"
P04_ENUM="$P04/src/main/java/com/assurance/vie/enums"

mkdir -p "$P04_EJB" "$P04_DTO" "$P04_ENUM"

cat > "$P04/pom.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>com.assurance.vie</groupId><artifactId>projet-04-assurance</artifactId><version>1.0.0</version>
<description>Projet EJB Assurance Vie — @Stateless standard Java EE</description>
</project>
EOF

# Enum
cat > "$P04_ENUM/TypeContrat.java" << 'EOF'
package com.assurance.vie.enums;
public enum TypeContrat { EPARGNE, RETRAITE, CAPITALISATION, PREVOYANCE }
EOF

# DTOs
cat > "$P04_DTO/SouscrireContratVoIn.java" << 'EOF'
package com.assurance.vie.dto;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.assurance.vie.enums.TypeContrat;
public class SouscrireContratVoIn implements Serializable {
    private static final long serialVersionUID = 1L;
    private String nomSouscripteur;
    private String cinSouscripteur;
    private TypeContrat typeContrat;
    private BigDecimal montantInitial;
    private LocalDate dateEffet;
    private Integer dureeAnnees;
    public String getNomSouscripteur() { return nomSouscripteur; } public void setNomSouscripteur(String v) { this.nomSouscripteur = v; }
    public String getCinSouscripteur() { return cinSouscripteur; } public void setCinSouscripteur(String v) { this.cinSouscripteur = v; }
    public TypeContrat getTypeContrat() { return typeContrat; } public void setTypeContrat(TypeContrat v) { this.typeContrat = v; }
    public BigDecimal getMontantInitial() { return montantInitial; } public void setMontantInitial(BigDecimal v) { this.montantInitial = v; }
    public LocalDate getDateEffet() { return dateEffet; } public void setDateEffet(LocalDate v) { this.dateEffet = v; }
    public Integer getDureeAnnees() { return dureeAnnees; } public void setDureeAnnees(Integer v) { this.dureeAnnees = v; }
}
EOF

cat > "$P04_DTO/SouscrireContratVoOut.java" << 'EOF'
package com.assurance.vie.dto;
import java.io.Serializable;
import java.math.BigDecimal;
public class SouscrireContratVoOut implements Serializable {
    private static final long serialVersionUID = 1L;
    private String numeroContrat;
    private String statut;
    private BigDecimal primeAnnuelle;
    public String getNumeroContrat() { return numeroContrat; } public void setNumeroContrat(String v) { this.numeroContrat = v; }
    public String getStatut() { return statut; } public void setStatut(String v) { this.statut = v; }
    public BigDecimal getPrimeAnnuelle() { return primeAnnuelle; } public void setPrimeAnnuelle(BigDecimal v) { this.primeAnnuelle = v; }
}
EOF

cat > "$P04_DTO/VersementComplementaireVoIn.java" << 'EOF'
package com.assurance.vie.dto;
import java.io.Serializable;
import java.math.BigDecimal;
public class VersementComplementaireVoIn implements Serializable {
    private static final long serialVersionUID = 1L;
    private String numeroContrat;
    private BigDecimal montant;
    public String getNumeroContrat() { return numeroContrat; } public void setNumeroContrat(String v) { this.numeroContrat = v; }
    public BigDecimal getMontant() { return montant; } public void setMontant(BigDecimal v) { this.montant = v; }
}
EOF

cat > "$P04_DTO/VersementComplementaireVoOut.java" << 'EOF'
package com.assurance.vie.dto;
import java.io.Serializable;
import java.math.BigDecimal;
public class VersementComplementaireVoOut implements Serializable {
    private static final long serialVersionUID = 1L;
    private String referenceVersement;
    private BigDecimal nouveauSolde;
    private String statut;
    public String getReferenceVersement() { return referenceVersement; } public void setReferenceVersement(String v) { this.referenceVersement = v; }
    public BigDecimal getNouveauSolde() { return nouveauSolde; } public void setNouveauSolde(BigDecimal v) { this.nouveauSolde = v; }
    public String getStatut() { return statut; } public void setStatut(String v) { this.statut = v; }
}
EOF

cat > "$P04_DTO/RachatPartielVoIn.java" << 'EOF'
package com.assurance.vie.dto;
import java.io.Serializable;
import java.math.BigDecimal;
public class RachatPartielVoIn implements Serializable {
    private static final long serialVersionUID = 1L;
    private String numeroContrat;
    private BigDecimal montantRachat;
    private String motif;
    public String getNumeroContrat() { return numeroContrat; } public void setNumeroContrat(String v) { this.numeroContrat = v; }
    public BigDecimal getMontantRachat() { return montantRachat; } public void setMontantRachat(BigDecimal v) { this.montantRachat = v; }
    public String getMotif() { return motif; } public void setMotif(String v) { this.motif = v; }
}
EOF

cat > "$P04_DTO/RachatPartielVoOut.java" << 'EOF'
package com.assurance.vie.dto;
import java.io.Serializable;
import java.math.BigDecimal;
public class RachatPartielVoOut implements Serializable {
    private static final long serialVersionUID = 1L;
    private BigDecimal montantNet;
    private BigDecimal penalite;
    private String statut;
    public BigDecimal getMontantNet() { return montantNet; } public void setMontantNet(BigDecimal v) { this.montantNet = v; }
    public BigDecimal getPenalite() { return penalite; } public void setPenalite(BigDecimal v) { this.penalite = v; }
    public String getStatut() { return statut; } public void setStatut(String v) { this.statut = v; }
}
EOF

cat > "$P04_DTO/ConsulterValeurContratVoIn.java" << 'EOF'
package com.assurance.vie.dto;
import java.io.Serializable;
public class ConsulterValeurContratVoIn implements Serializable {
    private static final long serialVersionUID = 1L;
    private String numeroContrat;
    public String getNumeroContrat() { return numeroContrat; } public void setNumeroContrat(String v) { this.numeroContrat = v; }
}
EOF

cat > "$P04_DTO/ConsulterValeurContratVoOut.java" << 'EOF'
package com.assurance.vie.dto;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
public class ConsulterValeurContratVoOut implements Serializable {
    private static final long serialVersionUID = 1L;
    private String numeroContrat;
    private BigDecimal valeurRachat;
    private BigDecimal valeurCapitalisee;
    private BigDecimal rendementAnnuel;
    private LocalDate dateValorisation;
    public String getNumeroContrat() { return numeroContrat; } public void setNumeroContrat(String v) { this.numeroContrat = v; }
    public BigDecimal getValeurRachat() { return valeurRachat; } public void setValeurRachat(BigDecimal v) { this.valeurRachat = v; }
    public BigDecimal getValeurCapitalisee() { return valeurCapitalisee; } public void setValeurCapitalisee(BigDecimal v) { this.valeurCapitalisee = v; }
    public BigDecimal getRendementAnnuel() { return rendementAnnuel; } public void setRendementAnnuel(BigDecimal v) { this.rendementAnnuel = v; }
    public LocalDate getDateValorisation() { return dateValorisation; } public void setDateValorisation(LocalDate v) { this.dateValorisation = v; }
}
EOF

# EJBs — @Stateless standard (not @UseCase)
cat > "$P04_EJB/SouscrireContratEJB.java" << 'EOF'
package com.assurance.vie.ejb;
import com.assurance.vie.dto.*;
import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
/**
 * Souscrire un nouveau contrat d'assurance vie.
 */
@Stateless
@TransactionAttribute(TransactionAttributeType.REQUIRED)
public class SouscrireContratEJB {
    public SouscrireContratVoOut execute(SouscrireContratVoIn voIn) {
        SouscrireContratVoOut out = new SouscrireContratVoOut();
        out.setNumeroContrat("CONT-" + System.currentTimeMillis());
        out.setStatut("ACTIF");
        return out;
    }
}
EOF

cat > "$P04_EJB/VersementComplementaireEJB.java" << 'EOF'
package com.assurance.vie.ejb;
import com.assurance.vie.dto.*;
import javax.ejb.Stateless;
/**
 * Effectuer un versement complementaire sur un contrat existant.
 */
@Stateless
public class VersementComplementaireEJB {
    public VersementComplementaireVoOut execute(VersementComplementaireVoIn voIn) {
        VersementComplementaireVoOut out = new VersementComplementaireVoOut();
        out.setReferenceVersement("VERS-" + System.currentTimeMillis());
        out.setStatut("ACCEPTE");
        return out;
    }
}
EOF

cat > "$P04_EJB/RachatPartielEJB.java" << 'EOF'
package com.assurance.vie.ejb;
import com.assurance.vie.dto.*;
import javax.ejb.Stateless;
/**
 * Effectuer un rachat partiel sur un contrat d'assurance vie.
 */
@Stateless
public class RachatPartielEJB {
    public RachatPartielVoOut execute(RachatPartielVoIn voIn) {
        RachatPartielVoOut out = new RachatPartielVoOut();
        out.setStatut("TRAITE");
        return out;
    }
}
EOF

cat > "$P04_EJB/ConsulterValeurContratEJB.java" << 'EOF'
package com.assurance.vie.ejb;
import com.assurance.vie.dto.*;
import javax.ejb.Stateless;
/**
 * Consulter la valeur actuelle d'un contrat d'assurance vie.
 */
@Stateless
public class ConsulterValeurContratEJB {
    public ConsulterValeurContratVoOut execute(ConsulterValeurContratVoIn voIn) {
        ConsulterValeurContratVoOut out = new ConsulterValeurContratVoOut();
        out.setNumeroContrat(voIn.getNumeroContrat());
        return out;
    }
}
EOF

echo "Projet 04 created"

# ═══════════════════════════════════════════════════════════════════════════════
# PROJET 05 — Mixte (stress test: EJBs + non-EJBs)
# ═══════════════════════════════════════════════════════════════════════════════
P05="$BASE/projet-05-mixte"
P05_UC="$P05/src/main/java/ma/eai/boa/xbanking/mixte/usecases"
P05_DTO="$P05/src/main/java/ma/eai/boa/xbanking/mixte/dto"
P05_UTIL="$P05/src/main/java/ma/eai/boa/xbanking/mixte/util"
P05_CONST="$P05/src/main/java/ma/eai/boa/xbanking/mixte/constant"
P05_ENUM="$P05/src/main/java/ma/eai/boa/xbanking/mixte/enums"
P05_VO="$P05/src/main/java/ma/eai/boa/xbanking/vo"
P05_ANN="$P05/src/main/java/ma/eai/boa/xbanking/annotations"
P05_MIDW="$P05/src/main/java/ma/eai/midw"
P05_ABS="$P05/src/main/java/ma/eai/boa/xbanking/mixte/base"
P05_IFACE="$P05/src/main/java/ma/eai/boa/xbanking/mixte/service"

mkdir -p "$P05_UC" "$P05_DTO" "$P05_UTIL" "$P05_CONST" "$P05_ENUM" "$P05_VO" "$P05_ANN" "$P05_MIDW/exceptions" "$P05_MIDW/usecases" "$P05_MIDW/log" "$P05_ABS" "$P05_IFACE"

cat > "$P05/pom.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>ma.eai.boa</groupId><artifactId>projet-05-mixte</artifactId><version>1.0.0</version>
<description>Projet mixte — EJBs + classes utilitaires pour stress test du parser</description>
<parent><groupId>ma.eai.idev</groupId><artifactId>general-settings-spring-boot</artifactId><version>2024.3</version></parent>
</project>
EOF

# Reuse base classes
cp "$P02_VO/ValueObject.java" "$P05_VO/"
cp "$P02_ANN/UseCase.java" "$P05_ANN/"
cp "$P02_MIDW/usecases/BaseUseCase.java" "$P05_MIDW/usecases/"
cp "$P02_MIDW/exceptions/FwkRollbackException.java" "$P05_MIDW/exceptions/"
cp "$P02_MIDW/log/EaiLog.java" "$P05_MIDW/log/"

# Enum
cat > "$P05_ENUM/Canal.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.enums;
public enum Canal { WEB, MOBILE, AGENCE, ATM }
EOF

# Non-EJB classes (should be IGNORED by the parser)
cat > "$P05_UTIL/UtilDate.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.util;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
public class UtilDate {
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    public static String format(LocalDate d) { return d.format(FMT); }
    public static LocalDate parse(String s) { return LocalDate.parse(s, FMT); }
}
EOF

cat > "$P05_UTIL/StringHelper.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.util;
public class StringHelper {
    public static boolean isBlank(String s) { return s == null || s.trim().isEmpty(); }
    public static String capitalize(String s) { return s == null ? null : s.substring(0,1).toUpperCase() + s.substring(1); }
    public static String mask(String s, int visible) { return s == null ? null : "****" + s.substring(s.length() - visible); }
}
EOF

cat > "$P05_CONST/AppConstants.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.constant;
public final class AppConstants {
    public static final String CODE_OK = "000";
    public static final String CODE_KO = "999";
    public static final String MSG_OK = "Operation reussie";
    public static final int MAX_RETRY = 3;
    private AppConstants() {}
}
EOF

cat > "$P05_CONST/ErrorCodes.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.constant;
public final class ErrorCodes {
    public static final String ERR_AUTH = "AUTH_001";
    public static final String ERR_VALIDATION = "VAL_001";
    public static final String ERR_TIMEOUT = "TMO_001";
    public static final String ERR_INTERNAL = "INT_001";
    private ErrorCodes() {}
}
EOF

# Abstract class (should be IGNORED)
cat > "$P05_ABS/AbstractProcessor.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.base;
public abstract class AbstractProcessor {
    protected abstract void validate();
    protected abstract void process();
    public final void run() { validate(); process(); }
}
EOF

# Interface (non-EJB, should be IGNORED)
cat > "$P05_IFACE/NotificationService.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.service;
public interface NotificationService {
    void sendSms(String phone, String message);
    void sendEmail(String email, String subject, String body);
}
EOF

# DTOs for the real EJBs
cat > "$P05_DTO/CreerCompteVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class CreerCompteVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String nomClient;
    @XmlElement(required=true) private String cin;
    @XmlElement private String typeCompte;
    public String getNomClient() { return nomClient; } public void setNomClient(String v) { this.nomClient = v; }
    public String getCin() { return cin; } public void setCin(String v) { this.cin = v; }
    public String getTypeCompte() { return typeCompte; } public void setTypeCompte(String v) { this.typeCompte = v; }
}
EOF

cat > "$P05_DTO/CreerCompteVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class CreerCompteVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String numCompte;
    @XmlElement private String statut;
    public String getNumCompte() { return numCompte; } public void setNumCompte(String v) { this.numCompte = v; }
    public String getStatut() { return statut; } public void setStatut(String v) { this.statut = v; }
}
EOF

cat > "$P05_DTO/ConsulterSoldeVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ConsulterSoldeVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String numCompte;
    public String getNumCompte() { return numCompte; } public void setNumCompte(String v) { this.numCompte = v; }
}
EOF

cat > "$P05_DTO/ConsulterSoldeVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class ConsulterSoldeVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private BigDecimal solde;
    @XmlElement private String devise;
    public BigDecimal getSolde() { return solde; } public void setSolde(BigDecimal v) { this.solde = v; }
    public String getDevise() { return devise; } public void setDevise(String v) { this.devise = v; }
}
EOF

cat > "$P05_DTO/EffectuerDepotVoIn.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.boa.xbanking.mixte.enums.Canal;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class EffectuerDepotVoIn implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement(required=true) private String numCompte;
    @XmlElement(required=true) private BigDecimal montant;
    @XmlElement private Canal canal;
    public String getNumCompte() { return numCompte; } public void setNumCompte(String v) { this.numCompte = v; }
    public BigDecimal getMontant() { return montant; } public void setMontant(BigDecimal v) { this.montant = v; }
    public Canal getCanal() { return canal; } public void setCanal(Canal v) { this.canal = v; }
}
EOF

cat > "$P05_DTO/EffectuerDepotVoOut.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.dto;
import ma.eai.boa.xbanking.vo.ValueObject;
import javax.xml.bind.annotation.*;
import java.math.BigDecimal;
@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)
public class EffectuerDepotVoOut implements ValueObject {
    private static final long serialVersionUID = 1L;
    @XmlElement private String referenceDepot;
    @XmlElement private BigDecimal nouveauSolde;
    @XmlElement private String statut;
    public String getReferenceDepot() { return referenceDepot; } public void setReferenceDepot(String v) { this.referenceDepot = v; }
    public BigDecimal getNouveauSolde() { return nouveauSolde; } public void setNouveauSolde(BigDecimal v) { this.nouveauSolde = v; }
    public String getStatut() { return statut; } public void setStatut(String v) { this.statut = v; }
}
EOF

# Real EJBs (should be DETECTED)
cat > "$P05_UC/CreerCompteUC.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.mixte.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.usecases.BaseUseCase;
import org.springframework.transaction.annotation.Transactional;
/** BIAN: Current Account (SD0152) / Initiate */
@UseCase(description="Creer un nouveau compte bancaire")
@Transactional(rollbackFor=FwkRollbackException.class)
public class CreerCompteUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== CreerCompteUC ===");
        CreerCompteVoIn in = (CreerCompteVoIn) voIn;
        CreerCompteVoOut out = new CreerCompteVoOut();
        out.setNumCompte("CPT-" + System.currentTimeMillis());
        out.setStatut("ACTIF");
        return out;
    }
}
EOF

cat > "$P05_UC/ConsulterSoldeUC.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.mixte.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.usecases.BaseUseCase;
/** BIAN: Current Account (SD0152) / Retrieve */
@UseCase(description="Consulter le solde d'un compte")
public class ConsulterSoldeUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== ConsulterSoldeUC ===");
        ConsulterSoldeVoIn in = (ConsulterSoldeVoIn) voIn;
        ConsulterSoldeVoOut out = new ConsulterSoldeVoOut();
        return out;
    }
}
EOF

cat > "$P05_UC/EffectuerDepotUC.java" << 'EOF'
package ma.eai.boa.xbanking.mixte.usecases;
import ma.eai.boa.xbanking.annotations.UseCase;
import ma.eai.boa.xbanking.mixte.dto.*;
import ma.eai.boa.xbanking.vo.ValueObject;
import ma.eai.midw.exceptions.FwkRollbackException;
import ma.eai.midw.log.EaiLog;
import ma.eai.midw.usecases.BaseUseCase;
import org.springframework.transaction.annotation.Transactional;
/** BIAN: Current Account (SD0152) / Execute */
@UseCase(description="Effectuer un depot sur un compte")
@Transactional(rollbackFor=FwkRollbackException.class)
public class EffectuerDepotUC implements BaseUseCase {
    @Override public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        EaiLog.info("=== EffectuerDepotUC ===");
        EffectuerDepotVoIn in = (EffectuerDepotVoIn) voIn;
        EffectuerDepotVoOut out = new EffectuerDepotVoOut();
        out.setReferenceDepot("DEP-" + System.currentTimeMillis());
        return out;
    }
}
EOF

echo "Projet 05 created"
echo "All 4 new test projects created successfully!"
