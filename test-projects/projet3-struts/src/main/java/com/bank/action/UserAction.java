package com.bank.action;

import com.bank.dto.UserDTO;
import com.bank.form.UserForm;
import com.bank.service.UserService;
import com.bank.util.ActionHelper;
import org.apache.struts.action.Action;
import org.apache.struts.action.ActionForm;
import org.apache.struts.action.ActionForward;
import org.apache.struts.action.ActionMapping;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.List;

/**
 * Action Struts pour gérer les opérations CRUD sur les utilisateurs.
 * Utilise UserService pour interagir avec la couche de données.
 *
 * @author Hamza NORDINE
 */
public class UserAction extends Action {

    private final UserService userService = new UserService();

    @Override
    public ActionForward execute(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response) throws Exception {
        String method = request.getParameter("method");

        if ("list".equals(method)) {
            return list(mapping, request);
        } else if ("edit".equals(method)) {
            return edit(mapping, request);
        } else if ("save".equals(method)) {
            return save(mapping, (UserForm) form, request);
        } else if ("delete".equals(method)) {
            return delete(mapping, request);
        }

        return list(mapping, request);
    }

    private ActionForward list(ActionMapping mapping, HttpServletRequest request) {
        List<UserDTO> users = userService.findAllUsers();
        request.setAttribute("users", users);
        return mapping.findForward("list");
    }

    private ActionForward edit(ActionMapping mapping, HttpServletRequest request) {
        Long userId = ActionHelper.getIdFromRequest(request);
        if (userId != null) {
            userService.findUserById(userId).ifPresent(user -> request.setAttribute("user", user));
        }
        return mapping.findForward("edit");
    }

    private ActionForward save(ActionMapping mapping, UserForm userForm, HttpServletRequest request) {
        UserDTO userDTO = new UserDTO();
        userDTO.setUsername(userForm.getUsername());
        userDTO.setEmail(userForm.getEmail());
        userDTO.setFirstName(userForm.getFirstName());
        userDTO.setLastName(userForm.getLastName());
        userDTO.setEnabled(userForm.isEnabled());

        try {
            if (userForm.getId() == 0) {
                userService.createUser(userDTO);
            } else {
                userService.updateUser(userForm.getId(), userDTO);
            }
        } catch (Exception e) {
            // Gérer l'exception, par exemple en ajoutant une erreur au request
            return mapping.findForward("failure");
        }
        return mapping.findForward("success");
    }

    private ActionForward delete(ActionMapping mapping, HttpServletRequest request) {
        Long userId = ActionHelper.getIdFromRequest(request);
        if (userId != null) {
            try {
                userService.deleteUser(userId);
            } catch (Exception e) {
                return mapping.findForward("failure");
            }
        }
        return mapping.findForward("success");
    }
}
