package com.aromacafe.commande.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;

/**
 * Qui a le droit de voir quoi.
 * - Les clients (menu, commande, suivi, addition) sont publics : leur table est prouvée par le jeton signé du QR code.
 * - La caisse (pages, fichiers de la caisse, API, temps réel) exige une connexion.
 * - Connexion par notre page login.html ; la tablette reste connectée 30 jours (« se souvenir de moi »).
 */
@Configuration
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    /** Un seul compte : celui de la caisse, lu dans application.properties. */
    @Bean
    public UserDetailsService users(AromaProperties props, PasswordEncoder encoder) {
        return new InMemoryUserDetailsManager(User.withUsername(props.caisse().username())
                .password(encoder.encode(props.caisse().password()))
                .roles("CAISSE")
                .build());
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, AromaProperties props, UserDetailsService users) throws Exception {
        http
            // Pas de jeton CSRF : la caisse et le menu appellent l'API en JSON depuis le même site
            .csrf(csrf -> csrf.disable())

            .authorizeHttpRequests(auth -> auth
                // Réservé à la caisse : la page, son dossier (CSS, JS, plan de salle), les QR codes, l'API et le temps réel
                .requestMatchers("/caisse.html", "/caisse/**", "/qr.html", "/api/caisse/**", "/ws/**").hasRole("CAISSE")
                // Tout le reste (menu, API publique de commande, login.html) est ouvert
                .anyRequest().permitAll())

            // Notre propre page de connexion (à la place de la page grise de Spring)
            .formLogin(form -> form
                .loginPage("/login.html")              // la page affichée
                .loginProcessingUrl("/login")          // l'adresse où le formulaire est envoyé
                .defaultSuccessUrl("/caisse.html", true)
                .failureUrl("/login.html?erreur")
                .permitAll())

            // La tablette reste connectée 30 jours, même après un redémarrage
            .rememberMe(rm -> rm
                .key(props.tableSecret() + "-remember")
                .tokenValiditySeconds(30 * 24 * 3600)
                .alwaysRemember(true)
                .userDetailsService(users))

            .logout(lo -> lo
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login.html?deconnecte"))

            // Un appel /api/... sans connexion reçoit 401 (au lieu d'être redirigé vers la page de connexion)
            .exceptionHandling(ex -> ex.defaultAuthenticationEntryPointFor(
                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                PathPatternRequestMatcher.withDefaults().matcher("/api/**")));

        return http.build();
    }
}