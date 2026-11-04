package com.aromacafe.commande.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Les objets échangés en JSON (DTO = Data Transfer Object), regroupés dans un seul fichier.
 *
 *   Téléphone  ──CreateOrderRequest──►  serveur  ──ClientOrderView──►  téléphone
 *   Caisse     ◄──OrderView / TableView / BillView──  serveur
 *   Caisse     ◄──CaisseEvent (temps réel)──  serveur
 */
public final class OrderDtos {

    private OrderDtos() {
    }

    // =================================================================== envoyé par le téléphone

    /**
     * Une commande envoyée depuis une table. Aucun prix ici : le serveur les recalcule
     * à partir de menu.json, on ne fait jamais confiance au téléphone.
     */
    public record CreateOrderRequest(
            @Min(1) int table,
            @NotBlank String token,
            @NotBlank @Size(max = 64) String clientRef,
            @NotEmpty @Size(max = 40) List<@Valid LineRequest> lines) {
    }

    /**
     * Une ligne du panier.
     * options : identifiant du groupe -> identifiants des choix,
     *           ex. { "lait": ["lait-de-coco"] } ou { "sauce": ["sauce-fraise", "sauce-caramel"] }
     */
    public record LineRequest(
            @NotBlank String itemId,
            @Min(1) @Max(20) int quantity,
            Map<String, List<String>> options,
            @Size(max = 140) String note) {
    }

    // =================================================================== renvoyé par le serveur

    /** Une ligne telle qu'affichée (téléphone, caisse, tickets). */
    public record LineView(String name, String category, int quantity, int unitPrice, int lineTotal,
                           List<String> options, String note) {
        static LineView of(OrderLine l) {
            return new LineView(l.getName(), l.getCategory(), l.getQuantity(), l.getUnitPrice(),
                    l.getLineTotal(), l.getOptions(), l.getNote());
        }
    }

    /** Vue complète d'une commande, pour la caisse. */
    public record OrderView(Long id, String publicId, int number, int table, OrderStatus status, int total,
                            Instant createdAt, Instant transmittedAt, Instant servedAt, List<LineView> lines) {
        public static OrderView of(CustomerOrder o) {
            return new OrderView(o.getId(), o.getPublicId(), o.getNumber(), o.getTableNumber(), o.getStatus(),
                    o.getTotal(), o.getCreatedAt(), o.getTransmittedAt(), o.getServedAt(),
                    o.getLines().stream().map(LineView::of).toList());
        }
    }

    /** Vue d'une commande pour le téléphone du client : pas d'identifiant interne. */
    public record ClientOrderView(String publicId, int number, int table, OrderStatus status, int total,
                                  Instant createdAt, List<LineView> lines) {
        public static ClientOrderView of(CustomerOrder o) {
            return new ClientOrderView(o.getPublicId(), o.getNumber(), o.getTableNumber(), o.getStatus(),
                    o.getTotal(), o.getCreatedAt(), o.getLines().stream().map(LineView::of).toList());
        }
    }

    /** Une table vue par la caisse : libre, occupée, addition demandée… */
    public record TableView(int table, int openOrders, int pendingOrders, int total,
                            Instant since, Instant billRequestedAt) {
    }

    /** Une ligne d'addition : les produits identiques de toutes les commandes de la table sont regroupés. */
    public record BillLine(String name, List<String> options, int quantity, int unitPrice, int lineTotal) {
    }

    /** L'addition d'une table. */
    public record BillView(int table, List<Integer> orderNumbers, List<BillLine> lines, int total, Instant printedAt) {
    }

    /**
     * Message temps réel envoyé à la caisse (WebSocket) :
     * ORDER_CREATED, ORDER_UPDATED, BILL_REQUESTED, TABLE_CLOSED.
     */
    public record CaisseEvent(String type, OrderView order, Integer table) {
    }
}