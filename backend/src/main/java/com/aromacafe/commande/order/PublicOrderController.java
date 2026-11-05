package com.aromacafe.commande.order;

import com.aromacafe.commande.config.CafeNetwork;
import com.aromacafe.commande.order.OrderDtos.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** API utilisée par le téléphone du client (sans connexion, table prouvée par le jeton du QR code). */
@RestController
@RequestMapping("/api")
public class PublicOrderController {
    private final OrderService service;
    private final CafeNetwork cafe;

    public PublicOrderController(OrderService service, CafeNetwork cafe) {
        this.service = service;
        this.cafe = cafe;
    }

    /**
     * Au scan du QR code : la table est-elle valide, et le client peut-il commander maintenant ?
     * « commande » vaut true si oui ; sinon « message » explique pourquoi (service fermé, Wi-Fi…).
     */
    @GetMapping("/tables/{table}/check")
    public Map<String, Object> check(@PathVariable int table, @RequestParam("k") String token, HttpServletRequest request) {
        service.checkTable(table, token);
        String refusal = cafe.refusal(request);
        return Map.of(
                "table", table,
                "valid", true,
                "commande", refusal == null,
                "message", refusal == null ? "" : refusal);
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    public ClientOrderView create(@Valid @RequestBody CreateOrderRequest req, HttpServletRequest request) {
        cafe.check(request);          // service fermé (ou pas sur le Wi-Fi en mode wifi-cafe) : erreur 423
        return service.create(req);
    }

    /** Suivi d'une commande déjà envoyée : toujours permis (le client voit son plat arriver même après la fermeture). */
    @GetMapping("/orders/{publicId}")
    public ClientOrderView track(@PathVariable String publicId) {
        return service.track(publicId);
    }

    @PostMapping("/tables/{table}/addition")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void askBill(@PathVariable int table, @RequestParam("k") String token, HttpServletRequest request) {
        cafe.check(request);
        service.requestBill(table, token);
    }
}