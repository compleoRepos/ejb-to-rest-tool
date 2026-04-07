package com.bank.service;

import com.bank.dto.UserDTO;
import com.bank.exception.UserNotFoundException;
import com.bank.model.Role;
import com.bank.model.User;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

/**
 * Service pour la gestion des utilisateurs.
 * Fournit des opérations CRUD pour les utilisateurs en mémoire.
 *
 * @author Hamza NORDINE
 */
public class UserService {

    private final ConcurrentHashMap<Long, User> users = new ConcurrentHashMap<>();
    private final AtomicLong sequence = new AtomicLong(0);
    private final RoleService roleService = new RoleService(); // En situation réelle, serait injecté

    public UserService() {
        // Initialisation avec un utilisateur admin
        User admin = new User(sequence.incrementAndGet(), "admin", "password", "admin@bank.com", "Admin", "User");
        admin.addRole(new Role(1L, "ADMIN", "Administrateur du système"));
        users.put(admin.getId(), admin);
    }

    /**
     * Crée un nouvel utilisateur.
     *
     * @param userDTO DTO de l'utilisateur à créer.
     * @return DTO de l'utilisateur créé.
     */
    public UserDTO createUser(UserDTO userDTO) {
        long id = sequence.incrementAndGet();
        User user = new User(id, userDTO.getUsername(), "defaultPassword", userDTO.getEmail(), userDTO.getFirstName(), userDTO.getLastName());
        user.setCreationDate(new Date());
        user.setEnabled(true);
        users.put(id, user);
        return toDTO(user);
    }

    /**
     * Trouve un utilisateur par son ID.
     *
     * @param id ID de l'utilisateur.
     * @return Optional contenant le DTO de l'utilisateur s'il est trouvé.
     */
    public Optional<UserDTO> findUserById(Long id) {
        User user = users.get(id);
        return Optional.ofNullable(user).map(this::toDTO);
    }

    /**
     * Met à jour un utilisateur existant.
     *
     * @param id      ID de l'utilisateur à mettre à jour.
     * @param userDTO DTO avec les nouvelles informations.
     * @return DTO de l'utilisateur mis à jour.
     * @throws UserNotFoundException si l'utilisateur n'est pas trouvé.
     */
    public UserDTO updateUser(Long id, UserDTO userDTO) throws UserNotFoundException {
        User user = users.get(id);
        if (user == null) {
            throw new UserNotFoundException("Utilisateur non trouvé avec l'ID : " + id);
        }
        user.setUsername(userDTO.getUsername());
        user.setEmail(userDTO.getEmail());
        user.setFirstName(userDTO.getFirstName());
        user.setLastName(userDTO.getLastName());
        user.setEnabled(userDTO.isEnabled());
        users.put(id, user);
        return toDTO(user);
    }

    /**
     * Supprime un utilisateur par son ID.
     *
     * @param id ID de l'utilisateur à supprimer.
     * @throws UserNotFoundException si l'utilisateur n'est pas trouvé.
     */
    public void deleteUser(Long id) throws UserNotFoundException {
        if (users.remove(id) == null) {
            throw new UserNotFoundException("Impossible de supprimer, utilisateur non trouvé avec l'ID : " + id);
        }
    }

    /**
     * Retourne la liste de tous les utilisateurs.
     *
     * @return Liste des DTOs de tous les utilisateurs.
     */
    public List<UserDTO> findAllUsers() {
        return users.values().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    /**
     * Convertit une entité User en UserDTO.
     *
     * @param user Entité User.
     * @return UserDTO.
     */
    private UserDTO toDTO(User user) {
        UserDTO dto = new UserDTO(user.getId(), user.getUsername(), user.getEmail(), user.getFirstName(), user.getLastName(), user.getCreationDate(), user.isEnabled());
        Set<String> roleNames = user.getRoles().stream().map(Role::getName).collect(Collectors.toSet());
        dto.setRoles(roleNames);
        return dto;
    }
}
