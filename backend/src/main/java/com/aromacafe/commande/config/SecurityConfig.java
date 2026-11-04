package com.aromacafe.commande.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
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
 * Qui a le droit de faire quoi.
 *
 * - Les clients (menu, commandes, suivi) n'ont pas de compte : tout ce qui les concerne est public.
 *   Leur table est prouvée par le jeton signé du QR code (vérifié plus tard dans le service des commandes).
 * - La caisse (pages, API /api/caisse, temps réel /ws) exige une connexion.
 *   Grâce à « se souvenir de moi », la tablette reste connectée 30 jours.
 */
@Configuration
public class SecurityConfig {

    /** Les mots de passe sont stockés hachés en mémoire, jamais en clair. */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    /** Un seul compte : celui de la caisse, lu dans application.properties. */
    @Bean
    public UserDetailsService users(AromaProperties props, PasswordEncoder encoder) {
        return new InMemoryUserDetailsManager(
                User.withUsername(props.caisse().username())
                        .password(encoder.encode(props.caisse().password()))
                        .roles("CAISSE")
                        .build());
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, AromaProperties props, UserDetailsService users) throws Exception {
        http
            // Pas de jeton CSRF : l'API est appelée en JSON depuis nos propres pages
            .csrf(csrf -> csrf.disable())

            // Règles d'accès : la caisse est protégée, tout le reste est public
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/caisse.html", "/qr.html", "/api/caisse/**", "/ws/**").hasRole("CAISSE")
                .anyRequest().permitAll())

            // Page de connexion (celle de Spring pour l'instant ; on fera la nôtre avec la caisse)
            .formLogin(Customizer.withDefaults())

            // La tablette reste connectée 30 jours, même si on ferme le navigateur
            .rememberMe(rm -> rm
                .key(props.tableSecret() + "-remember")
                .tokenValiditySeconds(30 * 24 * 3600)
                .alwaysRemember(true)
                .userDetailsService(users))

            .logout(Customizer.withDefaults())

            // Un appel API non connecté reçoit « 401 » (en JSON on ne redirige pas vers une page HTML)
            .exceptionHandling(ex -> ex.defaultAuthenticationEntryPointFor(
                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                PathPatternRequestMatcher.withDefaults().matcher("/api/**")));

        return http.build();
    }
}