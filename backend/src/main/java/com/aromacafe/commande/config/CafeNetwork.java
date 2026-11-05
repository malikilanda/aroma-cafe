package com.aromacafe.commande.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Gardien des commandes : le service est-il ouvert, et ce téléphone a-t-il le droit de commander ?
 *
 * Le service s'ouvre et se ferme depuis la tablette caisse (« Démarrer le service » / « Fermer le service »).
 * Le réglage aroma.commandes décide de ce qu'on vérifie :
 *  - toujours       : rien (tests sur ton PC) ;
 *  - caisse-ouverte : le service doit être ouvert, depuis n'importe quel réseau (Wi-Fi, 4G…) ;
 *  - wifi-cafe      : en plus, le téléphone doit être sur le même réseau que la caisse (le Wi-Fi du café).
 *
 * Sécurité si la tablette s'éteint sans fermer le service : elle appelle /api/caisse/... toutes les 30 secondes ;
 * sans nouvelle d'elle depuis 10 minutes, le service est considéré comme fermé.
 * En IPv4, tout le café sort par l'adresse de la box ; en IPv6, on compare le « préfixe /64 » du réseau.
 */
@Component
public class CafeNetwork extends OncePerRequestFilter {

    /** Au-delà de ce délai sans nouvelle de la caisse, le service est considéré comme fermé. */
    private static final Duration FRESH = Duration.ofMinutes(10);

    /**
     * En-têtes posés par Cloudflare, qui est devant tous les services Render : ils contiennent la vraie adresse du client
     * et ne peuvent pas être falsifiés par lui (Cloudflare les écrase). Sans eux (sur ton PC), on prend l'adresse directe.
     */
    private static final List<String> CLIENT_IP_HEADERS = List.of("CF-Connecting-IP", "True-Client-IP");

    private enum Mode { TOUJOURS, CAISSE_OUVERTE, WIFI_CAFE }

    private final Mode mode;
    /** Le service a-t-il été démarré depuis la caisse (et pas encore fermé) ? */
    private volatile boolean open = false;
    /** réseau de la caisse → dernière fois qu'elle l'a utilisé */
    private final Map<String, Instant> cafeNetworks = new ConcurrentHashMap<>();

    public CafeNetwork(@Value("${aroma.commandes:toujours}") String setting) {
        this.mode = switch (setting.trim().toLowerCase()) {
            case "caisse-ouverte" -> Mode.CAISSE_OUVERTE;
            case "wifi-cafe" -> Mode.WIFI_CAFE;
            default -> Mode.TOUJOURS;
        };
    }

    // ------------------------------------------------------------------ ouverture / fermeture du service

    /** « Démarrer le service » sur la tablette (aussi rappelé après une coupure, pour reprendre où on en était). */
    public void openService(HttpServletRequest caisse) {
        open = true;
        cafeNetworks.put(network(clientIp(caisse)), Instant.now());
    }

    /** « Fermer le service » : plus aucune commande n'est acceptée, immédiatement. */
    public void closeService() {
        open = false;
        cafeNetworks.clear();
    }

    /** Le service est ouvert et la caisse a donné des nouvelles il y a moins de 10 minutes. */
    public boolean isOpen() {
        Instant limit = Instant.now().minus(FRESH);
        cafeNetworks.values().removeIf(seen -> seen.isBefore(limit));
        return open && !cafeNetworks.isEmpty();
    }

    // ------------------------------------------------------------------ côté caisse : elle donne des nouvelles

    /** Ce filtre ne regarde que les appels de la caisse (API et temps réel). */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return !(uri.startsWith("/api/caisse/") || uri.startsWith("/ws"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // Ce filtre passe après Spring Security : on ne compte que la caisse réellement connectée,
        // et seulement pendant le service (une caisse fermée mais restée allumée n'ouvre rien)
        if (open && request.getUserPrincipal() != null) {
            cafeNetworks.put(network(clientIp(request)), Instant.now());
        }
        chain.doFilter(request, response);
    }

    // ------------------------------------------------------------------ côté client : a-t-il le droit de commander ?

    /** Message de refus, ou null si le téléphone peut commander. */
    public String refusal(HttpServletRequest request) {
        if (mode == Mode.TOUJOURS) return null;
        if (!isOpen()) {
            return "Le café ne prend pas de commandes pour le moment : le service n'est pas ouvert.";
        }
        if (mode == Mode.WIFI_CAFE && !cafeNetworks.containsKey(network(clientIp(request)))) {
            return "Pour commander, connectez-vous au Wi-Fi d'Aroma Café, puis rechargez la page.";
        }
        return null;
    }

    /** Refuse la requête (erreur 423) si le téléphone n'a pas le droit de commander. */
    public void check(HttpServletRequest request) {
        String refusal = refusal(request);
        if (refusal != null) throw new ResponseStatusException(HttpStatus.LOCKED, refusal);
    }

    // ------------------------------------------------------------------ outils

    static String clientIp(HttpServletRequest request) {
        for (String header : CLIENT_IP_HEADERS) {
            String value = request.getHeader(header);
            if (value != null && !value.isBlank()) return value.trim();
        }
        return request.getRemoteAddr();
    }

    /** IPv4 : l'adresse elle-même. IPv6 : les 64 premiers bits (le réseau du café). */
    static String network(String ip) {
        try {
            InetAddress address = InetAddress.getByName(ip);   // adresse écrite en chiffres : aucune recherche DNS
            if (address instanceof Inet6Address) {
                return HexFormat.of().formatHex(address.getAddress(), 0, 8) + "/64";
            }
            return address.getHostAddress();
        } catch (UnknownHostException e) {
            return ip;
        }
    }
}