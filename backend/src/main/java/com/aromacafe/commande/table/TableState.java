package com.aromacafe.commande.table;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * État d'une table de la salle : pour l'instant, l'heure à laquelle elle a demandé l'addition.
 *
 * - billRequestedAt rempli -> la caisse affiche « Table 5 : addition demandée à 21:14 »
 * - billRequestedAt vide   -> rien de spécial (remis à vide à l'encaissement)
 *
 * Une ligne par table, créée seulement la première fois qu'elle demande l'addition.
 */
@Entity
@Table(name = "table_salle")
public class TableState {

    /** Numéro de la table (1 à 10) : c'est directement la clé, pas besoin d'identifiant généré. */
    @Id
    private int number;

    private Instant billRequestedAt;

    protected TableState() {
    }

    public TableState(int number) {
        this.number = number;
    }

    public int getNumber() { return number; }

    public Instant getBillRequestedAt() { return billRequestedAt; }

    public void requestBill(Instant now) { this.billRequestedAt = now; }

    public void clearBill() { this.billRequestedAt = null; }
}