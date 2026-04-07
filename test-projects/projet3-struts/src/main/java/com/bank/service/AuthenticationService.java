package com.bank.service;

import com.bank.dto.UserDTO;
import com.bank.exception.UserNotFoundException;

/**
 * Service pour la gestion de l'authentification des utilisateurs.
 * Simule un processus d'authentification.
 *
 * @author Hamza NORDINE
 */
public class AuthenticationService {

    private final UserService userService;

    public AuthenticationService(UserService userService) {
        this.userService = userService;
    }

    /**
     * Tente d'authentifier un utilisateur avec son nom d'utilisateur et son mot de passe.
     *
     * @param username Le nom d'utilisateur.
     * @param password Le mot de passe.
     * @return Le DTO de l'utilisateur si l'authentification réussit.
     * @throws UserNotFoundException Si aucun utilisateur ne correspond au nom d'utilisateur.
     * @throws SecurityException Si le mot de passe est incorrect.
     */
    public UserDTO login(String username, String password) throws UserNotFoundException {
        // En situation réelle, on chercherait par username et on comparerait un hash de mot de passe
        UserDTO user = userService.findAllUsers().stream()
                .filter(u -> u.getUsername().equals(username))
                .findFirst()
                .orElseThrow(() -> new UserNotFoundException("Utilisateur non trouvé: " + username));

        // Simulation de la vérification du mot de passe
        if (!"password".equals(password) && !"defaultPassword".equals(password)) { // Mot de passe simplifié pour l'exemple
            throw new SecurityException("Mot de passe invalide.");
        }

        return user;
    }
}
