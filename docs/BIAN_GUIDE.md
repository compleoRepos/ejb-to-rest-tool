# Guide BIAN — EJB-to-REST Generator

**Version** : 3.0 | **Compleo** | Mars 2026  
**Reference** : BIAN Semantic API Practitioner Guide V8.1 / BIAN v12.0

---

## 1. Introduction au standard BIAN

Le **Banking Industry Architecture Network** (BIAN) definit un modele d'architecture de reference pour le secteur bancaire. Il organise les capacites bancaires en **Service Domains** independants, chacun gerant un aspect specifique de l'activite bancaire.

L'outil EJB-to-REST Generator mappe automatiquement les UseCases EJB vers les Service Domains BIAN et genere des APIs REST conformes au standard.

---

## 2. Concepts BIAN

### 2.1 Service Domain

Un Service Domain represente une capacite bancaire autonome. Chaque Service Domain possede :

| Propriete | Description | Exemple |
|-----------|-------------|---------|
| **Domain Name** | Identifiant technique en kebab-case | `current-account` |
| **Display Name** | Nom lisible | `Current Account` |
| **BIAN ID** | Identifiant officiel BIAN | `SD0152` |
| **Control Record** | Objet metier principal | `CurrentAccountFacility` |
| **Functional Pattern** | Categorisation comportementale | `FULFILL` |

### 2.2 Action Terms

Les Action Terms sont les verbes standardises BIAN :

| Action Term | HTTP Method | Description | Necessite CR ID |
|-------------|-------------|-------------|-----------------|
| **Initiate** | POST | Creer une nouvelle instance | Non |
| **Update** | PUT | Modifier une instance existante | Oui |
| **Retrieve** | GET | Consulter une instance | Oui |
| **Control** | PUT | Controler le cycle de vie | Oui |
| **Execute** | PUT | Executer une action | Oui |
| **Request** | POST | Demander une action | Oui |
| **Evaluate** | POST | Evaluer / Simuler | Non |
| **Provide** | POST | Fournir des donnees | Non |
| **Notify** | POST | Envoyer une notification | Non |
| **Grant** | PUT | Accorder une autorisation | Oui |

### 2.3 Behavior Qualifier (BQ)

Un Behavior Qualifier represente un sous-aspect du Control Record. Par exemple, pour le Service Domain `Current Account` :

- `balances` — Soldes du compte
- `payments` — Paiements
- `deposits` — Depots
- `statements` — Releves

### 2.4 Structure d'URL BIAN

```
/api/v1/{service-domain}/{cr-reference-id}/{behavior-qualifier}/{action}
```

Exemples :
- `POST /api/v1/current-account/initiation` — Ouvrir un compte
- `GET /api/v1/current-account/{cr-reference-id}/retrieval` — Consulter un compte
- `GET /api/v1/current-account/{cr-reference-id}/balances/retrieval` — Consulter les soldes
- `PUT /api/v1/current-account/{cr-reference-id}/update` — Modifier un compte

---

## 3. Service Domains supportes

L'outil reconnait automatiquement les Service Domains suivants :

| Service Domain | BIAN ID | Mots-cles de detection | Functional Pattern |
|----------------|---------|------------------------|--------------------|
| **Current Account** | SD0152 | compte, account, courant | FULFILL |
| **Savings Account** | SD0258 | epargne, savings | FULFILL |
| **Consumer Loan** | SD0188 | credit, loan, pret, simuler | FULFILL |
| **Card Management** | SD0157 | carte, card | FULFILL |
| **Payment Execution** | SD0227 | paiement, payment, virement, transfer | PROCESS |
| **Customer Management** | SD0132 | client, customer, tiers, party | MANAGE |
| **Document Management** | SD0153 | document, fichier, file | MANAGE |
| **Fraud Detection** | SD0408 | fraude, fraud, suspicious | DETECT |
| **Regulatory Compliance** | SD0247 | conformite, compliance, kyc, aml | COMPLY |
| **Risk Management** | SD0252 | risque, risk, scoring | ASSESS |

---

## 4. Mapping automatique vs explicite

### 4.1 Mapping automatique (par mots-cles)

L'outil analyse le nom de chaque UseCase et le mappe automatiquement vers un Service Domain BIAN en fonction des mots-cles :

```
SimulerCreditUseCase → "simuler" + "credit" → Consumer Loan (SD0188)
ConsulterCompteUseCase → "consulter" + "compte" → Current Account (SD0152)
```

L'Action Term est deduit du verbe :

| Verbe detecte | Action Term |
|---------------|-------------|
| `creer`, `create`, `ouvrir`, `open` | Initiate |
| `consulter`, `get`, `find`, `search`, `list` | Retrieve |
| `modifier`, `update`, `maj` | Update |
| `supprimer`, `delete`, `cloturer`, `close` | Control (terminate) |
| `simuler`, `evaluer`, `calculate` | Evaluate |
| `valider`, `execute`, `traiter` | Execute |

### 4.2 Mapping explicite (bian-mapping.yml)

Pour un controle precis, fournir un fichier `bian-mapping.yml` a la racine du ZIP :

```yaml
mappings:
  - useCase: SimulerCreditUseCase
    serviceDomain: consumer-loan
    action: evaluation
    behaviorQualifier: simulation
    bianId: SD0188
    
  - useCase: ConsulterSoldeUseCase
    serviceDomain: current-account
    action: retrieval
    behaviorQualifier: balances
    bianId: SD0152
    
  - useCase: VirementExterneUseCase
    serviceDomain: payment-execution
    action: execution
    bianId: SD0227
```

Le mapping explicite a toujours priorite sur le mapping automatique.

---

## 5. Architecture ACL generee

En mode BIAN, l'outil genere une architecture ACL (Anti-Corruption Layer) a 4 couches :

```
┌─────────────────────────────────────────────────┐
│                  API Layer                       │
│  Controller REST BIAN + Request/Response DTOs    │
│  + Mappers + Validation                          │
├─────────────────────────────────────────────────┤
│                Domain Layer                      │
│  Service Interfaces + Domain Model + Exceptions  │
├─────────────────────────────────────────────────┤
│             Application Layer                    │
│  (Orchestration future)                          │
├─────────────────────────────────────────────────┤
│            Infrastructure Layer                  │
│  JndiAdapter + MockAdapter + Types EJB           │
│  (VoIn/VoOut preserves)                          │
└─────────────────────────────────────────────────┘
```

### 5.1 Couche API

- **Controllers** : Regroupes par Service Domain BIAN
- **Request DTOs** : Champs REST (sans @XmlTransient), avec validation
- **Response DTOs** : Champs de reponse REST
- **Mappers** : Conversion Request ↔ VoIn et VoOut ↔ Response

### 5.2 Couche Domain

- **Service Interfaces** : Contrats de service (ex: `ConsumerLoanService`)
- **Exceptions** : Exceptions metier avec mapping HTTP

### 5.3 Couche Infrastructure

- **JndiAdapter** : Implementation reelle via lookup JNDI
- **MockAdapter** : Implementation mock pour les tests
- **Types EJB** : VoIn/VoOut preserves tels quels (implements ValueObject)

---

## 6. Headers HTTP BIAN

Le `BianHeaderFilter` genere injecte automatiquement les headers suivants sur chaque reponse :

| Header | Description | Exemple |
|--------|-------------|---------|
| `X-BIAN-Version` | Version du standard BIAN | `12.0` |
| `X-BIAN-Service-Domain` | Nom du Service Domain | `current-account` |
| `X-BIAN-Service-Domain-ID` | Identifiant BIAN | `SD0152` |
| `X-BIAN-Action` | Action BIAN executee | `Retrieve` |
| `X-BIAN-Behavior-Qualifier` | BQ (si applicable) | `balances` |

---

## 7. Swagger BIAN

Les endpoints Swagger sont organises par Service Domain BIAN :

- Chaque controller est annote `@Tag(name = "Service Domain")`
- Chaque endpoint a un `operationId` au format : `{action}{ServiceDomain}{BQ}`
- Les `@ApiResponse` incluent les codes HTTP BIAN standards
- Swagger UI : [http://localhost:8081/swagger-ui.html](http://localhost:8081/swagger-ui.html)

---

## 8. Auto-detection BIAN

L'outil detecte automatiquement si un projet EJB est candidat au mode BIAN en analysant :

1. **Noms des classes** : Presence de mots-cles bancaires (compte, credit, paiement, etc.)
2. **Structure des packages** : Packages `usecase`, `service`, `domain`
3. **Annotations** : `@UseCase`, `@RolesAllowed`, annotations bancaires custom
4. **DTOs** : Noms de DTOs contenant des termes bancaires

Si le score de detection depasse le seuil (70%), le mode BIAN est recommande automatiquement.

---

## 9. Rapports BIAN generes

| Rapport | Description |
|---------|-------------|
| `BIAN_MAPPING.md` | Detail du mapping UseCase → Service Domain |
| `TRANSFORMATION_SUMMARY.md` | Resume complet avec section BIAN |
| `CUSTOM_ANNOTATIONS_REPORT.md` | Annotations bancaires detectees et propagees |

---

## 10. Bonnes pratiques

1. **Privilegier le mapping explicite** pour les UseCases critiques via `bian-mapping.yml`
2. **Verifier les Behavior Qualifiers** : l'auto-detection peut manquer certains BQ specifiques
3. **Tester en mode mock** avant de connecter au serveur EJB reel
4. **Consulter le BIAN_MAPPING.md** pour valider les mappings generes
5. **Utiliser les headers X-BIAN-*** pour le monitoring et le routage en production
