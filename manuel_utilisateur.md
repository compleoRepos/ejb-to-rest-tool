# Manuel Utilisateur : EJB to REST API Generator

Bienvenue dans le manuel d'utilisation de l'outil **EJB to REST API Generator**. Ce guide est conçu pour vous expliquer de manière très simple, étape par étape, comment utiliser l'application pour transformer vos anciens projets Java EJB en API REST modernes.

Même si vous n'êtes pas un expert en informatique, ce guide vous accompagnera tout au long du processus.

---

## 1. Qu'est-ce que cet outil ?

Imaginez que vous avez une vieille voiture (votre projet EJB) qui fonctionne bien, mais dont les pièces sont difficiles à trouver aujourd'hui. Cet outil agit comme un mécanicien magique : vous lui donnez les plans de votre vieille voiture, et il vous fabrique automatiquement une voiture flambant neuve (une API REST Spring Boot) avec toutes les options modernes de sécurité et de performance.

L'outil ne se contente pas de traduire le code ; il l'**améliore** grâce à une intelligence artificielle interne qui applique 77 règles de bonnes pratiques.

---

## 2. Démarrer l'application

*Note : Nous supposons ici que l'application a déjà été installée et lancée par votre équipe technique (voir le Guide d'Installation dans la documentation technique).*

1. Ouvrez votre navigateur internet préféré (Google Chrome, Firefox, Safari, etc.).
2. Dans la barre d'adresse tout en haut, tapez l'adresse fournie par votre équipe technique (généralement `http://localhost:8080`).
3. Appuyez sur la touche **Entrée**.
4. Vous arrivez sur la page d'accueil de l'outil. L'interface est divisée en 4 grandes étapes numérotées.

---

## 3. Étape 1 : Uploader votre projet

La première chose à faire est de fournir à l'outil le code source que vous souhaitez transformer. Ce code doit être compressé dans un fichier `.zip`.

1. Repérez la section **"1. Upload du projet EJB"**.
2. Vous verrez une grande zone avec des pointillés et une icône de boîte (📦).
3. Vous avez deux possibilités :
   - **Glisser-déposer** : Prenez votre fichier `.zip` depuis votre ordinateur, glissez-le avec votre souris au-dessus de la zone en pointillés, et relâchez le bouton.
   - **Cliquer** : Cliquez n'importe où dans la zone en pointillés. Une fenêtre s'ouvre pour vous permettre de parcourir vos dossiers et de sélectionner votre fichier `.zip`.
4. Une fois le fichier sélectionné, son nom s'affiche en bleu sous l'icône.
5. Cliquez sur le bouton bleu **"Uploader le projet"**.
6. Si tout se passe bien, un petit badge vert "Projet uploadé" apparaîtra, et la section numéro 2 se débloquera.

---

## 4. Étape 2 : Scanner le projet

Maintenant que l'outil a votre fichier, il doit le "lire" pour comprendre comment il est construit.

1. Allez dans la section **"2. Scanner le projet"**.
2. Cliquez sur le bouton gris **"Scanner le projet EJB"**.
3. L'outil va analyser votre code en quelques secondes.
4. Une fois terminé, un tableau de bord s'affiche avec les résultats :
   - **Fichiers analysés** : Le nombre total de fichiers lus.
   - **UseCases détectés** : Le nombre de "fonctionnalités" principales trouvées.
   - **DTOs détectés** : Le nombre d'objets de données trouvés.
5. En dessous, vous verrez des tableaux détaillant exactement ce que l'outil a trouvé. Vous remarquerez des petits badges colorés (JSON en bleu, XML en jaune) qui indiquent le format de données détecté.

---

## 5. Étape 3 : Générer et améliorer avec l'IA

C'est ici que la magie opère. L'outil va créer le nouveau code et l'améliorer automatiquement.

1. Allez dans la section **"3. Générer l'API REST"**.
2. Cliquez sur le bouton vert **"Générer et améliorer avec l'IA"**.
3. L'outil travaille pendant quelques secondes.
4. Une nouvelle section violette intitulée **"IA - Rapport d'amélioration IA"** apparaît !
5. Dans cette section, vous pouvez voir :
   - **Un grand cercle avec un score sur 100** : C'est la note de qualité de votre nouveau code.
   - **Le nombre de règles appliquées** : L'outil vous montre combien d'améliorations il a apportées (sécurité, performance, etc.).
   - **Un tableau détaillé** : Si vous cliquez sur "Voir le détail des améliorations appliquées", vous verrez exactement ce que l'IA a modifié dans votre code.

---

## 6. Étape 4 : Télécharger le résultat

Votre nouveau projet est prêt, il ne reste plus qu'à le récupérer.

1. Allez dans la section **"4. Télécharger le projet"**.
2. Cliquez sur le bouton violet **"Télécharger le projet API généré (ZIP)"**.
3. Un nouveau fichier `.zip` va se télécharger sur votre ordinateur (généralement dans votre dossier "Téléchargements").
4. Ce fichier contient votre tout nouveau projet Spring Boot, prêt à être utilisé par vos développeurs ! Il contient même un fichier `ENHANCEMENT_REPORT.md` qui résume toutes les améliorations apportées.

---

## 7. Recommencer avec un autre projet

Si vous avez un autre projet à transformer :
1. Descendez tout en bas de la page.
2. Cliquez sur le bouton **"Réinitialiser"**.
3. L'outil efface sa mémoire et vous ramène à l'Étape 1, prêt pour un nouveau fichier `.zip`.

---

*Merci d'utiliser EJB to REST API Generator !*
