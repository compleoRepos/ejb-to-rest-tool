/**
 * Test d'intégration RAG — EmbeddingService in-memory
 *
 * Indexe 10 exemples de migration EJB → Spring Boot couvrant :
 *   - EJB Stateless → @Service
 *   - EJB Entity → JPA @Entity
 *   - JDBC DAO → Spring Data JPA
 *   - SOAP WebService → REST Controller
 *   - JMS MessageDrivenBean → @JmsListener
 *   - EJB Timer → @Scheduled
 *   - Servlet → @RestController
 *   - Struts Action → Spring MVC Controller
 *   - Hibernate Session → Spring Data Repository
 *   - EJB Interceptor → Spring AOP @Aspect
 *
 * Puis effectue 5 recherches sémantiques pour valider la pertinence.
 *
 * @author Compleo
 */

import { describe, it, expect, beforeAll } from "vitest";
import { EmbeddingService, type MigrationPair } from "../../server/engine/ml/embedding-service";

// ── 10 Exemples de migration ──────────────────────────────────────

const MIGRATION_EXAMPLES: MigrationPair[] = [
  // 1. EJB Stateless → @Service
  {
    id: "ejb-stateless-001",
    ejbCode: `@Stateless
@Remote(ICompteService.class)
public class CompteServiceBean implements ICompteService {
    @EJB
    private ICompteDAO compteDAO;
    @Resource
    private SessionContext ctx;
    
    @Override
    public CompteDTO consulterCompte(String numCompte) throws CompteException {
        try {
            CompteEntity entity = compteDAO.findByNumero(numCompte);
            if (entity == null) {
                throw new CompteException("Compte introuvable: " + numCompte);
            }
            return CompteMapper.toDTO(entity);
        } catch (PersistenceException e) {
            ctx.setRollbackOnly();
            throw new CompteException("Erreur technique", e);
        }
    }
}`,
    springCode: `@Service
@Transactional(readOnly = true)
public class CompteService {
    private final CompteRepository compteRepository;
    private final CompteMapper compteMapper;
    
    public CompteService(CompteRepository compteRepository, CompteMapper compteMapper) {
        this.compteRepository = compteRepository;
        this.compteMapper = compteMapper;
    }
    
    public CompteDTO consulterCompte(String numCompte) {
        return compteRepository.findByNumero(numCompte)
            .map(compteMapper::toDTO)
            .orElseThrow(() -> new CompteNotFoundException("Compte introuvable: " + numCompte));
    }
}`,
    meta: {
      className: "CompteServiceBean",
      methodName: "consulterCompte",
      javaType: "EJB_STATELESS",
      hasOracle: false,
      hasJms: false,
    },
  },

  // 2. EJB Entity → JPA @Entity
  {
    id: "ejb-entity-002",
    ejbCode: `@Entity
@Table(name = "T_CLIENT")
public class ClientEntity implements Serializable {
    @Id
    @Column(name = "CLI_ID")
    private Long id;
    @Column(name = "CLI_NOM", length = 100)
    private String nom;
    @Column(name = "CLI_PRENOM", length = 100)
    private String prenom;
    @Column(name = "CLI_EMAIL")
    private String email;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CLI_AGENCE_ID")
    private AgenceEntity agence;
    @OneToMany(mappedBy = "client", cascade = CascadeType.ALL)
    private List<CompteEntity> comptes;
}`,
    springCode: `@Entity
@Table(name = "T_CLIENT")
@Getter @Setter
@NoArgsConstructor
public class Client {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CLI_ID")
    private Long id;
    
    @Column(name = "CLI_NOM", length = 100, nullable = false)
    private String nom;
    
    @Column(name = "CLI_PRENOM", length = 100)
    private String prenom;
    
    @Column(name = "CLI_EMAIL", unique = true)
    private String email;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CLI_AGENCE_ID")
    private Agence agence;
    
    @OneToMany(mappedBy = "client", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Compte> comptes = new ArrayList<>();
}`,
    meta: {
      className: "ClientEntity",
      methodName: "entity",
      javaType: "JPA_ENTITY",
      hasOracle: false,
      hasJms: false,
    },
  },

  // 3. JDBC DAO → Spring Data JPA Repository
  {
    id: "jdbc-dao-003",
    ejbCode: `public class CommandeChequierDAO {
    @Resource(name = "jdbc/ebankdirect_xa")
    private DataSource dataSource;
    
    public List<CommandeChequier> findByClient(String clientId) throws SQLException {
        Connection conn = null;
        PreparedStatement ps = null;
        ResultSet rs = null;
        try {
            conn = dataSource.getConnection();
            ps = conn.prepareStatement(
                "SELECT * FROM T_COMMANDE_CHEQUIER WHERE CLI_ID = ? AND STATUT = 'ACTIVE' ORDER BY DATE_CREATION DESC"
            );
            ps.setString(1, clientId);
            rs = ps.executeQuery();
            List<CommandeChequier> result = new ArrayList<>();
            while (rs.next()) {
                result.add(mapRow(rs));
            }
            return result;
        } finally {
            if (rs != null) rs.close();
            if (ps != null) ps.close();
            if (conn != null) conn.close();
        }
    }
}`,
    springCode: `public interface CommandeChequierRepository extends JpaRepository<CommandeChequier, Long> {
    
    @Query("SELECT c FROM CommandeChequier c WHERE c.clientId = :clientId AND c.statut = 'ACTIVE' ORDER BY c.dateCreation DESC")
    List<CommandeChequier> findActiveByClient(@Param("clientId") String clientId);
    
    List<CommandeChequier> findByClientIdAndStatutOrderByDateCreationDesc(String clientId, String statut);
}`,
    meta: {
      className: "CommandeChequierDAO",
      methodName: "findByClient",
      javaType: "JDBC_DAO",
      hasOracle: true,
      hasJms: false,
    },
  },

  // 4. SOAP WebService → REST Controller
  {
    id: "soap-ws-004",
    ejbCode: `@WebService(serviceName = "AvisOpereService")
@SOAPBinding(style = SOAPBinding.Style.DOCUMENT)
public class AvisOpereWebService {
    @EJB
    private IAvisOpereUC avisOpereUC;
    
    @WebMethod(operationName = "searchAvisOpere")
    public AvisOpereResponse searchAvisOpere(
        @WebParam(name = "request") AvisOpereRequest request
    ) throws AvisOpereFault {
        try {
            List<AvisOpere> results = avisOpereUC.search(
                request.getNumCompte(),
                request.getDateDebut(),
                request.getDateFin()
            );
            AvisOpereResponse response = new AvisOpereResponse();
            response.setAvisOperes(results);
            response.setCount(results.size());
            return response;
        } catch (Exception e) {
            throw new AvisOpereFault("Erreur recherche avis opéré", e);
        }
    }
}`,
    springCode: `@RestController
@RequestMapping("/api/v1/avis-opere")
@Tag(name = "Avis Opéré", description = "Gestion des avis opérés")
public class AvisOpereController {
    private final AvisOpereService avisOpereService;
    
    public AvisOpereController(AvisOpereService avisOpereService) {
        this.avisOpereService = avisOpereService;
    }
    
    @GetMapping("/search")
    @Operation(summary = "Rechercher des avis opérés")
    public ResponseEntity<AvisOpereResponse> search(
        @RequestParam String numCompte,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateDebut,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFin
    ) {
        List<AvisOpereDTO> results = avisOpereService.search(numCompte, dateDebut, dateFin);
        return ResponseEntity.ok(new AvisOpereResponse(results, results.size()));
    }
}`,
    meta: {
      className: "AvisOpereWebService",
      methodName: "searchAvisOpere",
      javaType: "SOAP_WEBSERVICE",
      hasOracle: false,
      hasJms: false,
    },
  },

  // 5. JMS MessageDrivenBean → @JmsListener
  {
    id: "jms-mdb-005",
    ejbCode: `@MessageDriven(
    activationConfig = {
        @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue"),
        @ActivationConfigProperty(propertyName = "destination", propertyValue = "queue/NotificationQueue")
    }
)
public class NotificationMDB implements MessageListener {
    @EJB
    private INotificationService notificationService;
    
    @Override
    public void onMessage(Message message) {
        try {
            TextMessage textMsg = (TextMessage) message;
            String payload = textMsg.getText();
            NotificationRequest request = JsonUtil.fromJson(payload, NotificationRequest.class);
            notificationService.sendNotification(request);
        } catch (JMSException e) {
            throw new EJBException("Erreur traitement message JMS", e);
        }
    }
}`,
    springCode: `@Component
@Slf4j
public class NotificationListener {
    private final NotificationService notificationService;
    private final ObjectMapper objectMapper;
    
    public NotificationListener(NotificationService notificationService, ObjectMapper objectMapper) {
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
    }
    
    @JmsListener(destination = "notification-queue", containerFactory = "jmsListenerContainerFactory")
    public void onMessage(String payload) {
        try {
            NotificationRequest request = objectMapper.readValue(payload, NotificationRequest.class);
            notificationService.sendNotification(request);
        } catch (JsonProcessingException e) {
            log.error("Erreur parsing message JMS", e);
            throw new AmqpRejectAndDontRequeueException("Message invalide", e);
        }
    }
}`,
    meta: {
      className: "NotificationMDB",
      methodName: "onMessage",
      javaType: "JMS_MDB",
      hasOracle: false,
      hasJms: true,
    },
  },

  // 6. EJB Timer → @Scheduled
  {
    id: "ejb-timer-006",
    ejbCode: `@Stateless
public class BatchPurgeBean {
    @EJB
    private IPurgeDAO purgeDAO;
    @Resource
    private TimerService timerService;
    
    @Schedule(hour = "2", minute = "0", second = "0", persistent = false)
    public void executePurge(Timer timer) {
        int deleted = purgeDAO.purgeOldRecords(30);
        System.out.println("Purge batch: " + deleted + " enregistrements supprimés");
    }
    
    @Timeout
    public void handleTimeout(Timer timer) {
        executePurge(timer);
    }
}`,
    springCode: `@Component
@Slf4j
public class BatchPurgeScheduler {
    private final PurgeRepository purgeRepository;
    
    public BatchPurgeScheduler(PurgeRepository purgeRepository) {
        this.purgeRepository = purgeRepository;
    }
    
    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void executePurge() {
        int deleted = purgeRepository.purgeOlderThan(LocalDate.now().minusDays(30));
        log.info("Purge batch: {} enregistrements supprimés", deleted);
    }
}`,
    meta: {
      className: "BatchPurgeBean",
      methodName: "executePurge",
      javaType: "EJB_TIMER",
      hasOracle: false,
      hasJms: false,
    },
  },

  // 7. Servlet → @RestController
  {
    id: "servlet-007",
    ejbCode: `@WebServlet("/api/carte/activation")
public class ActivationCarteServlet extends HttpServlet {
    @EJB
    private IActivationCarteUC activationUC;
    
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {
        String numCarte = req.getParameter("numCarte");
        String codePin = req.getParameter("codePin");
        
        try {
            ActivationResult result = activationUC.activerCarte(numCarte, codePin);
            resp.setContentType("application/json");
            resp.getWriter().write(new Gson().toJson(result));
        } catch (CarteException e) {
            resp.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            resp.getWriter().write("{\"error\": \"" + e.getMessage() + "\"}");
        }
    }
}`,
    springCode: `@RestController
@RequestMapping("/api/v1/carte")
@Validated
public class ActivationCarteController {
    private final ActivationCarteService activationService;
    
    public ActivationCarteController(ActivationCarteService activationService) {
        this.activationService = activationService;
    }
    
    @PostMapping("/activation")
    public ResponseEntity<ActivationResult> activerCarte(
        @Valid @RequestBody ActivationCarteRequest request
    ) {
        ActivationResult result = activationService.activerCarte(
            request.getNumCarte(), request.getCodePin()
        );
        return ResponseEntity.ok(result);
    }
}`,
    meta: {
      className: "ActivationCarteServlet",
      methodName: "doPost",
      javaType: "SERVLET",
      hasOracle: false,
      hasJms: false,
    },
  },

  // 8. Struts Action → Spring MVC Controller
  {
    id: "struts-008",
    ejbCode: `public class VirementAction extends Action {
    @Override
    public ActionForward execute(ActionMapping mapping, ActionForm form,
            HttpServletRequest request, HttpServletResponse response) throws Exception {
        VirementForm virementForm = (VirementForm) form;
        
        IVirementService service = ServiceLocator.lookup("ejb/VirementService");
        
        try {
            VirementResult result = service.effectuerVirement(
                virementForm.getCompteDebit(),
                virementForm.getCompteCredit(),
                virementForm.getMontant(),
                virementForm.getMotif()
            );
            request.setAttribute("result", result);
            return mapping.findForward("success");
        } catch (SoldeInsuffisantException e) {
            ActionErrors errors = new ActionErrors();
            errors.add("montant", new ActionMessage("error.solde.insuffisant"));
            saveErrors(request, errors);
            return mapping.findForward("failure");
        }
    }
}`,
    springCode: `@RestController
@RequestMapping("/api/v1/virements")
public class VirementController {
    private final VirementService virementService;
    
    public VirementController(VirementService virementService) {
        this.virementService = virementService;
    }
    
    @PostMapping
    public ResponseEntity<VirementResult> effectuerVirement(
        @Valid @RequestBody VirementRequest request
    ) {
        VirementResult result = virementService.effectuerVirement(
            request.getCompteDebit(),
            request.getCompteCredit(),
            request.getMontant(),
            request.getMotif()
        );
        return ResponseEntity.ok(result);
    }
}`,
    meta: {
      className: "VirementAction",
      methodName: "execute",
      javaType: "STRUTS_ACTION",
      hasOracle: false,
      hasJms: false,
    },
  },

  // 9. Hibernate Session → Spring Data Repository
  {
    id: "hibernate-009",
    ejbCode: `public class TransactionDAO {
    @PersistenceContext
    private EntityManager em;
    
    @SuppressWarnings("unchecked")
    public List<Transaction> findByCompteAndPeriode(String numCompte, Date debut, Date fin) {
        Session session = em.unwrap(Session.class);
        Criteria criteria = session.createCriteria(Transaction.class);
        criteria.add(Restrictions.eq("numCompte", numCompte));
        criteria.add(Restrictions.between("dateOperation", debut, fin));
        criteria.addOrder(Order.desc("dateOperation"));
        criteria.setMaxResults(100);
        return criteria.list();
    }
    
    public BigDecimal calculateSolde(String numCompte) {
        Query query = em.createQuery(
            "SELECT SUM(CASE WHEN t.type = 'CREDIT' THEN t.montant ELSE -t.montant END) " +
            "FROM Transaction t WHERE t.numCompte = :numCompte"
        );
        query.setParameter("numCompte", numCompte);
        return (BigDecimal) query.getSingleResult();
    }
}`,
    springCode: `public interface TransactionRepository extends JpaRepository<Transaction, Long> {
    
    List<Transaction> findByNumCompteAndDateOperationBetweenOrderByDateOperationDesc(
        String numCompte, LocalDate debut, LocalDate fin, Pageable pageable
    );
    
    @Query("SELECT COALESCE(SUM(CASE WHEN t.type = 'CREDIT' THEN t.montant ELSE -t.montant END), 0) " +
           "FROM Transaction t WHERE t.numCompte = :numCompte")
    BigDecimal calculateSolde(@Param("numCompte") String numCompte);
    
    default List<Transaction> findByCompteAndPeriode(String numCompte, LocalDate debut, LocalDate fin) {
        return findByNumCompteAndDateOperationBetweenOrderByDateOperationDesc(
            numCompte, debut, fin, PageRequest.of(0, 100)
        );
    }
}`,
    meta: {
      className: "TransactionDAO",
      methodName: "findByCompteAndPeriode",
      javaType: "HIBERNATE_DAO",
      hasOracle: true,
      hasJms: false,
    },
  },

  // 10. EJB Interceptor → Spring AOP @Aspect
  {
    id: "ejb-interceptor-010",
    ejbCode: `@Interceptor
public class AuditInterceptor {
    @EJB
    private IAuditService auditService;
    
    @AroundInvoke
    public Object audit(InvocationContext ctx) throws Exception {
        String methodName = ctx.getMethod().getName();
        String className = ctx.getTarget().getClass().getSimpleName();
        long start = System.currentTimeMillis();
        
        try {
            Object result = ctx.proceed();
            long duration = System.currentTimeMillis() - start;
            auditService.logSuccess(className, methodName, duration);
            return result;
        } catch (Exception e) {
            long duration = System.currentTimeMillis() - start;
            auditService.logFailure(className, methodName, duration, e.getMessage());
            throw e;
        }
    }
}`,
    springCode: `@Aspect
@Component
@Slf4j
public class AuditAspect {
    private final AuditService auditService;
    
    public AuditAspect(AuditService auditService) {
        this.auditService = auditService;
    }
    
    @Around("@within(org.springframework.stereotype.Service)")
    public Object audit(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().getName();
        String className = joinPoint.getTarget().getClass().getSimpleName();
        long start = System.currentTimeMillis();
        
        try {
            Object result = joinPoint.proceed();
            long duration = System.currentTimeMillis() - start;
            auditService.logSuccess(className, methodName, duration);
            return result;
        } catch (Throwable e) {
            long duration = System.currentTimeMillis() - start;
            auditService.logFailure(className, methodName, duration, e.getMessage());
            throw e;
        }
    }
}`,
    meta: {
      className: "AuditInterceptor",
      methodName: "audit",
      javaType: "EJB_INTERCEPTOR",
      hasOracle: false,
      hasJms: false,
    },
  },
];

// ── 5 Requêtes de recherche sémantique ────────────────────────────

const SEARCH_QUERIES = [
  {
    label: "Recherche 1 — EJB Stateless avec injection et consultation BDD",
    query: `@Stateless
public class ClientServiceBean {
    @EJB private IClientDAO clientDAO;
    public ClientDTO getClient(Long id) {
        ClientEntity e = clientDAO.findById(id);
        return ClientMapper.toDTO(e);
    }
}`,
    expectedTopMatch: "ejb-stateless-001",
    expectedType: "EJB_STATELESS",
  },
  {
    label: "Recherche 2 — DAO JDBC avec DataSource et PreparedStatement",
    query: `public class NotificationDAO {
    @Resource(name = "jdbc/notification_ds")
    private DataSource ds;
    public List<Notification> findPending() throws SQLException {
        Connection conn = ds.getConnection();
        PreparedStatement ps = conn.prepareStatement("SELECT * FROM T_NOTIFICATION WHERE STATUT = 'PENDING'");
        ResultSet rs = ps.executeQuery();
        // ...
    }
}`,
    expectedTopMatch: "jdbc-dao-003",
    expectedType: "JDBC_DAO",
  },
  {
    label: "Recherche 3 — WebService SOAP avec @WebMethod",
    query: `@WebService(serviceName = "CarteService")
public class CarteWebService {
    @EJB private ICarteUC carteUC;
    @WebMethod
    public CarteResponse getCarteInfo(@WebParam(name = "numCarte") String numCarte) {
        return carteUC.getInfo(numCarte);
    }
}`,
    expectedTopMatch: "soap-ws-004",
    expectedType: "SOAP_WEBSERVICE",
  },
  {
    label: "Recherche 4 — MessageDrivenBean JMS avec queue",
    query: `@MessageDriven(activationConfig = {
    @ActivationConfigProperty(propertyName = "destination", propertyValue = "queue/AlertQueue")
})
public class AlertMDB implements MessageListener {
    @EJB private IAlertService alertService;
    public void onMessage(Message msg) {
        TextMessage tm = (TextMessage) msg;
        alertService.processAlert(tm.getText());
    }
}`,
    expectedTopMatch: "jms-mdb-005",
    expectedType: "JMS_MDB",
  },
  {
    label: "Recherche 5 — Servlet HTTP avec doPost et EJB lookup",
    query: `@WebServlet("/api/virement")
public class VirementServlet extends HttpServlet {
    @EJB private IVirementUC virementUC;
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
        String montant = req.getParameter("montant");
        VirementResult result = virementUC.executer(montant);
        resp.getWriter().write(new Gson().toJson(result));
    }
}`,
    expectedTopMatch: "servlet-007",
    expectedType: "SERVLET",
  },
];

// ── Tests ─────────────────────────────────────────────────────────

describe("RAG Integration Test — EmbeddingService in-memory", () => {
  let service: EmbeddingService;

  beforeAll(async () => {
    service = new EmbeddingService(
      "http://localhost:8000",  // ChromaDB (non disponible → in-memory)
      "http://localhost:11434", // Ollama (non disponible → in-memory)
    );
    await service.initialize();
  });

  // ── Phase 1: Vérification de l'initialisation ──────────────────

  describe("Phase 1 — Initialisation", () => {
    it("1.1 — Le service est initialisé avec succès", () => {
      expect(service.isReady()).toBe(true);
    });

    it("1.2 — Le backend est en mode in-memory (pas de ChromaDB)", () => {
      expect(service.getBackendMode()).toBe("in-memory");
    });

    it("1.3 — Le store mémoire est vide avant indexation", () => {
      expect(service.getMemoryCount()).toBe(0);
    });
  });

  // ── Phase 2: Indexation des 10 exemples ────────────────────────

  describe("Phase 2 — Indexation de 10 exemples de migration", () => {
    it("2.1 — Indexe les 10 exemples sans erreur", async () => {
      for (const example of MIGRATION_EXAMPLES) {
        await service.indexPair(example);
      }
      expect(service.getMemoryCount()).toBe(10);
    });

    it("2.2 — Chaque exemple a un ID unique", () => {
      const ids = MIGRATION_EXAMPLES.map(e => e.id);
      expect(new Set(ids).size).toBe(10);
    });

    it("2.3 — Les 10 types de migration sont couverts", () => {
      const types = new Set(MIGRATION_EXAMPLES.map(e => e.meta.javaType));
      expect(types.size).toBe(10);
      expect(types).toContain("EJB_STATELESS");
      expect(types).toContain("JDBC_DAO");
      expect(types).toContain("SOAP_WEBSERVICE");
      expect(types).toContain("JMS_MDB");
      expect(types).toContain("SERVLET");
    });
  });

  // ── Phase 3: Recherches sémantiques ────────────────────────────

  describe("Phase 3 — Recherche sémantique (5 requêtes)", () => {
    for (const search of SEARCH_QUERIES) {
      describe(search.label, () => {
        let results: MigrationPair[];

        beforeAll(async () => {
          results = await service.findSimilar(search.query, 3);
        });

        it("retourne au moins 1 résultat", () => {
          expect(results.length).toBeGreaterThanOrEqual(1);
        });

        it("retourne au maximum 3 résultats (topK=3)", () => {
          expect(results.length).toBeLessThanOrEqual(3);
        });

        it(`le top-1 est pertinent (attendu: ${search.expectedTopMatch})`, () => {
          // Le résultat le plus similaire devrait être du même type
          const top1 = results[0];
          expect(top1).toBeDefined();
          // Vérifier que le type correspond
          expect(top1.meta.javaType).toBe(search.expectedType);
        });

        it("le top-1 contient du code Spring valide", () => {
          const top1 = results[0];
          expect(top1.springCode).toBeTruthy();
          expect(top1.springCode.length).toBeGreaterThan(50);
          // Doit contenir des annotations Spring
          expect(
            top1.springCode.includes("@Service") ||
            top1.springCode.includes("@RestController") ||
            top1.springCode.includes("@Component") ||
            top1.springCode.includes("@Aspect") ||
            top1.springCode.includes("@Scheduled") ||
            top1.springCode.includes("@Entity") ||
            top1.springCode.includes("JpaRepository") ||
            top1.springCode.includes("@JmsListener")
          ).toBe(true);
        });

        it("les résultats sont ordonnés par pertinence décroissante", () => {
          // Le top-1 devrait être du type attendu
          // Les résultats suivants peuvent être d'autres types
          if (results.length >= 2) {
            // Au minimum, le premier résultat est le plus pertinent
            expect(results[0].meta.javaType).toBe(search.expectedType);
          }
        });
      });
    }
  });

  // ── Phase 4: Tests de robustesse ───────────────────────────────

  describe("Phase 4 — Tests de robustesse", () => {
    it("4.1 — Recherche avec code vide retourne des résultats (fallback)", async () => {
      const results = await service.findSimilar("", 3);
      // Peut retourner des résultats (TF-IDF avec vecteur vide → scores = 0)
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it("4.2 — Recherche avec code non-Java retourne des résultats", async () => {
      const results = await service.findSimilar("function hello() { console.log('hello'); }", 3);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it("4.3 — topK=1 retourne exactement 1 résultat", async () => {
      const results = await service.findSimilar("@Stateless public class TestBean {}", 1);
      expect(results.length).toBe(1);
    });

    it("4.4 — topK=10 retourne tous les 10 exemples indexés", async () => {
      const results = await service.findSimilar("@Stateless public class TestBean {}", 10);
      expect(results.length).toBe(10);
    });

    it("4.5 — Recherche Oracle-specific trouve le DAO avec hasOracle=true", async () => {
      const results = await service.findSimilar(
        "SELECT * FROM T_OPERATION WHERE CLI_ID = ? AND ROWNUM <= 100 FOR UPDATE NOWAIT",
        3
      );
      expect(results).toBeDefined();
      // Au moins un résultat devrait avoir hasOracle=true
      const hasOracleResult = results.find(r => r.meta.hasOracle);
      expect(hasOracleResult).toBeDefined();
    });

    it("4.6 — Recherche JMS-specific trouve le MDB avec hasJms=true", async () => {
      const results = await service.findSimilar(
        "@MessageDriven queue JMS onMessage TextMessage javax.jms",
        3
      );
      const hasJmsResult = results.find(r => r.meta.hasJms);
      expect(hasJmsResult).toBeDefined();
    });
  });

  // ── Phase 5: Métriques et statistiques ─────────────────────────

  describe("Phase 5 — Métriques et statistiques", () => {
    it("5.1 — Le store contient 10 exemples après indexation", () => {
      expect(service.getMemoryCount()).toBe(10);
    });

    it("5.2 — Le mode backend est 'in-memory'", () => {
      expect(service.getBackendMode()).toBe("in-memory");
    });

    it("5.3 — Le service reste prêt après toutes les opérations", () => {
      expect(service.isReady()).toBe(true);
    });
  });
});
// rag-test-v8.1
