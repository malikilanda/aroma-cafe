package com.aromacafe.commande.order;

import com.aromacafe.commande.order.OrderDtos.BillView;
import com.aromacafe.commande.order.OrderDtos.OrderView;
import com.aromacafe.commande.order.OrderDtos.TableView;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * API de la tablette caisse. Toutes ces adresses exigent la connexion « caisse » (voir SecurityConfig).
 */
@RestController
@RequestMapping("/api/caisse")
public class CaisseController {

    private final OrderService service;

    public CaisseController(OrderService service) {
        this.service = service;
    }

    /** Qui est connecté (la page caisse s'en sert pour vérifier que la session est toujours valide). */
    @GetMapping("/me")
    public Map<String, String> me(Authentication auth) {
        return Map.of("user", auth.getName());
    }

    /** scope=active : à traiter + en cuisine ; scope=today : toutes les commandes du jour. */
    @GetMapping("/orders")
    public List<OrderView> orders(@RequestParam(defaultValue = "active") String scope) {
        return "today".equals(scope) ? service.today() : service.active();
    }

    @PostMapping("/orders/{id}/transmettre")
    public OrderView transmit(@PathVariable long id) {
        return service.transmit(id);
    }

    @PostMapping("/orders/{id}/servir")
    public OrderView serve(@PathVariable long id) {
        return service.serve(id);
    }

    @PostMapping("/orders/{id}/annuler")
    public OrderView cancel(@PathVariable long id) {
        return service.cancel(id);
    }

    @GetMapping("/tables")
    public List<TableView> tables() {
        return service.tables();
    }

    @GetMapping("/tables/{table}/addition")
    public BillView bill(@PathVariable int table) {
        return service.bill(table);
    }

    @PostMapping("/tables/{table}/encaisser")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void close(@PathVariable int table) {
        service.close(table);
    }

    /** Liens signés des QR codes, à compléter avec l'adresse du serveur pour l'impression. */
    @GetMapping("/qr")
    public Map<String, Object> qr() {
        return Map.of("tables", service.qrLinks());
    }
}
