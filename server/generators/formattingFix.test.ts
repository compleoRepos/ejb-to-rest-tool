import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  EDITORCONFIG,
  GITATTRIBUTES,
  FORMATTER_XML,
  FORMATTER_PLUGIN_VERSION,
  addFormatterProfile,
  writeFormattingFiles,
} from "./formattingFix";

const WEB_POM = `<project>
    <artifactId>neobank-x-web</artifactId>
    <build>
        <finalName>\${project.artifactId}</finalName>
    </build>
</project>
`;

describe(".editorconfig", () => {
  it("n'impose aucune forme au code EJB, seulement les fins de ligne", () => {
    const global = EDITORCONFIG.split("[{*.sh,Dockerfile}]")[0];
    expect(EDITORCONFIG.startsWith("root = true")).toBe(true);
    expect(global).toContain("end_of_line = crlf");
    expect(global).not.toMatch(/indent_style|indent_size|charset|trim_trailing_whitespace|insert_final_newline/);
  });

  it("impose au module web l'indentation et l'encodage du code genere", () => {
    const web = EDITORCONFIG.split("[*-web/**]")[1];
    expect(web).toContain("charset = utf-8");
    expect(web).toContain("indent_style = space");
    expect(web).toContain("indent_size = 4");
    expect(web).toContain("trim_trailing_whitespace = true");
    expect(web).toContain("insert_final_newline = true");
  });

  it("scripts shell en LF", () => {
    expect(EDITORCONFIG).toMatch(/\[\{\*\.sh,Dockerfile\}\]\nend_of_line = lf/);
  });
});

describe(".gitattributes", () => {
  it("normalise le texte et garde les scripts en LF", () => {
    expect(GITATTRIBUTES.split("\n")[0]).toBe("* text=auto");
    expect(GITATTRIBUTES).toContain("*.sh text eol=lf");
    expect(GITATTRIBUTES).toContain("*.jar binary");
    expect(GITATTRIBUTES).toContain("*.pdf binary");
  });

  it("ne declare pas *.db binaire : des traces .db du depot sont du texte", () => {
    expect(GITATTRIBUTES).not.toContain("*.db");
  });
});

describe("formateur du module web", () => {
  it("configuration Eclipse calee sur le code genere", () => {
    expect(FORMATTER_XML).toContain(`id="org.eclipse.jdt.core.formatter.tabulation.char" value="space"`);
    expect(FORMATTER_XML).toContain(`id="org.eclipse.jdt.core.formatter.indentation.size" value="4"`);
    expect(FORMATTER_XML).toContain(`id="org.eclipse.jdt.core.formatter.keep_method_body_on_one_line" value="one_line_preserve"`);
    expect(FORMATTER_XML).toContain(`id="org.eclipse.jdt.core.formatter.comment.format_javadoc_comments" value="false"`);
  });

  it("profil desactive par defaut, version pinnee, verification", () => {
    const pom = addFormatterProfile(WEB_POM);
    expect(pom).toContain("<id>formatage</id>");
    expect(pom).not.toContain("activeByDefault");
    expect(pom).toContain(`<version>${FORMATTER_PLUGIN_VERSION}</version>`);
    expect(pom).toContain("<goal>validate</goal>");
    expect(pom.match(/<!--/g)).toHaveLength(1);
    expect(pom.indexOf("<profiles>")).toBeGreaterThan(pom.indexOf("</build>"));
    expect(pom.trimEnd().endsWith("</project>")).toBe(true);
  });

  it("le formateur reste hors du build par defaut", () => {
    const pom = addFormatterProfile(WEB_POM);
    const outsideProfiles = pom.replace(/<profiles>[\s\S]*<\/profiles>/, "");
    expect(outsideProfiles).not.toContain("formatter-maven-plugin");
  });

  it("est idempotent", () => {
    const once = addFormatterProfile(WEB_POM);
    expect(addFormatterProfile(once)).toBe(once);
  });

  it("ecrit les fichiers a la racine et dans le module web", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "fmt-"));
    await fs.mkdir(path.join(base, "neobank-x-web"), { recursive: true });
    await fs.mkdir(path.join(base, "neobank-x-ejb"), { recursive: true });
    await fs.writeFile(path.join(base, "neobank-x-web", "pom.xml"), WEB_POM);
    await fs.writeFile(path.join(base, "neobank-x-ejb", "pom.xml"), "<project>ejb</project>");
    await writeFormattingFiles(base);
    expect(await fs.readFile(path.join(base, ".editorconfig"), "utf-8")).toBe(EDITORCONFIG);
    expect(await fs.readFile(path.join(base, ".gitattributes"), "utf-8")).toBe(GITATTRIBUTES);
    expect(await fs.readFile(path.join(base, "neobank-x-web", "formatter.xml"), "utf-8")).toBe(FORMATTER_XML);
    expect(await fs.readFile(path.join(base, "neobank-x-web", "pom.xml"), "utf-8")).toContain("<id>formatage</id>");
    expect(await fs.readFile(path.join(base, "neobank-x-ejb", "pom.xml"), "utf-8")).toBe("<project>ejb</project>");
    await fs.rm(base, { recursive: true, force: true });
  });
});
