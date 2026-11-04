package com.aromacafe.commande.order;

import com.aromacafe.commande.order.OrderDtos.ClientOrderView;
import com.aromacafe.commande.order.OrderDtos.CreateOrderRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * API du téléphone du client. Pas de connexion : la table est prouvée
 * par le jeton signé du QR code (paramètre « k » ou champ « token »).
 */
@RestController
@RequestMapping("/api")
public class PublicOrderController {

    private final OrderService service;

    public PublicOrderController(OrderService service) {
        this.service = service;
    }

    /** Au scan du QR code : le menu vérifie que le lien est authentique avant d'autoriser les commandes. */
    @GetMapping("/tables/{table}/check")
    public Map<String, Object> check(@PathVariable int table, @RequestParam("k") String token) {
        service.checkTable(table, token);
        return Map.of("table", table, "valid", true);
    }

    /** Envoi d'une commande (le corps JSON est vérifié par @Valid avant d'arriver ici). */
    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    public ClientOrderView create(@Valid @RequestBody CreateOrderRequest request) {
        return service.create(request);
    }

    /** Suivi en direct : Reçue -> En préparation -> Servie. */
    @GetMapping("/orders/{publicId}")
    public ClientOrderView track(@PathVariable String publicId) {
        return service.track(publicId);
    }

    /** Bouton « Demander l'addition ». */
    @PostMapping("/tables/{table}/addition")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void requestBill(@PathVariable int table, @RequestParam("k") String token) {
        service.requestBill(table, token);
    }
}