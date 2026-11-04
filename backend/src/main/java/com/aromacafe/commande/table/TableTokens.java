package com.aromacafe.commande.table;

import com.aromacafe.commande.config.AromaProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;

/**
 * Jetons signés des QR codes de table.
 *
 *   QR code de la table 5  ->  http://…/?t=5&k=Eu5vOKKCAL
 *
 * Le jeton « k » = HMAC-SHA256(secret, "table-5"), raccourci à 10 caractères.
 * Le serveur sait le recalculer et le comparer ; sans connaître aroma.table-secret,
 * personne ne peut fabriquer le jeton d'une autre table.
 */
@Component
public class TableTokens {

    private final AromaProperties props;

    public TableTokens(AromaProperties props) {
        this.props = props;
    }

    /** Nombre de tables de la salle (aroma.tables). */
    public int tableCount() {
        return props.tables();
    }

    /** Le jeton à imprimer dans le QR code de cette table. */
    public String tokenFor(int table) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(props.tableSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signature = mac.doFinal(("table-" + table).getBytes(StandardCharsets.UTF_8));
            // Encodage « URL-safe » : uniquement des lettres, chiffres, - et _ (pas besoin d'échapper dans un lien)
            return Base64.getUrlEncoder().withoutPadding().encodeToString(signature).substring(0, 10);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Impossible de calculer le jeton de table", e);
        }
    }

    /** Le couple (table, jeton) reçu d'un téléphone est-il authentique ? */
    public boolean isValid(int table, String token) {
        if (table < 1 || table > props.tables() || token == null) {
            return false;
        }
        // Comparaison en temps constant : ne laisse pas deviner le jeton caractère par caractère
        return MessageDigest.isEqual(
                tokenFor(table).getBytes(StandardCharsets.UTF_8),
                token.getBytes(StandardCharsets.UTF_8));
    }
}