# EJB to REST Wrapper Generator — Brainstorm Design

## Trois approches stylistiques

### 1. Terminal Engineering Console
**Intro** : Interface inspirée des consoles d'ingénierie et des IDE sombres, avec un accent sur la productivité et la lisibilité du code/données.
**Probabilité** : 0.04

### 2. Blueprint Industrial
**Intro** : Esthétique de plan technique industriel — grilles fines, typographie monospace, fond bleu-gris foncé avec des accents néon pour les actions.
**Probabilité** : 0.06

### 3. Swiss Functional Grid
**Intro** : Design fonctionnel suisse — hiérarchie typographique forte, espaces généreux, couleurs limitées mais impactantes, focus sur la clarté de l'information.
**Probabilité** : 0.08

---

## Approche choisie : Blueprint Industrial

### Design Movement
Style industriel/technique inspiré des blueprints d'architecture logicielle et des schémas d'ingénierie.

### Core Principles
1. **Précision visuelle** — chaque élément est aligné sur une grille de 8px, les lignes de connexion rappellent les schémas techniques
2. **Hiérarchie par contraste lumineux** — fond sombre (ardoise profond), éléments actifs en cyan/vert néon
3. **Densité informationnelle** — afficher beaucoup d'information sans surcharge grâce à des zones bien délimitées
4. **Feedback mécanique** — les interactions donnent un retour visuel net et instantané (pas de transitions molles)

### Color Philosophy
- **Fond principal** : Ardoise profond (#0F1923) — évoque un écran technique
- **Surface** : Bleu-gris (#1A2B3C) — panneaux et cartes
- **Accent primaire** : Cyan électrique (#00D4FF) — actions, liens, focus
- **Accent secondaire** : Vert néon (#39FF14) — succès, validations, statuts OK
- **Texte principal** : Blanc cassé (#E8ECF0)
- **Texte secondaire** : Gris bleuté (#7B8FA3)
- **Erreur/Alerte** : Orange vif (#FF6B35)

### Layout Paradigm
Layout asymétrique en 3 colonnes : sidebar gauche fine (navigation/statut), zone centrale large (workspace), panneau droit contextuel (résultats/logs). La zone centrale utilise un système de "panneaux empilables" qui rappellent les fenêtres d'un IDE.

### Signature Elements
1. **Lignes de grille subtiles** — une grille de points fins en arrière-plan qui rappelle le papier millimétré
2. **Bordures lumineuses** — les panneaux actifs ont une bordure fine cyan qui pulse légèrement
3. **Indicateurs de flux** — des connecteurs visuels entre les étapes (upload → analyse → génération → download) sous forme de lignes pointillées animées

### Interaction Philosophy
Interactions rapides et mécaniques — les boutons ont un effet "press" net (scale 0.97), les transitions sont courtes (120-180ms), les feedbacks sont immédiats avec des micro-animations de type "scan line".

### Animation
- Entrées : slide-in depuis la gauche (150ms, ease-out cubique)
- Boutons : scale(0.97) au press, 120ms
- Panneaux : apparition avec un effet "scan" vertical (ligne lumineuse qui descend)
- Indicateurs de progression : animation de type "pulse" sur les bordures actives
- Stagger sur les listes : 40ms par item

### Typography System
- **Display/Titres** : Space Grotesk Bold (700) — géométrique, technique
- **Corps** : Inter Regular (400) / Medium (500) — lisibilité maximale
- **Code/Données** : JetBrains Mono — pour les noms de fichiers, paths, JSON
- Hiérarchie : H1 48px, H2 32px, H3 24px, Body 16px, Small 14px, Code 13px

### Brand Essence
Outil de transformation industrielle EJB→REST pour équipes d'architecture bancaire — précis, fiable, productif.
Personnalité : **Technique**, **Fiable**, **Efficace**

### Brand Voice
- Headlines : "Transformez vos EJB en wrappers REST BIAN en un clic" / "18 JSON → 7 wrappers. Zéro code manuel."
- CTAs : "Lancer la génération" / "Télécharger le wrapper"

### Wordmark & Logo
Symbole : deux flèches entrelacées formant un "W" (wrapper) — représente la transformation EJB→REST. Trait fin, style technique.

### Signature Brand Color
Cyan électrique (#00D4FF) — la couleur de la transformation, du flux de données, de la modernisation.
