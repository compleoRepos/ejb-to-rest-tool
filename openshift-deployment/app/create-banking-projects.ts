/**
 * Génère 10 projets bancaires réalistes pour tester le moteur de modernisation.
 * Chaque projet contient : EJBs, Entities JPA, DAOs JDBC, Servlets, JSPs, DTOs, transactions.
 */
import * as fs from "fs";
import * as path from "path";

const BASE_DIR = "/tmp/banking-projects";

interface BankingProject {
  name: string;
  description: string;
  domain: string;
  files: Array<{ path: string; content: string }>;
}

function createProject(project: BankingProject) {
  const dir = path.join(BASE_DIR, project.name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of project.files) {
    fs.writeFileSync(path.join(dir, file.path), file.content);
  }
  // Write metadata
  fs.writeFileSync(
    path.join(dir, "project-info.json"),
    JSON.stringify({ name: project.name, description: project.description, domain: project.domain, fileCount: project.files.length }, null, 2)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJET 1 : Gestion des Comptes Bancaires (Core Banking)
// ═══════════════════════════════════════════════════════════════════════════════
const projet1: BankingProject = {
  name: "proj-01-core-banking",
  description: "Système de gestion des comptes bancaires — ouverture, clôture, consultation solde, historique mouvements",
  domain: "Core Banking — Gestion de Comptes",
  files: [
    {
      path: "CompteBancaireEntity.java",
      content: `package com.banque.entity;

import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

@Entity
@Table(name = "COMPTE_BANCAIRE")
@NamedQueries({
    @NamedQuery(name = "CompteBancaire.findByClient", query = "SELECT c FROM CompteBancaireEntity c WHERE c.clientId = :clientId"),
    @NamedQuery(name = "CompteBancaire.findByNumero", query = "SELECT c FROM CompteBancaireEntity c WHERE c.numeroCompte = :numero"),
    @NamedQuery(name = "CompteBancaire.findActifs", query = "SELECT c FROM CompteBancaireEntity c WHERE c.statut = 'ACTIF'")
})
public class CompteBancaireEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "compte_seq")
    @SequenceGenerator(name = "compte_seq", sequenceName = "SEQ_COMPTE", allocationSize = 1)
    private Long id;

    @Column(name = "NUMERO_COMPTE", unique = true, nullable = false, length = 24)
    private String numeroCompte;

    @Column(name = "CLIENT_ID", nullable = false)
    private Long clientId;

    @Column(name = "TYPE_COMPTE", nullable = false)
    @Enumerated(EnumType.STRING)
    private TypeCompte typeCompte;

    @Column(name = "SOLDE", precision = 15, scale = 2)
    private BigDecimal solde;

    @Column(name = "DEVISE", length = 3)
    private String devise;

    @Column(name = "DATE_OUVERTURE")
    @Temporal(TemporalType.TIMESTAMP)
    private Date dateOuverture;

    @Column(name = "DATE_CLOTURE")
    @Temporal(TemporalType.TIMESTAMP)
    private Date dateCloture;

    @Column(name = "STATUT")
    @Enumerated(EnumType.STRING)
    private StatutCompte statut;

    @Column(name = "PLAFOND_DECOUVERT", precision = 15, scale = 2)
    private BigDecimal plafondDecouvert;

    @OneToMany(mappedBy = "compte", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<MouvementEntity> mouvements;

    @Version
    private Long version;

    // Getters/Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNumeroCompte() { return numeroCompte; }
    public void setNumeroCompte(String numeroCompte) { this.numeroCompte = numeroCompte; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public TypeCompte getTypeCompte() { return typeCompte; }
    public void setTypeCompte(TypeCompte typeCompte) { this.typeCompte = typeCompte; }
    public BigDecimal getSolde() { return solde; }
    public void setSolde(BigDecimal solde) { this.solde = solde; }
    public String getDevise() { return devise; }
    public void setDevise(String devise) { this.devise = devise; }
    public Date getDateOuverture() { return dateOuverture; }
    public void setDateOuverture(Date dateOuverture) { this.dateOuverture = dateOuverture; }
    public StatutCompte getStatut() { return statut; }
    public void setStatut(StatutCompte statut) { this.statut = statut; }
    public BigDecimal getPlafondDecouvert() { return plafondDecouvert; }
    public void setPlafondDecouvert(BigDecimal plafondDecouvert) { this.plafondDecouvert = plafondDecouvert; }
    public List<MouvementEntity> getMouvements() { return mouvements; }
}

enum TypeCompte { COURANT, EPARGNE, PROFESSIONNEL, JOINT }
enum StatutCompte { ACTIF, BLOQUE, CLOTURE, EN_ATTENTE }
`
    },
    {
      path: "MouvementEntity.java",
      content: `package com.banque.entity;

import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;

@Entity
@Table(name = "MOUVEMENT")
public class MouvementEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "mvt_seq")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "COMPTE_ID", nullable = false)
    private CompteBancaireEntity compte;

    @Column(name = "TYPE_MOUVEMENT")
    @Enumerated(EnumType.STRING)
    private TypeMouvement typeMouvement;

    @Column(name = "MONTANT", precision = 15, scale = 2, nullable = false)
    private BigDecimal montant;

    @Column(name = "LIBELLE", length = 255)
    private String libelle;

    @Column(name = "DATE_VALEUR")
    @Temporal(TemporalType.TIMESTAMP)
    private Date dateValeur;

    @Column(name = "DATE_OPERATION")
    @Temporal(TemporalType.TIMESTAMP)
    private Date dateOperation;

    @Column(name = "REFERENCE_EXTERNE", length = 50)
    private String referenceExterne;

    @Column(name = "SOLDE_APRES", precision = 15, scale = 2)
    private BigDecimal soldeApres;

    // Getters/Setters
    public Long getId() { return id; }
    public TypeMouvement getTypeMouvement() { return typeMouvement; }
    public BigDecimal getMontant() { return montant; }
    public String getLibelle() { return libelle; }
    public Date getDateValeur() { return dateValeur; }
    public Date getDateOperation() { return dateOperation; }
    public BigDecimal getSoldeApres() { return soldeApres; }
}

enum TypeMouvement { CREDIT, DEBIT, VIREMENT_ENTRANT, VIREMENT_SORTANT, PRELEVEMENT, FRAIS }
`
    },
    {
      path: "GestionCompteBean.java",
      content: `package com.banque.ejb;

import com.banque.entity.CompteBancaireEntity;
import com.banque.entity.MouvementEntity;
import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.TypedQuery;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

@Stateless
public class GestionCompteBean implements GestionCompteRemote {

    @PersistenceContext(unitName = "banquePU")
    private EntityManager em;

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public CompteBancaireEntity ouvrirCompte(Long clientId, String typeCompte, String devise, BigDecimal soldeInitial) {
        CompteBancaireEntity compte = new CompteBancaireEntity();
        compte.setClientId(clientId);
        compte.setNumeroCompte(genererNumeroCompte());
        compte.setTypeCompte(TypeCompte.valueOf(typeCompte));
        compte.setDevise(devise);
        compte.setSolde(soldeInitial);
        compte.setDateOuverture(new Date());
        compte.setStatut(StatutCompte.ACTIF);
        compte.setPlafondDecouvert(BigDecimal.ZERO);
        em.persist(compte);

        // Créer le mouvement initial
        if (soldeInitial.compareTo(BigDecimal.ZERO) > 0) {
            creerMouvement(compte, TypeMouvement.CREDIT, soldeInitial, "Versement initial");
        }
        return compte;
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void cloturerCompte(String numeroCompte, String motif) {
        CompteBancaireEntity compte = findByNumero(numeroCompte);
        if (compte == null) {
            throw new CompteInexistantException("Compte " + numeroCompte + " introuvable");
        }
        if (compte.getSolde().compareTo(BigDecimal.ZERO) != 0) {
            throw new SoldeNonNulException("Le solde doit être à zéro pour clôturer");
        }
        compte.setStatut(StatutCompte.CLOTURE);
        compte.setDateCloture(new Date());
        em.merge(compte);
    }

    @Override
    public BigDecimal consulterSolde(String numeroCompte) {
        CompteBancaireEntity compte = findByNumero(numeroCompte);
        if (compte == null) {
            throw new CompteInexistantException("Compte " + numeroCompte + " introuvable");
        }
        return compte.getSolde();
    }

    @Override
    public List<MouvementEntity> consulterHistorique(String numeroCompte, Date dateDebut, Date dateFin) {
        TypedQuery<MouvementEntity> query = em.createQuery(
            "SELECT m FROM MouvementEntity m WHERE m.compte.numeroCompte = :numero " +
            "AND m.dateOperation BETWEEN :debut AND :fin ORDER BY m.dateOperation DESC",
            MouvementEntity.class
        );
        query.setParameter("numero", numeroCompte);
        query.setParameter("debut", dateDebut);
        query.setParameter("fin", dateFin);
        return query.getResultList();
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void modifierPlafondDecouvert(String numeroCompte, BigDecimal nouveauPlafond) {
        CompteBancaireEntity compte = findByNumero(numeroCompte);
        compte.setPlafondDecouvert(nouveauPlafond);
        em.merge(compte);
    }

    @Override
    public List<CompteBancaireEntity> listerComptesClient(Long clientId) {
        return em.createNamedQuery("CompteBancaire.findByClient", CompteBancaireEntity.class)
                 .setParameter("clientId", clientId)
                 .getResultList();
    }

    private CompteBancaireEntity findByNumero(String numero) {
        try {
            return em.createNamedQuery("CompteBancaire.findByNumero", CompteBancaireEntity.class)
                     .setParameter("numero", numero)
                     .getSingleResult();
        } catch (Exception e) {
            return null;
        }
    }

    private void creerMouvement(CompteBancaireEntity compte, TypeMouvement type, BigDecimal montant, String libelle) {
        MouvementEntity mvt = new MouvementEntity();
        mvt.setCompte(compte);
        mvt.setTypeMouvement(type);
        mvt.setMontant(montant);
        mvt.setLibelle(libelle);
        mvt.setDateOperation(new Date());
        mvt.setDateValeur(new Date());
        mvt.setSoldeApres(compte.getSolde());
        em.persist(mvt);
    }

    private String genererNumeroCompte() {
        return "FR76" + String.format("%020d", System.nanoTime() % 100000000000000L);
    }
}
`
    },
    {
      path: "GestionCompteRemote.java",
      content: `package com.banque.ejb;

import com.banque.entity.CompteBancaireEntity;
import com.banque.entity.MouvementEntity;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

@Remote
public interface GestionCompteRemote {
    CompteBancaireEntity ouvrirCompte(Long clientId, String typeCompte, String devise, BigDecimal soldeInitial);
    void cloturerCompte(String numeroCompte, String motif);
    BigDecimal consulterSolde(String numeroCompte);
    List<MouvementEntity> consulterHistorique(String numeroCompte, Date dateDebut, Date dateFin);
    void modifierPlafondDecouvert(String numeroCompte, BigDecimal nouveauPlafond);
    List<CompteBancaireEntity> listerComptesClient(Long clientId);
}
`
    },
    {
      path: "CompteServlet.java",
      content: `package com.banque.web;

import com.banque.ejb.GestionCompteRemote;
import com.banque.entity.CompteBancaireEntity;
import javax.ejb.EJB;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;

@WebServlet(urlPatterns = {"/compte/liste", "/compte/ouvrir", "/compte/detail", "/compte/cloturer"})
public class CompteServlet extends HttpServlet {

    @EJB
    private GestionCompteRemote gestionCompte;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String path = req.getServletPath();
        HttpSession session = req.getSession();
        Long clientId = (Long) session.getAttribute("clientId");

        switch (path) {
            case "/compte/liste":
                List<CompteBancaireEntity> comptes = gestionCompte.listerComptesClient(clientId);
                req.setAttribute("comptes", comptes);
                req.getRequestDispatcher("/WEB-INF/jsp/compte/liste.jsp").forward(req, resp);
                break;
            case "/compte/detail":
                String numero = req.getParameter("numero");
                BigDecimal solde = gestionCompte.consulterSolde(numero);
                req.setAttribute("solde", solde);
                req.setAttribute("numero", numero);
                req.getRequestDispatcher("/WEB-INF/jsp/compte/detail.jsp").forward(req, resp);
                break;
            case "/compte/ouvrir":
                req.getRequestDispatcher("/WEB-INF/jsp/compte/ouvrir-form.jsp").forward(req, resp);
                break;
            default:
                resp.sendError(404);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String path = req.getServletPath();
        HttpSession session = req.getSession();
        Long clientId = (Long) session.getAttribute("clientId");

        if ("/compte/ouvrir".equals(path)) {
            String type = req.getParameter("typeCompte");
            String devise = req.getParameter("devise");
            BigDecimal soldeInitial = new BigDecimal(req.getParameter("soldeInitial"));
            gestionCompte.ouvrirCompte(clientId, type, devise, soldeInitial);
            resp.sendRedirect("/compte/liste");
        } else if ("/compte/cloturer".equals(path)) {
            String numero = req.getParameter("numero");
            gestionCompte.cloturerCompte(numero, req.getParameter("motif"));
            resp.sendRedirect("/compte/liste");
        }
    }
}
`
    },
    {
      path: "CompteDTO.java",
      content: `package com.banque.dto;

import java.math.BigDecimal;
import java.util.Date;

public class CompteDTO {
    private String numeroCompte;
    private String typeCompte;
    private BigDecimal solde;
    private String devise;
    private Date dateOuverture;
    private String statut;
    private BigDecimal plafondDecouvert;

    public CompteDTO() {}

    public CompteDTO(String numeroCompte, String typeCompte, BigDecimal solde, String devise, Date dateOuverture, String statut) {
        this.numeroCompte = numeroCompte;
        this.typeCompte = typeCompte;
        this.solde = solde;
        this.devise = devise;
        this.dateOuverture = dateOuverture;
        this.statut = statut;
    }

    // Getters/Setters
    public String getNumeroCompte() { return numeroCompte; }
    public void setNumeroCompte(String n) { this.numeroCompte = n; }
    public String getTypeCompte() { return typeCompte; }
    public void setTypeCompte(String t) { this.typeCompte = t; }
    public BigDecimal getSolde() { return solde; }
    public void setSolde(BigDecimal s) { this.solde = s; }
    public String getDevise() { return devise; }
    public void setDevise(String d) { this.devise = d; }
    public Date getDateOuverture() { return dateOuverture; }
    public void setDateOuverture(Date d) { this.dateOuverture = d; }
    public String getStatut() { return statut; }
    public void setStatut(String s) { this.statut = s; }
    public BigDecimal getPlafondDecouvert() { return plafondDecouvert; }
    public void setPlafondDecouvert(BigDecimal p) { this.plafondDecouvert = p; }
}
`
    }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROJET 2 : Virements Bancaires (SEPA, Internes, Internationaux)
// ═══════════════════════════════════════════════════════════════════════════════
const projet2: BankingProject = {
  name: "proj-02-virements",
  description: "Module de virements bancaires — SEPA, internes, internationaux, avec validation et exécution différée",
  domain: "Virements Bancaires — SEPA & International",
  files: [
    {
      path: "VirementEntity.java",
      content: `package com.banque.virement.entity;

import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;

@Entity
@Table(name = "VIREMENT")
public class VirementEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE)
    private Long id;

    @Column(name = "REFERENCE", unique = true, length = 35)
    private String reference;

    @Column(name = "COMPTE_DEBITEUR", nullable = false, length = 34)
    private String compteDebiteur;

    @Column(name = "COMPTE_CREDITEUR", nullable = false, length = 34)
    private String compteCrediteur;

    @Column(name = "MONTANT", precision = 15, scale = 2, nullable = false)
    private BigDecimal montant;

    @Column(name = "DEVISE", length = 3)
    private String devise;

    @Column(name = "MOTIF", length = 140)
    private String motif;

    @Column(name = "TYPE_VIREMENT")
    @Enumerated(EnumType.STRING)
    private TypeVirement typeVirement;

    @Column(name = "STATUT")
    @Enumerated(EnumType.STRING)
    private StatutVirement statut;

    @Column(name = "DATE_CREATION")
    @Temporal(TemporalType.TIMESTAMP)
    private Date dateCreation;

    @Column(name = "DATE_EXECUTION")
    @Temporal(TemporalType.TIMESTAMP)
    private Date dateExecution;

    @Column(name = "BIC_BENEFICIAIRE", length = 11)
    private String bicBeneficiaire;

    @Column(name = "NOM_BENEFICIAIRE", length = 70)
    private String nomBeneficiaire;

    @Column(name = "CODE_REJET", length = 10)
    private String codeRejet;

    // Getters/Setters
    public Long getId() { return id; }
    public String getReference() { return reference; }
    public void setReference(String r) { this.reference = r; }
    public String getCompteDebiteur() { return compteDebiteur; }
    public void setCompteDebiteur(String c) { this.compteDebiteur = c; }
    public String getCompteCrediteur() { return compteCrediteur; }
    public void setCompteCrediteur(String c) { this.compteCrediteur = c; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal m) { this.montant = m; }
    public String getDevise() { return devise; }
    public void setDevise(String d) { this.devise = d; }
    public TypeVirement getTypeVirement() { return typeVirement; }
    public void setTypeVirement(TypeVirement t) { this.typeVirement = t; }
    public StatutVirement getStatut() { return statut; }
    public void setStatut(StatutVirement s) { this.statut = s; }
    public Date getDateCreation() { return dateCreation; }
    public void setDateCreation(Date d) { this.dateCreation = d; }
    public Date getDateExecution() { return dateExecution; }
    public void setDateExecution(Date d) { this.dateExecution = d; }
    public String getMotif() { return motif; }
    public void setMotif(String m) { this.motif = m; }
}

enum TypeVirement { INTERNE, SEPA, INTERNATIONAL, INSTANTANE }
enum StatutVirement { EN_ATTENTE, VALIDE, EXECUTE, REJETE, ANNULE }
`
    },
    {
      path: "VirementServiceBean.java",
      content: `package com.banque.virement.ejb;

import com.banque.virement.entity.VirementEntity;
import javax.ejb.*;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.jms.*;
import javax.annotation.Resource;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Stateless
@TransactionManagement(TransactionManagementType.CONTAINER)
public class VirementServiceBean implements VirementServiceRemote {

    @PersistenceContext(unitName = "virementPU")
    private EntityManager em;

    @Resource(mappedName = "jms/VirementQueue")
    private Queue virementQueue;

    @Resource(mappedName = "jms/ConnectionFactory")
    private ConnectionFactory connectionFactory;

    @EJB
    private ValidationVirementBean validationBean;

    @EJB
    private CompteServiceRemote compteService;

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public VirementEntity initierVirement(String compteDebiteur, String compteCrediteur,
                                           BigDecimal montant, String devise, String motif,
                                           TypeVirement type) {
        // Validation métier
        validationBean.validerMontant(montant, type);
        validationBean.validerCompteDebiteur(compteDebiteur);
        validationBean.validerIBAN(compteCrediteur);

        // Vérifier la provision
        BigDecimal solde = compteService.consulterSolde(compteDebiteur);
        if (solde.compareTo(montant) < 0) {
            throw new ProvisionInsuffisanteException(
                "Solde insuffisant: " + solde + " < " + montant);
        }

        // Créer le virement
        VirementEntity virement = new VirementEntity();
        virement.setReference(genererReference(type));
        virement.setCompteDebiteur(compteDebiteur);
        virement.setCompteCrediteur(compteCrediteur);
        virement.setMontant(montant);
        virement.setDevise(devise);
        virement.setMotif(motif);
        virement.setTypeVirement(type);
        virement.setStatut(StatutVirement.EN_ATTENTE);
        virement.setDateCreation(new Date());

        em.persist(virement);

        // Envoyer en file d'attente pour exécution asynchrone
        envoyerEnFileExecution(virement);

        return virement;
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void executerVirement(Long virementId) {
        VirementEntity virement = em.find(VirementEntity.class, virementId);
        if (virement == null || virement.getStatut() != StatutVirement.EN_ATTENTE) {
            throw new VirementInvalideException("Virement non exécutable: " + virementId);
        }

        try {
            // Débiter le compte source
            compteService.debiter(virement.getCompteDebiteur(), virement.getMontant(),
                                  "Virement " + virement.getReference());

            // Créditer le compte destination
            compteService.crediter(virement.getCompteCrediteur(), virement.getMontant(),
                                   "Virement reçu " + virement.getReference());

            virement.setStatut(StatutVirement.EXECUTE);
            virement.setDateExecution(new Date());
        } catch (Exception e) {
            virement.setStatut(StatutVirement.REJETE);
            virement.setCodeRejet("INSUF_FUNDS");
            throw new VirementRejetException("Échec exécution: " + e.getMessage());
        }

        em.merge(virement);
    }

    @Override
    public void annulerVirement(String reference) {
        VirementEntity virement = findByReference(reference);
        if (virement.getStatut() != StatutVirement.EN_ATTENTE) {
            throw new VirementInvalideException("Seuls les virements en attente peuvent être annulés");
        }
        virement.setStatut(StatutVirement.ANNULE);
        em.merge(virement);
    }

    @Override
    public List<VirementEntity> listerVirements(String compteDebiteur, Date dateDebut, Date dateFin) {
        return em.createQuery(
            "SELECT v FROM VirementEntity v WHERE v.compteDebiteur = :compte " +
            "AND v.dateCreation BETWEEN :debut AND :fin ORDER BY v.dateCreation DESC",
            VirementEntity.class)
            .setParameter("compte", compteDebiteur)
            .setParameter("debut", dateDebut)
            .setParameter("fin", dateFin)
            .getResultList();
    }

    @Override
    public VirementEntity consulterVirement(String reference) {
        return findByReference(reference);
    }

    private VirementEntity findByReference(String reference) {
        return em.createQuery("SELECT v FROM VirementEntity v WHERE v.reference = :ref", VirementEntity.class)
                 .setParameter("ref", reference)
                 .getSingleResult();
    }

    private String genererReference(TypeVirement type) {
        String prefix = type == TypeVirement.SEPA ? "SEPA" : type == TypeVirement.INTERNATIONAL ? "INTL" : "INTR";
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase();
    }

    private void envoyerEnFileExecution(VirementEntity virement) {
        try (Connection conn = connectionFactory.createConnection();
             Session session = conn.createSession(false, Session.AUTO_ACKNOWLEDGE)) {
            MessageProducer producer = session.createProducer(virementQueue);
            TextMessage message = session.createTextMessage(virement.getReference());
            message.setStringProperty("type", virement.getTypeVirement().name());
            producer.send(message);
        } catch (JMSException e) {
            throw new RuntimeException("Erreur JMS: " + e.getMessage(), e);
        }
    }
}
`
    },
    {
      path: "ValidationVirementBean.java",
      content: `package com.banque.virement.ejb;

import javax.ejb.Stateless;
import java.math.BigDecimal;
import java.util.regex.Pattern;

@Stateless
public class ValidationVirementBean {

    private static final BigDecimal PLAFOND_SEPA = new BigDecimal("50000.00");
    private static final BigDecimal PLAFOND_INTERNE = new BigDecimal("100000.00");
    private static final BigDecimal PLAFOND_INTERNATIONAL = new BigDecimal("200000.00");
    private static final Pattern IBAN_PATTERN = Pattern.compile("[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}");

    public void validerMontant(BigDecimal montant, TypeVirement type) {
        if (montant == null || montant.compareTo(BigDecimal.ZERO) <= 0) {
            throw new MontantInvalideException("Le montant doit être positif");
        }

        BigDecimal plafond = getPlafond(type);
        if (montant.compareTo(plafond) > 0) {
            throw new PlafondDepasseException(
                "Montant " + montant + " dépasse le plafond " + plafond + " pour " + type);
        }
    }

    public void validerIBAN(String iban) {
        if (iban == null || !IBAN_PATTERN.matcher(iban.replaceAll("\\\\s", "")).matches()) {
            throw new IBANInvalideException("IBAN invalide: " + iban);
        }
    }

    public void validerCompteDebiteur(String compte) {
        if (compte == null || compte.trim().isEmpty()) {
            throw new CompteInvalideException("Compte débiteur obligatoire");
        }
    }

    private BigDecimal getPlafond(TypeVirement type) {
        switch (type) {
            case SEPA: return PLAFOND_SEPA;
            case INTERNE: return PLAFOND_INTERNE;
            case INTERNATIONAL: return PLAFOND_INTERNATIONAL;
            default: return PLAFOND_SEPA;
        }
    }
}
`
    },
    {
      path: "VirementServiceRemote.java",
      content: `package com.banque.virement.ejb;

import com.banque.virement.entity.VirementEntity;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

@Remote
public interface VirementServiceRemote {
    VirementEntity initierVirement(String compteDebiteur, String compteCrediteur,
                                    BigDecimal montant, String devise, String motif, TypeVirement type);
    void executerVirement(Long virementId);
    void annulerVirement(String reference);
    List<VirementEntity> listerVirements(String compteDebiteur, Date dateDebut, Date dateFin);
    VirementEntity consulterVirement(String reference);
}
`
    },
    {
      path: "VirementMDB.java",
      content: `package com.banque.virement.mdb;

import com.banque.virement.ejb.VirementServiceRemote;
import javax.ejb.ActivationConfigProperty;
import javax.ejb.EJB;
import javax.ejb.MessageDriven;
import javax.jms.Message;
import javax.jms.MessageListener;
import javax.jms.TextMessage;

@MessageDriven(activationConfig = {
    @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue"),
    @ActivationConfigProperty(propertyName = "destination", propertyValue = "jms/VirementQueue")
})
public class VirementMDB implements MessageListener {

    @EJB
    private VirementServiceRemote virementService;

    @Override
    public void onMessage(Message message) {
        try {
            TextMessage textMessage = (TextMessage) message;
            String reference = textMessage.getText();
            String type = message.getStringProperty("type");

            System.out.println("[VirementMDB] Traitement virement: " + reference + " type=" + type);

            // Exécuter le virement de manière asynchrone
            VirementEntity virement = virementService.consulterVirement(reference);
            virementService.executerVirement(virement.getId());

            System.out.println("[VirementMDB] Virement exécuté: " + reference);
        } catch (Exception e) {
            System.err.println("[VirementMDB] Erreur traitement: " + e.getMessage());
            // Le container gèrera le retry
        }
    }
}
`
    },
    {
      path: "VirementServlet.java",
      content: `package com.banque.virement.web;

import com.banque.virement.ejb.VirementServiceRemote;
import com.banque.virement.entity.VirementEntity;
import javax.ejb.EJB;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.*;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

@WebServlet(urlPatterns = {"/virement/nouveau", "/virement/liste", "/virement/annuler"})
public class VirementServlet extends HttpServlet {

    @EJB
    private VirementServiceRemote virementService;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String path = req.getServletPath();
        if ("/virement/liste".equals(path)) {
            String compte = (String) req.getSession().getAttribute("compteActif");
            List<VirementEntity> virements = virementService.listerVirements(compte, new Date(0), new Date());
            req.setAttribute("virements", virements);
            req.getRequestDispatcher("/WEB-INF/jsp/virement/liste.jsp").forward(req, resp);
        } else if ("/virement/nouveau".equals(path)) {
            req.getRequestDispatcher("/WEB-INF/jsp/virement/formulaire.jsp").forward(req, resp);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String path = req.getServletPath();
        if ("/virement/nouveau".equals(path)) {
            String compteDebiteur = req.getParameter("compteDebiteur");
            String compteCrediteur = req.getParameter("compteCrediteur");
            BigDecimal montant = new BigDecimal(req.getParameter("montant"));
            String devise = req.getParameter("devise");
            String motif = req.getParameter("motif");
            String type = req.getParameter("type");

            virementService.initierVirement(compteDebiteur, compteCrediteur, montant, devise, motif,
                                            TypeVirement.valueOf(type));
            resp.sendRedirect("/virement/liste?success=true");
        } else if ("/virement/annuler".equals(path)) {
            virementService.annulerVirement(req.getParameter("reference"));
            resp.sendRedirect("/virement/liste");
        }
    }
}
`
    }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROJET 3 : Gestion des Crédits Immobiliers
// ═══════════════════════════════════════════════════════════════════════════════
const projet3: BankingProject = {
  name: "proj-03-credit-immobilier",
  description: "Module de gestion des crédits immobiliers — simulation, demande, scoring, décaissement, échéancier",
  domain: "Crédit Immobilier — Scoring & Échéancier",
  files: [
    {
      path: "CreditImmobilierEntity.java",
      content: `package com.banque.credit.entity;

import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

@Entity
@Table(name = "CREDIT_IMMOBILIER")
public class CreditImmobilierEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE)
    private Long id;

    @Column(name = "REFERENCE_DOSSIER", unique = true, length = 20)
    private String referenceDossier;

    @Column(name = "CLIENT_ID") private Long clientId;
    @Column(name = "MONTANT_EMPRUNTE", precision = 15, scale = 2) private BigDecimal montantEmprunte;
    @Column(name = "TAUX_INTERET", precision = 5, scale = 4) private BigDecimal tauxInteret;
    @Column(name = "DUREE_MOIS") private Integer dureeMois;
    @Column(name = "MENSUALITE", precision = 15, scale = 2) private BigDecimal mensualite;
    @Column(name = "APPORT_PERSONNEL", precision = 15, scale = 2) private BigDecimal apportPersonnel;
    @Column(name = "VALEUR_BIEN", precision = 15, scale = 2) private BigDecimal valeurBien;
    @Column(name = "TYPE_BIEN") @Enumerated(EnumType.STRING) private TypeBien typeBien;
    @Column(name = "STATUT") @Enumerated(EnumType.STRING) private StatutCredit statut;
    @Column(name = "SCORE_CREDIT") private Integer scoreCredit;
    @Column(name = "DATE_DEMANDE") @Temporal(TemporalType.TIMESTAMP) private Date dateDemande;
    @Column(name = "DATE_DECISION") @Temporal(TemporalType.TIMESTAMP) private Date dateDecision;
    @Column(name = "DATE_DECAISSEMENT") @Temporal(TemporalType.TIMESTAMP) private Date dateDecaissement;
    @Column(name = "TAUX_ENDETTEMENT", precision = 5, scale = 2) private BigDecimal tauxEndettement;

    @OneToMany(mappedBy = "credit", cascade = CascadeType.ALL)
    private List<EcheanceEntity> echeances;

    // Getters/Setters
    public Long getId() { return id; }
    public String getReferenceDossier() { return referenceDossier; }
    public void setReferenceDossier(String r) { this.referenceDossier = r; }
    public BigDecimal getMontantEmprunte() { return montantEmprunte; }
    public void setMontantEmprunte(BigDecimal m) { this.montantEmprunte = m; }
    public BigDecimal getTauxInteret() { return tauxInteret; }
    public void setTauxInteret(BigDecimal t) { this.tauxInteret = t; }
    public Integer getDureeMois() { return dureeMois; }
    public void setDureeMois(Integer d) { this.dureeMois = d; }
    public BigDecimal getMensualite() { return mensualite; }
    public void setMensualite(BigDecimal m) { this.mensualite = m; }
    public StatutCredit getStatut() { return statut; }
    public void setStatut(StatutCredit s) { this.statut = s; }
    public Integer getScoreCredit() { return scoreCredit; }
    public void setScoreCredit(Integer s) { this.scoreCredit = s; }
    public BigDecimal getTauxEndettement() { return tauxEndettement; }
    public void setTauxEndettement(BigDecimal t) { this.tauxEndettement = t; }
    public void setClientId(Long c) { this.clientId = c; }
    public void setApportPersonnel(BigDecimal a) { this.apportPersonnel = a; }
    public void setValeurBien(BigDecimal v) { this.valeurBien = v; }
    public void setTypeBien(TypeBien t) { this.typeBien = t; }
    public void setDateDemande(Date d) { this.dateDemande = d; }
    public void setDateDecision(Date d) { this.dateDecision = d; }
    public void setDateDecaissement(Date d) { this.dateDecaissement = d; }
    public List<EcheanceEntity> getEcheances() { return echeances; }
}

enum TypeBien { APPARTEMENT, MAISON, TERRAIN, COMMERCIAL }
enum StatutCredit { SIMULATION, DEMANDE, ETUDE, APPROUVE, REFUSE, DECAISSE, EN_COURS, SOLDE }
`
    },
    {
      path: "EcheanceEntity.java",
      content: `package com.banque.credit.entity;

import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;

@Entity
@Table(name = "ECHEANCE")
public class EcheanceEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CREDIT_ID")
    private CreditImmobilierEntity credit;

    @Column(name = "NUMERO_ECHEANCE") private Integer numeroEcheance;
    @Column(name = "DATE_ECHEANCE") @Temporal(TemporalType.DATE) private Date dateEcheance;
    @Column(name = "MONTANT_PRINCIPAL", precision = 15, scale = 2) private BigDecimal montantPrincipal;
    @Column(name = "MONTANT_INTERET", precision = 15, scale = 2) private BigDecimal montantInteret;
    @Column(name = "MONTANT_ASSURANCE", precision = 15, scale = 2) private BigDecimal montantAssurance;
    @Column(name = "MONTANT_TOTAL", precision = 15, scale = 2) private BigDecimal montantTotal;
    @Column(name = "CAPITAL_RESTANT", precision = 15, scale = 2) private BigDecimal capitalRestant;
    @Column(name = "STATUT") @Enumerated(EnumType.STRING) private StatutEcheance statut;
    @Column(name = "DATE_PAIEMENT") @Temporal(TemporalType.DATE) private Date datePaiement;

    public Long getId() { return id; }
    public Integer getNumeroEcheance() { return numeroEcheance; }
    public void setNumeroEcheance(Integer n) { this.numeroEcheance = n; }
    public Date getDateEcheance() { return dateEcheance; }
    public void setDateEcheance(Date d) { this.dateEcheance = d; }
    public BigDecimal getMontantPrincipal() { return montantPrincipal; }
    public void setMontantPrincipal(BigDecimal m) { this.montantPrincipal = m; }
    public BigDecimal getMontantInteret() { return montantInteret; }
    public void setMontantInteret(BigDecimal m) { this.montantInteret = m; }
    public BigDecimal getMontantTotal() { return montantTotal; }
    public void setMontantTotal(BigDecimal m) { this.montantTotal = m; }
    public BigDecimal getCapitalRestant() { return capitalRestant; }
    public void setCapitalRestant(BigDecimal c) { this.capitalRestant = c; }
    public StatutEcheance getStatut() { return statut; }
    public void setStatut(StatutEcheance s) { this.statut = s; }
    public void setCredit(CreditImmobilierEntity c) { this.credit = c; }
    public void setMontantAssurance(BigDecimal m) { this.montantAssurance = m; }
    public void setDatePaiement(Date d) { this.datePaiement = d; }
}

enum StatutEcheance { A_VENIR, PAYEE, EN_RETARD, IMPAYEE }
`
    },
    {
      path: "CreditServiceBean.java",
      content: `package com.banque.credit.ejb;

import com.banque.credit.entity.*;
import javax.ejb.*;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.*;

@Stateless
public class CreditServiceBean implements CreditServiceRemote {

    @PersistenceContext(unitName = "creditPU")
    private EntityManager em;

    @EJB
    private ScoringServiceBean scoringService;

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public CreditImmobilierEntity simulerCredit(Long clientId, BigDecimal montant, Integer dureeMois,
                                                 BigDecimal tauxInteret, BigDecimal apport, BigDecimal valeurBien) {
        CreditImmobilierEntity credit = new CreditImmobilierEntity();
        credit.setClientId(clientId);
        credit.setMontantEmprunte(montant);
        credit.setDureeMois(dureeMois);
        credit.setTauxInteret(tauxInteret);
        credit.setApportPersonnel(apport);
        credit.setValeurBien(valeurBien);
        credit.setStatut(StatutCredit.SIMULATION);
        credit.setDateDemande(new Date());

        // Calcul de la mensualité (formule d'amortissement)
        BigDecimal mensualite = calculerMensualite(montant, tauxInteret, dureeMois);
        credit.setMensualite(mensualite);

        return credit;
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public CreditImmobilierEntity deposerDemande(CreditImmobilierEntity simulation) {
        simulation.setStatut(StatutCredit.DEMANDE);
        simulation.setReferenceDossier(genererReference());
        simulation.setDateDemande(new Date());

        // Scoring automatique
        int score = scoringService.calculerScore(simulation.getClientId(), simulation.getMontantEmprunte());
        simulation.setScoreCredit(score);

        // Calcul taux d'endettement
        BigDecimal tauxEndettement = scoringService.calculerTauxEndettement(
            simulation.getClientId(), simulation.getMensualite());
        simulation.setTauxEndettement(tauxEndettement);

        em.persist(simulation);
        return simulation;
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void prendreDecision(String referenceDossier, boolean approuve, String motif) {
        CreditImmobilierEntity credit = findByReference(referenceDossier);
        credit.setDateDecision(new Date());

        if (approuve && credit.getScoreCredit() >= 500 &&
            credit.getTauxEndettement().compareTo(new BigDecimal("0.35")) <= 0) {
            credit.setStatut(StatutCredit.APPROUVE);
            genererEcheancier(credit);
        } else {
            credit.setStatut(StatutCredit.REFUSE);
        }
        em.merge(credit);
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void decaisser(String referenceDossier) {
        CreditImmobilierEntity credit = findByReference(referenceDossier);
        if (credit.getStatut() != StatutCredit.APPROUVE) {
            throw new CreditNonApprouveException("Le crédit doit être approuvé avant décaissement");
        }
        credit.setStatut(StatutCredit.DECAISSE);
        credit.setDateDecaissement(new Date());
        em.merge(credit);
    }

    @Override
    public List<EcheanceEntity> consulterEcheancier(String referenceDossier) {
        CreditImmobilierEntity credit = findByReference(referenceDossier);
        return credit.getEcheances();
    }

    @Override
    public CreditImmobilierEntity consulterDossier(String referenceDossier) {
        return findByReference(referenceDossier);
    }

    private void genererEcheancier(CreditImmobilierEntity credit) {
        BigDecimal capitalRestant = credit.getMontantEmprunte();
        BigDecimal tauxMensuel = credit.getTauxInteret().divide(new BigDecimal("12"), 10, RoundingMode.HALF_UP);
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.MONTH, 1);

        List<EcheanceEntity> echeances = new ArrayList<>();
        for (int i = 1; i <= credit.getDureeMois(); i++) {
            EcheanceEntity ech = new EcheanceEntity();
            ech.setCredit(credit);
            ech.setNumeroEcheance(i);
            ech.setDateEcheance(cal.getTime());

            BigDecimal interet = capitalRestant.multiply(tauxMensuel).setScale(2, RoundingMode.HALF_UP);
            BigDecimal principal = credit.getMensualite().subtract(interet);
            capitalRestant = capitalRestant.subtract(principal);

            ech.setMontantInteret(interet);
            ech.setMontantPrincipal(principal);
            ech.setMontantAssurance(new BigDecimal("35.00"));
            ech.setMontantTotal(credit.getMensualite().add(new BigDecimal("35.00")));
            ech.setCapitalRestant(capitalRestant.max(BigDecimal.ZERO));
            ech.setStatut(StatutEcheance.A_VENIR);

            echeances.add(ech);
            em.persist(ech);
            cal.add(Calendar.MONTH, 1);
        }
    }

    private BigDecimal calculerMensualite(BigDecimal capital, BigDecimal tauxAnnuel, int dureeMois) {
        BigDecimal tauxMensuel = tauxAnnuel.divide(new BigDecimal("12"), 10, RoundingMode.HALF_UP);
        BigDecimal facteur = BigDecimal.ONE.add(tauxMensuel).pow(dureeMois);
        return capital.multiply(tauxMensuel).multiply(facteur)
                      .divide(facteur.subtract(BigDecimal.ONE), 2, RoundingMode.HALF_UP);
    }

    private CreditImmobilierEntity findByReference(String ref) {
        return em.createQuery("SELECT c FROM CreditImmobilierEntity c WHERE c.referenceDossier = :ref",
                             CreditImmobilierEntity.class)
                 .setParameter("ref", ref).getSingleResult();
    }

    private String genererReference() {
        return "CRD-" + System.currentTimeMillis();
    }
}
`
    },
    {
      path: "ScoringServiceBean.java",
      content: `package com.banque.credit.ejb;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.*;

@Stateless
public class ScoringServiceBean {

    @PersistenceContext(unitName = "creditPU")
    private EntityManager em;

    public int calculerScore(Long clientId, BigDecimal montantDemande) {
        int score = 500; // Score de base

        // Ancienneté client
        Long anciennete = getAncienneteClient(clientId);
        if (anciennete > 5) score += 100;
        else if (anciennete > 2) score += 50;

        // Historique incidents
        int incidents = getNombreIncidents(clientId);
        score -= incidents * 50;

        // Ratio montant/revenus
        BigDecimal revenus = getRevenusMensuels(clientId);
        if (revenus.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal ratio = montantDemande.divide(revenus.multiply(new BigDecimal("12")), 2, RoundingMode.HALF_UP);
            if (ratio.compareTo(new BigDecimal("3")) <= 0) score += 80;
            else if (ratio.compareTo(new BigDecimal("5")) <= 0) score += 40;
            else score -= 50;
        }

        return Math.max(0, Math.min(1000, score));
    }

    public BigDecimal calculerTauxEndettement(Long clientId, BigDecimal mensualiteNouvelle) {
        BigDecimal revenus = getRevenusMensuels(clientId);
        BigDecimal chargesExistantes = getChargesMensuelles(clientId);
        BigDecimal totalCharges = chargesExistantes.add(mensualiteNouvelle);
        return totalCharges.divide(revenus, 4, RoundingMode.HALF_UP);
    }

    private Long getAncienneteClient(Long clientId) {
        try {
            return (Long) em.createNativeQuery(
                "SELECT TIMESTAMPDIFF(YEAR, date_creation, NOW()) FROM CLIENT WHERE id = ?1")
                .setParameter(1, clientId).getSingleResult();
        } catch (Exception e) { return 0L; }
    }

    private int getNombreIncidents(Long clientId) {
        try {
            return ((Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM INCIDENT_PAIEMENT WHERE client_id = ?1 AND date_incident > DATE_SUB(NOW(), INTERVAL 3 YEAR)")
                .setParameter(1, clientId).getSingleResult()).intValue();
        } catch (Exception e) { return 0; }
    }

    private BigDecimal getRevenusMensuels(Long clientId) {
        try {
            return (BigDecimal) em.createNativeQuery(
                "SELECT revenu_mensuel FROM CLIENT WHERE id = ?1")
                .setParameter(1, clientId).getSingleResult();
        } catch (Exception e) { return new BigDecimal("3000"); }
    }

    private BigDecimal getChargesMensuelles(Long clientId) {
        try {
            return (BigDecimal) em.createNativeQuery(
                "SELECT COALESCE(SUM(mensualite), 0) FROM CREDIT_IMMOBILIER WHERE client_id = ?1 AND statut = 'EN_COURS'")
                .setParameter(1, clientId).getSingleResult();
        } catch (Exception e) { return BigDecimal.ZERO; }
    }
}
`
    },
    {
      path: "CreditServiceRemote.java",
      content: `package com.banque.credit.ejb;

import com.banque.credit.entity.*;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.List;

@Remote
public interface CreditServiceRemote {
    CreditImmobilierEntity simulerCredit(Long clientId, BigDecimal montant, Integer dureeMois,
                                          BigDecimal tauxInteret, BigDecimal apport, BigDecimal valeurBien);
    CreditImmobilierEntity deposerDemande(CreditImmobilierEntity simulation);
    void prendreDecision(String referenceDossier, boolean approuve, String motif);
    void decaisser(String referenceDossier);
    List<EcheanceEntity> consulterEcheancier(String referenceDossier);
    CreditImmobilierEntity consulterDossier(String referenceDossier);
}
`
    }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROJETS 4-10 : Création rapide avec des domaines bancaires variés
// ═══════════════════════════════════════════════════════════════════════════════

const projet4: BankingProject = {
  name: "proj-04-kyc-conformite",
  description: "Module KYC et conformité — vérification d'identité, scoring risque, alertes LCB-FT",
  domain: "KYC & Conformité LCB-FT",
  files: [
    { path: "ClientKYCEntity.java", content: `package com.banque.kyc.entity;
import javax.persistence.*;
import java.util.Date;
@Entity @Table(name = "CLIENT_KYC")
public class ClientKYCEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) private Long id;
    @Column(name = "CLIENT_ID") private Long clientId;
    @Column(name = "NOM") private String nom;
    @Column(name = "PRENOM") private String prenom;
    @Column(name = "DATE_NAISSANCE") @Temporal(TemporalType.DATE) private Date dateNaissance;
    @Column(name = "NUMERO_IDENTITE") private String numeroIdentite;
    @Column(name = "TYPE_PIECE") @Enumerated(EnumType.STRING) private TypePiece typePiece;
    @Column(name = "NATIONALITE") private String nationalite;
    @Column(name = "ADRESSE") private String adresse;
    @Column(name = "PROFESSION") private String profession;
    @Column(name = "REVENU_ANNUEL", precision = 15, scale = 2) private java.math.BigDecimal revenuAnnuel;
    @Column(name = "NIVEAU_RISQUE") @Enumerated(EnumType.STRING) private NiveauRisque niveauRisque;
    @Column(name = "STATUT_KYC") @Enumerated(EnumType.STRING) private StatutKYC statutKYC;
    @Column(name = "DATE_VERIFICATION") @Temporal(TemporalType.TIMESTAMP) private Date dateVerification;
    @Column(name = "DATE_EXPIRATION_PIECE") @Temporal(TemporalType.DATE) private Date dateExpirationPiece;
    @Column(name = "PPE") private Boolean personneExposee;
    @Column(name = "PAYS_RESIDENCE") private String paysResidence;
    // Getters/Setters
    public Long getId() { return id; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long c) { this.clientId = c; }
    public String getNom() { return nom; }
    public void setNom(String n) { this.nom = n; }
    public NiveauRisque getNiveauRisque() { return niveauRisque; }
    public void setNiveauRisque(NiveauRisque n) { this.niveauRisque = n; }
    public StatutKYC getStatutKYC() { return statutKYC; }
    public void setStatutKYC(StatutKYC s) { this.statutKYC = s; }
    public Boolean getPersonneExposee() { return personneExposee; }
    public void setPersonneExposee(Boolean p) { this.personneExposee = p; }
    public void setDateVerification(Date d) { this.dateVerification = d; }
    public String getPaysResidence() { return paysResidence; }
    public void setPaysResidence(String p) { this.paysResidence = p; }
}
enum TypePiece { CIN, PASSEPORT, CARTE_SEJOUR, PERMIS_CONDUIRE }
enum NiveauRisque { FAIBLE, MOYEN, ELEVE, TRES_ELEVE }
enum StatutKYC { EN_ATTENTE, VALIDE, EXPIRE, REFUSE, REVUE_NECESSAIRE }` },
    { path: "AlerteLCBFTEntity.java", content: `package com.banque.kyc.entity;
import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;
@Entity @Table(name = "ALERTE_LCBFT")
public class AlerteLCBFTEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) private Long id;
    @Column(name = "CLIENT_ID") private Long clientId;
    @Column(name = "TYPE_ALERTE") @Enumerated(EnumType.STRING) private TypeAlerte typeAlerte;
    @Column(name = "DESCRIPTION", length = 500) private String description;
    @Column(name = "MONTANT_SUSPECT", precision = 15, scale = 2) private BigDecimal montantSuspect;
    @Column(name = "DATE_DETECTION") @Temporal(TemporalType.TIMESTAMP) private Date dateDetection;
    @Column(name = "STATUT") @Enumerated(EnumType.STRING) private StatutAlerte statut;
    @Column(name = "ANALYSTE_ASSIGNE") private String analysteAssigne;
    @Column(name = "DECISION") private String decision;
    @Column(name = "DATE_CLOTURE") @Temporal(TemporalType.TIMESTAMP) private Date dateCloture;
    public Long getId() { return id; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long c) { this.clientId = c; }
    public TypeAlerte getTypeAlerte() { return typeAlerte; }
    public void setTypeAlerte(TypeAlerte t) { this.typeAlerte = t; }
    public BigDecimal getMontantSuspect() { return montantSuspect; }
    public void setMontantSuspect(BigDecimal m) { this.montantSuspect = m; }
    public StatutAlerte getStatut() { return statut; }
    public void setStatut(StatutAlerte s) { this.statut = s; }
    public void setDateDetection(Date d) { this.dateDetection = d; }
    public void setDescription(String d) { this.description = d; }
}
enum TypeAlerte { TRANSACTION_SUSPECTE, PAYS_RISQUE, FRACTIONNEMENT, PPE, LISTE_NOIRE }
enum StatutAlerte { OUVERTE, EN_ANALYSE, DECLAREE_TRACFIN, CLASSEE_SANS_SUITE }` },
    { path: "KYCServiceBean.java", content: `package com.banque.kyc.ejb;
import com.banque.kyc.entity.*;
import javax.ejb.*;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.util.*;
@Stateless
public class KYCServiceBean implements KYCServiceRemote {
    @PersistenceContext(unitName = "kycPU") private EntityManager em;

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public ClientKYCEntity enregistrerKYC(Long clientId, String nom, String prenom, String nationalite,
                                           String numeroIdentite, String typePiece, String paysResidence) {
        ClientKYCEntity kyc = new ClientKYCEntity();
        kyc.setClientId(clientId);
        kyc.setNom(nom);
        kyc.setStatutKYC(StatutKYC.EN_ATTENTE);
        kyc.setDateVerification(new Date());
        kyc.setPaysResidence(paysResidence);
        // Évaluation risque automatique
        NiveauRisque risque = evaluerRisque(nationalite, paysResidence, false);
        kyc.setNiveauRisque(risque);
        em.persist(kyc);
        return kyc;
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void validerKYC(Long kycId, boolean approuve) {
        ClientKYCEntity kyc = em.find(ClientKYCEntity.class, kycId);
        kyc.setStatutKYC(approuve ? StatutKYC.VALIDE : StatutKYC.REFUSE);
        kyc.setDateVerification(new Date());
        em.merge(kyc);
    }

    @Override
    public void detecterAnomalies(Long clientId, BigDecimal montantTransaction) {
        // Détection fractionnement
        if (montantTransaction.compareTo(new BigDecimal("9500")) > 0 &&
            montantTransaction.compareTo(new BigDecimal("10000")) < 0) {
            creerAlerte(clientId, TypeAlerte.FRACTIONNEMENT, montantTransaction,
                       "Transaction proche du seuil de déclaration");
        }
        // Détection montant inhabituel
        BigDecimal moyenneHabituelle = getMoyenneTransactions(clientId);
        if (montantTransaction.compareTo(moyenneHabituelle.multiply(new BigDecimal("5"))) > 0) {
            creerAlerte(clientId, TypeAlerte.TRANSACTION_SUSPECTE, montantTransaction,
                       "Montant 5x supérieur à la moyenne habituelle");
        }
    }

    @Override
    public List<AlerteLCBFTEntity> listerAlertes(StatutAlerte statut) {
        return em.createQuery("SELECT a FROM AlerteLCBFTEntity a WHERE a.statut = :statut ORDER BY a.dateDetection DESC",
                             AlerteLCBFTEntity.class)
                 .setParameter("statut", statut).getResultList();
    }

    @Override
    public void traiterAlerte(Long alerteId, String decision, String analyste) {
        AlerteLCBFTEntity alerte = em.find(AlerteLCBFTEntity.class, alerteId);
        alerte.setStatut("TRACFIN".equals(decision) ? StatutAlerte.DECLAREE_TRACFIN : StatutAlerte.CLASSEE_SANS_SUITE);
        em.merge(alerte);
    }

    private NiveauRisque evaluerRisque(String nationalite, String paysResidence, boolean ppe) {
        List<String> paysRisque = Arrays.asList("IR", "KP", "SY", "AF", "IQ");
        if (paysRisque.contains(nationalite) || paysRisque.contains(paysResidence)) return NiveauRisque.TRES_ELEVE;
        if (ppe) return NiveauRisque.ELEVE;
        return NiveauRisque.FAIBLE;
    }

    private void creerAlerte(Long clientId, TypeAlerte type, BigDecimal montant, String desc) {
        AlerteLCBFTEntity alerte = new AlerteLCBFTEntity();
        alerte.setClientId(clientId);
        alerte.setTypeAlerte(type);
        alerte.setMontantSuspect(montant);
        alerte.setDescription(desc);
        alerte.setDateDetection(new Date());
        alerte.setStatut(StatutAlerte.OUVERTE);
        em.persist(alerte);
    }

    private BigDecimal getMoyenneTransactions(Long clientId) {
        try {
            return (BigDecimal) em.createNativeQuery(
                "SELECT AVG(montant) FROM MOUVEMENT WHERE compte_id IN (SELECT id FROM COMPTE_BANCAIRE WHERE client_id = ?1) AND date_operation > DATE_SUB(NOW(), INTERVAL 6 MONTH)")
                .setParameter(1, clientId).getSingleResult();
        } catch (Exception e) { return new BigDecimal("1000"); }
    }
}` },
    { path: "KYCServiceRemote.java", content: `package com.banque.kyc.ejb;
import com.banque.kyc.entity.*;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.List;
@Remote
public interface KYCServiceRemote {
    ClientKYCEntity enregistrerKYC(Long clientId, String nom, String prenom, String nationalite,
                                    String numeroIdentite, String typePiece, String paysResidence);
    void validerKYC(Long kycId, boolean approuve);
    void detecterAnomalies(Long clientId, BigDecimal montantTransaction);
    List<AlerteLCBFTEntity> listerAlertes(StatutAlerte statut);
    void traiterAlerte(Long alerteId, String decision, String analyste);
}` },
    { path: "KYCServlet.java", content: `package com.banque.kyc.web;
import com.banque.kyc.ejb.KYCServiceRemote;
import com.banque.kyc.entity.*;
import javax.ejb.EJB;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.*;
import java.io.IOException;
import java.util.List;
@WebServlet(urlPatterns = {"/kyc/liste", "/kyc/detail", "/kyc/alertes", "/kyc/valider"})
public class KYCServlet extends HttpServlet {
    @EJB private KYCServiceRemote kycService;
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String path = req.getServletPath();
        if ("/kyc/alertes".equals(path)) {
            List<AlerteLCBFTEntity> alertes = kycService.listerAlertes(StatutAlerte.OUVERTE);
            req.setAttribute("alertes", alertes);
            req.getRequestDispatcher("/WEB-INF/jsp/kyc/alertes.jsp").forward(req, resp);
        }
    }
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        if ("/kyc/valider".equals(req.getServletPath())) {
            Long kycId = Long.parseLong(req.getParameter("kycId"));
            boolean approuve = "true".equals(req.getParameter("approuve"));
            kycService.validerKYC(kycId, approuve);
            resp.sendRedirect("/kyc/liste");
        }
    }
}` }
  ]
};

// Projets 5-10 (plus concis mais avec logique métier complète)
const projets5a10: BankingProject[] = [
  {
    name: "proj-05-carte-bancaire",
    description: "Gestion des cartes bancaires — émission, opposition, plafonds, transactions CB",
    domain: "Cartes Bancaires — Émission & Opposition",
    files: [
      { path: "CarteBancaireEntity.java", content: `package com.banque.carte.entity;
import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;
@Entity @Table(name = "CARTE_BANCAIRE")
public class CarteBancaireEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) private Long id;
    @Column(name = "NUMERO_CARTE", length = 16) private String numeroCarte;
    @Column(name = "COMPTE_ID") private Long compteId;
    @Column(name = "CLIENT_ID") private Long clientId;
    @Column(name = "TYPE_CARTE") @Enumerated(EnumType.STRING) private TypeCarte typeCarte;
    @Column(name = "STATUT") @Enumerated(EnumType.STRING) private StatutCarte statut;
    @Column(name = "DATE_EMISSION") @Temporal(TemporalType.DATE) private Date dateEmission;
    @Column(name = "DATE_EXPIRATION") @Temporal(TemporalType.DATE) private Date dateExpiration;
    @Column(name = "PLAFOND_RETRAIT", precision = 10, scale = 2) private BigDecimal plafondRetrait;
    @Column(name = "PLAFOND_PAIEMENT", precision = 10, scale = 2) private BigDecimal plafondPaiement;
    @Column(name = "CUMUL_RETRAIT_SEMAINE", precision = 10, scale = 2) private BigDecimal cumulRetraitSemaine;
    @Column(name = "CUMUL_PAIEMENT_MOIS", precision = 10, scale = 2) private BigDecimal cumulPaiementMois;
    @Column(name = "CODE_PIN_HASH") private String codePinHash;
    @Column(name = "TENTATIVES_PIN") private Integer tentativesPin;
    public Long getId() { return id; }
    public String getNumeroCarte() { return numeroCarte; }
    public void setNumeroCarte(String n) { this.numeroCarte = n; }
    public StatutCarte getStatut() { return statut; }
    public void setStatut(StatutCarte s) { this.statut = s; }
    public BigDecimal getPlafondRetrait() { return plafondRetrait; }
    public void setPlafondRetrait(BigDecimal p) { this.plafondRetrait = p; }
    public BigDecimal getPlafondPaiement() { return plafondPaiement; }
    public void setPlafondPaiement(BigDecimal p) { this.plafondPaiement = p; }
    public void setTypeCarte(TypeCarte t) { this.typeCarte = t; }
    public void setDateEmission(Date d) { this.dateEmission = d; }
    public void setDateExpiration(Date d) { this.dateExpiration = d; }
    public void setCompteId(Long c) { this.compteId = c; }
    public void setClientId(Long c) { this.clientId = c; }
    public Integer getTentativesPin() { return tentativesPin; }
    public void setTentativesPin(Integer t) { this.tentativesPin = t; }
}
enum TypeCarte { VISA_CLASSIC, VISA_GOLD, VISA_PLATINUM, MASTERCARD_STANDARD, MASTERCARD_GOLD }
enum StatutCarte { ACTIVE, BLOQUEE, OPPOSEE, EXPIREE, EN_FABRICATION }` },
      { path: "CarteServiceBean.java", content: `package com.banque.carte.ejb;
import com.banque.carte.entity.*;
import javax.ejb.*;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.util.*;
@Stateless
public class CarteServiceBean implements CarteServiceRemote {
    @PersistenceContext(unitName = "cartePU") private EntityManager em;

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public CarteBancaireEntity emettreNouvelleCarte(Long clientId, Long compteId, String typeCarte) {
        CarteBancaireEntity carte = new CarteBancaireEntity();
        carte.setClientId(clientId);
        carte.setCompteId(compteId);
        carte.setNumeroCarte(genererNumeroCarte());
        carte.setTypeCarte(TypeCarte.valueOf(typeCarte));
        carte.setStatut(StatutCarte.EN_FABRICATION);
        carte.setDateEmission(new Date());
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.YEAR, 3);
        carte.setDateExpiration(cal.getTime());
        carte.setPlafondRetrait(getPlafondDefaut(TypeCarte.valueOf(typeCarte), "RETRAIT"));
        carte.setPlafondPaiement(getPlafondDefaut(TypeCarte.valueOf(typeCarte), "PAIEMENT"));
        carte.setTentativesPin(0);
        em.persist(carte);
        return carte;
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void opposerCarte(String numeroCarte, String motif) {
        CarteBancaireEntity carte = findByNumero(numeroCarte);
        carte.setStatut(StatutCarte.OPPOSEE);
        em.merge(carte);
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public boolean autoriserTransaction(String numeroCarte, BigDecimal montant, String typeTransaction) {
        CarteBancaireEntity carte = findByNumero(numeroCarte);
        if (carte.getStatut() != StatutCarte.ACTIVE) return false;
        if (carte.getTentativesPin() >= 3) { carte.setStatut(StatutCarte.BLOQUEE); em.merge(carte); return false; }
        if ("RETRAIT".equals(typeTransaction) && montant.compareTo(carte.getPlafondRetrait()) > 0) return false;
        if ("PAIEMENT".equals(typeTransaction) && montant.compareTo(carte.getPlafondPaiement()) > 0) return false;
        return true;
    }

    @Override
    public void modifierPlafonds(String numeroCarte, BigDecimal plafondRetrait, BigDecimal plafondPaiement) {
        CarteBancaireEntity carte = findByNumero(numeroCarte);
        carte.setPlafondRetrait(plafondRetrait);
        carte.setPlafondPaiement(plafondPaiement);
        em.merge(carte);
    }

    @Override
    public List<CarteBancaireEntity> listerCartesClient(Long clientId) {
        return em.createQuery("SELECT c FROM CarteBancaireEntity c WHERE c.clientId = :clientId", CarteBancaireEntity.class)
                 .setParameter("clientId", clientId).getResultList();
    }

    private CarteBancaireEntity findByNumero(String numero) {
        return em.createQuery("SELECT c FROM CarteBancaireEntity c WHERE c.numeroCarte = :num", CarteBancaireEntity.class)
                 .setParameter("num", numero).getSingleResult();
    }
    private String genererNumeroCarte() { return "4" + String.format("%015d", new Random().nextLong() & Long.MAX_VALUE).substring(0, 15); }
    private BigDecimal getPlafondDefaut(TypeCarte type, String cat) {
        if ("RETRAIT".equals(cat)) return type.name().contains("GOLD") ? new BigDecimal("1000") : new BigDecimal("500");
        return type.name().contains("GOLD") ? new BigDecimal("5000") : new BigDecimal("2000");
    }
}` },
      { path: "CarteServiceRemote.java", content: `package com.banque.carte.ejb;
import com.banque.carte.entity.CarteBancaireEntity;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.List;
@Remote
public interface CarteServiceRemote {
    CarteBancaireEntity emettreNouvelleCarte(Long clientId, Long compteId, String typeCarte);
    void opposerCarte(String numeroCarte, String motif);
    boolean autoriserTransaction(String numeroCarte, BigDecimal montant, String typeTransaction);
    void modifierPlafonds(String numeroCarte, BigDecimal plafondRetrait, BigDecimal plafondPaiement);
    List<CarteBancaireEntity> listerCartesClient(Long clientId);
}` }
    ]
  },
  {
    name: "proj-06-pret-consommation",
    description: "Gestion des prêts à la consommation — simulation, souscription, remboursement anticipé",
    domain: "Prêt Consommation — Simulation & Remboursement",
    files: [
      { path: "PretConsommationEntity.java", content: `package com.banque.pret.entity;
import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;
@Entity @Table(name = "PRET_CONSOMMATION")
public class PretConsommationEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) private Long id;
    @Column(name = "REFERENCE") private String reference;
    @Column(name = "CLIENT_ID") private Long clientId;
    @Column(name = "MONTANT", precision = 12, scale = 2) private BigDecimal montant;
    @Column(name = "TAUX", precision = 5, scale = 4) private BigDecimal taux;
    @Column(name = "DUREE_MOIS") private Integer dureeMois;
    @Column(name = "MENSUALITE", precision = 10, scale = 2) private BigDecimal mensualite;
    @Column(name = "OBJET") private String objet;
    @Column(name = "STATUT") @Enumerated(EnumType.STRING) private StatutPret statut;
    @Column(name = "DATE_SOUSCRIPTION") @Temporal(TemporalType.TIMESTAMP) private Date dateSouscription;
    @Column(name = "CAPITAL_RESTANT", precision = 12, scale = 2) private BigDecimal capitalRestant;
    @Column(name = "PENALITE_RA", precision = 10, scale = 2) private BigDecimal penaliteRemboursementAnticipe;
    public Long getId() { return id; }
    public String getReference() { return reference; }
    public void setReference(String r) { this.reference = r; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal m) { this.montant = m; }
    public BigDecimal getTaux() { return taux; }
    public void setTaux(BigDecimal t) { this.taux = t; }
    public Integer getDureeMois() { return dureeMois; }
    public void setDureeMois(Integer d) { this.dureeMois = d; }
    public BigDecimal getMensualite() { return mensualite; }
    public void setMensualite(BigDecimal m) { this.mensualite = m; }
    public StatutPret getStatut() { return statut; }
    public void setStatut(StatutPret s) { this.statut = s; }
    public void setClientId(Long c) { this.clientId = c; }
    public void setObjet(String o) { this.objet = o; }
    public void setDateSouscription(Date d) { this.dateSouscription = d; }
    public BigDecimal getCapitalRestant() { return capitalRestant; }
    public void setCapitalRestant(BigDecimal c) { this.capitalRestant = c; }
    public void setPenaliteRemboursementAnticipe(BigDecimal p) { this.penaliteRemboursementAnticipe = p; }
}
enum StatutPret { SIMULATION, SOUSCRIT, EN_COURS, REMBOURSE, DEFAUT }` },
      { path: "PretServiceBean.java", content: `package com.banque.pret.ejb;
import com.banque.pret.entity.*;
import javax.ejb.*;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
@Stateless
public class PretServiceBean implements PretServiceRemote {
    @PersistenceContext(unitName = "pretPU") private EntityManager em;

    @Override
    public PretConsommationEntity simuler(BigDecimal montant, Integer dureeMois, BigDecimal taux) {
        PretConsommationEntity pret = new PretConsommationEntity();
        pret.setMontant(montant);
        pret.setDureeMois(dureeMois);
        pret.setTaux(taux);
        BigDecimal tauxM = taux.divide(new BigDecimal("12"), 10, RoundingMode.HALF_UP);
        BigDecimal facteur = BigDecimal.ONE.add(tauxM).pow(dureeMois);
        BigDecimal mensualite = montant.multiply(tauxM).multiply(facteur).divide(facteur.subtract(BigDecimal.ONE), 2, RoundingMode.HALF_UP);
        pret.setMensualite(mensualite);
        pret.setStatut(StatutPret.SIMULATION);
        return pret;
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public PretConsommationEntity souscrire(Long clientId, BigDecimal montant, Integer dureeMois, BigDecimal taux, String objet) {
        PretConsommationEntity pret = simuler(montant, dureeMois, taux);
        pret.setClientId(clientId);
        pret.setObjet(objet);
        pret.setReference("PRC-" + System.currentTimeMillis());
        pret.setStatut(StatutPret.SOUSCRIT);
        pret.setDateSouscription(new Date());
        pret.setCapitalRestant(montant);
        pret.setPenaliteRemboursementAnticipe(montant.multiply(new BigDecimal("0.03")));
        em.persist(pret);
        return pret;
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public BigDecimal rembourserAnticipe(String reference, BigDecimal montantRembourse) {
        PretConsommationEntity pret = findByRef(reference);
        BigDecimal penalite = pret.getCapitalRestant().multiply(new BigDecimal("0.01"));
        pret.setCapitalRestant(pret.getCapitalRestant().subtract(montantRembourse));
        if (pret.getCapitalRestant().compareTo(BigDecimal.ZERO) <= 0) {
            pret.setStatut(StatutPret.REMBOURSE);
            pret.setCapitalRestant(BigDecimal.ZERO);
        }
        em.merge(pret);
        return penalite;
    }

    @Override
    public List<PretConsommationEntity> listerPretsClient(Long clientId) {
        return em.createQuery("SELECT p FROM PretConsommationEntity p WHERE p.clientId = :cid", PretConsommationEntity.class)
                 .setParameter("cid", clientId).getResultList();
    }

    private PretConsommationEntity findByRef(String ref) {
        return em.createQuery("SELECT p FROM PretConsommationEntity p WHERE p.reference = :ref", PretConsommationEntity.class)
                 .setParameter("ref", ref).getSingleResult();
    }
}` },
      { path: "PretServiceRemote.java", content: `package com.banque.pret.ejb;
import com.banque.pret.entity.PretConsommationEntity;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.List;
@Remote
public interface PretServiceRemote {
    PretConsommationEntity simuler(BigDecimal montant, Integer dureeMois, BigDecimal taux);
    PretConsommationEntity souscrire(Long clientId, BigDecimal montant, Integer dureeMois, BigDecimal taux, String objet);
    BigDecimal rembourserAnticipe(String reference, BigDecimal montantRembourse);
    List<PretConsommationEntity> listerPretsClient(Long clientId);
}` }
    ]
  },
  {
    name: "proj-07-gestion-clients",
    description: "CRM bancaire — gestion des clients, segmentation, historique interactions, scoring commercial",
    domain: "CRM Bancaire — Gestion Clients & Segmentation",
    files: [
      { path: "ClientEntity.java", content: `package com.banque.crm.entity;
import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;
@Entity @Table(name = "CLIENT")
public class ClientEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) private Long id;
    @Column(name = "NUMERO_CLIENT", unique = true) private String numeroClient;
    @Column(name = "CIVILITE") private String civilite;
    @Column(name = "NOM") private String nom;
    @Column(name = "PRENOM") private String prenom;
    @Column(name = "EMAIL") private String email;
    @Column(name = "TELEPHONE") private String telephone;
    @Column(name = "DATE_NAISSANCE") @Temporal(TemporalType.DATE) private Date dateNaissance;
    @Column(name = "ADRESSE") private String adresse;
    @Column(name = "CODE_POSTAL") private String codePostal;
    @Column(name = "VILLE") private String ville;
    @Column(name = "SEGMENT") @Enumerated(EnumType.STRING) private SegmentClient segment;
    @Column(name = "CONSEILLER_ID") private Long conseillerId;
    @Column(name = "DATE_CREATION") @Temporal(TemporalType.TIMESTAMP) private Date dateCreation;
    @Column(name = "REVENU_MENSUEL", precision = 12, scale = 2) private BigDecimal revenuMensuel;
    @Column(name = "SCORE_COMMERCIAL") private Integer scoreCommercial;
    @Column(name = "ACTIF") private Boolean actif;
    public Long getId() { return id; }
    public String getNumeroClient() { return numeroClient; }
    public void setNumeroClient(String n) { this.numeroClient = n; }
    public String getNom() { return nom; }
    public void setNom(String n) { this.nom = n; }
    public String getPrenom() { return prenom; }
    public void setPrenom(String p) { this.prenom = p; }
    public String getEmail() { return email; }
    public void setEmail(String e) { this.email = e; }
    public SegmentClient getSegment() { return segment; }
    public void setSegment(SegmentClient s) { this.segment = s; }
    public Integer getScoreCommercial() { return scoreCommercial; }
    public void setScoreCommercial(Integer s) { this.scoreCommercial = s; }
    public void setCivilite(String c) { this.civilite = c; }
    public void setTelephone(String t) { this.telephone = t; }
    public void setAdresse(String a) { this.adresse = a; }
    public void setVille(String v) { this.ville = v; }
    public void setDateCreation(Date d) { this.dateCreation = d; }
    public void setRevenuMensuel(BigDecimal r) { this.revenuMensuel = r; }
    public void setActif(Boolean a) { this.actif = a; }
    public void setConseillerId(Long c) { this.conseillerId = c; }
    public BigDecimal getRevenuMensuel() { return revenuMensuel; }
}
enum SegmentClient { MASS_MARKET, AFFLUENT, PREMIUM, PRIVATE_BANKING, CORPORATE }` },
      { path: "ClientServiceBean.java", content: `package com.banque.crm.ejb;
import com.banque.crm.entity.*;
import javax.ejb.*;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.util.*;
@Stateless
public class ClientServiceBean implements ClientServiceRemote {
    @PersistenceContext(unitName = "crmPU") private EntityManager em;

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public ClientEntity creerClient(String civilite, String nom, String prenom, String email, String telephone, String adresse, String ville, BigDecimal revenuMensuel) {
        ClientEntity client = new ClientEntity();
        client.setNumeroClient("CLI-" + System.currentTimeMillis());
        client.setCivilite(civilite);
        client.setNom(nom);
        client.setPrenom(prenom);
        client.setEmail(email);
        client.setTelephone(telephone);
        client.setAdresse(adresse);
        client.setVille(ville);
        client.setRevenuMensuel(revenuMensuel);
        client.setDateCreation(new Date());
        client.setActif(true);
        client.setSegment(determinerSegment(revenuMensuel));
        client.setScoreCommercial(calculerScoreCommercial(client));
        em.persist(client);
        return client;
    }

    @Override
    public ClientEntity rechercherClient(String numeroClient) {
        return em.createQuery("SELECT c FROM ClientEntity c WHERE c.numeroClient = :num", ClientEntity.class)
                 .setParameter("num", numeroClient).getSingleResult();
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void mettreAJourClient(String numeroClient, String email, String telephone, String adresse) {
        ClientEntity client = rechercherClient(numeroClient);
        if (email != null) client.setEmail(email);
        if (telephone != null) client.setTelephone(telephone);
        if (adresse != null) client.setAdresse(adresse);
        em.merge(client);
    }

    @Override
    public List<ClientEntity> listerClientsParSegment(String segment) {
        return em.createQuery("SELECT c FROM ClientEntity c WHERE c.segment = :seg AND c.actif = true", ClientEntity.class)
                 .setParameter("seg", SegmentClient.valueOf(segment)).getResultList();
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void resegmenter(String numeroClient) {
        ClientEntity client = rechercherClient(numeroClient);
        client.setSegment(determinerSegment(client.getRevenuMensuel()));
        client.setScoreCommercial(calculerScoreCommercial(client));
        em.merge(client);
    }

    private SegmentClient determinerSegment(BigDecimal revenu) {
        if (revenu.compareTo(new BigDecimal("50000")) >= 0) return SegmentClient.PRIVATE_BANKING;
        if (revenu.compareTo(new BigDecimal("15000")) >= 0) return SegmentClient.PREMIUM;
        if (revenu.compareTo(new BigDecimal("5000")) >= 0) return SegmentClient.AFFLUENT;
        return SegmentClient.MASS_MARKET;
    }

    private int calculerScoreCommercial(ClientEntity client) {
        int score = 50;
        if (client.getRevenuMensuel().compareTo(new BigDecimal("10000")) > 0) score += 30;
        if (client.getEmail() != null) score += 10;
        return Math.min(100, score);
    }
}` },
      { path: "ClientServiceRemote.java", content: `package com.banque.crm.ejb;
import com.banque.crm.entity.ClientEntity;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.List;
@Remote
public interface ClientServiceRemote {
    ClientEntity creerClient(String civilite, String nom, String prenom, String email, String telephone, String adresse, String ville, BigDecimal revenuMensuel);
    ClientEntity rechercherClient(String numeroClient);
    void mettreAJourClient(String numeroClient, String email, String telephone, String adresse);
    List<ClientEntity> listerClientsParSegment(String segment);
    void resegmenter(String numeroClient);
}` }
    ]
  },
  {
    name: "proj-08-operations-change",
    description: "Opérations de change — achat/vente devises, cours en temps réel, historique opérations",
    domain: "Opérations de Change — Forex",
    files: [
      { path: "OperationChangeEntity.java", content: `package com.banque.change.entity;
import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;
@Entity @Table(name = "OPERATION_CHANGE")
public class OperationChangeEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) private Long id;
    @Column(name = "REFERENCE") private String reference;
    @Column(name = "CLIENT_ID") private Long clientId;
    @Column(name = "DEVISE_SOURCE", length = 3) private String deviseSource;
    @Column(name = "DEVISE_CIBLE", length = 3) private String deviseCible;
    @Column(name = "MONTANT_SOURCE", precision = 15, scale = 2) private BigDecimal montantSource;
    @Column(name = "MONTANT_CIBLE", precision = 15, scale = 2) private BigDecimal montantCible;
    @Column(name = "COURS_APPLIQUE", precision = 12, scale = 6) private BigDecimal coursApplique;
    @Column(name = "COMMISSION", precision = 10, scale = 2) private BigDecimal commission;
    @Column(name = "DATE_OPERATION") @Temporal(TemporalType.TIMESTAMP) private Date dateOperation;
    @Column(name = "TYPE_OPERATION") @Enumerated(EnumType.STRING) private TypeOperation typeOperation;
    public Long getId() { return id; }
    public void setReference(String r) { this.reference = r; }
    public void setClientId(Long c) { this.clientId = c; }
    public void setDeviseSource(String d) { this.deviseSource = d; }
    public void setDeviseCible(String d) { this.deviseCible = d; }
    public void setMontantSource(BigDecimal m) { this.montantSource = m; }
    public void setMontantCible(BigDecimal m) { this.montantCible = m; }
    public void setCoursApplique(BigDecimal c) { this.coursApplique = c; }
    public void setCommission(BigDecimal c) { this.commission = c; }
    public void setDateOperation(Date d) { this.dateOperation = d; }
    public void setTypeOperation(TypeOperation t) { this.typeOperation = t; }
    public BigDecimal getMontantSource() { return montantSource; }
    public BigDecimal getCoursApplique() { return coursApplique; }
}
enum TypeOperation { ACHAT, VENTE, SPOT, FORWARD }` },
      { path: "ChangeServiceBean.java", content: `package com.banque.change.ejb;
import com.banque.change.entity.*;
import javax.ejb.*;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
@Stateless
public class ChangeServiceBean implements ChangeServiceRemote {
    @PersistenceContext(unitName = "changePU") private EntityManager em;

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public OperationChangeEntity effectuerChange(Long clientId, String deviseSource, String deviseCible, BigDecimal montantSource, TypeOperation type) {
        BigDecimal cours = getCours(deviseSource, deviseCible);
        BigDecimal commission = calculerCommission(montantSource, type);
        BigDecimal montantNet = montantSource.subtract(commission);
        BigDecimal montantCible = montantNet.multiply(cours).setScale(2, RoundingMode.HALF_UP);

        OperationChangeEntity op = new OperationChangeEntity();
        op.setReference("CHG-" + System.currentTimeMillis());
        op.setClientId(clientId);
        op.setDeviseSource(deviseSource);
        op.setDeviseCible(deviseCible);
        op.setMontantSource(montantSource);
        op.setMontantCible(montantCible);
        op.setCoursApplique(cours);
        op.setCommission(commission);
        op.setDateOperation(new Date());
        op.setTypeOperation(type);
        em.persist(op);
        return op;
    }

    @Override
    public BigDecimal getCours(String deviseSource, String deviseCible) {
        // Simulation cours (en prod: appel service externe)
        Map<String, BigDecimal> cours = new HashMap<>();
        cours.put("EUR/USD", new BigDecimal("1.0850"));
        cours.put("EUR/GBP", new BigDecimal("0.8620"));
        cours.put("EUR/MAD", new BigDecimal("10.85"));
        cours.put("USD/MAD", new BigDecimal("10.00"));
        String key = deviseSource + "/" + deviseCible;
        return cours.getOrDefault(key, BigDecimal.ONE);
    }

    @Override
    public List<OperationChangeEntity> historique(Long clientId, Date debut, Date fin) {
        return em.createQuery("SELECT o FROM OperationChangeEntity o WHERE o.clientId = :cid AND o.dateOperation BETWEEN :d AND :f ORDER BY o.dateOperation DESC", OperationChangeEntity.class)
                 .setParameter("cid", clientId).setParameter("d", debut).setParameter("f", fin).getResultList();
    }

    private BigDecimal calculerCommission(BigDecimal montant, TypeOperation type) {
        BigDecimal taux = type == TypeOperation.SPOT ? new BigDecimal("0.002") : new BigDecimal("0.005");
        return montant.multiply(taux).setScale(2, RoundingMode.HALF_UP);
    }
}` },
      { path: "ChangeServiceRemote.java", content: `package com.banque.change.ejb;
import com.banque.change.entity.OperationChangeEntity;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;
@Remote
public interface ChangeServiceRemote {
    OperationChangeEntity effectuerChange(Long clientId, String deviseSource, String deviseCible, BigDecimal montantSource, TypeOperation type);
    BigDecimal getCours(String deviseSource, String deviseCible);
    List<OperationChangeEntity> historique(Long clientId, Date debut, Date fin);
}` }
    ]
  },
  {
    name: "proj-09-gab-distributeur",
    description: "Gestion des GAB/DAB — retrait, consultation, dépôt, gestion des incidents",
    domain: "GAB/DAB — Retrait & Dépôt Automatique",
    files: [
      { path: "TransactionGABEntity.java", content: `package com.banque.gab.entity;
import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;
@Entity @Table(name = "TRANSACTION_GAB")
public class TransactionGABEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) private Long id;
    @Column(name = "NUMERO_CARTE") private String numeroCarte;
    @Column(name = "CODE_GAB") private String codeGAB;
    @Column(name = "TYPE_TRANSACTION") @Enumerated(EnumType.STRING) private TypeTransactionGAB typeTransaction;
    @Column(name = "MONTANT", precision = 10, scale = 2) private BigDecimal montant;
    @Column(name = "STATUT") @Enumerated(EnumType.STRING) private StatutTransactionGAB statut;
    @Column(name = "DATE_TRANSACTION") @Temporal(TemporalType.TIMESTAMP) private Date dateTransaction;
    @Column(name = "CODE_ERREUR") private String codeErreur;
    @Column(name = "SOLDE_AVANT", precision = 15, scale = 2) private BigDecimal soldeAvant;
    @Column(name = "SOLDE_APRES", precision = 15, scale = 2) private BigDecimal soldeApres;
    public Long getId() { return id; }
    public void setNumeroCarte(String n) { this.numeroCarte = n; }
    public void setCodeGAB(String c) { this.codeGAB = c; }
    public void setTypeTransaction(TypeTransactionGAB t) { this.typeTransaction = t; }
    public void setMontant(BigDecimal m) { this.montant = m; }
    public void setStatut(StatutTransactionGAB s) { this.statut = s; }
    public void setDateTransaction(Date d) { this.dateTransaction = d; }
    public void setCodeErreur(String c) { this.codeErreur = c; }
    public void setSoldeAvant(BigDecimal s) { this.soldeAvant = s; }
    public void setSoldeApres(BigDecimal s) { this.soldeApres = s; }
    public StatutTransactionGAB getStatut() { return statut; }
    public BigDecimal getMontant() { return montant; }
}
enum TypeTransactionGAB { RETRAIT, DEPOT, CONSULTATION_SOLDE, MINI_RELEVE }
enum StatutTransactionGAB { REUSSIE, ECHOUEE, ANNULEE, CARTE_AVALEE }` },
      { path: "GABServiceBean.java", content: `package com.banque.gab.ejb;
import com.banque.gab.entity.*;
import javax.ejb.*;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.util.*;
@Stateless
public class GABServiceBean implements GABServiceRemote {
    @PersistenceContext(unitName = "gabPU") private EntityManager em;
    @EJB private CompteServiceRemote compteService;
    @EJB private CarteServiceRemote carteService;

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public TransactionGABEntity effectuerRetrait(String numeroCarte, String codeGAB, BigDecimal montant, String codePin) {
        TransactionGABEntity tx = new TransactionGABEntity();
        tx.setNumeroCarte(numeroCarte);
        tx.setCodeGAB(codeGAB);
        tx.setTypeTransaction(TypeTransactionGAB.RETRAIT);
        tx.setMontant(montant);
        tx.setDateTransaction(new Date());

        // Vérifier PIN
        if (!verifierPin(numeroCarte, codePin)) {
            tx.setStatut(StatutTransactionGAB.ECHOUEE);
            tx.setCodeErreur("PIN_INVALIDE");
            em.persist(tx);
            return tx;
        }

        // Vérifier autorisation
        if (!carteService.autoriserTransaction(numeroCarte, montant, "RETRAIT")) {
            tx.setStatut(StatutTransactionGAB.ECHOUEE);
            tx.setCodeErreur("PLAFOND_DEPASSE");
            em.persist(tx);
            return tx;
        }

        // Débiter le compte
        try {
            BigDecimal soldeAvant = compteService.getSoldeParCarte(numeroCarte);
            tx.setSoldeAvant(soldeAvant);
            compteService.debiterParCarte(numeroCarte, montant, "Retrait GAB " + codeGAB);
            tx.setSoldeApres(soldeAvant.subtract(montant));
            tx.setStatut(StatutTransactionGAB.REUSSIE);
        } catch (Exception e) {
            tx.setStatut(StatutTransactionGAB.ECHOUEE);
            tx.setCodeErreur("SOLDE_INSUFFISANT");
        }

        em.persist(tx);
        return tx;
    }

    @Override
    public BigDecimal consulterSolde(String numeroCarte, String codePin) {
        if (!verifierPin(numeroCarte, codePin)) throw new PinInvalideException("Code PIN incorrect");
        return compteService.getSoldeParCarte(numeroCarte);
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public TransactionGABEntity effectuerDepot(String numeroCarte, String codeGAB, BigDecimal montant) {
        TransactionGABEntity tx = new TransactionGABEntity();
        tx.setNumeroCarte(numeroCarte);
        tx.setCodeGAB(codeGAB);
        tx.setTypeTransaction(TypeTransactionGAB.DEPOT);
        tx.setMontant(montant);
        tx.setDateTransaction(new Date());
        compteService.crediterParCarte(numeroCarte, montant, "Dépôt GAB " + codeGAB);
        tx.setStatut(StatutTransactionGAB.REUSSIE);
        em.persist(tx);
        return tx;
    }

    @Override
    public List<TransactionGABEntity> historiqueGAB(String numeroCarte, int dernierN) {
        return em.createQuery("SELECT t FROM TransactionGABEntity t WHERE t.numeroCarte = :carte ORDER BY t.dateTransaction DESC", TransactionGABEntity.class)
                 .setParameter("carte", numeroCarte).setMaxResults(dernierN).getResultList();
    }

    private boolean verifierPin(String numeroCarte, String codePin) {
        // Simulation vérification PIN (en prod: HSM)
        return codePin != null && codePin.length() == 4;
    }
}` },
      { path: "GABServiceRemote.java", content: `package com.banque.gab.ejb;
import com.banque.gab.entity.TransactionGABEntity;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.List;
@Remote
public interface GABServiceRemote {
    TransactionGABEntity effectuerRetrait(String numeroCarte, String codeGAB, BigDecimal montant, String codePin);
    BigDecimal consulterSolde(String numeroCarte, String codePin);
    TransactionGABEntity effectuerDepot(String numeroCarte, String codeGAB, BigDecimal montant);
    List<TransactionGABEntity> historiqueGAB(String numeroCarte, int dernierN);
}` }
    ]
  },
  {
    name: "proj-10-reporting-reglementaire",
    description: "Reporting réglementaire — génération rapports BAM, BKAM, ratios prudentiels, déclarations FATCA/CRS",
    domain: "Reporting Réglementaire — BAM & FATCA",
    files: [
      { path: "RapportReglementaireEntity.java", content: `package com.banque.reporting.entity;
import javax.persistence.*;
import java.math.BigDecimal;
import java.util.Date;
@Entity @Table(name = "RAPPORT_REGLEMENTAIRE")
public class RapportReglementaireEntity {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) private Long id;
    @Column(name = "REFERENCE") private String reference;
    @Column(name = "TYPE_RAPPORT") @Enumerated(EnumType.STRING) private TypeRapport typeRapport;
    @Column(name = "PERIODE_DEBUT") @Temporal(TemporalType.DATE) private Date periodeDebut;
    @Column(name = "PERIODE_FIN") @Temporal(TemporalType.DATE) private Date periodeFin;
    @Column(name = "STATUT") @Enumerated(EnumType.STRING) private StatutRapport statut;
    @Column(name = "DATE_GENERATION") @Temporal(TemporalType.TIMESTAMP) private Date dateGeneration;
    @Column(name = "DATE_SOUMISSION") @Temporal(TemporalType.TIMESTAMP) private Date dateSoumission;
    @Column(name = "RATIO_SOLVABILITE", precision = 8, scale = 4) private BigDecimal ratioSolvabilite;
    @Column(name = "RATIO_LIQUIDITE", precision = 8, scale = 4) private BigDecimal ratioLiquidite;
    @Column(name = "TOTAL_ACTIFS", precision = 18, scale = 2) private BigDecimal totalActifs;
    @Column(name = "TOTAL_ENGAGEMENTS", precision = 18, scale = 2) private BigDecimal totalEngagements;
    @Column(name = "GENERATEUR") private String generateur;
    public Long getId() { return id; }
    public void setReference(String r) { this.reference = r; }
    public void setTypeRapport(TypeRapport t) { this.typeRapport = t; }
    public void setPeriodeDebut(Date d) { this.periodeDebut = d; }
    public void setPeriodeFin(Date d) { this.periodeFin = d; }
    public void setStatut(StatutRapport s) { this.statut = s; }
    public void setDateGeneration(Date d) { this.dateGeneration = d; }
    public void setRatioSolvabilite(BigDecimal r) { this.ratioSolvabilite = r; }
    public void setRatioLiquidite(BigDecimal r) { this.ratioLiquidite = r; }
    public void setTotalActifs(BigDecimal t) { this.totalActifs = t; }
    public void setTotalEngagements(BigDecimal t) { this.totalEngagements = t; }
    public StatutRapport getStatut() { return statut; }
    public TypeRapport getTypeRapport() { return typeRapport; }
}
enum TypeRapport { BILAN_BAM, RATIO_PRUDENTIEL, DECLARATION_FATCA, DECLARATION_CRS, RAPPORT_LCB, ETAT_GRANDS_RISQUES }
enum StatutRapport { EN_PREPARATION, GENERE, SOUMIS, VALIDE, REJETE }` },
      { path: "ReportingServiceBean.java", content: `package com.banque.reporting.ejb;
import com.banque.reporting.entity.*;
import javax.ejb.*;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
@Stateless
public class ReportingServiceBean implements ReportingServiceRemote {
    @PersistenceContext(unitName = "reportingPU") private EntityManager em;

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public RapportReglementaireEntity genererRapport(TypeRapport type, Date periodeDebut, Date periodeFin) {
        RapportReglementaireEntity rapport = new RapportReglementaireEntity();
        rapport.setReference("RPT-" + type.name() + "-" + System.currentTimeMillis());
        rapport.setTypeRapport(type);
        rapport.setPeriodeDebut(periodeDebut);
        rapport.setPeriodeFin(periodeFin);
        rapport.setStatut(StatutRapport.EN_PREPARATION);
        rapport.setDateGeneration(new Date());

        // Calculer les métriques selon le type
        switch (type) {
            case RATIO_PRUDENTIEL:
                BigDecimal actifs = calculerTotalActifs();
                BigDecimal engagements = calculerTotalEngagements();
                rapport.setTotalActifs(actifs);
                rapport.setTotalEngagements(engagements);
                rapport.setRatioSolvabilite(actifs.divide(engagements, 4, RoundingMode.HALF_UP));
                rapport.setRatioLiquidite(calculerRatioLiquidite());
                break;
            case BILAN_BAM:
                rapport.setTotalActifs(calculerTotalActifs());
                rapport.setTotalEngagements(calculerTotalEngagements());
                break;
            case DECLARATION_FATCA:
            case DECLARATION_CRS:
                // Extraction des comptes US/étrangers
                break;
        }

        rapport.setStatut(StatutRapport.GENERE);
        em.persist(rapport);
        return rapport;
    }

    @Override
    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void soumettre(String reference) {
        RapportReglementaireEntity rapport = findByRef(reference);
        if (rapport.getStatut() != StatutRapport.GENERE) throw new RapportNonPretException("Rapport non prêt");
        rapport.setStatut(StatutRapport.SOUMIS);
        em.merge(rapport);
    }

    @Override
    public List<RapportReglementaireEntity> listerRapports(TypeRapport type, Date depuis) {
        return em.createQuery("SELECT r FROM RapportReglementaireEntity r WHERE r.typeRapport = :type AND r.dateGeneration >= :depuis ORDER BY r.dateGeneration DESC", RapportReglementaireEntity.class)
                 .setParameter("type", type).setParameter("depuis", depuis).getResultList();
    }

    @Override
    public BigDecimal getRatioSolvabilite() {
        BigDecimal actifs = calculerTotalActifs();
        BigDecimal engagements = calculerTotalEngagements();
        return actifs.divide(engagements, 4, RoundingMode.HALF_UP);
    }

    private BigDecimal calculerTotalActifs() {
        try {
            return (BigDecimal) em.createNativeQuery("SELECT SUM(solde) FROM COMPTE_BANCAIRE WHERE statut = 'ACTIF'").getSingleResult();
        } catch (Exception e) { return new BigDecimal("1000000000"); }
    }

    private BigDecimal calculerTotalEngagements() {
        try {
            return (BigDecimal) em.createNativeQuery("SELECT SUM(capital_restant) FROM CREDIT_IMMOBILIER WHERE statut IN ('EN_COURS', 'DECAISSE')").getSingleResult();
        } catch (Exception e) { return new BigDecimal("800000000"); }
    }

    private BigDecimal calculerRatioLiquidite() {
        return new BigDecimal("1.25"); // Simplifié
    }

    private RapportReglementaireEntity findByRef(String ref) {
        return em.createQuery("SELECT r FROM RapportReglementaireEntity r WHERE r.reference = :ref", RapportReglementaireEntity.class)
                 .setParameter("ref", ref).getSingleResult();
    }
}` },
      { path: "ReportingServiceRemote.java", content: `package com.banque.reporting.ejb;
import com.banque.reporting.entity.*;
import javax.ejb.Remote;
import java.math.BigDecimal;
import java.util.Date;
import java.util.List;
@Remote
public interface ReportingServiceRemote {
    RapportReglementaireEntity genererRapport(TypeRapport type, Date periodeDebut, Date periodeFin);
    void soumettre(String reference);
    List<RapportReglementaireEntity> listerRapports(TypeRapport type, Date depuis);
    BigDecimal getRatioSolvabilite();
}` }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN — Créer tous les projets
// ═══════════════════════════════════════════════════════════════════════════════
function main() {
  fs.rmSync(BASE_DIR, { recursive: true, force: true });
  fs.mkdirSync(BASE_DIR, { recursive: true });

  const allProjects = [projet1, projet2, projet3, projet4, ...projets5a10];

  for (const project of allProjects) {
    createProject(project);
    console.log(`Created: ${project.name} (${project.files.length} files) — ${project.domain}`);
  }

  console.log(`\n=== ${allProjects.length} banking projects created in ${BASE_DIR} ===`);
}

main();
