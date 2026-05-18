/* MIGRATED LOGIC — from MonetiqueCreditJockerService.Traitement */
@CompleoUnvalidated(severity = "STUB", legacyRef = "MonetiqueCreditJockerService.Traitement", migrationDate = "2026-05-12")
@Transactional
public FluxTraitementResponse Traitement(
        @NonNull String accountNumber,
        @NonNull String drawdownAmount,
        @NonNull String drawdownLabel,
        @NonNull String drawdownDuration,
        @NonNull String channel,
        @NonNull String reference) {

    FluxTraitementResponse transactionResponse = new FluxTraitementResponse(); // Renamed from fluxTraitementResponse
    try {
        // Extracting account details
        String category = accountNumber.substring(12, 15); // DECLIC category
        String costCenter = accountNumber.substring(3, 6) + accountNumber.substring(10, 12); // Centre de frais

        // Date calculations for drawdown
        LocalDate currentDate = LocalDate.now();
        Long durationInMonths = Long.parseLong(drawdownDuration);
        LocalDate maturityDate = currentDate.plusMonths(durationInMonths); // Date d'échéance
        String drawdownStartDate = DT_FORMATTER.format(currentDate); // dtDebTirage
        String firstMaturityDate = DT_FORMATTER.format(maturityDate); // dt1Echeance

        String customerId = "0000000"; // noTiers - TODO: [VERIFY] Is this always hardcoded or should be fetched?
        String customerName = " "; // nomClient - TODO: [VERIFY] Is this always hardcoded or should be fetched?

        // Fetch account balance (Solde)
        // Assuming getSolde is now a Spring service call
        FluxSoldeResponse balanceResponse = this.declicService.getSolde(accountNumber, channel, reference); // Renamed from fluxSoldeResponse, assuming declicService injection

        if (!"000".equals(balanceResponse.getCode())) {
            transactionResponse.setCode(balanceResponse.getCode());
            transactionResponse.setMessage(balanceResponse.getMessage());
            return transactionResponse;
        }

        String creditFileNumber = balanceResponse.getNoDoss(); // noDoss
        String declicDrawdownFlux; // fluxTirageDeclic

        // Channel-specific logic
        if ("GAB".equalsIgnoreCase(channel)) { // GAB: ATM channel
            String operationSource = "GAB";
            // Assuming GenerateFlux methods are now part of a service, e.g., declicFluxGenerator
            declicDrawdownFlux = declicFluxGenerator.generateAtmDrawdownFlux(
                    accountNumber, drawdownAmount, drawdownLabel, costCenter,
                    category, drawdownStartDate, firstMaturityDate, creditFileNumber,
                    customerId, customerName, drawdownDuration, operationSource);
        } else if ("TPE".equalsIgnoreCase(channel)) { // TPE: POS terminal channel
            Float amountFloat = Float.parseFloat(drawdownAmount.trim()); // montantDouble
            double minAuthorizedAmount = 500.00; // montantMinAutorise
            Float maxAuthorizedAmount = Float.parseFloat(balanceResponse.getMntDisponible().trim()); // montantMaxAutorise

            if (amountFloat > maxAuthorizedAmount) {
                transactionResponse.setCode("444");
                transactionResponse.setMessage("Montant choisi est supéreur au Disponible");
                return transactionResponse;
            }
            if (amountFloat < minAuthorizedAmount) {
                transactionResponse.setCode("333");
                transactionResponse.setMessage("Montant choisi est inférieur à 500 DH");
                return transactionResponse;
            }
            // Assuming GenerateFlux methods are now part of a service, e.g., declicFluxGenerator
            declicDrawdownFlux = declicFluxGenerator.generatePosDrawdownFlux(
                    accountNumber, drawdownAmount, customerName, drawdownDuration, channel);
        } else { // Default channel (e.g., "Immediat")
            String operationSource = "Immediat";
            // Assuming GenerateFlux methods are now part of a service, e.g., declicFluxGenerator
            declicDrawdownFlux = declicFluxGenerator.generateDeclicDrawdownFlux(
                    accountNumber, drawdownAmount, drawdownLabel, costCenter,
                    category, drawdownStartDate, firstMaturityDate, creditFileNumber,
                    customerId, customerName, drawdownDuration, operationSource);
        }
        // Process the generated DECLIC flux
        // Assuming traitementDeclic is now a service method, e.g., declicService.processDeclicTransaction
        transactionResponse = declicService.processDeclicTransaction(declicDrawdownFlux); // Renamed from fluxTraitementResponse
    } catch (NumberFormatException nfe) {
        // Handle parsing errors for numeric inputs (e.g., drawdownAmount, drawdownDuration)
        transactionResponse.setCode("008"); // Custom code for invalid numeric input
        transactionResponse.setMessage("Format numérique invalide pour le montant ou la durée du tirage.");
        log.error("NumberFormatException in Traitement: {}", nfe.getMessage()); // Assuming SLF4J logger
    } catch (StringIndexOutOfBoundsException sioobe) {
        // Handle errors related to substring operations (e.g., accountNumber format)
        transactionResponse.setCode("007"); // Custom code for invalid account number format
        transactionResponse.setMessage("Format du numéro de compte invalide.");
        log.error("StringIndexOutOfBoundsException in Traitement: {}", sioobe.getMessage()); // Assuming SLF4J logger
    } catch (Exception exception) {
        // Catch all other unexpected exceptions
        transactionResponse.setCode("009");
        transactionResponse.setMessage(Constants.PROBLEM_TECHNIQUE); // Assuming Constants class is available
        log.error("Unhandled exception in Traitement: {}", exception.getMessage(), exception); // Assuming SLF4J logger
    }
    return transactionResponse;
}