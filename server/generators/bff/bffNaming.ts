/**
 * Règles de nommage Java de la couche API, à partir des noms du descripteur.
 */

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
  "volatile", "while", "record", "var", "yield",
]);

export function isJavaKeyword(name: string): boolean {
  return JAVA_KEYWORDS.has(name);
}

/** Découpe un nom en mots : séparateurs non alphanumériques, mots en capitales passés en minuscules. */
function words(name: string): string[] {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => (w === w.toUpperCase() ? w.toLowerCase() : w));
}

/** Nom de méthode ou de variable Java : `CHECK_COMPTE_TRANSFERE` donne `checkCompteTransfere`. */
export function camel(name: string): string {
  const parts = words(name);
  if (parts.length === 0) return "value";
  const result = parts
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
  const safe = /^[0-9]/.test(result) ? "v" + result : result;
  return JAVA_KEYWORDS.has(safe) ? safe + "Value" : safe;
}

/** Nom de type Java : `commande-chequier` donne `CommandeChequier`. */
export function pascal(name: string): string {
  const c = camel(name);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Clé de service : nom du dépôt sans le préfixe `neobank-`. */
export function serviceKey(adapterName: string): string {
  return adapterName.replace(/^neobank-/, "");
}

/** Segment de package : clé sans séparateur, en minuscules. */
export function packageSegment(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

/** Sous-chemin exposé au canal : chemin JAX-RS sans `/api` ni le chemin de classe. */
export function channelSubPath(jaxrsPath: string): string {
  const parts = jaxrsPath.split("/").filter((p) => p.length > 0);
  return "/" + parts.slice(2).join("/");
}
