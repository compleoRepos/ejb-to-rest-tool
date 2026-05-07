/**
 * Tests FIX 3 — JMS @Resource topic extraction et Kafka topic naming
 */
import { describe, it, expect } from "vitest";
import { JmsDetector } from "./detectors/jms-detector";
import { JmsGenerator } from "./generators/jms-generator";

describe("FIX 3 — JMS @Resource topic extraction", () => {
  it("should extract destination from @Resource(name = jms/queue/...)", () => {
    const detector = new JmsDetector();
    const content = `
import javax.jms.MessageListener;
import javax.annotation.Resource;
import javax.jms.Queue;

@MessageDriven(activationConfig = {})
public class NotificationMDB implements MessageListener {
    @Resource(name = "jms/queue/BMCE_NOTIFICATIONS")
    private Queue notificationQueue;

    public void onMessage(Message message) {}
}`;
    const components = detector.detect(content, "NotificationMDB.java");
    expect(components.length).toBe(1);
    expect(components[0].metadata.destinationName).toBe("jms/queue/BMCE_NOTIFICATIONS");
  });

  it("should extract destination from @Resource(name = jms/topic/...)", () => {
    const detector = new JmsDetector();
    const content = `
@MessageDriven
public class AlertMDB implements MessageListener {
    @Resource(name = "jms/topic/ALERTS")
    private Topic alertTopic;

    public void onMessage(Message message) {}
}`;
    const components = detector.detect(content, "AlertMDB.java");
    expect(components.length).toBe(1);
    expect(components[0].metadata.destinationName).toBe("jms/topic/ALERTS");
  });

  it("should clean JNDI name to Kafka topic: jms/queue/BMCE_NOTIFICATIONS → bmce-notifications", () => {
    const gen = new JmsGenerator();
    // Access private method
    const cleanTopic = (gen as any)["cleanDestinationName"]("jms/queue/BMCE_NOTIFICATIONS");
    expect(cleanTopic).toBe("bmce-notifications");
  });

  it("should clean JNDI topic name: jms/topic/ALERTS → alerts", () => {
    const gen = new JmsGenerator();
    const cleanTopic = (gen as any)["cleanDestinationName"]("jms/topic/ALERTS");
    expect(cleanTopic).toBe("alerts");
  });

  it("should keep simple names unchanged: myQueue → myqueue", () => {
    const gen = new JmsGenerator();
    const cleanTopic = (gen as any)["cleanDestinationName"]("myQueue");
    expect(cleanTopic).toBe("myqueue");
  });
});
