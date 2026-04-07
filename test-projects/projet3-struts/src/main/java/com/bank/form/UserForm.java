package com.bank.form;

import javax.servlet.http.HttpServletRequest;
import org.apache.struts.action.ActionErrors;
import org.apache.struts.action.ActionForm;
import org.apache.struts.action.ActionMapping;
import org.apache.struts.action.ActionMessage;

/**
 * Formulaire Struts (ActionForm) pour la gestion des utilisateurs.
 * Capture et valide les données saisies par l'utilisateur pour la création et la mise à jour.
 *
 * @author Hamza NORDINE
 */
public class UserForm extends ActionForm {

    private static final long serialVersionUID = 1L;

    private long id;
    private String username;
    private String email;
    private String firstName;
    private String lastName;
    private boolean enabled;
    private String[] selectedRoles;

    public UserForm() {
        super();
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String[] getSelectedRoles() {
        return selectedRoles;
    }

    public void setSelectedRoles(String[] selectedRoles) {
        this.selectedRoles = selectedRoles;
    }

    @Override
    public ActionErrors validate(ActionMapping mapping, HttpServletRequest request) {
        ActionErrors errors = new ActionErrors();
        if (username == null || username.trim().isEmpty()) {
            errors.add("username", new ActionMessage("error.username.required"));
        }
        if (email == null || email.trim().isEmpty()) {
            errors.add("email", new ActionMessage("error.email.required"));
        } else if (!email.matches("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}$")) {
            errors.add("email", new ActionMessage("error.email.invalid"));
        }
        if (firstName == null || firstName.trim().isEmpty()) {
            errors.add("firstName", new ActionMessage("error.firstname.required"));
        }
        return errors;
    }

    @Override
    public void reset(ActionMapping mapping, HttpServletRequest request) {
        super.reset(mapping, request);
        this.id = 0;
        this.username = null;
        this.email = null;
        this.firstName = null;
        this.lastName = null;
        this.enabled = true;
        this.selectedRoles = new String[0];
    }
}
