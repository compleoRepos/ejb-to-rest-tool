package ma.eai.midw.services;

import ma.eai.midw.exceptions.FwkRollbackException;

/**
 * Service Magix — Service transverse d'integration BOA.
 * Gere les appels au core banking (ATLAS/T24) via le middleware Magix.
 *
 * Chaque UseCase qui accede au core banking depend de MagixService.
 */
public interface MagixService {

    /**
     * Execute une transaction Magix vers le core banking.
     * @param codeTransaction code Magix (ex: "CART01", "VIR03")
     * @param parametres parametres de la transaction
     * @return reponse du core banking
     */
    String executeTransaction(String codeTransaction, String parametres) throws FwkRollbackException;

    /**
     * Consulte une donnee dans le core banking.
     * @param codeConsultation code de consultation Magix
     * @param criteres criteres de recherche
     * @return donnees recuperees
     */
    String consulter(String codeConsultation, String criteres) throws FwkRollbackException;
}
