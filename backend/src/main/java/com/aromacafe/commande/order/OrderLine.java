package com.aromacafe.commande.order;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.util.Arrays;
import java.util.List;

/**
 * Une ligne d'une commande : « 2 × Café latte, Lait de coco (+500 F), note : bien chaud ».
 *
 * On recopie ici le nom et le prix au moment de la commande (et pas seulement l'identifiant du produit) :
 * si la carte change demain, les commandes et additions d'aujourd'hui restent justes.
 *
 * @Embeddable : une ligne n'existe pas seule, elle fait partie d'une commande (CustomerOrder).
 */
@Embeddable
public class OrderLine {

    private String itemId;      // identifiant dans menu.json, ex. "cafe-chaud--cafe-latte"
    private String name;        // nom affiché sur les tickets
    private String category;    // titre de la catégorie, ex. "Café chaud"
    private int quantity;       // 1 à 20
    private int unitPrice;      // prix d'un article, options comprises (F CFA)
    private int lineTotal;      // unitPrice × quantity

    /** Options choisies, une par ligne de texte, ex. « Lait de coco (+500 F) ». */
    @Column(length = 1000)
    private String optionsText;

    /** Précision du client pour la cuisine, ex. « sans sucre ». */
    @Column(length = 200)
    private String note;

    /** Constructeur vide exigé par JPA (Hibernate s'en sert pour relire la base). */
    protected OrderLine() {
    }

    public OrderLine(String itemId, String name, String category, int quantity,
                     int unitPrice, List<String> options, String note) {
        this.itemId = itemId;
        this.name = name;
        this.category = category;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.lineTotal = unitPrice * quantity;
        this.optionsText = String.join("\n", options);
        this.note = note;
    }

    public String getItemId() { return itemId; }
    public String getName() { return name; }
    public String getCategory() { return category; }
    public int getQuantity() { return quantity; }
    public int getUnitPrice() { return unitPrice; }
    public int getLineTotal() { return lineTotal; }
    public String getNote() { return note; }

    /** Les options sous forme de liste (le texte est découpé ligne par ligne). */
    public List<String> getOptions() {
        if (optionsText == null || optionsText.isBlank()) return List.of();
        return Arrays.asList(optionsText.split("\n"));
    }
}