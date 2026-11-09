package com.aromacafe.commande.order;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "commande", indexes = {
        @Index(name = "idx_commande_statut", columnList = "status"),
        @Index(name = "idx_commande_table", columnList = "tableNumber")})
public class CustomerOrder {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** identifiant non devinable donné au téléphone pour suivre sa commande */
    @Column(unique = true, nullable = false, length = 36)
    private String publicId;

    /** généré par le téléphone : un double envoi (réseau lent, double appui) ne crée pas deux commandes */
    @Column(unique = true, nullable = false, length = 64)
    private String clientRef;

    /** numéro du jour : 1, 2, 3… remis à zéro chaque matin */
    private int number;
    private int tableNumber;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private OrderStatus status = OrderStatus.NOUVELLE;

    private int total;
    private Instant createdAt;
    private Instant transmittedAt;
    private Instant servedAt;
    private Instant closedAt;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "commande_ligne", joinColumns = @JoinColumn(name = "commande_id"))
    @OrderColumn(name = "position")
    private List<OrderLine> lines = new ArrayList<>();

    /**
     * Articles retirés par la caisse (épuisé, erreur…), un par ligne au format « quantité|nom|raison ».
     * Le téléphone du client s'en sert pour prévenir le client.
     */
    @Column(length = 2000)
    private String removedText;

    protected CustomerOrder() {}

    public CustomerOrder(String publicId, String clientRef, int number, int tableNumber, List<OrderLine> lines, Instant now) {
        this.publicId = publicId;
        this.clientRef = clientRef;
        this.number = number;
        this.tableNumber = tableNumber;
        this.lines = new ArrayList<>(lines);
        this.total = lines.stream().mapToInt(OrderLine::getLineTotal).sum();
        this.createdAt = now;
    }

    public void transmit(Instant now) { status = OrderStatus.EN_CUISINE; transmittedAt = now; }
    public void serve(Instant now) {
        if (transmittedAt == null) transmittedAt = now;
        status = OrderStatus.SERVIE; servedAt = now;
    }
    public void cancel(Instant now) { status = OrderStatus.ANNULEE; closedAt = now; }
    public void pay(Instant now) { status = OrderStatus.PAYEE; closedAt = now; }

    /**
     * Retire la ligne n° index (0 = première), recalcule le total et garde une trace pour le client.
     * S'il ne reste plus aucune ligne, la commande est annulée.
     */
    public OrderLine removeLine(int index, String reason, Instant now) {
        OrderLine removed = lines.remove(index);
        total = lines.stream().mapToInt(OrderLine::getLineTotal).sum();
        String entry = removed.getQuantity() + "|" + removed.getName().replace("|", " ") + "|" + reason;
        removedText = removedText == null || removedText.isBlank() ? entry : removedText + "\n" + entry;
        if (lines.isEmpty()) cancel(now);
        return removed;
    }

    public Long getId() { return id; }
    public String getPublicId() { return publicId; }
    public String getClientRef() { return clientRef; }
    public int getNumber() { return number; }
    public int getTableNumber() { return tableNumber; }
    public OrderStatus getStatus() { return status; }
    public int getTotal() { return total; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getTransmittedAt() { return transmittedAt; }
    public Instant getServedAt() { return servedAt; }
    public Instant getClosedAt() { return closedAt; }
    public List<OrderLine> getLines() { return lines; }
    public List<String> getRemovedEntries() {
        return removedText == null || removedText.isBlank() ? List.of() : List.of(removedText.split("\n"));
    }
}
