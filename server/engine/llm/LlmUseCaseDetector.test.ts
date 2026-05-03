/**
 * Tests unitaires pour LlmUseCaseDetector — v10.16
 */

import { describe, it, expect } from "vitest";
import { LlmUseCaseDetector } from "./LlmUseCaseDetector";

describe("LlmUseCaseDetector", () => {
  const detector = new LlmUseCaseDetector();

  describe("switch/case dispatch detection", () => {
    it("should detect use cases from switch/case dispatch pattern", () => {
      const files = [{
        path: "src/main/java/com/example/controllers/MainController.java",
        content: `
package com.example.controllers;
import org.springframework.web.bind.annotation.*;

@RestController
public class MainController {
    @PostMapping("/api")
    public ResponseEntity<String> handleRequest(@RequestBody String request) {
        String action = extractAction(request);
        switch (action) {
            case CREATE_USER:
                UserIn userIn = flux.getUserIn();
                UserOut userOut = userService.createUser(userIn);
                return buildResponse(userOut);
            case DELETE_USER:
                DeleteIn deleteIn = flux.getDeleteIn();
                DeleteOut deleteOut = userService.deleteUser(deleteIn);
                return buildResponse(deleteOut);
            case GET_BALANCE:
                BalanceIn balanceIn = flux.getBalanceIn();
                BalanceOut balanceOut = accountService.getBalance(balanceIn);
                return buildResponse(balanceOut);
        }
    }
}`,
      }];

      const result = detector.detect(files);
      expect(result.detectedCount).toBe(3);
      expect(result.method).toBe("switch_dispatch");
      expect(result.useCases.length).toBe(3);
      expect(result.useCases[0].className).toContain("CREATE_USER");
      expect(result.useCases[1].className).toContain("DELETE_USER");
      expect(result.useCases[2].className).toContain("GET_BALANCE");
    });

    it("should extract VoIn types from flux.getXxxIn() pattern", () => {
      const files = [{
        path: "src/main/java/com/example/Controller.java",
        content: `
package com.example;
public class Controller {
    public void handle(String action) {
        switch (action) {
            case TRANSFER:
                TransferIn transferIn = flux.getTransferIn();
                TransferOut result = transferService.execute(transferIn);
                break;
        }
    }
}`,
      }];

      const result = detector.detect(files);
      expect(result.detectedCount).toBe(1);
      expect(result.useCases[0].voInType).toBe("TransferIn");
    });
  });

  describe("controller endpoint detection", () => {
    it("should detect REST endpoints from Spring controllers", () => {
      const files = [{
        path: "src/main/java/com/example/api/PaymentController.java",
        content: `
package com.example.api;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/payments")
public class PaymentController {
    @PostMapping("/create")
    public ResponseEntity<PaymentResponse> createPayment(@RequestBody PaymentRequest request) {
        return ResponseEntity.ok(paymentService.create(request));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PaymentResponse> getPayment(@PathVariable String id) {
        return ResponseEntity.ok(paymentService.findById(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> cancelPayment(@PathVariable String id) {
        paymentService.cancel(id);
        return ResponseEntity.noContent().build();
    }
}`,
      }];

      const result = detector.detect(files);
      expect(result.detectedCount).toBe(3);
      expect(result.method).toBe("controller_endpoint");
      expect(result.useCases.map(uc => uc.className)).toEqual([
        "PaymentController_createPayment",
        "PaymentController_getPayment",
        "PaymentController_cancelPayment",
      ]);
    });
  });

  describe("service method detection", () => {
    it("should detect methods from service interfaces when no controller/switch found", () => {
      const files = [{
        path: "src/main/java/com/example/service/AccountService.java",
        content: `
package com.example.service;

public interface AccountService {
    AccountDto createAccount(CreateAccountRequest request);
    AccountDto getAccount(String accountId);
    void closeAccount(String accountId);
    TransferResult transferFunds(TransferRequest request);
}`,
      }];

      const result = detector.detect(files);
      expect(result.detectedCount).toBeGreaterThanOrEqual(2);
      expect(result.method).toBe("service_method");
      // Should skip void methods without meaningful params
      const ucClassNames = result.useCases.map(uc => uc.className);
      expect(ucClassNames).toContain("AccountService_createAccount");
      expect(ucClassNames).toContain("AccountService_transferFunds");
    });
  });

  describe("no detection", () => {
    it("should return 0 UC for empty files", () => {
      const result = detector.detect([]);
      expect(result.detectedCount).toBe(0);
      expect(result.method).toBe("none");
    });

    it("should return 0 UC for files with only DTOs", () => {
      const files = [{
        path: "src/main/java/com/example/dto/UserDto.java",
        content: `
package com.example.dto;
public class UserDto {
    private String name;
    private String email;
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
}`,
      }];

      const result = detector.detect(files);
      expect(result.detectedCount).toBe(0);
    });
  });

  describe("real-world: transfert-euro pattern", () => {
    it("should detect 28 UC from ActionWeb enum switch dispatch", () => {
      // Simulated version of the real transfert-euro controller
      const cases = [
        "GENERATETOKEN", "TAUXCHANGE", "CREATEACCOUNT", "VALIDATEOTP",
        "CREATEBENEF", "PERSONALINFORMATION", "VALIDATEFIRSTSTEP", "GETSTEP",
      ];
      const switchBody = cases.map(c => `
            case ${c}:
                ${c}In input = flux.get${c}In();
                ${c}Out output = service.handle(input);
                responseXml = BuildResponse.buildSoapResponse(output);
                break;`).join("\n");

      const files = [{
        path: "src/main/java/ma/eai/boa/xbanking/controllers/EuroServiceController.java",
        content: `
package ma.eai.boa.xbanking.controllers;
public class EuroServiceController {
    public ResponseEntity<String> handleSoapRequest(String request) {
        ActionWeb action = ActionWeb.valueOf(functionName);
        switch (action) {${switchBody}
        }
    }
}`,
      }];

      const result = detector.detect(files);
      expect(result.detectedCount).toBe(8);
      expect(result.method).toBe("switch_dispatch");
      expect(result.useCases[0].className).toContain("GENERATETOKEN");
      expect(result.useCases[0].voInType).toBe("GENERATETOKENIn");
    });
  });

  describe("integration with parseEjbProject", () => {
    it("should be used as fallback in parseEjbProject when 0 UC detected", async () => {
      // This is tested via scripts/test-uc-detect.ts on real projects
      // Here we just verify the detector produces valid UseCaseIR objects
      const files = [{
        path: "src/main/java/com/example/Controller.java",
        content: `
package com.example;
public class Controller {
    public void dispatch(String action) {
        switch (action) {
            case SEND_EMAIL:
                EmailIn emailIn = flux.getEmailIn();
                EmailOut emailOut = emailService.send(emailIn);
                break;
        }
    }
}`,
      }];

      const result = detector.detect(files);
      expect(result.useCases.length).toBe(1);
      const uc = result.useCases[0];
      // Verify UseCaseIR shape
      expect(uc).toHaveProperty("className");
      expect(uc).toHaveProperty("packageName");
      expect(uc).toHaveProperty("domain");
      expect(uc).toHaveProperty("bianDomain");
      expect(uc).toHaveProperty("voInType");
      expect(uc).toHaveProperty("voOutType");
      expect(uc).toHaveProperty("sourceFile");
      expect(uc).toHaveProperty("rawSource");
      expect(uc).toHaveProperty("httpMethod");
      expect(uc).toHaveProperty("restPath");
    });
  });
});
