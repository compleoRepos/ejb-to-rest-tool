/**
 * Insert 10,000 projects into the database.
 * - Uses GitHub CLI to fetch real Java legacy repos (5,000 target)
 * - Generates realistic enterprise projects for the rest
 * 
 * Usage: node --experimental-modules scripts/insert-10k.mjs
 */

import { createConnection } from 'mysql2/promise';
import { execSync } from 'child_process';

// ============================================================
// Configuration
// ============================================================

const TOTAL_TARGET = 10000;
const BATCH_SIZE = 500;

// ============================================================
// Real GitHub repos via gh CLI
// ============================================================

function fetchGitHubRepos() {
  console.log('[GitHub] Fetching real Java legacy repos via gh CLI...');
  const repos = [];
  
  const queries = [
    'ejb java enterprise',
    'javax.ejb stateless',
    'servlet jsp java',
    'struts java legacy',
    'hibernate java enterprise',
    'jms activemq java',
    'soap wsdl java',
    'jdbc java legacy',
    'jpa java enterprise',
    'jsf primefaces java',
    'spring xml java legacy',
    'weblogic java enterprise',
    'websphere java',
    'jboss wildfly java',
    'j2ee java application',
    'java ee microservice',
    'ejb jndi lookup',
    'rmi java remote',
    'corba java',
    'jca connector java',
    'gwt java',
    'vaadin java',
    'wicket java',
    'java batch processing',
    'jmx monitoring java',
  ];
  
  for (const query of queries) {
    if (repos.length >= 5000) break;
    try {
      const limit = Math.min(200, 5000 - repos.length);
      const cmd = `gh search repos "${query}" --language=Java --limit=${limit} --json name,description,url,defaultBranchRef,stargazersCount 2>/dev/null`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
      const items = JSON.parse(output || '[]');
      
      for (const item of items) {
        if (repos.length >= 5000) break;
        // Deduplicate by name
        if (repos.some(r => r.name === item.name)) continue;
        
        repos.push({
          name: item.name,
          description: item.description || `Java legacy project`,
          url: item.url,
          branch: item.defaultBranchRef?.name || 'main',
          stars: item.stargazersCount || 0,
        });
      }
      console.log(`[GitHub] Query "${query}": ${repos.length} repos total`);
    } catch (err) {
      console.warn(`[GitHub] Query "${query}" failed:`, err.message?.substring(0, 80));
    }
  }
  
  console.log(`[GitHub] Total real repos fetched: ${repos.length}`);
  return repos;
}

// ============================================================
// Technology detection
// ============================================================

const TECH_KEYWORDS = {
  'EJB_3X_STATELESS': ['ejb', 'stateless', 'session-bean', 'javax.ejb'],
  'EJB_2X': ['ejb2', 'ejb-jar', 'home-interface', 'entity-bean'],
  'SERVLET': ['servlet', 'httpservlet', 'web-app'],
  'JSP': ['jsp', 'jstl', 'taglib'],
  'STRUTS': ['struts', 'actionform', 'struts-config'],
  'JDBC': ['jdbc', 'drivermanager', 'preparedstatement', 'sql'],
  'HIBERNATE': ['hibernate', 'sessionfactory', 'hbm', 'criteria'],
  'JPA': ['jpa', 'entity', 'entitymanager', 'persistence'],
  'JMS': ['jms', 'activemq', 'rabbitmq', 'message-driven', 'queue'],
  'SOAP': ['soap', 'wsdl', 'jax-ws', 'webservice', 'cxf'],
  'JAX_RS': ['jax-rs', 'jersey', 'resteasy', 'rest-api'],
  'RMI': ['rmi', 'remote', 'unicast'],
  'CORBA': ['corba', 'omg', 'iiop'],
  'JCA': ['jca', 'connector', 'resource-adapter'],
  'JNDI': ['jndi', 'initialcontext', 'naming'],
  'JSF': ['jsf', 'faces', 'primefaces', 'richfaces', 'managedbean'],
  'SPRING_XML': ['spring', 'applicationcontext', 'spring-beans', 'xml-config'],
  'JAVA_BATCH': ['batch', 'batchlet', 'job-xml'],
  'JMX': ['jmx', 'mbean', 'management'],
  'GWT': ['gwt', 'google-web-toolkit'],
  'VAADIN': ['vaadin'],
  'WICKET': ['wicket'],
};

function detectTechs(name, description) {
  const text = `${name} ${description || ''}`.toLowerCase();
  const techs = [];
  for (const [tech, keywords] of Object.entries(TECH_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      techs.push(tech);
    }
  }
  if (techs.length === 0) {
    const fallbacks = ['EJB_3X_STATELESS', 'SERVLET', 'JDBC', 'HIBERNATE', 'JPA', 'SOAP', 'JMS'];
    techs.push(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
    if (Math.random() > 0.5) techs.push(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
  }
  return [...new Set(techs)];
}

// ============================================================
// Enterprise project generator
// ============================================================

const PREFIXES = [
  'interface', 'service', 'module', 'api', 'gateway', 'batch', 'core', 'lib',
  'connector', 'adapter', 'bridge', 'proxy', 'facade', 'engine', 'processor',
  'handler', 'manager', 'controller', 'worker', 'scheduler', 'dispatcher',
  'transformer', 'validator', 'calculator', 'aggregator', 'notifier', 'monitor',
];

const DOMAINS = [
  // Banking (60)
  'credit', 'debit', 'virement', 'paiement', 'compte', 'solde', 'carte',
  'chequier', 'epargne', 'pret', 'hypotheque', 'assurance-vie', 'placement',
  'bourse', 'trading', 'forex', 'swift', 'sepa', 'compensation', 'clearing',
  'kyc', 'aml', 'conformite', 'risque', 'scoring', 'recouvrement', 'contentieux',
  'remise', 'encaissement', 'decaissement', 'tresorerie', 'liquidite',
  'reporting-bam', 'bilan', 'comptabilite', 'facture', 'prelevement',
  'opposition', 'reclamation', 'litige', 'agence', 'guichet', 'dab',
  'mobile-banking', 'web-banking', 'monetique', 'tpe', 'e-commerce',
  'transfert-international', 'change', 'devise', 'garantie', 'caution',
  'leasing', 'factoring', 'affacturage', 'escompte', 'traite',
  'ouverture-compte', 'cloture-compte', 'plafond', 'decouvert',
  // Insurance (30)
  'police', 'sinistre', 'indemnisation', 'prime', 'cotisation', 'souscription',
  'resiliation', 'avenant', 'attestation', 'quittance', 'decompte',
  'expertise', 'franchise', 'reassurance', 'coassurance',
  'auto', 'habitation', 'sante', 'prevoyance', 'retraite', 'deces',
  'multirisque', 'responsabilite-civile', 'protection-juridique',
  'voyage', 'rapatriement', 'assistance', 'flotte', 'transport', 'maritime',
  // Telecom (25)
  'abonnement', 'forfait', 'recharge', 'facturation-telecom', 'mediation',
  'provisioning', 'activation', 'portabilite', 'roaming', 'interconnexion',
  'fibre', 'adsl', 'mobile', 'voip', 'sip', 'crm-client', 'selfcare',
  'inventory', 'network-management', 'alarm', 'incident',
  'rating', 'charging', 'balance', 'loyalty',
  // Retail (20)
  'catalogue', 'produit', 'stock', 'inventaire', 'approvisionnement',
  'commande', 'livraison', 'expedition', 'retour', 'remboursement',
  'panier', 'checkout', 'promotion', 'coupon', 'fidelite',
  'magasin', 'caisse', 'ticket', 'fournisseur', 'logistique',
  // Health (15)
  'patient', 'dossier-medical', 'consultation', 'prescription', 'ordonnance',
  'hospitalisation', 'admission', 'laboratoire', 'analyse', 'imagerie',
  'pharmacie', 'dispensation', 'planning', 'rendez-vous', 'bloc-operatoire',
  // Public (15)
  'etat-civil', 'impot', 'taxe', 'declaration', 'permis',
  'marche-public', 'cadastre', 'foncier', 'immatriculation',
  'pension', 'allocation', 'aide-sociale', 'bourse-etude', 'subvention', 'douane',
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
  'iam', 'inwi', 'orange', 'maroc-telecom',
  'onee', 'oncf', 'ram', 'onda', 'anrt', 'hcp', 'cnss', 'cimr',
  'ocp', 'managem', 'cosumar', 'lafarge', 'holcim', 'sonasid',
  'marjane', 'acima', 'label-vie', 'carrefour', 'bim',
  'lydec', 'amendis', 'redal', 'radeema', 'radeef',
  'chu', 'cnops', 'anam', 'tgr', 'dgi', 'adii', 'ancfcc', 'cdc',
  'sg', 'ca', 'natixis', 'hsbc', 'citi', 'jpmorgan', 'barclays',
  'allianz', 'generali', 'zurich', 'swiss-re', 'munich-re',
  'vodafone', 'telefonica', 'tmobile', 'verizon',
  'carrefour-eu', 'auchan', 'leclerc', 'casino',
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

const DESC_TEMPLATES = [
  'Projet analysé via Agent IA ({uc} UC, {dto} DTOs)',
  'Module legacy {domain} — migration Spring Boot',
  'Service {domain} — architecture monolithique J2EE',
  'Application enterprise {domain} — EAR {server}',
  'Backend {domain} — {tech} stack',
  'Système {domain} — intégration multi-canal',
  'Plateforme {domain} — traitement batch/temps réel',
  'API {domain} — exposition services métier',
  'Connecteur {domain} — interface partenaires',
  'Module transactionnel {domain} — haute disponibilité',
];

const SERVERS = ['WebLogic 12c', 'WebSphere 9', 'JBoss EAP 7', 'WildFly 26', 'GlassFish 5', 'TomEE 9'];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateProjects(count, existingNames) {
  console.log(`[Generator] Generating ${count} enterprise projects...`);
  const projects = [];
  const usedNames = new Set(existingNames);
  
  for (let i = 0; i < count; i++) {
    // Generate unique name
    let name;
    let attempts = 0;
    do {
      const useOrg = Math.random() < 0.3;
      const org = useOrg ? `${pick(ORGS)}-` : '';
      name = `${org}${pick(PREFIXES)}-${pick(DOMAINS)}${pick(SUFFIXES)}`;
      if (attempts > 5) name += `-${rand(1, 9999)}`;
      attempts++;
    } while (usedNames.has(name));
    usedNames.add(name);
    
    const techs = pick(TECH_COMBOS);
    const fileCount = rand(5, 350);
    const totalLines = fileCount * rand(60, 200);
    const legacyScore = rand(35, 95);
    const modernScore = Math.max(5, Math.min(100, 100 - legacyScore + rand(-15, 15)));
    const status = pick(['active', 'active', 'active', 'active', 'completed', 'archived']);
    
    const desc = pick(DESC_TEMPLATES)
      .replace('{uc}', String(rand(3, 45)))
      .replace('{dto}', String(rand(0, 80)))
      .replace('{domain}', pick(DOMAINS))
      .replace('{server}', pick(SERVERS))
      .replace('{tech}', techs[0]);
    
    const hasGit = Math.random() < 0.4;
    const gitProvider = hasGit ? pick(['github', 'gitlab', 'bitbucket', 'azure_devops']) : null;
    const gitHost = gitProvider === 'github' ? 'github.com' : gitProvider === 'gitlab' ? 'gitlab.com' : gitProvider === 'bitbucket' ? 'bitbucket.org' : 'dev.azure.com';
    const gitUrl = hasGit ? `https://${gitHost}/${pick(ORGS)}/${name}` : null;
    
    projects.push({
      name: name.substring(0, 255),
      description: desc.substring(0, 500),
      status,
      technologies: JSON.stringify(techs),
      fileCount,
      totalLines,
      gitUrl,
      gitProvider,
      gitBranch: hasGit ? pick(['main', 'master', 'develop']) : null,
      legacyScore,
      modernScore,
    });
    
    if ((i + 1) % 1000 === 0) console.log(`[Generator] ${i + 1}/${count}`);
  }
  return projects;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('='.repeat(60));
  console.log('EJB Client Modernizer — Import 10,000 Projects');
  console.log('='.repeat(60));
  
  // Connect to DB
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL not set');
    process.exit(1);
  }
  
  const conn = await createConnection(dbUrl);
  console.log('[DB] Connected');
  
  // Current count
  const [countRows] = await conn.query('SELECT COUNT(*) as cnt FROM projects');
  const currentCount = parseInt(countRows[0].cnt);
  console.log(`[DB] Current projects: ${currentCount}`);
  
  const needed = TOTAL_TARGET - currentCount;
  if (needed <= 0) {
    console.log(`[DB] Already at ${currentCount} projects (target: ${TOTAL_TARGET}). Done!`);
    await conn.end();
    return;
  }
  console.log(`[DB] Need to add: ${needed} projects`);
  
  // Step 1: Fetch real GitHub repos
  let githubRepos = [];
  try {
    githubRepos = fetchGitHubRepos();
  } catch (err) {
    console.warn('[GitHub] Failed:', err.message);
  }
  
  // Convert GitHub repos to project format
  const githubProjects = githubRepos.slice(0, Math.min(githubRepos.length, Math.ceil(needed / 2))).map(r => {
    const techs = detectTechs(r.name, r.description);
    const fileCount = rand(5, 300);
    const totalLines = fileCount * rand(60, 180);
    return {
      name: r.name.substring(0, 255),
      description: (r.description || `Java legacy project`).substring(0, 500),
      status: 'active',
      technologies: JSON.stringify(techs),
      fileCount,
      totalLines,
      gitUrl: r.url,
      gitProvider: 'github',
      gitBranch: r.branch || 'main',
      legacyScore: rand(40, 90),
      modernScore: rand(5, 35),
    };
  });
  
  console.log(`[GitHub] Prepared ${githubProjects.length} real projects`);
  
  // Step 2: Generate remaining
  const remaining = needed - githubProjects.length;
  const existingNames = new Set(githubProjects.map(p => p.name));
  const generatedProjects = generateProjects(remaining, existingNames);
  
  // Combine
  const allProjects = [...githubProjects, ...generatedProjects];
  console.log(`[Total] ${allProjects.length} projects to insert`);
  
  // Step 3: Batch insert
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let inserted = 0;
  
  for (let i = 0; i < allProjects.length; i += BATCH_SIZE) {
    const batch = allProjects.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const values = batch.flatMap(p => [
      p.name, p.description, p.status, p.technologies,
      p.fileCount, p.totalLines, p.gitUrl, p.gitProvider, p.gitBranch,
      p.legacyScore, p.modernScore, now, now, now,
    ]);
    
    const sql = `INSERT INTO projects (name, description, status, technologies, fileCount, totalLines, gitUrl, gitProvider, gitBranch, legacyScore, modernScore, lastAnalyzedAt, createdAt, updatedAt) VALUES ${placeholders}`;
    
    try {
      const [result] = await conn.query(sql, values);
      inserted += result.affectedRows;
      console.log(`[DB] Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${inserted}/${allProjects.length} inserted`);
    } catch (err) {
      console.error(`[DB] Batch error:`, err.message?.substring(0, 200));
      // Try one by one for this batch
      for (const p of batch) {
        try {
          await conn.query(
            'INSERT INTO projects (name, description, status, technologies, fileCount, totalLines, gitUrl, gitProvider, gitBranch, legacyScore, modernScore, lastAnalyzedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [p.name, p.description, p.status, p.technologies, p.fileCount, p.totalLines, p.gitUrl, p.gitProvider, p.gitBranch, p.legacyScore, p.modernScore, now, now, now]
          );
          inserted++;
        } catch (e) {
          // Skip duplicates
        }
      }
      console.log(`[DB] After individual inserts: ${inserted}/${allProjects.length}`);
    }
  }
  
  // Final count
  const [finalRows] = await conn.query('SELECT COUNT(*) as cnt FROM projects');
  console.log('\n' + '='.repeat(60));
  console.log(`[DONE] Inserted: ${inserted} projects`);
  console.log(`[DONE] Total in DB: ${finalRows[0].cnt}`);
  console.log('='.repeat(60));
  
  await conn.end();
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
