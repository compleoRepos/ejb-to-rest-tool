/**
 * Import 10,000 projects into the database:
 * - 5,000 real Java legacy projects from GitHub (metadata only)
 * - 5,000 realistic enterprise-generated projects
 * 
 * Usage: node scripts/import-10k-projects.mjs
 */

import mysql from 'mysql2/promise';
import https from 'https';
import http from 'http';

// ============================================================
// Configuration
// ============================================================

const GITHUB_REAL_TARGET = 5000;
const GENERATED_TARGET = 5000;
const BATCH_SIZE = 500; // INSERT batch size

// GitHub search queries for Java legacy projects
const GITHUB_QUERIES = [
  // EJB
  'ejb stateless bean language:java',
  'ejb entity bean language:java',
  'ejb message driven bean language:java',
  'javax.ejb language:java',
  'jakarta.ejb language:java',
  '@Stateless language:java',
  '@Stateful language:java',
  '@MessageDriven language:java',
  'SessionBean language:java',
  'EJBHome language:java',
  'EJBObject language:java',
  'ejb-jar.xml',
  // Servlets
  'javax.servlet language:java',
  'HttpServlet language:java',
  'doGet doPost language:java',
  'web.xml servlet-mapping',
  'ServletContext language:java',
  '@WebServlet language:java',
  // JSP
  'jsp taglib language:java',
  'javax.servlet.jsp language:java',
  'JspWriter language:java',
  // Struts
  'struts-config.xml',
  'org.apache.struts language:java',
  'ActionForm language:java',
  'ActionForward language:java',
  'struts2 action language:java',
  // JDBC
  'DriverManager.getConnection language:java',
  'PreparedStatement language:java',
  'ResultSet language:java',
  'java.sql.Connection language:java',
  'CallableStatement language:java',
  // Hibernate
  'hibernate.cfg.xml',
  'SessionFactory language:java',
  'org.hibernate language:java',
  'HibernateUtil language:java',
  '@Entity @Table language:java',
  'hbm.xml mapping',
  // JMS
  'javax.jms language:java',
  'MessageListener language:java',
  'QueueConnectionFactory language:java',
  'TopicConnectionFactory language:java',
  'JMSContext language:java',
  // SOAP / JAX-WS
  'javax.xml.ws language:java',
  '@WebService language:java',
  'javax.jws language:java',
  'wsdl soap language:java',
  'SOAPMessage language:java',
  // RMI
  'java.rmi language:java',
  'UnicastRemoteObject language:java',
  'RemoteException language:java',
  // CORBA
  'org.omg.CORBA language:java',
  'PortableRemoteObject language:java',
  // JCA
  'javax.resource language:java',
  'ConnectionFactory language:java',
  'ManagedConnection language:java',
  // JNDI
  'InitialContext language:java',
  'javax.naming language:java',
  'jndi lookup language:java',
  // JSF
  'javax.faces language:java',
  '@ManagedBean language:java',
  'faces-config.xml',
  // Spring XML (legacy)
  'applicationContext.xml bean',
  'spring-beans.xml',
  'ClassPathXmlApplicationContext language:java',
  // Java Batch
  'javax.batch language:java',
  'job.xml batch',
  // JMX
  'javax.management language:java',
  'MBeanServer language:java',
  // General legacy
  'j2ee application language:java',
  'java ee enterprise language:java',
  'weblogic language:java',
  'websphere language:java',
  'jboss deployment language:java',
  'glassfish language:java',
  'wildfly language:java',
  'payara language:java',
  'tomee language:java',
];

// ============================================================
// Technology detection from repo topics/description
// ============================================================

const TECH_KEYWORDS = {
  'EJB_3X_STATELESS': ['ejb', 'stateless', 'session bean', 'javax.ejb', 'jakarta.ejb'],
  'EJB_2X': ['ejb2', 'ejb-jar', 'home interface', 'remote interface', 'entity bean'],
  'SERVLET': ['servlet', 'httpservlet', 'doget', 'dopost', 'web.xml'],
  'JSP': ['jsp', 'jstl', 'taglib', 'jspwriter'],
  'STRUTS': ['struts', 'actionform', 'struts-config', 'actionforward'],
  'JDBC': ['jdbc', 'drivermanager', 'preparedstatement', 'resultset', 'java.sql'],
  'HIBERNATE': ['hibernate', 'sessionfactory', 'hbm.xml', 'hibernateutil', 'criteria'],
  'JPA': ['jpa', '@entity', 'entitymanager', 'persistence.xml', 'jpql'],
  'JMS': ['jms', 'messagelistener', 'queue', 'topic', 'activemq', 'rabbitmq'],
  'SOAP': ['soap', 'wsdl', 'jax-ws', '@webservice', 'soapmessage', 'jaxws'],
  'JAX_RS': ['jax-rs', '@path', '@get', '@post', 'jersey', 'resteasy'],
  'RMI': ['rmi', 'unicastremoteobject', 'remoteexception', 'remote'],
  'CORBA': ['corba', 'portableremoteobject', 'org.omg', 'idl'],
  'JCA': ['jca', 'javax.resource', 'managedconnection', 'connector'],
  'JNDI': ['jndi', 'initialcontext', 'javax.naming', 'lookup'],
  'JSF': ['jsf', 'javax.faces', 'managedbean', 'faces-config', 'primefaces', 'richfaces'],
  'SPRING_XML': ['spring', 'applicationcontext', 'spring-beans', 'classpathxml'],
  'JAVA_BATCH': ['batch', 'javax.batch', 'job.xml', 'batchlet'],
  'JMX': ['jmx', 'mbean', 'javax.management'],
  'GWT': ['gwt', 'google web toolkit'],
  'VAADIN': ['vaadin'],
  'WICKET': ['wicket'],
};

function detectTechnologies(name, description, topics) {
  const text = `${name} ${description || ''} ${(topics || []).join(' ')}`.toLowerCase();
  const techs = [];
  for (const [tech, keywords] of Object.entries(TECH_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      techs.push(tech);
    }
  }
  // Ensure at least one tech
  if (techs.length === 0) {
    const fallbacks = ['EJB_3X_STATELESS', 'SERVLET', 'JDBC', 'HIBERNATE', 'JPA', 'SOAP', 'JMS'];
    techs.push(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
  }
  return techs;
}

// ============================================================
// GitHub API scraping (5,000 repos)
// ============================================================

function githubRequest(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'EJB-Modernizer-Scraper/1.0',
        'Accept': 'application/vnd.github.v3+json',
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, headers: res.headers });
        }
      });
    }).on('error', reject);
  });
}

async function scrapeGitHubRepos() {
  console.log('[GitHub] Starting scrape for real Java legacy repos...');
  const repos = new Map(); // name -> repo data (deduplicate)
  
  for (let qi = 0; qi < GITHUB_QUERIES.length && repos.size < GITHUB_REAL_TARGET; qi++) {
    const query = GITHUB_QUERIES[qi];
    const maxPages = Math.min(10, Math.ceil((GITHUB_REAL_TARGET - repos.size) / 100));
    
    for (let page = 1; page <= maxPages && repos.size < GITHUB_REAL_TARGET; page++) {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=100&page=${page}`;
      
      try {
        const { status, data, headers } = await githubRequest(url);
        
        if (status === 403 || status === 429) {
          // Rate limited — wait and continue with generated data
          console.log(`[GitHub] Rate limited at ${repos.size} repos. Continuing with what we have.`);
          break;
        }
        
        if (status !== 200 || !data || !data.items) {
          break;
        }
        
        for (const item of data.items) {
          if (repos.size >= GITHUB_REAL_TARGET) break;
          if (repos.has(item.full_name)) continue;
          
          const techs = detectTechnologies(item.name, item.description, item.topics);
          const fileCount = Math.max(5, Math.min(500, Math.floor((item.size || 100) / 10)));
          const totalLines = fileCount * Math.floor(50 + Math.random() * 150);
          
          repos.set(item.full_name, {
            name: item.name,
            description: item.description ? item.description.substring(0, 500) : `Java legacy project (${techs.join(', ')})`,
            status: 'active',
            technologies: techs,
            fileCount,
            totalLines,
            gitUrl: item.html_url,
            gitProvider: 'github',
            gitBranch: item.default_branch || 'main',
            legacyScore: Math.floor(40 + Math.random() * 55),
            modernScore: Math.floor(5 + Math.random() * 40),
          });
        }
        
        console.log(`[GitHub] Query ${qi+1}/${GITHUB_QUERIES.length} page ${page}: ${repos.size} repos collected`);
        
        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 1200));
        
      } catch (err) {
        console.warn(`[GitHub] Error on query "${query}" page ${page}:`, err.message);
        break;
      }
    }
  }
  
  console.log(`[GitHub] Scraped ${repos.size} real repos from GitHub`);
  return Array.from(repos.values());
}

// ============================================================
// Generated enterprise projects (5,000)
// ============================================================

// Realistic enterprise project name patterns
const PREFIXES = [
  'interface', 'service', 'module', 'api', 'gateway', 'batch', 'core', 'lib',
  'connector', 'adapter', 'bridge', 'proxy', 'facade', 'engine', 'processor',
  'handler', 'manager', 'controller', 'worker', 'scheduler', 'dispatcher',
  'transformer', 'validator', 'calculator', 'aggregator', 'notifier', 'monitor',
];

const DOMAINS_BANKING = [
  'credit', 'debit', 'virement', 'paiement', 'compte', 'solde', 'carte',
  'chequier', 'epargne', 'pret', 'hypotheque', 'assurance-vie', 'placement',
  'bourse', 'trading', 'forex', 'swift', 'sepa', 'compensation', 'clearing',
  'kyc', 'aml', 'conformite', 'risque', 'scoring', 'recouvrement', 'contentieux',
  'remise', 'encaissement', 'decaissement', 'tresorerie', 'liquidite',
  'reporting-bam', 'reporting-acaps', 'reporting-ammc', 'bilan', 'comptabilite',
  'facture', 'prelevement', 'mandat', 'opposition', 'reclamation', 'litige',
  'agence', 'guichet', 'dab', 'gab', 'mobile-banking', 'web-banking',
  'monetique', 'tpe', 'pos', 'e-commerce', 'marketplace', 'wallet',
  'transfert-international', 'change', 'devise', 'cours', 'cotation',
  'garantie', 'caution', 'nantissement', 'hypotheque-maritime',
  'leasing', 'factoring', 'affacturage', 'escompte', 'traite',
  'succession', 'procuration', 'mandat-gestion', 'tutelle',
  'ouverture-compte', 'cloture-compte', 'modification-signataire',
  'plafond', 'autorisation', 'decouvert', 'facilite-caisse',
];

const DOMAINS_INSURANCE = [
  'police', 'sinistre', 'indemnisation', 'prime', 'cotisation', 'souscription',
  'resiliation', 'avenant', 'attestation', 'quittance', 'decompte',
  'expertise', 'evaluation', 'franchise', 'plafond-garantie', 'exclusion',
  'reassurance', 'coassurance', 'pool', 'traite-reassurance',
  'auto', 'habitation', 'sante', 'prevoyance', 'retraite', 'deces',
  'multirisque', 'responsabilite-civile', 'protection-juridique',
  'voyage', 'rapatriement', 'assistance', 'annulation',
  'flotte', 'transport', 'marchandise', 'maritime', 'aerien',
  'construction', 'decennale', 'dommage-ouvrage', 'tous-risques-chantier',
];

const DOMAINS_TELECOM = [
  'abonnement', 'forfait', 'recharge', 'facturation', 'mediation',
  'provisioning', 'activation', 'portabilite', 'resiliation-ligne',
  'roaming', 'interconnexion', 'terminaison', 'collecte',
  'fibre', 'adsl', 'mobile', '4g', '5g', 'iot', 'voip', 'sip',
  'crm-client', 'selfcare', 'boutique', 'sav', 'reclamation-telecom',
  'inventory', 'network-management', 'alarm', 'incident', 'trouble-ticket',
  'rating', 'charging', 'balance', 'top-up', 'bundle',
  'campaign', 'loyalty', 'retention', 'churn', 'upsell',
];

const DOMAINS_RETAIL = [
  'catalogue', 'produit', 'stock', 'inventaire', 'approvisionnement',
  'commande', 'livraison', 'expedition', 'retour', 'remboursement',
  'panier', 'checkout', 'promotion', 'coupon', 'fidelite',
  'magasin', 'caisse', 'ticket', 'avoir', 'bon-achat',
  'fournisseur', 'achat', 'negociation', 'appel-offre', 'contrat',
  'entrepot', 'logistique', 'transport', 'tracking', 'derniere-mile',
];

const DOMAINS_HEALTH = [
  'patient', 'dossier-medical', 'consultation', 'prescription', 'ordonnance',
  'hospitalisation', 'admission', 'sortie', 'transfert', 'urgence',
  'laboratoire', 'analyse', 'resultat', 'imagerie', 'radiologie',
  'pharmacie', 'dispensation', 'stock-medicament', 'peremption',
  'facturation-hopital', 'tarification', 'codage-acte', 'groupage',
  'planning', 'rendez-vous', 'agenda', 'bloc-operatoire', 'lit',
];

const DOMAINS_PUBLIC = [
  'etat-civil', 'naissance', 'mariage', 'deces', 'nationalite',
  'impot', 'taxe', 'declaration', 'recouvrement-fiscal', 'controle',
  'permis', 'autorisation', 'licence', 'agrement', 'homologation',
  'marche-public', 'appel-offre-public', 'soumission', 'attribution',
  'cadastre', 'foncier', 'titre', 'immatriculation', 'conservation',
  'pension', 'allocation', 'aide-sociale', 'bourse-etude', 'subvention',
];

const ALL_DOMAINS = [
  ...DOMAINS_BANKING, ...DOMAINS_INSURANCE, ...DOMAINS_TELECOM,
  ...DOMAINS_RETAIL, ...DOMAINS_HEALTH, ...DOMAINS_PUBLIC,
];

const SUFFIXES = [
  '', '-service', '-api', '-batch', '-connector', '-legacy', '-core',
  '-ejb', '-ws', '-backend', '-server', '-app', '-module', '-system',
  '-direct', '-online', '-mobile', '-web', '-portal', '-admin',
  '-bo', '-fo', '-middleware', '-integration', '-sync', '-export',
  '-import', '-migration', '-reporting', '-analytics', '-dashboard',
];

const ORGS = [
  'bmce', 'bnp', 'sgma', 'cih', 'cdm', 'bp', 'cab', 'cfg', 'wafa',
  'axa', 'rma', 'saham', 'atlanta', 'mamda', 'mcma', 'cnia',
  'iam', 'inwi', 'orange-ma', 'maroc-telecom',
  'onee', 'oncf', 'ram', 'onda', 'anrt', 'hcp', 'cnss', 'cimr',
  'ocp', 'managem', 'cosumar', 'lafarge', 'holcim', 'sonasid',
  'marjane', 'acima', 'label-vie', 'carrefour-ma', 'bim',
  'lydec', 'amendis', 'redal', 'radeema', 'radeef',
  'chu', 'cnops', 'anam', 'fmsar', 'ministere-sante',
  'tgr', 'dgi', 'douane', 'adii', 'ancfcc', 'cdc',
  'societe-generale', 'credit-agricole', 'banque-populaire',
  'natixis', 'hsbc', 'citibank', 'jpmorgan', 'barclays',
  'allianz', 'generali', 'zurich', 'swiss-re', 'munich-re',
  'vodafone', 'telefonica', 't-mobile', 'at-and-t', 'verizon',
  'carrefour', 'auchan', 'leclerc', 'intermarche', 'casino',
];

const TECH_COMBOS = [
  ['EJB_3X_STATELESS', 'JPA', 'HIBERNATE'],
  ['EJB_3X_STATELESS', 'JDBC'],
  ['EJB_3X_STATELESS', 'SOAP', 'JPA'],
  ['EJB_2X', 'JDBC', 'SERVLET'],
  ['SERVLET', 'JSP', 'JDBC'],
  ['SERVLET', 'HIBERNATE', 'JPA'],
  ['STRUTS', 'HIBERNATE', 'JDBC'],
  ['STRUTS', 'JSP', 'JDBC'],
  ['JSF', 'JPA', 'EJB_3X_STATELESS'],
  ['JSF', 'HIBERNATE'],
  ['SOAP', 'EJB_3X_STATELESS', 'JPA'],
  ['SOAP', 'JDBC'],
  ['SOAP', 'HIBERNATE', 'JMS'],
  ['JMS', 'EJB_3X_STATELESS', 'JDBC'],
  ['JMS', 'HIBERNATE', 'JPA'],
  ['JAX_RS', 'JPA', 'HIBERNATE'],
  ['JAX_RS', 'EJB_3X_STATELESS'],
  ['SPRING_XML', 'HIBERNATE', 'JDBC'],
  ['SPRING_XML', 'JPA'],
  ['RMI', 'JDBC'],
  ['CORBA', 'EJB_2X'],
  ['JCA', 'EJB_3X_STATELESS', 'JMS'],
  ['JAVA_BATCH', 'JDBC', 'JPA'],
  ['GWT', 'EJB_3X_STATELESS', 'JPA'],
  ['VAADIN', 'JPA', 'HIBERNATE'],
  ['WICKET', 'HIBERNATE', 'JDBC'],
  ['EJB_3X_STATELESS', 'SOAP', 'JMS', 'JPA', 'HIBERNATE'],
  ['SERVLET', 'JSP', 'STRUTS', 'JDBC', 'HIBERNATE'],
  ['EJB_3X_STATELESS', 'JAX_RS', 'JPA', 'JMS'],
  ['SOAP', 'EJB_3X_STATELESS', 'JDBC', 'JNDI'],
];

const DESCRIPTIONS_TEMPLATES = [
  'Projet analysé via Agent IA ({uc} UC, {dto} DTOs)',
  'Module legacy {domain} — migration vers Spring Boot microservices',
  'Service {domain} — architecture monolithique J2EE',
  'Application enterprise {domain} — EAR déployé sur {server}',
  'Backend {domain} — {tech} stack, {files} classes Java',
  'Système de gestion {domain} — intégration multi-canal',
  'Plateforme {domain} — traitement batch et temps réel',
  'API {domain} — exposition services métier via {protocol}',
  'Connecteur {domain} — interface avec systèmes partenaires',
  'Module transactionnel {domain} — haute disponibilité',
];

const SERVERS = ['WebLogic 12c', 'WebSphere 9', 'JBoss EAP 7', 'WildFly 26', 'GlassFish 5', 'TomEE 9', 'Payara 6'];
const PROTOCOLS = ['SOAP/WSDL', 'REST/JSON', 'JMS/MQ', 'RMI/IIOP', 'gRPC'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateProjectName(index) {
  const useOrg = Math.random() < 0.3;
  const prefix = randomChoice(PREFIXES);
  const domain = randomChoice(ALL_DOMAINS);
  const suffix = randomChoice(SUFFIXES);
  const org = useOrg ? `${randomChoice(ORGS)}-` : '';
  
  let name = `${org}${prefix}-${domain}${suffix}`;
  // Ensure uniqueness by appending index if needed
  if (Math.random() < 0.1) {
    name += `-${index}`;
  }
  return name.replace(/--+/g, '-').replace(/-$/, '');
}

function generateDescription(techs, fileCount) {
  const template = randomChoice(DESCRIPTIONS_TEMPLATES);
  return template
    .replace('{uc}', String(randomInt(3, 45)))
    .replace('{dto}', String(randomInt(0, 80)))
    .replace('{domain}', randomChoice(ALL_DOMAINS))
    .replace('{server}', randomChoice(SERVERS))
    .replace('{tech}', techs[0])
    .replace('{files}', String(fileCount))
    .replace('{protocol}', randomChoice(PROTOCOLS));
}

function generateEnterpriseProjects(count) {
  console.log(`[Generator] Generating ${count} realistic enterprise projects...`);
  const projects = [];
  const usedNames = new Set();
  
  for (let i = 0; i < count; i++) {
    let name = generateProjectName(i);
    // Ensure unique name
    while (usedNames.has(name)) {
      name = generateProjectName(i) + `-${randomInt(1, 999)}`;
    }
    usedNames.add(name);
    
    const techs = randomChoice(TECH_COMBOS);
    const fileCount = randomInt(5, 350);
    const totalLines = fileCount * randomInt(60, 200);
    const legacyScore = randomInt(35, 95);
    const modernScore = Math.max(0, Math.min(100, 100 - legacyScore + randomInt(-15, 15)));
    
    const statuses = ['active', 'active', 'active', 'active', 'completed', 'archived'];
    const status = randomChoice(statuses);
    
    const description = generateDescription(techs, fileCount);
    
    // Some have git URLs (simulated)
    const hasGit = Math.random() < 0.4;
    const gitProvider = hasGit ? randomChoice(['github', 'gitlab', 'bitbucket', 'azure_devops']) : null;
    const gitUrl = hasGit ? `https://${gitProvider === 'github' ? 'github.com' : gitProvider === 'gitlab' ? 'gitlab.com' : gitProvider === 'bitbucket' ? 'bitbucket.org' : 'dev.azure.com'}/${randomChoice(ORGS)}/${name}` : null;
    
    projects.push({
      name,
      description,
      status,
      technologies: techs,
      fileCount,
      totalLines,
      gitUrl,
      gitProvider,
      gitBranch: hasGit ? randomChoice(['main', 'master', 'develop']) : null,
      legacyScore,
      modernScore,
    });
    
    if ((i + 1) % 1000 === 0) {
      console.log(`[Generator] Generated ${i + 1}/${count} projects`);
    }
  }
  
  return projects;
}

// ============================================================
// Database insertion
// ============================================================

async function getConnection() {
  // Read DATABASE_URL from the running server's env
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set. Run with: source .env && node scripts/import-10k-projects.mjs');
  }
  return mysql.createConnection(dbUrl);
}

async function insertProjectsBatch(conn, projects) {
  if (projects.length === 0) return 0;
  
  const sql = `INSERT INTO projects (name, description, status, technologies, fileCount, totalLines, gitUrl, gitProvider, gitBranch, legacyScore, modernScore, lastAnalyzedAt, createdAt, updatedAt) VALUES ?`;
  
  const now = new Date();
  const values = projects.map(p => [
    p.name.substring(0, 255),
    (p.description || '').substring(0, 65000),
    p.status || 'active',
    JSON.stringify(p.technologies || []),
    p.fileCount || 0,
    p.totalLines || 0,
    p.gitUrl || null,
    p.gitProvider || null,
    p.gitBranch || null,
    p.legacyScore || null,
    p.modernScore || null,
    now,
    now,
    now,
  ]);
  
  const [result] = await conn.query(sql, [values]);
  return result.affectedRows;
}

async function insertAllProjects(conn, projects) {
  let inserted = 0;
  for (let i = 0; i < projects.length; i += BATCH_SIZE) {
    const batch = projects.slice(i, i + BATCH_SIZE);
    const count = await insertProjectsBatch(conn, batch);
    inserted += count;
    console.log(`[DB] Inserted batch ${Math.floor(i/BATCH_SIZE) + 1}: ${inserted}/${projects.length} total`);
  }
  return inserted;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('='.repeat(60));
  console.log('EJB Client Modernizer — Import 10,000 Projects');
  console.log('='.repeat(60));
  console.log(`Target: ${GITHUB_REAL_TARGET} real (GitHub) + ${GENERATED_TARGET} generated = ${GITHUB_REAL_TARGET + GENERATED_TARGET} total`);
  console.log('');
  
  // Step 1: Scrape GitHub
  let githubProjects = [];
  try {
    githubProjects = await scrapeGitHubRepos();
  } catch (err) {
    console.warn('[GitHub] Scraping failed, will generate all projects:', err.message);
  }
  
  // If GitHub didn't yield enough, supplement with more generated
  const githubShortfall = GITHUB_REAL_TARGET - githubProjects.length;
  const totalGenerated = GENERATED_TARGET + Math.max(0, githubShortfall);
  
  console.log(`\n[Summary] GitHub: ${githubProjects.length} repos | To generate: ${totalGenerated}`);
  
  // Step 2: Generate enterprise projects
  const generatedProjects = generateEnterpriseProjects(totalGenerated);
  
  // Combine all
  const allProjects = [...githubProjects, ...generatedProjects];
  console.log(`\n[Total] ${allProjects.length} projects ready for insertion`);
  
  // Step 3: Insert into database
  const conn = await getConnection();
  
  try {
    // Check current count
    const [rows] = await conn.query('SELECT COUNT(*) as cnt FROM projects');
    console.log(`[DB] Current project count: ${rows[0].cnt}`);
    
    // Insert all
    const inserted = await insertAllProjects(conn, allProjects);
    
    // Verify final count
    const [finalRows] = await conn.query('SELECT COUNT(*) as cnt FROM projects');
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[DONE] Inserted ${inserted} projects`);
    console.log(`[DONE] Total projects in DB: ${finalRows[0].cnt}`);
    console.log('='.repeat(60));
    
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
