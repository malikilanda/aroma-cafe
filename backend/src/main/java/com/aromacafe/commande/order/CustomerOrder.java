package com.aromacafe.commande.order;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Une commande passée depuis une table.
 *
 * Deux identifiants :
 * - id       : numéro interne (base de données, caisse)
 * - publicId : identifiant long et impossible à deviner, donné au téléphone du client
 *              pour suivre SA commande sans pouvoir lire celles des autres tables
 *
 * Et un numéro lisible, « number », remis à 1 chaque matin : c'est le « Commande n° 12 »
 * imprimé sur les tickets.
 *
 * (On l'appelle CustomerOrder et pas Order : ORDER est un mot réservé du SQL.)
 */
@Entity
@Table(name = "commande", indexes = {
        @Index(name = "idx_commande_statut", columnList = "status"),
        @Index(name = "idx_commande_table", columnList = "tableNumber")})
public class CustomerOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 36)
    private String publicId;

    /**
     * Identifiant créé par le téléphone pour CET envoi. Si le réseau est lent et que le client
     * appuie deux fois sur « Envoyer », le serveur reconnaît le même clientRef et ne crée
     * pas une deuxième commande.
     */
    @Column(unique = true, nullable = false, length = 64)
    private String clientRef;

    private int number;          // numéro du jour : 1, 2, 3…
    private int tableNumber;     // 1 à 10

    @Enumerated(EnumType.STRING) // enregistre "EN_CUISINE" en clair, pas un chiffre
    @Column(length = 20)
    private OrderStatus status = OrderStatus.NOUVELLE;

    private int total;           // somme des lignes, en F CFA

    private Instant createdAt;     // reçue
    private Instant transmittedAt; // envoyée en cuisine
    private Instant servedAt;      // servie
    private Instant closedAt;      // payée ou annulée

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "commande_ligne", joinColumns = @JoinColumn(name = "commande_id"))
    @OrderColumn(name = "position") // garde l'ordre des lignes tel que le client les a ajoutées
    private List<OrderLine> lines = new ArrayList<>();

    protected CustomerOrder() {
    }

    public CustomerOrder(String publicId, String clientRef, int number, int tableNumber,
                         List<OrderLine> lines, Instant now) {
        this.publicId = publicId;
        this.clientRef = clientRef;
        this.number = number;
        this.tableNumber = tableNumber;
        this.lines = new ArrayList<>(lines);
        this.total = lines.stream().mapToInt(OrderLine::getLineTotal).sum();
        this.createdAt = now;
    }

    // ---------- Changements d'étape (les vérifications sont faites dans le service) ----------

    /** La caisse a imprimé le ticket cuisine. */
    public void transmit(Instant now) {
        status = OrderStatus.EN_CUISINE;
        transmittedAt = now;
    }

    /** La serveuse a apporté la commande. */
    public void serve(Instant now) {
        if (transmittedAt == null) transmittedAt = now;
        status = OrderStatus.SERVIE;
        servedAt = now;
    }

    /** Réglée avec l'addition. */
    public void pay(Instant now) {
        status = OrderStatus.PAYEE;
        closedAt = now;
    }

    /** Annulée par la caisse. */
    public void cancel(Instant now) {
        status = OrderStatus.ANNULEE;
        closedAt = now;
    }

    // ---------- Lecture ----------

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
}