/**
 * jakartaExtendedRules — Auto-generated rules for jakarta
 * Total: 49 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const jakartaExtendedRules: Rule[] = [
  {
    id: "JAK_EJB_001",
    category: "JAKARTA",
    name: "EJB 2.x Home interface",
    severity: "critical",
    description: "Interface Home EJB 2.x a migrer vers CDI",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /extends\s+(?:EJBHome|EJBLocalHome)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_002",
    category: "JAKARTA",
    name: "SessionBean interface",
    severity: "critical",
    description: "Interface SessionBean a remplacer par @Stateless/@Stateful",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /implements\s+SessionBean/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_003",
    category: "JAKARTA",
    name: "EntityBean interface",
    severity: "critical",
    description: "EntityBean a migrer vers JPA @Entity",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /implements\s+EntityBean/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_004",
    category: "JAKARTA",
    name: "MessageDrivenBean",
    severity: "major",
    description: "MessageDrivenBean a migrer vers @MessageDriven CDI",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /implements\s+MessageDrivenBean/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_005",
    category: "JAKARTA",
    name: "ejb-jar.xml",
    severity: "major",
    description: "Descripteur ejb-jar.xml a remplacer par annotations",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ejb-jar\.xml/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_006",
    category: "JAKARTA",
    name: "JNDI lookup",
    severity: "major",
    description: "JNDI lookup a remplacer par @Inject",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /InitialContext|lookup\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_007",
    category: "JAKARTA",
    name: "Remote interface EJB",
    severity: "major",
    description: "Interface @Remote a migrer vers REST/gRPC",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Remote|extends\s+EJBObject/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_008",
    category: "JAKARTA",
    name: "Timer EJB",
    severity: "minor",
    description: "EJB Timer a migrer vers @Schedule CDI",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /TimerService|@Timeout/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_009",
    category: "JAKARTA",
    name: "BMT transaction",
    severity: "major",
    description: "Bean-Managed Transaction a migrer vers CMT",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /UserTransaction|sessionContext\.getUserTransaction/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_010",
    category: "JAKARTA",
    name: "EJB interceptor",
    severity: "minor",
    description: "Intercepteur EJB a migrer vers CDI interceptor",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@AroundInvoke.*EJB|@Interceptors/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_011",
    category: "JAKARTA",
    name: "EJB security",
    severity: "major",
    description: "Securite EJB a migrer vers Jakarta Security",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@RolesAllowed|@DeclareRoles|@RunAs/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_012",
    category: "JAKARTA",
    name: "EJB exception",
    severity: "minor",
    description: "Exception EJB specifique a generaliser",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /EJBException|CreateException|RemoveException|FinderException/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_013",
    category: "JAKARTA",
    name: "EJB context",
    severity: "major",
    description: "EJBContext a remplacer par CDI BeanManager",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /EJBContext|SessionContext|MessageDrivenContext/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_014",
    category: "JAKARTA",
    name: "CMP Entity",
    severity: "critical",
    description: "Container-Managed Persistence a migrer vers JPA",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /abstract.*get\w+\(\)[\s\S]{0,50}@Column|cmp-field/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_EJB_015",
    category: "JAKARTA",
    name: "BMP Entity",
    severity: "critical",
    description: "Bean-Managed Persistence a migrer vers JPA",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ejbLoad|ejbStore|ejbCreate|ejbRemove|ejbFind/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_001",
    category: "JAKARTA",
    name: "HttpServlet extends",
    severity: "major",
    description: "HttpServlet a migrer vers JAX-RS @Path",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /extends\s+HttpServlet/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_002",
    category: "JAKARTA",
    name: "doGet/doPost",
    severity: "major",
    description: "doGet/doPost a migrer vers @GET/@POST",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /void\s+do(?:Get|Post|Put|Delete)\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_003",
    category: "JAKARTA",
    name: "web.xml servlet",
    severity: "major",
    description: "Configuration servlet dans web.xml a migrer vers annotations",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /web\.xml/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_004",
    category: "JAKARTA",
    name: "Filter chain",
    severity: "minor",
    description: "Servlet Filter a migrer vers JAX-RS ContainerRequestFilter",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /implements\s+Filter\b|doFilter\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_005",
    category: "JAKARTA",
    name: "JSP usage",
    severity: "major",
    description: "JSP a migrer vers API REST + frontend moderne",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.jsp["']|RequestDispatcher|forward\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_006",
    category: "JAKARTA",
    name: "Struts Action",
    severity: "critical",
    description: "Struts Action a migrer vers JAX-RS",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /extends\s+(?:Action|DispatchAction|MappingDispatchAction)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_007",
    category: "JAKARTA",
    name: "Struts Form",
    severity: "major",
    description: "Struts ActionForm a migrer vers DTO",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /extends\s+(?:ActionForm|ValidatorForm|DynaActionForm)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_008",
    category: "JAKARTA",
    name: "RequestDispatcher",
    severity: "major",
    description: "Forward/include a remplacer par REST response",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /getRequestDispatcher|forward\s*\(|include\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_009",
    category: "JAKARTA",
    name: "HttpSession direct",
    severity: "major",
    description: "HttpSession a remplacer par JWT/token",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /HttpSession|getSession\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_SRV_010",
    category: "JAKARTA",
    name: "ServletContext",
    severity: "minor",
    description: "ServletContext a remplacer par CDI ApplicationScoped",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ServletContext|getServletContext/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_JMS_001",
    category: "JAKARTA",
    name: "JMS 1.1 API",
    severity: "major",
    description: "JMS 1.1 a migrer vers JMS 2.0+",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ConnectionFactory|createConnection\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_JMS_002",
    category: "JAKARTA",
    name: "Topic/Queue lookup",
    severity: "major",
    description: "JNDI lookup JMS a remplacer par @JMSConnectionFactory",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /lookup.*(?:Topic|Queue|ConnectionFactory)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_JMS_003",
    category: "JAKARTA",
    name: "MessageListener",
    severity: "minor",
    description: "MessageListener a migrer vers @JMSListener",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /implements\s+MessageListener/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_JMS_004",
    category: "JAKARTA",
    name: "JMS session manual",
    severity: "major",
    description: "Session JMS manuelle a simplifier avec JMSContext",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createSession\s*\(\s*(?:true|false)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_JMS_005",
    category: "JAKARTA",
    name: "JMS producer manual",
    severity: "minor",
    description: "MessageProducer manuel a simplifier avec JMSProducer",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createProducer\s*\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_JMS_006",
    category: "JAKARTA",
    name: "JMS consumer manual",
    severity: "minor",
    description: "MessageConsumer manuel a simplifier avec JMSConsumer",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createConsumer\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_JMS_007",
    category: "JAKARTA",
    name: "JMS transaction manual",
    severity: "major",
    description: "Transaction JMS manuelle a migrer vers JTA",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /session\.commit\(\)|session\.rollback\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_JMS_008",
    category: "JAKARTA",
    name: "JMS close manual",
    severity: "minor",
    description: "Fermeture JMS manuelle a remplacer par try-with-resources",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /connection\.close\(\)|session\.close\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_001",
    category: "JAKARTA",
    name: "JDBC direct",
    severity: "major",
    description: "JDBC direct a migrer vers JPA/Hibernate",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /DriverManager\.getConnection|java\.sql\.Connection/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_002",
    category: "JAKARTA",
    name: "Statement direct",
    severity: "major",
    description: "Statement JDBC a migrer vers JPA Query",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createStatement\(\)|PreparedStatement/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_003",
    category: "JAKARTA",
    name: "ResultSet manual",
    severity: "major",
    description: "ResultSet manuel a migrer vers JPA mapping",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ResultSet\s+\w+|\.next\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_004",
    category: "JAKARTA",
    name: "Hibernate Criteria",
    severity: "minor",
    description: "Criteria API Hibernate a migrer vers JPA Criteria",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Criteria\s+\w+\s*=|createCriteria\s*\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_005",
    category: "JAKARTA",
    name: "HQL string concat",
    severity: "critical",
    description: "HQL avec concatenation a migrer vers Criteria typesafe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createQuery\s*\(\s*["']\s*\+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_006",
    category: "JAKARTA",
    name: "Hibernate Session",
    severity: "major",
    description: "Session Hibernate a migrer vers EntityManager",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SessionFactory|openSession\(\)|getCurrentSession/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_007",
    category: "JAKARTA",
    name: "XML mapping",
    severity: "minor",
    description: "Mapping Hibernate XML a migrer vers annotations JPA",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.hbm\.xml|hibernate-mapping/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_008",
    category: "JAKARTA",
    name: "Native SQL",
    severity: "minor",
    description: "SQL natif a migrer vers JPQL quand possible",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createNativeQuery|createSQLQuery/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_009",
    category: "JAKARTA",
    name: "Connection pool manual",
    severity: "major",
    description: "Pool de connexions manuel a migrer vers DataSource",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /DriverManager\.getConnection/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_DB_010",
    category: "JAKARTA",
    name: "Transaction manual JDBC",
    severity: "major",
    description: "Transaction JDBC manuelle a migrer vers @Transactional",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /setAutoCommit\s*\(\s*false\s*\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_BATCH_001",
    category: "JAKARTA",
    name: "Thread manual batch",
    severity: "major",
    description: "Thread manuel pour batch a migrer vers JBatch",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+Thread\s*\(.*batch/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_BATCH_002",
    category: "JAKARTA",
    name: "Timer batch",
    severity: "major",
    description: "Timer/TimerTask pour batch a migrer vers @Schedule",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+Timer\s*\(|TimerTask/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_BATCH_003",
    category: "JAKARTA",
    name: "Quartz scheduler",
    severity: "minor",
    description: "Quartz a evaluer migration vers JBatch",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /org\.quartz|JobDetail|CronTrigger/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_BATCH_004",
    category: "JAKARTA",
    name: "File processing loop",
    severity: "minor",
    description: "Traitement fichier en boucle a migrer vers chunk processing",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /BufferedReader[\s\S]{0,200}while\s*\(\s*\(\s*line/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_BATCH_005",
    category: "JAKARTA",
    name: "Main method batch",
    severity: "major",
    description: "Batch lance par main() a migrer vers JBatch JobOperator",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /public\s+static\s+void\s+main.*batch/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "JAK_BATCH_006",
    category: "JAKARTA",
    name: "SOAP client",
    severity: "major",
    description: "Client SOAP a migrer vers REST client",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SOAPConnection|SOAPMessage|WSDL|wsimport/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
