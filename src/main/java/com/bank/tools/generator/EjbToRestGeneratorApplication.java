package com.bank.tools.generator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Point d'entrée de l'application EJB to REST Generator.
 * <p>
 * Cet outil permet de transformer automatiquement un projet Java EJB
 * en un projet API REST Spring Boot moderne.
 * </p>
 */
@SpringBootApplication
public class EjbToRestGeneratorApplication {

    public static void main(String[] args) {
        SpringApplication.run(EjbToRestGeneratorApplication.class, args);
    }
}
