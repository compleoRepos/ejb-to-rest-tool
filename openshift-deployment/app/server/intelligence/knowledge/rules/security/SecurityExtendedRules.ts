/**
 * securityExtendedRules — Auto-generated rules for security
 * Total: 55 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const securityExtendedRules: Rule[] = [
  {
    id: "SEC_INJ_001",
    category: "SECURITY",
    name: "SQL Injection concat",
    severity: "critical",
    description: "Concatenation SQL directe - risque injection",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /["']\s*\+\s*\w+.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_002",
    category: "SECURITY",
    name: "SQL Injection format",
    severity: "critical",
    description: "String.format dans requete SQL",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /String\.format\s*\(.*(?:SELECT|INSERT|UPDATE|DELETE)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_003",
    category: "SECURITY",
    name: "LDAP Injection",
    severity: "critical",
    description: "Concatenation dans filtre LDAP",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /["']\s*\+.*(?:ldap|search|filter)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_004",
    category: "SECURITY",
    name: "XPath Injection",
    severity: "critical",
    description: "Concatenation dans expression XPath",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /["']\s*\+.*(?:xpath|evaluate)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_005",
    category: "SECURITY",
    name: "Command Injection",
    severity: "critical",
    description: "Execution commande systeme avec input utilisateur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Runtime\.getRuntime\(\)\.exec|ProcessBuilder/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_006",
    category: "SECURITY",
    name: "JNDI Injection",
    severity: "critical",
    description: "Lookup JNDI avec input non valide",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /lookup\s*\(\s*\w+(?!.*sanitize|.*validate)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_007",
    category: "SECURITY",
    name: "XML External Entity",
    severity: "critical",
    description: "Parser XML sans desactivation DTD",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /DocumentBuilderFactory(?!.*setFeature.*disallow-doctype)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_008",
    category: "SECURITY",
    name: "SSRF possible",
    severity: "critical",
    description: "URL construite depuis input utilisateur",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+URL\s*\(\s*\w+(?!.*whitelist|.*validate)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_009",
    category: "SECURITY",
    name: "Deserialization unsafe",
    severity: "critical",
    description: "ObjectInputStream sans filtre de classes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ObjectInputStream(?!.*ObjectInputFilter|.*resolveClass)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_010",
    category: "SECURITY",
    name: "Template Injection",
    severity: "critical",
    description: "Template engine avec input non echappe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.evaluate\s*\(.*\+|\.render\s*\(.*\+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_011",
    category: "SECURITY",
    name: "Log Injection",
    severity: "major",
    description: "Input utilisateur dans log sans sanitization",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\s*\(.*\+\s*\w*(input|param|request|user)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_012",
    category: "SECURITY",
    name: "Header Injection",
    severity: "critical",
    description: "Header HTTP construit depuis input",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /setHeader\s*\(.*\+\s*\w+|addHeader\s*\(.*\+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_013",
    category: "SECURITY",
    name: "Email Header Injection",
    severity: "major",
    description: "Champ email avec CRLF possible",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /setSubject\s*\(.*\+|setFrom\s*\(.*\+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_014",
    category: "SECURITY",
    name: "HQL Injection",
    severity: "critical",
    description: "Concatenation dans requete HQL/JPQL",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createQuery\s*\(\s*["']\s*\+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_INJ_015",
    category: "SECURITY",
    name: "Regex DoS",
    severity: "major",
    description: "Pattern regex avec backtracking exponentiel",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Pattern\.compile\s*\(\s*["'].*(\.\*){2,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_001",
    category: "SECURITY",
    name: "Password en clair",
    severity: "critical",
    description: "Mot de passe stocke sans hachage",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /password\s*=\s*["']|\.setPassword\s*\(/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_002",
    category: "SECURITY",
    name: "MD5 pour password",
    severity: "critical",
    description: "MD5 utilise pour hachage mot de passe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /MD5|MessageDigest.*md5/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_003",
    category: "SECURITY",
    name: "SHA1 pour password",
    severity: "critical",
    description: "SHA-1 utilise pour hachage mot de passe",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SHA-?1|MessageDigest.*sha.?1/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_004",
    category: "SECURITY",
    name: "Salt absent",
    severity: "critical",
    description: "Hachage mot de passe sans salt",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /hash\w*\(.*password(?!.*salt)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_005",
    category: "SECURITY",
    name: "Session fixation",
    severity: "critical",
    description: "Session ID non regenere apres login",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /login|authenticate(?!.*invalidate|.*changeSessionId)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_006",
    category: "SECURITY",
    name: "Remember-me insecure",
    severity: "major",
    description: "Token remember-me sans expiration",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /rememberMe|remember.*token(?!.*expir)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_007",
    category: "SECURITY",
    name: "Brute force non protege",
    severity: "critical",
    description: "Login sans limitation de tentatives",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /login|authenticate(?!.*attempt|.*lock|.*rate.*limit)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_008",
    category: "SECURITY",
    name: "Token JWT sans expiration",
    severity: "critical",
    description: "JWT genere sans champ exp",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Jwts\.builder(?!.*setExpiration|.*exp)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_009",
    category: "SECURITY",
    name: "Secret JWT hardcode",
    severity: "critical",
    description: "Cle secrete JWT en dur dans le code",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.signWith\s*\(.*["'][A-Za-z0-9+/=]{16,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_010",
    category: "SECURITY",
    name: "OAuth state absent",
    severity: "major",
    description: "Flux OAuth sans parametre state anti-CSRF",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /oauth|authorize(?!.*state)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_011",
    category: "SECURITY",
    name: "Basic Auth en clair",
    severity: "critical",
    description: "Basic Authentication sans HTTPS",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Basic\s+[A-Za-z0-9+/=]+|Authorization.*Basic/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_012",
    category: "SECURITY",
    name: "Credential en log",
    severity: "critical",
    description: "Credentials logues en clair",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:password|secret|token|apiKey)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_013",
    category: "SECURITY",
    name: "CORS permissif",
    severity: "critical",
    description: "Access-Control-Allow-Origin: * en production",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Access-Control-Allow-Origin.*\*|allowedOrigins\s*\(\s*["']\*["']\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_014",
    category: "SECURITY",
    name: "CSRF protection absente",
    severity: "major",
    description: "Formulaire POST sans token CSRF",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /method\s*=\s*["']POST["'](?!.*csrf|.*_token)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_AUTH_015",
    category: "SECURITY",
    name: "Cookie sans flags",
    severity: "major",
    description: "Cookie sans HttpOnly/Secure/SameSite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+Cookie\s*\((?!.*setHttpOnly|.*setSecure)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_001",
    category: "SECURITY",
    name: "DES obsolete",
    severity: "critical",
    description: "Algorithme DES obsolete",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\bDES\b(?!ede)|Cipher.*DES/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_002",
    category: "SECURITY",
    name: "ECB mode",
    severity: "critical",
    description: "Mode ECB non securise",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\/ECB\/|ECB_MODE/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_003",
    category: "SECURITY",
    name: "IV statique",
    severity: "critical",
    description: "Vecteur initialisation statique",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+IvParameterSpec\s*\(.*(?:static|final|new byte)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_004",
    category: "SECURITY",
    name: "Cle en dur",
    severity: "critical",
    description: "Cle cryptographique en dur dans le code",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /secretKey\s*=\s*["']|\.init\s*\(.*["'][A-Za-z0-9]{16,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_005",
    category: "SECURITY",
    name: "Random non securise",
    severity: "critical",
    description: "java.util.Random au lieu de SecureRandom",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+Random\s*\(|java\.util\.Random/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_006",
    category: "SECURITY",
    name: "PKCS1 padding",
    severity: "major",
    description: "PKCS1Padding vulnerable aux attaques oracle",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /PKCS1Padding/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_007",
    category: "SECURITY",
    name: "RSA 1024 bits",
    severity: "critical",
    description: "Cle RSA trop courte (1024 bits)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /RSA.*1024|KeyPairGenerator.*1024|keysize.*1024/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_008",
    category: "SECURITY",
    name: "Certificat self-signed",
    severity: "major",
    description: "Certificat auto-signe en production",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SelfSigned|self.*signed.*cert/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_009",
    category: "SECURITY",
    name: "TrustManager permissif",
    severity: "critical",
    description: "TrustManager qui accepte tout",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /TrustManager[\s\S]{0,200}return|checkServerTrusted[\s\S]{0,50}\{\s*\}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_010",
    category: "SECURITY",
    name: "Hostname verifier bypass",
    severity: "critical",
    description: "Verification hostname desactivee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /ALLOW_ALL_HOSTNAME|hostnameVerifier.*return\s+true/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_011",
    category: "SECURITY",
    name: "SSL/TLS version obsolete",
    severity: "critical",
    description: "SSLv3 ou TLSv1.0 encore utilise",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /SSLv3|TLSv1(?![\d.])|TLSv1\.0/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_CRYPT_012",
    category: "SECURITY",
    name: "Cipher suite faible",
    severity: "major",
    description: "Suite de chiffrement faible autorisee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /RC4|NULL|EXPORT|anon/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_001",
    category: "SECURITY",
    name: "PII en log",
    severity: "critical",
    description: "Donnees personnelles dans les logs",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /log\w*\.\w+\(.*(?:email|phone|address|nom|prenom|ssn)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_002",
    category: "SECURITY",
    name: "PII sans masquage",
    severity: "critical",
    description: "Donnees sensibles affichees sans masquage",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /toString\(\).*(?:cardNumber|iban|ssn|password)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_003",
    category: "SECURITY",
    name: "Fichier temporaire sensible",
    severity: "major",
    description: "Donnees sensibles dans fichier temporaire",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /createTempFile.*(?:password|secret|key|token)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_004",
    category: "SECURITY",
    name: "Heap dump exposure",
    severity: "major",
    description: "Donnees sensibles en memoire sans nettoyage",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /String\s+\w*(?:password|secret|key)\s*=/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_005",
    category: "SECURITY",
    name: "Error message verbose",
    severity: "major",
    description: "Message erreur expose des details internes",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\.getMessage\(\)|\.printStackTrace\(\)|e\.toString\(\)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_006",
    category: "SECURITY",
    name: "Path traversal",
    severity: "critical",
    description: "Chemin fichier construit depuis input",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+File\s*\(\s*\w+(?!.*normalize|.*canonical)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_007",
    category: "SECURITY",
    name: "Upload sans validation",
    severity: "critical",
    description: "Upload fichier sans validation type/taille",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /getInputStream\(\)|multipart(?!.*valid|.*size|.*type)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_008",
    category: "SECURITY",
    name: "Redirect open",
    severity: "critical",
    description: "Redirection vers URL non validee",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /sendRedirect\s*\(\s*\w+(?!.*whitelist|.*startsWith)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_009",
    category: "SECURITY",
    name: "Sensitive GET param",
    severity: "major",
    description: "Donnees sensibles dans parametres GET",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /getParameter\s*\(\s*["'](?:password|token|secret)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_010",
    category: "SECURITY",
    name: "Cache control absent",
    severity: "minor",
    description: "Reponse sensible sans Cache-Control: no-store",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:password|account|balance)(?!.*Cache-Control|.*no-store)/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_011",
    category: "SECURITY",
    name: "XSS reflected",
    severity: "critical",
    description: "Input utilisateur dans reponse HTML sans echappement",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /getParameter.*(?:write|print|append)(?!.*encode|.*escape|.*sanitize)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_012",
    category: "SECURITY",
    name: "Clickjacking",
    severity: "major",
    description: "Pas de header X-Frame-Options",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /response\.setHeader(?!.*X-Frame-Options)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "SEC_DATA_013",
    category: "SECURITY",
    name: "Content-Type sniffing",
    severity: "minor",
    description: "Pas de header X-Content-Type-Options",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /setContentType(?!.*X-Content-Type-Options)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
