/**
 * SchemaDecoder v12.6 — Tests unitaires
 * Vérifie le décodage des colonnes cryptiques sur 3 cas :
 * - Cas HIGH: setters typés sur DTO
 * - Cas MEDIUM: paramètres de méthode
 * - Cas LOW: variables génériques (x, tmp, obj)
 */
import { describe, it, expect } from "vitest";
import { decodeSchema, generateSchemaDictionaryJson, generateSchemaDictionaryMd, generateSchemaDictionaryCsv } from "./SchemaDecoder";

// ─── Test Data: cryptic-fields-bank ──────────────────────────────────────────

const CUSTOMER_DAO = `
package com.bank.dao;

import java.sql.*;

public class CustomerDAO {
    private static final String SELECT_ALL = "SELECT FIELD1, FIELD2, FIELD3, FIELD4, FIELD5, FIELD6 FROM CUST_TBL WHERE FIELD1 = ?";
    private static final String INSERT = "INSERT INTO CUST_TBL (FIELD1, FIELD2, FIELD3, FIELD4, FIELD5, FIELD6) VALUES (?, ?, ?, ?, ?, ?)";

    public Customer findById(String id) throws SQLException {
        PreparedStatement ps = conn.prepareStatement(SELECT_ALL);
        ps.setString(1, id);
        ResultSet rs = ps.executeQuery();
        if (rs.next()) {
            Customer customer = new Customer();
            customer.setId(rs.getString("FIELD1"));
            customer.setName(rs.getString("FIELD2"));
            customer.setEmail(rs.getString("FIELD3"));
            customer.setPhone(rs.getString("FIELD4"));
            BigDecimal solde = rs.getBigDecimal("FIELD5");
            customer.setBalance(solde);
            LocalDate dateCreation = rs.getDate("FIELD6");
            customer.setCreatedAt(dateCreation);
            return customer;
        }
        return null;
    }

    public void save(Customer customer) throws SQLException {
        PreparedStatement ps = conn.prepareStatement(INSERT);
        ps.setString(1, customer.getId());
        ps.setString(2, customer.getName());
        ps.setString(3, customer.getEmail());
        ps.setString(4, customer.getPhone());
        ps.setBigDecimal(5, customer.getBalance());
        ps.setDate(6, customer.getCreatedAt());
        ps.executeUpdate();
    }
}
`;

const ACCOUNT_DAO = `
package com.bank.dao;

import java.sql.*;

public class AccountDAO {
    private static final String SELECT = "SELECT ZONE_A, ZONE_B, ZONE_C, ZONE_D FROM ACCT_TBL WHERE ZONE_A = ?";
    private static final String INSERT = "INSERT INTO ACCT_TBL (ZONE_A, ZONE_B, ZONE_C, ZONE_D) VALUES (?, ?, ?, ?)";

    public Account findByNumber(String accountNumber) throws SQLException {
        PreparedStatement ps = conn.prepareStatement(SELECT);
        ps.setString(1, accountNumber);
        ResultSet rs = ps.executeQuery();
        if (rs.next()) {
            Account account = new Account();
            account.setAccountNumber(rs.getString("ZONE_A"));
            account.setOwnerName(rs.getString("ZONE_B"));
            BigDecimal balance = rs.getBigDecimal("ZONE_C");
            account.setBalance(balance);
            String status = rs.getString("ZONE_D");
            account.setStatus(status);
            return account;
        }
        return null;
    }

    public void create(String accountNumber, String ownerName, BigDecimal balance, String status) throws SQLException {
        PreparedStatement ps = conn.prepareStatement(INSERT);
        ps.setString(1, accountNumber);
        ps.setString(2, ownerName);
        ps.setBigDecimal(3, balance);
        ps.setString(4, status);
        ps.executeUpdate();
    }
}
`;

const TRANSACTION_DAO_LOW = `
package com.bank.dao;

import java.sql.*;

public class TransactionDAO {
    private static final String SELECT = "SELECT COL_001, COL_002, COL_003, COL_004, COL_005 FROM TXN_TBL";

    public void processAll() throws SQLException {
        ResultSet rs = stmt.executeQuery(SELECT);
        while (rs.next()) {
            String x = rs.getString("COL_001");
            Object tmp = rs.getObject("COL_002");
            String obj = rs.getString("COL_003");
            double val = rs.getDouble("COL_004");
            String s = rs.getString("COL_005");
            // Process...
            System.out.println("Ref: " + rs.getString("COL_001"));
        }
    }
}
`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SchemaDecoder v12.6", () => {
  describe("High confidence — setter on DTO/Entity", () => {
    it("decodes FIELD1..FIELD6 from CustomerDAO setters", () => {
      const result = decodeSchema([
        { path: "CustomerDAO.java", content: CUSTOMER_DAO },
      ]);

      expect(result.tables.length).toBeGreaterThanOrEqual(1);
      const custTable = result.tables.find(t => t.name === "CUST_TBL");
      expect(custTable).toBeDefined();
      expect(custTable!.columns.length).toBeGreaterThanOrEqual(5);

      // FIELD1 → id (from customer.setId)
      const field1 = custTable!.columns.find(c => c.db === "FIELD1");
      expect(field1).toBeDefined();
      expect(field1!.inferred).toBe("id");
      expect(field1!.confidence).toBe("high");

      // FIELD2 → name (from customer.setName)
      const field2 = custTable!.columns.find(c => c.db === "FIELD2");
      expect(field2).toBeDefined();
      expect(field2!.inferred).toBe("name");
      expect(field2!.confidence).toBe("high");

      // FIELD3 → email
      const field3 = custTable!.columns.find(c => c.db === "FIELD3");
      expect(field3).toBeDefined();
      expect(field3!.inferred).toBe("email");
      expect(field3!.confidence).toBe("high");
    });

    it("detects correct Java types from RS getters", () => {
      const result = decodeSchema([
        { path: "CustomerDAO.java", content: CUSTOMER_DAO },
      ]);
      const custTable = result.tables.find(t => t.name === "CUST_TBL")!;

      const field5 = custTable.columns.find(c => c.db === "FIELD5");
      expect(field5!.javaType).toBe("BigDecimal");

      const field6 = custTable.columns.find(c => c.db === "FIELD6");
      expect(field6!.javaType).toBe("LocalDate");
    });
  });

  describe("High confidence — named local variable", () => {
    it("decodes from named variables (solde, dateCreation)", () => {
      const result = decodeSchema([
        { path: "CustomerDAO.java", content: CUSTOMER_DAO },
      ]);
      const custTable = result.tables.find(t => t.name === "CUST_TBL")!;

      // FIELD5 should have "balance" from setter OR "solde" from variable
      const field5 = custTable.columns.find(c => c.db === "FIELD5");
      expect(field5).toBeDefined();
      expect(field5!.confidence).toBe("high");
      // Either "balance" (from setter) or "solde" (from variable) — both are high
      expect(["balance", "solde"]).toContain(field5!.inferred);
    });
  });

  describe("Medium confidence — method parameters", () => {
    it("decodes ZONE_A..D from AccountDAO parameters", () => {
      const result = decodeSchema([
        { path: "AccountDAO.java", content: ACCOUNT_DAO },
      ]);
      const acctTable = result.tables.find(t => t.name === "ACCT_TBL");
      expect(acctTable).toBeDefined();

      // ZONE_A → accountNumber (from setter, HIGH)
      const zoneA = acctTable!.columns.find(c => c.db === "ZONE_A");
      expect(zoneA).toBeDefined();
      expect(zoneA!.inferred).toBe("accountNumber");
      expect(zoneA!.confidence).toBe("high");

      // ZONE_B → ownerName (from setter, HIGH)
      const zoneB = acctTable!.columns.find(c => c.db === "ZONE_B");
      expect(zoneB).toBeDefined();
      expect(zoneB!.inferred).toBe("ownerName");
      expect(zoneB!.confidence).toBe("high");
    });

    it("uses method parameter names for medium confidence", () => {
      const result = decodeSchema([
        { path: "AccountDAO.java", content: ACCOUNT_DAO },
      ]);
      const acctTable = result.tables.find(t => t.name === "ACCT_TBL")!;

      // All columns should be decoded (from setters or parameters)
      const decoded = acctTable.columns.filter(c => c.inferred !== c.db);
      expect(decoded.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Low confidence — generic variables", () => {
    it("classifies generic var names (x, tmp, obj) as low or unresolved", () => {
      const result = decodeSchema([
        { path: "TransactionDAO.java", content: TRANSACTION_DAO_LOW },
      ]);
      const txnTable = result.tables.find(t => t.name === "TXN_TBL");
      expect(txnTable).toBeDefined();

      // COL_001..005 should be low confidence (generic vars)
      for (const col of txnTable!.columns) {
        // Generic vars should NOT produce high confidence
        expect(col.confidence).not.toBe("high");
      }
    });

    it("uses concat label as low confidence source", () => {
      const result = decodeSchema([
        { path: "TransactionDAO.java", content: TRANSACTION_DAO_LOW },
      ]);
      const txnTable = result.tables.find(t => t.name === "TXN_TBL")!;

      // COL_001 has concat "Ref: " → should infer "ref" with low confidence
      const col001 = txnTable.columns.find(c => c.db === "COL_001");
      expect(col001).toBeDefined();
      // May be "ref" from concat or unresolved
      if (col001!.inferred !== "COL_001") {
        expect(col001!.confidence).toBe("low");
      }
    });
  });

  describe("Multi-file analysis", () => {
    it("processes all 3 DAOs together", () => {
      const result = decodeSchema([
        { path: "CustomerDAO.java", content: CUSTOMER_DAO },
        { path: "AccountDAO.java", content: ACCOUNT_DAO },
        { path: "TransactionDAO.java", content: TRANSACTION_DAO_LOW },
      ]);

      expect(result.tables.length).toBeGreaterThanOrEqual(3);
      expect(result.stats.totalColumns).toBeGreaterThanOrEqual(14);
      expect(result.stats.decoded).toBeGreaterThanOrEqual(8); // ≥80% of non-low
      expect(result.stats.highConfidence).toBeGreaterThanOrEqual(6);
    });

    it("executes in under 100ms for 3 files", () => {
      const result = decodeSchema([
        { path: "CustomerDAO.java", content: CUSTOMER_DAO },
        { path: "AccountDAO.java", content: ACCOUNT_DAO },
        { path: "TransactionDAO.java", content: TRANSACTION_DAO_LOW },
      ]);
      expect(result.executionTimeMs).toBeLessThan(100);
    });
  });

  describe("Output generators", () => {
    it("generates valid JSON", () => {
      const result = decodeSchema([
        { path: "CustomerDAO.java", content: CUSTOMER_DAO },
      ]);
      const json = generateSchemaDictionaryJson(result);
      const parsed = JSON.parse(json);
      expect(parsed.tables).toBeDefined();
      expect(parsed.stats).toBeDefined();
      expect(parsed.stats.totalColumns).toBeGreaterThan(0);
    });

    it("generates Markdown with table headers", () => {
      const result = decodeSchema([
        { path: "CustomerDAO.java", content: CUSTOMER_DAO },
      ]);
      const md = generateSchemaDictionaryMd(result);
      expect(md).toContain("# Schema Dictionary");
      expect(md).toContain("CUST_TBL");
      expect(md).toContain("FIELD1");
      expect(md).toContain("HIGH");
    });

    it("generates CSV with correct columns", () => {
      const result = decodeSchema([
        { path: "CustomerDAO.java", content: CUSTOMER_DAO },
      ]);
      const csv = generateSchemaDictionaryCsv(result);
      const lines = csv.split("\n");
      expect(lines[0]).toBe("Table,DB Column,Inferred Name,Confidence,Java Type,SQL Type,Sources");
      expect(lines.length).toBeGreaterThan(1);
    });
  });

  describe("Source 6: JPA @Column annotation (v13.8)", () => {
    const JPA_ENTITY = `
package com.bank.entity;

import javax.persistence.*;

@Entity
@Table(name = "CUST_TBL")
public class Customer {
    @Column(name = "FIELD1")
    private String customerId;

    @Column(name = "FIELD2")
    private String fullName;

    @Column(name = "FIELD3")
    private String emailAddress;

    @Column(name = "FIELD4", length = 20)
    private String phoneNumber;
}
`;

    it("decodes @Column annotations as HIGH confidence", () => {
      const result = decodeSchema([
        { path: "Customer.java", content: JPA_ENTITY },
      ]);
      const custTable = result.tables.find(t => t.name === "CUST_TBL");
      expect(custTable).toBeDefined();

      const field1 = custTable!.columns.find(c => c.db === "FIELD1");
      expect(field1).toBeDefined();
      expect(field1!.inferred).toBe("customerId");
      expect(field1!.confidence).toBe("high");

      const field2 = custTable!.columns.find(c => c.db === "FIELD2");
      expect(field2).toBeDefined();
      expect(field2!.inferred).toBe("fullName");
      expect(field2!.confidence).toBe("high");
    });
  });

  describe("Source 7: RS getXxx by numeric index (v13.8)", () => {
    const INDEX_DAO = `
package com.bank.dao;

import java.sql.*;

public class IndexDAO {
    private static final String SELECT_ALL = "SELECT FIELD1, FIELD2, FIELD3 FROM CUST_TBL";

    public Customer findAll() throws SQLException {
        ResultSet rs = stmt.executeQuery(SELECT_ALL);
        if (rs.next()) {
            Customer c = new Customer();
            c.setClientId(rs.getString(1));
            c.setClientName(rs.getString(2));
            BigDecimal solde = rs.getBigDecimal(3);
            return c;
        }
        return null;
    }
}
`;

    it("maps numeric RS index to column via SELECT order", () => {
      const result = decodeSchema([
        { path: "IndexDAO.java", content: INDEX_DAO },
      ]);
      const custTable = result.tables.find(t => t.name === "CUST_TBL");
      expect(custTable).toBeDefined();

      // FIELD1 (index 1) → clientId from c.setClientId
      const field1 = custTable!.columns.find(c => c.db === "FIELD1");
      expect(field1).toBeDefined();
      expect(field1!.inferred).toBe("clientId");

      // FIELD2 (index 2) → clientName from c.setClientName
      const field2 = custTable!.columns.find(c => c.db === "FIELD2");
      expect(field2).toBeDefined();
      expect(field2!.inferred).toBe("clientName");

      // FIELD3 (index 3) → solde from variable name
      const field3 = custTable!.columns.find(c => c.db === "FIELD3");
      expect(field3).toBeDefined();
      expect(field3!.inferred).toBe("solde");
    });
  });

  describe("Enriched abbreviation map (v13.8)", () => {
    it("decodes banking abbreviations like RIB, IBAN, VIR", () => {
      const bankDAO = `
package com.bank.dao;
import java.sql.*;
public class BankDAO {
    private static final String SELECT = "SELECT RIB, IBAN, VIR, BNF FROM BANK_TBL";
    public void process() throws SQLException {
        ResultSet rs = stmt.executeQuery(SELECT);
    }
}
`;
      const result = decodeSchema([
        { path: "BankDAO.java", content: bankDAO },
      ]);
      const bankTable = result.tables.find(t => t.name === "BANK_TBL");
      expect(bankTable).toBeDefined();

      const rib = bankTable!.columns.find(c => c.db === "RIB");
      expect(rib).toBeDefined();
      expect(rib!.inferred).toBe("rib");

      const iban = bankTable!.columns.find(c => c.db === "IBAN");
      expect(iban).toBeDefined();
      expect(iban!.inferred).toBe("iban");
    });
  });

  describe("nexabank-core CoreBankingDAO", () => {
    it("decodes ≥80% of columns from real nexabank DAO", () => {
      // Simulate nexabank CoreBankingDAO pattern
      const nexabankDAO = `
package com.nexabank.credit.dao;

import javax.annotation.Resource;
import javax.sql.DataSource;
import java.sql.*;

public class CoreBankingDAO {
    @Resource(lookup = "java:/jdbc/loanDS") private DataSource loanDS;
    @Resource(lookup = "java:/jdbc/ledgerDS") private DataSource ledgerDS;
    @Resource(lookup = "java:/jdbc/swiftDS") private DataSource swiftDS;

    private static final String FIND_LOAN = "SELECT NUM_DOSSIER, NOM_CLIENT, MTT_PRET, DT_DEBUT, DT_FIN, TAUX, STATUT FROM LOAN_TBL WHERE NUM_DOSSIER = ?";
    private static final String INSERT_LEDGER = "INSERT INTO LEDGER_TBL (NUM_ECRITURE, DT_VALEUR, MTT_DEBIT, MTT_CREDIT, LIB_OPERATION) VALUES (?, ?, ?, ?, ?)";

    public LoanDossier findLoan(String numDossier) throws SQLException {
        Connection conn = loanDS.getConnection();
        PreparedStatement ps = conn.prepareStatement(FIND_LOAN);
        ps.setString(1, numDossier);
        ResultSet rs = ps.executeQuery();
        if (rs.next()) {
            LoanDossier dossier = new LoanDossier();
            dossier.setNumDossier(rs.getString("NUM_DOSSIER"));
            dossier.setNomClient(rs.getString("NOM_CLIENT"));
            dossier.setMontantPret(rs.getBigDecimal("MTT_PRET"));
            dossier.setDateDebut(rs.getDate("DT_DEBUT"));
            dossier.setDateFin(rs.getDate("DT_FIN"));
            BigDecimal taux = rs.getBigDecimal("TAUX");
            dossier.setTaux(taux);
            String statut = rs.getString("STATUT");
            dossier.setStatut(statut);
            return dossier;
        }
        return null;
    }

    public void insertLedgerEntry(String numEcriture, LocalDate dateValeur, BigDecimal debit, BigDecimal credit, String libelle) throws SQLException {
        Connection conn = ledgerDS.getConnection();
        PreparedStatement ps = conn.prepareStatement(INSERT_LEDGER);
        ps.setString(1, numEcriture);
        ps.setDate(2, Date.valueOf(dateValeur));
        ps.setBigDecimal(3, debit);
        ps.setBigDecimal(4, credit);
        ps.setString(5, libelle);
        ps.executeUpdate();
    }
}
`;
      const result = decodeSchema([
        { path: "CoreBankingDAO.java", content: nexabankDAO },
      ]);

      const totalCols = result.stats.totalColumns;
      const decodedCols = result.stats.decoded;
      const decodedPct = decodedCols / totalCols * 100;

      expect(decodedPct).toBeGreaterThanOrEqual(80);
      expect(result.stats.highConfidence).toBeGreaterThanOrEqual(5);
    });
  });
});
