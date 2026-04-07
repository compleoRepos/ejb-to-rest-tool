package com.bank.service;

import com.bank.dto.RoleDTO;
import com.bank.model.Role;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Service pour la gestion des rôles.
 * Fournit des opérations CRUD pour les rôles en mémoire.
 *
 * @author Hamza NORDINE
 */
public class RoleService {

    private final ConcurrentHashMap<Long, Role> roles = new ConcurrentHashMap<>();
    private final AtomicLong sequence = new AtomicLong(0);

    public RoleService() {
        // Initialisation avec quelques rôles
        createRole(new RoleDTO(null, "ADMIN", "Administrateur du système"));
        createRole(new RoleDTO(null, "USER", "Utilisateur standard"));
        createRole(new RoleDTO(null, "VIEWER", "Observateur seul"));
    }

    /**
     * Crée un nouveau rôle.
     *
     * @param roleDTO DTO du rôle à créer.
     * @return DTO du rôle créé.
     */
    public RoleDTO createRole(RoleDTO roleDTO) {
        long id = sequence.incrementAndGet();
        Role role = new Role(id, roleDTO.getName(), roleDTO.getDescription());
        roles.put(id, role);
        return toDTO(role);
    }

    /**
     * Trouve un rôle par son ID.
     *
     * @param id ID du rôle.
     * @return Optional contenant le DTO du rôle s'il est trouvé.
     */
    public Optional<RoleDTO> findRoleById(Long id) {
        Role role = roles.get(id);
        return Optional.ofNullable(role).map(this::toDTO);
    }

    /**
     * Retourne la liste de tous les rôles.
     *
     * @return Liste des DTOs de tous les rôles.
     */
    public List<RoleDTO> findAllRoles() {
        List<RoleDTO> roleDTOs = new ArrayList<>();
        for (Role role : roles.values()) {
            roleDTOs.add(toDTO(role));
        }
        return roleDTOs;
    }

    /**
     * Convertit une entité Role en RoleDTO.
     *
     * @param role Entité Role.
     * @return RoleDTO.
     */
    private RoleDTO toDTO(Role role) {
        return new RoleDTO(role.getId(), role.getName(), role.getDescription());
    }
}
