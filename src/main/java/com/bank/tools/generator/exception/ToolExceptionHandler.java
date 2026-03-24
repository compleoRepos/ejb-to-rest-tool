package com.bank.tools.generator.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * Gestionnaire global des exceptions pour l'outil de génération.
 */
@ControllerAdvice
public class ToolExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ToolExceptionHandler.class);

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public String handleMaxUploadSize(MaxUploadSizeExceededException ex,
                                       RedirectAttributes redirectAttributes) {
        log.warn("Fichier trop volumineux", ex);
        redirectAttributes.addFlashAttribute("error",
                "Le fichier est trop volumineux. Taille maximale : 100 MB.");
        return "redirect:/";
    }

    @ExceptionHandler(Exception.class)
    public String handleGenericException(Exception ex,
                                          RedirectAttributes redirectAttributes) {
        log.error("Erreur inattendue", ex);
        redirectAttributes.addFlashAttribute("error",
                "Une erreur inattendue s'est produite : " + ex.getMessage());
        return "redirect:/";
    }
}
