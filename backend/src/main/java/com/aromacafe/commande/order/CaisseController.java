package com.aromacafe.commande.order;

import com.aromacafe.commande.config.CafeNetwork;
import com.aromacafe.commande.order.OrderDtos.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** API de la tablette caisse (connexion obligatoire, voir SecurityConfig). */
@RestController
@RequestMapping("/api/caisse")
public class CaisseController {
    private final OrderService service;
    private final CafeNetwork cafe;

    public CaisseController(OrderService service, CafeNetwork cafe) {
        this.service = service;
        this.cafe = cafe;
    }

    @GetMapping("/me")
    public Map<String, String> me(Authentication auth) { return Map.of("user", auth.getName()); }

    // ------------------------------------------------------------------ service (ouverture / fermeture)

    /** Le service est-il ouvert ? (la tablette le demande au démarrage) */
    @GetMapping("/service")
    public Map<String, Boolean> serviceState() { return Map.of("ouvert", cafe.isOpen()); }

    /** « Démarrer le service » : les clients peuvent commander. */
    @PostMapping("/service/ouvrir")
    public Map<String, Boolean> openService(HttpServletRequest request) {
        cafe.openService(request);
        return Map.of("ouvert", true);
    }

    /** « Fermer le service » : plus aucune commande n'est acceptée. */
    @PostMapping("/service/fermer")
    public Map<String, Boolean> closeService() {
        cafe.closeService();
        return Map.of("ouvert", false);
    }

    // ------------------------------------------------------------------ commandes

    /** scope=active : nouvelles + en cuisine ; scope=today : toutes les commandes du jour */
    @GetMapping("/orders")
    public List<OrderView> orders(@RequestParam(defaultValue = "active") String scope) {
        return "today".equals(scope) ? service.today() : service.active();
    }

    @PostMapping("/orders/{id}/transmettre")
    public OrderView transmit(@PathVariable long id) { return service.transmit(id); }

    @PostMapping("/orders/{id}/servir")
    public OrderView serve(@PathVariable long id) { return service.serve(id); }

    @PostMapping("/orders/{id}/annuler")
    public OrderView cancel(@PathVariable long id) { return service.cancel(id); }

    // ------------------------------------------------------------------ tables

    @GetMapping("/tables")
    public List<TableView> tables() { return service.tables(); }

    @GetMapping("/tables/{table}/addition")
    public BillView bill(@PathVariable int table) { return service.bill(table); }

    @PostMapping("/tables/{table}/encaisser")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void close(@PathVariable int table) { service.close(table); }

    @GetMapping("/qr")
    public Map<String, Object> qr() { return Map.of("tables", service.qrLinks()); }
}