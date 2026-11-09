package com.aromacafe.commande.menu;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;

/** Articles épuisés : lecture publique pour le menu, modification réservée à la caisse. */
@RestController
public class DisponibiliteController {
    private final Disponibilites dispo;

    public DisponibiliteController(Disponibilites dispo) {
        this.dispo = dispo;
    }

    /** Menu client : liste des articles à griser (jamais mise en cache, elle change pendant le service). */
    @GetMapping("/api/menu/epuises")
    public ResponseEntity<Map<String, Set<String>>> publicList() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("epuises", dispo.epuisesAujourdhui()));
    }

    /** Caisse : même liste (protégée par la connexion, voir SecurityConfig : /api/caisse/**). */
    @GetMapping("/api/caisse/epuises")
    public Map<String, Set<String>> caisseList() {
        return Map.of("epuises", dispo.epuisesAujourdhui());
    }

    /** Caisse : POST /api/caisse/epuises/croissant?epuise=true  (false pour le remettre en vente) */
    @PostMapping("/api/caisse/epuises/{itemId}")
    public Map<String, Set<String>> mark(@PathVariable String itemId, @RequestParam boolean epuise) {
        return Map.of("epuises", dispo.marquer(itemId, epuise));
    }
}
