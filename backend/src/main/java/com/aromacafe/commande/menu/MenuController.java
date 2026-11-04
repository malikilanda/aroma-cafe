package com.aromacafe.commande.menu;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;

/**
 * GET /api/menu : la carte complète (le fichier menu.json tel quel).
 * Le navigateur peut la garder 5 minutes en mémoire : le menu s'ouvre plus vite
 * et le serveur est moins sollicité quand toute la salle consulte la carte.
 */
@RestController
public class MenuController {

    private final MenuCatalog catalog;

    public MenuController(MenuCatalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping(value = "/api/menu", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<byte[]> menu() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(5, TimeUnit.MINUTES))
                .body(catalog.raw());
    }
}