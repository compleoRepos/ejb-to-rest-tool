package com.bank.jms.dto;

import java.io.Serializable;

/**
 * DTO pour les messages génériques.
 * @author Hamza NORDINE
 */
public class MessageDTO implements Serializable {

    private static final long serialVersionUID = 1L;
    private String content;

    public MessageDTO() {}

    public MessageDTO(String content) {
        this.content = content;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
