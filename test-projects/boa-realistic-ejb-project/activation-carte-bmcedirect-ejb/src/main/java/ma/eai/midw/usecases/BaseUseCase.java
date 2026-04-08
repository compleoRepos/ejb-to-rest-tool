package ma.eai.midw.usecases;

import ma.eai.midw.exceptions.FwkRollbackException;

/**
 * Interface de base pour tous les UseCases du framework EAI.
 * Pattern Command : chaque UseCase encapsule une operation metier
 * avec un point d'entree unique execute(ValueObject).
 *
 * @author Framework EAI — Direction SI BOA
 * @since 2018
 */
public interface BaseUseCase {

    /**
     * Execute le use case avec les parametres fournis.
     *
     * @param voIn objet d'entree contenant les parametres metier
     * @return objet de sortie contenant le resultat
     * @throws FwkRollbackException en cas d'erreur metier (rollback transaction)
     */
    ValueObject execute(ValueObject voIn) throws FwkRollbackException;
}
