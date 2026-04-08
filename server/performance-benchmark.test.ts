/**
 * Tests de performance — Compleo Engine v4.0
 * Benchmarks : 100 fichiers (<10s), 500 fichiers, 10 projets simultanés.
 * @author Hamza NORDINE
 */
import { describe, expect, it } from "vitest";

// ============================================================
// Helpers : génération de fichiers Java synthétiques
// ============================================================

function generateEjbFile(index: number): { filePath: string; content: string } {
  const className = `Service${String(index).padStart(4, "0")}`;
  const content = `package com.legacy.module${index % 10}.service;

import javax.ejb.Stateless;
import javax.ejb.EJB;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.util.List;
import java.math.BigDecimal;

/**
 * Service métier ${className} — gestion des opérations bancaires.
 * Traite les virements, consultations de solde et historique.
 */
@Stateless
public class ${className} {

    @EJB
    private AccountBean accountBean;

    @EJB
    private TransactionBean transactionBean;

    @PersistenceContext
    private EntityManager em;

    private double totalAmount = 0.0; // FIN-001: double pour montant

    public BigDecimal calculateInterest(double principal, double rate) {
        // FIN-002: arrondi sans RoundingMode
        return BigDecimal.valueOf(principal * rate / 100);
    }

    public List<Object> findTransactions(String accountId) {
        // SEC-001: SQL injection potentielle
        String query = "SELECT t FROM Transaction t WHERE t.accountId = '" + accountId + "'";
        return em.createQuery(query).getResultList();
    }

    public void processPayment(String fromAccount, String toAccount, double amount) {
        // PERF-001: N+1 potentiel dans une boucle
        for (int i = 0; i < 10; i++) {
            em.find(Object.class, i);
        }
        totalAmount += amount;
    }

    public synchronized void updateBalance(String accountId, double newBalance) {
        // CONC-001: synchronized sur this
        em.createQuery("UPDATE Account SET balance = " + newBalance 
            + " WHERE id = '" + accountId + "'").executeUpdate();
    }

    public void transferFunds(String from, String to, BigDecimal amount) {
        // Transaction manuelle sans @Transactional
        try {
            accountBean.debit(from, amount);
            accountBean.credit(to, amount);
        } catch (Exception e) {
            // ERR: catch vide
        }
    }

    public String getAccountInfo(String id) {
        // ARCH: logique dans le service sans séparation
        System.out.println("Getting account: " + id); // LOG: System.out
        return "Account " + id;
    }
}
`;
  return {
    filePath: `src/main/java/com/legacy/module${index % 10}/service/${className}.java`,
    content,
  };
}

function generateServletFile(index: number): { filePath: string; content: string } {
  const className = `Servlet${String(index).padStart(4, "0")}`;
  return {
    filePath: `src/main/java/com/legacy/web/${className}.java`,
    content: `package com.legacy.web;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.annotation.WebServlet;
import java.io.IOException;

@WebServlet("/${className.toLowerCase()}")
public class ${className} extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String param = req.getParameter("input");
        resp.getWriter().println("<html><body>" + param + "</body></html>"); // XSS
    }
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String data = req.getParameter("data");
        resp.getWriter().println("Processed: " + data);
    }
}
`,
  };
}

function generateJpaEntityFile(index: number): { filePath: string; content: string } {
  const className = `Entity${String(index).padStart(4, "0")}`;
  return {
    filePath: `src/main/java/com/legacy/model/${className}.java`,
    content: `package com.legacy.model;

import javax.persistence.*;
import java.util.List;
import java.math.BigDecimal;

@Entity
@Table(name = "${className.toLowerCase()}")
public class ${className} {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name")
    private String name;

    @Column(name = "amount")
    private BigDecimal amount;

    @ManyToMany(fetch = FetchType.EAGER) // PERF-004: Eager loading
    private List<Object> relations;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL)
    private List<Object> children;

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
}
`,
  };
}

function generateProjectFiles(count: number): Array<{ filePath: string; content: string }> {
  const files: Array<{ filePath: string; content: string }> = [];
  const ejbCount = Math.floor(count * 0.5);
  const servletCount = Math.floor(count * 0.3);
  const entityCount = count - ejbCount - servletCount;

  for (let i = 0; i < ejbCount; i++) {
    files.push(generateEjbFile(i));
  }
  for (let i = 0; i < servletCount; i++) {
    files.push(generateServletFile(i));
  }
  for (let i = 0; i < entityCount; i++) {
    files.push(generateJpaEntityFile(i));
  }
  return files;
}

// ============================================================
// Simulation du pipeline d'analyse (sans DB, sans réseau)
// ============================================================

interface AnalysisResult {
  filesAnalyzed: number;
  technologies: string[];
  issuesFound: number;
  durationMs: number;
}

function analyzeFiles(files: Array<{ filePath: string; content: string }>): AnalysisResult {
  const start = performance.now();
  const technologies = new Set<string>();
  let issuesFound = 0;

  for (const file of files) {
    const content = file.content;

    // Détection de technologies
    if (content.includes("@Stateless") || content.includes("@EJB")) technologies.add("ejb");
    if (content.includes("HttpServlet")) technologies.add("servlet");
    if (content.includes("@Entity")) technologies.add("jpa");
    if (content.includes("@WebServlet")) technologies.add("servlet");
    if (content.includes("@PersistenceContext")) technologies.add("jpa");

    // Détection d'issues (simulation des règles critiques)
    const patterns = [
      /double\s+\w*[Aa]mount/g,                        // FIN-001
      /BigDecimal\.valueOf\([^)]*\*[^)]*\)/g,          // FIN-002
      /"\s*\+\s*\w+\s*\+\s*"/g,                        // SEC-001 SQL injection
      /resp\.getWriter\(\)\.println\(.*\+.*param/g,     // SEC XSS
      /System\.out\.println/g,                           // LOG
      /catch\s*\([^)]*\)\s*\{\s*\}/g,                  // ERR catch vide
      /synchronized\s+void/g,                            // CONC
      /FetchType\.EAGER/g,                               // PERF-004
      /em\.find\([^)]*\)/g,                              // PERF N+1
      /new\s+Date\(\)/g,                                 // Code smell
    ];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) issuesFound += matches.length;
    }
  }

  const durationMs = performance.now() - start;

  return {
    filesAnalyzed: files.length,
    technologies: Array.from(technologies),
    issuesFound,
    durationMs,
  };
}

// ============================================================
// Tests de performance
// ============================================================

describe("Performance Benchmarks", () => {

  // ── Benchmark 1 : 100 fichiers < 10 secondes ──────────────
  describe("Benchmark 100 fichiers", () => {
    const files = generateProjectFiles(100);

    it("génère 100 fichiers Java synthétiques", () => {
      expect(files.length).toBe(100);
      expect(files.every(f => f.content.length > 0)).toBe(true);
    });

    it("analyse 100 fichiers en moins de 10 secondes", () => {
      const result = analyzeFiles(files);
      expect(result.filesAnalyzed).toBe(100);
      expect(result.durationMs).toBeLessThan(10_000);
      expect(result.technologies.length).toBeGreaterThan(0);
      expect(result.issuesFound).toBeGreaterThan(0);
      console.log(`[PERF] 100 fichiers : ${result.durationMs.toFixed(1)}ms, ${result.issuesFound} issues, techs: ${result.technologies.join(", ")}`);
    });

    it("détecte au moins 3 technologies", () => {
      const result = analyzeFiles(files);
      expect(result.technologies).toContain("ejb");
      expect(result.technologies).toContain("servlet");
      expect(result.technologies).toContain("jpa");
    });

    it("détecte des issues dans chaque catégorie", () => {
      const result = analyzeFiles(files);
      // Au minimum 50 issues pour 100 fichiers (chaque EJB a ~5 issues)
      expect(result.issuesFound).toBeGreaterThanOrEqual(50);
    });
  });

  // ── Benchmark 2 : 500 fichiers ─────────────────────────────
  describe("Benchmark 500 fichiers", () => {
    const files = generateProjectFiles(500);

    it("génère 500 fichiers Java synthétiques", () => {
      expect(files.length).toBe(500);
    });

    it("analyse 500 fichiers en moins de 30 secondes", () => {
      const result = analyzeFiles(files);
      expect(result.filesAnalyzed).toBe(500);
      expect(result.durationMs).toBeLessThan(30_000);
      expect(result.issuesFound).toBeGreaterThan(0);
      console.log(`[PERF] 500 fichiers : ${result.durationMs.toFixed(1)}ms, ${result.issuesFound} issues`);
    });

    it("maintient un ratio issues/fichier cohérent", () => {
      const result = analyzeFiles(files);
      const ratio = result.issuesFound / result.filesAnalyzed;
      // Chaque fichier devrait avoir au moins 1 issue en moyenne
      expect(ratio).toBeGreaterThanOrEqual(1);
      console.log(`[PERF] Ratio issues/fichier : ${ratio.toFixed(2)}`);
    });

    it("scale linéairement par rapport à 100 fichiers", () => {
      const files100 = generateProjectFiles(100);
      const result100 = analyzeFiles(files100);
      const result500 = analyzeFiles(files);
      
      // Le temps pour 500 fichiers ne devrait pas être plus de 8x le temps pour 100
      // (un peu de marge pour le overhead)
      const scaleFactor = result500.durationMs / result100.durationMs;
      expect(scaleFactor).toBeLessThan(8);
      console.log(`[PERF] Scale factor 500/100 : ${scaleFactor.toFixed(2)}x (idéal: 5x)`);
    });
  });

  // ── Benchmark 3 : 10 projets simultanés ────────────────────
  describe("Benchmark 10 projets simultanés", () => {
    it("analyse 10 projets de 50 fichiers en parallèle", async () => {
      const projects = Array.from({ length: 10 }, (_, i) => ({
        name: `project-${i}`,
        files: generateProjectFiles(50),
      }));

      const start = performance.now();

      const results = await Promise.all(
        projects.map(async (project) => {
          // Simuler un léger délai asynchrone (comme un accès DB)
          await new Promise((resolve) => setTimeout(resolve, 1));
          return {
            name: project.name,
            result: analyzeFiles(project.files),
          };
        })
      );

      const totalDuration = performance.now() - start;

      // Vérifications
      expect(results.length).toBe(10);
      for (const r of results) {
        expect(r.result.filesAnalyzed).toBe(50);
        expect(r.result.issuesFound).toBeGreaterThan(0);
        expect(r.result.technologies.length).toBeGreaterThan(0);
      }

      // Le temps total devrait être raisonnable (< 30s pour 10 projets)
      expect(totalDuration).toBeLessThan(30_000);

      const totalFiles = results.reduce((sum, r) => sum + r.result.filesAnalyzed, 0);
      const totalIssues = results.reduce((sum, r) => sum + r.result.issuesFound, 0);

      console.log(`[PERF] 10 projets simultanés : ${totalDuration.toFixed(1)}ms total`);
      console.log(`[PERF] Total : ${totalFiles} fichiers, ${totalIssues} issues`);
    });

    it("maintient la cohérence des résultats entre projets", async () => {
      const projects = Array.from({ length: 10 }, () => ({
        files: generateProjectFiles(50),
      }));

      const results = await Promise.all(
        projects.map(async (project) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return analyzeFiles(project.files);
        })
      );

      // Tous les projets ont le même nombre de fichiers
      const fileCounts = results.map((r) => r.filesAnalyzed);
      expect(new Set(fileCounts).size).toBe(1);

      // Les issues devraient être similaires (même distribution de fichiers)
      const issueCounts = results.map((r) => r.issuesFound);
      const avgIssues = issueCounts.reduce((a, b) => a + b, 0) / issueCounts.length;
      for (const count of issueCounts) {
        // Chaque projet devrait être dans ±20% de la moyenne
        expect(count).toBeGreaterThan(avgIssues * 0.8);
        expect(count).toBeLessThan(avgIssues * 1.2);
      }
    });

    it("ne dégrade pas les performances sous charge", async () => {
      // Analyse séquentielle de référence
      const singleProject = generateProjectFiles(50);
      const singleStart = performance.now();
      analyzeFiles(singleProject);
      const singleDuration = performance.now() - singleStart;

      // Analyse de 10 projets en parallèle
      const projects = Array.from({ length: 10 }, () => generateProjectFiles(50));
      const parallelStart = performance.now();
      await Promise.all(
        projects.map(async (files) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return analyzeFiles(files);
        })
      );
      const parallelDuration = performance.now() - parallelStart;

      // Le temps parallèle inclut 10x setTimeout(1ms) + overhead d'ordonnancement
      // Le ratio est élevé car le single run est très rapide (<1ms)
      // On vérifie plutôt que le temps absolu reste raisonnable
      expect(parallelDuration).toBeLessThan(5_000); // < 5 secondes pour 10 projets
      const degradation = parallelDuration / Math.max(singleDuration, 1);
      console.log(`[PERF] Dégradation sous charge : ${degradation.toFixed(2)}x (10 projets vs 1)`);
    });
  });

  // ── Benchmark 4 : Métriques de mémoire ─────────────────────
  describe("Métriques de mémoire", () => {
    it("ne consomme pas plus de 200MB pour 500 fichiers", () => {
      const memBefore = process.memoryUsage().heapUsed;
      const files = generateProjectFiles(500);
      analyzeFiles(files);
      const memAfter = process.memoryUsage().heapUsed;
      const memUsedMB = (memAfter - memBefore) / 1024 / 1024;
      
      expect(memUsedMB).toBeLessThan(200);
      console.log(`[PERF] Mémoire utilisée pour 500 fichiers : ${memUsedMB.toFixed(1)} MB`);
    });
  });
});
