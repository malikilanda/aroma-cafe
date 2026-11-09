package com.aromacafe.commande.menu;

import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Articles épuisés du jour.
 * La caisse marque un article « épuisé » : le menu client le grise et le serveur refuse les commandes qui le contiennent.
 * Le marquage ne vaut que pour la journée : le lendemain, l'article redevient disponible sans rien faire.
 */
@Service
public class Disponibilites {
    private static final ZoneId LOME = ZoneId.of("Africa/Lome");

    private final ArticleEpuiseRepository repo;
    private final MenuCatalog catalog;
    private final SimpMessagingTemplate ws;
    private final Clock clock = Clock.system(LOME);

    public Disponibilites(ArticleEpuiseRepository repo, MenuCatalog catalog, SimpMessagingTemplate ws) {
        this.repo = repo;
        this.catalog = catalog;
        this.ws = ws;
    }

    /** identifiants des articles épuisés aujourd'hui */
    @Transactional(readOnly = true)
    public Set<String> epuisesAujourdhui() {
        Set<String> ids = new TreeSet<>();
        repo.findByJour(today()).forEach(a -> ids.add(a.getItemId()));
        return ids;
    }

    @Transactional(readOnly = true)
    public boolean estEpuise(String itemId) {
        return repo.findById(itemId).map(a -> today().equals(a.getJour())).orElse(false);
    }

    /** Marque un article épuisé (true) ou de nouveau disponible (false) pour aujourd'hui. */
    @Transactional
    public Set<String> marquer(String itemId, boolean epuise) {
        if (catalog.find(itemId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Article inconnu.");
        }
        if (epuise) {
            ArticleEpuise a = repo.findById(itemId).orElseGet(() -> new ArticleEpuise(itemId, today()));
            a.setJour(today());
            repo.save(a);
        } else {
            repo.deleteById(itemId);
        }
        Set<String> ids = epuisesAujourdhui();
        // les autres écrans de caisse se mettent à jour tout de suite
        Object event = Map.of("type", "MENU_UPDATED", "epuises", ids);   // Object : évite l'ambiguïté de convertAndSend
        ws.convertAndSend("/topic/caisse", event);
        return ids;
    }

    private LocalDate today() {
        return LocalDate.now(clock);
    }
}