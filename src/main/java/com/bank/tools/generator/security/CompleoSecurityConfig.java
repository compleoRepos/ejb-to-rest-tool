package com.bank.tools.generator.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Sécurité de l'outil Compleo lui-même.
 * Protège l'interface web et les endpoints de génération.
 *
 * Configuration via application.properties :
 *   compleo.security.enabled=true
 *   compleo.security.username=admin
 *   compleo.security.password=changeme
 */
@Configuration
@EnableWebSecurity
public class CompleoSecurityConfig {

    @Value("${compleo.security.enabled:true}")
    private boolean securityEnabled;

    @Value("${compleo.security.username:admin}")
    private String username;

    @Value("${compleo.security.password:changeme}")
    private String password;

    @Bean
    public SecurityFilterChain compleoFilterChain(HttpSecurity http) throws Exception {
        if (!securityEnabled) {
            http.csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
            return http.build();
        }

        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/css/**", "/js/**", "/images/**").permitAll()
                .anyRequest().authenticated()
            )
            .httpBasic(basic -> {})
            .formLogin(form -> form
                .loginPage("/login")
                .permitAll()
            )
            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login?logout")
                .permitAll()
            );

        return http.build();
    }

    @Bean
    public UserDetailsService userDetailsService() {
        var user = User.builder()
                .username(username)
                .password(passwordEncoder().encode(password))
                .roles("ADMIN")
                .build();
        return new InMemoryUserDetailsManager(user);
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
