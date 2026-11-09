package com.aromacafe.commande.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class OrderDtos {
    private OrderDtos() {}

    /** Envoyé par le téléphone. Aucun prix : le serveur les recalcule depuis le catalogue. */
    public record CreateOrderRequest(
            @Min(1) int table,
            @NotBlank String token,
            @NotBlank @Size(max = 64) String clientRef,
            @NotEmpty @Size(max = 40) List<@Valid LineRequest> lines) {}

    public record LineRequest(
            @NotBlank String itemId,
            @Min(1) @Max(20) int quantity,
            /** groupe d'options -> identifiants des choix */
            Map<String, List<String>> options,
            @Size(max = 140) String note) {}

    public record LineView(String itemId, String name, String category, int quantity, int unitPrice, int lineTotal, List<String> options, String note) {
        static LineView of(OrderLine l) {
            return new LineView(l.getItemId(), l.getName(), l.getCategory(), l.getQuantity(), l.getUnitPrice(), l.getLineTotal(), l.getOptions(), l.getNote());
        }
    }

    /** Raison du retrait d'un article par la caisse. */
    public enum RemoveReason { EPUISE, ERREUR, CLIENT }

    /** Envoyé par la caisse pour retirer une ligne : itemId sert de vérification (la ligne n'a pas changé entre-temps). */
    public record RemoveLineRequest(@NotBlank String itemId, @NotNull RemoveReason reason, boolean markSoldOut) {}

    /** Article retiré d'une commande, montré au client sur son téléphone. */
    public record RemovedView(int quantity, String name, RemoveReason reason) {
        static List<RemovedView> of(CustomerOrder o) {
            return o.getRemovedEntries().stream().map(e -> {
                String[] p = e.split("\\|", 3);
                RemoveReason r;
                try { r = RemoveReason.valueOf(p[2]); } catch (RuntimeException ex) { r = RemoveReason.ERREUR; }
                return new RemovedView(Integer.parseInt(p[0]), p[1], r);
            }).toList();
        }
    }

    public record OrderView(Long id, String publicId, int number, int table, OrderStatus status, int total,
                            Instant createdAt, Instant transmittedAt, Instant servedAt, List<LineView> lines, List<RemovedView> removed) {
        public static OrderView of(CustomerOrder o) {
            return new OrderView(o.getId(), o.getPublicId(), o.getNumber(), o.getTableNumber(), o.getStatus(), o.getTotal(),
                    o.getCreatedAt(), o.getTransmittedAt(), o.getServedAt(), o.getLines().stream().map(LineView::of).toList(), RemovedView.of(o));
        }
    }

    /** Vue simplifiée pour le téléphone du client (pas d'identifiant interne). */
    public record ClientOrderView(String publicId, int number, int table, OrderStatus status, int total, Instant createdAt,
                                  List<LineView> lines, List<RemovedView> removed) {
        public static ClientOrderView of(CustomerOrder o) {
            return new ClientOrderView(o.getPublicId(), o.getNumber(), o.getTableNumber(), o.getStatus(), o.getTotal(),
                    o.getCreatedAt(), o.getLines().stream().map(LineView::of).toList(), RemovedView.of(o));
        }
    }

    public record TableView(int table, int openOrders, int pendingOrders, int total, Instant since, Instant billRequestedAt) {}

    public record BillLine(String name, List<String> options, int quantity, int unitPrice, int lineTotal) {}

    public record BillView(int table, List<Integer> orderNumbers, List<BillLine> lines, int total, Instant printedAt) {}

    /** Message temps réel poussé à la caisse sur /topic/caisse. */
    public record CaisseEvent(String type, OrderView order, Integer table) {}
}
