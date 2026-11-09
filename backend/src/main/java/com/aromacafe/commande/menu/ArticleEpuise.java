package com.aromacafe.commande.menu;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * Un article marqué « épuisé » par la caisse.
 * Il n'est épuisé que le jour indiqué : le lendemain matin, il redevient disponible tout seul.
 */
@Entity
@Table(name = "article_epuise")
public class ArticleEpuise {
    /** identifiant de l'article dans menu.json (ex. « croissant ») */
    @Id
    @Column(length = 80)
    private String itemId;

    /** jour où l'article est épuisé */
    private LocalDate jour;

    protected ArticleEpuise() {}

    public ArticleEpuise(String itemId, LocalDate jour) {
        this.itemId = itemId;
        this.jour = jour;
    }

    public String getItemId() { return itemId; }
    public LocalDate getJour() { return jour; }
    public void setJour(LocalDate jour) { this.jour = jour; }
}
