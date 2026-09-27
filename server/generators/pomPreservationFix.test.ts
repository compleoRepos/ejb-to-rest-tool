import { describe, it, expect } from "vitest";
import { addModule, extendEarPom, attachWebPom, projectCoordinates, managedDependencies } from "./pomPreservationFix";

const ROOT = `<project>
\t<modelVersion>4.0.0</modelVersion>
\t<groupId>ma.x</groupId>
\t<artifactId>svc-pom</artifactId>
\t<version>2.0.1</version>
\t<parent>
\t\t<groupId>ma.eai.idev</groupId>
\t\t<artifactId>general-settings-vega</artifactId>
\t\t<version>2024.01</version>
\t</parent>
\t<modules>
\t\t<module>svc-ejb</module>
\t\t<module>svc-ear</module>
\t</modules>
\t<scm><connection>scm:git:depot</connection></scm>
</project>`;

const EAR = `<project>
\t<modelVersion>4.0.0</modelVersion>
\t<artifactId>svc-ear</artifactId>
\t<properties>
\t\t<was_application_name>\${parsed.artifactId}</was_application_name>
\t</properties>
\t<build>
\t\t<finalName>\${project.artifactId}</finalName>
\t</build>
\t<dependencies>
\t\t<dependency>
\t\t\t<artifactId>svc-ejb</artifactId>
\t\t</dependency>
\t</dependencies>
</project>`;

const WEB = `<project>
    <parent>
        <groupId>ma.x</groupId>
        <artifactId>svc-pom-rest</artifactId>
        <version>2.0.1</version>
    </parent>
    <artifactId>svc-web</artifactId>
    <packaging>war</packaging>
    <dependencies>
        <dependency>
            <groupId>javax</groupId>
            <artifactId>javaee-api</artifactId>
        </dependency>
    </dependencies>
</project>`;

const GENERATED_ROOT = `<project><dependencyManagement><dependencies>
<dependency><groupId>javax</groupId><artifactId>javaee-api</artifactId><version>7.0</version><scope>provided</scope></dependency>
</dependencies></dependencyManagement></project>`;

describe("pomPreservationFix", () => {
  it("garde le pom racine d'origine et ajoute le module web apres l'ejb", () => {
    const out = addModule(ROOT, "svc-web", "svc-ejb");
    expect(out).toContain("\t\t<module>svc-ejb</module>\n\t\t<module>svc-web</module>\n\t\t<module>svc-ear</module>");
    expect(out).toContain("<scm><connection>scm:git:depot</connection></scm>");
    expect(addModule(out, "svc-web", "svc-ejb")).toBe(out);
  });

  it("lit les coordonnees propres, pas celles du parent", () => {
    expect(projectCoordinates(ROOT)).toEqual({ groupId: "ma.x", artifactId: "svc-pom", version: "2.0.1" });
  });

  it("ajoute au pom EAR d'origine le WAR et sa racine de contexte", () => {
    const out = extendEarPom(EAR, "ma.x", "svc-web", "/svc");
    expect(out).toContain("<was_application_name>${parsed.artifactId}</was_application_name>");
    expect(out).toContain("<contextRoot>/svc</contextRoot>");
    expect(out).toContain("<type>war</type>");
    expect(out.indexOf("<plugins>")).toBeLessThan(out.indexOf("</build>"));
    expect(extendEarPom(out, "ma.x", "svc-web", "/svc")).toBe(out);
  });

  it("rattache le pom web au parent d'origine avec ses propres versions", () => {
    const out = attachWebPom(WEB, { groupId: "ma.x", artifactId: "svc-pom", version: "2.0.1" }, managedDependencies(GENERATED_ROOT));
    expect(out).toContain("<artifactId>svc-pom</artifactId>");
    expect(out).not.toContain("svc-pom-rest");
    expect(out).toContain("<version>7.0</version>");
    expect(out).toContain("<scope>provided</scope>");
    expect(out).toContain("<maven.compiler.source>1.8</maven.compiler.source>");
  });
});
