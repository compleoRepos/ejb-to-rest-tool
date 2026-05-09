/**
 * Tests for CompileValidator — static Java syntax and structure validation.
 * @version 12.6
 */
import { describe, it, expect } from "vitest";
import { validateCompilation } from "./CompileValidator";

describe("CompileValidator", () => {
  describe("Brace balance", () => {
    it("should pass for balanced braces", () => {
      const result = validateCompilation([{
        path: "src/main/java/com/example/MyService.java",
        content: `package com.example;
import org.springframework.stereotype.Service;
@Service
public class MyService {
    public void doWork() {
        if (true) {
            System.out.println("ok");
        }
    }
}`,
      }]);
      expect(result.stats.braceErrors).toBe(0);
    });

    it("should detect unclosed braces", () => {
      const result = validateCompilation([{
        path: "src/main/java/com/example/Bad.java",
        content: `package com.example;
public class Bad {
    public void broken() {
        if (true) {
            // missing close
    }
}`,
      }]);
      expect(result.stats.braceErrors).toBe(1);
      expect(result.errors.some(e => e.code === "E001")).toBe(true);
    });

    it("should ignore braces in strings and comments", () => {
      const result = validateCompilation([{
        path: "src/main/java/com/example/Strings.java",
        content: `package com.example;
public class Strings {
    public String get() {
        String s = "{ not a brace }";
        // { also not a brace }
        /* { block comment } */
        return s;
    }
}`,
      }]);
      expect(result.stats.braceErrors).toBe(0);
    });
  });

  describe("Import resolution", () => {
    it("should resolve standard Java/Spring imports", () => {
      const result = validateCompilation([{
        path: "src/main/java/com/example/Svc.java",
        content: `package com.example;
import java.util.List;
import org.springframework.stereotype.Service;
import lombok.RequiredArgsConstructor;
@Service
public class Svc {}`,
      }]);
      expect(result.stats.importsResolved).toBe(3);
      expect(result.stats.importsUnresolved).toBe(0);
    });

    it("should resolve cross-file project imports", () => {
      const result = validateCompilation([
        {
          path: "src/main/java/com/example/dto/LoanRequest.java",
          content: `package com.example.dto;
public class LoanRequest { }`,
        },
        {
          path: "src/main/java/com/example/service/LoanService.java",
          content: `package com.example.service;
import com.example.dto.LoanRequest;
public class LoanService {
    public void process(LoanRequest req) {}
}`,
        },
      ]);
      expect(result.stats.importsResolved).toBe(1);
      expect(result.errors.filter(e => e.code === "E002")).toHaveLength(0);
    });

    it("should flag unresolved project imports", () => {
      const result = validateCompilation([{
        path: "src/main/java/com/example/Svc.java",
        content: `package com.example;
import com.example.dto.NonExistentDto;
public class Svc {}`,
      }]);
      expect(result.errors.some(e => e.code === "E002" && e.message.includes("NonExistentDto"))).toBe(true);
    });
  });

  describe("Injection resolution", () => {
    it("should resolve injections to known classes", () => {
      const result = validateCompilation([
        {
          path: "src/main/java/com/example/repo/LoanRepository.java",
          content: `package com.example.repo;
import org.springframework.stereotype.Repository;
@Repository
public class LoanRepository {}`,
        },
        {
          path: "src/main/java/com/example/service/LoanService.java",
          content: `package com.example.service;
import org.springframework.stereotype.Service;
import com.example.repo.LoanRepository;
@Service
public class LoanService {
    private final LoanRepository loanRepository;
    public LoanService(LoanRepository loanRepository) {
        this.loanRepository = loanRepository;
    }
}`,
        },
      ]);
      expect(result.stats.injectionsResolved).toBeGreaterThan(0);
    });
  });

  describe("Basic syntax", () => {
    it("should detect double semicolons", () => {
      const result = validateCompilation([{
        path: "src/main/java/com/example/Bad.java",
        content: `package com.example;
public class Bad {
    public void x() {
        int a = 1;; int b = 2;
    }
}`,
      }]);
      expect(result.errors.some(e => e.code === "E003")).toBe(true);
    });
  });

  describe("pom.xml validation", () => {
    it("should warn when @Entity used without JPA dependency", () => {
      const result = validateCompilation([
        {
          path: "pom.xml",
          content: `<project>
  <parent>
    <artifactId>spring-boot-starter-parent</artifactId>
  </parent>
  <dependencies>
    <dependency>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>`,
        },
        {
          path: "src/main/java/com/example/entity/Loan.java",
          content: `package com.example.entity;
import javax.persistence.Entity;
@Entity
public class Loan {
    private Long id;
}`,
        },
      ]);
      expect(result.warnings.some(w => w.code === "W005" && w.message.includes("data-jpa"))).toBe(true);
    });

    it("should not warn when dependencies are correctly declared", () => {
      const result = validateCompilation([
        {
          path: "pom.xml",
          content: `<project>
  <parent>
    <artifactId>spring-boot-starter-parent</artifactId>
  </parent>
  <dependencies>
    <dependency>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
  </dependencies>
</project>`,
        },
        {
          path: "src/main/java/com/example/entity/Loan.java",
          content: `package com.example.entity;
import javax.persistence.Entity;
@Entity
public class Loan {
    private Long id;
}`,
        },
      ]);
      expect(result.warnings.filter(w => w.code === "W005" && w.message.includes("data-jpa"))).toHaveLength(0);
    });
  });

  describe("Score calculation", () => {
    it("should give 100 for a clean project", () => {
      const result = validateCompilation([
        {
          path: "pom.xml",
          content: `<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>`,
        },
        {
          path: "src/main/java/com/example/Application.java",
          content: `package com.example;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}`,
        },
      ]);
      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(90);
    });
  });
});
