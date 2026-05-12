# v13.10 — Diagnostic Compile Errors

## interface-credit-jocker (11 erreurs)

**Pattern unique : DTO tronqué (11/11 erreurs)**

Tous les DTOs dans `com.app.dto/` ont le même problème :
- Le fichier contient `public class XxxRequestDTO {` suivi de lignes commentées `// [AUTOFIX]`
- L'accolade fermante `}` est commentée par AUTOFIX → "reached end of file while parsing"

Exemple type :
```java
package com.app.dto;
import com.example.ejbproject.common.DTO;
import lombok.Data;
@Data
public class BlocageJokerRequestDTO {
// [AUTOFIX]     private @WebParam(name = "TYPBLOCAGE");
// [AUTOFIX] }
```

**Cause racine** : Le générateur produit `private @WebParam(name = "TYPBLOCAGE");` comme champ DTO. Le CompileAutoFixer détecte que c'est invalide et commente la ligne ET l'accolade fermante. Résultat : fichier sans `}`.

**Fix nécessaire** : Détecter les fichiers avec braces non balancées APRÈS l'autofix et injecter un fallback minimal.

---

## avis-opere (152 erreurs → 6 fichiers)

### Fichier 1 : GeneralController.java (122 erreurs)

**Pattern : @WebParam/partName pollue les paramètres de méthode et les imports**

```java
import com.example.ejbproject.dto.(name =);                    // INVALIDE
import com.example.ejbproject.dto.partName = "date_debut") String;  // INVALIDE
```

Et dans les méthodes :
```java
public ResponseEntity<Pager> searchByMontant(
    @RequestParam (name = "numero_compte", @RequestParam partName = "numero_compte") StringArray numeroCompte, ...
```

**Cause racine** : Le générateur SOAP conserve les annotations `@WebParam(name=..., partName=...)` du WSDL et les injecte à tort dans les imports et les paramètres Spring.

### Fichier 2 : GeneralService.java (18 erreurs)

Même pattern que GeneralController — les paramètres de méthode contiennent `(name = "...", partName = "...")` au lieu de types Java valides.

### Fichier 3 : XbankingService.java (4 erreurs)

**Pattern : syntaxe Java invalide dans le code migré**

```java
List<Handler> handlerChain = new ArrayList<Handler>());  // parenthèse en trop
```

Et :
```java
wsEdocServiceLocator.setHandlerResolver(portInfo -> {
    ...
};  // manque la parenthèse fermante du setHandlerResolver
```

### Fichier 4 : ServicedataService.java + ServicedataController.java (2+2 erreurs)

**Pattern : import avec `...` (varargs dans le type)**

```java
import com.example.ejbproject.dto.WebServiceFeature...;  // INVALIDE
```

**Cause racine** : Le type `WebServiceFeature...` (varargs) est traité comme un nom de classe dans l'import.

### Fichier 5 : SearchRequestDTO + SearchByMontantRequestDTO (2+2 erreurs)

Même pattern que ICJ — DTOs tronqués avec `@WebParam` commenté et `}` manquant.

---

## Résumé des Patterns

| # | Pattern | Fichiers | Erreurs | Fix |
|---|---------|----------|---------|-----|
| 1 | DTO tronqué (braces non balancées après AUTOFIX) | 13 | 15 | Post-AUTOFIX brace balancer |
| 2 | @WebParam/partName dans imports et params | 4 | 140 | Nettoyage pré-génération des annotations SOAP |
| 3 | Parenthèses non balancées dans le code migré | 1 | 4 | ParenBalancer existant à améliorer |
| 4 | Import avec varargs (`...`) | 2 | 4 | Filtrage des imports invalides |

**Total** : 152 + 11 = 163 erreurs, 4 patterns distincts.
