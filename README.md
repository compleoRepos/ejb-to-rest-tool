# ejb-to-rest-tool

Outil de génération de wrappers REST à partir de projets EJB (mode Projet EJB / Adapter) et de descripteurs JSON/WSDL (mode BIAN).

## JDK du moteur de génération Adapter

- Le mode Projet EJB propose un champ optionnel « Chemin du JDK (17 ou plus) » : renseignez-y un JDK 17+ à utiliser par le moteur de génération, sans changer le java global du poste. Champ vide = java du système.
- La variable d'environnement `GENERATOR_JAVA_HOME` (fichier `.env`) permet de fixer ce JDK par défaut côté serveur.
- Ordre de priorité du binaire java : chemin saisi dans l'interface, puis `GENERATOR_JAVA_HOME`, puis le java du PATH.

## Descripteur d'endpoints

Chaque projet adaptateur généré embarque un descripteur `src/main/resources/descriptor/<artifactId>.json` listant les endpoints (opération, verbe HTTP, chemin) et leurs champs. Ce fichier est directement ré-uploadable dans le mode JSON/WSDL pour générer les wrappers Spring Boot par domaine.
