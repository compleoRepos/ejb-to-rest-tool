package com.bank.action;

import com.bank.dto.RoleDTO;
import com.bank.form.RoleForm;
import com.bank.service.RoleService;
import org.apache.struts.action.ActionForm;
import org.apache.struts.action.ActionForward;
import org.apache.struts.action.ActionMapping;
import org.apache.struts.actions.DispatchAction;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.List;

/**
 * Action Struts pour gérer les opérations sur les rôles.
 * Utilise DispatchAction pour appeler des méthodes spécifiques.
 *
 * @author Hamza NORDINE
 */
public class RoleAction extends DispatchAction {

    private final RoleService roleService = new RoleService();

    /**
     * Affiche la liste de tous les rôles.
     */
    public ActionForward list(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response) {
        List<RoleDTO> roles = roleService.findAllRoles();
        request.setAttribute("roles", roles);
        return mapping.findForward("list");
    }

    /**
     * Affiche le formulaire pour ajouter ou modifier un rôle.
     */
    public ActionForward edit(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response) {
        String idStr = request.getParameter("id");
        if (idStr != null && !idStr.isEmpty()) {
            Long roleId = Long.parseLong(idStr);
            roleService.findRoleById(roleId).ifPresent(role -> {
                RoleForm roleForm = (RoleForm) form;
                roleForm.setId(role.getId());
                roleForm.setName(role.getName());
                roleForm.setDescription(role.getDescription());
            });
        }
        return mapping.findForward("edit");
    }

    /**
     * Sauvegarde un rôle (création ou mise à jour).
     */
    public ActionForward save(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response) {
        RoleForm roleForm = (RoleForm) form;
        RoleDTO roleDTO = new RoleDTO(roleForm.getId() == 0 ? null : roleForm.getId(), roleForm.getName(), roleForm.getDescription());

        // En situation réelle, il y aurait une logique de mise à jour vs création
        roleService.createRole(roleDTO);

        return mapping.findForward("success");
    }
}
