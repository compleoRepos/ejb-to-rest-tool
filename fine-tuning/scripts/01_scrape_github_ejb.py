#!/usr/bin/env python3
"""
Script 1/6 — Scraper GitHub MASSIF pour extraire du code Java Legacy.

Couvre TOUTES les technologies legacy Java :
  - EJB 2.x / 3.x (Stateless, Stateful, MDB, Entity Beans)
  - Servlets / JSP / Filters / Listeners
  - Struts 1.x / 2.x (Actions, ActionForms, struts-config.xml)
  - JDBC brut (DriverManager, PreparedStatement, ResultSet)
  - Hibernate HQL / Criteria API legacy
  - JMS (MessageListener, QueueSender, TopicPublisher)
  - SOAP / JAX-WS (@WebService, @WebMethod, WSDL)
  - JAX-RPC (Service, Stub, ServiceFactory)
  - CORBA / RMI (Remote, UnicastRemoteObject, PortableRemoteObject)
  - JCA (ResourceAdapter, ConnectionFactory)
  - JNDI lookups (InitialContext, lookup)
  - Java Batch (JSR-352, ItemReader, ItemWriter)
  - JMX (MBean, MBeanServer)
  - JSF 1.x / 2.x (ManagedBean, FacesContext)
  - Spring XML config legacy (applicationContext.xml)

Objectif : 5,000-10,000 fichiers sources uniques pour constituer
un dataset d'entrainement de 20,000+ paires.

Usage:
    python3 01_scrape_github_ejb.py --output ./dataset/raw_legacy --max-repos 5000

Prerequis:
    pip install requests PyGithub
    export GITHUB_TOKEN=ghp_xxxxx  (FORTEMENT recommande pour le rate limit)
"""

import os
import sys
import json
import time
import argparse
import hashlib
import logging
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

try:
    from github import Github, GithubException, RateLimitExceededException
    import requests
except ImportError:
    print("Installing dependencies...")
    os.system("pip install PyGithub requests")
    from github import Github, GithubException, RateLimitExceededException
    import requests

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("scraping.log", encoding="utf-8"),
    ]
)
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# TAXONOMIE COMPLETE DES TECHNOLOGIES LEGACY JAVA
# ═══════════════════════════════════════════════════════════════════════════════

LEGACY_CATEGORIES = {
    # ─── EJB ──────────────────────────────────────────────────────────────
    "ejb_stateless": {
        "indicators": ["@Stateless", "implements SessionBean", "SessionBean"],
        "min_match": 1,
        "imports": ["javax.ejb", "jakarta.ejb"],
    },
    "ejb_stateful": {
        "indicators": ["@Stateful"],
        "min_match": 1,
        "imports": ["javax.ejb", "jakarta.ejb"],
    },
    "ejb_mdb": {
        "indicators": ["@MessageDriven", "implements MessageDrivenBean", "MessageListener"],
        "min_match": 1,
        "imports": ["javax.ejb", "javax.jms"],
    },
    "ejb_entity": {
        "indicators": ["implements EntityBean", "EntityBean", "@Entity"],
        "min_match": 1,
        "imports": ["javax.ejb", "javax.persistence"],
    },
    "ejb_singleton": {
        "indicators": ["@Singleton", "@Startup"],
        "min_match": 1,
        "imports": ["javax.ejb", "jakarta.ejb"],
    },
    "ejb_timer": {
        "indicators": ["@Schedule", "@Timeout", "TimerService"],
        "min_match": 1,
        "imports": ["javax.ejb"],
    },
    "ejb_interceptor": {
        "indicators": ["@Interceptor", "@AroundInvoke", "@Interceptors"],
        "min_match": 1,
        "imports": ["javax.interceptor", "javax.ejb"],
    },
    # ─── Servlets / JSP ──────────────────────────────────────────────────
    "servlet": {
        "indicators": ["extends HttpServlet", "doGet(", "doPost(", "@WebServlet"],
        "min_match": 1,
        "imports": ["javax.servlet", "jakarta.servlet"],
    },
    "servlet_filter": {
        "indicators": ["implements Filter", "doFilter(", "@WebFilter"],
        "min_match": 1,
        "imports": ["javax.servlet", "jakarta.servlet"],
    },
    "servlet_listener": {
        "indicators": ["implements ServletContextListener", "implements HttpSessionListener",
                       "@WebListener", "contextInitialized("],
        "min_match": 1,
        "imports": ["javax.servlet", "jakarta.servlet"],
    },
    "jsp_taglib": {
        "indicators": ["extends TagSupport", "extends BodyTagSupport", "extends SimpleTagSupport"],
        "min_match": 1,
        "imports": ["javax.servlet.jsp"],
    },
    # ─── Struts ──────────────────────────────────────────────────────────
    "struts1_action": {
        "indicators": ["extends Action", "extends DispatchAction", "extends MappingDispatchAction",
                       "ActionForm", "ActionForward", "ActionMapping"],
        "min_match": 2,
        "imports": ["org.apache.struts"],
    },
    "struts2_action": {
        "indicators": ["extends ActionSupport", "implements Action", "ActionContext",
                       "@Action", "@Result", "@Results"],
        "min_match": 1,
        "imports": ["com.opensymphony.xwork2", "org.apache.struts2"],
    },
    # ─── JDBC ────────────────────────────────────────────────────────────
    "jdbc_dao": {
        "indicators": ["DriverManager.getConnection", "PreparedStatement", "ResultSet",
                       "Statement.execute", "CallableStatement", "Connection conn"],
        "min_match": 2,
        "imports": ["java.sql"],
    },
    "jdbc_datasource": {
        "indicators": ["DataSource", "getConnection()", "ConnectionPool",
                       "BasicDataSource", "ComboPooledDataSource"],
        "min_match": 2,
        "imports": ["javax.sql", "java.sql"],
    },
    # ─── Hibernate legacy ────────────────────────────────────────────────
    "hibernate_hql": {
        "indicators": ["Session.createQuery", "session.createQuery", "HQL",
                       "SessionFactory", "session.save(", "session.update(",
                       "session.delete(", "Criteria criteria", "createCriteria("],
        "min_match": 2,
        "imports": ["org.hibernate"],
    },
    "hibernate_xml_mapping": {
        "indicators": ["Configuration().configure()", "AnnotationConfiguration",
                       "hibernate.cfg.xml", "HibernateUtil"],
        "min_match": 1,
        "imports": ["org.hibernate"],
    },
    # ─── JMS ─────────────────────────────────────────────────────────────
    "jms_producer": {
        "indicators": ["QueueSender", "TopicPublisher", "MessageProducer",
                       "createTextMessage", "JMSContext", "send("],
        "min_match": 2,
        "imports": ["javax.jms", "jakarta.jms"],
    },
    "jms_consumer": {
        "indicators": ["implements MessageListener", "onMessage(", "QueueReceiver",
                       "TopicSubscriber", "MessageConsumer"],
        "min_match": 1,
        "imports": ["javax.jms", "jakarta.jms"],
    },
    # ─── SOAP / JAX-WS ──────────────────────────────────────────────────
    "soap_service": {
        "indicators": ["@WebService", "@WebMethod", "@SOAPBinding",
                       "@WebParam", "@WebResult"],
        "min_match": 1,
        "imports": ["javax.jws", "javax.xml.ws", "jakarta.jws"],
    },
    "soap_client": {
        "indicators": ["Service.create(", "getPort(", "ServiceFactory",
                       "Stub", "SOAPConnection", "SOAPMessage"],
        "min_match": 1,
        "imports": ["javax.xml.ws", "javax.xml.soap", "javax.xml.rpc"],
    },
    # ─── JAX-RPC ─────────────────────────────────────────────────────────
    "jax_rpc": {
        "indicators": ["ServiceFactory", "javax.xml.rpc", "Stub",
                       "ServiceLocator"],
        "min_match": 1,
        "imports": ["javax.xml.rpc"],
    },
    # ─── CORBA / RMI ─────────────────────────────────────────────────────
    "rmi_service": {
        "indicators": ["extends UnicastRemoteObject", "implements Remote",
                       "Naming.rebind(", "Naming.lookup(", "LocateRegistry"],
        "min_match": 1,
        "imports": ["java.rmi"],
    },
    "corba_service": {
        "indicators": ["PortableRemoteObject", "ORB.init(", "NamingContext",
                       "extends _ImplBase", "org.omg.CORBA"],
        "min_match": 1,
        "imports": ["org.omg.CORBA", "org.omg.CosNaming"],
    },
    # ─── JCA ─────────────────────────────────────────────────────────────
    "jca_adapter": {
        "indicators": ["implements ResourceAdapter", "ConnectionFactory",
                       "ManagedConnectionFactory", "@Connector", "@ConnectionDefinition"],
        "min_match": 1,
        "imports": ["javax.resource", "jakarta.resource"],
    },
    # ─── JNDI ────────────────────────────────────────────────────────────
    "jndi_lookup": {
        "indicators": ["InitialContext()", "context.lookup(", "new InitialContext",
                       "java:comp/env", "java:global/", "java:app/"],
        "min_match": 2,
        "imports": ["javax.naming"],
    },
    # ─── Java Batch (JSR-352) ────────────────────────────────────────────
    "java_batch": {
        "indicators": ["implements ItemReader", "implements ItemWriter",
                       "implements ItemProcessor", "implements Batchlet",
                       "@BatchProperty", "JobOperator"],
        "min_match": 1,
        "imports": ["javax.batch", "jakarta.batch"],
    },
    # ─── JMX ─────────────────────────────────────────────────────────────
    "jmx_mbean": {
        "indicators": ["implements MBean", "MBeanServer", "@ManagedResource",
                       "MBeanRegistration", "ObjectName"],
        "min_match": 1,
        "imports": ["javax.management"],
    },
    # ─── JSF ─────────────────────────────────────────────────────────────
    "jsf_managed_bean": {
        "indicators": ["@ManagedBean", "@ViewScoped", "@SessionScoped",
                       "@RequestScoped", "FacesContext", "FacesMessage"],
        "min_match": 1,
        "imports": ["javax.faces", "jakarta.faces"],
    },
    # ─── Spring XML legacy ───────────────────────────────────────────────
    "spring_xml_legacy": {
        "indicators": ["ClassPathXmlApplicationContext", "FileSystemXmlApplicationContext",
                       "applicationContext.xml", "XmlWebApplicationContext"],
        "min_match": 1,
        "imports": ["org.springframework.context.support"],
    },
}

# ═══════════════════════════════════════════════════════════════════════════════
# REQUETES DE RECHERCHE GITHUB — MASSIVES
# ═══════════════════════════════════════════════════════════════════════════════

# Requetes pour trouver des REPOS
REPO_SEARCH_QUERIES = [
    # EJB
    "ejb example", "ejb stateless", "ejb session bean", "ejb jpa",
    "ejb hibernate", "ejb servlet", "ejb jms", "ejb soap",
    "ejb web service", "enterprise java beans", "ejb banking",
    "ejb transaction", "ejb remote", "ejb timer", "ejb interceptor",
    "ejb mdb", "message driven bean", "stateless session bean",
    "ejb crud", "ejb dao", "ejb entity bean",
    "jboss ejb", "wildfly ejb", "glassfish ejb", "websphere ejb",
    "weblogic ejb", "ejb3 example", "ejb2 example",
    # J2EE / Java EE
    "j2ee application", "java ee application", "java ee example",
    "j2ee project", "j2ee tutorial", "java ee tutorial",
    "j2ee web application", "java ee web application",
    "j2ee enterprise", "java ee enterprise",
    "j2ee banking", "j2ee ecommerce", "j2ee crm",
    "j2ee erp", "j2ee inventory", "j2ee hospital",
    # Servlets
    "servlet example", "servlet jsp", "servlet filter",
    "servlet listener", "servlet jdbc", "servlet crud",
    "servlet login", "servlet session", "servlet mvc",
    "httpservlet example", "web servlet java",
    "servlet banking", "servlet ecommerce",
    # JSP
    "jsp servlet example", "jsp crud", "jsp jdbc",
    "jsp mysql", "jsp oracle", "jsp login",
    "jsp struts", "jsp taglib", "jstl example",
    # Struts
    "struts example", "struts action", "struts1 example",
    "struts2 example", "struts hibernate", "struts spring",
    "struts jdbc", "struts crud", "struts login",
    "struts tiles", "struts validator", "struts actionform",
    "struts dispatch action", "struts mapping",
    "apache struts java", "struts web application",
    # JDBC
    "jdbc example", "jdbc crud", "jdbc dao",
    "jdbc mysql", "jdbc oracle", "jdbc postgresql",
    "jdbc connection pool", "jdbc prepared statement",
    "jdbc transaction", "jdbc batch", "jdbc stored procedure",
    "jdbc resultset", "jdbc datasource",
    "java database connectivity", "jdbc banking",
    # Hibernate
    "hibernate example", "hibernate hql", "hibernate criteria",
    "hibernate session", "hibernate mapping", "hibernate xml",
    "hibernate cfg", "hibernate util", "hibernate dao",
    "hibernate crud", "hibernate one to many",
    "hibernate many to many", "hibernate inheritance",
    "hibernate query", "hibernate native query",
    "hibernate sessionfactory", "hibernate configuration",
    # JMS
    "jms example", "jms queue", "jms topic",
    "jms producer consumer", "jms activemq",
    "jms rabbitmq", "jms ibm mq", "jms listener",
    "jms message driven", "jms java example",
    "jms point to point", "jms publish subscribe",
    # SOAP
    "soap java example", "jax-ws example", "web service java",
    "soap client java", "wsdl java", "soap server java",
    "jax-ws server", "jax-ws client", "soap banking",
    "soap web service", "axis2 example", "cxf example",
    "metro web service", "soap jboss",
    # RMI / CORBA
    "rmi java example", "java rmi server", "rmi client server",
    "corba java example", "java corba", "rmi registry",
    "rmi remote object", "java distributed",
    # JCA
    "jca adapter", "resource adapter java", "jca connector",
    # JNDI
    "jndi lookup example", "jndi java", "jndi datasource",
    "jndi ejb lookup", "initial context java",
    # JSF
    "jsf example", "jsf managed bean", "jsf primefaces",
    "jsf crud", "jsf hibernate", "jsf ejb",
    "jsf facelets", "jsf richfaces", "jsf icefaces",
    # Java Batch
    "java batch example", "jsr 352 example", "java batch processing",
    "batch job java", "itemreader itemwriter",
    # Spring XML legacy
    "spring xml configuration", "applicationcontext xml",
    "spring xml bean", "spring legacy",
    # Projets complets legacy
    "java legacy application", "java legacy migration",
    "java legacy modernization", "java monolith",
    "java legacy refactoring", "java legacy code",
    # Projets bancaires / financiers
    "banking java application", "banking system java",
    "bank management java", "financial java",
    "payment system java", "transaction java",
    "core banking java", "banking ejb",
    "banking servlet", "banking jdbc",
    # Projets enterprise
    "erp java", "crm java", "inventory java",
    "hospital management java", "hotel management java",
    "student management java", "employee management java",
    "library management java", "ecommerce java legacy",
    "supply chain java", "insurance java",
    # Migration
    "ejb to spring", "migrate from ejb", "ejb spring migration",
    "j2ee to spring boot", "servlet to spring",
    "struts to spring", "legacy to microservices java",
    "monolith to microservices java",
    "hibernate to spring data", "jdbc to jpa",
    "soap to rest java", "jms to kafka java",
]

# Requetes pour trouver des FICHIERS via GitHub Code Search
CODE_SEARCH_QUERIES = [
    # EJB annotations
    "@Stateless public class",
    "@Stateful public class",
    "@MessageDriven public class",
    "@Singleton @Startup",
    "implements SessionBean",
    "implements EntityBean",
    "implements MessageDrivenBean",
    "@TransactionAttribute",
    "@PersistenceContext EntityManager",
    # Servlets
    "extends HttpServlet",
    "doGet HttpServletRequest",
    "doPost HttpServletRequest",
    "@WebServlet",
    "implements Filter doFilter",
    # Struts
    "extends Action execute ActionMapping",
    "extends DispatchAction",
    "extends ActionSupport",
    "ActionForm validate",
    # JDBC
    "DriverManager.getConnection",
    "PreparedStatement executeQuery",
    "ResultSet getString",
    "CallableStatement registerOutParameter",
    "Connection.prepareStatement",
    # Hibernate legacy
    "SessionFactory openSession",
    "session.createQuery HQL",
    "session.createCriteria",
    "HibernateUtil getSessionFactory",
    "Configuration configure hibernate",
    # JMS
    "QueueSender send",
    "TopicPublisher publish",
    "implements MessageListener onMessage",
    "createTextMessage",
    "QueueConnectionFactory",
    # SOAP
    "@WebService public class",
    "@WebMethod public",
    "@SOAPBinding",
    "Service.create getPort",
    "SOAPConnection call",
    # RMI
    "extends UnicastRemoteObject",
    "Naming.rebind",
    "Naming.lookup",
    "implements Remote",
    # CORBA
    "PortableRemoteObject narrow",
    "ORB.init",
    # JNDI
    "new InitialContext lookup",
    "java:comp/env",
    # JSF
    "@ManagedBean",
    "FacesContext getCurrentInstance",
    # Java Batch
    "implements ItemReader",
    "implements ItemWriter",
    "implements ItemProcessor",
    # Spring XML
    "ClassPathXmlApplicationContext",
]

# ═══════════════════════════════════════════════════════════════════════════════
# FONCTIONS UTILITAIRES
# ═══════════════════════════════════════════════════════════════════════════════

def classify_file(content: str) -> list:
    """Classifie un fichier Java dans une ou plusieurs categories legacy."""
    categories = []
    for cat_name, cat_config in LEGACY_CATEGORIES.items():
        # Verifier les imports
        has_import = any(imp in content for imp in cat_config["imports"])
        if not has_import:
            continue
        # Compter les indicateurs
        matches = sum(1 for ind in cat_config["indicators"] if ind in content)
        if matches >= cat_config["min_match"]:
            categories.append(cat_name)
    return categories


def is_legacy_java(content: str) -> bool:
    """Verifie si un fichier Java contient du code legacy."""
    return len(classify_file(content)) > 0


def file_hash(content: str) -> str:
    """Hash pour deduplication."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:16]


def extract_class_name(content: str) -> str:
    """Extrait le nom de la classe principale."""
    match = re.search(r'(?:public\s+)?(?:abstract\s+)?class\s+(\w+)', content)
    return match.group(1) if match else "Unknown"


def extract_package(content: str) -> str:
    """Extrait le package."""
    match = re.search(r'package\s+([\w.]+);', content)
    return match.group(1) if match else ""


def count_lines(content: str) -> int:
    """Compte les lignes non-vides."""
    return sum(1 for line in content.split('\n') if line.strip())


def save_file(output_dir: Path, repo_name: str, file_path: str,
              content: str, categories: list, metadata: dict = None):
    """Sauvegarde un fichier legacy avec ses metadonnees."""
    primary_cat = categories[0]
    type_dir = output_dir / primary_cat
    type_dir.mkdir(parents=True, exist_ok=True)

    safe_name = repo_name.replace("/", "__") + "__" + file_path.replace("/", "__")
    if len(safe_name) > 200:
        safe_name = safe_name[:180] + "__" + file_hash(content)[:8] + ".java"

    file_out = type_dir / safe_name
    file_out.write_text(content, encoding='utf-8')

    meta = {
        "repo": repo_name,
        "path": file_path,
        "categories": categories,
        "primary_category": primary_cat,
        "class_name": extract_class_name(content),
        "package": extract_package(content),
        "hash": file_hash(content),
        "lines": count_lines(content),
        "total_lines": content.count('\n') + 1,
        "scraped_at": datetime.utcnow().isoformat(),
        **(metadata or {}),
    }
    meta_file = type_dir / (safe_name + ".meta.json")
    meta_file.write_text(json.dumps(meta, indent=2), encoding='utf-8')

    return meta


# ═══════════════════════════════════════════════════════════════════════════════
# SCRAPER PRINCIPAL
# ═══════════════════════════════════════════════════════════════════════════════

class JavaLegacyScraper:
    def __init__(self, token: str = None, output_dir: str = "./dataset/raw_legacy"):
        self.token = token or os.environ.get("GITHUB_TOKEN", "")
        if not self.token:
            logger.warning("Pas de GITHUB_TOKEN — rate limit tres bas (60 req/h)!")
            logger.warning("Exportez GITHUB_TOKEN=ghp_xxx pour 5000 req/h")
        self.g = Github(self.token, per_page=100) if self.token else Github(per_page=100)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Charger l'etat precedent si reprise
        self.state_file = self.output_dir / "_scraper_state.json"
        self.seen_hashes = set()
        self.seen_repos = set()
        self._load_state()

        self.stats = {
            "repos_discovered": 0,
            "repos_scanned": 0,
            "repos_skipped": 0,
            "files_found": 0,
            "files_saved": 0,
            "files_duplicate": 0,
            "files_too_small": 0,
            "files_too_large": 0,
            "errors": 0,
            "by_category": {},
            "by_repo": {},
            "started_at": datetime.utcnow().isoformat(),
        }

    def _load_state(self):
        """Charge l'etat precedent pour permettre la reprise."""
        if self.state_file.exists():
            state = json.loads(self.state_file.read_text())
            self.seen_hashes = set(state.get("seen_hashes", []))
            self.seen_repos = set(state.get("seen_repos", []))
            logger.info(f"Reprise: {len(self.seen_hashes)} fichiers, {len(self.seen_repos)} repos deja traites")

    def _save_state(self):
        """Sauvegarde l'etat pour reprise."""
        state = {
            "seen_hashes": list(self.seen_hashes),
            "seen_repos": list(self.seen_repos),
            "last_saved": datetime.utcnow().isoformat(),
        }
        self.state_file.write_text(json.dumps(state), encoding='utf-8')

    def _wait_rate_limit(self):
        """Attend si le rate limit est atteint."""
        rate = self.g.get_rate_limit()
        core = rate.core
        search = rate.search
        if core.remaining < 50:
            wait = (core.reset - datetime.utcnow()).total_seconds() + 10
            if wait > 0:
                logger.warning(f"Core rate limit bas ({core.remaining}), attente {wait:.0f}s...")
                time.sleep(min(wait, 3600))
        if search.remaining < 5:
            wait = (search.reset - datetime.utcnow()).total_seconds() + 10
            if wait > 0:
                logger.warning(f"Search rate limit bas ({search.remaining}), attente {wait:.0f}s...")
                time.sleep(min(wait, 120))

    # ─── Phase 1: Decouverte de repos ────────────────────────────────────

    def discover_repos(self, max_repos: int = 5000) -> list:
        """Decouvre des repos contenant du code legacy Java."""
        repos = set(self.seen_repos)
        logger.info(f"Deja connus: {len(repos)} repos")

        for i, query in enumerate(REPO_SEARCH_QUERIES):
            if len(repos) >= max_repos:
                break
            try:
                self._wait_rate_limit()
                logger.info(f"[{i+1}/{len(REPO_SEARCH_QUERIES)}] Recherche repos: '{query}' ({len(repos)}/{max_repos})...")

                results = self.g.search_repositories(
                    query=f"{query} language:Java",
                    sort="stars",
                    order="desc"
                )

                count = 0
                for repo in results:
                    if len(repos) >= max_repos:
                        break
                    if repo.full_name not in repos:
                        # Filtrer: au moins 2 fichiers Java, pas un fork tiny
                        if repo.size > 10:  # > 10 KB
                            repos.add(repo.full_name)
                            count += 1
                    if count >= 50:  # Max 50 repos par requete
                        break

                logger.info(f"  +{count} repos (total: {len(repos)})")
                time.sleep(3)  # Rate limit search: 10 req/min

            except RateLimitExceededException:
                logger.warning("Rate limit atteint, attente 60s...")
                time.sleep(60)
            except GithubException as e:
                logger.warning(f"GitHub API error for '{query}': {e}")
                time.sleep(10)
            except Exception as e:
                logger.error(f"Error searching '{query}': {e}")

        self.stats["repos_discovered"] = len(repos)
        logger.info(f"Total repos decouverts: {len(repos)}")

        # Sauvegarder la liste des repos
        repos_file = self.output_dir / "_repos_list.json"
        repos_file.write_text(json.dumps(sorted(repos), indent=2), encoding='utf-8')

        return sorted(repos)

    # ─── Phase 2: Scan des repos ─────────────────────────────────────────

    def scan_repo(self, repo_name: str) -> list:
        """Scanne un repo pour trouver des fichiers Java legacy."""
        if repo_name in self.seen_repos:
            self.stats["repos_skipped"] += 1
            return []

        found_files = []
        try:
            self._wait_rate_limit()
            repo = self.g.get_repo(repo_name)

            # Parcours recursif — profondeur max 8
            java_files = []
            stack = [(repo.get_contents(""), 0)]
            while stack:
                current_contents, depth = stack.pop()
                if depth > 8:
                    continue
                for item in current_contents:
                    if item.type == "dir":
                        # Ignorer les dossiers non pertinents
                        skip_dirs = {"node_modules", ".git", "target", "build",
                                     "bin", ".idea", ".settings", "test", "tests",
                                     "__pycache__", ".mvn", ".gradle"}
                        if item.name.lower() not in skip_dirs:
                            try:
                                sub = repo.get_contents(item.path)
                                stack.append((sub, depth + 1))
                            except:
                                pass
                    elif item.name.endswith(".java") and item.size < 100_000:
                        java_files.append(item)

            # Analyser chaque fichier Java
            for jf in java_files:
                try:
                    content = jf.decoded_content.decode('utf-8', errors='ignore')

                    # Filtres de taille
                    lines = count_lines(content)
                    if lines < 10:
                        self.stats["files_too_small"] += 1
                        continue
                    if lines > 2000:
                        self.stats["files_too_large"] += 1
                        continue

                    # Classifier
                    categories = classify_file(content)
                    if not categories:
                        continue

                    # Deduplication
                    h = file_hash(content)
                    if h in self.seen_hashes:
                        self.stats["files_duplicate"] += 1
                        continue

                    self.seen_hashes.add(h)
                    meta = save_file(
                        self.output_dir, repo_name, jf.path,
                        content, categories,
                        {"repo_stars": repo.stargazers_count, "repo_size": repo.size}
                    )
                    found_files.append(meta)
                    self.stats["files_saved"] += 1

                    # Stats par categorie
                    for cat in categories:
                        self.stats["by_category"][cat] = self.stats["by_category"].get(cat, 0) + 1

                    self.stats["files_found"] += 1

                except Exception as e:
                    self.stats["errors"] += 1

            self.seen_repos.add(repo_name)
            self.stats["repos_scanned"] += 1

            if found_files:
                self.stats["by_repo"][repo_name] = len(found_files)
                logger.info(f"  [{repo_name}] {len(found_files)} fichiers legacy ({', '.join(set(f['primary_category'] for f in found_files))})")

        except RateLimitExceededException:
            logger.warning("Rate limit, attente 60s...")
            time.sleep(60)
            return self.scan_repo(repo_name)  # Retry
        except GithubException as e:
            if e.status == 403:
                logger.warning(f"Acces refuse: {repo_name}")
            elif e.status == 404:
                logger.warning(f"Repo introuvable: {repo_name}")
            else:
                logger.warning(f"Erreur GitHub {repo_name}: {e}")
            self.stats["errors"] += 1
            self.seen_repos.add(repo_name)
        except Exception as e:
            logger.warning(f"Erreur {repo_name}: {e}")
            self.stats["errors"] += 1
            self.seen_repos.add(repo_name)

        return found_files

    # ─── Phase 3: Code Search direct ─────────────────────────────────────

    def search_code_direct(self, max_files: int = 5000):
        """Recherche directe de fichiers via GitHub Code Search."""
        logger.info("=" * 60)
        logger.info("Phase 3: Recherche directe de fichiers via Code Search")
        logger.info("=" * 60)

        for i, query in enumerate(CODE_SEARCH_QUERIES):
            if self.stats["files_saved"] >= max_files:
                break
            try:
                self._wait_rate_limit()
                logger.info(f"[{i+1}/{len(CODE_SEARCH_QUERIES)}] Code search: '{query}'...")

                results = self.g.search_code(
                    query=f"{query} language:Java",
                    sort="indexed",
                    order="desc"
                )

                count = 0
                for code_result in results:
                    if count >= 30:  # Max 30 fichiers par requete
                        break
                    try:
                        content = code_result.decoded_content.decode('utf-8', errors='ignore')
                        lines = count_lines(content)
                        if lines < 10 or lines > 2000:
                            continue

                        categories = classify_file(content)
                        if not categories:
                            continue

                        h = file_hash(content)
                        if h in self.seen_hashes:
                            continue

                        self.seen_hashes.add(h)
                        repo_name = code_result.repository.full_name
                        meta = save_file(
                            self.output_dir, repo_name, code_result.path,
                            content, categories,
                            {"source": "code_search", "query": query}
                        )
                        self.stats["files_saved"] += 1
                        self.stats["files_found"] += 1
                        for cat in categories:
                            self.stats["by_category"][cat] = self.stats["by_category"].get(cat, 0) + 1
                        count += 1

                    except Exception:
                        self.stats["errors"] += 1

                if count > 0:
                    logger.info(f"  +{count} fichiers")
                time.sleep(5)  # Rate limit code search

            except RateLimitExceededException:
                logger.warning("Rate limit code search, attente 60s...")
                time.sleep(60)
            except Exception as e:
                logger.warning(f"Erreur code search '{query}': {e}")
                time.sleep(10)

    # ─── Phase 4: Recherche de migrations reelles ────────────────────────

    def find_migration_commits(self, max_repos: int = 200):
        """Cherche des repos avec des commits de migration EJB -> Spring."""
        logger.info("=" * 60)
        logger.info("Phase 4: Recherche de migrations reelles (diffs git)")
        logger.info("=" * 60)

        migration_queries = [
            "migrate from ejb to spring",
            "remove ejb add spring",
            "ejb to spring boot migration",
            "replace ejb with spring",
            "modernize java ee",
            "j2ee to spring boot",
            "servlet to spring mvc",
            "struts to spring",
            "jdbc to jpa migration",
            "hibernate to spring data",
            "soap to rest migration",
            "jms to kafka migration",
            "legacy java modernization",
            "monolith to microservices java",
        ]

        migration_dir = self.output_dir / "_migrations"
        migration_dir.mkdir(parents=True, exist_ok=True)
        migration_pairs = []

        for query in migration_queries:
            try:
                self._wait_rate_limit()
                logger.info(f"Migration search: '{query}'...")

                results = self.g.search_repositories(
                    query=f"{query} language:Java",
                    sort="updated",
                    order="desc"
                )

                for repo in results:
                    if len(migration_pairs) >= max_repos:
                        break
                    try:
                        # Chercher des commits de migration
                        commits = repo.get_commits()
                        for commit in commits:
                            msg = (commit.commit.message or "").lower()
                            migration_keywords = [
                                "migrat", "ejb", "spring", "modern",
                                "refactor", "replace", "convert",
                                "remove legacy", "upgrade",
                            ]
                            if any(kw in msg for kw in migration_keywords):
                                # Sauvegarder les infos du commit
                                pair = {
                                    "repo": repo.full_name,
                                    "commit_sha": commit.sha,
                                    "commit_message": commit.commit.message,
                                    "commit_date": commit.commit.author.date.isoformat() if commit.commit.author else "",
                                    "url": commit.html_url,
                                }
                                migration_pairs.append(pair)
                                break  # Un commit par repo suffit
                    except:
                        pass

                time.sleep(3)
            except Exception as e:
                logger.warning(f"Erreur migration search: {e}")
                time.sleep(10)

        # Sauvegarder les paires de migration
        migration_file = migration_dir / "migration_commits.json"
        migration_file.write_text(json.dumps(migration_pairs, indent=2), encoding='utf-8')
        logger.info(f"Commits de migration trouves: {len(migration_pairs)}")

    # ─── Orchestration ───────────────────────────────────────────────────

    def run(self, max_repos: int = 5000, max_files: int = 10000):
        """Lance le scraping complet en 4 phases."""
        logger.info("=" * 70)
        logger.info("  JAVA LEGACY SCRAPER — Toutes technologies")
        logger.info(f"  Output: {self.output_dir}")
        logger.info(f"  Max repos: {max_repos} | Max fichiers: {max_files}")
        logger.info(f"  Categories: {len(LEGACY_CATEGORIES)}")
        logger.info(f"  Requetes repos: {len(REPO_SEARCH_QUERIES)}")
        logger.info(f"  Requetes code: {len(CODE_SEARCH_QUERIES)}")
        logger.info("=" * 70)

        # Phase 1: Decouvrir les repos
        logger.info("\n" + "=" * 60)
        logger.info("PHASE 1/4 — Decouverte des repos")
        logger.info("=" * 60)
        repos = self.discover_repos(max_repos)

        # Phase 2: Scanner les repos
        logger.info("\n" + "=" * 60)
        logger.info("PHASE 2/4 — Scan des repos")
        logger.info("=" * 60)
        for i, repo_name in enumerate(repos):
            if self.stats["files_saved"] >= max_files:
                logger.info(f"Objectif atteint: {self.stats['files_saved']} fichiers")
                break
            logger.info(f"[{i+1}/{len(repos)}] {repo_name}...")
            self.scan_repo(repo_name)
            time.sleep(1)

            # Sauvegarder regulierement
            if (i + 1) % 25 == 0:
                self._save_state()
                self._save_stats()
                logger.info(f"  --- Checkpoint: {self.stats['files_saved']} fichiers sauvegardes ---")

        # Phase 3: Code Search direct
        logger.info("\n" + "=" * 60)
        logger.info("PHASE 3/4 — Code Search direct")
        logger.info("=" * 60)
        self.search_code_direct(max_files)

        # Phase 4: Migrations reelles
        logger.info("\n" + "=" * 60)
        logger.info("PHASE 4/4 — Recherche de migrations reelles")
        logger.info("=" * 60)
        self.find_migration_commits()

        # Sauvegarder l'etat final
        self._save_state()
        self._save_stats()
        self._print_summary()

    def _save_stats(self):
        self.stats["last_updated"] = datetime.utcnow().isoformat()
        stats_file = self.output_dir / "_scraping_stats.json"
        stats_file.write_text(json.dumps(self.stats, indent=2), encoding='utf-8')

    def _print_summary(self):
        logger.info("\n" + "=" * 70)
        logger.info("  SCRAPING TERMINE — RESUME")
        logger.info("=" * 70)
        logger.info(f"  Repos decouverts:     {self.stats['repos_discovered']}")
        logger.info(f"  Repos scannes:        {self.stats['repos_scanned']}")
        logger.info(f"  Repos ignores:        {self.stats['repos_skipped']}")
        logger.info(f"  Fichiers trouves:     {self.stats['files_found']}")
        logger.info(f"  Fichiers sauvegardes: {self.stats['files_saved']}")
        logger.info(f"  Doublons ignores:     {self.stats['files_duplicate']}")
        logger.info(f"  Trop petits:          {self.stats['files_too_small']}")
        logger.info(f"  Trop grands:          {self.stats['files_too_large']}")
        logger.info(f"  Erreurs:              {self.stats['errors']}")
        logger.info("")
        logger.info("  Par categorie:")
        for cat, count in sorted(self.stats["by_category"].items(), key=lambda x: -x[1]):
            logger.info(f"    {cat:30s} {count:>6d}")
        logger.info("")
        top_repos = sorted(self.stats.get("by_repo", {}).items(), key=lambda x: -x[1])[:20]
        if top_repos:
            logger.info("  Top 20 repos:")
            for repo, count in top_repos:
                logger.info(f"    {repo:50s} {count:>4d} fichiers")
        logger.info("=" * 70)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scrape GitHub for ALL Java Legacy files (EJB, Servlets, JDBC, Struts, JMS, SOAP, etc.)"
    )
    parser.add_argument("--output", default="./dataset/raw_legacy",
                        help="Output directory (default: ./dataset/raw_legacy)")
    parser.add_argument("--max-repos", type=int, default=5000,
                        help="Max repos to discover (default: 5000)")
    parser.add_argument("--max-files", type=int, default=10000,
                        help="Max files to save (default: 10000)")
    parser.add_argument("--token", default=None,
                        help="GitHub personal access token (or set GITHUB_TOKEN env)")
    args = parser.parse_args()

    scraper = JavaLegacyScraper(token=args.token, output_dir=args.output)
    scraper.run(max_repos=args.max_repos, max_files=args.max_files)
