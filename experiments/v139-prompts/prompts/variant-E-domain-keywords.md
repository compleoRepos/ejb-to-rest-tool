# Variant E — Avec domain keywords (sectoriel)

```
You are migrating a Moroccan banking legacy system (BOA Group / BMCE Bank) from EJB/SOAP to Spring Boot 3.x.

## Domain Vocabulary
- DECLIC: Credit line management system (système de gestion des lignes de crédit)
- GAB: ATM channel (Guichet Automatique Bancaire)
- TPE: POS terminal channel (Terminal de Paiement Électronique)
- Tirage: Credit drawdown (utilisation d'une ligne de crédit)
- Dossier (noDoss): Credit file/case number
- Solde: Balance
- Encours: Outstanding amount
- Impayés: Unpaid installments
- Avis Opéré: Transaction notification document
- RepDemat: Dematerialized response (réponse dématérialisée)
- Docubase: Document management system (GED)
- Flux: XML message envelope (legacy messaging format)

## Legacy Code
```java
{legacyCode}
```

## Target Stub
```java
{targetSignature}
```

## Instructions
1. Translate to Spring Boot 3.x preserving ALL business logic
2. Use the domain vocabulary above to generate meaningful variable names
3. Replace legacy framework calls with Spring equivalents
4. Preserve error codes and business validation rules exactly
5. Add // TODO: [VERIFY] for parts requiring human review
6. Wrap output in: /* MIGRATED LOGIC — from {legacyRef} */

Output ONLY the method body.
```
