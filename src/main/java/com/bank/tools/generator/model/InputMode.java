package com.bank.tools.generator.model;

/**
 * Mode d'entree du pipeline de generation.
 *
 * <ul>
 *   <li>{@link #ZIP_EJB} — Archive ZIP contenant le code source EJB legacy</li>
 *   <li>{@link #JSON_ADAPTER} — Fichier JSON decrivant le contrat d'un adapter REST</li>
 * </ul>
 */
public enum InputMode {

    /** Archive ZIP contenant le code source EJB legacy */
    ZIP_EJB("ZIP (EJB Source)"),

    /** Fichier JSON decrivant le contrat d'un adapter REST */
    JSON_ADAPTER("JSON (Adapter Contract)");

    private final String label;

    InputMode(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    /**
     * Detecte automatiquement le mode d'entree a partir de l'extension du fichier.
     *
     * @param filename nom du fichier (ex: "contract.json", "project.zip")
     * @return le mode detecte
     * @throws IllegalArgumentException si l'extension n'est pas reconnue
     */
    public static InputMode detectFromFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            throw new IllegalArgumentException("Nom de fichier vide ou null");
        }
        String lower = filename.toLowerCase().trim();
        if (lower.endsWith(".json")) {
            return JSON_ADAPTER;
        } else if (lower.endsWith(".zip")) {
            return ZIP_EJB;
        } else {
            throw new IllegalArgumentException(
                    "Extension non supportee : " + filename + ". Formats acceptes : .zip, .json");
        }
    }
}
