# Audit du moteur de parsing Compleo — 3 projets BOA

**Date :** 2026-04-08
**Auteur :** Compleo
**Moteur :** Compleo v1.0 (avant corrections)

---

## 1. Résumé

| Projet | Fichiers Java | Détectés | Taux | UseCases | DTOs | VoIn/VoOut résolus |
|--------|--------------|----------|------|----------|------|--------------------|
| boa-acl-test | 56 | 50 | 89.3% | 8 | 18 | 8/8 (100%) |
| boa-ultimate-test | 78 | 72 | 92.3% | 12 | 28 | 12/12 (100%) |
| activation-carte-bmcedirect-ejb | 68 | 66 | 97.1% | 11 | 27 | 3/11 (27.3%) |

---

## 2. Projet 1 — boa-acl-test

### A) Précision du parsing

- **56 fichiers Java**, 50 détectés, taux = **89.3%**
- **8 UseCases** détectés, **18 DTOs**, **6 Enums**, **8 Exceptions**, **5 Services**, **2 Validators**
- **6 classes non classifiées** :
  - `Constants` — classe de constantes (détectée séparément par le parser)
  - `Envelope` — classe utilitaire du framework EAI
  - `Parser` — classe utilitaire du framework EAI
  - `UtilHash` — utilitaire de hachage
  - `Services` — classe d'intégration middleware
  - `EaiLog` — logger custom BOA

**Cause** : ces classes ne correspondent à aucune catégorie (ni UseCase, ni DTO, ni Service au sens du parser). Ce sont des classes de framework/infrastructure.

### B) Qualité du code généré

- **47 fichiers générés**, 1 495 lignes
- **0 occurrence de "Object"** dans les DTOs/signatures
- **0 import inutilisé**
- **0 méthode dupliquée**
- **0 warning** du parser

### C) Cohérence Input → Output

| Classe source | Artefact généré | Statut |
|---------------|-----------------|--------|
| ActiverCarteUC | CarteController.activerCarte() | OK |
| BloquerCarteUC | CarteController.bloquerCarte() | OK |
| ChargerClientDataUC | ClientController.chargerClientData() | OK |
| ConsulterSoldeUC | CompteController.consulterSolde() | OK |
| OuvrirCompteUC | CompteController.ouvrirCompte() | OK |
| ReceptionnerCarteUC | CarteController.receptionnerCarte() | OK |
| SimulerCreditUC | CreditController.simulerCredit() | OK |
| VirementUC | VirementController.virement() | OK |

**Verdict : PASS** — Tous les UseCases sont correctement mappés.

---

## 3. Projet 2 — boa-ultimate-test

### A) Précision du parsing

- **78 fichiers Java**, 72 détectés, taux = **92.3%**
- **12 UseCases**, **28 DTOs**, **8 Enums**, **10 Exceptions**, **6 Services**, **4 Validators**, **1 Remote Interface**
- **6 classes non classifiées** : mêmes classes framework que projet 1 (Constants, Envelope, Parser, UtilHash, Services, EaiLog)

### B) Qualité du code généré

- **64 fichiers générés**, 2 041 lignes
- **1 occurrence de "Object"** dans le code généré (dans un DTO avec type List sans générique)
- **0 import inutilisé**
- **0 méthode dupliquée**
- **0 warning** du parser

### C) Cohérence Input → Output

| Classe source | Artefact généré | Statut |
|---------------|-----------------|--------|
| ActiverCarteUC | CarteController.activerCarte() | OK |
| BloquerCarteUC | CarteController.bloquerCarte() | OK |
| ChargerClientDataUC | ClientController.chargerClientData() | OK |
| CloturerCompteUC | CompteController.cloturerCompte() | OK |
| ConsulterSoldeUC | CompteController.consulterSolde() | OK |
| EnvoyerNotificationUC | NotificationController.envoyerNotification() | OK |
| GenererDocumentUC | DocumentController.genererDocument() | OK |
| MajClientUC | ClientController.majClient() | OK |
| OuvrirCompteUC | CompteController.ouvrirCompte() | OK |
| ReceptionnerCarteUC | CarteController.receptionnerCarte() | OK |
| SimulerCreditUC | CreditController.simulerCredit() | OK |
| VirementUC | VirementController.virement() | OK |

**Verdict : PASS** — 12/12 UseCases mappés. 1 occurrence "Object" à corriger.

---

## 4. Projet 3 — activation-carte-bmcedirect-ejb

### A) Précision du parsing

- **68 fichiers Java**, 66 détectés, taux = **97.1%**
- **11 UseCases**, **27 DTOs**, **7 Enums**, **10 Exceptions**, **1 Service**, **6 Validators**
- **2 classes non classifiées** : EaiLog, UtilHash
- **2 @Stateless EJBs** détectés (non-UseCase pattern)

### B) Qualité du code généré — BUG CRITIQUE

- **78 fichiers générés**, 2 279 lignes
- **16 warnings** : 8 UseCases avec VoIn/VoOut non résolus
- Le parser ne peut pas résoudre les VoIn/VoOut quand le UseCase est un **stub minimaliste** (body vide, `return null`, pas de cast `(XxxVoIn) voIn`)

**Cause racine** : Le parser cherche uniquement :
1. Un cast `(XxxVoIn) voIn` dans le corps de la méthode
2. Un `new XxxVoOut()` dans le corps de la méthode
3. Un import explicite `import ...XxxVoIn;`

Quand le UseCase utilise un import wildcard (`import ma.eai.boa.xbanking.compte.dto.*;`) et n'a pas de corps implémenté, **aucune de ces 3 stratégies ne fonctionne**.

### C) Cohérence Input → Output

| Classe source | Artefact généré | Statut |
|---------------|-----------------|--------|
| ActiverCarteUC | CarteController.activerCarte() | OK |
| BloquerCarteUC | CarteController.bloquerCarte() | OK |
| ReceptionnerCarteUC | CarteController.receptionnerCarte() | OK |
| ChargerClientDataUC | ClientController.chargerClientData() | **VoIn=ValueObject** |
| MajClientUC | ClientController.majClient() | **VoIn=ValueObject** |
| CloturerCompteUC | CompteController.cloturerCompte() | **VoIn=ValueObject** |
| ConsulterSoldeUC | CompteController.consulterSolde() | **VoIn=ValueObject** |
| OuvrirCompteUC | CompteController.ouvrirCompte() | **VoIn=ValueObject** |
| GenererDocumentUC | DocumentController.genererDocument() | **VoIn=ValueObject** |
| EnvoyerNotificationUC | NotificationController.envoyerNotification() | **VoIn=ValueObject** |
| VirementUC | VirementController.virement() | **VoIn=ValueObject** |

**Verdict : FAIL** — 8/11 UseCases ont des VoIn/VoOut non résolus (72.7% d'échec).

---

## 5. Bugs identifiés et plan de correction

### Bug 1 — VoIn/VoOut non résolus sur les stubs (CRITIQUE)

**Impact** : Le code généré utilise `Void` comme type de requête/réponse au lieu du DTO correct.

**Correction** : Ajouter une stratégie de fallback par **convention de nommage** :
- `ConsulterSoldeUC` → chercher `ConsulterSoldeVoIn` et `ConsulterSoldeVoOut` dans le registre de types
- Si trouvé dans les DTOs du projet → utiliser ce type
- Pattern : `{UseCaseName sans UC}VoIn` et `{UseCaseName sans UC}VoOut`

### Bug 2 — 1 occurrence "Object" dans le code généré (MINEUR)

**Impact** : Un champ `List` sans générique produit `List<Object>` dans le code généré.

**Correction** : Quand un `List` est détecté sans générique, émettre un WARNING et utiliser `List<String>` comme fallback raisonnable, ou conserver le type original.

### Bug 3 — Classes framework non classifiées (COSMÉTIQUE)

**Impact** : 6 classes EAI (Envelope, Parser, UtilHash, Services, EaiLog, Constants) ne sont pas classifiées.

**Correction** : Ajouter une catégorie "framework/infrastructure" pour ces classes connues du pattern BOA EAI.

### Bug 4 — @Stateless standard non détecté comme UseCase (IMPORTANT)

**Impact** : Les EJBs annotés `@Stateless` (sans `@UseCase`) ne sont pas traités comme des UseCases.

**Correction** : Étendre `isUseCase()` pour détecter aussi `@Stateless` avec une méthode publique.
