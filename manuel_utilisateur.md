# Manuel Utilisateur : EJB to REST API Generator

Bienvenue dans le manuel d'utilisation de l'outil **EJB to REST API Generator**. Ce guide est concu pour vous expliquer de maniere tres simple, etape par etape, comment utiliser l'application pour transformer vos anciens projets Java EJB en API REST modernes.

Meme si vous n'etes pas un expert en informatique, ce guide vous accompagnera tout au long du processus.

---

## 1. Qu'est-ce que cet outil ?

Imaginez que vous avez une vieille voiture (votre projet EJB) qui fonctionne bien, mais dont les pieces sont difficiles a trouver aujourd'hui. Cet outil agit comme un mecanicien magique : vous lui donnez les plans de votre vieille voiture, et il vous fabrique automatiquement une voiture flambant neuve (une API REST Spring Boot) avec toutes les options modernes de securite et de performance.

L'outil ne se contente pas de traduire le code ; il l'**ameliore** grace a un moteur intelligent interne qui applique plus de 112 regles de bonnes pratiques, et vous fournit un rapport detaille expliquant chaque amelioration.

---

## 2. Demarrer l'application

*Note : Nous supposons ici que l'application a deja ete installee et lancee par votre equipe technique (voir le Guide d'Installation dans la documentation technique).*

1. Ouvrez votre navigateur internet prefere (Google Chrome, Firefox, Edge, etc.).
2. Dans la barre d'adresse tout en haut, tapez l'adresse fournie par votre equipe technique (generalement `http://localhost:8080`).
3. Appuyez sur la touche **Entree**.
4. Vous arrivez sur la page d'accueil de l'outil. L'interface est divisee en 4 grandes etapes numerotees.

---

## 3. Etape 1 : Uploader votre projet

La premiere chose a faire est de fournir a l'outil le code source que vous souhaitez transformer. Ce code doit etre compresse dans un fichier `.zip`.

1. Reperez la section **"1. Upload du projet EJB"**.
2. Vous verrez une grande zone avec des pointilles et une icone de boite.
3. Vous avez deux possibilites :
   - **Glisser-deposer** : Prenez votre fichier `.zip` depuis votre ordinateur, glissez-le avec votre souris au-dessus de la zone en pointilles, et relachez le bouton.
   - **Cliquer** : Cliquez n'importe ou dans la zone en pointilles. Une fenetre s'ouvre pour vous permettre de parcourir vos dossiers et de selectionner votre fichier `.zip`.
4. Une fois le fichier selectionne, son nom s'affiche en bleu sous l'icone.
5. Cliquez sur le bouton bleu **"Uploader le projet"**.
6. Si tout se passe bien, un petit badge vert "Projet uploade" apparaitra, et la section numero 2 se debloquera.

---

## 4. Etape 2 : Scanner le projet

Maintenant que l'outil a votre fichier, il doit le "lire" pour comprendre comment il est construit.

1. Allez dans la section **"2. Scanner le projet"**.
2. Cliquez sur le bouton gris **"Scanner le projet EJB"**.
3. L'outil va analyser votre code en quelques secondes.
4. Une fois termine, un tableau de bord s'affiche avec les resultats :
   - **Fichiers analyses** : Le nombre total de fichiers lus.
   - **UseCases detectes** : Le nombre de "fonctionnalites" principales trouvees.
   - **DTOs detectes** : Le nombre d'objets de donnees trouves.
   - **Interfaces @Remote** : Le nombre d'interfaces distantes detectees (necessaires pour la compilation du projet genere).
5. En dessous, vous verrez des tableaux detaillant exactement ce que l'outil a trouve. Vous remarquerez des petits badges colores (JSON en bleu, XML en jaune) qui indiquent le format de donnees detecte.

---

## 5. Etape 3 : Generer et ameliorer

C'est ici que la magie opere. L'outil va creer le nouveau code et l'ameliorer automatiquement.

1. Allez dans la section **"3. Generer l'API REST"**.
2. Cliquez sur le bouton vert **"Generer et ameliorer avec l'IA"**.
3. L'outil travaille pendant quelques secondes.
4. Une nouvelle section violette intitulee **"Rapport d'amelioration IA"** apparait.

### 5.1. Comprendre le rapport de score

Dans cette section, vous pouvez voir :
- **Un grand cercle avec un score sur 100** : C'est la note de qualite de votre nouveau code. Un score de 90+ est excellent.
- **Regles verifiees** : Le nombre total de regles que l'outil a verifiees.
- **Regles appliquees** : Le nombre d'ameliorations effectivement apportees.
- **Critiques / Avertissements / Suggestions** : Le detail par niveau de severite.

### 5.2. Explorer les ameliorations par categorie

Sous le score, vous trouverez des cartes colorees representant les **12 categories** d'amelioration :

| Categorie | Ce qu'elle couvre |
|-----------|-------------------|
| Conventions de nommage | URLs en kebab-case, pas de verbes dans les URLs |
| Methodes HTTP | Choix correct de GET, POST, PUT, DELETE |
| Validation des entrees | Annotations `@Valid`, `@NotNull`, etc. |
| Gestion des erreurs | Codes HTTP adaptes aux exceptions metier |
| Securite | Configuration CORS, SecurityConfig |
| Resilience | Actuator, profils dev/prod |
| Observabilite | Logging, aspects de journalisation |
| Documentation API | Annotations OpenAPI/Swagger |
| Negociation de contenu | Support JSON + XML |
| Structure du projet | Organisation des packages |
| Tests | Tests unitaires generes automatiquement |
| Performance | Optimisations de configuration |

Cliquez sur une carte de categorie pour filtrer le tableau et voir uniquement les regles de cette categorie.

### 5.3. Voir le detail de chaque regle (nouveau)

Le tableau detaille liste chaque regle avec son identifiant, sa severite, sa description, le fichier concerne, et son statut.

**Pour voir le detail complet d'une regle** : Cliquez sur la ligne du tableau (les lignes cliquables ont un petit point violet a cote de l'identifiant). Un panneau se deploie avec :

- **Pourquoi cette regle ?** : Une explication claire de la raison pour laquelle cette amelioration est importante.
- **Action realisee** : Ce que l'outil a concretement modifie dans votre code.
- **Avant / Apres** : Des extraits de code montrant exactement la transformation effectuee (le code "avant" en rouge, le code "apres" en vert).
- **Reference normative** : Les standards et bonnes pratiques sur lesquels cette regle est basee (RFC, Google API Guidelines, etc.).

**Boutons utiles** :
- **Tout deployer** : Ouvre tous les panneaux de detail en meme temps.
- **Tout replier** : Ferme tous les panneaux.
- **Menu deroulant** : Filtrez les regles par categorie.

---

## 6. Etape 4 : Telecharger le resultat

Votre nouveau projet est pret, il ne reste plus qu'a le recuperer.

1. Allez dans la section **"4. Telecharger le projet"**.
2. Cliquez sur le bouton violet **"Telecharger le projet API genere (ZIP)"**.
3. Un nouveau fichier `.zip` va se telecharger sur votre ordinateur (generalement dans votre dossier "Telechargements").
4. Ce fichier contient votre tout nouveau projet Spring Boot, pret a etre utilise par vos developpeurs.

### 6.1. Contenu du fichier telecharge

Le ZIP contient un projet Spring Boot complet avec :

| Dossier/Fichier | Description |
|-----------------|-------------|
| `pom.xml` | Fichier de configuration Maven avec toutes les dependances |
| `src/main/java/.../controller/` | Les controllers REST qui exposent vos endpoints |
| `src/main/java/.../service/` | Les adaptateurs de service (appels vers les EJB) |
| `src/main/java/.../dto/` | Les objets de donnees avec annotations preservees |
| `src/main/java/.../ejb/interfaces/` | Les interfaces @Remote recopiees pour la compilation |
| `src/main/java/.../config/` | Configuration securite, CORS, negociation de contenu |
| `src/main/java/.../exception/` | Gestion globale des erreurs avec codes HTTP adaptes |
| `src/test/java/` | Tests unitaires generes automatiquement |
| `ENHANCEMENT_REPORT.md` | Rapport complet des ameliorations avec justifications |

### 6.2. Lire le rapport d'amelioration

Le fichier `ENHANCEMENT_REPORT.md` dans le ZIP contient le meme rapport que celui affiche dans l'interface, mais au format Markdown. Il est organise par categorie et contient pour chaque regle :
- La justification detaillee
- L'action realisee
- Les extraits de code avant/apres
- La reference normative

Ce rapport peut etre partage avec votre equipe technique pour comprendre toutes les ameliorations apportees.

---

## 7. Recommencer avec un autre projet

Si vous avez un autre projet a transformer :
1. Descendez tout en bas de la page.
2. Cliquez sur le bouton **"Reinitialiser"**.
3. L'outil efface sa memoire et vous ramene a l'Etape 1, pret pour un nouveau fichier `.zip`.

---

## 8. Questions frequentes

**Q : Le score est inferieur a 100, est-ce un probleme ?**
R : Non, un score de 90+ est excellent. Certaines regles ne sont pas applicables a tous les projets (par exemple, si votre projet n'a pas d'exceptions personnalisees, les regles de gestion d'erreurs ne s'appliquent pas).

**Q : Que signifie "Non appliquee" dans le tableau des regles ?**
R : Cela signifie que la regle a ete verifiee mais n'etait pas applicable a votre projet specifique. Ce n'est pas une erreur.

**Q : Le projet genere est-il pret a etre deploye en production ?**
R : Le projet genere est un excellent point de depart. Il est compile et structurellement correct, mais votre equipe technique devra adapter les appels JNDI vers vos EJB reels et configurer les parametres de connexion specifiques a votre environnement.

**Q : Puis-je transformer plusieurs projets a la suite ?**
R : Oui, utilisez le bouton "Reinitialiser" entre chaque transformation.

---

*Merci d'utiliser EJB to REST API Generator !*
