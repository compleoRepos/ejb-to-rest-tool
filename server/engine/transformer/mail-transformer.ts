/**
 * mail-transformer.ts — v12.8 Bloc 3
 * Post-generation transformer: replaces javax.mail / jakarta.mail patterns
 * with Spring Boot's JavaMailSender equivalents.
 *
 * Patterns handled:
 * 1. javax.mail.Session → JavaMailSender (injected via @Autowired)
 * 2. MimeMessage creation → mailSender.createMimeMessage()
 * 3. Transport.send(message) → mailSender.send(message)
 * 4. javax.mail imports → Spring mail imports
 * 5. @Resource(name="mail/...") → @Autowired JavaMailSender
 * 6. JMS patterns → Spring JmsTemplate
 *
 * Applied AFTER the code is generated, before Maven compile.
 * All transformations are idempotent.
 *
 * @author Compleo v12.8
 */

// ═══ MAIL IMPORT REPLACEMENTS ═══
const MAIL_IMPORT_REPLACEMENTS: [RegExp, string][] = [
  // Remove javax.mail / jakarta.mail imports (replaced by Spring imports)
  [/import\s+(?:javax|jakarta)\.mail\.Message;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.mail\.MessagingException;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.mail\.Session;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.mail\.Transport;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.mail\.internet\.InternetAddress;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.mail\.internet\.MimeMessage;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.mail\.\*;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.mail\.internet\.\*;\r?\n?/g, ""],
];

// Spring mail imports to add
const SPRING_MAIL_IMPORTS = [
  "import org.springframework.mail.javamail.JavaMailSender;",
  "import org.springframework.mail.javamail.MimeMessageHelper;",
  "import jakarta.mail.internet.MimeMessage;",
  "import org.springframework.beans.factory.annotation.Autowired;",
];

// ═══ JMS IMPORT REPLACEMENTS ═══
const JMS_IMPORT_REPLACEMENTS: [RegExp, string][] = [
  [/import\s+(?:javax|jakarta)\.jms\.JMSContext;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.jms\.JMSConsumer;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.jms\.JMSProducer;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.jms\.JMSDestinationDefinition;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.jms\.JMSException;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.jms\.ObjectMessage;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.jms\.TextMessage;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.jms\.Queue;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.jms\.QueueBrowser;\r?\n?/g, ""],
  [/import\s+(?:javax|jakarta)\.jms\.\*;\r?\n?/g, ""],
];

const SPRING_JMS_IMPORTS = [
  "import org.springframework.jms.core.JmsTemplate;",
  "import org.springframework.beans.factory.annotation.Autowired;",
];

// ═══ MAIL CODE REPLACEMENTS ═══
const MAIL_CODE_REPLACEMENTS: [RegExp, string][] = [
  // @Resource(name = "mail/...") private Session session → @Autowired private JavaMailSender mailSender
  [/@Resource\s*\(\s*name\s*=\s*"mail\/[^"]*"\s*\)\s*\n?\s*private\s+Session\s+\w+;/g,
    "@Autowired\n    private JavaMailSender mailSender;"],
  // private Session session (field) → private JavaMailSender mailSender
  [/private\s+Session\s+session\s*;/g, "private JavaMailSender mailSender;"],
  // Session.getInstance(...) → (remove, use injected mailSender)
  [/session\s*=\s*Session\.getInstance\([^)]*\)\s*;/g, "// Session managed by Spring Boot auto-configuration"],
  // Message message = new MimeMessage(session) → MimeMessage message = mailSender.createMimeMessage()
  [/Message\s+(\w+)\s*=\s*new\s+MimeMessage\s*\(\s*session\s*\)\s*;/g,
    "MimeMessage $1 = mailSender.createMimeMessage();"],
  [/MimeMessage\s+(\w+)\s*=\s*new\s+MimeMessage\s*\(\s*session\s*\)\s*;/g,
    "MimeMessage $1 = mailSender.createMimeMessage();"],
  // Transport.send(message) → mailSender.send(message)
  [/Transport\.send\s*\(\s*(\w+)\s*\)\s*;/g, "mailSender.send($1);"],
  // message.setFrom() → (no-op in Spring, configured in properties)
  [/(\w+)\.setFrom\(\s*\)\s*;/g, "// From address configured in application.properties"],
  // message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(...))
  // → helper.setTo(...)
  [/(\w+)\.setRecipients\s*\(\s*Message\.RecipientType\.TO\s*,\s*InternetAddress\.parse\s*\(\s*(\w+)\s*,\s*false\s*\)\s*\)\s*;/g,
    "MimeMessageHelper helper = new MimeMessageHelper($1, false);\n        helper.setTo($2);"],
  // catch (MessagingException ...) → catch (Exception ...) for broader compatibility
  [/catch\s*\(\s*MessagingException\s+(\w+)\s*\)/g, "catch (Exception $1)"],
];

// ═══ JMS CODE REPLACEMENTS ═══
const JMS_CODE_REPLACEMENTS: [RegExp, string][] = [
  // @JMSDestinationDefinition(...) → remove (Spring handles this via config)
  [/@JMSDestinationDefinition\s*\([^)]*\)\s*\n?/g, ""],
  // @Inject private JMSContext context → @Autowired private JmsTemplate jmsTemplate
  [/@Inject\s*\n?\s*private\s+JMSContext\s+\w+\s*;/g,
    "@Autowired\n    private JmsTemplate jmsTemplate;"],
  // @Resource(...) private Queue queue → (remove, use destination name in jmsTemplate)
  [/@Resource\s*\([^)]*\)\s*\n?\s*private\s+Queue\s+\w+\s*;/g,
    "// Queue destination configured in application.properties"],
  // private QueueBrowser browser → remove
  [/private\s+QueueBrowser\s+\w+\s*;/g, ""],
  // context.createObjectMessage() → (Spring handles serialization)
  [/(\w+)\s*=\s*context\.createObjectMessage\(\)\s*;/g,
    "// Message creation handled by JmsTemplate"],
  // v12.8: Remove ObjectMessage method calls (setObject, setStringProperty, etc.)
  // These are left dangling after createObjectMessage is removed
  [/\s*\w+\.setObject\([^)]*\)\s*;/g, ""],
  [/\s*\w+\.setStringProperty\([^)]*\)\s*;/g, ""],
  [/\s*\w+\.setIntProperty\([^)]*\)\s*;/g, ""],
  [/\s*\w+\.setLongProperty\([^)]*\)\s*;/g, ""],
  [/\s*\w+\.setBooleanProperty\([^)]*\)\s*;/g, ""],
  // context.createProducer().send(queue, msg) → jmsTemplate.convertAndSend(...)
  [/context\.createProducer\(\)\.send\s*\(\s*\w+\s*,\s*(\w+)\s*\)\s*;/g,
    "jmsTemplate.convertAndSend(\"orderQueue\", $1);"],
  // v12.8: catch (JMSException ...) → catch (Exception ...) for broader compatibility
  [/catch\s*\(\s*JMSException\s+(\w+)\s*\)/g, "catch (Exception $1)"],
  // v12.8: Remove JMS-specific variable declarations left dangling
  [/\s*ObjectMessage\s+\w+\s*;/g, ""],
  [/\s*TextMessage\s+\w+\s*;/g, ""],
];

/**
 * Transform javax.mail patterns to Spring Boot JavaMailSender.
 * Should be applied to generated Java files that contain mail-related code.
 */
export function transformMailReferences(javaCode: string): string {
  if (!hasMailReferences(javaCode)) return javaCode;

  let result = javaCode;

  // 1. Replace mail imports
  for (const [pattern, replacement] of MAIL_IMPORT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // 2. Add Spring mail imports (after package declaration)
  const packageMatch = result.match(/^(package\s+[^;]+;\s*\n)/m);
  if (packageMatch) {
    const insertPoint = packageMatch.index! + packageMatch[0].length;
    const existingImports = result.substring(insertPoint);
    const importsToAdd = SPRING_MAIL_IMPORTS
      .filter(imp => !existingImports.includes(imp))
      .join("\n");
    if (importsToAdd) {
      result = result.substring(0, insertPoint) + "\n" + importsToAdd + "\n" + result.substring(insertPoint);
    }
  }

  // 3. Apply code replacements
  for (const [pattern, replacement] of MAIL_CODE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // 4. Clean up empty lines
  result = result.replace(/\n{4,}/g, "\n\n\n");

  return result;
}

/**
 * Transform javax.jms patterns to Spring Boot JmsTemplate.
 * Should be applied to generated Java files that contain JMS-related code.
 */
export function transformJmsReferences(javaCode: string): string {
  if (!hasJmsReferences(javaCode)) return javaCode;

  let result = javaCode;

  // 1. Replace JMS imports
  for (const [pattern, replacement] of JMS_IMPORT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // 2. Add Spring JMS imports
  const packageMatch = result.match(/^(package\s+[^;]+;\s*\n)/m);
  if (packageMatch) {
    const insertPoint = packageMatch.index! + packageMatch[0].length;
    const existingImports = result.substring(insertPoint);
    const importsToAdd = SPRING_JMS_IMPORTS
      .filter(imp => !existingImports.includes(imp))
      .join("\n");
    if (importsToAdd) {
      result = result.substring(0, insertPoint) + "\n" + importsToAdd + "\n" + result.substring(insertPoint);
    }
  }

  // 3. v12.8: Pre-process multi-line JMS send blocks BEFORE individual replacements
  // Pattern: ObjectMessage <var> = context.createObjectMessage();
  //          <var>.setObject(<payload>);
  //          ... (optional property settings)
  //          context.createProducer().send(<queue>, <var>);
  // Replace with: jmsTemplate.convertAndSend("orderQueue", <payload>);
  const objMsgPattern = /ObjectMessage\s+(\w+)\s*=\s*context\.createObjectMessage\(\)\s*;\s*\n?([\s\S]*?)context\.createProducer\(\)\.send\s*\(\s*\w+\s*,\s*\1\s*\)\s*;/g;
  result = result.replace(objMsgPattern, (match, varName, middleBlock) => {
    // Extract the payload from setObject call
    const setObjMatch = middleBlock.match(new RegExp(`${varName}\\.setObject\\(([^)]+)\\)`));
    const payload = setObjMatch ? setObjMatch[1].trim() : varName;
    return `jmsTemplate.convertAndSend("orderQueue", ${payload});`;
  });

  // 3b. Apply remaining code replacements for patterns not caught by the block replacement
  for (const [pattern, replacement] of JMS_CODE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // 4. v12.8: Clean up orphaned try-catch blocks after JMS block replacement
  // When the ObjectMessage block spans across a try { boundary, the replacement
  // removes the try { but leaves the } catch (...) { ... } dangling.
  // Fix: wrap the convertAndSend in a simple try-catch, or remove orphaned catch blocks.
  const lines = result.split('\n');
  const cleanedLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    // Check for orphaned "} catch (...)" - a catch without a preceding try
    if (trimmed.match(/^\}\s*catch\s*\(/)) {
      // Look backwards to see if there's a matching "try {" in the recent lines
      let hasTry = false;
      let braceCount = 0;
      for (let j = cleanedLines.length - 1; j >= Math.max(0, cleanedLines.length - 30); j--) {
        const prevTrimmed = cleanedLines[j].trim();
        if (prevTrimmed.endsWith('{')) braceCount++;
        if (prevTrimmed.startsWith('}')) braceCount--;
        if (prevTrimmed.match(/^try\s*\{/) || prevTrimmed === 'try {') {
          hasTry = true;
          break;
        }
      }
      if (!hasTry) {
        // Skip the entire catch block (find matching closing brace)
        // The line is like "} catch (Exception ex) {" - we need to find the closing } of the catch body
        // Count only the opening { of the catch block (ignore the leading } which closes the try)
        let depth = 0;
        const catchLine = lines[i];
        // Count braces on the catch line: "} catch (...) {" has one } and one {
        // We only care about the opening { of the catch body
        for (const ch of catchLine) {
          if (ch === '{') depth++;
        }
        // depth should be 1 (the opening brace of catch body)
        i++; // move past the "} catch" line
        // Now consume lines until depth reaches 0
        while (i < lines.length && depth > 0) {
          const cl = lines[i];
          for (const ch of cl) {
            if (ch === '{') depth++;
            if (ch === '}') depth--;
          }
          i++;
        }
        continue;
      }
    }
    // Also check for orphaned "try {" that only contains a convertAndSend
    // and wrap it properly (this case is already valid Java, so leave it)
    cleanedLines.push(lines[i]);
    i++;
  }
  result = cleanedLines.join('\n');

  // 5. Final cleanup
  result = result.replace(/\n{4,}/g, "\n\n\n");

  return result;
}

/**
 * Check if Java code contains javax.mail references.
 */
export function hasMailReferences(javaCode: string): boolean {
  return /(?:javax|jakarta)\.mail/.test(javaCode) ||
    /Transport\.send/.test(javaCode) ||
    /new\s+MimeMessage/.test(javaCode);
}

/**
 * Check if Java code contains javax.jms references.
 */
export function hasJmsReferences(javaCode: string): boolean {
  return /(?:javax|jakarta)\.jms/.test(javaCode) ||
    /JMSContext/.test(javaCode) ||
    /JMSDestinationDefinition/.test(javaCode);
}

/**
 * Combined transformer: applies both mail and JMS transformations.
 */
export function transformMailAndJms(javaCode: string): string {
  let result = javaCode;
  result = transformMailReferences(result);
  result = transformJmsReferences(result);
  return result;
}
