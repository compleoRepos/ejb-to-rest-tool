import { describe, it, expect } from "vitest";
import { compileWithMaven, generateBuildValidationReport } from "./RealMavenCompiler";

describe("RealMavenCompiler", () => {
  it("should compile a minimal valid Spring Boot service", () => {
    const files = [
      {
        path: "src/main/java/com/example/demo/DemoApplication.java",
        content: `package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
`,
      },
      {
        path: "src/main/java/com/example/demo/service/GreetingService.java",
        content: `package com.example.demo.service;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class GreetingService {
    private static final Logger log = LoggerFactory.getLogger(GreetingService.class);

    public String greet(String name) {
        log.info("Greeting {}", name);
        return "Hello, " + name + "!";
    }
}
`,
      },
      {
        path: "src/main/java/com/example/demo/controller/GreetingController.java",
        content: `package com.example.demo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.example.demo.service.GreetingService;

@RestController
public class GreetingController {
    private final GreetingService greetingService;

    public GreetingController(GreetingService greetingService) {
        this.greetingService = greetingService;
    }

    @GetMapping("/greet")
    public String greet(@RequestParam(defaultValue = "World") String name) {
        return greetingService.greet(name);
    }
}
`,
      },
    ];

    const result = compileWithMaven(files);
    console.log(`Status: ${result.status}, Method: ${result.method}, Duration: ${result.durationMs}ms`);
    console.log(`Errors: ${result.errorCount}, Warnings: ${result.warningCount}`);

    if (result.method === "maven") {
      expect(result.status).toBe("PASS");
      expect(result.errorCount).toBe(0);
      expect(result.durationMs).toBeGreaterThan(0);
    } else {
      // Fallback to static
      expect(result.status).toBe("STATIC");
      expect(result.staticFallbackResult).toBeDefined();
    }
  }, 120000); // 2 min timeout for Maven

  it("should detect compilation errors in invalid Java", () => {
    const files = [
      {
        path: "src/main/java/com/example/demo/DemoApplication.java",
        content: `package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
`,
      },
      {
        path: "src/main/java/com/example/demo/service/BrokenService.java",
        content: `package com.example.demo.service;

import org.springframework.stereotype.Service;
import com.example.demo.model.NonExistentClass;

@Service
public class BrokenService {
    private final NonExistentClass dep;

    public BrokenService(NonExistentClass dep) {
        this.dep = dep;
    }

    public String doSomething() {
        UndeclaredType x = new UndeclaredType();
        return x.toString();
    }
}
`,
      },
    ];

    const result = compileWithMaven(files);
    console.log(`Status: ${result.status}, Errors: ${result.errorCount}`);

    if (result.method === "maven") {
      expect(result.status).toBe("FAIL");
      expect(result.errorCount).toBeGreaterThan(0);
    } else {
      expect(result.status).toBe("STATIC");
    }
  }, 120000);

  it("should compile a JPA entity + repository project", () => {
    const files = [
      {
        path: "src/main/java/com/example/demo/DemoApplication.java",
        content: `package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
`,
      },
      {
        path: "src/main/java/com/example/demo/model/Account.java",
        content: `package com.example.demo.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Column;

@Entity
public class Account {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String accountNumber;

    @Column(nullable = false)
    private Double balance;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAccountNumber() { return accountNumber; }
    public void setAccountNumber(String accountNumber) { this.accountNumber = accountNumber; }
    public Double getBalance() { return balance; }
    public void setBalance(Double balance) { this.balance = balance; }
}
`,
      },
      {
        path: "src/main/java/com/example/demo/repository/AccountRepository.java",
        content: `package com.example.demo.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.example.demo.model.Account;

@Repository
public interface AccountRepository extends JpaRepository<Account, Long> {
    Account findByAccountNumber(String accountNumber);
}
`,
      },
      {
        path: "src/main/java/com/example/demo/service/AccountService.java",
        content: `package com.example.demo.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.example.demo.repository.AccountRepository;
import com.example.demo.model.Account;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
@Transactional
public class AccountService {
    private static final Logger log = LoggerFactory.getLogger(AccountService.class);
    private final AccountRepository accountRepository;

    public AccountService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    public Account findByNumber(String number) {
        log.info("Finding account by number: {}", number);
        return accountRepository.findByAccountNumber(number);
    }

    public Account save(Account account) {
        log.info("Saving account: {}", account.getAccountNumber());
        return accountRepository.save(account);
    }
}
`,
      },
      {
        path: "src/main/resources/application.yml",
        content: `spring:
  datasource:
    url: jdbc:h2:mem:testdb
    driver-class-name: org.h2.Driver
  jpa:
    hibernate:
      ddl-auto: create-drop
    show-sql: false
`,
      },
    ];

    const result = compileWithMaven(files);
    console.log(`Status: ${result.status}, Method: ${result.method}, Duration: ${result.durationMs}ms`);

    if (result.method === "maven") {
      expect(result.status).toBe("PASS");
      expect(result.errorCount).toBe(0);
    }
  }, 120000);

  it("should generate a proper build validation report", () => {
    const result = {
      status: "PASS" as const,
      exitCode: 0,
      errors: [],
      warnings: [],
      warningCount: 0,
      errorCount: 0,
      durationMs: 18400,
      dependenciesResolved: 47,
      dependenciesTotal: 47,
      method: "maven" as const,
    };

    const report = generateBuildValidationReport(result);
    expect(report).toContain("Build Validation");
    expect(report).toContain("PASS");
    expect(report).toContain("18.4s");
    expect(report).toContain("47/47");
  });

  it("should generate a report with errors for FAIL status", () => {
    const result = {
      status: "FAIL" as const,
      exitCode: 1,
      errors: [
        { file: "AccountService.java", line: 15, message: "cannot find symbol: class NonExistent", severity: "error" as const },
        { file: "PaymentService.java", line: 8, message: "package does not exist", severity: "error" as const },
      ],
      warnings: [],
      warningCount: 0,
      errorCount: 2,
      durationMs: 12300,
      dependenciesResolved: 45,
      dependenciesTotal: 47,
      method: "maven" as const,
    };

    const report = generateBuildValidationReport(result);
    expect(report).toContain("FAIL");
    expect(report).toContain("Top Compile Errors");
    expect(report).toContain("AccountService.java");
    expect(report).toContain("cannot find symbol");
  });
});
