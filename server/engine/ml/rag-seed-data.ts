/**
 * RAG Seed Data — Exemples de migration réels extraits des projets bancaires BOA/BMCE.
 *
 * Chaque paire (legacy → modern) est un exemple concret de transformation
 * EJB/JDBC/SOAP/JPA → Spring Boot 3.x, extrait des projets :
 *   - avis-opere (SOAP + JPA + Docubase)
 *   - activation-carte (REST externe Magix + Auth token)
 *   - commander-chequier (JDBC raw + SOAP WS + Email)
 *   - mise-disposition (JDBC massif + Oracle procedures)
 *
 * Ces exemples alimentent le RAG in-memory (EmbeddingService) pour améliorer
 * la qualité des suggestions de migration du MLEnhancer.
 */

export interface RAGMigrationExample {
  id: string;
  category: string;
  description: string;
  legacy: string;
  modern: string;
  tags: string[];
}

export const RAG_SEED_EXAMPLES: RAGMigrationExample[] = [

  // ─── 1. EJB Stateless Bean → Spring Boot @RestController (avis-opere) ───
  {
    id: "avis-opere-ejb-bean",
    category: "EJB_STATELESS_BEAN",
    description: "EJB @Stateless Bean avec UCStrategie → Spring Boot @RestController",
    legacy: `@Stateless(name = "avisopereBean")
@Remote(SynchroneService.class)
public class avisopereBean extends UCStrategie {
    @Override
    public Envelope process(Envelope envelopeIn) throws Exception {
        Envelope envOut = null;
        try {
            EaiLog.initLogTraceInfos(envelopeIn);
            envOut = super.process(envelopeIn);
        } catch (Exception e) {
            EaiLog.error("Erreur Service : ", e);
            return CommonFunction.constructEnvWhenGlobalError(envelopeIn);
        }
        return envOut;
    }
}`,
    modern: `@RestController
@RequestMapping("/api/avis-opere")
@Slf4j
public class AvisOpereController {
    private final AvisOpereService avisOpereService;

    public AvisOpereController(AvisOpereService avisOpereService) {
        this.avisOpereService = avisOpereService;
    }

    @PostMapping("/process")
    public ResponseEntity<AvisOpereResponse> process(@Valid @RequestBody AvisOpereRequest request) {
        try {
            log.info("Processing avis-opere request");
            AvisOpereResponse response = avisOpereService.process(request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Erreur Service avis-opere", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(AvisOpereResponse.error(e.getMessage()));
        }
    }
}`,
    tags: ["EJB", "@Stateless", "UCStrategie", "Envelope", "SynchroneService", "@RestController", "Spring Boot"],
  },

  // ─── 2. UseCase avec @Autowired + JPA → Spring @Service (avis-opere) ───
  {
    id: "avis-opere-usecase-search",
    category: "USECASE_JPA_SERVICE",
    description: "UseCase @Transactional avec @Autowired services → Spring @Service",
    legacy: `@UseCase
@Transactional(readOnly = false, propagation = Propagation.REQUIRED, rollbackFor = FwkRollbackException.class)
public class SearchAvisOpereUC implements BaseUseCase {
    @Autowired
    private RepdematService repdematService;
    @Autowired
    private CallDocubase callDocubase;

    @Override
    public ValueObject execute(ValueObject in) throws FwkRollbackException {
        SearchAvisOpereVO avisVO = (SearchAvisOpereVO) in;
        String types = repdematService.getReqTypeAvis(avisVO.getCategorie());
        StringArray arrCompte = checkCompteLength(avisVO.getNumcompte(), avisVO.getComptes());
        StringArray arrType = typesCheck(avisVO.getCategorie(), avisVO.getTypeavis(), types);
        String DateDebutFormatted = CommonFunction.convertDateFormat(avisVO.getDated());
        String DateFinFormatted = CommonFunction.convertDateFormat(avisVO.getDatef());
        Pager resultat = callDocubase.appelDocubase(arrCompte, arrType,
            DateDebutFormatted, DateFinFormatted,
            avisVO.getNumPage(), avisVO.getPageSize(),
            avisVO.getMontantmin(), avisVO.getMontantmax());
        return getRepdematGetListVoOut(resultat);
    }
}`,
    modern: `@Service
@Transactional
@Slf4j
public class SearchAvisOpereService {
    private final RepdematService repdematService;
    private final DocubaseClient docubaseClient;

    public SearchAvisOpereService(RepdematService repdematService, DocubaseClient docubaseClient) {
        this.repdematService = repdematService;
        this.docubaseClient = docubaseClient;
    }

    public SearchAvisOpereResponse search(SearchAvisOpereRequest request) {
        log.info("Searching avis-opere for account: {}", request.getNumCompte());
        List<String> types = repdematService.getTypesByCategory(request.getCategorie());
        List<String> accounts = resolveAccounts(request.getNumCompte(), request.getComptes());

        DocubaseSearchCriteria criteria = DocubaseSearchCriteria.builder()
            .accounts(accounts)
            .types(types)
            .dateFrom(request.getDateDebut())
            .dateTo(request.getDateFin())
            .montantMin(request.getMontantMin())
            .montantMax(request.getMontantMax())
            .page(request.getPage())
            .pageSize(request.getPageSize())
            .build();

        Page<RepdematDoc> results = docubaseClient.search(criteria);
        return SearchAvisOpereResponse.from(results);
    }
}`,
    tags: ["@UseCase", "BaseUseCase", "ValueObject", "@Transactional", "@Autowired", "JPA", "@Service", "Spring Boot"],
  },

  // ─── 3. JPA Service avec EntityManager → Spring Data JPA Repository (avis-opere) ───
  {
    id: "avis-opere-jpa-service",
    category: "JPA_ENTITY_SERVICE",
    description: "Service JPA avec requêtes manuelles → Spring Data JPA Repository",
    legacy: `@Service
@ContinueOrStartTransaction
public class RepdematService {
    @Autowired
    private IServiceRepDemat searchService;

    public String getReqTypeAvis(String nature) throws PersistenceException {
        List<TypeAoRd> list = searchService.getListTypes(nature);
        String reqType = "";
        for (TypeAoRd type : list) {
            reqType += "" + type.getCode() + ",";
        }
        reqType = reqType.substring(0, reqType.length() - 1);
        return reqType;
    }

    public String getReqCat() throws PersistenceException {
        List<TypeAoRd> list = searchService.getTypesNotNull();
        String reqType = "";
        for (TypeAoRd type : list) {
            reqType += "'" + type.getCode() + "',";
        }
        reqType = reqType.substring(0, reqType.length() - 1);
        return reqType;
    }
}`,
    modern: `@Service
@Transactional(readOnly = true)
@Slf4j
public class RepdematService {
    private final TypeAoRdRepository typeAoRdRepository;

    public RepdematService(TypeAoRdRepository typeAoRdRepository) {
        this.typeAoRdRepository = typeAoRdRepository;
    }

    public List<String> getTypesByCategory(String nature) {
        return typeAoRdRepository.findByNature(nature)
            .stream()
            .map(TypeAoRd::getCode)
            .collect(Collectors.toList());
    }

    public List<String> getAllCategories() {
        return typeAoRdRepository.findByCodeNotNull()
            .stream()
            .map(t -> "'" + t.getCode() + "'")
            .collect(Collectors.toList());
    }
}

// Repository
public interface TypeAoRdRepository extends JpaRepository<TypeAoRd, Long> {
    List<TypeAoRd> findByNature(String nature);
    List<TypeAoRd> findByCodeNotNull();
}`,
    tags: ["JPA", "EntityManager", "@Service", "PersistenceException", "Spring Data", "JpaRepository"],
  },

  // ─── 4. EJB @Stateless + @Resource DataSource + JDBC raw → Spring Boot (commander-chequier) ───
  {
    id: "commander-chequier-ejb-jdbc",
    category: "EJB_JDBC_DATASOURCE",
    description: "EJB @Stateless avec @Resource DataSource et JDBC raw → Spring Boot @Service + JdbcTemplate",
    legacy: `@Stateless(name = "CommandChequierService")
@TransactionAttribute(TransactionAttributeType.REQUIRED)
@Remote(SynchroneService.class)
public class CommandChequier implements SynchroneService {
    @Resource(name = "jdbc/ebankdirect_xa")
    private DataSource ebankdirectXA;

    private enum Action { ENRG_COMMANDE, SUIVI_COMMANDE, HISTORY_CMD }

    @Override
    public Envelope process(Envelope envelopeIn) throws Exception {
        String action = Parser.getValueFromXml(envelopeIn.getBody(), FLUX_ACTION_PATH);
        Connection conn = ebankdirectXA.getConnection();
        try {
            switch (Action.valueOf(action)) {
                case ENRG_COMMANDE:
                    return enregistrerCommande(envelopeIn, conn);
                case SUIVI_COMMANDE:
                    return suiviCommande(envelopeIn);
                case HISTORY_CMD:
                    return historiqueCommande(envelopeIn);
            }
        } finally {
            if (conn != null) conn.close();
        }
        return envelopeIn;
    }
}`,
    modern: `@Service
@Transactional
@Slf4j
public class CommandChequierService {
    private final JdbcTemplate jdbcTemplate;
    private final CommandeServiceClient commandeClient;

    public CommandChequierService(
            @Qualifier("ebankdirectDataSource") DataSource dataSource,
            CommandeServiceClient commandeClient) {
        this.jdbcTemplate = new JdbcTemplate(dataSource);
        this.commandeClient = commandeClient;
    }

    public CommandChequierResponse process(CommandChequierRequest request) {
        return switch (request.getAction()) {
            case ENRG_COMMANDE -> enregistrerCommande(request);
            case SUIVI_COMMANDE -> suiviCommande(request);
            case HISTORY_CMD -> historiqueCommande(request);
        };
    }

    private CommandChequierResponse enregistrerCommande(CommandChequierRequest request) {
        jdbcTemplate.update(
            "INSERT INTO COMMAND_CHEQUIER (TYPE_COMMAND, NB_VIGNETTES, QUANTITE, ORIGIN, NUM_ACCOUNT, CREATION_DATE, CODE_ETAT) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
            request.getTypeCommand(), request.getNbVignettes(), request.getQuantite(),
            request.getOrigin(), request.getNumAccount(), request.getCodeEtat()
        );
        return CommandChequierResponse.success("Commande enregistrée");
    }
}`,
    tags: ["@Stateless", "@Resource", "DataSource", "JDBC", "Connection", "PreparedStatement", "JdbcTemplate", "Spring Boot"],
  },

  // ─── 5. JDBC DAO raw avec PreparedStatement → Spring Data (commander-chequier) ───
  {
    id: "commander-chequier-dao",
    category: "JDBC_DAO_RAW",
    description: "DAO JDBC raw avec PreparedStatement/Connection → Spring JdbcTemplate ou JPA",
    legacy: `public class CommandChequierDao {
    public static void save(CommandChequierEntity commandChequier, Connection connexionEbankDirect) throws SQLException {
        PreparedStatement stmt = null;
        try {
            String query = "INSERT INTO COMMAND_CHEQUIER (TYPE_COMMAND, NB_VIGNETTES, QUANTITE, ORIGIN, NUM_ACCOUNT, CREATION_DATE, CODE_ETAT, ID_CMD, ID_ORDONNATEUR, TIERS, EMAIL, TELEPHONE) "
                + "VALUES (?, ?, ?, ?, ?, TO_TIMESTAMP(?, 'YYYY-MM-DD HH24:MI:SS'),?, COMMAND_CHEQUIER_SEQ.NEXTVAL, ?,?,?,?)";
            stmt = connexionEbankDirect.prepareStatement(query);
            stmt.setString(1, commandChequier.getTypeCommand());
            stmt.setString(2, commandChequier.getNbVignettes());
            stmt.setString(3, commandChequier.getQuantite());
            stmt.setString(4, commandChequier.getOrigin());
            stmt.setString(5, commandChequier.getNumAccount());
            stmt.setString(6, new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(commandChequier.getCreationDate()));
            stmt.setString(7, commandChequier.getCodeEtat());
            stmt.setString(8, commandChequier.getIdOrdonnateur());
            stmt.setString(9, commandChequier.getTiers());
            stmt.setString(10, commandChequier.getEmail());
            stmt.setString(11, commandChequier.getTelephone());
            stmt.executeUpdate();
        } finally {
            if (stmt != null) stmt.close();
            if (connexionEbankDirect != null) connexionEbankDirect.close();
        }
    }
}`,
    modern: `@Entity
@Table(name = "COMMAND_CHEQUIER")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommandChequier {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "cmd_seq")
    @SequenceGenerator(name = "cmd_seq", sequenceName = "COMMAND_CHEQUIER_SEQ", allocationSize = 1)
    @Column(name = "ID_CMD")
    private Long idCmd;

    @Column(name = "TYPE_COMMAND") private String typeCommand;
    @Column(name = "NB_VIGNETTES") private String nbVignettes;
    @Column(name = "QUANTITE") private String quantite;
    @Column(name = "ORIGIN") private String origin;
    @Column(name = "NUM_ACCOUNT") private String numAccount;
    @Column(name = "CREATION_DATE") private LocalDateTime creationDate;
    @Column(name = "CODE_ETAT") private String codeEtat;
    @Column(name = "ID_ORDONNATEUR") private String idOrdonnateur;
    @Column(name = "TIERS") private String tiers;
    @Column(name = "EMAIL") private String email;
    @Column(name = "TELEPHONE") private String telephone;
}

public interface CommandChequierRepository extends JpaRepository<CommandChequier, Long> {
    List<CommandChequier> findByNumAccountOrderByCreationDateDesc(String numAccount);
}`,
    tags: ["JDBC", "PreparedStatement", "Connection", "DAO", "Oracle", "TO_TIMESTAMP", "SEQUENCE", "JPA", "@Entity", "JpaRepository"],
  },

  // ─── 6. SOAP WebService Client → Spring WebClient/RestTemplate (commander-chequier) ───
  {
    id: "commander-chequier-soap",
    category: "SOAP_WEBSERVICE_CLIENT",
    description: "Client SOAP ICommandeService avec WSDL → Spring WebClient REST ou SOAP stub",
    legacy: `// Appel SOAP dans le service EJB
ICommandeService service = new ICommandeService();
ICommandeServicePortType port = service.getICommandeServicePort();
try {
    SuiviCommandeResponse response = port.suiviCommande(request);
    List<History> historyList = new ArrayList<>();
    for (SuiviCommandeItem item : response.getItems()) {
        History h = new History();
        h.setIdCmd(item.getIdCmd());
        h.setTypeCommand(item.getTypeCommand());
        h.setCodeEtat(item.getCodeEtat());
        h.setCreationDate(item.getCreationDate());
        historyList.add(h);
    }
    Collections.sort(historyList, Comparator.comparing(History::getCreationDate).reversed());
    return historyList;
} catch (Exception e) {
    EaiLog.error("Error ICommandeService suiviCommand : " + e.getMessage());
    throw e;
}`,
    modern: `@Service
@Slf4j
public class CommandeServiceClient {
    private final WebClient webClient;

    public CommandeServiceClient(@Value("\${commande.service.url}") String baseUrl) {
        this.webClient = WebClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    public List<CommandeHistory> suiviCommande(SuiviCommandeRequest request) {
        log.info("Calling commande service for account: {}", request.getNumAccount());
        return webClient.post()
            .uri("/api/commandes/suivi")
            .bodyValue(request)
            .retrieve()
            .bodyToFlux(CommandeHistory.class)
            .sort(Comparator.comparing(CommandeHistory::getCreationDate).reversed())
            .collectList()
            .block();
    }

    public CommandeResponse enregistrerCommande(EnregistrerCommandeRequest request) {
        return webClient.post()
            .uri("/api/commandes/enregistrer")
            .bodyValue(request)
            .retrieve()
            .bodyToMono(CommandeResponse.class)
            .block();
    }
}`,
    tags: ["SOAP", "WebService", "WSDL", "getPort", "ICommandeService", "WebClient", "REST", "Spring Boot"],
  },

  // ─── 7. EJB Bean activation carte + Auth externe → Spring Boot (activation-carte) ───
  {
    id: "activation-carte-ejb-bean",
    category: "EJB_EXTERNAL_API",
    description: "EJB @Stateless avec UCStrategie + appel API externe Magix → Spring Boot @RestController",
    legacy: `@Stateless(name = "activationcartebmcedirectBean")
@Remote(SynchroneService.class)
public class activationcartebmcedirectBean extends UCStrategie {
    @Override
    public Envelope process(Envelope envelopeIn) throws Exception {
        Envelope envOut = null;
        try {
            EaiLog.initLogTraceInfos(envelopeIn);
            envOut = super.process(envelopeIn);
        } catch (Exception e) {
            EaiLog.error("Erreur Service : ", e);
            envOut = CommonFunction.constructEnvWhenGlobalError(envelopeIn);
        }
        return envOut;
    }
}`,
    modern: `@RestController
@RequestMapping("/api/activation-carte")
@Slf4j
public class ActivationCarteController {
    private final ActivationCarteService activationCarteService;

    public ActivationCarteController(ActivationCarteService activationCarteService) {
        this.activationCarteService = activationCarteService;
    }

    @PostMapping("/activer")
    public ResponseEntity<ActivationResponse> activerCarte(@Valid @RequestBody ActivationRequest request) {
        log.info("Activation carte request for token: {}", request.getNumToken());
        ActivationResponse response = activationCarteService.activerCarte(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/receptionner")
    public ResponseEntity<ReceptionResponse> receptionnerCarte(@Valid @RequestBody ReceptionRequest request) {
        log.info("Reception carte request for lot: {}", request.getNumLot());
        ReceptionResponse response = activationCarteService.receptionnerCarte(request);
        return ResponseEntity.ok(response);
    }
}`,
    tags: ["EJB", "@Stateless", "UCStrategie", "API externe", "Magix", "@RestController", "Spring Boot"],
  },

  // ─── 8. UseCase avec Auth Token + API externe → Spring @Service (activation-carte) ───
  {
    id: "activation-carte-usecase",
    category: "USECASE_EXTERNAL_AUTH",
    description: "UseCase avec authentification token + appel API Magix → Spring @Service + WebClient",
    legacy: `@UseCase
@Transactional(readOnly = false, propagation = Propagation.NOT_SUPPORTED, rollbackFor = FwkRollbackException.class)
public class ActiverCarteUC implements BaseUseCase {
    @Autowired
    AuthentificationService authentification;
    @Autowired
    MagixService magixService;

    @Override
    public ValueObject execute(ValueObject voIn) throws FwkRollbackException {
        ActiverCarteVoIn activerCarteVoIn = (ActiverCarteVoIn) voIn;
        String authToken = authentification.getValidToken(activerCarteVoIn.getCorporateId()).getTokenCarte();

        ActiverCarteRequest activerCarteRequest = new ActiverCarteRequest();
        activerCarteRequest.setCrtSecurtoken24E1(authToken);
        activerCarteRequest.setNumTocken(activerCarteVoIn.getNumToken());
        activerCarteRequest.setNumLot(activerCarteVoIn.getNumLot());
        activerCarteRequest.setCodeOperateur(activerCarteVoIn.getCodeOperateur());

        ActiverCarteVoOut activerCarteVoOut = magixService.activerCarte(activerCarteRequest,
            activerCarteVoIn.getCorporateId());
        return activerCarteVoOut;
    }
}`,
    modern: `@Service
@Slf4j
public class ActivationCarteService {
    private final AuthTokenProvider authTokenProvider;
    private final MagixClient magixClient;

    public ActivationCarteService(AuthTokenProvider authTokenProvider, MagixClient magixClient) {
        this.authTokenProvider = authTokenProvider;
        this.magixClient = magixClient;
    }

    public ActivationResponse activerCarte(ActivationRequest request) {
        log.info("Activating card for corporate: {}", request.getCorporateId());
        String authToken = authTokenProvider.getValidToken(request.getCorporateId());

        MagixActivationRequest magixRequest = MagixActivationRequest.builder()
            .securityToken(authToken)
            .numToken(request.getNumToken())
            .numLot(request.getNumLot())
            .codeOperateur(request.getCodeOperateur())
            .build();

        MagixActivationResponse magixResponse = magixClient.activerCarte(magixRequest, request.getCorporateId());
        return ActivationResponse.from(magixResponse);
    }
}`,
    tags: ["@UseCase", "BaseUseCase", "ValueObject", "Auth", "Token", "API externe", "Magix", "@Service", "WebClient"],
  },

  // ─── 9. JDBC massif avec Oracle procedures → Spring JdbcTemplate (mise-disposition) ───
  {
    id: "mise-disposition-jdbc-oracle",
    category: "JDBC_ORACLE_MASSIVE",
    description: "DAO Hibernate avec requêtes SQL Oracle massives → Spring Data JPA + @Query",
    legacy: `public class HibernateDao {
    @Autowired
    private SessionFactory sessionFactory;

    public List<MiseDisposition> findByCompte(String numCompte) {
        Session session = sessionFactory.getCurrentSession();
        Query query = session.createSQLQuery(
            "SELECT m.* FROM MEP_GRC_STOCK_TIERS m " +
            "WHERE m.NUM_COMPTE = :numCompte " +
            "AND m.CODE_ETAT IN ('EN_COURS', 'VALIDE') " +
            "ORDER BY m.DATE_CREATION DESC"
        );
        query.setParameter("numCompte", numCompte);
        query.setResultTransformer(Transformers.aliasToBean(MiseDisposition.class));
        return query.list();
    }

    public void updateEtat(Long id, String codeEtat) {
        Session session = sessionFactory.getCurrentSession();
        Query query = session.createSQLQuery(
            "UPDATE MEP_GRC_STOCK_TIERS SET CODE_ETAT = :etat, DATE_MAJ = SYSDATE WHERE ID = :id"
        );
        query.setParameter("etat", codeEtat);
        query.setParameter("id", id);
        query.executeUpdate();
    }
}`,
    modern: `@Entity
@Table(name = "MEP_GRC_STOCK_TIERS")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class MiseDisposition {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "NUM_COMPTE") private String numCompte;
    @Column(name = "CODE_ETAT") private String codeEtat;
    @Column(name = "DATE_CREATION") private LocalDateTime dateCreation;
    @Column(name = "DATE_MAJ") private LocalDateTime dateMaj;
    // ... other fields
}

public interface MiseDispositionRepository extends JpaRepository<MiseDisposition, Long> {
    @Query("SELECT m FROM MiseDisposition m WHERE m.numCompte = :numCompte AND m.codeEtat IN ('EN_COURS', 'VALIDE') ORDER BY m.dateCreation DESC")
    List<MiseDisposition> findActiveByCompte(@Param("numCompte") String numCompte);

    @Modifying
    @Query("UPDATE MiseDisposition m SET m.codeEtat = :etat, m.dateMaj = CURRENT_TIMESTAMP WHERE m.id = :id")
    void updateEtat(@Param("id") Long id, @Param("etat") String etat);
}`,
    tags: ["Hibernate", "SessionFactory", "createSQLQuery", "Oracle", "SYSDATE", "JPA", "@Entity", "JpaRepository", "@Query"],
  },

  // ─── 10. Email Service legacy → Spring Boot JavaMailSender (commander-chequier) ───
  {
    id: "commander-chequier-email",
    category: "EMAIL_SERVICE_LEGACY",
    description: "Service email legacy avec javax.mail → Spring Boot JavaMailSender",
    legacy: `public class Mailer {
    private static final String SMTP_HOST = "smtp.boa.ma";
    private static final String FROM = "noreply@bmcedirect.com";

    public static void sendMail(String to, String subject, String body) {
        Properties props = new Properties();
        props.put("mail.smtp.host", SMTP_HOST);
        props.put("mail.smtp.port", "25");
        Session session = Session.getDefaultInstance(props);
        try {
            MimeMessage message = new MimeMessage(session);
            message.setFrom(new InternetAddress(FROM));
            message.addRecipient(Message.RecipientType.TO, new InternetAddress(to));
            message.setSubject(subject);
            message.setContent(body, "text/html; charset=utf-8");
            Transport.send(message);
            EaiLog.info("Email envoyé à : " + to);
        } catch (MessagingException e) {
            EaiLog.error("Erreur envoi email : " + e.getMessage());
        }
    }
}`,
    modern: `@Service
@Slf4j
public class EmailService {
    private final JavaMailSender mailSender;

    @Value("\${spring.mail.from:noreply@bmcedirect.com}")
    private String fromAddress;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendEmail(String to, String subject, String htmlBody) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(message);
            log.info("Email envoyé à : {}", to);
        } catch (MessagingException e) {
            log.error("Erreur envoi email à {}: {}", to, e.getMessage());
            throw new EmailSendException("Échec envoi email", e);
        }
    }
}`,
    tags: ["javax.mail", "SMTP", "MimeMessage", "Transport", "JavaMailSender", "Spring Boot", "Email"],
  },

  // ─── 11. Notification DAO JDBC → Spring Data (commander-chequier) ───
  {
    id: "commander-chequier-notification-dao",
    category: "JDBC_NOTIFICATION_DAO",
    description: "DAO notification JDBC raw avec INSERT Oracle → Spring Data JPA",
    legacy: `public class NotificationDao {
    public static void saveNotification(Connection conn, String type, String message,
            String numAccount, String email) throws SQLException {
        PreparedStatement stmt = null;
        try {
            String query = "INSERT INTO NOTIFICATIONS (TYPE_NOTIF, MESSAGE, NUM_ACCOUNT, EMAIL, DATE_CREATION, STATUT) "
                + "VALUES (?, ?, ?, ?, SYSDATE, 'PENDING')";
            stmt = conn.prepareStatement(query);
            stmt.setString(1, type);
            stmt.setString(2, message);
            stmt.setString(3, numAccount);
            stmt.setString(4, email);
            stmt.executeUpdate();
        } finally {
            if (stmt != null) stmt.close();
        }
    }
}`,
    modern: `@Entity
@Table(name = "NOTIFICATIONS")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "TYPE_NOTIF") private String typeNotif;
    @Column(name = "MESSAGE") private String message;
    @Column(name = "NUM_ACCOUNT") private String numAccount;
    @Column(name = "EMAIL") private String email;
    @Column(name = "DATE_CREATION") private LocalDateTime dateCreation;
    @Column(name = "STATUT") @Builder.Default private String statut = "PENDING";

    @PrePersist
    void prePersist() { this.dateCreation = LocalDateTime.now(); }
}

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByNumAccountAndStatut(String numAccount, String statut);
}

@Service
public class NotificationService {
    private final NotificationRepository repo;
    public NotificationService(NotificationRepository repo) { this.repo = repo; }

    public Notification create(String type, String message, String numAccount, String email) {
        return repo.save(Notification.builder()
            .typeNotif(type).message(message)
            .numAccount(numAccount).email(email).build());
    }
}`,
    tags: ["JDBC", "PreparedStatement", "INSERT", "Oracle", "SYSDATE", "Notification", "JPA", "@Entity", "JpaRepository"],
  },

  // ─── 12. EAI Envelope parsing XML → Spring Boot DTO mapping (commun) ───
  {
    id: "common-envelope-parsing",
    category: "EAI_ENVELOPE_XML",
    description: "Parsing XML Envelope EAI avec Parser.getValueFromXml → Spring Boot DTO Jackson",
    legacy: `// Pattern commun à tous les projets BOA
public Envelope process(Envelope envelopeIn) throws Exception {
    String action = Parser.getValueFromXml(envelopeIn.getBody(), "flux/action");
    String numAccount = Parser.getValueFromXml(envelopeIn.getBody(), "flux/numAccount");
    String corporateId = Parser.getValueFromXml(envelopeIn.getBody(), "flux/corporateId");
    String dateDebut = Parser.getValueFromXml(envelopeIn.getBody(), "flux/dateDebut");
    String dateFin = Parser.getValueFromXml(envelopeIn.getBody(), "flux/dateFin");

    // Build response envelope
    Envelope envOut = new Envelope();
    envOut.setHeader(envelopeIn.getHeader());
    StringBuilder sb = new StringBuilder();
    sb.append("<flux><result>").append(result).append("</result>");
    sb.append("<status>").append(status).append("</status></flux>");
    envOut.setBody(sb.toString());
    return envOut;
}`,
    modern: `// Spring Boot DTO avec Jackson annotations
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FluxRequest {
    @NotBlank private String action;
    @NotBlank private String numAccount;
    private String corporateId;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate dateDebut;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate dateFin;
}

@Data
@Builder
public class FluxResponse {
    private String result;
    private String status;
    private String message;

    public static FluxResponse success(String result) {
        return FluxResponse.builder().result(result).status("OK").build();
    }
    public static FluxResponse error(String message) {
        return FluxResponse.builder().status("ERROR").message(message).build();
    }
}

// Controller
@PostMapping("/process")
public ResponseEntity<FluxResponse> process(@Valid @RequestBody FluxRequest request) {
    FluxResponse response = service.process(request);
    return ResponseEntity.ok(response);
}`,
    tags: ["Envelope", "Parser", "XML", "getValueFromXml", "DTO", "Jackson", "@JsonFormat", "Spring Boot"],
  },

  // ─── 13. Exception handling EAI → Spring Boot @ControllerAdvice (commun) ───
  {
    id: "common-exception-handling",
    category: "EAI_EXCEPTION_HANDLING",
    description: "Gestion d'erreurs EAI avec FwkRollbackException → Spring Boot @ControllerAdvice",
    legacy: `// Pattern commun d'exception dans les projets BOA
public class CompteEnCompromisException extends FwkRollbackException {
    public CompteEnCompromisException(String message) { super(message); }
}
public class CompteException extends FwkRollbackException {
    public CompteException(String message) { super(message); }
}
public class FormatNumcompteInvalideException extends FwkRollbackException {
    public FormatNumcompteInvalideException(String message) { super(message); }
}

// Usage dans les UseCases
@Override
public ValueObject execute(ValueObject in) throws FwkRollbackException {
    if (!isValidAccount(numCompte)) {
        throw new FormatNumcompteInvalideException("Format invalide: " + numCompte);
    }
    if (isCompromised(numCompte)) {
        throw new CompteEnCompromisException("Compte compromis: " + numCompte);
    }
}`,
    modern: `// Spring Boot exceptions
public class CompteEnCompromisException extends RuntimeException {
    public CompteEnCompromisException(String numCompte) {
        super("Compte compromis: " + numCompte);
    }
}
public class FormatNumcompteInvalideException extends RuntimeException {
    public FormatNumcompteInvalideException(String numCompte) {
        super("Format de numéro de compte invalide: " + numCompte);
    }
}

// Global exception handler
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {
    @ExceptionHandler(CompteEnCompromisException.class)
    public ResponseEntity<ErrorResponse> handleCompteCompromis(CompteEnCompromisException e) {
        log.warn("Compte compromis: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(new ErrorResponse("COMPTE_COMPROMIS", e.getMessage()));
    }

    @ExceptionHandler(FormatNumcompteInvalideException.class)
    public ResponseEntity<ErrorResponse> handleFormatInvalide(FormatNumcompteInvalideException e) {
        log.warn("Format invalide: {}", e.getMessage());
        return ResponseEntity.badRequest()
            .body(new ErrorResponse("FORMAT_INVALIDE", e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception e) {
        log.error("Erreur inattendue", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("INTERNAL_ERROR", "Erreur interne du serveur"));
    }
}`,
    tags: ["FwkRollbackException", "Exception", "EAI", "@ControllerAdvice", "@ExceptionHandler", "Spring Boot"],
  },

  // ─── 14. DataSource JNDI config → Spring Boot application.yml (commun) ───
  {
    id: "common-datasource-config",
    category: "JNDI_DATASOURCE_CONFIG",
    description: "Configuration DataSource JNDI dans persistence.xml → Spring Boot application.yml",
    legacy: `<!-- persistence.xml -->
<persistence-unit name="avisoperePU" transaction-type="JTA">
    <jta-data-source>jdbc/ebankdirect_xa</jta-data-source>
    <properties>
        <property name="hibernate.dialect" value="org.hibernate.dialect.Oracle12cDialect"/>
        <property name="hibernate.show_sql" value="false"/>
        <property name="hibernate.format_sql" value="true"/>
        <property name="hibernate.hbm2ddl.auto" value="none"/>
    </properties>
</persistence-unit>

<!-- web.xml resource-ref -->
<resource-ref>
    <res-ref-name>jdbc/ebankdirect_xa</res-ref-name>
    <res-type>javax.sql.DataSource</res-type>
    <res-auth>Container</res-auth>
</resource-ref>`,
    modern: `# application.yml
spring:
  datasource:
    url: jdbc:oracle:thin:@//oracle-host:1521/EBANKDB
    username: \${DB_USERNAME}
    password: \${DB_PASSWORD}
    driver-class-name: oracle.jdbc.OracleDriver
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 30000
      idle-timeout: 600000
      max-lifetime: 1800000

  jpa:
    database-platform: org.hibernate.dialect.Oracle12cDialect
    hibernate:
      ddl-auto: none
    show-sql: false
    properties:
      hibernate:
        format_sql: true
        jdbc:
          batch_size: 50
        order_inserts: true
        order_updates: true`,
    tags: ["JNDI", "persistence.xml", "DataSource", "Oracle", "Hibernate", "application.yml", "HikariCP", "Spring Boot"],
  },

  // ─── 15. EaiLog legacy → SLF4J/Logback (commun) ───
  {
    id: "common-logging",
    category: "EAI_LOGGING",
    description: "EaiLog legacy avec initLogTraceInfos → SLF4J @Slf4j + MDC",
    legacy: `// Pattern de logging dans tous les projets BOA
EaiLog.initLogTraceInfos(envelopeIn);
EaiLog.info("======>FLUX ENTRE EN XML: " + envelopeIn);
EaiLog.info("TEMPS REPONSE TYPES FROM BDD :" + (end - start) + " ms");
EaiLog.error("Erreur Service : ", e);
EaiLog.warn("Attention: compte non trouvé");

// Logging avec concaténation de chaînes (anti-pattern)
EaiLog.info("Compte " + i + " num:" + arrCompte.getItem().get(i));`,
    modern: `// SLF4J avec @Slf4j Lombok + MDC pour le tracing
@Slf4j
public class AvisOpereService {
    public void process(AvisOpereRequest request) {
        MDC.put("traceId", UUID.randomUUID().toString());
        MDC.put("accountId", request.getNumCompte());

        log.info("Processing avis-opere request: {}", request);

        long start = System.nanoTime();
        List<String> types = repdematService.getTypesByCategory(request.getCategorie());
        long elapsed = (System.nanoTime() - start) / 1_000_000;
        log.info("Types retrieved from DB in {}ms", elapsed);

        log.debug("Account {} resolved to {} types", request.getNumCompte(), types.size());

        try {
            // ... processing
        } catch (Exception e) {
            log.error("Error processing avis-opere for account {}", request.getNumCompte(), e);
            throw e;
        } finally {
            MDC.clear();
        }
    }
}`,
    tags: ["EaiLog", "logging", "initLogTraceInfos", "SLF4J", "@Slf4j", "MDC", "Logback", "Spring Boot"],
  },
];
