/**
 * Formatage identique quel que soit l'éditeur.
 *
 * - `.editorconfig` à la racine : fins de ligne CRLF comme les copies de travail (`core.autocrlf=true`),
 *   LF pour les scripts shell et le Dockerfile. Indentation, encodage, espaces finaux et saut de ligne
 *   final ne sont imposés qu'au module web : le code EJB mêle tabulations et espaces, porte des espaces
 *   finaux et des fichiers sans saut de ligne final, un éditeur ne doit pas le reformater.
 * - `.gitattributes` : normalisation explicite en LF dans le dépôt, binaires déclarés.
 * - Formateur du module web seul, dans un profil Maven désactivé par défaut : le build par défaut n'en
 *   dépend pas. Configuration Eclipse versionnée dans le module, calée sur le code généré, qui la
 *   respecte déjà.
 * Un dépôt qui porte déjà ses fichiers les garde (voir repositoryFix).
 */
import fs from "fs/promises";
import path from "path";

export const FORMATTER_PLUGIN_VERSION = "2.16.0";
export const FORMATTER_PROFILE_ID = "formatage";
export const FORMATTER_CONFIG = "formatter.xml";

export const EDITORCONFIG = `root = true

[*]
end_of_line = crlf

[{*.sh,Dockerfile}]
end_of_line = lf

[*-web/**]
charset = utf-8
indent_style = space
indent_size = 4
trim_trailing_whitespace = true
insert_final_newline = true

[*-web/**.json]
indent_size = 2
`;

export const GITATTRIBUTES = `* text=auto

*.sh text eol=lf
Dockerfile text eol=lf
*.bat text eol=crlf
*.cmd text eol=crlf

*.jar binary
*.war binary
*.ear binary
*.zip binary
*.class binary
*.pdf binary
*.jpg binary
*.jpeg binary
*.png binary
*.gif binary
*.ico binary
*.xls binary
*.xlsx binary
*.doc binary
*.docx binary
*.odt binary
*.jks binary
*.p12 binary
`;

const SETTINGS: [string, string][] = [
  ["org.eclipse.jdt.core.compiler.source", "1.8"],
  ["org.eclipse.jdt.core.compiler.compliance", "1.8"],
  ["org.eclipse.jdt.core.compiler.codegen.targetPlatform", "1.8"],
  ["org.eclipse.jdt.core.formatter.tabulation.char", "space"],
  ["org.eclipse.jdt.core.formatter.tabulation.size", "4"],
  ["org.eclipse.jdt.core.formatter.indentation.size", "4"],
  ["org.eclipse.jdt.core.formatter.lineSplit", "1000"],
  ["org.eclipse.jdt.core.formatter.comment.line_length", "160"],
  ["org.eclipse.jdt.core.formatter.join_wrapped_lines", "false"],
  ["org.eclipse.jdt.core.formatter.join_lines_in_comments", "false"],
  ["org.eclipse.jdt.core.formatter.comment.format_javadoc_comments", "false"],
  ["org.eclipse.jdt.core.formatter.comment.format_block_comments", "false"],
  ["org.eclipse.jdt.core.formatter.comment.format_line_comments", "false"],
  ["org.eclipse.jdt.core.formatter.continuation_indentation", "2"],
  ["org.eclipse.jdt.core.formatter.continuation_indentation_for_array_initializer", "2"],
  ["org.eclipse.jdt.core.formatter.keep_method_body_on_one_line", "one_line_preserve"],
  ["org.eclipse.jdt.core.formatter.keep_simple_if_on_one_line", "true"],
  ["org.eclipse.jdt.core.formatter.keep_then_statement_on_same_line", "true"],
  ["org.eclipse.jdt.core.formatter.alignment_for_parameters_in_method_declaration", "18"],
  ["org.eclipse.jdt.core.formatter.alignment_for_throws_clause_in_method_declaration", "0"],
  ["org.eclipse.jdt.core.formatter.number_of_empty_lines_to_preserve", "2"],
];

export const FORMATTER_XML =
  `<?xml version="1.0" encoding="UTF-8"?>\n<profiles version="21">\n    <profile kind="CodeFormatterProfile" name="module-web" version="21">\n` +
  SETTINGS.map(([id, value]) => `        <setting id="${id}" value="${value}"/>\n`).join("") +
  `    </profile>\n</profiles>\n`;

export const FORMATTER_PROFILE = `    <profiles>
        <!-- Format du code : mvn -P${FORMATTER_PROFILE_ID} verify pour verifier, formatter:format pour appliquer -->
        <profile>
            <id>${FORMATTER_PROFILE_ID}</id>
            <build>
                <plugins>
                    <plugin>
                        <groupId>net.revelc.code.formatter</groupId>
                        <artifactId>formatter-maven-plugin</artifactId>
                        <version>${FORMATTER_PLUGIN_VERSION}</version>
                        <configuration>
                            <configFile>\${project.basedir}/${FORMATTER_CONFIG}</configFile>
                            <encoding>UTF-8</encoding>
                            <lineEnding>KEEP</lineEnding>
                            <compilerSource>1.8</compilerSource>
                            <compilerCompliance>1.8</compilerCompliance>
                            <compilerTargetPlatform>1.8</compilerTargetPlatform>
                            <skipJsFormatting>true</skipJsFormatting>
                            <skipHtmlFormatting>true</skipHtmlFormatting>
                            <skipXmlFormatting>true</skipXmlFormatting>
                            <skipJsonFormatting>true</skipJsonFormatting>
                            <skipCssFormatting>true</skipCssFormatting>
                            <skipFormattingCache>true</skipFormattingCache>
                        </configuration>
                        <executions>
                            <execution>
                                <goals>
                                    <goal>validate</goal>
                                </goals>
                            </execution>
                        </executions>
                    </plugin>
                </plugins>
            </build>
        </profile>
    </profiles>
`;

/** Pom web avec le profil de formatage, ajouté une seule fois avant la fermeture du projet. */
export function addFormatterProfile(pom: string): string {
  if (pom.includes("<artifactId>formatter-maven-plugin</artifactId>")) return pom;
  const end = pom.lastIndexOf("</project>");
  if (end < 0) return pom;
  return pom.slice(0, end) + "\n" + FORMATTER_PROFILE + pom.slice(end);
}

export async function writeFormattingFiles(outputDir: string): Promise<string[]> {
  const written: string[] = [];
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const web = entries.find((e) => e.isDirectory() && e.name.toLowerCase().endsWith("-web"))?.name;
  await fs.writeFile(path.join(outputDir, ".editorconfig"), EDITORCONFIG, "utf-8");
  await fs.writeFile(path.join(outputDir, ".gitattributes"), GITATTRIBUTES, "utf-8");
  written.push(".editorconfig", ".gitattributes");
  if (!web) return written;
  await fs.writeFile(path.join(outputDir, web, FORMATTER_CONFIG), FORMATTER_XML, "utf-8");
  written.push(`${web}/${FORMATTER_CONFIG}`);
  const pomPath = path.join(outputDir, web, "pom.xml");
  let pom: string;
  try {
    pom = await fs.readFile(pomPath, "utf-8");
  } catch {
    return written;
  }
  const updated = addFormatterProfile(pom);
  if (updated !== pom) {
    await fs.writeFile(pomPath, updated, "utf-8");
    written.push(`${web}/pom.xml`);
  }
  return written;
}
