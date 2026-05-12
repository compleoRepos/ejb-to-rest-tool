```java
    FluxTraitementResponse fluxTraitementResponse = new FluxTraitementResponse();
    try {
        // Assume request is a Map or a DTO that holds the original parameters
        // For simplicity, let's assume it's a Map<String, String> for now.
        // In a real scenario, you'd define a specific DTO for the request.
        Map<String, String> params = (Map<String, String>) request; // Cast to appropriate DTO or Map

        String compte = params.get("Compte");
        String mntTirage = params.get("MntTirage");
        String libelleTirage = params.get("LibelleTirage");
        String dureeTirage = params.get("DureeTirage");
        String canal = params.get("Canal");
        String reference = params.get("Reference");

        String categorie = compte.substring(12, 15);
        String centredefrais = compte.substring(3, 6) + compte.substring(10, 12);
        LocalDate currentDate = LocalDate.now();
        Long dureeTirageToAdd = Long.parseLong(dureeTirage);
        LocalDate dateEcheance = currentDate.plusMonths(dureeTirageToAdd);
        String dtDebTirage = DT_FORMATTER.format(currentDate);
        String dt1Echeance = DT_FORMATTER.format(dateEcheance);
        String noTiers = "0000000";
        String nomClient = " ";

        // Call the injected service for getSolde
        FluxSoldeResponse fluxSoldeResponse = this.monetiqueCreditJockerService.getSolde(compte, canal, reference);

        if (!"000".equals(fluxSoldeResponse.getCode())) {
            fluxTraitementResponse.setCode(fluxSoldeResponse.getCode());
            fluxTraitementResponse.setMessage(fluxSoldeResponse.getMessage());
            return fluxTraitementResponse;
        }
        String noDoss = fluxSoldeResponse.getNoDoss();
        String fluxTirageDeclic;
        if ("GAB".equalsIgnoreCase(canal)) { // Use direct comparison after ensuring case-insensitivity
            String sourceOperation = "GAB";
            fluxTirageDeclic = generateFluxService.traitementGAB(compte, mntTirage, libelleTirage, centredefrais,
                    categorie, dtDebTirage, dt1Echeance, noDoss, noTiers, nomClient, dureeTirage, sourceOperation);
        } else if ("TPE".equalsIgnoreCase(canal)) { // Use direct comparison after ensuring case-insensitivity
            Float montantDouble = Float.parseFloat(mntTirage.trim());
            double montantMinAutorise = 500.00;
            Float montantMaxAutorise = Float.parseFloat(fluxSoldeResponse.getMntDisponible().trim());
            if (montantDouble > montantMaxAutorise) {
                fluxTraitementResponse.setCode("444");
                fluxTraitementResponse.setMessage("Montant choisi est supéreur au Disponible");
                return fluxTraitementResponse;
            }
            if (montantDouble < montantMinAutorise) {
                fluxTraitementResponse.setCode("333");
                fluxTraitementResponse.setMessage("Montant choisi est inférieur à 500 DH");
                return fluxTraitementResponse;
            }
            fluxTirageDeclic = generateFluxService.getFluxDeclicTPE(compte, mntTirage, nomClient, dureeTirage, canal);
        } else {
            String sourceOperation = "Immediat";
            fluxTirageDeclic = generateFluxService.traitementDECLIC(compte, mntTirage, libelleTirage, centredefrais,
                    categorie, dtDebTirage, dt1Echeance, noDoss, noTiers, nomClient, dureeTirage, sourceOperation);
        }
        // Call the injected service for traitementDeclic
        fluxTraitementResponse = monetiqueCreditJockerService.traitementDeclic(fluxTirageDeclic);
    } catch (Exception exception) {
        // Log the exception for debugging purposes
        log.error("Error during Traitement operation for request: {}", request, exception);
        fluxTraitementResponse.setCode("009");
        fluxTraitementResponse.setMessage(Constants.PROBLEM_TECHNIQUE);
    }
    return fluxTraitementResponse;
```