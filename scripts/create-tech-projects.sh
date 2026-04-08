#!/bin/bash
# Création des 6 projets de test multi-technologies pour Compleo v3.0
# Chaque projet simule un cas réel bancaire/assurance marocain.

BASE="/home/ubuntu/test-projects"

# ═══════════════════════════════════════════════════════════════
# PROJET 1 — tech-01-servlet : Portail agence (Servlet + JSP)
# ═══════════════════════════════════════════════════════════════
P1="$BASE/tech-01-servlet"
mkdir -p "$P1/src/main/java/ma/banque/portail/servlet"
mkdir -p "$P1/src/main/java/ma/banque/portail/model"
mkdir -p "$P1/src/main/webapp/WEB-INF"
mkdir -p "$P1/src/main/webapp/jsp"

cat > "$P1/pom.xml" << 'POMEOF'
<?xml version="1.0" encoding="UTF-8"?>
<project>
    <modelVersion>4.0.0</modelVersion>
    <groupId>ma.banque</groupId>
    <artifactId>portail-agence</artifactId>
    <version>2.1.0</version>
    <packaging>war</packaging>
</project>
POMEOF

cat > "$P1/src/main/java/ma/banque/portail/servlet/ClientServlet.java" << '
