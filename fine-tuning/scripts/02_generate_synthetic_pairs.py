#!/usr/bin/env python3
"""
Script 2/6 — Generateur de paires synthetiques Legacy Java → Spring Boot.

Prend les fichiers legacy scrapes par 01_scrape_github_ejb.py et genere
des paires (input legacy, output Spring Boot moderne) via un LLM.

Couvre TOUTES les technologies legacy :
  EJB, Servlets, JSP, Struts, JDBC, Hibernate, JMS, SOAP, JAX-RPC,
  RMI, CORBA, JCA, JNDI, Java Batch, JMX, JSF, Spring XML legacy

Usage:
    python3 02_generate_synthetic_pairs.py \
        --input ./dataset/raw_legacy \
        --output ./dataset/pairs \
        --provider ollama \
        --model qwen2.5-coder:14b-instruct-q4_K_M \
        --max-pairs 20000

Prerequis:
    pip install requests tqdm openai anthropic
"""

import os
import sys
import json
import time
import re
import argparse
import logging
import hashlib
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("pair_generation.log", encoding="utf-8"),
    ]
)
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# PROMPTS DE MIGRATION PAR CATEGORIE (30+ categories)
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are an expert Java developer specializing in migrating legacy Java EE applications to modern Spring Boot.
You must convert the legacy Java code provided into equivalent modern Spring Boot code.

General rules:
- Use constructor injection (not field injection)
- Add @Slf4j for logging (Lombok)
- Add @Transactional at service level where appropriate
- Use Spring Boot auto-configuration
- Follow Spring Boot naming conventions: XxxService, XxxRepository, XxxController, XxxDto
- Include all necessary imports
- Output ONLY the complete migrated Java code, no explanations."""

MIGRATION_PROMPTS = {
    # ─── EJB ──────────────────────────────────────────────────────────────
    "ejb_stateless": "Migrate this EJB @Stateless Session Bean to a Spring Boot @Service. Replace @Stateless with @Service + @Transactional. Replace @EJB with constructor injection. Remove Home/Remote interfaces.",
    "ejb_stateful": "Migrate this EJB @Stateful Session Bean to a Spring Boot @Service with @SessionScope. Handle state via Spring session or Redis.",
    "ejb_mdb": "Migrate this Message-Driven Bean (MDB) to Spring @Component + @JmsListener. Configure JMS via application.yml. Add error handling.",
    "ejb_entity": "Migrate this EJB Entity Bean to Spring Data JPA @Entity + Repository interface. Replace home/remote interfaces with Repository methods.",
    "ejb_singleton": "Migrate this EJB @Singleton to Spring Boot @Component (singleton by default). Keep @PostConstruct/@PreDestroy.",
    "ejb_timer": "Migrate this EJB Timer Service to Spring @Scheduled. Add @EnableScheduling to config.",
    "ejb_interceptor": "Migrate this EJB Interceptor to a Spring AOP @Aspect. Replace @AroundInvoke with @Around, InvocationContext with ProceedingJoinPoint.",

    # ─── Servlets ─────────────────────────────────────────────────────────
    "servlet": "Migrate this HttpServlet to Spring Boot @RestController. Replace doGet/doPost with @GetMapping/@PostMapping. Replace HttpServletRequest params with @RequestParam, @PathVariable, @RequestBody.",
    "servlet_filter": "Migrate this Servlet Filter to a Spring Boot Filter (@Component + @Order) or HandlerInterceptor.",
    "servlet_listener": "Migrate this Servlet Listener to Spring @EventListener. Replace contextInitialized with @PostConstruct or ApplicationReadyEvent.",

    # ─── JSP ──────────────────────────────────────────────────────────────
    "jsp_taglib": "Migrate this JSP Tag Library to a REST API endpoint returning JSON (for SPA frontend) or Thymeleaf dialect.",
    "jsp_page": "Convert this JSP page logic into a Spring Boot @Controller + Thymeleaf template or @RestController returning JSON for a modern SPA frontend.",

    # ─── Struts ──────────────────────────────────────────────────────────
    "struts1_action": "Migrate this Struts 1.x Action to Spring MVC @Controller. Replace ActionForm with @ModelAttribute or @RequestBody DTO. Replace ActionForward with return view name.",
    "struts2_action": "Migrate this Struts 2 Action to Spring MVC @Controller. Replace execute() with @RequestMapping method. Replace ValueStack with @ModelAttribute.",
    "struts_form": "Migrate this Struts ActionForm/DynaActionForm to a Spring Boot DTO with @Valid validation annotations.",

    # ─── JDBC ────────────────────────────────────────────────────────────
    "jdbc_dao": "Migrate this JDBC DAO to Spring Data JPA Repository + Entity, or JdbcTemplate. Replace DriverManager.getConnection with auto-configured DataSource. Replace manual ResultSet mapping with RowMapper or JPA.",
    "jdbc_datasource": "Migrate this JDBC DataSource/connection pool config to Spring Boot application.yml (spring.datasource.*). Use HikariCP (default).",
    "jdbc_transaction": "Migrate this manual JDBC transaction management (commit/rollback) to Spring @Transactional declarative transactions.",

    # ─── Hibernate legacy ────────────────────────────────────────────────
    "hibernate_session": "Migrate this Hibernate Session/HQL code to Spring Data JPA. Replace SessionFactory with Repository. Replace session.createQuery(HQL) with @Query(JPQL) or derived query methods.",
    "hibernate_criteria": "Migrate this Hibernate Criteria API code to Spring Data JPA Specifications or Querydsl.",
    "hibernate_xml_mapping": "Migrate this Hibernate XML mapping (hbm.xml) to JPA annotations (@Entity, @Table, @Column, @OneToMany, etc.).",
    "hibernate_config": "Migrate this hibernate.cfg.xml to Spring Boot application.yml (spring.jpa.*). Replace HibernateUtil with auto-configured EntityManager.",

    # ─── JMS ─────────────────────────────────────────────────────────────
    "jms_producer": "Migrate this JMS Producer to Spring JmsTemplate.convertAndSend(). Configure JMS in application.yml.",
    "jms_consumer": "Migrate this JMS Consumer/MessageListener to Spring @JmsListener. Add @EnableJms and error handling.",
    "jms_topic": "Migrate this JMS Topic pub/sub to Spring JMS with @JmsListener(containerFactory='topicFactory'). Configure topic vs queue.",

    # ─── SOAP ────────────────────────────────────────────────────────────
    "soap_service": "Migrate this SOAP @WebService to a Spring Boot @RestController REST API. Replace SOAP request/response with JSON DTOs. Add OpenAPI docs.",
    "soap_client": "Migrate this SOAP client (Service.create/getPort) to Spring RestTemplate or WebClient. Replace SOAP stubs with simple HTTP calls.",
    "soap_handler": "Migrate this SOAP Handler/HandlerChain to a Spring HandlerInterceptor or Filter.",

    # ─── JAX-RS legacy ───────────────────────────────────────────────────
    "jaxrs_legacy": "Migrate this JAX-RS resource (Jersey/RESTEasy) to Spring Boot @RestController. Replace @Path with @RequestMapping, @GET with @GetMapping, etc.",

    # ─── RMI / CORBA ────────────────────────────────────────────────────
    "rmi_service": "Migrate this Java RMI service to a Spring Boot REST API. Replace UnicastRemoteObject with @RestController. Replace Remote interface with REST endpoints.",
    "rmi_client": "Migrate this RMI client (Naming.lookup) to Spring RestTemplate or WebClient HTTP calls.",
    "corba_service": "Migrate this CORBA service to a Spring Boot REST API. Replace IDL with OpenAPI spec. Replace ORB with Spring Boot auto-config.",

    # ─── JCA ─────────────────────────────────────────────────────────────
    "jca_adapter": "Migrate this JCA Resource Adapter to Spring Integration adapter or Spring Boot starter.",
    "jca_connector": "Migrate this JCA Connector/ManagedConnectionFactory to Spring auto-configured connection pool.",

    # ─── JNDI ────────────────────────────────────────────────────────────
    "jndi_lookup": "Migrate this JNDI lookup code to Spring @Autowired injection. Replace InitialContext().lookup() with constructor injection. Replace java:comp/env with @Value.",
    "jndi_datasource": "Migrate this JNDI DataSource lookup to Spring Boot auto-configured DataSource (application.yml).",

    # ─── Java Batch (JSR-352) ────────────────────────────────────────────
    "java_batch_reader": "Migrate this JSR-352 ItemReader to Spring Batch ItemReader. Configure with @StepScope.",
    "java_batch_writer": "Migrate this JSR-352 ItemWriter to Spring Batch ItemWriter.",
    "java_batch_processor": "Migrate this JSR-352 ItemProcessor to Spring Batch ItemProcessor.",
    "java_batch_job": "Migrate this JSR-352 batch job (batch.xml) to Spring Batch @Configuration with JobBuilderFactory and StepBuilderFactory.",

    # ─── JMX ─────────────────────────────────────────────────────────────
    "jmx_mbean": "Migrate this JMX MBean to Spring Boot Actuator. Replace MBean interface with @Endpoint. Replace JMX attributes with Micrometer metrics.",
    "jmx_monitor": "Migrate this JMX monitoring code to Spring Boot Actuator health indicators and custom metrics.",

    # ─── JSF ─────────────────────────────────────────────────────────────
    "jsf_managed_bean": "Migrate this JSF @ManagedBean to Spring Boot @RestController (for API) or @Controller (for Thymeleaf). Move business logic to @Service.",
    "jsf_converter": "Migrate this JSF Converter to a Spring Converter<S,T> registered via WebMvcConfigurer.",
    "jsf_validator": "Migrate this JSF Validator to Spring @Valid with custom ConstraintValidator.",

    # ─── Spring XML legacy ───────────────────────────────────────────────
    "spring_xml_beans": "Migrate this Spring XML bean configuration to @Configuration + @Bean or @Component scanning.",
    "spring_xml_aop": "Migrate this Spring XML AOP configuration to @Aspect + @Around/@Before/@After annotations.",
    "spring_xml_tx": "Migrate this Spring XML transaction configuration to @Transactional annotations.",
    "spring_xml_mvc": "Migrate this Spring XML MVC configuration to @EnableWebMvc or Spring Boot auto-config with WebMvcConfigurer.",
    "spring_xml_security": "Migrate this Spring Security XML configuration to SecurityFilterChain @Bean with HttpSecurity builder.",

    # ─── Divers legacy ───────────────────────────────────────────────────
    "applet": "Migrate this Java Applet to a modern REST API + JavaScript frontend.",
    "swing_rmi": "Migrate this Swing + RMI desktop client to a REST API client using Spring RestTemplate or WebClient.",
    "xml_parser_legacy": "Migrate this legacy XML parsing (DOM/SAX with manual handling) to JAXB or Jackson XML with Spring Boot.",
}

DEFAULT_PROMPT = "Migrate this legacy Java code to modern Spring Boot following best practices. Use constructor injection, @Transactional, and Spring Boot auto-configuration."

# ═══════════════════════════════════════════════════════════════════════════════
# LLM PROVIDERS
# ═══════════════════════════════════════════════════════════════════════════════

class OllamaProvider:
    """Ollama local — gratuit, pas de rate limit."""
    def __init__(self, base_url="http://localhost:11434", model="qwen2.5-coder:14b"):
        import requests as req
        self.base_url = base_url
        self.model = model
        self.req = req

    def generate(self, system: str, user: str) -> str:
        resp = self.req.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "stream": False,
                "options": {"temperature": 0.2, "num_predict": 4096},
            },
            timeout=180,
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]


class OpenAIProvider:
    """OpenAI ou compatible (Manus, Together, etc.)."""
    def __init__(self, api_key: str, model="gpt-4o-mini", base_url=None):
        from openai import OpenAI
        kwargs = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self.client = OpenAI(**kwargs)
        self.model = model

    def generate(self, system: str, user: str) -> str:
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
            max_tokens=4096,
        )
        return resp.choices[0].message.content


class AnthropicProvider:
    def __init__(self, api_key: str, model="claude-3-5-sonnet-20241022"):
        import anthropic
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def generate(self, system: str, user: str) -> str:
        resp = self.client.messages.create(
            model=self.model,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=0.2,
            max_tokens=4096,
        )
        return resp.content[0].text


# ═══════════════════════════════════════════════════════════════════════════════
# GENERATEUR DE PAIRES
# ═══════════════════════════════════════════════════════════════════════════════

class SyntheticPairGenerator:
    def __init__(self, provider, input_dir: str, output_dir: str):
        self.provider = provider
        self.input_dir = Path(input_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Etat de reprise
        self.state_file = self.output_dir / "_generator_state.json"
        self.processed = set()
        self._load_state()

        self.stats = {
            "total_files": 0,
            "pairs_generated": 0,
            "errors": 0,
            "skipped": 0,
            "by_category": {},
            "started_at": datetime.utcnow().isoformat(),
        }

    def _load_state(self):
        if self.state_file.exists():
            data = json.loads(self.state_file.read_text())
            self.processed = set(data.get("processed", []))
            logger.info(f"Reprise: {len(self.processed)} fichiers deja traites")

    def _save_state(self):
        self.state_file.write_text(json.dumps({
            "processed": list(self.processed),
            "saved_at": datetime.utcnow().isoformat(),
        }), encoding='utf-8')

    # ─── Collecte ────────────────────────────────────────────────────────

    def collect_files(self) -> list:
        """Collecte tous les fichiers legacy avec metadonnees."""
        files = []
        for cat_dir in sorted(self.input_dir.iterdir()):
            if not cat_dir.is_dir() or cat_dir.name.startswith("_"):
                continue
            category = cat_dir.name
            for java_file in cat_dir.glob("*.java"):
                if java_file.name.endswith(".meta.json"):
                    continue
                file_id = f"{category}/{java_file.name}"
                if file_id in self.processed:
                    continue
                meta_file = cat_dir / (java_file.name + ".meta.json")
                meta = {}
                if meta_file.exists():
                    try:
                        meta = json.loads(meta_file.read_text())
                    except Exception:
                        pass
                files.append({
                    "path": java_file,
                    "file_id": file_id,
                    "category": category,
                    "meta": meta,
                })
        return files

    # ─── Generation ──────────────────────────────────────────────────────

    def generate_pair(self, item: dict) -> dict:
        """Genere une paire (legacy → Spring Boot) pour un fichier."""
        try:
            code = item["path"].read_text(encoding='utf-8', errors='ignore')
            category = item["category"]

            # Limiter la taille (max 8000 chars pour le contexte LLM)
            if len(code) > 8000:
                code = code[:8000] + "\n// ... (truncated)"

            # Prompt specifique a la categorie
            migration_hint = MIGRATION_PROMPTS.get(category, DEFAULT_PROMPT)
            user_prompt = f"""{migration_hint}

Here is the legacy Java source code:

```java
{code}
```

Output ONLY the complete migrated Spring Boot Java code with all imports."""

            # Appel LLM
            result = self.provider.generate(SYSTEM_PROMPT, user_prompt)

            # Nettoyage
            result = self._clean_code(result)

            # Validation
            if not self._validate(result):
                logger.warning(f"Validation failed for {item['file_id']}")
                self.stats["errors"] += 1
                return None

            pair = {
                "instruction": f"Migrate this {category.replace('_', ' ')} to modern Spring Boot.",
                "input": code,
                "output": result,
                "category": category,
                "metadata": {
                    "source_repo": item["meta"].get("repo", "unknown"),
                    "source_path": item["meta"].get("path", "unknown"),
                    "annotations": item["meta"].get("annotations", []),
                    "lines": item["meta"].get("lines", 0),
                    "source": "github_synthetic",
                    "generated_at": datetime.utcnow().isoformat(),
                }
            }

            self.stats["pairs_generated"] += 1
            self.stats["by_category"][category] = self.stats["by_category"].get(category, 0) + 1
            return pair

        except Exception as e:
            logger.error(f"Error for {item['file_id']}: {e}")
            self.stats["errors"] += 1
            return None

    def _clean_code(self, code: str) -> str:
        code = code.strip()
        code = re.sub(r'^```(?:java)?\s*\n?', '', code, flags=re.MULTILINE)
        code = re.sub(r'\n?```\s*$', '', code, flags=re.MULTILINE)
        return code.strip()

    def _validate(self, code: str) -> bool:
        if not code or len(code) < 80:
            return False
        if not re.search(r'(class|interface|enum)\s+\w+', code):
            return False
        if 'import ' not in code:
            return False
        spring_markers = [
            '@Service', '@Component', '@Repository', '@Controller',
            '@RestController', '@Configuration', '@Bean', '@Autowired',
            '@Value', '@Transactional', '@Scheduled', '@JmsListener',
            '@Aspect', '@Entity', '@Table', '@Endpoint',
            '@GetMapping', '@PostMapping', '@RequestMapping', '@PutMapping',
            '@DeleteMapping', '@PatchMapping', '@EnableScheduling',
            '@SpringBootApplication', '@EventListener', '@Order',
            'JdbcTemplate', 'JpaRepository', 'CrudRepository',
        ]
        return any(m in code for m in spring_markers)

    # ─── Orchestration ───────────────────────────────────────────────────

    def run(self, max_pairs: int = 20000, rate_limit: float = 0.0):
        """Lance la generation de paires."""
        files = self.collect_files()
        self.stats["total_files"] = len(files)

        logger.info("=" * 70)
        logger.info("  GENERATEUR DE PAIRES SYNTHETIQUES — ALL LEGACY JAVA")
        logger.info(f"  Input:      {self.input_dir}")
        logger.info(f"  Output:     {self.output_dir}")
        logger.info(f"  Fichiers:   {len(files)}")
        logger.info(f"  Max paires: {max_pairs}")
        logger.info(f"  Categories: {len(set(f['category'] for f in files))}")
        logger.info("=" * 70)

        if not files:
            logger.warning("Aucun fichier a traiter!")
            return

        pairs_file = self.output_dir / "synthetic_pairs.jsonl"

        try:
            from tqdm import tqdm
            iterator = tqdm(files, desc="Generating pairs")
        except ImportError:
            iterator = files

        with open(pairs_file, 'a', encoding='utf-8') as f:
            for i, item in enumerate(iterator):
                if self.stats["pairs_generated"] >= max_pairs:
                    logger.info(f"Max paires atteint ({max_pairs})")
                    break

                pair = self.generate_pair(item)
                if pair:
                    f.write(json.dumps(pair, ensure_ascii=False) + '\n')

                self.processed.add(item["file_id"])

                # Checkpoint toutes les 50 paires
                if (i + 1) % 50 == 0:
                    self._save_state()
                    self._save_stats()
                    f.flush()
                    logger.info(f"  Checkpoint: {self.stats['pairs_generated']} paires, {self.stats['errors']} erreurs")

                # Rate limiting (pour API cloud)
                if rate_limit > 0:
                    time.sleep(rate_limit)

        self._save_state()
        self._save_stats()
        self._print_summary()

    def _save_stats(self):
        self.stats["last_updated"] = datetime.utcnow().isoformat()
        (self.output_dir / "_generation_stats.json").write_text(
            json.dumps(self.stats, indent=2), encoding='utf-8'
        )

    def _print_summary(self):
        logger.info("\n" + "=" * 70)
        logger.info("  GENERATION TERMINEE")
        logger.info("=" * 70)
        logger.info(f"  Fichiers en entree:   {self.stats['total_files']}")
        logger.info(f"  Paires generees:      {self.stats['pairs_generated']}")
        logger.info(f"  Erreurs:              {self.stats['errors']}")
        logger.info("")
        logger.info("  Par categorie:")
        for cat, count in sorted(self.stats["by_category"].items(), key=lambda x: -x[1]):
            logger.info(f"    {cat:35s} {count:>6d}")
        logger.info("=" * 70)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate synthetic Legacy Java -> Spring Boot migration pairs"
    )
    parser.add_argument("--input", default="./dataset/raw_legacy",
                        help="Input directory with scraped legacy files")
    parser.add_argument("--output", default="./dataset/pairs",
                        help="Output directory for generated pairs")
    parser.add_argument("--provider", choices=["ollama", "openai", "anthropic"],
                        default="ollama", help="LLM provider")
    parser.add_argument("--model", default=None,
                        help="Model name (default: qwen2.5-coder:14b for ollama, gpt-4o-mini for openai)")
    parser.add_argument("--api-key", default=None,
                        help="API key for openai/anthropic (or set OPENAI_API_KEY env)")
    parser.add_argument("--api-url", default=None,
                        help="Custom API base URL (for OpenAI-compatible APIs)")
    parser.add_argument("--ollama-url", default="http://localhost:11434",
                        help="Ollama base URL")
    parser.add_argument("--max-pairs", type=int, default=20000,
                        help="Maximum number of pairs to generate")
    parser.add_argument("--rate-limit", type=float, default=0.0,
                        help="Seconds between LLM calls (for cloud APIs, use 0.5)")
    args = parser.parse_args()

    # Initialiser le provider
    if args.provider == "ollama":
        model = args.model or "qwen2.5-coder:14b"
        provider = OllamaProvider(base_url=args.ollama_url, model=model)
        rate = args.rate_limit
    elif args.provider == "openai":
        key = args.api_key or os.environ.get("OPENAI_API_KEY", "")
        model = args.model or "gpt-4o-mini"
        provider = OpenAIProvider(api_key=key, model=model, base_url=args.api_url)
        rate = args.rate_limit or 0.5
    elif args.provider == "anthropic":
        key = args.api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        model = args.model or "claude-3-5-sonnet-20241022"
        provider = AnthropicProvider(api_key=key, model=model)
        rate = args.rate_limit or 0.5

    generator = SyntheticPairGenerator(provider, args.input, args.output)
    generator.run(max_pairs=args.max_pairs, rate_limit=rate)
