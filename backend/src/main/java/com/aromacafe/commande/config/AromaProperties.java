package com.aromacafe.commande.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Réglages propres à Aroma Café, lus dans application.properties (préfixe "aroma").
 *
 *   aroma.tables=10                     -> tables()
 *   aroma.table-secret=...              -> tableSecret()
 *   aroma.caisse.username / password    -> caisse().username() / caisse().password()
 *
 * Grâce à @Validated, le serveur refuse de démarrer si un réglage manque ou est incorrect,
 * avec un message clair, au lieu de planter plus tard pendant le service.
 */
@Validated
@ConfigurationProperties(prefix = "aroma")
public record AromaProperties(
        @Min(1) int tables,
        @NotBlank String tableSecret,
        @Valid Caisse caisse) {

    /** Identifiants de la tablette caisse. */
    public record Caisse(
            @NotBlank String username,
            @NotBlank String password) {
    }
}