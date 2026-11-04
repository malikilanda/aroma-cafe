package com.aromacafe.commande.order;

/**
 * Les étapes d'une commande, dans l'ordre du service :
 *
 *   NOUVELLE ──► EN_CUISINE ──► SERVIE ──► PAYEE
 *       │             │
 *       └─────────────┴──► ANNULEE
 *
 * - NOUVELLE   : le client vient d'envoyer sa commande, la caisse ne l'a pas encore traitée
 * - EN_CUISINE : la caisse a imprimé le ticket et l'a transmis à la cuisine
 * - SERVIE     : la serveuse a apporté la commande à la table
 * - PAYEE      : réglée avec l'addition (la table est libérée)
 * - ANNULEE    : annulée par la caisse (produit épuisé, erreur…)
 */
public enum OrderStatus {
    NOUVELLE,
    EN_CUISINE,
    SERVIE,
    PAYEE,
    ANNULEE;

    /** Encore à régler : compte dans l'addition de la table. */
    public boolean isUnpaid() {
        return this == NOUVELLE || this == EN_CUISINE || this == SERVIE;
    }

    /** Encore en cours de préparation : la caisse doit s'en occuper. */
    public boolean isActive() {
        return this == NOUVELLE || this == EN_CUISINE;
    }
}